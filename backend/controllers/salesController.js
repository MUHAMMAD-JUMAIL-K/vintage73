const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { processSalePosting } = require('../utils/accountingHelper');
const { generateNextNumber } = require('../services/numberingService');
const {
  getLocalDateString,
  getUtcDateObj,
  formatDisplayDate,
  getBranchActiveBusinessDate
} = require('../utils/businessDateHelper');
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
    currencyCode = 'AED', exchangeRate = 1.0, description,
    deliveryCharge = 0, hasDeliveryCharge = false,
    voucherCode, voucherName, showVoucherOnBill
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

  if (!branchId && req.headers && req.headers['x-branch-id'] && req.headers['x-branch-id'] !== 'all') {
    const parsedHdr = parseInt(req.headers['x-branch-id']);
    if (!isNaN(parsedHdr)) branchId = parsedHdr;
  }

  // Auto-inherit branch from original invoice for returns
  if (!branchId && isReturn && originalInvoice) {
    const origSale = await prisma.sale.findFirst({
      where: { invoiceNumber: originalInvoice },
      select: { branchId: true }
    });
    if (origSale && origSale.branchId) {
      branchId = origSale.branchId;
    }
  }

  // Fallback for global admin: use the active branch (or first active branch)
  if (!branchId && (!req.user || req.user.role === 'admin' || !req.user.branchId)) {
    const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
    if (firstBranch) {
      branchId = firstBranch.id;
    }
  }

  if (!branchId) {
    res.status(400);
    throw new Error('Branch selection is required.');
  }

  const validBranchId = parseInt(branchId);
  const effectiveSaleDate = saleDate ? new Date(saleDate) : new Date();

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
    const isApplyVoucherDiscount = req.body.appliedVoucher !== null && req.body.applyVoucherDiscount !== false && (req.body.voucherDiscount === undefined || parseFloat(req.body.voucherDiscount) > 0);
    if (voucherCode && !isReturn && isApplyVoucherDiscount) {
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

    let finalVoucherCode = voucherValidation ? voucherValidation.voucher.code : (voucherCode || null);
    let finalVoucherName = voucherValidation ? voucherValidation.voucher.name : (voucherName || null);
    if (!finalVoucherName && finalVoucherCode) {
      const vRec = await tx.customerVoucher.findUnique({ where: { code: finalVoucherCode.trim().toUpperCase() } });
      if (vRec) finalVoucherName = vRec.name;
    }
    const finalShowVoucherOnBill = showVoucherOnBill === true || showVoucherOnBill === 'true';

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
        voucherCode: finalVoucherCode,
        voucherName: finalVoucherName,
        showVoucherOnBill: finalShowVoucherOnBill,
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
        currencyCode: branchExists?.currencyCode || currencyCode || 'AED',
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

    // Voucher Redemption only if a discount was validated and applied
    if (voucherValidation && finalVoucherDiscount > 0) {
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
      voucherName: s.voucherName || null,
      showVoucherOnBill: Boolean(s.showVoucherOnBill),
      paidAmount: paidAmt,
      balanceAmount: balAmt,
      payments: paymentsList,
      customerName: s.customer?.name || s.customerName || 'Walk-in Customer',
      taxType: isInterState ? 'igst' : 'cgst_sgst'
    };
  });

  // If a specific invoice was searched, enrich its items with alreadyReturnedQty & remainingQty
  if (invoice && normalized.length > 0) {
    const targetSale = normalized[0];
    const previousReturns = await prisma.sale.findMany({
      where: { originalInvoice: targetSale.invoiceNumber, isReturn: true, status: { not: 'cancelled' } },
      include: { items: true }
    });
    const returnedMap = {};
    previousReturns.forEach(ret => {
      ret.items.forEach(it => {
        const key = `${it.productId}_${it.size || 'nosize'}`;
        returnedMap[key] = (returnedMap[key] || 0) + it.quantity;
        returnedMap[it.productId] = (returnedMap[it.productId] || 0) + it.quantity;
      });
    });
    targetSale.items = (targetSale.items || []).map(item => {
      const key = `${item.productId}_${item.size || 'nosize'}`;
      const alreadyReturned = returnedMap[key] !== undefined ? returnedMap[key] : (returnedMap[item.productId] || 0);
      return {
        ...item,
        alreadyReturnedQty: alreadyReturned,
        remainingQty: Math.max(0, item.quantity - alreadyReturned)
      };
    });
  }

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
      const redemption = await tx.customerVoucherRedemption.findFirst({ where: { saleId: parseInt(id) } });
      if (redemption) {
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
    terminalId, currencyCode = 'AED', exchangeRate = 1.0, advanceRedeemed = 0, description,
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

    let updateVoucherCode = req.body.voucherCode !== undefined ? req.body.voucherCode : existing.voucherCode;
    let updateVoucherName = req.body.voucherName !== undefined ? req.body.voucherName : existing.voucherName;
    if (!updateVoucherName && updateVoucherCode) {
      const vRec = await tx.customerVoucher.findUnique({ where: { code: updateVoucherCode.trim().toUpperCase() } });
      if (vRec) updateVoucherName = vRec.name;
    }
    const updateShowVoucherOnBill = req.body.showVoucherOnBill !== undefined 
      ? (req.body.showVoucherOnBill === true || req.body.showVoucherOnBill === 'true')
      : existing.showVoucherOnBill;

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
        voucherCode: updateVoucherCode,
        voucherName: updateVoucherName,
        showVoucherOnBill: updateShowVoucherOnBill,
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

exports.deleteSale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const validSaleId = parseInt(id);
  const sale = await prisma.sale.findUnique({ where: { id: validSaleId }, include: { items: true } });
  if (!sale) {
    res.status(404);
    throw new Error('Sale not found');
  }

  // For completed/posted invoices, require cancellation to preserve financial integrity
  if (sale.status !== 'cancelled' && sale.status !== 'draft') {
    res.status(400);
    throw new Error('Posted invoices must be cancelled with a valid cancellation reason to preserve audit trail, stock reconciliation, and accounting integrity. Direct hard-deletion is not permitted.');
  }

  // If already cancelled or draft, delete cleanly in transaction
  await prisma.$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { saleId: validSaleId } });
    await tx.payment.deleteMany({ where: { saleId: validSaleId } });
    await tx.customerVoucherRedemption.deleteMany({ where: { saleId: validSaleId } });
    await tx.sale.delete({ where: { id: validSaleId } });
  });

  res.json({ success: true, message: 'Invoice deleted successfully.' });
});

