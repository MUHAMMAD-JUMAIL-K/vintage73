const prisma = require('../config/prisma');
const { calculateLedgerBalance } = require('./accountingController');
const asyncHandler = require('../middleware/asyncHandler');
const { resolveBranchFilter } = require('../utils/accountingHelper');

// ==================== TRIAL BALANCE ====================

exports.getTrialBalance = asyncHandler(async (req, res) => {
  const { startDate, endDate, branchId: requestedBranchId } = req.query;
  const { branchId, isConsolidated, activeBranch, branches, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  const ledgers = await prisma.ledger.findMany({
    where: { isActive: true },
    include: { group: true },
    orderBy: { name: 'asc' }
  });

  const baseVoucherWhere = {
    status: 'POSTED',
    ...branchFilter
  };

  // 1. Get Pre-Period Totals (Opening Balances)
  const preDebits = await prisma.journalEntry.groupBy({
    by: ['debitLedgerId'],
    _sum: { amount: true },
    where: {
      debitLedgerId: { not: null },
      voucher: { ...baseVoucherWhere, ...(start ? { date: { lt: start } } : { id: -1 }) }
    }
  });

  const preCredits = await prisma.journalEntry.groupBy({
    by: ['creditLedgerId'],
    _sum: { amount: true },
    where: {
      creditLedgerId: { not: null },
      voucher: { ...baseVoucherWhere, ...(start ? { date: { lt: start } } : { id: -1 }) }
    }
  });

  // 2. Get Period Totals
  const periodDebits = await prisma.journalEntry.groupBy({
    by: ['debitLedgerId'],
    _sum: { amount: true },
    where: {
      debitLedgerId: { not: null },
      voucher: {
        ...baseVoucherWhere,
        date: { gte: start || new Date(0), lte: end }
      }
    }
  });

  const periodCredits = await prisma.journalEntry.groupBy({
    by: ['creditLedgerId'],
    _sum: { amount: true },
    where: {
      creditLedgerId: { not: null },
      voucher: {
        ...baseVoucherWhere,
        date: { gte: start || new Date(0), lte: end }
      }
    }
  });

  // Helper maps for quick lookup
  const preDebMap = new Map(preDebits.map(i => [i.debitLedgerId, Number(i._sum.amount || 0)]));
  const preCredMap = new Map(preCredits.map(i => [i.creditLedgerId, Number(i._sum.amount || 0)]));
  const perDebMap = new Map(periodDebits.map(i => [i.debitLedgerId, Number(i._sum.amount || 0)]));
  const perCredMap = new Map(periodCredits.map(i => [i.creditLedgerId, Number(i._sum.amount || 0)]));

  const trialBalance = ledgers.map(ledger => {
    const preDeb = preDebMap.get(ledger.id) || 0;
    const preCred = preCredMap.get(ledger.id) || 0;
    const perDeb = perDebMap.get(ledger.id) || 0;
    const perCred = perCredMap.get(ledger.id) || 0;

    let openingBalance = isConsolidated ? Number(ledger.openingBalance) : 0;
    if (start) {
      if (ledger.balanceType === 'DEBIT') {
        openingBalance += preDeb - preCred;
      } else {
        openingBalance += preCred - preDeb;
      }
    }

    const debitValue = perDeb;
    const creditValue = perCred;

    let closingBalance = 0;
    if (ledger.balanceType === 'DEBIT') {
      closingBalance = openingBalance + debitValue - creditValue;
    } else {
      closingBalance = openingBalance + creditValue - debitValue;
    }

    return {
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      groupName: ledger.group.name,
      groupType: ledger.group.groupType,
      balanceType: ledger.balanceType,
      openingBalance: Math.round(openingBalance * 100) / 100,
      debit: Math.round(debitValue * 100) / 100,
      credit: Math.round(creditValue * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100
    };
  });

  const filteredResults = trialBalance.filter(item =>
    Math.abs(item.openingBalance) > 0.01 ||
    item.debit > 0 ||
    item.credit > 0 ||
    Math.abs(item.closingBalance) > 0.01
  );

  const totalDebit = filteredResults.reduce((sum, i) => sum + i.debit, 0);
  const totalCredit = filteredResults.reduce((sum, i) => sum + i.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.05;

  let currencyBreakdown = null;
  if (isConsolidated) {
    const currencyTotals = {};
    for (const b of (branches || [])) {
      const bCode = b.currencyCode || 'INR';
      if (!currencyTotals[bCode]) {
        currencyTotals[bCode] = {
          currencyCode: bCode,
          currencySymbol: b.currencySymbol || '₹',
          branchNames: [b.name],
          totalDebit: 0,
          totalCredit: 0
        };
      } else {
        currencyTotals[bCode].branchNames.push(b.name);
      }
    }

    const vouchersByBranch = await prisma.voucher.groupBy({
      by: ['branchId'],
      _sum: { totalAmount: true },
      where: {
        status: 'POSTED',
        date: { gte: start || new Date(0), lte: end }
      }
    });

    for (const vb of vouchersByBranch) {
      const b = (branches || []).find(br => br.id === vb.branchId);
      const bCode = b?.currencyCode || 'INR';
      if (currencyTotals[bCode]) {
        currencyTotals[bCode].totalDebit += Number(vb._sum.totalAmount || 0);
        currencyTotals[bCode].totalCredit += Number(vb._sum.totalAmount || 0);
      }
    }
    currencyBreakdown = Object.values(currencyTotals);
  }

  res.json({
    trialBalance: filteredResults,
    totalOpening: Math.round(filteredResults.reduce((sum, i) => sum + i.openingBalance, 0) * 100) / 100,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    totalClosing: Math.round(filteredResults.reduce((sum, i) => sum + i.closingBalance, 0) * 100) / 100,
    balanced: isBalanced,
    branch: activeBranch,
    isConsolidated,
    currency: activeBranch ? {
      code: activeBranch.currencyCode || 'INR',
      symbol: activeBranch.currencySymbol || '₹'
    } : { code: 'INR', symbol: '₹' },
    currencyBreakdown
  });
});

// ==================== PROFIT & LOSS ====================

exports.getProfitLoss = asyncHandler(async (req, res) => {
  const { startDate, endDate, branchId: requestedBranchId } = req.query;
  const { branchId, isConsolidated, activeBranch, branches, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Get all income and expense ledgers
  const ledgers = await prisma.ledger.findMany({
    where: {
      isActive: true,
      group: { groupType: { in: ['INCOME', 'EXPENSES'] } }
    },
    include: { group: true }
  });

  const baseVoucherWhere = {
    status: 'POSTED',
    ...branchFilter,
    date: { gte: start || new Date(0), lte: end }
  };

  // Calculate balances in bulk
  const [debitSums, creditSums] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ['debitLedgerId'],
      _sum: { amount: true },
      where: {
        debitLedgerId: { in: ledgers.map(l => l.id) },
        voucher: baseVoucherWhere
      }
    }),
    prisma.journalEntry.groupBy({
      by: ['creditLedgerId'],
      _sum: { amount: true },
      where: {
        creditLedgerId: { in: ledgers.map(l => l.id) },
        voucher: baseVoucherWhere
      }
    })
  ]);

  const debMap = new Map(debitSums.map(s => [s.debitLedgerId, Number(s._sum.amount || 0)]));
  const credMap = new Map(creditSums.map(s => [s.creditLedgerId, Number(s._sum.amount || 0)]));

  const incomeItems = [];
  const expenseItems = [];

  for (const ledger of ledgers) {
    const totalDebit = debMap.get(ledger.id) || 0;
    const totalCredit = credMap.get(ledger.id) || 0;

    let balance = 0;
    // For P&L, we usually only care about the net movement in the period
    // If opening balance should be included (e.g., retained earnings), it's handled differently.
    // Standard P&L is just period transactions.
    if (ledger.balanceType === 'DEBIT') {
      balance = totalDebit - totalCredit;
    } else {
      balance = totalCredit - totalDebit;
    }

    if (Math.abs(balance) > 0.01) {
      const item = {
        ledgerId: ledger.id,
        ledgerName: ledger.name,
        groupName: ledger.group.name,
        amount: Math.round(balance * 100) / 100
      };

      if (ledger.group.groupType === 'INCOME') {
        incomeItems.push(item);
      } else {
        expenseItems.push(item);
      }
    }
  }

  const totalIncome = Math.round(incomeItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const totalExpenses = Math.round(expenseItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;

  res.json({
    income: incomeItems,
    expenses: expenseItems,
    totalIncome,
    totalExpenses,
    netProfit,
    isProfitable: netProfit >= 0,
    branch: activeBranch,
    isConsolidated,
    currency: activeBranch ? {
      code: activeBranch.currencyCode || 'INR',
      symbol: activeBranch.currencySymbol || '₹'
    } : { code: 'INR', symbol: '₹' }
  });
});

// ==================== BALANCE SHEET ====================

exports.getBalanceSheet = asyncHandler(async (req, res) => {
  const { asOfDate, branchId: requestedBranchId } = req.query;
  const { branchId, isConsolidated, activeBranch, branches, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const end = asOfDate ? new Date(asOfDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Get all asset, liability, and equity ledgers
  const ledgers = await prisma.ledger.findMany({
    where: {
      isActive: true,
      group: { groupType: { in: ['ASSETS', 'LIABILITIES', 'EQUITY'] } }
    },
    include: { group: true }
  });

  const baseVoucherWhere = {
    status: 'POSTED',
    ...branchFilter,
    date: { lte: end }
  };

  const [debitSums, creditSums] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ['debitLedgerId'],
      _sum: { amount: true },
      where: {
        debitLedgerId: { in: ledgers.map(l => l.id) },
        voucher: baseVoucherWhere
      }
    }),
    prisma.journalEntry.groupBy({
      by: ['creditLedgerId'],
      _sum: { amount: true },
      where: {
        creditLedgerId: { in: ledgers.map(l => l.id) },
        voucher: baseVoucherWhere
      }
    })
  ]);

  const debMap = new Map(debitSums.map(s => [s.debitLedgerId, Number(s._sum.amount || 0)]));
  const credMap = new Map(creditSums.map(s => [s.creditLedgerId, Number(s._sum.amount || 0)]));

  const assets = [];
  const liabilities = [];
  const equity = [];

  for (const ledger of ledgers) {
    const totalDebit = debMap.get(ledger.id) || 0;
    const totalCredit = credMap.get(ledger.id) || 0;

    let balance = isConsolidated ? Number(ledger.openingBalance) : 0;
    if (ledger.balanceType === 'DEBIT') {
      balance = balance + totalDebit - totalCredit;
    } else {
      balance = balance + totalCredit - totalDebit;
    }

    if (Math.abs(balance) > 0.01) {
      const item = {
        ledgerId: ledger.id,
        ledgerName: ledger.name,
        groupName: ledger.group.name,
        amount: Math.round(balance * 100) / 100
      };

      if (ledger.group.groupType === 'ASSETS') {
        assets.push(item);
      } else if (ledger.group.groupType === 'LIABILITIES') {
        liabilities.push(item);
      } else {
        equity.push(item);
      }
    }
  }

  // Calculate P&L (net profit) as of Date with branchFilter
  const plResult = await getProfitLossData(end, branchFilter);
  if (plResult.netProfit !== 0) {
    equity.push({
      ledgerId: null,
      ledgerName: plResult.netProfit >= 0 ? 'Net Profit (Current Period)' : 'Net Loss (Current Period)',
      groupName: 'Equity',
      amount: Math.abs(plResult.netProfit),
      isLoss: plResult.netProfit < 0
    });
  }

  const totalAssets = Math.round(assets.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const totalLiabilities = Math.round(liabilities.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

  const totalEquity = Math.round(equity.reduce((sum, item) => {
    if (item.ledgerName.includes('Net Loss')) return sum - item.amount;
    return sum + item.amount;
  }, 0) * 100) / 100;

  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.05;

  res.json({
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced,
    difference: Math.round((totalAssets - (totalLiabilities + totalEquity)) * 100) / 100,
    branch: activeBranch,
    isConsolidated,
    currency: activeBranch ? {
      code: activeBranch.currencyCode || 'INR',
      symbol: activeBranch.currencySymbol || '₹'
    } : { code: 'INR', symbol: '₹' }
  });
});

// ==================== LEDGER STATEMENT ====================

exports.getLedgerStatement = asyncHandler(async (req, res) => {
  const { ledgerId, startDate, endDate, branchId: requestedBranchId } = req.query;
  const { branchId, isConsolidated, activeBranch, branches, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  if (!ledgerId) {
    res.status(400);
    throw new Error('Ledger ID is required');
  }

  const ledger = await prisma.ledger.findUnique({
    where: { id: parseInt(ledgerId) },
    include: { group: true }
  });

  if (!ledger) {
    res.status(404);
    throw new Error('Ledger not found');
  }

  if (req.query.isCashBook === 'true') {
    return exports.getCashBook(req, res);
  }

  // Check if this ledger corresponds to a Customer / Sundry Debtors
  const customer = await prisma.customer.findFirst({
    where: { name: ledger.name }
  });
  const isCustomerLedger = Boolean(customer || ledger.group?.name === 'Sundry Debtors');

  const start = startDate ? new Date(startDate) : null;
  let end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  if (isCustomerLedger && customer) {
    // ----------------------------------------------------
    // CUSTOMER LEDGER STATEMENT LOGIC
    // ----------------------------------------------------
    let openingBalance = parseFloat(ledger.openingBalance || 0);

    const allCustomerSales = await prisma.sale.findMany({
      where: { customerId: customer.id, status: { not: 'cancelled' } },
      select: { invoiceNumber: true }
    });
    const customerInvoiceNumbers = allCustomerSales.map(s => s.invoiceNumber).filter(Boolean);

    if (start) {
      // Prior sales for this customer (saleDate before start)
      const priorSales = await prisma.sale.findMany({
        where: {
          customerId: customer.id,
          status: { not: 'cancelled' },
          saleDate: { lt: start }
        }
      });
      const priorSalesPending = priorSales.reduce((sum, s) => {
        const bal = parseFloat(s.balanceAmount !== undefined && s.balanceAmount !== null ? s.balanceAmount : (s.totalAmount - s.paidAmount));
        return sum + (bal > 0 ? bal : 0);
      }, 0);

      // Prior settlements / receipts from Payment table (strictly excluding initial sale payments)
      const priorPayments = await prisma.payment.findMany({
        where: {
          customerId: customer.id,
          type: 'receipt',
          saleId: null,
          reference: {
            notIn: [
              'Initial Payment',
              'Updated Payment',
              'Initial POS Payment',
              ...priorSales.map(s => s.invoiceNumber)
            ]
          },
          paymentDate: { lt: start }
        }
      });
      const priorSettled = priorPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      // Prior Receipt Vouchers posted to this customer's ledger (via JournalEntry)
      const priorVoucherReceipts = await prisma.journalEntry.findMany({
        where: {
          creditLedgerId: ledger.id,
          voucher: {
            status: 'POSTED',
            voucherType: 'RECEIPT',
            date: { lt: start }
          }
        },
        include: { voucher: true }
      });
      const filteredPriorVoucherReceipts = priorVoucherReceipts.filter(e => {
        const ref = e.voucher?.reference;
        const narr = e.voucher?.narration || '';
        if (ref && customerInvoiceNumbers.includes(ref)) return false;
        if (narr.startsWith('Payment for #')) return false;
        return true;
      });
      const priorVoucherReceiptsTotal = filteredPriorVoucherReceipts.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

      openingBalance += (priorSalesPending - priorSettled - priorVoucherReceiptsTotal);
    }

    // Fetch Period Sales (by saleDate)
    const periodSales = await prisma.sale.findMany({
      where: {
        customerId: customer.id,
        status: { not: 'cancelled' },
        ...(start || end ? {
          saleDate: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {})
          }
        } : {})
      },
      orderBy: { saleDate: 'asc' }
    });

    // Fetch Period Payments / Credit Settlements from Payment table (strictly excluding initial sale payments)
    const periodPayments = await prisma.payment.findMany({
      where: {
        customerId: customer.id,
        type: 'receipt',
        saleId: null,
        reference: {
          notIn: [
            'Initial Payment',
            'Updated Payment',
            'Initial POS Payment',
            ...periodSales.map(s => s.invoiceNumber)
          ]
        },
        ...(start || end ? {
          paymentDate: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {})
          }
        } : {})
      },
      orderBy: { paymentDate: 'asc' }
    });

    // Fetch Period Receipt Vouchers posted to this customer's ledger (via JournalEntry + Voucher)
    const periodVoucherReceipts = await prisma.journalEntry.findMany({
      where: {
        creditLedgerId: ledger.id,
        voucher: {
          status: 'POSTED',
          voucherType: 'RECEIPT',
          ...(start || end ? {
            date: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {})
            }
          } : {})
        }
      },
      include: {
        voucher: true,
        debitLedger: true
      },
      orderBy: { voucher: { date: 'asc' } }
    });

    const filteredPeriodVoucherReceipts = periodVoucherReceipts.filter(e => {
      const ref = e.voucher?.reference;
      const narr = e.voucher?.narration || '';
      if (ref && customerInvoiceNumbers.includes(ref)) return false;
      if (narr.startsWith('Payment for #')) return false;
      return true;
    });

    // Build statement rows for Customer
    const saleRows = periodSales.map(s => {
      const tot = parseFloat(s.totalAmount || 0);
      const paid = parseFloat(s.paidAmount || 0);
      const pending = parseFloat(s.balanceAmount !== undefined && s.balanceAmount !== null ? s.balanceAmount : (tot - paid));
      const finalPending = pending > 0 ? pending : 0;

      return {
        id: `sale-${s.id}`,
        date: s.saleDate,
        voucherNumber: s.invoiceNumber,
        voucherType: 'SALES',
        particulars: `Sales Invoice #${s.invoiceNumber}`,
        debit: finalPending, // DEBIT (OUT) = Pending / Credit Given to Customer
        credit: paid,        // CREDIT (IN) = Cash / Amount Received at Sale
        narration: s.description || (paid > 0 ? `Paid: ₹${paid}, Pending: ₹${finalPending}` : 'Full Credit Sale'),
        balanceImpact: finalPending
      };
    });

    // Payment table rows (credit settlements from creditController etc.)
    const paymentRows = periodPayments.map(p => {
      const amt = parseFloat(p.amount || 0);
      return {
        id: `pay-${p.id}`,
        date: p.paymentDate,
        voucherNumber: p.reference || `REC-${p.id}`,
        voucherType: 'RECEIPT',
        particulars: `${p.method || 'Cash'} Receipt (Credit Settlement)`,
        debit: 0,
        credit: amt, // CREDIT (IN) = Amount Received
        narration: p.description || 'Credit Settlement',
        balanceImpact: -amt
      };
    });

    // Receipt Voucher rows (from Voucher/JournalEntry – e.g. Receipt Voucher page)
    const voucherReceiptRows = filteredPeriodVoucherReceipts.map(e => {
      const amt = parseFloat(e.amount || 0);
      const debitLedgerName = e.debitLedger?.name || 'Cash';
      return {
        id: `vrec-${e.id}`,
        date: e.voucher.date,
        voucherNumber: e.voucher.voucherNumber,
        voucherType: 'RECEIPT',
        particulars: `${debitLedgerName} Receipt`,
        debit: 0,
        credit: amt, // CREDIT (IN) = Amount Received
        narration: e.voucher.narration || e.description || 'Receipt Voucher',
        balanceImpact: -amt
      };
    });

    const allRows = [...saleRows, ...paymentRows, ...voucherReceiptRows].sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = openingBalance;
    const statement = allRows.map(row => {
      runningBalance += row.balanceImpact;
      return {
        ...row,
        balance: Math.abs(runningBalance) < 0.001 ? 0 : runningBalance
      };
    });

    return res.json({
      ledger: {
        id: ledger.id,
        name: ledger.name,
        groupName: ledger.group?.name || 'Sundry Debtors',
        openingBalance: openingBalance,
        balanceType: 'DEBIT',
        openingDebit: openingBalance > 0 ? openingBalance : 0,
        openingCredit: openingBalance < 0 ? Math.abs(openingBalance) : 0
      },
      statement,
      closingBalance: Math.abs(runningBalance) < 0.001 ? 0 : runningBalance,
      branch: activeBranch,
      isConsolidated,
      currency: activeBranch ? {
        code: activeBranch.currencyCode || 'INR',
        symbol: activeBranch.currencySymbol || '₹'
      } : { code: 'INR', symbol: '₹' }
    });
  }

  // ----------------------------------------------------
  // STANDARD GENERAL LEDGER STATEMENT FOR OTHER ACCOUNTS
  // ----------------------------------------------------
  let calculatedOpeningBalance = parseFloat(ledger.openingBalance);
  let openingDebit = 0;
  let openingCredit = 0;

  if (start) {
    const preDebit = await prisma.journalEntry.aggregate({
      _sum: { amount: true },
      where: {
        debitLedgerId: parseInt(ledgerId),
        voucher: {
          status: 'POSTED',
          date: { lt: start }
        }
      }
    });

    const preCredit = await prisma.journalEntry.aggregate({
      _sum: { amount: true },
      where: {
        creditLedgerId: parseInt(ledgerId),
        voucher: {
          status: 'POSTED',
          date: { lt: start }
        }
      }
    });

    const totalPreDebitRaw = preDebit._sum.amount ? parseFloat(preDebit._sum.amount) : 0;
    const totalPreCreditRaw = preCredit._sum.amount ? parseFloat(preCredit._sum.amount) : 0;

    const masterOpening = parseFloat(ledger.openingBalance);
    if (ledger.balanceType === 'DEBIT') {
      calculatedOpeningBalance = masterOpening + totalPreDebitRaw - totalPreCreditRaw;
    } else {
      calculatedOpeningBalance = masterOpening + totalPreCreditRaw - totalPreDebitRaw;
    }

    openingDebit = totalPreDebitRaw + (ledger.balanceType === 'DEBIT' ? masterOpening : 0);
    openingCredit = totalPreCreditRaw + (ledger.balanceType === 'CREDIT' ? masterOpening : 0);
  } else {
    openingDebit = ledger.balanceType === 'DEBIT' ? parseFloat(ledger.openingBalance) : 0;
    openingCredit = ledger.balanceType === 'CREDIT' ? parseFloat(ledger.openingBalance) : 0;
  }

  const dateFilter = {};
  if (start || end) {
    dateFilter.date = {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {})
    };
  }

  const debitEntries = await prisma.journalEntry.findMany({
    where: {
      debitLedgerId: parseInt(ledgerId),
      voucher: {
        status: 'POSTED',
        ...dateFilter
      }
    },
    include: {
      voucher: true,
      creditLedger: true
    }
  });

  const creditEntries = await prisma.journalEntry.findMany({
    where: {
      creditLedgerId: parseInt(ledgerId),
      voucher: {
        status: 'POSTED',
        ...dateFilter
      }
    },
    include: {
      voucher: true,
      debitLedger: true
    }
  });

  const allEntriesRaw = [...debitEntries.map(e => ({ ...e, type: 'DEBIT' })), ...creditEntries.map(e => ({ ...e, type: 'CREDIT' }))];

  const entriesWithParticulars = await Promise.all(allEntriesRaw.map(async (e) => {
    let particulars = 'Multiple Accounts';

    const voucherEntries = await prisma.journalEntry.findMany({
      where: { voucherId: e.voucherId },
      include: { debitLedger: true, creditLedger: true }
    });

    // For particulars, only show the COUNTERPART side of the voucher.
    // If this entry is a DEBIT, the counterpart is the CREDIT side (and vice versa).
    // This prevents compound vouchers (e.g. Dr Purchase + Dr Tax + Cr Supplier)
    // from incorrectly showing Tax Account as a counterpart in the Purchase Account ledger.
    const counterpartSide = e.type === 'DEBIT' ? 'credit' : 'debit';

    const otherLedgers = voucherEntries
      .filter(ve => {
        // Only include entries from the counterpart side
        if (counterpartSide === 'credit') {
          return ve.creditLedgerId !== null && ve.creditLedgerId !== parseInt(ledgerId);
        } else {
          return ve.debitLedgerId !== null && ve.debitLedgerId !== parseInt(ledgerId);
        }
      })
      .map(ve => ({
        id: counterpartSide === 'credit' ? ve.creditLedgerId : ve.debitLedgerId,
        name: counterpartSide === 'credit' ? ve.creditLedger?.name : ve.debitLedger?.name
      }))
      .filter(l => l.id && l.name);

    const uniqueOtherNames = [...new Set(otherLedgers.map(l => l.name))];

    if (uniqueOtherNames.length === 1) {
      particulars = uniqueOtherNames[0];
    } else if (uniqueOtherNames.length > 1) {
      particulars = `Multiple (${uniqueOtherNames.slice(0, 2).join(', ')}${uniqueOtherNames.length > 2 ? '...' : ''})`;
    } else {
      // Fallback: use direct counterpart from this specific entry
      particulars = e.type === 'DEBIT' ? (e.creditLedger?.name || 'Related Ledger') : (e.debitLedger?.name || 'Related Ledger');
    }

    return {
      id: e.id,
      date: e.voucher.date,
      voucherNumber: e.voucher.voucherNumber,
      voucherType: e.voucher.voucherType,
      particulars: particulars,
      debit: e.type === 'DEBIT' ? parseFloat(e.amount) : 0,
      credit: e.type === 'CREDIT' ? parseFloat(e.amount) : 0,
      narration: e.voucher.narration
    };
  }));

  let allEntries = entriesWithParticulars.sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = calculatedOpeningBalance;
  const statement = allEntries.map(entry => {
    if (ledger.balanceType === 'DEBIT') {
      runningBalance = runningBalance + entry.debit - entry.credit;
    } else {
      runningBalance = runningBalance + entry.credit - entry.debit;
    }

    return {
      ...entry,
      balance: Math.abs(runningBalance) < 0.001 ? 0 : runningBalance
    };
  });

  res.json({
    ledger: {
      id: ledger.id,
      name: ledger.name,
      groupName: ledger.group.name,
      openingBalance: calculatedOpeningBalance,
      balanceType: ledger.balanceType,
      openingDebit,
      openingCredit
    },
    statement,
    closingBalance: Math.abs(runningBalance) < 0.001 ? 0 : runningBalance,
    branch: activeBranch,
    isConsolidated,
    currency: activeBranch ? {
      code: activeBranch.currencyCode || 'INR',
      symbol: activeBranch.currencySymbol || '₹'
    } : { code: 'INR', symbol: '₹' }
  });
});

