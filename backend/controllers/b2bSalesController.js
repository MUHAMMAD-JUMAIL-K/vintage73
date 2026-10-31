const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ensureLedger, postVoucher } = require('../utils/accountingHelper');
const { generateNextNumber } = require('../services/numberingService');
const { getBranchActiveBusinessDate } = require('../utils/businessDateHelper');

// Determine if IGST or CGST/SGST based on place of supply
const determineTaxType = async (placeOfSupply) => {
  const company = await prisma.companyProfile.findFirst();
  if (!company || !company.state) return 'INTRA'; // Default to INTRA
  
  // Compare company state with place of supply
  if (company.state.toLowerCase() === placeOfSupply?.toLowerCase()) {
    return 'INTRA'; // Same state - CGST + SGST
  }
  return 'INTER'; // Different state - IGST
};

// Create B2B Invoice
exports.createB2BInvoice = asyncHandler(async (req, res) => {
  const {
    customerId,
    items,
    paymentMethod,
    paidAmount,
    saleDate,
    branchId: bodyBranchId,
    salesmanId,
    placeOfSupply,
    transportMode,
    vehicleNumber,
    transporterName,
    transporterId,
    discount = 0,
    roundOffAmount = 0
  } = req.body;

  const branchId = bodyBranchId || req.user?.branchId;
  const branchIdInt = parseInt(branchId);
  if (isNaN(branchIdInt)) {
    res.status(400);
    throw new Error('Branch selection is required.');
  }

  const effectiveSaleDate = saleDate ? new Date(saleDate) : new Date();

  if (!customerId) {
    res.status(400);
    throw new Error('Customer is required for B2B invoice');
  }

  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('At least one item is required');
  }

  const customer = await prisma.customer.findUnique({ 
    where: { id: parseInt(customerId) } 
  });
  
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Get settings for prefix
  const settings = await prisma.gSTSettings.findFirst();
  const prefix = settings?.invoicePrefix || 'INV';
  const taxType = await determineTaxType(placeOfSupply || customer.state);

  const result = await prisma.$transaction(async (tx) => {
    // Calculate totals
    let subTotal = 0;
    let taxAmount = 0;
    const saleItemsData = [];

    for (const item of items) {
      const productId = parseInt(item.productId);
      const product = await tx.product.findUnique({ where: { id: productId } });
      
      if (!product) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      // Stock check
      const branchRecord = await tx.branch.findUnique({ where: { id: parseInt(branchId) } });
      const stockIncluded = branchRecord?.stockIncluded === true || branchRecord?.stockIncluded === 'true';

      console.log(`[B2B Stock Resolution] Branch: ${branchId}, Raw: ${branchRecord?.stockIncluded}, Final Decision: ${stockIncluded ? 'VALIDATING' : 'SKIPPING STOCK CHECK'}`);

      if (stockIncluded) {
        const productStock = await tx.productStock.findUnique({
          where: { branchId_productId: { branchId: parseInt(branchId), productId } }
        });
        if (!productStock || productStock.quantity < item.quantity) {
          throw new Error(`Insufficient stock for product: ${product.name}`);
        }
      }

      const unitPrice = parseFloat(item.unitPrice || product.price);
      const originalUnitPrice = item.originalUnitPrice !== undefined && item.originalUnitPrice !== null
        ? parseFloat(item.originalUnitPrice)
        : (product ? parseFloat(product.price || 0) : unitPrice);
      const quantity = parseInt(item.quantity);
      const discountPercent = parseFloat(item.discountPercent || 0);
      const discountAmount = (unitPrice * discountPercent) / 100;
      const netPrice = unitPrice - discountAmount;
      const taxRate = parseFloat(item.taxRate || product.taxRate || 0);
      
      // FORCE EXCLUSIVE FOR B2B TAX (to ensure Total = Subtotal + Tax)
      const lineTotal = quantity * netPrice;
      const lineTax = (lineTotal * taxRate) / 100;

      subTotal += lineTotal;
      taxAmount += lineTax;

      saleItemsData.push({
        productId,
        quantity,
        unitPrice,
        originalUnitPrice,
        discountPercent,
        discountAmount: discountAmount * quantity,
        taxRate,
        taxAmount: lineTax,
        total: lineTotal + lineTax
      });
    }

    const grandTotal = subTotal + taxAmount + parseFloat(roundOffAmount || 0);
    const finalPaidAmount = parseFloat(paidAmount || 0);
    const { number: invoiceNumber, nextSeq, financialYearId } = await generateNextNumber(tx, 'invoice', parseInt(branchId), effectiveSaleDate);

    if (financialYearId) {
        // Update the FY sequence for sync (store current as per user req)
        await tx.financialYear.update({
            where: { id: financialYearId },
            data: { invoiceSequence: nextSeq }
        });
    }

    // Check if E-Way Bill is required
    const ewayRequired = settings && grandTotal >= parseFloat(settings.ewayBillThreshold);

    // Create Sale Record
    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        financialYear: financialYearId ? { connect: { id: financialYearId } } : undefined,
        customer: { connect: { id: customer.id } },
        paymentMethod: paymentMethod || 'Credit',
        subTotal,
        taxAmount,
        totalAmount: grandTotal,
        roundOffAmount: parseFloat(roundOffAmount || 0),
        paidAmount: finalPaidAmount,
        balanceAmount: grandTotal - finalPaidAmount,
        saleDate: effectiveSaleDate,
        branch: { connect: { id: parseInt(branchId) } },
        salesman: salesmanId ? { connect: { id: parseInt(salesmanId) } } : undefined,
        status: (grandTotal - finalPaidAmount) > 0.5 ? 'partial' : 'completed',
        isB2B: true,
        placeOfSupply: placeOfSupply || customer.state,
        transportMode,
        vehicleNumber,
        transporterName,
        transporterId,
        items: {
          create: saleItemsData
        }
      },
      include: {
        customer: true,
        items: { include: { product: true } },
        branch: true
      }
    });

    // Deduct Stock
    for (const item of items) {
      await tx.productStock.upsert({
        where: {
          branchId_productId: {
            branchId: parseInt(branchId),
            productId: parseInt(item.productId)
          }
        },
        create: {
          branchId: parseInt(branchId),
          productId: parseInt(item.productId),
          quantity: -parseInt(item.quantity)
        },
        update: {
          quantity: { decrement: parseInt(item.quantity) }
        }
      });
    }

    // Accounting Integration
    try {
      const userId = req.user ? req.user.id : 1;
      const customerLedger = await ensureLedger(tx, customer.name, 'Sundry Debtors');
      const salesLedger = await ensureLedger(tx, 'Sales Account', 'Sales Accounts');

      const entries = [
        { ledgerId: customerLedger.id, type: 'DEBIT', amount: grandTotal }
      ];

      if (taxAmount > 0) {
        entries.push({ ledgerId: salesLedger.id, type: 'CREDIT', amount: subTotal });
        
        if (taxType === 'INTER') {
          const igstLedger = await ensureLedger(tx, 'Output IGST', 'Duties & Taxes');
          entries.push({ ledgerId: igstLedger.id, type: 'CREDIT', amount: taxAmount });
        } else {
          const halfTax = parseFloat((taxAmount / 2).toFixed(2));
          const otherHalf = taxAmount - halfTax;
          
          const cgstLedger = await ensureLedger(tx, 'Output CGST', 'Duties & Taxes');
          const sgstLedger = await ensureLedger(tx, 'Output SGST', 'Duties & Taxes');
          
          entries.push({ ledgerId: cgstLedger.id, type: 'CREDIT', amount: halfTax });
          entries.push({ ledgerId: sgstLedger.id, type: 'CREDIT', amount: otherHalf });
        }
      } else {
        entries.push({ ledgerId: salesLedger.id, type: 'CREDIT', amount: grandTotal });
      }

      await postVoucher(tx, {
        type: 'SALES',
        date: effectiveSaleDate,
        amount: grandTotal,
        narration: `B2B Invoice #${invoiceNumber}`,
        reference: invoiceNumber,
        createdBy: userId,
        branchId: parseInt(branchId)
      }, entries);

      // Payment entry if paid
      if (finalPaidAmount > 0) {
        const cashLedger = await ensureLedger(tx, 'Cash', 'Cash-in-Hand');
        await postVoucher(tx, {
          type: 'RECEIPT',
          date: effectiveSaleDate,
          amount: finalPaidAmount,
          narration: `Payment for B2B Invoice #${invoiceNumber}`,
          reference: invoiceNumber,
          createdBy: userId,
          branchId: parseInt(branchId)
        }, [
          { ledgerId: cashLedger.id, type: 'DEBIT', amount: finalPaidAmount },
          { ledgerId: customerLedger.id, type: 'CREDIT', amount: finalPaidAmount }
        ]);
      }
    } catch (accErr) {
      console.error('Accounting Error:', accErr);
    }

    return { sale, ewayRequired, taxType };
  });

  res.status(201).json(result);
});