// Search Invoices for Return / Exchange
exports.searchInvoicesForReturn = asyncHandler(async (req, res) => {
  const { query, q, branchId } = req.query;
  const searchTerm = (query || q || '').trim();

  let targetBranchId = null;
  if (req.user && req.user.branchId) {
    targetBranchId = req.user.branchId;
  } else if (branchId && branchId !== 'all') {
    targetBranchId = parseInt(branchId);
  }

  const where = {
    isReturn: false,
    status: { not: 'cancelled' }
  };

  if (targetBranchId) {
    where.branchId = targetBranchId;
  }

  if (searchTerm) {
    where.OR = [
      { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
      { customer: { name: { contains: searchTerm, mode: 'insensitive' } } },
      { customer: { phone: { contains: searchTerm } } },
      {
        items: {
          some: {
            OR: [
              { product: { name: { contains: searchTerm, mode: 'insensitive' } } },
              { product: { barcode: { contains: searchTerm, mode: 'insensitive' } } }
            ]
          }
        }
      }
    ];
  }

  const sales = await prisma.sale.findMany({
    where,
    take: 30,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: true,
      branch: true,
      salesman: { select: { id: true, name: true } },
      payments: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              barcode: true,
              price: true,
              sizeStocks: true,
              brandPrices: true,
              category: { select: { id: true, name: true } }
            }
          }
        }
      }
    }
  });

  // Calculate return eligibility details for every item in each invoice
  const enrichedSales = await Promise.all(
    sales.map(async (sale) => {
      const previousReturns = await prisma.sale.findMany({
        where: {
          originalInvoice: sale.invoiceNumber,
          isReturn: true,
          status: { not: 'cancelled' }
        },
        include: { items: true }
      });

      const returnedMap = {};
      previousReturns.forEach(ret => {
        ret.items.forEach(it => {
          const key = `${it.productId}_${it.size || 'nosize'}`;
          returnedMap[key] = (returnedMap[key] || 0) + it.quantity;
          returnedMap[it.productId] = (returnedMap[it.productId] || 0) + it.quantity;
        });
      });

      const enrichedItems = sale.items.map(item => {
        const key = `${item.productId}_${item.size || 'nosize'}`;
        const alreadyReturned = returnedMap[key] !== undefined ? returnedMap[key] : (returnedMap[item.productId] || 0);
        const remaining = Math.max(0, item.quantity - alreadyReturned);
        return {
          ...item,
          alreadyReturnedQty: alreadyReturned,
          remainingQty: remaining,
          isEligibleForReturn: remaining > 0
        };
      });

      let customerBalance = 0;
      if (sale.customerId) {
        const custSales = await prisma.sale.findMany({
          where: { customerId: sale.customerId, status: { not: 'cancelled' } }
        });
        customerBalance = custSales.reduce((sum, s) => {
          if (s.isReturn) {
            const unapplied = Math.max(0, parseFloat(s.totalAmount || 0) - parseFloat(s.returnCreditUsed || 0) - parseFloat(s.refundAmount || 0));
            return sum - unapplied;
          } else {
            return sum + parseFloat(s.balanceAmount || 0);
          }
        }, 0);
      }

      return {
        ...sale,
        customerBalance: Number(customerBalance.toFixed(2)),
        items: enrichedItems,
        totalEligibleItems: enrichedItems.filter(i => i.remainingQty > 0).length
      };
    })
  );

  res.json(enrichedSales);
});

