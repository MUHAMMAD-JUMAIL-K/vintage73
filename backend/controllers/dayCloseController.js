const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { getBranchActiveBusinessDate } = require('../utils/businessDateHelper');

// TIMEZONE: Asia/Kolkata (IST, UTC+5:30)
const IST_TIMEZONE = 'Asia/Kolkata';

// Helper to format date to YYYY-MM-DD string in Asia/Kolkata (IST) timezone
const getLocalDateString = (d = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(new Date(d));
};

// Helper to get Date object at start of UTC day for @db.Date storage
const getUtcDateObj = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Helper to format date for UI display (DD/MM/YYYY)
const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

// Helper to parse start of day in IST (00:00:00.000+05:30)
const parseBusinessDateStart = (dateStr) => {
  if (!dateStr) return null;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${clean}T00:00:00.000+05:30`);
};

// Helper to parse end of day in IST (23:59:59.999+05:30)
const parseBusinessDateEnd = (dateStr) => {
  if (!dateStr) return null;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${clean}T23:59:59.999+05:30`);
};

// Resolves effective branch id respecting user permissions
const resolveEffectiveBranchId = async (req) => {
  const user = req.user;
  const isAdmin = user?.role === 'admin';

  if (isAdmin) {
    if (req.query?.branchId && req.query.branchId !== 'all') {
      return parseInt(req.query.branchId);
    }
    if (req.body?.branchId && req.body.branchId !== 'all') {
      return parseInt(req.body.branchId);
    }
    if (user?.branchId) {
      return user.branchId;
    }
    const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
    return firstBranch ? firstBranch.id : 1;
  }

  // Non-admin user (cashier, staff)
  if (user?.branchId) {
    return user.branchId;
  }

  // Fallback for users without branchId
  const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
  return firstBranch ? firstBranch.id : 1;
};

/**
 * @desc Get current Day Close status, active business date, opening details, and pending warning
 * @route GET /api/day-close/status
 * @access Private
 */
const getDayCloseStatus = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const branch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
    select: { id: true, name: true, currencyCode: true, currencySymbol: true }
  });

  // Determine authoritative active business date
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  // If specific date requested in query and user is admin or viewing history, allow inspecting that date
  const selectedDateStr = req.query.date || activeDateInfo.dateStr;
  const selectedUtc = getUtcDateObj(selectedDateStr);

  // Fetch or find DayClose record for this branch and date
  const dayCloseRecord = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: selectedUtc
      }
    },
    include: {
      branch: { select: { id: true, name: true } },
      terminal: { select: { id: true, terminalCode: true, name: true } },
      openedBy: { select: { id: true, name: true, username: true } },
      openingApprovedBy: { select: { id: true, name: true, username: true } },
      finalizedBy: { select: { id: true, name: true, username: true } },
      exceptionApprovedBy: { select: { id: true, name: true, username: true } }
    }
  });

  // Find previous closed day reference to determine expected opening cash
  const previousClosedDay = await prisma.dayClose.findFirst({
    where: {
      branchId: targetBranchId,
      status: { in: ['CLOSED', 'ADMIN_CLOSED'] },
      businessDate: { lt: selectedUtc }
    },
    orderBy: { businessDate: 'desc' },
    select: {
      id: true,
      businessDate: true,
      physicalCash: true,
      closingExpectedCash: true,
      finalizedAt: true
    }
  });

  const previousClosingCash = previousClosedDay
    ? Number(previousClosedDay.physicalCash || previousClosedDay.closingExpectedCash || 0)
    : 0;

  const isClosed = dayCloseRecord && (dayCloseRecord.status === 'CLOSED' || dayCloseRecord.status === 'ADMIN_CLOSED');
  const isOpen = dayCloseRecord && dayCloseRecord.status === 'OPEN';
  const isClosingPending = dayCloseRecord && dayCloseRecord.status === 'CLOSING_PENDING';
  
  // Status: NOT_OPENED, OPEN, CLOSING_PENDING, CLOSED
  let currentStatus = 'NOT_OPENED';
  if (isClosed) currentStatus = 'CLOSED';
  else if (isClosingPending) currentStatus = 'CLOSING_PENDING';
  else if (isOpen) currentStatus = 'OPEN';
  else if (dayCloseRecord) currentStatus = dayCloseRecord.status;

  res.json({
    success: true,
    branchId: targetBranchId,
    branchName: branch?.name || 'Branch',
    currencySymbol: branch?.currencySymbol || '₹',
    currencyCode: branch?.currencyCode || 'INR',
    businessDate: selectedDateStr,
    businessDateDisplay: formatDisplayDate(selectedDateStr),
    activeDate: activeDateInfo.dateStr,
    activeDateDisplay: formatDisplayDate(activeDateInfo.dateStr),
    hasPendingPrevious: activeDateInfo.isPendingPrevious,
    pendingDate: activeDateInfo.isPendingPrevious ? activeDateInfo.dateStr : null,
    pendingDateDisplay: activeDateInfo.isPendingPrevious ? formatDisplayDate(activeDateInfo.dateStr) : null,
    status: currentStatus,
    dayCloseId: dayCloseRecord?.id || null,
    terminalId: dayCloseRecord?.terminalId || null,
    terminalName: dayCloseRecord?.terminal?.name || null,
    // Day Opening Details
    openedBy: dayCloseRecord?.openedBy ? (dayCloseRecord.openedBy.name || dayCloseRecord.openedBy.username) : null,
    openedById: dayCloseRecord?.openedById || null,
    openedAt: dayCloseRecord?.openedAt || null,
    openingCash: Number(dayCloseRecord?.openingCash || dayCloseRecord?.actualOpeningCash || 0),
    previousClosingCash: dayCloseRecord ? Number(dayCloseRecord.previousClosingCash || previousClosingCash) : previousClosingCash,
    previousClosingDate: previousClosedDay ? getLocalDateString(previousClosedDay.businessDate) : null,
    previousClosingDateDisplay: previousClosedDay ? formatDisplayDate(getLocalDateString(previousClosedDay.businessDate)) : null,
    additionalCashAdded: Number(dayCloseRecord?.additionalCashAdded || 0),
    cashRemovedBeforeOpening: Number(dayCloseRecord?.cashRemovedBeforeOpening || 0),
    expectedOpeningCash: Number(dayCloseRecord?.expectedOpeningCash || previousClosingCash),
    actualOpeningCash: Number(dayCloseRecord?.actualOpeningCash || dayCloseRecord?.openingCash || 0),
    openingDifference: Number(dayCloseRecord?.openingDifference || 0),
    openingDiscrepancyReason: dayCloseRecord?.openingDiscrepancyReason || null,
    openingApprovedBy: dayCloseRecord?.openingApprovedBy ? (dayCloseRecord.openingApprovedBy.name || dayCloseRecord.openingApprovedBy.username) : null,
    openingDenominations: dayCloseRecord?.openingDenominations || null,
    openingRemarks: dayCloseRecord?.openingRemarks || null,
    // Verification & Closing Details
    verificationChecks: dayCloseRecord?.verificationChecks || null,
    verificationExceptions: dayCloseRecord?.verificationExceptions || null,
    exceptionApprovedBy: dayCloseRecord?.exceptionApprovedBy ? (dayCloseRecord.exceptionApprovedBy.name || dayCloseRecord.exceptionApprovedBy.username) : null,
    exceptionApprovalReason: dayCloseRecord?.exceptionApprovalReason || null,
    closingExpectedCash: dayCloseRecord?.closingExpectedCash ? Number(dayCloseRecord.closingExpectedCash) : null,
    physicalCash: dayCloseRecord?.physicalCash ? Number(dayCloseRecord.physicalCash) : null,
    cashDifference: dayCloseRecord?.cashDifference ? Number(dayCloseRecord.cashDifference) : null,
    closingDenominations: dayCloseRecord?.closingDenominations || null,
    notes: dayCloseRecord?.notes || null,
    closedAt: dayCloseRecord?.finalizedAt || null,
    closedBy: dayCloseRecord?.finalizedBy ? (dayCloseRecord.finalizedBy.name || dayCloseRecord.finalizedBy.username) : null
  });
});