// Get B2B Invoices
exports.getB2BInvoices = asyncHandler(async (req, res) => {
  const { branchId, startDate, endDate } = req.query;
  
  const where = { isB2B: true };
  if (branchId) where.branchId = parseInt(branchId);
  if (startDate && endDate) {
    where.saleDate = {
      gte: new Date(startDate),
      lte: new Date(endDate)
    };
  }

  const invoices = await prisma.sale.findMany({
    where,
    include: {
      customer: true,
      items: { include: { product: true } },
      branch: true
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(invoices);
});

// Get Invoice for Print
exports.getInvoiceForPrint = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const sale = await prisma.sale.findUnique({
    where: { id: parseInt(id) },
    include: {
      customer: true,
      items: { include: { product: true } },
      branch: true
    }
  });

  if (!sale) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const company = await prisma.companyProfile.findFirst({
    include: { bank: true }
  });
  const settings = await prisma.gSTSettings.findFirst();
  const taxType = await determineTaxType(sale.placeOfSupply);

  // Generate HSN Summary
  const hsnSummary = {};
  sale.items.forEach(item => {
    const hsn = item.product.hsnCode || 'N/A';
    if (!hsnSummary[hsn]) {
      hsnSummary[hsn] = {
        hsn,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0
      };
    }
    const taxable = parseFloat(item.total) - parseFloat(item.taxAmount);
    const tax = parseFloat(item.taxAmount);
    
    hsnSummary[hsn].taxableValue += taxable;
    if (taxType === 'INTER') {
      hsnSummary[hsn].igst += tax;
    } else {
      hsnSummary[hsn].cgst += tax / 2;
      hsnSummary[hsn].sgst += tax / 2;
    }
    hsnSummary[hsn].total += parseFloat(item.total);
  });

  res.json({
    sale,
    company,
    settings,
    taxType,
    hsnSummary: Object.values(hsnSummary)
  });
});

// Update E-Way Bill
exports.updateEwayBill = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { ewayBillNumber, ewayBillDate } = req.body;

  const sale = await prisma.sale.update({
    where: { id: parseInt(id) },
    data: {
      ewayBillNumber,
      ewayBillDate: ewayBillDate ? new Date(ewayBillDate) : new Date()
    },
    include: { customer: true }
  });

  res.json(sale);
});