// ==================== CASH BOOK ====================

function extractSaleBreakdown(sale) {
  const totalAmount = parseFloat(sale.totalAmount || 0);
  const paidAmount = parseFloat(sale.paidAmount || 0);
  const payments = sale.payments || [];

  let cashAmount = 0;
  let upiAmount = 0;
  let cardAmount = 0;
  let otherNonCashAmount = 0;

  if (payments.length > 0) {
    for (const p of payments) {
      const amt = parseFloat(p.amount || 0);
      const method = (p.method || '').trim().toLowerCase();
      if (method === 'cash') {
        cashAmount += amt;
      } else if (method.includes('upi')) {
        upiAmount += amt;
      } else if (method.includes('card')) {
        cardAmount += amt;
      } else if (method === 'credit') {
        // Explicit credit method record
      } else {
        otherNonCashAmount += amt;
      }
    }
  } else {
    const method = (sale.paymentMethod || 'cash').trim().toLowerCase();
    if (method === 'cash') {
      cashAmount = paidAmount;
    } else if (method.includes('upi')) {
      upiAmount = paidAmount;
    } else if (method.includes('card')) {
      cardAmount = paidAmount;
    } else if (method === 'credit') {
      // 0 paid at sale
    } else if (method === 'split') {
      cashAmount = paidAmount;
    } else {
      otherNonCashAmount = paidAmount;
    }
  }

  const initialCash = cashAmount;
  const initialNonCash = upiAmount + cardAmount + otherNonCashAmount;
  const initialCredit = Math.max(0, totalAmount - (initialCash + initialNonCash));
  const currentOutstanding = Math.min(
    initialCredit,
    Math.max(0, parseFloat(sale.balanceAmount !== undefined && sale.balanceAmount !== null ? sale.balanceAmount : (totalAmount - paidAmount)))
  );
  const receivedAgainstCredit = Math.max(0, initialCredit - currentOutstanding);

  let credit = 0;
  let debit = 0;

  if (initialCredit > 0) {
    // Examples 3 & 4:
    // Full sale on Credit side, non-cash + outstanding credit on Debit side.
    // When outstanding credit is collected later, Debit reduces to initialNonCash (or 0).
    credit = totalAmount - initialNonCash;
    debit = initialNonCash + currentOutstanding;
  } else {
    // Examples 1 & 2:
    // Cash portion on Credit side, non-cash portion on Debit side.
    credit = initialCash;
    debit = initialNonCash;
  }

  return {
    totalAmount,
    initialCash,
    upiAmount,
    cardAmount,
    otherNonCashAmount,
    initialCredit,
    currentOutstanding,
    receivedAgainstCredit,
    credit,
    debit
  };
}