/**
 * @desc Open Business Day with opening cash count, previous balance and discrepancy explanation
 * @route POST /api/day-close/open
 * @access Private
 */
const openDay = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    terminalId,
    previousClosingCash: inputPrevCash,
    additionalCashAdded: inputAddCash,
    cashRemovedBeforeOpening: inputRemCash,
    actualOpeningCash: inputActualCash,
    openingDiscrepancyReason,
    openingRemarks,
    openingDenominations
  } = req.body;

  const todayStr = getLocalDateString();
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = activeDateInfo.dateStr;

  if (dateStr > todayStr) {
    res.status(400);
    throw new Error(`Cannot open a future business date (${formatDisplayDate(dateStr)}).`);
  }

  const dateUtc = getUtcDateObj(dateStr);

  // Check if this date is already closed
  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (existing && (existing.status === 'CLOSED' || existing.status === 'ADMIN_CLOSED')) {
    res.status(400);
    throw new Error(`Business date ${formatDisplayDate(dateStr)} is already closed.`);
  }

  // Find previous closed day reference
  const previousClosedDay = await prisma.dayClose.findFirst({
    where: {
      branchId: targetBranchId,
      status: { in: ['CLOSED', 'ADMIN_CLOSED'] },
      businessDate: { lt: dateUtc }
    },
    orderBy: { businessDate: 'desc' }
  });

  const prevCash = inputPrevCash !== undefined
    ? parseFloat(inputPrevCash) || 0
    : (previousClosedDay ? Number(previousClosedDay.physicalCash || previousClosedDay.closingExpectedCash || 0) : 0);

  const addCash = parseFloat(inputAddCash) || 0;
  const remCash = parseFloat(inputRemCash) || 0;
  const actualCash = parseFloat(inputActualCash) || 0;

  const expectedOpeningCash = Number((prevCash + addCash - remCash).toFixed(2));
  const openingDifference = Number((actualCash - expectedOpeningCash).toFixed(2));

  // If opening difference is not zero, require an explanation
  if (Math.abs(openingDifference) > 0.01 && !openingDiscrepancyReason?.trim()) {
    res.status(400);
    throw new Error(`Opening difference of ₹${openingDifference.toFixed(2)} requires an explanation before opening.`);
  }

  const dayCloseRecord = await prisma.dayClose.upsert({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    update: {
      status: 'OPEN',
      terminalId: terminalId ? parseInt(terminalId) : undefined,
      openedById: req.user.id,
      openedAt: new Date(),
      openingCash: actualCash,
      previousClosingCash: prevCash,
      additionalCashAdded: addCash,
      cashRemovedBeforeOpening: remCash,
      expectedOpeningCash,
      actualOpeningCash: actualCash,
      openingDifference,
      openingDiscrepancyReason: openingDiscrepancyReason || null,
      openingRemarks: openingRemarks || null,
      openingDenominations: openingDenominations || null
    },
    create: {
      branchId: targetBranchId,
      businessDate: dateUtc,
      status: 'OPEN',
      terminalId: terminalId ? parseInt(terminalId) : null,
      openedById: req.user.id,
      openedAt: new Date(),
      openingCash: actualCash,
      previousClosingCash: prevCash,
      additionalCashAdded: addCash,
      cashRemovedBeforeOpening: remCash,
      expectedOpeningCash,
      actualOpeningCash: actualCash,
      openingDifference,
      openingDiscrepancyReason: openingDiscrepancyReason || null,
      openingRemarks: openingRemarks || null,
      openingDenominations: openingDenominations || null
    },
    include: {
      openedBy: { select: { id: true, name: true, username: true } },
      branch: { select: { id: true, name: true } }
    }
  });

  res.json({
    success: true,
    message: `Business Day ${formatDisplayDate(dateStr)} opened successfully.`,
    dayClose: dayCloseRecord
  });
});