// Get Return & Exchange History with Dashboard KPIs
exports.getReturnExchangeHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, branchId, customerId, originalInvoice, status, transactionType, search } = req.query;

  let targetBranchId = null;
  if (req.user && req.user.branchId) {
    targetBranchId = req.user.branchId;
  } else if (branchId && branchId !== 'all') {
    targetBranchId = parseInt(branchId);
  }

  // Fetch ExchangeTransactions
  const exchangeWhere = {};
  if (targetBranchId) exchangeWhere.branchId = targetBranchId;
  if (customerId) exchangeWhere.customerId = parseInt(customerId);
  if (originalInvoice) exchangeWhere.originalInvoice = { contains: originalInvoice, mode: 'insensitive' };
  if (status && status !== 'all') exchangeWhere.status = status;
  if (startDate && endDate) {
    exchangeWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const exchanges = await prisma.exchangeTransaction.findMany({
    where: exchangeWhere,
    orderBy: { createdAt: 'desc' },
    include: {
      returnSale: {
        include: {
          items: { include: { product: true } },
          payments: true,
          customer: true,
          salesman: { select: { id: true, name: true } }
        }
      },
      newSale: {
        include: {
          items: { include: { product: true } },
          payments: true,
          customer: true,
          salesman: { select: { id: true, name: true } }
        }
      },
      customer: true,
      branch: true
    }
  });

  // Also fetch standalone returns that might not have an ExchangeTransaction record (e.g. legacy returns)
  const exchangeReturnSaleIds = new Set(exchanges.map(e => e.returnSaleId));
  const standaloneWhere = {
    isReturn: true,
    id: { notIn: Array.from(exchangeReturnSaleIds) }
  };
  if (targetBranchId) standaloneWhere.branchId = targetBranchId;
  if (customerId) standaloneWhere.customerId = parseInt(customerId);
  if (originalInvoice) standaloneWhere.originalInvoice = { contains: originalInvoice, mode: 'insensitive' };
  if (status && status !== 'all') standaloneWhere.status = status;
  if (startDate && endDate) {
    standaloneWhere.saleDate = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const standaloneReturns = await prisma.sale.findMany({
    where: standaloneWhere,
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { product: true } },
      payments: true,
      customer: true,
      branch: true,
      salesman: { select: { id: true, name: true } }
    }
  });

  // Combine and normalize transactions
  let combined = [
    ...exchanges.map(e => {
      const isExch = Boolean(e.newSaleId && e.newSale);
      return {
        id: e.id,
        exchangeId: e.id,
        exchangeNumber: e.exchangeNumber,
        transactionType: isExch ? 'EXCHANGE' : 'RETURN',
        originalInvoice: e.originalInvoice,
        returnNumber: e.returnSale?.invoiceNumber || '-',
        exchangeNumberInvoice: e.newSale?.invoiceNumber || null,
        returnSale: e.returnSale,
        newSale: e.newSale,
        customer: e.customer || e.returnSale?.customer || null,
        branch: e.branch || e.returnSale?.branch || null,
        returnValue: Number(e.returnTotal || 0),
        purchaseValue: Number(e.newPurchaseTotal || 0),
        creditApplied: Number(e.creditApplied || 0),
        amountPaid: Number(e.additionalPaid || 0),
        remainingCredit: Number(e.remainingCredit || 0),
        refundAmount: Number(e.refundAmount || 0),
        settlementType: e.settlementType,
        paymentMethod: e.paymentMethod || e.newSale?.paymentMethod || 'Cash',
        status: e.status || e.returnSale?.status || 'completed',
        notes: e.notes || e.returnSale?.returnReason || '',
        returnedItemsCount: e.returnSale?.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
        purchasedItemsCount: e.newSale?.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
        createdAt: e.createdAt
      };
    }),
    ...standaloneReturns.map(r => ({
      id: `legacy_${r.id}`,
      exchangeId: null,
      exchangeNumber: r.invoiceNumber,
      transactionType: 'RETURN',
      originalInvoice: r.originalInvoice || '-',
      returnNumber: r.invoiceNumber,
      exchangeNumberInvoice: null,
      returnSale: r,
      newSale: null,
      customer: r.customer,
      branch: r.branch,
      returnValue: Number(r.totalAmount || 0),
      purchaseValue: 0,
      creditApplied: 0,
      amountPaid: 0,
      remainingCredit: Number(Number(r.refundAmount || 0) > 0 ? 0 : r.totalAmount),
      refundAmount: Number(r.refundAmount || 0),
      settlementType: Number(r.refundAmount || 0) > 0 ? 'REFUNDED' : 'STORE_CREDIT',
      paymentMethod: r.paymentMethod || 'Cash',
      status: r.status,
      notes: r.returnReason || '',
      returnedItemsCount: r.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
      purchasedItemsCount: 0,
      createdAt: r.createdAt
    }))
  ];

  // Apply filters
  if (transactionType && transactionType !== 'ALL') {
    combined = combined.filter(t => t.transactionType === transactionType);
  }

  if (search) {
    const q = search.toLowerCase().trim();
    combined = combined.filter(t => 
      (t.exchangeNumber && t.exchangeNumber.toLowerCase().includes(q)) ||
      (t.returnNumber && t.returnNumber.toLowerCase().includes(q)) ||
      (t.originalInvoice && t.originalInvoice.toLowerCase().includes(q)) ||
      (t.exchangeNumberInvoice && t.exchangeNumberInvoice.toLowerCase().includes(q)) ||
      (t.customer?.name && t.customer.name.toLowerCase().includes(q)) ||
      (t.customer?.phone && t.customer.phone.includes(q))
    );
  }

  combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Compute Dashboard KPIs
  const activeTransactions = combined.filter(t => t.status !== 'cancelled');
  const totalReturns = activeTransactions.length;
  const totalReturnValue = Number(activeTransactions.reduce((sum, t) => sum + t.returnValue, 0).toFixed(2));
  const totalExchanges = activeTransactions.filter(t => t.transactionType === 'EXCHANGE').length;
  const totalCreditNotes = activeTransactions.filter(t => t.returnNumber).length;
  const productsRestocked = activeTransactions.reduce((sum, t) => sum + t.returnedItemsCount, 0);
  const pendingRefunds = Number(activeTransactions.reduce((sum, t) => sum + (t.settlementType === 'STORE_CREDIT' ? t.remainingCredit : 0), 0).toFixed(2));

  res.json({
    kpis: {
      totalReturns,
      totalReturnValue,
      totalExchanges,
      totalCreditNotes,
      productsRestocked,
      pendingRefunds
    },
    transactions: combined
  });
});

