const prisma = require('../config/prisma');
const {
  getLocalDateString,
  getUtcDateObj,
  formatDisplayDate
} = require('./businessDateHelper');

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

/**
 * Finds the immediately preceding valid closed business session for the branch/register.
 */
async function findPreviousClosedSession(branchId, beforeDateUtc, terminalId = null) {
  if (!branchId || !beforeDateUtc) {
    return { exists: false, session: null, closingCash: null };
  }

  const baseWhere = {
    branchId: parseInt(branchId),
    status: { in: ['CLOSED', 'ADMIN_CLOSED'] },
    businessDate: { lt: beforeDateUtc }
  };

  let previousClosedDay = null;

  if (terminalId) {
    // 1. Look for immediately preceding closed session for this specific terminal
    previousClosedDay = await prisma.dayClose.findFirst({
      where: {
        ...baseWhere,
        terminalId: parseInt(terminalId)
      },
      orderBy: { businessDate: 'desc' },
      include: {
        finalizedBy: { select: { id: true, name: true, username: true } },
        openedBy: { select: { id: true, name: true, username: true } },
        terminal: { select: { id: true, name: true, terminalCode: true } }
      }
    });
  }

  // 2. If no terminal-specific closed session found, look for branch session (terminalId: null)
  if (!previousClosedDay) {
    previousClosedDay = await prisma.dayClose.findFirst({
      where: {
        ...baseWhere,
        terminalId: null
      },
      orderBy: { businessDate: 'desc' },
      include: {
        finalizedBy: { select: { id: true, name: true, username: true } },
        openedBy: { select: { id: true, name: true, username: true } },
        terminal: { select: { id: true, name: true, terminalCode: true } }
      }
    });
  }

  if (!previousClosedDay) {
    return { exists: false, session: null, closingCash: null };
  }

  const closingCash = previousClosedDay.physicalCash !== null && previousClosedDay.physicalCash !== undefined
    ? Number(previousClosedDay.physicalCash)
    : (previousClosedDay.closingExpectedCash !== null && previousClosedDay.closingExpectedCash !== undefined
        ? Number(previousClosedDay.closingExpectedCash)
        : null);

  const prevDateStr = getLocalDateString(previousClosedDay.businessDate);

  return {
    exists: true,
    session: previousClosedDay,
    id: previousClosedDay.id,
    closingCash,
    businessDateStr: prevDateStr,
    businessDateDisplay: formatDisplayDate(prevDateStr),
    finalizedByName: previousClosedDay.finalizedBy ? (previousClosedDay.finalizedBy.name || previousClosedDay.finalizedBy.username) : 'System',
    finalizedAt: previousClosedDay.finalizedAt
  };
}

/**
 * Decimal-safe session cash drawer calculation.
 * Follows: Expected Closing Balance = Opening Balance + Cash Receipts - Cash Payments + Cash Transfers In - Cash Transfers Out.
 */