/**
 * @desc Get real-time daily activity verification data across all 8 required domains
 * @route GET /api/day-close/verification-data
 * @access Private
 */
const getVerificationData = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = req.query.date || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const startUtc = parseBusinessDateStart(dateStr);
  const endUtc = parseBusinessDateEnd(dateStr);

  // 1. Fetch DayClose record
  const dayCloseRecord = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    include: {
      openedBy: { select: { id: true, name: true, username: true } },
      openingApprovedBy: { select: { id: true, name: true, username: true } },
      finalizedBy: { select: { id: true, name: true, username: true } }
    }
  });

  // 2. Fetch all sales for this branch and date
  const sales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: {
        gte: startUtc,
        lte: endUtc
      }
    },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, barcode: true } }
        }
      },
      customer: { select: { id: true, name: true, phone: true } },
      payments: true,
      salesman: { select: { id: true, name: true, username: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Separate valid sales, cancelled sales, returns
  const completedSales = sales.filter(s => s.status !== 'cancelled' && !s.isReturn);
  const cancelledSales = sales.filter(s => s.status === 'cancelled');
  const returnSales = sales.filter(s => s.isReturn && s.status !== 'cancelled');

  // Section A: Sales & Invoices
  const totalInvoicesCreated = sales.length;
  const postedInvoices = completedSales.length;
  const paidInvoices = completedSales.filter(s => Number(s.balanceAmount) <= 0.01).length;
  const partiallyPaidInvoices = completedSales.filter(s => Number(s.balanceAmount) > 0.01 && Number(s.paidAmount) > 0).length;
  const unpaidInvoices = completedSales.filter(s => Number(s.paidAmount) <= 0.01).length;
  const cancelledInvoicesCount = cancelledSales.length;

  const grossSalesTotal = completedSales.reduce((sum, s) => sum + Number(s.subTotal || 0), 0);
  const invoiceDiscountTotal = completedSales.reduce((sum, s) => sum + (Number(s.discount || 0) + Number(s.voucherDiscount || 0)), 0);
  const taxTotal = completedSales.reduce((sum, s) => sum + Number(s.taxAmount || 0), 0);
  const netSalesTotal = completedSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

  const salesReturnTotal = returnSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
  const salesReturnQty = returnSales.reduce((sum, s) => sum + s.items.reduce((iSum, it) => iSum + it.quantity, 0), 0);

  // Section B: Payments
  const paymentBreakdown = {
    Cash: 0,
    UPI: 0,
    Card: 0,
    'Bank Transfer': 0,
    Other: 0
  };

  let totalCreditSales = 0;
  let totalOutstanding = 0;

  completedSales.forEach(s => {
    totalCreditSales += Number(s.balanceAmount || 0);
    totalOutstanding += Number(s.balanceAmount || 0);

    if (s.payments && s.payments.length > 0) {
      s.payments.forEach(p => {
        const method = p.method || 'Cash';
        if (paymentBreakdown[method] !== undefined) {
          paymentBreakdown[method] += Number(p.amount || 0);
        } else {
          paymentBreakdown.Other += Number(p.amount || 0);
        }
      });
    } else {
      const method = s.paymentMethod || 'Cash';
      const paid = Number(s.paidAmount || s.totalAmount || 0);
      if (paymentBreakdown[method] !== undefined) {
        paymentBreakdown[method] += paid;
      } else {
        paymentBreakdown.Other += paid;
      }
    }
  });

  // Section C: Cash & Cashbook
  const openingCash = Number(dayCloseRecord?.actualOpeningCash || dayCloseRecord?.openingCash || 0);
  const cashSalesReceived = paymentBreakdown.Cash;
  const additionalCashAdded = Number(dayCloseRecord?.additionalCashAdded || 0);

  // Fetch expenses for this branch and date
  const expenses = await prisma.expense.findMany({
    where: {
      branchId: targetBranchId,
      date: {
        gte: startUtc,
        lte: endUtc
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const cashExpenses = totalExpenses; // All logged petty/operating expenses

  // Cash refunds paid on returns
  const cashRefunds = returnSales
    .filter(r => (r.paymentMethod || 'Cash').toLowerCase() === 'cash')
    .reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);

  const expectedClosingCash = Number((openingCash + cashSalesReceived + additionalCashAdded - cashExpenses - cashRefunds).toFixed(2));

  // Section D: Inventory & Stock Balance
  let totalUnitsSold = 0;
  completedSales.forEach(s => {
    s.items.forEach(it => {
      totalUnitsSold += it.quantity;
    });
  });

  // Check for negative stock warnings in this branch
  const negativeStockItems = await prisma.productStock.findMany({
    where: {
      branchId: targetBranchId,
      quantity: { lt: 0 }
    },
    include: {
      product: { select: { id: true, name: true, barcode: true } }
    }
  });

  const hasNegativeStock = negativeStockItems.length > 0;

  // Section E: Returns & Refunds
  const returnsList = returnSales.map(r => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    originalInvoice: r.originalInvoice,
    amount: Number(r.totalAmount),
    reason: r.returnReason || 'Product Return',
    paymentMethod: r.paymentMethod || 'Cash',
    customer: r.customer?.name || 'Walk-in',
    itemsCount: r.items.length,
    createdAt: r.createdAt
  }));

  const cancelledList = cancelledSales.map(c => ({
    id: c.id,
    invoiceNumber: c.invoiceNumber,
    amount: Number(c.totalAmount),
    cancelledAt: c.cancelledAt || c.updatedAt,
    cancelledBy: c.cancelledBy || 'User',
    cancelReason: c.cancelReason || 'Cancelled by staff'
  }));

  // Section F: GST & Tax Verification
  const gstBreakdown = {
    taxableSales: Number((netSalesTotal - taxTotal).toFixed(2)),
    cgst: Number((taxTotal / 2).toFixed(2)),
    sgst: Number((taxTotal / 2).toFixed(2)),
    igst: 0,
    totalTax: Number(taxTotal.toFixed(2))
  };

  // Section G: Expenses & Other Entries
  const expenseList = expenses.map(e => ({
    id: e.id,
    title: e.title,
    category: e.category || 'General',
    amount: Number(e.amount),
    description: e.description,
    date: e.date
  }));

  // Section H: Branch & Session Verification
  const orphanTransactionsCount = sales.filter(s => s.branchId !== targetBranchId).length;

  // Saved verification checks on DayClose
  const savedChecks = dayCloseRecord?.verificationChecks || {};
  const savedExceptions = dayCloseRecord?.verificationExceptions || {};

  // Build the 8 Checklist Verification Cards
  const checklist = {
    salesInvoices: {
      key: 'salesInvoices',
      title: "Today's Sales & Invoices",
      summary: `${postedInvoices} posted invoices (₹${netSalesTotal.toLocaleString('en-IN')}), ${cancelledInvoicesCount} cancelled, ${paidInvoices} paid`,
      details: {
        totalInvoicesCreated,
        postedInvoices,
        paidInvoices,
        partiallyPaidInvoices,
        unpaidInvoices,
        cancelledInvoicesCount,
        grossSales: grossSalesTotal,
        discounts: invoiceDiscountTotal,
        netSales: netSalesTotal,
        returns: salesReturnTotal
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.salesInvoices?.reviewed),
      reviewedAt: savedChecks.salesInvoices?.verifiedAt || null,
      reviewedBy: savedChecks.salesInvoices?.verifiedBy || null,
      actionRoute: '/sales/invoices',
      actionLabel: 'View Sales & Invoices'
    },
    payments: {
      key: 'payments',
      title: 'Payment & Collection Verification',
      summary: `Cash: ₹${paymentBreakdown.Cash.toLocaleString('en-IN')} | UPI: ₹${paymentBreakdown.UPI.toLocaleString('en-IN')} | Card: ₹${paymentBreakdown.Card.toLocaleString('en-IN')}`,
      details: {
        ...paymentBreakdown,
        totalCreditSales,
        totalOutstanding
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.payments?.reviewed),
      reviewedAt: savedChecks.payments?.verifiedAt || null,
      reviewedBy: savedChecks.payments?.verifiedBy || null,
      actionRoute: '/reports/sales',
      actionLabel: 'View Payment Details'
    },
    cashbook: {
      key: 'cashbook',
      title: 'Cash & Cashbook Reconciliation',
      summary: `Opening: ₹${openingCash} + Cash Sales: ₹${cashSalesReceived} - Expenses: ₹${cashExpenses} = Expected Closing Cash: ₹${expectedClosingCash}`,
      details: {
        openingCash,
        cashSalesReceived,
        additionalCashAdded,
        cashExpenses,
        cashRefunds,
        expectedClosingCash
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.cashbook?.reviewed),
      reviewedAt: savedChecks.cashbook?.verifiedAt || null,
      reviewedBy: savedChecks.cashbook?.verifiedBy || null,
      actionRoute: '/accounting/reports/cash-book',
      actionLabel: 'View Cashbook'
    },
    inventory: {
      key: 'inventory',
      title: 'Inventory & Stock Balances',
      summary: `${totalUnitsSold} units sold, ${salesReturnQty} units returned. ${hasNegativeStock ? `${negativeStockItems.length} products with negative stock!` : 'All stocks positive.'}`,
      details: {
        totalUnitsSold,
        returnedStockUnits: salesReturnQty,
        negativeStockCount: negativeStockItems.length,
        negativeStockItems: negativeStockItems.map(ns => ({
          productId: ns.productId,
          productName: ns.product?.name || 'Unknown',
          sku: ns.product?.barcode || '',
          quantity: ns.quantity
        }))
      },
      hasDiscrepancy: hasNegativeStock,
      discrepancyMessage: hasNegativeStock ? `${negativeStockItems.length} products have negative stock balance.` : null,
      isReviewed: Boolean(savedChecks.inventory?.reviewed),
      reviewedAt: savedChecks.inventory?.verifiedAt || null,
      reviewedBy: savedChecks.inventory?.verifiedBy || null,
      actionRoute: '/reports/current-stock',
      actionLabel: 'Verify Inventory'
    },
    returnsRefunds: {
      key: 'returnsRefunds',
      title: 'Sales Returns & Cancellations',
      summary: `${returnSales.length} returns (₹${salesReturnTotal.toLocaleString('en-IN')}), ${cancelledInvoicesCount} cancelled invoices`,
      details: {
        returnCount: returnSales.length,
        returnTotal: salesReturnTotal,
        cancelledCount: cancelledInvoicesCount,
        returnsList,
        cancelledList
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.returnsRefunds?.reviewed),
      reviewedAt: savedChecks.returnsRefunds?.verifiedAt || null,
      reviewedBy: savedChecks.returnsRefunds?.verifiedBy || null,
      actionRoute: '/sales-return',
      actionLabel: 'View Returns & Cancellations'
    },
    gst: {
      key: 'gst',
      title: 'GST & Tax Verification',
      summary: `Taxable: ₹${gstBreakdown.taxableSales.toLocaleString('en-IN')} | CGST: ₹${gstBreakdown.cgst.toLocaleString('en-IN')} | SGST: ₹${gstBreakdown.sgst.toLocaleString('en-IN')}`,
      details: gstBreakdown,
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.gst?.reviewed),
      reviewedAt: savedChecks.gst?.verifiedAt || null,
      reviewedBy: savedChecks.gst?.verifiedBy || null,
      actionRoute: '/reports/gstr-1',
      actionLabel: 'View GST Summary'
    },
    expenses: {
      key: 'expenses',
      title: 'Expenses & Cash Entries',
      summary: `${expenses.length} expense entries recorded totaling ₹${totalExpenses.toLocaleString('en-IN')}`,
      details: {
        expenseCount: expenses.length,
        totalExpenses,
        expenseList
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.expenses?.reviewed),
      reviewedAt: savedChecks.expenses?.verifiedAt || null,
      reviewedBy: savedChecks.expenses?.verifiedBy || null,
      actionRoute: '/accounting/reports/cash-book',
      actionLabel: 'View Expenses & Entries'
    },
    branchSession: {
      key: 'branchSession',
      title: 'Branch & Business Session Alignment',
      summary: `All ${sales.length} transactions belong cleanly to Branch #${targetBranchId} (${dayCloseRecord?.branch?.name || 'Active'}).`,
      details: {
        orphanTransactionsCount,
        branchId: targetBranchId,
        businessDate: dateStr
      },
      hasDiscrepancy: orphanTransactionsCount > 0,
      discrepancyMessage: orphanTransactionsCount > 0 ? `${orphanTransactionsCount} transactions mismatch branch session!` : null,
      isReviewed: Boolean(savedChecks.branchSession?.reviewed),
      reviewedAt: savedChecks.branchSession?.verifiedAt || null,
      reviewedBy: savedChecks.branchSession?.verifiedBy || null,
      actionRoute: '/branches',
      actionLabel: 'Verify Branch'
    }
  };

  // Determine overall readiness
  const checklistKeys = Object.keys(checklist);
  const allReviewed = checklistKeys.every(k => checklist[k].isReviewed);
  const criticalDiscrepancies = checklistKeys.filter(k => checklist[k].hasDiscrepancy && !savedExceptions[k]);

  res.json({
    success: true,
    branchId: targetBranchId,
    businessDate: dateStr,
    businessDateDisplay: formatDisplayDate(dateStr),
    status: dayCloseRecord?.status || 'NOT_OPENED',
    checklist,
    allReviewed,
    canClose: allReviewed && criticalDiscrepancies.length === 0,
    criticalDiscrepancies,
    savedExceptions,
    expectedClosingCash
  });
});

