const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { processSalePosting } = require('../utils/accountingHelper');
const { generateNextNumber } = require('../services/numberingService');
const { getBranchActiveBusinessDate } = require('../utils/businessDateHelper');
const {
  validateVoucherForSale,
  redeemVoucherInSale,
  checkAndIssuePurchaseReward
} = require('../services/voucherService');

// Create new sale
exports.createSale = asyncHandler(async (req, res) => {
  const { 
    customerId, items, paymentMethod, paidAmount, discount = 0, advanceRedeemed = 0, saleDate, salesmanId, 
    terminalId, isReturn = false, returnReason = '', originalInvoice = '',
    currencyCode = 'INR', exchangeRate = 1.0, description,
    deliveryCharge = 0, hasDeliveryCharge = false,
    voucherCode
  } = req.body;
  let { branchId } = req.body;

  let effectiveDeliveryCharge = 0;
  const isDeliveryEnabled = hasDeliveryCharge === true || hasDeliveryCharge === 'true';
  if (isDeliveryEnabled) {
    const parsedCharge = parseFloat(deliveryCharge);
    if (isNaN(parsedCharge) || parsedCharge < 0 || !isFinite(parsedCharge)) {
      res.status(400);
      throw new Error('Delivery Charge must be a valid non-negative number.');
    }
    if (parsedCharge > 10000000) {
      res.status(400);
      throw new Error('Delivery Charge exceeds maximum allowed limit.');
    }
    effectiveDeliveryCharge = Number(parsedCharge.toFixed(2));
  }

  if (!branchId && req.user && req.user.branchId) {
    branchId = req.user.branchId;
  }

  if (!branchId) {
    res.status(400);
    throw new Error('Branch selection is required.');
  }

  const validBranchId = parseInt(branchId);

  let effectiveSaleDate = saleDate ? new Date(saleDate) : null;
  if (!effectiveSaleDate) {
    const activeBiz = await getBranchActiveBusinessDate(validBranchId);
    effectiveSaleDate = activeBiz.dateObj;
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('Sale must have at least one item.');
  }

  // Verify Branch
  const branchExists = await prisma.branch.findUnique({ where: { id: validBranchId } });
  if (!branchExists) {
    res.status(404);
    throw new Error(`Branch with ID ${validBranchId} not found.`);
  }

  // Verify Customer
  let customer = null;
  if (customerId) {
    customer = await prisma.customer.findUnique({ where: { id: parseInt(customerId) } });
  }

  // --- RETURN VALIDATION ---
  if (isReturn && originalInvoice) {
    const originalSale = await prisma.sale.findFirst({
      where: { invoiceNumber: originalInvoice },
      include: { items: true }
    });

    if (!originalSale) {
      res.status(404);
      throw new Error('Original invoice not found for return.');
    }

    const previousReturns = await prisma.sale.findMany({
      where: { originalInvoice, isReturn: true, status: { not: 'cancelled' } },
      include: { items: true }
    });

    const returnedQtyMap = {};
    previousReturns.forEach(ret => {
      ret.items.forEach(item => {
        returnedQtyMap[item.productId] = (returnedQtyMap[item.productId] || 0) + item.quantity;
      });
    });

    for (const item of items) {
      const originalItem = originalSale.items.find(i => i.productId === parseInt(item.productId));
      if (!originalItem) {
        res.status(400);
        throw new Error(`Product ${item.productId} was not part of original invoice.`);
      }
      const alreadyReturned = returnedQtyMap[item.productId] || 0;
      const remaining = originalItem.quantity - alreadyReturned;
      if (parseInt(item.quantity) > remaining) {
        res.status(400);
        throw new Error(`Cannot return ${item.quantity} units. Only ${remaining} remaining.`);
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const fetchBranch = await tx.branch.findUnique({ where: { id: validBranchId } });
    // 1. Calculate Totals (Hardened Validation)
    // Strictly only true/ "true" enables stock validation. Null/False/Falsy disabled it.
    const stockIncluded = fetchBranch?.stockIncluded === true || fetchBranch?.stockIncluded === 'true';
    
    console.log(`[POS Stock Resolution] Branch: ${validBranchId}, Raw: ${fetchBranch?.stockIncluded}, Final Decision: ${stockIncluded ? 'VALIDATING' : 'SKIPPING STOCK CHECK'}`);

    // Voucher Validation & Proportional Allocation
    let voucherValidation = null;
    if (voucherCode && !isReturn) {
      voucherValidation = await validateVoucherForSale(tx, {
        code: voucherCode,
        customerId: customer?.id || customerId,
        branchId: validBranchId,
        items
      });
      if (!voucherValidation.valid) {
        throw new Error(voucherValidation.message);
      }
    }
    const finalVoucherDiscount = voucherValidation ? voucherValidation.finalVoucherDiscount : 0;
    const lineAllocations = voucherValidation ? voucherValidation.lineAllocations : {};

    // 1. Calculate Totals
    let subTotal = 0;
    let taxAmount = 0;
    let totalItemsDiscount = 0;
    const saleItemsData = [];

    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      const productId = parseInt(item.productId);
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error(`Product ${productId} not found.`);

      // Zero-stock variant check (CRITICAL: A variant with stock <= 0 must never be saleable, regardless of branch settings)
      const selectedSize = item.size || item.selectedSize;
      if (!isReturn && selectedSize && product.sizeStocks) {
        let parsedSizeStocks = product.sizeStocks;
        if (typeof parsedSizeStocks === 'string') {
          try { parsedSizeStocks = JSON.parse(parsedSizeStocks); } catch (e) { parsedSizeStocks = []; }
        }
        if (Array.isArray(parsedSizeStocks)) {
          const sizeEntry = parsedSizeStocks.find(s => String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase());
          if (sizeEntry) {
            const vStock = parseInt(sizeEntry.stock, 10) || 0;
            if (vStock <= 0) {
              throw new Error(`Size "${selectedSize}" for product "${product.name}" is out of stock (Stock: 0) and cannot be sold.`);
            }
          }
        }
      }

      // Stock Check for non-zero stock / branch stock
      if (!isReturn && stockIncluded) {
        const stock = await tx.productStock.findUnique({
          where: { branchId_productId: { branchId: validBranchId, productId } }
        });
        if (!stock || stock.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}.`);
        }

        // Size-level stock check
        if (selectedSize && product.sizeStocks) {
          let parsedSizeStocks = product.sizeStocks;
          if (typeof parsedSizeStocks === 'string') {
            try { parsedSizeStocks = JSON.parse(parsedSizeStocks); } catch (e) { parsedSizeStocks = []; }
          }
          if (Array.isArray(parsedSizeStocks)) {
            const sizeEntry = parsedSizeStocks.find(s => String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase());
            if (sizeEntry && (parseInt(sizeEntry.stock, 10) || 0) < item.quantity) {
              throw new Error(`Insufficient stock for ${product.name} (Size: ${selectedSize}). Available: ${sizeEntry.stock || 0}`);
            }
          }
        }
      }

      const unitPrice = parseFloat(item.unitPrice || item.price || 0);
      let catalogPrice = product ? parseFloat(product.price || 0) : unitPrice;
      if (product && item.brandId && product.brandPrices) {
        let bPrices = product.brandPrices;
        if (typeof bPrices === 'string') {
          try { bPrices = JSON.parse(bPrices); } catch(e) { bPrices = null; }
        }
        const bKey = String(item.brandId);
        if (bPrices && bPrices[bKey] && bPrices[bKey].price !== undefined && bPrices[bKey].price !== null && bPrices[bKey].price !== '') {
          catalogPrice = parseFloat(bPrices[bKey].price);
        }
      }
      if (product && (item.size || item.selectedSize)) {
        const itemSize = item.size || item.selectedSize;
        let sizeFound = false;
        if (item.brandId && product.brandPrices) {
          let bPrices = product.brandPrices;
          if (typeof bPrices === 'string') {
            try { bPrices = JSON.parse(bPrices); } catch(e) { bPrices = null; }
          }
          const bKey = String(item.brandId);
          const bEntry = bPrices && bPrices[bKey];
          if (bEntry && Array.isArray(bEntry.sizeStocks)) {
            const sObj = bEntry.sizeStocks.find(s => String(s.size).trim().toLowerCase() === String(itemSize).trim().toLowerCase());
            if (sObj && sObj.price !== undefined && sObj.price !== null && sObj.price !== '' && !isNaN(parseFloat(sObj.price))) {
              catalogPrice = parseFloat(sObj.price);
              sizeFound = true;
            }
          }
        }
        if (!sizeFound && product.sizeStocks) {
          let sStocks = product.sizeStocks;
          if (typeof sStocks === 'string') {
            try { sStocks = JSON.parse(sStocks); } catch(e) { sStocks = null; }
          }
          if (Array.isArray(sStocks)) {
            const sObj = sStocks.find(s => String(s.size).trim().toLowerCase() === String(itemSize).trim().toLowerCase());
            if (sObj && sObj.price !== undefined && sObj.price !== null && sObj.price !== '' && !isNaN(parseFloat(sObj.price))) {
              catalogPrice = parseFloat(sObj.price);
            }
          }
        }
      }
      const originalUnitPrice = item.originalUnitPrice !== undefined && item.originalUnitPrice !== null
        ? parseFloat(item.originalUnitPrice)
        : catalogPrice;
      const discAmt = parseFloat(item.discountAmount || 0);
      const netPrice = Math.max(0, unitPrice - discAmt);
      
      const taxRate = item.taxPercent !== undefined ? parseFloat(item.taxPercent) : parseFloat(product.taxRate || 0);
      const itemIsTaxInclusive = item.isTaxInclusive === true || item.isTaxInclusive === 'true';
      const vAlloc = lineAllocations[itemIdx] || 0;
      const lineTotalPayableBeforeVoucher = item.quantity * netPrice;
      const lineTotalPayable = Math.max(0, lineTotalPayableBeforeVoucher - vAlloc);
      
      let lineTax = 0;
      let lineTotal = 0;

      if (itemIsTaxInclusive && taxRate > 0) {
        const baseAmount = lineTotalPayable / (1 + (taxRate / 100));
        lineTax = lineTotalPayable - baseAmount;
        lineTotal = baseAmount;
      } else if (taxRate > 0) {
        lineTotal = lineTotalPayable;
        lineTax = (lineTotalPayable * taxRate) / 100;
      } else {
        lineTotal = lineTotalPayable;
        lineTax = 0;
      }

      subTotal += lineTotal;
      taxAmount += lineTax;
      totalItemsDiscount += (discAmt * item.quantity);

      saleItemsData.push({
        productId: parseInt(item.productId),
        size: item.size || item.selectedSize || null,
        quantity: parseFloat(item.quantity || 1),
        unitPrice: parseFloat(unitPrice.toFixed(2)),
        originalUnitPrice: parseFloat(originalUnitPrice.toFixed(2)),
        discountPercent: parseFloat(item.discountPercent || 0),
        discountAmount: parseFloat(discAmt.toFixed(2)),
        voucherDiscountAmount: parseFloat(vAlloc.toFixed(2)),
        total: parseFloat((lineTotal + lineTax).toFixed(2)),
        taxRate: parseFloat(taxRate.toFixed(2)),
        taxAmount: parseFloat(lineTax.toFixed(2)),
        isTaxInclusive: itemIsTaxInclusive
      });
    }

    const finalSubTotal = Number(subTotal.toFixed(2));
    const finalTaxAmount = Number(taxAmount.toFixed(2));
    const finalDiscount = Math.max(parseFloat(discount || 0), totalItemsDiscount);
    const finalRoundOffAmount = parseFloat(req.body.roundOffAmount || 0);

    const reqAdvanceUsed = parseFloat(advanceRedeemed || 0);

    // Explicit Calculation Logic: Total = Subtotal + Tax + Delivery Charge + RoundOff (Gross)
    const grandTotal = finalSubTotal + finalTaxAmount + effectiveDeliveryCharge + finalRoundOffAmount;
    const finalGrandTotal = Number(grandTotal.toFixed(2));

    if (finalGrandTotal < 0) {
      throw new Error('Total Amount cannot be negative. Check advance or discounts.');
    }

    // Invoice Numbering
    const { number: genInvNo, nextSeq, financialYearId } = await generateNextNumber(tx, 'invoice', validBranchId, effectiveSaleDate);
    if (financialYearId) {
      await tx.financialYear.update({ where: { id: financialYearId }, data: { invoiceSequence: nextSeq } });
    }

    if (reqAdvanceUsed > 0 && customer?.id) {
       // Validate against customer advance
       const advance = await tx.advance.findUnique({
          where: { customerId: customer.id }
       });
       
       const totalAvailable = Number(advance?.balance || 0);
       if (totalAvailable < reqAdvanceUsed) {
          throw new Error(`Insufficient advance balance. Available: ${totalAvailable}`);
       }
       
       // Update the single advance row
       const updatedAdvance = await tx.advance.update({
          where: { id: advance.id },
          data: {
            usedAmount: { increment: reqAdvanceUsed },
            balance: { decrement: reqAdvanceUsed }
          }
       });

       // Create History record
       await tx.advanceHistory.create({
          data: {
             customerId: customer.id,
             advanceId: advance.id,
             action: 'REDEEM',
             amount: reqAdvanceUsed,
             balanceAfter: Number(updatedAdvance.balance),
             reference: `Redeemed in Invoice #${genInvNo}`
          }
       });
    }

    // Payment Breakdown Calculation
    let calculatedPaidAmount = 0;
    if (Array.isArray(req.body.payments) && req.body.payments.length > 0) {
      calculatedPaidAmount = req.body.payments
        .filter(p => p.method && p.method.toLowerCase() !== 'credit')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    } else if (paymentMethod && paymentMethod.toLowerCase() === 'credit') {
      calculatedPaidAmount = 0;
    } else {
      calculatedPaidAmount = parseFloat(paidAmount || 0);
    }

    const finalPaidAmount = Number(calculatedPaidAmount.toFixed(2));
    const calculatedBalance = finalGrandTotal - finalPaidAmount - reqAdvanceUsed;
    const finalBalanceAmount = Number((calculatedBalance >= 0 ? calculatedBalance : 0).toFixed(2));

    // Determine final paymentMethod
    let resolvedPaymentMethod = paymentMethod;
    if (!resolvedPaymentMethod) {
      if (Array.isArray(req.body.payments) && req.body.payments.length > 1) {
        resolvedPaymentMethod = 'Split';
      } else if (Array.isArray(req.body.payments) && req.body.payments.length === 1) {
        resolvedPaymentMethod = req.body.payments[0].method;
      } else {
        resolvedPaymentMethod = 'Cash';
      }
    }

    // Incentive
    let incentiveAmount = 0;
    if (salesmanId) {
      const salesman = await tx.user.findUnique({ where: { id: parseInt(salesmanId) } });
      if (salesman?.incentivePercentage > 0) {
        incentiveAmount = (finalGrandTotal * parseFloat(salesman.incentivePercentage)) / 100;
      }
    }

    const sale = await tx.sale.create({
      data: {
        invoiceNumber: genInvNo,
        customerId: customer?.id || null,
        paymentMethod: resolvedPaymentMethod,
        discount: finalDiscount,
        subTotal: finalSubTotal,
        taxAmount: finalTaxAmount,
        totalAmount: finalGrandTotal,
        roundOffAmount: finalRoundOffAmount,
        deliveryCharge: effectiveDeliveryCharge,
        hasDeliveryCharge: isDeliveryEnabled,
        voucherCode: voucherValidation ? voucherValidation.voucher.code : null,
        voucherDiscount: finalVoucherDiscount,
        advanceUsed: reqAdvanceUsed,
        paidAmount: finalPaidAmount,
        balanceAmount: finalBalanceAmount,
        saleDate: effectiveSaleDate,
        branchId: validBranchId,
        salesmanId: salesmanId ? parseInt(salesmanId) : null,
        terminalId: terminalId ? parseInt(terminalId) : null,
        incentiveAmount,
        status: finalBalanceAmount > 0.01 ? 'partial' : 'completed',
        financialYearId,
        isInvoice: !isReturn,
        isReturn,
        returnReason,
        originalInvoice,
        currencyCode: branchExists.currencyCode || currencyCode || 'INR',
        exchangeRate: parseFloat(exchangeRate),
        description,
        placeOfSupply: req.body.placeOfSupply || customer?.state || null,
        items: { create: saleItemsData }
      },
      include: { 
        customer: true, 
        items: { include: { product: true } }, 
        salesman: { select: { name: true } },
        branch: true,
        payments: true
      }
    });

    // Voucher Redemption
    if (voucherValidation) {
      await redeemVoucherInSale(tx, {
        voucherId: voucherValidation.voucher.id,
        saleId: sale.id,
        customerId: customer?.id || null,
        branchId: validBranchId,
        appliedDiscount: finalVoucherDiscount
      });
    }

    // Purchase Reward Check & Issuance
    let issuedRewardVoucher = null;
    if (!isReturn) {
      issuedRewardVoucher = await checkAndIssuePurchaseReward(tx, sale);
    }

    // Accounting
    try {
      await processSalePosting(tx, sale, req.user?.id || 1);
    } catch (e) {
      console.error("Accounting error:", e);
      throw new Error('Accounting Integration Failed: ' + e.message);
    }

    // Stock & Payments
    for (const item of items) {
      await tx.productStock.upsert({
        where: { branchId_productId: { branchId: validBranchId, productId: parseInt(item.productId) } },
        create: { branchId: validBranchId, productId: parseInt(item.productId), quantity: isReturn ? item.quantity : -item.quantity },
        update: { quantity: isReturn ? { increment: item.quantity } : { decrement: item.quantity } }
      });

      // Deduct size-level stock if product has sizeStocks or brandPrices
      const selectedSize = item.size || item.selectedSize;
      const targetBrandId = item.brandId ? String(item.brandId) : null;
      if (selectedSize) {
        const prod = await tx.product.findUnique({ where: { id: parseInt(item.productId) } });
        if (prod) {
          let updateData = {};
          if (prod.sizeStocks) {
            let pSizeStocks = prod.sizeStocks;
            if (typeof pSizeStocks === 'string') {
              try { pSizeStocks = JSON.parse(pSizeStocks); } catch (e) { pSizeStocks = []; }
            }
            if (Array.isArray(pSizeStocks)) {
              updateData.sizeStocks = pSizeStocks.map(s => {
                if (String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase()) {
                  const cur = parseInt(s.stock, 10) || 0;
                  const newStock = isReturn ? (cur + item.quantity) : (cur - item.quantity);
                  return { ...s, stock: Math.max(0, newStock) };
                }
                return s;
              });
            }
          }

          if (prod.brandPrices) {
            let bPrices = prod.brandPrices;
            if (typeof bPrices === 'string') {
              try { bPrices = JSON.parse(bPrices); } catch (e) { bPrices = null; }
            }
            if (bPrices && typeof bPrices === 'object') {
              let bPricesModified = false;
              let updatedBPrices = { ...bPrices };
              Object.keys(updatedBPrices).forEach(bKey => {
                if (!targetBrandId || targetBrandId === bKey) {
                  const bEntry = updatedBPrices[bKey];
                  if (bEntry && Array.isArray(bEntry.sizeStocks)) {
                    bEntry.sizeStocks = bEntry.sizeStocks.map(s => {
                      if (String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase()) {
                        const cur = parseInt(s.stock, 10) || 0;
                        const newStock = isReturn ? (cur + item.quantity) : (cur - item.quantity);
                        bPricesModified = true;
                        return { ...s, stock: Math.max(0, newStock) };
                      }
                      return s;
                    });
                  }
                }
              });
              if (bPricesModified) {
                updateData.brandPrices = updatedBPrices;
              }
            }
          }

          if (Object.keys(updateData).length > 0) {
            await tx.product.update({
              where: { id: prod.id },
              data: updateData
            });
          }
        }
      }
    }

    const paymentsList = req.body.payments || (finalPaidAmount > 0 ? [{ method: resolvedPaymentMethod || 'Cash', amount: finalPaidAmount }] : []);
    for (const p of paymentsList) {
      if (parseFloat(p.amount) > 0 && p.method && p.method.toLowerCase() !== 'credit') {
        await tx.payment.create({
          data: {
            type: 'receipt', amount: parseFloat(p.amount), method: p.method,
            reference: 'Initial Payment', description: `Payment for Invoice ${sale.invoiceNumber}`,
            saleId: sale.id, branchId: validBranchId, customerId: customer?.id || null
          }
        });
      }
    }

    const createdPayments = await tx.payment.findMany({ where: { saleId: sale.id } });
    const isInterState = req.body.taxType === 'igst' || 
      (sale.placeOfSupply && branchExists.state && sale.placeOfSupply.trim().toLowerCase() !== branchExists.state.trim().toLowerCase()) || 
      (customer?.state && branchExists.state && customer.state.trim().toLowerCase() !== branchExists.state.trim().toLowerCase());
    return { ...sale, payments: createdPayments, issuedRewardVoucher, taxType: isInterState ? 'igst' : 'cgst_sgst' };
  });

  res.status(201).json(result);
});