function groupSalesByDate(sales) {
  const groups = new Map();
  for (const sale of sales) {
    const dateKey = new Date(sale.saleDate).toISOString().split('T')[0];
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey).push(sale);
  }
  return Array.from(groups.values());
}

function buildDailySaleAndCreditRows(daySales) {
  if (!daySales || daySales.length === 0) return [];

  const baseDate = daySales[0].saleDate;
  const dateKey = new Date(baseDate).toISOString().split('T')[0];
  const invoiceNumbers = daySales.map(s => s.invoiceNumber).filter(Boolean);
  const voucherNoStr = invoiceNumbers.join(', ') || '-';

  let dailySaleCash = 0;
  const creditSales = [];

  const saleBreakdowns = daySales.map(sale => {
    const b = extractSaleBreakdown(sale);
    const custName = sale.customer?.name || sale.customerName || 'Walk-in Customer';
    const custPhone = sale.customer?.phone || sale.customerPhone || null;

    if (b.initialCredit > 0) {
      creditSales.push({ sale, breakdown: b, custName, custPhone });
      // Cash from credit sales is NOT added to the daily Sale row.
      // The full sale is represented in the Customer Credit row (credit = totalAmount, debit = outstanding).
    } else {
      dailySaleCash += b.initialCash;
    }

    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      customerName: custName,
      customerPhone: custPhone,
      totalAmount: b.totalAmount,
      cashAmount: b.initialCash,
      upiAmount: b.upiAmount,
      cardAmount: b.cardAmount,
      otherNonCashAmount: b.otherNonCashAmount,
      creditAmount: b.initialCredit,
      paymentMethod: sale.paymentMethod || 'Cash',
      description: sale.description
    };
  });

  const rows = [];

  // 1. One Single Daily Sale Row
  rows.push({
    id: `sale-day-${dateKey}`,
    rawId: daySales[0].id,
    date: baseDate,
    voucherNumber: voucherNoStr,
    voucherType: 'Sale',
    particulars: 'Sale',
    debit: 0,
    credit: Math.round(dailySaleCash * 100) / 100,
    narration: daySales.length > 1 ? `Daily Sales (${daySales.length} invoices)` : (daySales[0].description || 'Sale'),
    isSale: true,
    details: {
      date: baseDate,
      invoiceNumbers,
      totalSalesCount: daySales.length,
      sales: saleBreakdowns
    }
  });

  // 2. Individual Customer Credit Row for EACH separate credit transaction
  for (const cs of creditSales) {
    const { sale, breakdown, custName, custPhone } = cs;
    const isSettled = breakdown.currentOutstanding <= 0.001;
    const narrationText = custName
      ? (isSettled
          ? `Credit settled (${custName})`
          : (breakdown.currentOutstanding < breakdown.initialCredit
              ? `Credit to ${custName} (₹${(breakdown.initialCredit - breakdown.currentOutstanding).toFixed(2)} received)`
              : `Credit to ${custName}`))
      : (isSettled ? 'Credit settled' : 'Customer Credit');

    rows.push({
      id: `crd-${sale.id}`,
      rawId: sale.id,
      date: sale.saleDate,
      voucherNumber: sale.invoiceNumber || voucherNoStr,
      voucherType: 'Credit',
      particulars: 'Customer Credit',
      debit: Math.round(breakdown.currentOutstanding * 100) / 100,
      credit: Math.round(breakdown.totalAmount * 100) / 100,
      narration: narrationText,
      isSale: false,
      details: {
        customerName: custName,
        customerPhone: custPhone,
        invoiceNumber: sale.invoiceNumber,
        paymentMethod: 'Credit',
        totalAmount: breakdown.totalAmount,
        creditAmount: breakdown.initialCredit,
        currentOutstanding: breakdown.currentOutstanding,
        receivedAgainstCredit: breakdown.receivedAgainstCredit,
        isCustomerCredit: true
      }
    });
  }

  return rows;
}