/**
 * @desc Save progress for checklist verification items
 * @route POST /api/day-close/save-verification
 * @access Private
 */
const saveVerificationProgress = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const { businessDate: inputDateStr, checks } = req.body;

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (existing && (existing.status === 'CLOSED' || existing.status === 'ADMIN_CLOSED')) {
    res.status(400);
    throw new Error('Cannot modify verification checks on a closed business day.');
  }

  const existingChecks = existing?.verificationChecks || {};
  const updatedChecks = { ...existingChecks };

  if (checks && typeof checks === 'object') {
    Object.keys(checks).forEach(key => {
      updatedChecks[key] = {
        reviewed: Boolean(checks[key].reviewed),
        verifiedAt: new Date().toISOString(),
        verifiedBy: req.user.name || req.user.username || 'Staff',
        notes: checks[key].notes || ''
      };
    });
  }

  const updatedRecord = await prisma.dayClose.upsert({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    update: {
      verificationChecks: updatedChecks,
      status: existing?.status === 'NOT_OPENED' ? 'OPEN' : (existing?.status || 'OPEN')
    },
    create: {
      branchId: targetBranchId,
      businessDate: dateUtc,
      status: 'OPEN',
      openedById: req.user.id,
      openedAt: new Date(),
      verificationChecks: updatedChecks
    }
  });

  res.json({
    success: true,
    message: 'Verification progress saved successfully.',
    verificationChecks: updatedRecord.verificationChecks
  });
});