// Process Advanced Sales Return & Product Exchange
exports.processExchange = asyncHandler(async (req, res) => {
  const {
    originalInvoice,
    customerId,
    returnReason = 'Product Return / Exchange',
    returnItems = [],
    newItems = [],
    settlementType = 'DIFFERENCE_PAID', // 'DIFFERENCE_PAID', 'EXACT_EXCHANGE', 'STORE_CREDIT', 'REFUNDED', 'RETURN_ONLY'
    paymentMethod = 'Cash',
    payments = [],
    notes = '',
    terminalId,
    salesmanId,
    saleDate
  } = req.body;
  let { branchId } = req.body;

  if (!originalInvoice) {
    res.status(400);
    throw new Error('Original Invoice number is required.');
  }

  if (!Array.isArray(returnItems) || returnItems.length === 0) {
    res.status(400);
    throw new Error('At least one item must be selected for return.');
  }

  // 1. Verify Original Invoice
  const originalSale = await prisma.sale.findFirst({
    where: { invoiceNumber: originalInvoice },
    include: { items: { include: { product: true } }, branch: true, customer: true }
  });

  if (!originalSale) {
    res.status(404);
    throw new Error(`Original invoice "${originalInvoice}" not found.`);
  }

  if (originalSale.status === 'cancelled') {
    res.status(400);
    throw new Error('Cannot process return against a cancelled invoice.');
  }

  if (!branchId) {
    branchId = originalSale.branchId;
  }
  const validBranchId = parseInt(branchId);
  const effectiveDate = saleDate ? new Date(saleDate) : new Date();

  // 2. Validate Return Limits against past returns
  const previousReturns = await prisma.sale.findMany({
    where: {
      originalInvoice,
      isReturn: true,
      status: { not: 'cancelled' }
    },
    include: { items: true }
  });

  const returnedQtyMap = {};
  previousReturns.forEach(ret => {
    ret.items.forEach(it => {
      const key = `${it.productId}_${it.size || 'nosize'}`;
      returnedQtyMap[key] = (returnedQtyMap[key] || 0) + it.quantity;
      returnedQtyMap[it.productId] = (returnedQtyMap[it.productId] || 0) + it.quantity;
    });
  });

  for (const item of returnItems) {
    const qtyToReturn = parseInt(item.quantity || 0);
    if (qtyToReturn <= 0) {
      res.status(400);
      throw new Error(`Invalid return quantity for product ID ${item.productId}.`);
    }

    const origItem = originalSale.items.find(i => 
      i.productId === parseInt(item.productId) && 
      (!item.size || !i.size || String(i.size).trim().toLowerCase() === String(item.size).trim().toLowerCase())
    ) || originalSale.items.find(i => i.productId === parseInt(item.productId));

    if (!origItem) {
      res.status(400);
      throw new Error(`Product ID ${item.productId} was not part of the original invoice.`);
    }

    const key = `${item.productId}_${item.size || origItem.size || 'nosize'}`;
    const alreadyReturned = returnedQtyMap[key] !== undefined ? returnedQtyMap[key] : (returnedQtyMap[item.productId] || 0);
    const remaining = origItem.quantity - alreadyReturned;

    if (qtyToReturn > remaining) {
      res.status(400);
      throw new Error(`Cannot return ${qtyToReturn} units for "${origItem.product?.name || 'product'}". Only ${remaining} units eligible.`);
    }
  }

  // 3. Execute in Atomic Database Transaction
  const result = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: validBranchId } });
    if (!branch) throw new Error(`Branch with ID ${validBranchId} not found.`);
    const stockIncluded = branch.stockIncluded === true || branch.stockIncluded === 'true';

    // A. Calculate Return Items Line Totals
    let returnSubTotal = 0;
    let returnTaxAmount = 0;
    const returnSaleItemsData = [];

    for (const rItem of returnItems) {
      const pId = parseInt(rItem.productId);
      const origItem = originalSale.items.find(i => 
        i.productId === pId && 
        (!rItem.size || !i.size || String(i.size).trim().toLowerCase() === String(rItem.size).trim().toLowerCase())
      ) || originalSale.items.find(i => i.productId === pId);

      const rQty = parseInt(rItem.quantity);
      const unitPrice = rItem.unitPrice !== undefined ? parseFloat(rItem.unitPrice) : parseFloat(origItem.unitPrice);
      const discAmt = rItem.discountAmount !== undefined ? parseFloat(rItem.discountAmount) : parseFloat(origItem.discountAmount || 0);
      const netUnitPrice = Math.max(0, unitPrice - discAmt);
      const taxRate = origItem.taxRate ? parseFloat(origItem.taxRate) : 0;
      const isTaxInclusive = origItem.isTaxInclusive === true || origItem.isTaxInclusive === 'true';

      const lineTotalPayable = rQty * netUnitPrice;
      let lineTax = 0;
      let lineBase = lineTotalPayable;

      if (isTaxInclusive && taxRate > 0) {
        lineBase = lineTotalPayable / (1 + (taxRate / 100));
        lineTax = lineTotalPayable - lineBase;
      } else if (taxRate > 0) {
        lineBase = lineTotalPayable;
        lineTax = (lineTotalPayable * taxRate) / 100;
      }

      returnSubTotal += lineBase;
      returnTaxAmount += lineTax;

      returnSaleItemsData.push({
        productId: pId,
        size: rItem.size || origItem.size || null,
        quantity: rQty,
        unitPrice: parseFloat(unitPrice.toFixed(2)),
        originalUnitPrice: parseFloat(origItem.originalUnitPrice || origItem.unitPrice),
        discountAmount: parseFloat(discAmt.toFixed(2)),
        discountPercent: parseFloat(origItem.discountPercent || 0),
        taxRate: parseFloat(taxRate.toFixed(2)),
        taxAmount: parseFloat(lineTax.toFixed(2)),
        isTaxInclusive: isTaxInclusive,
        total: parseFloat((lineBase + lineTax).toFixed(2))
      });
    }

    const finalReturnTotal = Number((returnSubTotal + returnTaxAmount).toFixed(2));

    // B. Calculate New Purchase Line Totals (if any)
    const hasNewItems = Array.isArray(newItems) && newItems.length > 0;
    let newSubTotal = 0;
    let newTaxAmount = 0;
    let newTotalDiscount = 0;
    const newSaleItemsData = [];

    if (hasNewItems) {
      for (const nItem of newItems) {
        const prodId = parseInt(nItem.productId);
        const product = await tx.product.findUnique({ where: { id: prodId } });
        if (!product) throw new Error(`Product ${prodId} not found.`);

        const nQty = parseInt(nItem.quantity || 1);
        const selSize = nItem.size || nItem.selectedSize;

        // Zero-stock variant check
        if (selSize && product.sizeStocks) {
          let pStocks = product.sizeStocks;
          if (typeof pStocks === 'string') {
            try { pStocks = JSON.parse(pStocks); } catch(e) { pStocks = []; }
          }
          if (Array.isArray(pStocks)) {
            const entry = pStocks.find(s => String(s.size).trim().toLowerCase() === String(selSize).trim().toLowerCase());
            if (entry && (parseInt(entry.stock, 10) || 0) < nQty) {
              throw new Error(`Size "${selSize}" for product "${product.name}" has insufficient stock. Available: ${entry.stock || 0}`);
            }
          }
        }

        // Branch-level stock check
        if (stockIncluded) {
          const bStock = await tx.productStock.findUnique({
            where: { branchId_productId: { branchId: validBranchId, productId: prodId } }
          });
          if (!bStock || bStock.quantity < nQty) {
            throw new Error(`Insufficient stock for "${product.name}". Available: ${bStock?.quantity || 0}`);
          }
        }

        const unitPrice = parseFloat(nItem.unitPrice || nItem.price || product.price || 0);
        const discAmt = parseFloat(nItem.discountAmount || 0);
        const netPrice = Math.max(0, unitPrice - discAmt);
        const taxRate = nItem.taxRate !== undefined ? parseFloat(nItem.taxRate) : parseFloat(product.taxRate || 0);
        const isTaxInc = nItem.isTaxInclusive === true || nItem.isTaxInclusive === 'true';

        const linePayable = nQty * netPrice;
        let lineTax = 0;
        let lineBase = linePayable;

        if (isTaxInc && taxRate > 0) {
          lineBase = linePayable / (1 + (taxRate / 100));
          lineTax = linePayable - lineBase;
        } else if (taxRate > 0) {
          lineBase = linePayable;
          lineTax = (linePayable * taxRate) / 100;
        }

        newSubTotal += lineBase;
        newTaxAmount += lineTax;
        newTotalDiscount += (discAmt * nQty);

        newSaleItemsData.push({
          productId: prodId,
          size: selSize || null,
          quantity: nQty,
          unitPrice: parseFloat(unitPrice.toFixed(2)),
          originalUnitPrice: parseFloat(product.price || unitPrice),
          discountAmount: parseFloat(discAmt.toFixed(2)),
          discountPercent: parseFloat(nItem.discountPercent || 0),
          taxRate: parseFloat(taxRate.toFixed(2)),
          taxAmount: parseFloat(lineTax.toFixed(2)),
          isTaxInclusive: isTaxInc,
          total: parseFloat((lineBase + lineTax).toFixed(2))
        });
      }
    }

    const finalNewGrandTotal = hasNewItems ? Number((newSubTotal + newTaxAmount).toFixed(2)) : 0;

    // C. Automatic Credit Adjustment
    const creditApplied = hasNewItems ? Number(Math.min(finalReturnTotal, finalNewGrandTotal).toFixed(2)) : 0;
    const remainingCredit = Number(Math.max(0, finalReturnTotal - finalNewGrandTotal).toFixed(2));
    const remainingPayable = Number(Math.max(0, finalNewGrandTotal - finalReturnTotal).toFixed(2));

    let finalSettlementType = settlementType;
    if (!hasNewItems) {
      finalSettlementType = (settlementType === 'REFUNDED' ? 'REFUNDED' : 'STORE_CREDIT');
    } else if (Math.abs(finalNewGrandTotal - finalReturnTotal) < 0.01) {
      finalSettlementType = 'EXACT_EXCHANGE';
    } else if (finalNewGrandTotal > finalReturnTotal) {
      finalSettlementType = 'DIFFERENCE_PAID';
    } else {
      finalSettlementType = (settlementType === 'REFUNDED' ? 'REFUNDED' : 'STORE_CREDIT');
    }

    const actualRefundAmount = (finalSettlementType === 'REFUNDED')
      ? (hasNewItems ? remainingCredit : finalReturnTotal)
      : 0;

    // D. Numbering & Reference
    const exchangeNumber = `EXC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const { number: returnDocNumber, nextSeq: retSeq, financialYearId: retFyId } = await generateNextNumber(tx, 'invoice', validBranchId, effectiveDate);
    if (retFyId) {
      await tx.financialYear.update({ where: { id: retFyId }, data: { invoiceSequence: retSeq } });
    }

    let newInvoiceNumber = null;
    if (hasNewItems) {
      const { number: newDocNumber, nextSeq: newSeq, financialYearId: newFyId } = await generateNextNumber(tx, 'invoice', validBranchId, effectiveDate);
      newInvoiceNumber = newDocNumber;
      if (newFyId) {
        await tx.financialYear.update({ where: { id: newFyId }, data: { invoiceSequence: newSeq } });
      }
    }

    const resolvedCustomerId = customerId ? parseInt(customerId) : (originalSale.customerId || null);

    // Resolve Return Sale Payment Method (handles split refund if applicable)
    let resolvedReturnPaymentMethod = 'Credit';
    if (actualRefundAmount > 0) {
      if (Array.isArray(payments) && payments.length > 1 && (!hasNewItems || remainingCredit > 0)) {
        resolvedReturnPaymentMethod = 'Split';
      } else if (Array.isArray(payments) && payments.length === 1 && (!hasNewItems || remainingCredit > 0)) {
        resolvedReturnPaymentMethod = payments[0].method || 'Cash';
      } else {
        resolvedReturnPaymentMethod = paymentMethod || 'Cash';
      }
    }

    // E. Create Return Sale Record
    const returnSale = await tx.sale.create({
      data: {
        invoiceNumber: returnDocNumber,
        customerId: resolvedCustomerId,
        branchId: validBranchId,
        salesmanId: salesmanId ? parseInt(salesmanId) : originalSale.salesmanId,
        terminalId: terminalId ? parseInt(terminalId) : null,
        saleDate: effectiveDate,
        subTotal: Number(returnSubTotal.toFixed(2)),
        taxAmount: Number(returnTaxAmount.toFixed(2)),
        totalAmount: finalReturnTotal,
        roundOffAmount: 0,
        paidAmount: actualRefundAmount,
        balanceAmount: 0,
        paymentMethod: resolvedReturnPaymentMethod,
        status: 'completed',
        isInvoice: false,
        isReturn: true,
        isExchange: hasNewItems,
        exchangeReference: exchangeNumber,
        returnReason: returnReason,
        originalInvoice: originalInvoice,
        returnCreditUsed: creditApplied,
        refundAmount: actualRefundAmount,
        currencyCode: branch.currencyCode || 'AED',
        description: `Sales Return for #${originalInvoice}${notes ? ` - ${notes}` : ''}`,
        items: { create: returnSaleItemsData }
      },
      include: {
        customer: true,
        branch: true,
        items: { include: { product: true } }
      }
    });

    // F. Restock Returned Products
    for (const rItem of returnItems) {
      const pId = parseInt(rItem.productId);
      const q = parseInt(rItem.quantity);
      await tx.productStock.upsert({
        where: { branchId_productId: { branchId: validBranchId, productId: pId } },
        create: { branchId: validBranchId, productId: pId, quantity: q },
        update: { quantity: { increment: q } }
      });

      const selSize = rItem.size;
      if (selSize) {
        const prod = await tx.product.findUnique({ where: { id: pId } });
        if (prod && prod.sizeStocks) {
          let pStocks = prod.sizeStocks;
          if (typeof pStocks === 'string') {
            try { pStocks = JSON.parse(pStocks); } catch(e) { pStocks = []; }
          }
          if (Array.isArray(pStocks)) {
            const updated = pStocks.map(s => {
              if (String(s.size).trim().toLowerCase() === String(selSize).trim().toLowerCase()) {
                return { ...s, stock: (parseInt(s.stock, 10) || 0) + q };
              }
              return s;
            });
            await tx.product.update({ where: { id: pId }, data: { sizeStocks: updated } });
          }
        }
      }
    }

    // G. Create New Sale Record & Decrement Inventory if replacement purchased
    let newSale = null;
    if (hasNewItems) {
      let calculatedPaidAmount = 0;
      if (Array.isArray(payments) && payments.length > 0) {
        calculatedPaidAmount = payments
          .filter(p => p.method && p.method.toLowerCase() !== 'credit')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      } else if (remainingPayable > 0) {
        calculatedPaidAmount = remainingPayable;
      }

      const finalPaidAmount = Number(calculatedPaidAmount.toFixed(2));
      const finalBalanceAmount = Number(Math.max(0, remainingPayable - finalPaidAmount).toFixed(2));

      let resolvedMethod = paymentMethod;
      if (!resolvedMethod || resolvedMethod === 'Split' || (Array.isArray(payments) && payments.length > 1)) {
        if (payments.length > 1) resolvedMethod = 'Split';
        else if (payments.length === 1) resolvedMethod = payments[0].method;
        else resolvedMethod = paymentMethod || 'Cash';
      }

      newSale = await tx.sale.create({
        data: {
          invoiceNumber: newInvoiceNumber,
          customerId: resolvedCustomerId,
          branchId: validBranchId,
          salesmanId: salesmanId ? parseInt(salesmanId) : null,
          terminalId: terminalId ? parseInt(terminalId) : null,
          saleDate: effectiveDate,
          subTotal: Number(newSubTotal.toFixed(2)),
          taxAmount: Number(newTaxAmount.toFixed(2)),
          totalAmount: finalNewGrandTotal,
          roundOffAmount: 0,
          discount: newTotalDiscount,
          advanceUsed: 0,
          returnCreditUsed: creditApplied,
          paidAmount: finalPaidAmount,
          balanceAmount: finalBalanceAmount,
          paymentMethod: resolvedMethod,
          status: finalBalanceAmount > 0.01 ? 'partial' : 'completed',
          isInvoice: true,
          isReturn: false,
          isExchange: true,
          exchangeReference: exchangeNumber,
          originalInvoice: originalInvoice,
          currencyCode: branch.currencyCode || 'AED',
          description: `Product Exchange against Return #${returnDocNumber} (Orig: ${originalInvoice})`,
          items: { create: newSaleItemsData }
        },
        include: {
          customer: true,
          branch: true,
          items: { include: { product: true } }
        }
      });

      // Deduct inventory for new products
      for (const nItem of newItems) {
        const prodId = parseInt(nItem.productId);
        const q = parseInt(nItem.quantity || 1);
        await tx.productStock.upsert({
          where: { branchId_productId: { branchId: validBranchId, productId: prodId } },
          create: { branchId: validBranchId, productId: prodId, quantity: -q },
          update: { quantity: { decrement: q } }
        });

        const selSize = nItem.size || nItem.selectedSize;
        if (selSize) {
          const prod = await tx.product.findUnique({ where: { id: prodId } });
          if (prod && prod.sizeStocks) {
            let pStocks = prod.sizeStocks;
            if (typeof pStocks === 'string') {
              try { pStocks = JSON.parse(pStocks); } catch(e) { pStocks = []; }
            }
            if (Array.isArray(pStocks)) {
              const updated = pStocks.map(s => {
                if (String(s.size).trim().toLowerCase() === String(selSize).trim().toLowerCase()) {
                  return { ...s, stock: Math.max(0, (parseInt(s.stock, 10) || 0) - q) };
                }
                return s;
              });
              await tx.product.update({ where: { id: prodId }, data: { sizeStocks: updated } });
            }
          }
        }
      }

      // Record Payments for remaining difference
      if (finalPaidAmount > 0) {
        const paymentsList = (Array.isArray(payments) && payments.length > 0)
          ? payments
          : [{ method: resolvedMethod, amount: finalPaidAmount }];

        for (const p of paymentsList) {
          const pAmt = parseFloat(p.amount || 0);
          if (pAmt > 0 && p.method && p.method.toLowerCase() !== 'credit') {
            await tx.payment.create({
              data: {
                type: 'receipt',
                amount: pAmt,
                method: p.method,
                reference: `Exchange Difference for #${newInvoiceNumber}`,
                description: `Payment for Exchange Invoice ${newInvoiceNumber} (Credit Applied: ${creditApplied})`,
                saleId: newSale.id,
                branchId: validBranchId,
                customerId: resolvedCustomerId
              }
            });
          }
        }
      }
    }

    // H. If Cash/Bank Refund was paid out, record Payment record(s) for return
    if (actualRefundAmount > 0) {
      const refundPaymentsList = (Array.isArray(payments) && payments.length > 0 && (!hasNewItems || remainingCredit > 0))
        ? payments.filter(p => p.method && p.method.toLowerCase() !== 'credit')
        : [{ method: paymentMethod || 'Cash', amount: actualRefundAmount }];

      for (const p of refundPaymentsList) {
        const pAmt = parseFloat(p.amount || 0);
        if (pAmt > 0) {
          await tx.payment.create({
            data: {
              type: 'payment',
              amount: pAmt,
              method: p.method || 'Cash',
              reference: `Refund for Return #${returnDocNumber}`,
              description: `Refund for Return Credit Note ${returnDocNumber}${p.method ? ` (${p.method})` : ''}`,
              saleId: returnSale.id,
              branchId: validBranchId,
              customerId: resolvedCustomerId
            }
          });
        }
      }
    }

    // I. Accounting Integration
    try {
      await processSalePosting(tx, returnSale, req.user?.id || 1);
      if (newSale) {
        await processSalePosting(tx, newSale, req.user?.id || 1);
      }
    } catch (accErr) {
      console.warn('Accounting posting notice in Exchange:', accErr.message);
    }

    // Resolve overall transaction payment method
    let finalTxPaymentMethod = paymentMethod || 'Cash';
    if (Array.isArray(payments) && payments.length > 1) {
      finalTxPaymentMethod = 'Split';
    } else if (Array.isArray(payments) && payments.length === 1) {
      finalTxPaymentMethod = payments[0].method || paymentMethod || 'Cash';
    }

    // J. Create Master ExchangeTransaction Record
    const exchangeTx = await tx.exchangeTransaction.create({
      data: {
        exchangeNumber,
        originalInvoice,
        returnSaleId: returnSale.id,
        newSaleId: newSale ? newSale.id : null,
        customerId: resolvedCustomerId,
        branchId: validBranchId,
        returnTotal: finalReturnTotal,
        newPurchaseTotal: finalNewGrandTotal,
        creditApplied: creditApplied,
        remainingCredit: remainingCredit,
        additionalPaid: hasNewItems ? remainingPayable : 0,
        refundAmount: actualRefundAmount,
        settlementType: finalSettlementType,
        paymentMethod: finalTxPaymentMethod,
        status: 'completed',
        notes: notes || returnReason
      },
      include: {
        returnSale: { include: { items: { include: { product: true } }, payments: true, customer: true } },
        newSale: { include: { items: { include: { product: true } }, payments: true, customer: true } },
        branch: true,
        customer: true
      }
    });

    return {
      success: true,
      exchange: exchangeTx,
      returnSale,
      newSale,
      financials: {
        returnTotal: finalReturnTotal,
        newPurchaseTotal: finalNewGrandTotal,
        creditApplied,
        remainingCredit,
        remainingPayable,
        refundAmount: actualRefundAmount,
        settlementType: finalSettlementType,
        payments: (hasNewItems && remainingPayable > 0) ? payments : (actualRefundAmount > 0 ? payments : [])
      }
    };
  });

  res.status(201).json(result);
});