exports.getAllSales = asyncHandler(async (req, res) => {
  const { branchId, startDate, endDate, terminalId, invoice, isInvoice } = req.query;
  const where = {};
  if (isInvoice !== undefined) where.isInvoice = isInvoice === 'true';
  if (req.user.branchId) { where.branchId = req.user.branchId; } 
  else if (branchId) { where.branchId = parseInt(branchId); }
  if (terminalId) where.terminalId = parseInt(terminalId);
  if (invoice) where.invoiceNumber = invoice;
  if (startDate && endDate) {
    where.saleDate = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: true,
      items: { include: { product: true } },
      salesman: { select: { name: true } },
      branch: true,
      payments: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const normalized = sales.map(s => {
    const paidAmt = Number(s.paidAmount || 0);
    const balAmt = Number(s.balanceAmount || 0);
    let paymentsList = s.payments || [];
    
    // Ensure payments breakdown includes Credit portion for Split or Credit sales
    if (s.paymentMethod === 'Split' && balAmt > 0 && !paymentsList.some(p => p.method?.toLowerCase() === 'credit')) {
      paymentsList = [...paymentsList, { method: 'Credit', amount: balAmt }];
    } else if (s.paymentMethod === 'Credit' && paymentsList.length === 0 && balAmt > 0) {
      paymentsList = [{ method: 'Credit', amount: balAmt }];
    }

    const isInterState = Boolean(
      (s.placeOfSupply && s.branch?.state && s.placeOfSupply.trim().toLowerCase() !== s.branch.state.trim().toLowerCase()) ||
      (s.customer?.state && s.branch?.state && s.customer.state.trim().toLowerCase() !== s.branch.state.trim().toLowerCase())
    );

    return {
      ...s,
      discount: Number(s.discount || 0),
      advanceUsed: Number(s.advanceUsed || 0),
      voucherDiscount: Number(s.voucherDiscount || 0),
      voucherCode: s.voucherCode || null,
      paidAmount: paidAmt,
      balanceAmount: balAmt,
      payments: paymentsList,
      customerName: s.customer?.name || s.customerName || 'Walk-in Customer',
      taxType: isInterState ? 'igst' : 'cgst_sgst'
    };
  });

  res.json(normalized);
});

exports.cancelSale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cancelledBy, cancelReason } = req.body;
  const sale = await prisma.sale.findUnique({ where: { id: parseInt(id) }, include: { items: true } });
  if (!sale || sale.status === 'cancelled') throw new Error('Invalid sale or already cancelled');

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: parseInt(id) },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy, cancelReason, balanceAmount: 0 }
    });
    for (const item of sale.items) {
      await tx.productStock.update({
        where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
        data: { quantity: { increment: item.quantity } }
      });

      // Restore size stock if item has size
      if (item.size) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (prod && prod.sizeStocks) {
          let pSizeStocks = prod.sizeStocks;
          if (typeof pSizeStocks === 'string') {
            try { pSizeStocks = JSON.parse(pSizeStocks); } catch (e) { pSizeStocks = []; }
          }
          if (Array.isArray(pSizeStocks)) {
            const updatedSizeStocks = pSizeStocks.map(s => {
              if (String(s.size).trim().toLowerCase() === String(item.size).trim().toLowerCase()) {
                const cur = parseInt(s.stock, 10) || 0;
                return { ...s, stock: cur + item.quantity };
              }
              return s;
            });
            await tx.product.update({
              where: { id: prod.id },
              data: { sizeStocks: updatedSizeStocks }
            });
          }
        }
      }
    }
    await tx.payment.deleteMany({ where: { saleId: parseInt(id) } });
    await tx.voucher.updateMany({ where: { reference: sale.invoiceNumber }, data: { status: 'CANCELLED' } });

    // Restore redeemed CustomerVoucher if one was used
    if (sale.voucherCode) {
      const redeemedVoucher = await tx.customerVoucher.findUnique({ where: { code: sale.voucherCode } });
      if (redeemedVoucher) {
        await tx.customerVoucher.update({
          where: { id: redeemedVoucher.id },
          data: {
            usageCount: Math.max(0, redeemedVoucher.usageCount - 1),
            status: 'ACTIVE',
            redeemedSaleId: null,
            redeemedAt: null
          }
        });
      }
      await tx.customerVoucherRedemption.deleteMany({ where: { saleId: parseInt(id) } });
    }

    // Cancel any purchase rewards issued on this sale
    await tx.customerVoucher.updateMany({
      where: { issuedSaleId: parseInt(id) },
      data: { status: 'CANCELLED' }
    });
  });
  res.json({ message: 'Success' });
});