/**
 * @desc Manager/Admin approval for verification exceptions (e.g. approved cash variance or negative stock)
 * @route POST /api/day-close/resolve-exception
 * @access Private (Admin/Manager only)
 */
const resolveException = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only authorized managers or administrators can approve verification exceptions.');
  }

  const targetBranchId = await resolveEffectiveBranchId(req);
  const { businessDate: inputDateStr, exceptionKey, reason } = req.body;

  if (!exceptionKey || !reason?.trim()) {
    res.status(400);
    throw new Error('Exception item key and a valid explanation reason are required.');
  }

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  const existingExceptions = existing?.verificationExceptions || {};
  existingExceptions[exceptionKey] = {
    approved: true,
    reason: reason.trim(),
    approvedById: req.user.id,
    approvedByName: req.user.name || req.user.username,
    approvedAt: new Date().toISOString()
  };

  const updatedRecord = await prisma.dayClose.upsert({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    update: {
      verificationExceptions: existingExceptions,
      exceptionApprovedById: req.user.id,
      exceptionApprovalReason: reason.trim()
    },
    create: {
      branchId: targetBranchId,
      businessDate: dateUtc,
      status: 'OPEN',
      verificationExceptions: existingExceptions,
      exceptionApprovedById: req.user.id,
      exceptionApprovalReason: reason.trim()
    }
  });

  res.json({
    success: true,
    message: `Exception for "${exceptionKey}" approved successfully.`,
    verificationExceptions: updatedRecord.verificationExceptions
  });
});