// Cancel an Exchange Transaction
exports.cancelExchange = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cancelReason, cancelledBy } = req.body;

  const exchange = await prisma.exchangeTransaction.findUnique({
    where: { id: parseInt(id) },
    include: {
      returnSale: { include: { items: true } },
      newSale: { include: { items: true } }
    }
  });

  if (!exchange) {
    res.status(404);
    throw new Error('Exchange transaction not found.');
  }

  if (exchange.status === 'cancelled') {
    res.status(400);
    throw new Error('Exchange transaction is already cancelled.');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Cancel Exchange Transaction record
    await tx.exchangeTransaction.update({
      where: { id: exchange.id },
      data: { status: 'cancelled', notes: `${exchange.notes || ''} [Cancelled: ${cancelReason || 'User request'}]` }
    });

    // 2. Reverse Return Sale: status -> cancelled, DECREMENT stock
    if (exchange.returnSale) {
      await tx.sale.update({
        where: { id: exchange.returnSale.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: cancelledBy || req.user?.username || 'Admin',
          cancelReason: cancelReason || 'Exchange Cancelled'
        }
      });

      for (const item of exchange.returnSale.items) {
        await tx.productStock.update({
          where: { branchId_productId: { branchId: exchange.branchId, productId: item.productId } },
          data: { quantity: { decrement: item.quantity } }
        });
        if (item.size) {
          const prod = await tx.product.findUnique({ where: { id: item.productId } });
          if (prod && prod.sizeStocks) {
            let pStocks = prod.sizeStocks;
            if (typeof pStocks === 'string') {
              try { pStocks = JSON.parse(pStocks); } catch(e) { pStocks = []; }
            }
            if (Array.isArray(pStocks)) {
              const updated = pStocks.map(s => {
                if (String(s.size).trim().toLowerCase() === String(item.size).trim().toLowerCase()) {
                  return { ...s, stock: Math.max(0, (parseInt(s.stock, 10) || 0) - item.quantity) };
                }
                return s;
              });
              await tx.product.update({ where: { id: item.productId }, data: { sizeStocks: updated } });
            }
          }
        }
      }
      await tx.payment.deleteMany({ where: { saleId: exchange.returnSale.id } });
    }

    // 3. Reverse New Sale: status -> cancelled, INCREMENT stock
    if (exchange.newSale) {
      await tx.sale.update({
        where: { id: exchange.newSale.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: cancelledBy || req.user?.username || 'Admin',
          cancelReason: cancelReason || 'Exchange Cancelled'
        }
      });

      for (const item of exchange.newSale.items) {
        await tx.productStock.update({
          where: { branchId_productId: { branchId: exchange.branchId, productId: item.productId } },
          data: { quantity: { increment: item.quantity } }
        });
        if (item.size) {
          const prod = await tx.product.findUnique({ where: { id: item.productId } });
          if (prod && prod.sizeStocks) {
            let pStocks = prod.sizeStocks;
            if (typeof pStocks === 'string') {
              try { pStocks = JSON.parse(pStocks); } catch(e) { pStocks = []; }
            }
            if (Array.isArray(pStocks)) {
              const updated = pStocks.map(s => {
                if (String(s.size).trim().toLowerCase() === String(item.size).trim().toLowerCase()) {
                  return { ...s, stock: (parseInt(s.stock, 10) || 0) + item.quantity };
                }
                return s;
              });
              await tx.product.update({ where: { id: item.productId }, data: { sizeStocks: updated } });
            }
          }
        }
      }
      await tx.payment.deleteMany({ where: { saleId: exchange.newSale.id } });
    }

    // Cancel related Vouchers
    await tx.voucher.updateMany({
      where: {
        reference: { in: [exchange.returnSale?.invoiceNumber, exchange.newSale?.invoiceNumber].filter(Boolean) }
      },
      data: { status: 'CANCELLED' }
    });
  });

  res.json({ success: true, message: 'Exchange transaction cancelled and inventory reversed successfully.' });
});