async function calculateSessionCashDrawer(branchId, businessDateStr, terminalId = null) {
  const targetBranchId = parseInt(branchId);
  const dateUtc = getUtcDateObj(businessDateStr);
  const startUtc = parseBusinessDateStart(businessDateStr);
  const endUtc = parseBusinessDateEnd(businessDateStr);

  // 1. Fetch current DayClose record
  const dayClose = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    include: {
      openedBy: { select: { id: true, name: true, username: true } },
      openingApprovedBy: { select: { id: true, name: true, username: true } },
      finalizedBy: { select: { id: true, name: true, username: true } },
      exceptionApprovedBy: { select: { id: true, name: true, username: true } },
      terminal: { select: { id: true, name: true, terminalCode: true } }
    }
  });

  // 2. Find immediately preceding closed business session
  const prevSession = await findPreviousClosedSession(targetBranchId, dateUtc, terminalId);

  // 3. Opening Balances
  let openingCash = 0;
  let previousClosingCash = null;
  let additionalCashAdded = 0;
  let cashRemovedBeforeOpening = 0;
  let expectedOpeningCash = 0;
  let actualOpeningCash = 0;
  let openingDifference = 0;

  if (dayClose) {
    actualOpeningCash = Number(dayClose.actualOpeningCash ?? dayClose.openingCash ?? 0);
    openingCash = actualOpeningCash;
    previousClosingCash = dayClose.previousClosingCash !== null && dayClose.previousClosingCash !== undefined
      ? Number(dayClose.previousClosingCash)
      : (prevSession.closingCash !== null ? prevSession.closingCash : 0);
    additionalCashAdded = Number(dayClose.additionalCashAdded ?? 0);
    cashRemovedBeforeOpening = Number(dayClose.cashRemovedBeforeOpening ?? 0);
    expectedOpeningCash = Number((previousClosingCash + additionalCashAdded - cashRemovedBeforeOpening).toFixed(2));
    openingDifference = Number((actualOpeningCash - expectedOpeningCash).toFixed(2));
  } else {
    previousClosingCash = prevSession.closingCash;
    expectedOpeningCash = previousClosingCash !== null ? previousClosingCash : 0;
    actualOpeningCash = expectedOpeningCash;
    openingCash = actualOpeningCash;
    openingDifference = 0;
  }

  // Check for prior-day closing discrepancy (if Day 1 closing was adjusted after Day 2 was opened)
  let hasPriorDayDiscrepancy = false;
  let priorDayDiscrepancyAmount = 0;
  let priorDayCurrentClosingCash = null;
  let priorDayRecordedClosingCash = null;

  if (dayClose && prevSession.exists && prevSession.closingCash !== null) {
    priorDayCurrentClosingCash = prevSession.closingCash;
    priorDayRecordedClosingCash = Number(dayClose.previousClosingCash ?? 0);
    if (Math.abs(priorDayCurrentClosingCash - priorDayRecordedClosingCash) > 0.01) {
      hasPriorDayDiscrepancy = true;
      priorDayDiscrepancyAmount = Number((priorDayCurrentClosingCash - priorDayRecordedClosingCash).toFixed(2));
    }
  }

  // 4. Cash Sales Collections
  const sales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: { gte: startUtc, lte: endUtc },
      status: { not: 'cancelled' },
      isReturn: false
    },
    include: {
      payments: true,
      customer: { select: { id: true, name: true, phone: true } },
      salesman: { select: { id: true, name: true, username: true } },
      items: { include: { product: { select: { id: true, name: true, barcode: true } } } }
    },
    orderBy: { createdAt: 'asc' }
  });

  let cashSalesCollections = 0;
  const todaySaleIds = new Set();
  const salesCashList = [];

  sales.forEach(s => {
    todaySaleIds.add(s.id);
    let saleCash = 0;
    if (s.payments && s.payments.length > 0) {
      s.payments.forEach(p => {
        if ((p.method || 'Cash').toLowerCase() === 'cash') {
          saleCash += Number(p.amount || 0);
        }
      });
    } else if ((s.paymentMethod || 'Cash').toLowerCase() === 'cash') {
      const actualPaid = s.paidAmount !== null && s.paidAmount !== undefined
        ? Number(s.paidAmount)
        : (s.status === 'completed' ? Number(s.totalAmount || 0) : 0);
      saleCash += actualPaid;
    }

    if (saleCash > 0) {
      cashSalesCollections += saleCash;
      salesCashList.push({
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customer?.name || 'Walk-in',
        cashAmount: saleCash,
        totalAmount: Number(s.totalAmount),
        createdAt: s.createdAt
      });
    }
  });

  // 5. Other Cash Receipts / Collections Against Previous Invoices / Advances
  const standalonePayments = await prisma.payment.findMany({
    where: {
      branchId: targetBranchId,
      paymentDate: { gte: startUtc, lte: endUtc },
      type: 'receipt',
      method: { equals: 'Cash', mode: 'insensitive' }
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      sale: { select: { id: true, invoiceNumber: true, saleDate: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  let otherCashReceipts = 0;
  const otherReceiptsList = [];

  standalonePayments.forEach(p => {
    // Avoid double counting if already included in today's sale payments
    if (p.saleId && todaySaleIds.has(p.saleId)) return;

    const amt = Number(p.amount || 0);
    otherCashReceipts += amt;
    otherReceiptsList.push({
      id: p.id,
      amount: amt,
      partyName: p.customer?.name || 'Customer',
      reference: p.reference || (p.sale ? `Invoice #${p.sale.invoiceNumber}` : `REC-${p.id}`),
      description: p.description || 'Cash receipt against invoice/credit',
      date: p.paymentDate
    });
  });

  // 6. Cash Refunds (Returns paid in Cash)
  const returnSales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: { gte: startUtc, lte: endUtc },
      status: { not: 'cancelled' },
      isReturn: true
    },
    include: {
      customer: { select: { id: true, name: true } },
      items: true
    },
    orderBy: { createdAt: 'asc' }
  });

  let cashRefunds = 0;
  const refundList = [];

  returnSales.forEach(r => {
    if ((r.paymentMethod || 'Cash').toLowerCase() === 'cash') {
      const amt = Number(r.totalAmount || 0);
      cashRefunds += amt;
      refundList.push({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        originalInvoice: r.originalInvoice,
        amount: amt,
        reason: r.returnReason || 'Product Return',
        customerName: r.customer?.name || 'Walk-in',
        date: r.createdAt
      });
    }
  });

  // 7. Cash Expenses
  const expenses = await prisma.expense.findMany({
    where: {
      branchId: targetBranchId,
      date: { gte: startUtc, lte: endUtc }
    },
    orderBy: { createdAt: 'asc' }
  });

  let cashExpenses = 0;
  const expenseList = [];

  expenses.forEach(e => {
    const amt = Number(e.amount || 0);
    cashExpenses += amt;
    expenseList.push({
      id: e.id,
      title: e.title,
      category: e.category || 'General',
      amount: amt,
      description: e.description,
      date: e.date
    });
  });

  // 8. Supplier Payments Made in Cash
  const supplierPayments = await prisma.payment.findMany({
    where: {
      branchId: targetBranchId,
      paymentDate: { gte: startUtc, lte: endUtc },
      type: 'payment',
      method: { equals: 'Cash', mode: 'insensitive' }
    },
    include: {
      supplier: { select: { id: true, name: true, phone: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  let supplierCashPayments = 0;
  const supplierPaymentList = [];

  supplierPayments.forEach(p => {
    const amt = Number(p.amount || 0);
    supplierCashPayments += amt;
    supplierPaymentList.push({
      id: p.id,
      amount: amt,
      partyName: p.supplier?.name || 'Supplier',
      reference: p.reference || `PAY-${p.id}`,
      description: p.description || 'Supplier cash payment',
      date: p.paymentDate
    });
  });

  // 9. Cash Transfers In / Out (Contra Vouchers / Bank Deposits / Cash Withdrawals)
  let transfersIn = 0;
  let transfersOut = 0;
  const transferEntriesList = [];

  const cashLedger = await prisma.ledger.findFirst({
    where: { name: { equals: 'Cash', mode: 'insensitive' } }
  });

  if (cashLedger) {
    const contraEntries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { debitLedgerId: cashLedger.id },
          { creditLedgerId: cashLedger.id }
        ],
        voucher: {
          branchId: targetBranchId,
          status: 'POSTED',
          voucherType: 'CONTRA',
          date: { gte: startUtc, lte: endUtc }
        }
      },
      include: {
        voucher: true,
        debitLedger: { select: { id: true, name: true } },
        creditLedger: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    contraEntries.forEach(entry => {
      const amt = Number(entry.amount || 0);
      const isCashIn = entry.debitLedgerId === cashLedger.id;
      if (isCashIn) {
        transfersIn += amt;
        transferEntriesList.push({
          id: entry.id,
          direction: 'IN',
          type: 'Cash Withdrawal / Transfer In',
          amount: amt,
          voucherNumber: entry.voucher.voucherNumber,
          narration: entry.voucher.narration || entry.description,
          source: entry.creditLedger?.name || 'Bank',
          date: entry.voucher.date
        });
      } else {
        transfersOut += amt;
        transferEntriesList.push({
          id: entry.id,
          direction: 'OUT',
          type: 'Bank Deposit / Transfer Out',
          amount: amt,
          voucherNumber: entry.voucher.voucherNumber,
          narration: entry.voucher.narration || entry.description,
          destination: entry.debitLedger?.name || 'Bank',
          date: entry.voucher.date
        });
      }
    });
  }

  // 10. Financial Aggregates
  const totalCashReceived = Number((cashSalesCollections + otherCashReceipts).toFixed(2));
  const totalCashPaid = Number((cashExpenses + cashRefunds + supplierCashPayments).toFixed(2));
  const netTransfers = Number((transfersIn - transfersOut).toFixed(2));

  const expectedClosingCash = Number(
    (openingCash + totalCashReceived - totalCashPaid + transfersIn - transfersOut).toFixed(2)
  );

  const physicalCash = dayClose?.physicalCash !== null && dayClose?.physicalCash !== undefined
    ? Number(dayClose.physicalCash)
    : null;

  const cashDifference = physicalCash !== null
    ? Number((physicalCash - expectedClosingCash).toFixed(2))
    : null;

  const isClosed = dayClose && (dayClose.status === 'CLOSED' || dayClose.status === 'ADMIN_CLOSED');
  const isClosingPending = dayClose && dayClose.status === 'CLOSING_PENDING';

  let currentStatus = isClosed ? 'CLOSED' : (isClosingPending ? 'CLOSING_PENDING' : 'OPEN');

  return {
    branchId: targetBranchId,
    businessDate: businessDateStr,
    businessDateDisplay: formatDisplayDate(businessDateStr),
    status: currentStatus,
    dayCloseId: dayClose?.id || null,
    terminalId: dayClose?.terminalId || null,
    terminalName: dayClose?.terminal?.name || null,

    // Opening Details
    openingCash,
    previousClosingCash,
    previousClosingDate: prevSession.businessDateStr || null,
    previousClosingDateDisplay: prevSession.businessDateDisplay || null,
    previousClosingId: prevSession.id || null,
    hasPreviousClosedDay: prevSession.exists && prevSession.closingCash !== null,
    additionalCashAdded,
    cashRemovedBeforeOpening,
    expectedOpeningCash,
    actualOpeningCash,
    openingDifference,
    openingDiscrepancyReason: dayClose?.openingDiscrepancyReason || null,
    openedAt: dayClose?.openedAt || null,
    openedBy: dayClose?.openedBy ? (dayClose.openedBy.name || dayClose.openedBy.username) : null,
    openingApprovedBy: dayClose?.openingApprovedBy ? (dayClose.openingApprovedBy.name || dayClose.openingApprovedBy.username) : null,
    openingRemarks: dayClose?.openingRemarks || null,
    openingDenominations: dayClose?.openingDenominations || null,

    // Prior-Day Discrepancy (if prior closing was modified after this day opened)
    hasPriorDayDiscrepancy,
    priorDayDiscrepancyAmount,
    priorDayCurrentClosingCash,
    priorDayRecordedClosingCash,

    // Cash Drawer Receipts
    cashSalesCollections: Number(cashSalesCollections.toFixed(2)),
    otherCashReceipts: Number(otherCashReceipts.toFixed(2)),
    totalCashReceived,
    salesCashList,
    otherReceiptsList,

    // Cash Drawer Payments
    cashExpenses: Number(cashExpenses.toFixed(2)),
    cashRefunds: Number(cashRefunds.toFixed(2)),
    supplierCashPayments: Number(supplierCashPayments.toFixed(2)),
    cashSupplierPayments: Number(supplierCashPayments.toFixed(2)),
    totalCashPaid,
    expenseList,
    refundList,
    supplierPaymentList,

    // Cash Transfers
    transfersIn: Number(transfersIn.toFixed(2)),
    transfersOut: Number(transfersOut.toFixed(2)),
    netTransfers,
    transferEntriesList,

    // Closing Balances
    expectedClosingCash,
    physicalCash,
    cashDifference,
    closingDenominations: dayClose?.closingDenominations || null,
    notes: dayClose?.notes || null,
    finalizedAt: dayClose?.finalizedAt || null,
    finalizedBy: dayClose?.finalizedBy ? (dayClose.finalizedBy.name || dayClose.finalizedBy.username) : null,

    // Adjustments / Audit History
    adjustments: Array.isArray(dayClose?.adjustments) ? dayClose.adjustments : [],

    // Raw records
    dayCloseRecord: dayClose
  };
}

module.exports = {
  findPreviousClosedSession,
  calculateSessionCashDrawer,
  parseBusinessDateStart,
  parseBusinessDateEnd
};