/**
 * @desc Confirm and Save Day Close with mandatory verification enforcement
 * @route POST /api/day-close/confirm
 * @access Private
 */
const confirmDayClose = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    businessDate: inputDateStr,
    physicalCash: inputPhysicalCash,
    closingDenominations,
    notes,
    overrideChecks
  } = req.body;

  const todayStr = getLocalDateString();
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;

  // Rule 1: Prevent future dates
  if (dateStr > todayStr) {
    res.status(400);
    throw new Error(`Cannot close future business date: ${formatDisplayDate(dateStr)}.`);
  }

  const dateUtc = getUtcDateObj(dateStr);

  // Rule 2: Chronological Check: Verify no earlier date before dateStr is unclosed
  const thirtyDaysAgo = new Date(dateUtc);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const pastSales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: {
        gte: thirtyDaysAgo,
        lt: dateUtc
      },
      status: { not: 'cancelled' }
    },
    select: { saleDate: true },
    orderBy: { saleDate: 'asc' }
  });

  const distinctPastDates = Array.from(new Set(pastSales.map(s => getLocalDateString(s.saleDate))));

  for (const pDateStr of distinctPastDates) {
    const pUtc = getUtcDateObj(pDateStr);
    const existing = await prisma.dayClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: pUtc
        }
      }
    });

    if (!existing || (existing.status !== 'CLOSED' && existing.status !== 'ADMIN_CLOSED')) {
      res.status(400);
      throw new Error(`Day Close Pending! You have not closed the business date ${formatDisplayDate(pDateStr)}. Please complete the pending Day Close before proceeding to a later date.`);
    }
  }

  // Rule 3: Check if already closed
  const existingRecord = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (existingRecord && (existingRecord.status === 'CLOSED' || existingRecord.status === 'ADMIN_CLOSED')) {
    res.status(400);
    throw new Error(`Day Close for ${formatDisplayDate(dateStr)} has already been completed.`);
  }

  // Rule 4: Mandatory Verification Check
  const requiredKeys = ['salesInvoices', 'payments', 'cashbook', 'inventory', 'returnsRefunds', 'gst', 'expenses', 'branchSession'];
  const savedChecks = existingRecord?.verificationChecks || {};
  const savedExceptions = existingRecord?.verificationExceptions || {};

  const missingChecks = requiredKeys.filter(k => !savedChecks[k]?.reviewed);
  if (missingChecks.length > 0 && !overrideChecks) {
    res.status(400);
    throw new Error(`Cannot close day: Mandatory verification checklist is incomplete. Missing: ${missingChecks.join(', ')}.`);
  }

  // Calculate actual financial summary for snapshot
  const startUtc = parseBusinessDateStart(dateStr);
  const endUtc = parseBusinessDateEnd(dateStr);

  const [sales, expenses, negativeStocks] = await Promise.all([
    prisma.sale.findMany({
      where: { branchId: targetBranchId, saleDate: { gte: startUtc, lte: endUtc } },
      include: { items: true, payments: true }
    }),
    prisma.expense.findMany({
      where: { branchId: targetBranchId, date: { gte: startUtc, lte: endUtc } }
    }),
    prisma.productStock.count({
      where: { branchId: targetBranchId, quantity: { lt: 0 } }
    })
  ]);

  // If negative stock exists and no manager approval was recorded, block closing
  if (negativeStocks > 0 && !savedExceptions.inventory) {
    res.status(400);
    throw new Error(`Cannot close day: ${negativeStocks} inventory items have negative stock. A manager must approve this exception.`);
  }

  const completedSales = sales.filter(s => s.status !== 'cancelled' && !s.isReturn);
  const returnSales = sales.filter(s => s.isReturn && s.status !== 'cancelled');
  const cancelledSales = sales.filter(s => s.status === 'cancelled');

  let cashSales = 0;
  completedSales.forEach(s => {
    if (s.payments && s.payments.length > 0) {
      s.payments.forEach(p => {
        if ((p.method || 'Cash').toLowerCase() === 'cash') cashSales += Number(p.amount || 0);
      });
    } else if ((s.paymentMethod || 'Cash').toLowerCase() === 'cash') {
      cashSales += Number(s.paidAmount || s.totalAmount || 0);
    }
  });

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const cashRefunds = returnSales
    .filter(r => (r.paymentMethod || 'Cash').toLowerCase() === 'cash')
    .reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);

  const openingCash = Number(existingRecord?.actualOpeningCash || existingRecord?.openingCash || 0);
  const closingExpectedCash = Number((openingCash + cashSales - totalExpenseAmount - cashRefunds).toFixed(2));
  const expectedClosingCash = closingExpectedCash;

  const physicalCash = inputPhysicalCash !== undefined ? parseFloat(inputPhysicalCash) || 0 : closingExpectedCash;
  const cashDifference = Number((physicalCash - closingExpectedCash).toFixed(2));

  // If cash difference is significant (> ₹10) and no note / manager approval, warn
  if (Math.abs(cashDifference) > 10 && !notes?.trim() && !savedExceptions.cashbook) {
    res.status(400);
    throw new Error(`Cash difference of ₹${cashDifference.toFixed(2)} requires an explanation note or manager approval before closing.`);
  }

  const salesSummary = {
    totalInvoices: completedSales.length,
    cancelledInvoices: cancelledSales.length,
    returnsCount: returnSales.length,
    grossSales: completedSales.reduce((sum, s) => sum + Number(s.subTotal || 0), 0),
    totalDiscounts: completedSales.reduce((sum, s) => sum + Number(s.discount || 0) + Number(s.voucherDiscount || 0), 0),
    taxTotal: completedSales.reduce((sum, s) => sum + Number(s.taxAmount || 0), 0),
    netSales: completedSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
    cashCollections: cashSales,
    totalExpenses: totalExpenseAmount,
    openingCash,
    expectedClosingCash,
    physicalCash,
    cashDifference
  };

  // Save Day Close record as CLOSED
  const dayCloseRecord = await prisma.dayClose.upsert({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    update: {
      status: 'CLOSED',
      closingExpectedCash,
      physicalCash,
      cashDifference,
      closingDenominations: closingDenominations || null,
      salesSummary,
      notes: notes || null,
      finalizedById: req.user.id,
      finalizedAt: new Date()
    },
    create: {
      branchId: targetBranchId,
      businessDate: dateUtc,
      status: 'CLOSED',
      openingCash,
      closingExpectedCash,
      physicalCash,
      cashDifference,
      closingDenominations: closingDenominations || null,
      salesSummary,
      notes: notes || null,
      finalizedById: req.user.id,
      finalizedAt: new Date()
    },
    include: {
      finalizedBy: { select: { id: true, name: true, username: true } },
      branch: { select: { id: true, name: true } }
    }
  });

  res.json({
    success: true,
    message: `Day Close for ${formatDisplayDate(dateStr)} saved successfully.`,
    dayClose: dayCloseRecord
  });
});