exports.getCashBook = asyncHandler(async (req, res) => {
  const { startDate, endDate, branchId: requestedBranchId, ledgerId } = req.query;
  const { branchId, isConsolidated, activeBranch, branches, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const start = startDate ? new Date(startDate) : null;
  if (start) start.setHours(0, 0, 0, 0);

  let end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  // 1. Locate Cash ledger
  let cashLedger = null;
  if (ledgerId) {
    cashLedger = await prisma.ledger.findUnique({
      where: { id: parseInt(ledgerId) },
      include: { group: true }
    });
  }

  if (!cashLedger) {
    cashLedger = await prisma.ledger.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { equals: 'Cash', mode: 'insensitive' } },
          { name: { equals: 'Cash in Hand', mode: 'insensitive' } },
          { name: { equals: 'Cash-in-Hand', mode: 'insensitive' } },
          { name: { contains: 'Cash', mode: 'insensitive' } }
        ]
      },
      include: { group: true },
      orderBy: { id: 'asc' }
    });
  }

  const masterOpening = isConsolidated ? parseFloat(cashLedger?.openingBalance || 0) : 0;

  // 2. Fetch Period Sales
  const periodSales = await prisma.sale.findMany({
    where: {
      status: { not: 'cancelled' },
      ...branchFilter,
      ...(start || end ? {
        saleDate: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {})
        }
      } : {})
    },
    include: {
      customer: true,
      payments: true
    },
    orderBy: { saleDate: 'asc' }
  });

  // 3. Fetch Period Expenses
  const periodExpenses = await prisma.expense.findMany({
    where: {
      ...branchFilter,
      ...(start || end ? {
        date: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {})
        }
      } : {})
    },
    orderBy: { date: 'asc' }
  });

  // 4. Fetch Period Standalone Payments & Credit Settlements
  const saleInvoices = periodSales.map(s => s.invoiceNumber).filter(Boolean);
  const periodPayments = await prisma.payment.findMany({
    where: {
      saleId: null,
      ...branchFilter,
      reference: {
        notIn: ['Initial Payment', 'Updated Payment', 'Initial POS Payment', ...saleInvoices]
      },
      NOT: [
        { description: { startsWith: 'Payment for Invoice' } },
        { description: { startsWith: 'Payment for #' } }
      ],
      ...(start || end ? {
        paymentDate: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {})
        }
      } : {})
    },
    include: {
      customer: true,
      supplier: true
    },
    orderBy: { paymentDate: 'asc' }
  });

  // 5. Fetch manual vouchers involving Cash ledger
  let periodManualVoucherEntries = [];
  if (cashLedger) {
    const expIds = periodExpenses.map(e => `EXP-${e.id}`);
    const payRefs = periodPayments.flatMap(p => [
      p.reference,
      `PAY-${p.id}`,
      `REC-${p.id}`,
      `SETTLE-${p.id}`
    ]).filter(Boolean);

    periodManualVoucherEntries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { debitLedgerId: cashLedger.id },
          { creditLedgerId: cashLedger.id }
        ],
        voucher: {
          status: 'POSTED',
          ...branchFilter,
          voucherType: { not: 'SALES' },
          reference: {
            notIn: [...saleInvoices, ...expIds, ...payRefs]
          },
          NOT: [
            { narration: { startsWith: 'Sales Invoice #' } },
            { narration: { startsWith: 'Payment for #' } },
            { narration: { startsWith: 'Expense -' } },
            { narration: { startsWith: 'Credit Settlement' } }
          ],
          ...(start || end ? {
            date: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {})
            }
          } : {})
        }
      },
      include: {
        voucher: true,
        debitLedger: true,
        creditLedger: true
      }
    });
  }

  // 6. Calculate Opening Balance if start date provided
  let calculatedOpeningBalance = masterOpening;
  if (start) {
    const priorSales = await prisma.sale.findMany({
      where: {
        status: { not: 'cancelled' },
        ...branchFilter,
        saleDate: { lt: start }
      },
      include: { customer: true, payments: true }
    });
    const priorDailySalesList = groupSalesByDate(priorSales);
    for (const salesList of priorDailySalesList) {
      const gRows = buildDailySaleAndCreditRows(salesList);
      for (const gr of gRows) {
        calculatedOpeningBalance += (gr.credit - gr.debit);
      }
    }

    const priorExpenses = await prisma.expense.findMany({
      where: {
        ...branchFilter,
        date: { lt: start }
      }
    });
    for (const e of priorExpenses) {
      calculatedOpeningBalance -= parseFloat(e.amount || 0);
    }

    const priorSaleInvoices = priorSales.map(s => s.invoiceNumber).filter(Boolean);
    const priorPayments = await prisma.payment.findMany({
      where: {
        saleId: null,
        ...branchFilter,
        reference: {
          notIn: ['Initial Payment', 'Updated Payment', 'Initial POS Payment', ...priorSaleInvoices]
        },
        NOT: [
          { description: { startsWith: 'Payment for Invoice' } },
          { description: { startsWith: 'Payment for #' } }
        ],
        paymentDate: { lt: start }
      }
    });
    for (const p of priorPayments) {
      const amt = parseFloat(p.amount || 0);
      const isReceipt = p.type?.toLowerCase() === 'receipt';
      const isCustomerReceipt = isReceipt && !!p.customerId;
      if (isCustomerReceipt) {
        // Customer credit settlement receipts do not count as new income,
        // as the prior sales opening balance already accounts for the settled balance.
        continue;
      }
      if (isReceipt) {
        calculatedOpeningBalance += amt;
      } else {
        calculatedOpeningBalance -= amt;
      }
    }

    if (cashLedger) {
      const priorVoucherEntries = await prisma.journalEntry.findMany({
        where: {
          OR: [
            { debitLedgerId: cashLedger.id },
            { creditLedgerId: cashLedger.id }
          ],
          voucher: {
            status: 'POSTED',
            ...branchFilter,
            voucherType: { not: 'SALES' },
            date: { lt: start }
          }
        },
        include: { voucher: true }
      });
      for (const ve of priorVoucherEntries) {
        const amt = parseFloat(ve.amount || 0);
        const ref = ve.voucher.reference || '';
        const narr = ve.voucher.narration || '';
        if (narr.startsWith('Sales Invoice #') || narr.startsWith('Payment for #') || narr.startsWith('Credit Settlement')) continue;
        if (ref.startsWith('EXP-') || ref.startsWith('PAY-') || ref.startsWith('REC-') || ref.startsWith('SETTLE-')) continue;

        if (ve.debitLedgerId === cashLedger.id) {
          calculatedOpeningBalance += amt;
        } else {
          calculatedOpeningBalance -= amt;
        }
      }
    }
  }

  // 7. Build Rows - Single Daily Sale row and separate Customer Credit rows
  const dailyGroupedSalesList = groupSalesByDate(periodSales);
  const saleRows = dailyGroupedSalesList.flatMap(salesList => buildDailySaleAndCreditRows(salesList));

  // Expense Rows
  const expenseRows = periodExpenses.map(exp => {
    const amt = parseFloat(exp.amount || 0);
    return {
      id: `exp-${exp.id}`,
      rawId: exp.id,
      date: exp.date,
      voucherNumber: `EXP-${exp.id}`,
      voucherType: 'Expense',
      particulars: 'Expense',
      debit: amt, // All expenses on Debit (Out) side
      credit: 0,
      narration: exp.title || exp.description || 'Expense',
      isSale: false,
      details: {
        customerName: null,
        transactionType: 'Expense',
        transactionDate: exp.date,
        invoiceNumber: `EXP-${exp.id}`,
        totalAmount: amt,
        title: exp.title,
        category: exp.category,
        description: exp.description
      }
    };
  });

  // Standalone Payment Rows
  const paymentRows = periodPayments.map(p => {
    const amt = parseFloat(p.amount || 0);
    const isReceipt = p.type?.toLowerCase() === 'receipt';
    const isCustomerReceipt = isReceipt && !!p.customerId;
    const isCreditSettlement = isCustomerReceipt;
    const partyName = p.customer?.name || p.supplier?.name || (isReceipt ? 'Payer' : 'Payee');
    const rowDebit = isReceipt ? 0 : amt;
    const rowCredit = isReceipt ? (isCreditSettlement ? 0 : amt) : 0;
    const receiptNarration = p.description || (isCustomerReceipt
      ? `Credit receipt from ${partyName}`
      : `${p.method || 'Cash'} ${isReceipt ? 'Receipt' : 'Payment'}`);

    return {
      id: `pay-${p.id}`,
      rawId: p.id,
      date: p.paymentDate,
      voucherNumber: p.reference || (isReceipt ? `REC-${p.id}` : `PAY-${p.id}`),
      voucherType: isReceipt ? 'Receipt' : 'Payment',
      particulars: isCustomerReceipt ? 'Credit Receipt' : (isReceipt ? 'Receipt' : 'Payment'),
      debit: rowDebit,
      credit: rowCredit,
      narration: receiptNarration,
      isSale: false,
      details: {
        customerName: partyName,
        customerPhone: p.customer?.phone || null,
        transactionType: isCustomerReceipt ? 'Credit Receipt' : (isReceipt ? 'Receipt' : 'Payment'),
        transactionDate: p.paymentDate,
        invoiceNumber: p.reference || (isReceipt ? `REC-${p.id}` : `PAY-${p.id}`),
        totalAmount: amt,
        cashAmount: (p.method || '').toLowerCase() === 'cash' ? amt : null,
        upiAmount: (p.method || '').toLowerCase().includes('upi') ? amt : null,
        cardAmount: (p.method || '').toLowerCase().includes('card') ? amt : null,
        paymentMethod: p.method || 'Cash',
        description: p.description
      }
    };
  });

  // Manual Voucher Rows
  const manualVoucherRows = periodManualVoucherEntries.map(ve => {
    const amt = parseFloat(ve.amount || 0);
    const isCashIn = ve.debitLedgerId === cashLedger?.id;
    const counterpartName = isCashIn ? (ve.creditLedger?.name || 'Related Account') : (ve.debitLedger?.name || 'Related Account');
    return {
      id: `vouch-${ve.id}`,
      rawId: ve.voucher.id,
      date: ve.voucher.date,
      voucherNumber: ve.voucher.voucherNumber,
      voucherType: ve.voucher.voucherType || (isCashIn ? 'Receipt' : 'Payment'),
      particulars: isCashIn ? 'Receipt' : 'Payment',
      debit: isCashIn ? 0 : amt,
      credit: isCashIn ? amt : 0,
      narration: ve.voucher.narration || `${counterpartName}`,
      isSale: false,
      details: {
        customerName: counterpartName,
        transactionType: ve.voucher.voucherType || (isCashIn ? 'Receipt' : 'Payment'),
        transactionDate: ve.voucher.date,
        invoiceNumber: ve.voucher.voucherNumber,
        totalAmount: amt,
        description: ve.voucher.narration
      }
    };
  });

  // 8. Merge and Sort
  const allRows = [...saleRows, ...expenseRows, ...paymentRows, ...manualVoucherRows].sort(
    (a, b) => {
      const diff = new Date(a.date) - new Date(b.date);
      if (diff !== 0) return diff;
      if (a.rawId === b.rawId) {
        if (a.particulars === 'Sale' && b.particulars === 'Customer Credit') return -1;
        if (a.particulars === 'Customer Credit' && b.particulars === 'Sale') return 1;
      }
      return 0;
    }
  );

  // 9. Running Balance
  let runningBalance = calculatedOpeningBalance;
  const statement = allRows.map(row => {
    runningBalance = runningBalance + row.credit - row.debit;
    return {
      ...row,
      balance: Math.abs(runningBalance) < 0.001 ? 0 : Math.round(runningBalance * 100) / 100
    };
  });

  const totalCredit = allRows.reduce((sum, r) => sum + r.credit, 0);
  const totalDebit = allRows.reduce((sum, r) => sum + r.debit, 0);
  const closingBalance = Math.abs(runningBalance) < 0.001 ? 0 : Math.round(runningBalance * 100) / 100;

  res.json({
    ledger: {
      id: cashLedger?.id || 1,
      name: cashLedger?.name || 'Cash',
      groupName: cashLedger?.group?.name || 'Cash-in-Hand',
      openingBalance: calculatedOpeningBalance,
      balanceType: 'DEBIT',
      openingDebit: 0,
      openingCredit: calculatedOpeningBalance
    },
    statement,
    closingBalance,
    totalDebit,
    totalCredit,
    branch: activeBranch,
    isConsolidated,
    currency: activeBranch ? {
      code: activeBranch.currencyCode || 'INR',
      symbol: activeBranch.currencySymbol || '₹'
    } : { code: 'INR', symbol: '₹' }
  });
});