exports.updateSale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { 
    customerId, items, paymentMethod, paidAmount, discount = 0, saleDate, salesmanId, 
    terminalId, currencyCode = 'INR', exchangeRate = 1.0, advanceRedeemed = 0, description,
    deliveryCharge, hasDeliveryCharge
  } = req.body;
  let branchId = req.body.branchId || req.user?.branchId;

  const validSaleId = parseInt(id);
  const existing = await prisma.sale.findUnique({ where: { id: validSaleId }, include: { items: true } });
  if (!existing) throw new Error('Sale not found');

  let effectiveDeliveryCharge = 0;
  let isDeliveryEnabled = false;
  if (hasDeliveryCharge !== undefined) {
    isDeliveryEnabled = hasDeliveryCharge === true || hasDeliveryCharge === 'true';
    if (isDeliveryEnabled) {
      const parsedCharge = parseFloat(deliveryCharge);
      if (isNaN(parsedCharge) || parsedCharge < 0 || !isFinite(parsedCharge)) {
        res.status(400);
        throw new Error('Delivery Charge must be a valid non-negative number.');
      }
      if (parsedCharge > 10000000) {
        res.status(400);
        throw new Error('Delivery Charge exceeds maximum allowed limit.');
      }
      effectiveDeliveryCharge = Number(parsedCharge.toFixed(2));
    }
  } else if (existing.hasDeliveryCharge) {
    isDeliveryEnabled = true;
    effectiveDeliveryCharge = Number(parseFloat(existing.deliveryCharge || 0).toFixed(2));
  }

  const result = await prisma.$transaction(async (tx) => {
    // Reverse old stock
    for (const item of existing.items) {
      await tx.productStock.upsert({
        where: { branchId_productId: { branchId: existing.branchId, productId: item.productId } },
        create: { branchId: existing.branchId, productId: item.productId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } }
      });

      // Restore size stock
      if (item.size) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (prod && prod.sizeStocks) {
          let pSizeStocks = prod.sizeStocks;
          if (typeof pSizeStocks === 'string') {
            try { pSizeStocks = JSON.parse(pSizeStocks); } catch (e) { pSizeStocks = []; }
          }
          if (Array.isArray(pSizeStocks)) {
            const updatedSizeStocks = pSizeStocks.map(s => {
              if (String(s.size).trim().toLowerCase() === String(item.size).trim().toLowerCase()) {
                const cur = parseInt(s.stock, 10) || 0;
                return { ...s, stock: cur + item.quantity };
              }
              return s;
            });
            await tx.product.update({
              where: { id: prod.id },
              data: { sizeStocks: updatedSizeStocks }
            });
          }
        }
      }
    }

    // --- ADVANCE REVERSAL (IF ANY) ---
    if (existing.advanceUsed > 0 && existing.customerId) {
        const adv = await tx.advance.findUnique({ where: { customerId: existing.customerId } });
        if (adv) {
            await tx.advance.update({
                where: { id: adv.id },
                data: {
                    usedAmount: { decrement: existing.advanceUsed },
                    balance: { increment: existing.advanceUsed }
                }
            });
            await tx.advanceHistory.create({
                data: {
                    customerId: existing.customerId,
                    advanceId: adv.id,
                    action: 'ADD',
                    amount: existing.advanceUsed,
                    balanceAfter: Number(adv.balance) + Number(existing.advanceUsed),
                    reference: `Reversal from Updated/Voided Invoice #${existing.invoiceNumber}`
                }
            });
        }
    }

    await tx.saleItem.deleteMany({ where: { saleId: validSaleId } });
    await tx.payment.deleteMany({ where: { saleId: validSaleId } });
    await tx.voucher.updateMany({ where: { reference: existing.invoiceNumber }, data: { status: 'CANCELLED' } });

    const fetchBranch = await tx.branch.findUnique({ where: { id: existing.branchId } });
    // Robust check for stockIncluded (Hardened)
    const stockIncluded = fetchBranch?.stockIncluded === true || fetchBranch?.stockIncluded === 'true';

    console.log(`[POS Stock Resolution:Update] Branch: ${existing.branchId}, Raw: ${fetchBranch?.stockIncluded}, Final Decision: ${stockIncluded ? 'VALIDATING' : 'SKIPPING STOCK CHECK'}`);

    // Recalculate
    let subTotal = 0;
    let taxAmount = 0;
    let totalItemsDiscount = 0;
    const saleItemsData = [];

    for (const item of items) {
      const productId = parseInt(item.productId);
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error(`Product ${productId} not found.`);

      // Zero-stock variant check (CRITICAL: A variant with stock <= 0 must never be saleable, regardless of branch settings)
      const selectedSize = item.size || item.selectedSize;
      if (selectedSize && product.sizeStocks) {
        let parsedSizeStocks = product.sizeStocks;
        if (typeof parsedSizeStocks === 'string') {
          try { parsedSizeStocks = JSON.parse(parsedSizeStocks); } catch (e) { parsedSizeStocks = []; }
        }
        if (Array.isArray(parsedSizeStocks)) {
          const sizeEntry = parsedSizeStocks.find(s => String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase());
          if (sizeEntry) {
            const vStock = parseInt(sizeEntry.stock, 10) || 0;
            if (vStock <= 0) {
              throw new Error(`Size "${selectedSize}" for product "${product.name}" is out of stock (Stock: 0) and cannot be sold.`);
            }
          }
        }
      }

      // Stock Check for non-zero stock / branch stock
      if (stockIncluded) {
        const stock = await tx.productStock.findUnique({
          where: { branchId_productId: { branchId: existing.branchId, productId } }
        });
        if (!stock || stock.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${stock?.quantity || 0}`);
        }

        // Size-level stock check
        if (selectedSize && product.sizeStocks) {
          let parsedSizeStocks = product.sizeStocks;
          if (typeof parsedSizeStocks === 'string') {
            try { parsedSizeStocks = JSON.parse(parsedSizeStocks); } catch (e) { parsedSizeStocks = []; }
          }
          if (Array.isArray(parsedSizeStocks)) {
            const sizeEntry = parsedSizeStocks.find(s => String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase());
            if (sizeEntry && (parseInt(sizeEntry.stock, 10) || 0) < item.quantity) {
              throw new Error(`Insufficient stock for ${product.name} (Size: ${selectedSize}). Available: ${sizeEntry.stock || 0}`);
            }
          }
        }
      }

      const unitPrice = parseFloat(item.unitPrice || item.price || 0);
      let catalogPrice = product ? parseFloat(product.price || 0) : unitPrice;
      if (product && item.brandId && product.brandPrices) {
        let bPrices = product.brandPrices;
        if (typeof bPrices === 'string') {
          try { bPrices = JSON.parse(bPrices); } catch(e) { bPrices = null; }
        }
        const bKey = String(item.brandId);
        if (bPrices && bPrices[bKey] && bPrices[bKey].price !== undefined && bPrices[bKey].price !== null && bPrices[bKey].price !== '') {
          catalogPrice = parseFloat(bPrices[bKey].price);
        }
      }
      if (product && (item.size || item.selectedSize)) {
        const itemSize = item.size || item.selectedSize;
        let sizeFound = false;
        if (item.brandId && product.brandPrices) {
          let bPrices = product.brandPrices;
          if (typeof bPrices === 'string') {
            try { bPrices = JSON.parse(bPrices); } catch(e) { bPrices = null; }
          }
          const bKey = String(item.brandId);
          const bEntry = bPrices && bPrices[bKey];
          if (bEntry && Array.isArray(bEntry.sizeStocks)) {
            const sObj = bEntry.sizeStocks.find(s => String(s.size).trim().toLowerCase() === String(itemSize).trim().toLowerCase());
            if (sObj && sObj.price !== undefined && sObj.price !== null && sObj.price !== '' && !isNaN(parseFloat(sObj.price))) {
              catalogPrice = parseFloat(sObj.price);
              sizeFound = true;
            }
          }
        }
        if (!sizeFound && product.sizeStocks) {
          let sStocks = product.sizeStocks;
          if (typeof sStocks === 'string') {
            try { sStocks = JSON.parse(sStocks); } catch(e) { sStocks = null; }
          }
          if (Array.isArray(sStocks)) {
            const sObj = sStocks.find(s => String(s.size).trim().toLowerCase() === String(itemSize).trim().toLowerCase());
            if (sObj && sObj.price !== undefined && sObj.price !== null && sObj.price !== '' && !isNaN(parseFloat(sObj.price))) {
              catalogPrice = parseFloat(sObj.price);
            }
          }
        }
      }
      const originalUnitPrice = item.originalUnitPrice !== undefined && item.originalUnitPrice !== null
        ? parseFloat(item.originalUnitPrice)
        : catalogPrice;
      const discAmt = parseFloat(item.discountAmount || 0);
      const voucherDiscountAmount = parseFloat(item.voucherDiscountAmount || 0);
      const netPrice = Math.max(0, unitPrice - discAmt);
      const taxRate = item.taxPercent !== undefined ? parseFloat(item.taxPercent) : parseFloat(product.taxRate || 0);
      const itemIsTaxInclusive = item.isTaxInclusive === true || item.isTaxInclusive === 'true';

      const lineTotalPayableBeforeVoucher = item.quantity * netPrice;
      const lineTotalPayable = Math.max(0, lineTotalPayableBeforeVoucher - voucherDiscountAmount);

      let lineTax = 0;
      let lineTotal = 0; // Taxable base amount

      if (itemIsTaxInclusive && taxRate > 0) {
        const baseAmount = lineTotalPayable / (1 + (taxRate / 100));
        lineTax = lineTotalPayable - baseAmount;
        lineTotal = baseAmount;
      } else if (taxRate > 0) {
        lineTotal = lineTotalPayable;
        lineTax = (lineTotalPayable * taxRate) / 100;
      } else {
        lineTotal = lineTotalPayable;
        lineTax = 0;
      }

      subTotal += lineTotal;
      taxAmount += lineTax;
      totalItemsDiscount += (discAmt * item.quantity);

      const savedLineTotal = itemIsTaxInclusive
        ? lineTotalPayable
        : lineTotal + lineTax;

      saleItemsData.push({
        productId: parseInt(item.productId),
        size: item.size || item.selectedSize || null,
        quantity: parseFloat(item.quantity || 1),
        unitPrice: parseFloat(unitPrice.toFixed(2)),
        originalUnitPrice: parseFloat(originalUnitPrice.toFixed(2)),
        discountPercent: parseFloat(item.discountPercent || 0),
        discountAmount: parseFloat(discAmt.toFixed(2)),
        voucherDiscountAmount: parseFloat(voucherDiscountAmount.toFixed(2)),
        total: parseFloat(savedLineTotal.toFixed(2)),
        taxAmount: parseFloat(lineTax.toFixed(2)),
        taxRate: parseFloat(taxRate.toFixed(2)),
        isTaxInclusive: itemIsTaxInclusive
      });
    }

    const finalSubTotal = Number(subTotal.toFixed(2));
    const finalTaxAmount = Number(taxAmount.toFixed(2));
    const finalDiscount = Math.max(parseFloat(discount || 0), totalItemsDiscount); // Still needed for display/record
    const finalRoundOffAmount = parseFloat(req.body.roundOffAmount || 0);
    // Explicit Calculation Logic: Total = Subtotal + Tax + Delivery Charge + RoundOff
    const grandTotal = finalSubTotal + finalTaxAmount + effectiveDeliveryCharge + finalRoundOffAmount;
    const finalGrandTotal = Number(grandTotal.toFixed(2));
    // Payment Breakdown Calculation
    let calculatedPaidAmount = 0;
    if (Array.isArray(req.body.payments) && req.body.payments.length > 0) {
      calculatedPaidAmount = req.body.payments
        .filter(p => p.method && p.method.toLowerCase() !== 'credit')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    } else if (paymentMethod && paymentMethod.toLowerCase() === 'credit') {
      calculatedPaidAmount = 0;
    } else {
      calculatedPaidAmount = parseFloat(paidAmount || 0);
    }

    const finalPaidAmount = Number(calculatedPaidAmount.toFixed(2));
    const calculatedBalance = finalGrandTotal - finalPaidAmount - parseFloat(advanceRedeemed || 0);
    const finalBalanceAmount = Number((calculatedBalance >= 0 ? calculatedBalance : 0).toFixed(2));

    let resolvedPaymentMethod = paymentMethod;
    if (!resolvedPaymentMethod) {
      if (Array.isArray(req.body.payments) && req.body.payments.length > 1) {
        resolvedPaymentMethod = 'Split';
      } else if (Array.isArray(req.body.payments) && req.body.payments.length === 1) {
        resolvedPaymentMethod = req.body.payments[0].method;
      } else {
        resolvedPaymentMethod = 'Cash';
      }
    }

    const updated = await tx.sale.update({
      where: { id: validSaleId },
      data: {
        customerId: customerId ? parseInt(customerId) : null,
        paymentMethod: resolvedPaymentMethod,
        discount: finalDiscount,
        subTotal: finalSubTotal,
        taxAmount: finalTaxAmount,
        totalAmount: finalGrandTotal,
        roundOffAmount: finalRoundOffAmount,
        deliveryCharge: effectiveDeliveryCharge,
        hasDeliveryCharge: isDeliveryEnabled,
        paidAmount: finalPaidAmount,
        advanceUsed: parseFloat(advanceRedeemed || 0),
        balanceAmount: finalBalanceAmount,
        description,
        placeOfSupply: req.body.placeOfSupply || customer?.state || existing.placeOfSupply || null,
        status: finalBalanceAmount > 0.01 ? 'partial' : 'completed',
        items: { create: saleItemsData }
      },
      include: { 
        customer: true, 
        items: { include: { product: true } },
        salesman: { select: { name: true } },
        branch: true,
        payments: true
      }
    });

    // --- NEW ADVANCE DEDUCTION (IF ANY) ---
    const reqAdvanceUsed = parseFloat(advanceRedeemed || 0);
    if (reqAdvanceUsed > 0 && customerId) {
        const adv = await tx.advance.findUnique({ where: { customerId: parseInt(customerId) } });
        const totalAvail = Number(adv?.balance || 0);
        if (totalAvail < reqAdvanceUsed) throw new Error(`Insufficient advance balance. Available: ${totalAvail}`);

        const updatedAdv = await tx.advance.update({
            where: { id: adv.id },
            data: {
                usedAmount: { increment: reqAdvanceUsed },
                balance: { decrement: reqAdvanceUsed }
            }
        });
        await tx.advanceHistory.create({
            data: {
                customerId: parseInt(customerId),
                advanceId: adv.id,
                action: 'REDEEM',
                amount: reqAdvanceUsed,
                balanceAfter: Number(updatedAdv.balance),
                reference: `Redeemed in Invoice #${updated.invoiceNumber} (Update)`
            }
        });
    }

    await processSalePosting(tx, updated, req.user?.id || 1);

    for (const item of items) {
      await tx.productStock.upsert({
        where: { branchId_productId: { branchId: updated.branchId, productId: parseInt(item.productId) } },
        create: { branchId: updated.branchId, productId: parseInt(item.productId), quantity: -item.quantity },
        update: { quantity: { decrement: item.quantity } }
      });

      // Deduct size-level stock if product has sizeStocks
      const selectedSize = item.size || item.selectedSize;
      if (selectedSize) {
        const prod = await tx.product.findUnique({ where: { id: parseInt(item.productId) } });
        if (prod && prod.sizeStocks) {
          let pSizeStocks = prod.sizeStocks;
          if (typeof pSizeStocks === 'string') {
            try { pSizeStocks = JSON.parse(pSizeStocks); } catch (e) { pSizeStocks = []; }
          }
          if (Array.isArray(pSizeStocks)) {
            const updatedSizeStocks = pSizeStocks.map(s => {
              if (String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase()) {
                const cur = parseInt(s.stock, 10) || 0;
                return { ...s, stock: Math.max(0, cur - item.quantity) };
              }
              return s;
            });
            await tx.product.update({
              where: { id: prod.id },
              data: { sizeStocks: updatedSizeStocks }
            });
          }
        }
      }
    }

    const paymentsList = req.body.payments || (finalPaidAmount > 0 ? [{ method: resolvedPaymentMethod || 'Cash', amount: finalPaidAmount }] : []);
    for (const p of paymentsList) {
      if (parseFloat(p.amount) > 0 && p.method && p.method.toLowerCase() !== 'credit') {
        await tx.payment.create({
          data: {
            type: 'receipt', amount: parseFloat(p.amount), method: p.method,
            reference: 'Updated Payment', description: `Payment for Invoice ${updated.invoiceNumber}`,
            saleId: validSaleId, branchId: updated.branchId
          }
        });
      }
    }
    const createdPayments = await tx.payment.findMany({ where: { saleId: validSaleId } });
    const isInterState = req.body.taxType === 'igst' || 
      (updated.placeOfSupply && branchExists?.state && updated.placeOfSupply.trim().toLowerCase() !== branchExists.state.trim().toLowerCase()) || 
      (customer?.state && branchExists?.state && customer.state.trim().toLowerCase() !== branchExists.state.trim().toLowerCase());
    return { ...updated, payments: createdPayments, taxType: isInterState ? 'igst' : 'cgst_sgst' };
  });

  res.json(result);
});