/**
 * @desc Find all unclosed business days for authorized user
 * @route GET /api/day-close/open-days
 * @access Private
 */
const findOpenDays = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const { fromDate, toDate, status } = req.query;

  const todayStr = getLocalDateString();
  const todayUtc = getUtcDateObj(todayStr);

  const sixtyDaysAgo = new Date(todayUtc);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const startUtc = fromDate ? getUtcDateObj(fromDate) : sixtyDaysAgo;
  const endUtc = toDate ? getUtcDateObj(toDate) : todayUtc;

  // 1. Find all sales within the range to find dates with activity
  const sales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: {
        gte: startUtc,
        lte: endUtc
      },
      status: { not: 'cancelled' }
    },
    select: {
      saleDate: true,
      totalAmount: true,
      paidAmount: true,
      paymentMethod: true,
      salesmanId: true
    }
  });

  // Group sales by business date string
  const salesByDate = {};
  sales.forEach(s => {
    const dStr = getLocalDateString(s.saleDate);
    if (!salesByDate[dStr]) {
      salesByDate[dStr] = {
        salesCount: 0,
        totalSales: 0,
        cashCollections: 0
      };
    }
    salesByDate[dStr].salesCount += 1;
    salesByDate[dStr].totalSales += Number(s.totalAmount || 0);
    if ((s.paymentMethod || 'Cash').toLowerCase() === 'cash') {
      salesByDate[dStr].cashCollections += Number(s.paidAmount || s.totalAmount || 0);
    }
  });

  // 2. Find DayClose records for these dates
  const dayCloseRecords = await prisma.dayClose.findMany({
    where: {
      branchId: targetBranchId,
      businessDate: {
        gte: startUtc,
        lte: endUtc
      }
    },
    include: {
      branch: { select: { id: true, name: true } },
      openedBy: { select: { id: true, name: true, username: true } },
      terminal: { select: { id: true, name: true } }
    }
  });

  const dayCloseByDate = {};
  dayCloseRecords.forEach(dc => {
    const dStr = getLocalDateString(dc.businessDate);
    dayCloseByDate[dStr] = dc;
  });

  // Combine all distinct dates
  const allDistinctDates = Array.from(new Set([
    ...Object.keys(salesByDate),
    ...Object.keys(dayCloseByDate),
    todayStr
  ])).sort((a, b) => b.localeCompare(a)); // Descending order

  const openDaysList = [];

  for (const dStr of allDistinctDates) {
    const dc = dayCloseByDate[dStr];
    const sInfo = salesByDate[dStr] || { salesCount: 0, totalSales: 0, cashCollections: 0 };

    const isClosed = dc && (dc.status === 'CLOSED' || dc.status === 'ADMIN_CLOSED');
    if (isClosed) continue; // Skip closed days

    let sessionStatus = 'NOT_OPENED';
    if (dc?.status === 'OPEN') sessionStatus = 'OPEN';
    else if (dc?.status === 'CLOSING_PENDING') sessionStatus = 'CLOSING_PENDING';
    else if (sInfo.salesCount > 0) sessionStatus = 'CLOSING_PENDING';

    if (status && status !== 'all' && sessionStatus !== status) {
      continue;
    }

    const openingCash = Number(dc?.actualOpeningCash || dc?.openingCash || 0);
    const expectedCash = Number((openingCash + sInfo.cashCollections).toFixed(2));

    openDaysList.push({
      businessDate: dStr,
      businessDateDisplay: formatDisplayDate(dStr),
      branchId: targetBranchId,
      branchName: dc?.branch?.name || 'Main Branch',
      cashier: dc?.openedBy ? (dc.openedBy.name || dc.openedBy.username) : 'Unassigned',
      register: dc?.terminal?.name || 'Default Register',
      openingTime: dc?.openedAt || null,
      openingCash,
      salesCount: sInfo.salesCount,
      totalSales: sInfo.totalSales,
      cashCollections: sInfo.cashCollections,
      expectedCash,
      currentStatus: sessionStatus,
      isPendingClosure: dStr < todayStr && sInfo.salesCount > 0,
      action: sessionStatus === 'NOT_OPENED' ? 'Open Day' : 'Resume Closing'
    });
  }

  res.json({
    success: true,
    total: openDaysList.length,
    openDays: openDaysList
  });
});