// ==================== DAY BOOK ====================

exports.getDayBook = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    res.status(400);
    throw new Error('Date is required');
  }

  const selectedDate = new Date(date);
  const nextDate = new Date(selectedDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const vouchers = await prisma.voucher.findMany({
    where: {
      date: {
        gte: selectedDate,
        lt: nextDate
      },
      status: 'POSTED'
    },
    include: {
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      }
    },
    orderBy: { voucherNumber: 'asc' }
  });

  const summary = vouchers.reduce((acc, v) => {
    acc[v.voucherType] = (acc[v.voucherType] || 0) + 1;
    return acc;
  }, {});

  res.json({
    date: selectedDate,
    vouchers,
    summary,
    totalVouchers: vouchers.length
  });
});

// ==================== HELPER FUNCTIONS ====================

async function getProfitLossData(endDate, branchFilter = {}) {
  const end = endDate || new Date();

  const ledgers = await prisma.ledger.findMany({
    where: {
      isActive: true,
      group: { groupType: { in: ['INCOME', 'EXPENSES'] } }
    },
    include: { group: true }
  });

  const baseVoucherWhere = {
    status: 'POSTED',
    ...branchFilter,
    date: { lte: end }
  };

  const [debitSums, creditSums] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ['debitLedgerId'],
      _sum: { amount: true },
      where: {
        debitLedgerId: { in: ledgers.map(l => l.id) },
        voucher: baseVoucherWhere
      }
    }),
    prisma.journalEntry.groupBy({
      by: ['creditLedgerId'],
      _sum: { amount: true },
      where: {
        creditLedgerId: { in: ledgers.map(l => l.id) },
        voucher: baseVoucherWhere
      }
    })
  ]);

  const debMap = new Map(debitSums.map(s => [s.debitLedgerId, Number(s._sum.amount || 0)]));
  const credMap = new Map(creditSums.map(s => [s.creditLedgerId, Number(s._sum.amount || 0)]));

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const ledger of ledgers) {
    const totalDebit = debMap.get(ledger.id) || 0;
    const totalCredit = credMap.get(ledger.id) || 0;

    let balance = 0;
    if (ledger.balanceType === 'DEBIT') {
      balance = totalDebit - totalCredit;
    } else {
      balance = totalCredit - totalDebit;
    }

    if (ledger.group.groupType === 'INCOME') {
      totalIncome += balance;
    } else {
      totalExpenses += balance;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses
  };
}