/**
 * @desc Global check for unclosed day close warning (for layout banner)
 * @route GET /api/day-close/check-unclosed
 * @access Private
 */
const checkUnclosed = asyncHandler(async (req, res) => {
  let targetBranchId;
  try {
    targetBranchId = await resolveEffectiveBranchId(req);
  } catch (e) {
    return res.json({ hasUnclosed: false, unclosedDate: null });
  }

  const todayStr = getLocalDateString();
  const todayUtc = getUtcDateObj(todayStr);

  const thirtyDaysAgo = new Date(todayUtc);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const pastSales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: {
        gte: thirtyDaysAgo,
        lt: todayUtc
      },
      status: { not: 'cancelled' }
    },
    select: { saleDate: true },
    orderBy: { saleDate: 'asc' }
  });

  const distinctPastDates = Array.from(new Set(pastSales.map(s => getLocalDateString(s.saleDate))));

  for (const pDateStr of distinctPastDates) {
    const pUtc = getUtcDateObj(pDateStr);
    const existing = await prisma.dayClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: pUtc
        }
      }
    });

    if (!existing || (existing.status !== 'CLOSED' && existing.status !== 'ADMIN_CLOSED')) {
      return res.json({
        hasUnclosed: true,
        unclosedDate: pDateStr,
        unclosedDateDisplay: formatDisplayDate(pDateStr),
        message: `Day Close Pending! You have not closed the business date ${formatDisplayDate(pDateStr)}. Please complete the pending Day Close before proceeding to a later date.`
      });
    }
  }

  res.json({ hasUnclosed: false, unclosedDate: null });
});

/**
 * @desc Get Day Close History
 * @route GET /api/day-close/history
 * @access Private
 */
const getDayCloseHistory = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const where = {};
  if (targetBranchId) where.branchId = targetBranchId;

  const [total, records] = await Promise.all([
    prisma.dayClose.count({ where }),
    prisma.dayClose.findMany({
      where,
      include: {
        openedBy: { select: { id: true, name: true, username: true } },
        finalizedBy: { select: { id: true, name: true, username: true } },
        branch: { select: { id: true, name: true } },
        terminal: { select: { id: true, name: true } }
      },
      orderBy: { businessDate: 'desc' },
      skip,
      take: limit
    })
  ]);

  res.json({
    success: true,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    records
  });
});

module.exports = {
  getDayCloseStatus,
  openDay,
  getVerificationData,
  saveVerificationProgress,
  resolveException,
  confirmDayClose,
  findOpenDays,
  checkUnclosed,
  getDayCloseHistory
};
