const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { processSalePosting, processPurchasePosting, postTransaction, resolveBranchFilter } = require('../utils/accountingHelper');

// ==================== ACCOUNT GROUPS ====================

exports.getAccountGroups = asyncHandler(async (req, res) => {
  const groups = await prisma.accountGroup.findMany({
    include: {
      parent: true,
      subGroups: true,
      ledgers: true
    },
    orderBy: { name: 'asc' }
  });
  res.json(groups);
});

exports.createAccountGroup = asyncHandler(async (req, res) => {
  const { name, groupType, parentId } = req.body;

  const group = await prisma.accountGroup.create({
    data: {
      name,
      groupType,
      parentId: parentId ? parseInt(parentId) : null
    }
  });

  res.json(group);
});

// ==================== LEDGERS ====================

exports.getLedgers = asyncHandler(async (req, res) => {
  const { branchId: requestedBranchId, search, details } = req.query;
  const { branchId, isConsolidated, activeBranch, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const ledgersWhere = { isActive: true };
  if (search) {
    ledgersWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { group: { name: { contains: search, mode: 'insensitive' } } }
    ];
  }

  const ledgers = await prisma.ledger.findMany({
    where: ledgersWhere,
    include: { group: true },
    orderBy: { name: 'asc' }
  });

  const voucherWhere = {
    status: 'POSTED',
    ...branchFilter
  };

  // Get debit and credit sums filtered by branch
  const [debitSums, creditSums] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ['debitLedgerId'],
      _sum: { amount: true },
      where: { voucher: voucherWhere }
    }),
    prisma.journalEntry.groupBy({
      by: ['creditLedgerId'],
      _sum: { amount: true },
      where: { voucher: voucherWhere }
    })
  ]);

  const debitMap = new Map((debitSums || []).map(s => [s.debitLedgerId, Number(s._sum.amount || 0)]));
  const creditMap = new Map((creditSums || []).map(s => [s.creditLedgerId, Number(s._sum.amount || 0)]));

  const ledgersWithBalance = (ledgers || []).map(ledger => {
    const totalDebit = debitMap.get(ledger.id) || 0;
    const totalCredit = creditMap.get(ledger.id) || 0;
    
    // For single branch, opening balance is 0 unless ledger is global or specifically configured.
    // If consolidated, ledger openingBalance is included.
    let balance = isConsolidated ? Number(ledger.openingBalance) : 0;
    if (ledger.balanceType === 'DEBIT') {
      balance = balance + totalDebit - totalCredit;
    } else {
      balance = balance + totalCredit - totalDebit;
    }

    return {
      ...ledger,
      currentBalance: Math.round(balance * 100) / 100,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100
    };
  });

  if (details === 'true') {
    return res.json({
      ledgers: ledgersWithBalance,
      branch: activeBranch,
      isConsolidated,
      currency: activeBranch ? {
        code: activeBranch.currencyCode || 'AED',
        symbol: activeBranch.currencySymbol || (activeBranch.currencyCode === 'INR' ? '₹' : 'AED')
      } : { code: 'AED', symbol: 'AED' }
    });
  }

  res.json(ledgersWithBalance);
});

exports.createLedger = asyncHandler(async (req, res) => {
  const { name, groupId, openingBalance, balanceType, description } = req.body;

  const ledger = await prisma.ledger.create({
    data: {
      name,
      groupId: parseInt(groupId),
      openingBalance: parseFloat(openingBalance || 0),
      balanceType: balanceType || 'DEBIT',
      description,
      isSystem: false // Manual ledgers are never system
    },
    include: {
      group: true
    }
  });

  res.json(ledger);
});

exports.updateLedger = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, groupId, openingBalance, balanceType, description, isActive } = req.body;

  const ledger = await prisma.ledger.update({
    where: { id: parseInt(id) },
    data: {
      name,
      groupId: groupId ? parseInt(groupId) : undefined,
      openingBalance: openingBalance !== undefined ? parseFloat(openingBalance) : undefined,
      balanceType,
      description,
      isActive
    },
    include: {
      group: true
    }
  });

  res.json(ledger);
});

exports.deleteLedger = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if ledger has transactions
  const debitCount = await prisma.journalEntry.count({
    where: { debitLedgerId: parseInt(id) }
  });

  const creditCount = await prisma.journalEntry.count({
    where: { creditLedgerId: parseInt(id) }
  });

  const ledger = await prisma.ledger.findUnique({
    where: { id: parseInt(id) }
  });

  if (ledger.isSystem) {
    res.status(403);
    throw new Error('Cannot delete system-defined ledger.');
  }

  if (debitCount > 0 || creditCount > 0) {
    res.status(400);
    throw new Error('Cannot delete ledger with existing transactions. Deactivate it instead.');
  }

  await prisma.ledger.delete({
    where: { id: parseInt(id) }
  });

  res.json({ message: 'Ledger deleted successfully' });
});

// ==================== VOUCHERS ====================

// Generate voucher number
async function generateVoucherNumber(voucherType) {
  const prefix = {
    'PAYMENT': 'PAY',
    'RECEIPT': 'REC',
    'JOURNAL': 'JV',
    'CONTRA': 'CON',
    'SALES': 'SAL',
    'PURCHASE': 'PUR'
  }[voucherType] || 'VOU';

  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const lastVoucher = await prisma.voucher.findFirst({
    where: {
      voucherNumber: {
        startsWith: `${prefix}${year}${month}`
      }
    },
    orderBy: { voucherNumber: 'desc' }
  });

  let sequence = 1;
  if (lastVoucher) {
    const lastSequence = parseInt(lastVoucher.voucherNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${year}${month}${sequence.toString().padStart(4, '0')}`;
}

// Create Payment Voucher
exports.createPaymentVoucher = asyncHandler(async (req, res) => {
  const { date, paymentAccount, expenseAccount, amount, narration, reference, branchId } = req.body;
  const user = req.user;

  if (!paymentAccount || !expenseAccount || !amount) {
    require('fs').appendFileSync('debug_payment_error.log', `Payment Voucher missing fields: ${JSON.stringify({ paymentAccount, expenseAccount, amount, date, narration, reference }, null, 2)}\n`);
    res.status(400);
    throw new Error('Missing required fields');
  }

  const voucherNumber = await generateVoucherNumber('PAYMENT');
  const targetBranchId = branchId ? parseInt(branchId) : (user?.branchId || null);

  const voucher = await prisma.voucher.create({
    data: {
      voucherNumber,
      voucherType: 'PAYMENT',
      date: new Date(date),
      narration,
      reference,
      totalAmount: parseFloat(amount),
      createdBy: user.id,
      branchId: targetBranchId,
      entries: {
        create: [
          {
            debitLedgerId: parseInt(expenseAccount),
            amount: parseFloat(amount),
            description: narration
          },
          {
            creditLedgerId: parseInt(paymentAccount),
            amount: parseFloat(amount),
            description: narration
          }
        ]
      }
    },
    include: {
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      }
    }
  });

  res.json(voucher);
});

// Create Receipt Voucher
exports.createReceiptVoucher = asyncHandler(async (req, res) => {
  const { date, receiptAccount, incomeAccount, amount, narration, reference, branchId } = req.body;
  const user = req.user;

  if (!receiptAccount || !incomeAccount || !amount) {
    res.status(400);
    throw new Error('Missing required fields');
  }

  const voucherNumber = await generateVoucherNumber('RECEIPT');
  const targetBranchId = branchId ? parseInt(branchId) : (user?.branchId || null);

  const voucher = await prisma.voucher.create({
    data: {
      voucherNumber,
      voucherType: 'RECEIPT',
      date: new Date(date),
      narration,
      reference,
      totalAmount: parseFloat(amount),
      createdBy: user.id,
      branchId: targetBranchId,
      entries: {
        create: [
          {
            debitLedgerId: parseInt(receiptAccount),
            amount: parseFloat(amount),
            description: narration
          },
          {
            creditLedgerId: parseInt(incomeAccount),
            amount: parseFloat(amount),
            description: narration
          }
        ]
      }
    },
    include: {
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      }
    }
  });

  res.json(voucher);
});

// Create Journal Entry
exports.createJournalEntry = asyncHandler(async (req, res) => {
  const { date, entries, narration, reference, branchId } = req.body;
  const user = req.user;

  if (!entries || entries.length < 2) {
    res.status(400);
    throw new Error('Journal entry must have at least 2 entries');
  }

  // Validate that total debits = total credits
  const totalDebit = entries
    .filter(e => e.type === 'DEBIT')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  const totalCredit = entries
    .filter(e => e.type === 'CREDIT')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    res.status(400);
    throw new Error(`Total debits (${totalDebit}) must equal total credits (${totalCredit})`);
  }

  const voucherNumber = await generateVoucherNumber('JOURNAL');
  const targetBranchId = branchId ? parseInt(branchId) : (user?.branchId || null);

  const journalEntries = entries.map(entry => ({
    debitLedgerId: entry.type === 'DEBIT' ? parseInt(entry.ledgerId) : null,
    creditLedgerId: entry.type === 'CREDIT' ? parseInt(entry.ledgerId) : null,
    amount: parseFloat(entry.amount),
    description: entry.description || narration
  }));

  const voucher = await prisma.voucher.create({
    data: {
      voucherNumber,
      voucherType: 'JOURNAL',
      date: new Date(date),
      narration,
      reference,
      totalAmount: totalDebit,
      createdBy: user.id,
      branchId: targetBranchId,
      entries: {
        create: journalEntries
      }
    },
    include: {
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      }
    }
  });

  res.json(voucher);
});

// Create Contra Entry
exports.createContraEntry = asyncHandler(async (req, res) => {
  const { date, fromAccount, toAccount, amount, narration, reference, branchId } = req.body;
  const user = req.user;

  if (!fromAccount || !toAccount || !amount) {
    res.status(400);
    throw new Error('Missing required fields');
  }

  const voucherNumber = await generateVoucherNumber('CONTRA');
  const targetBranchId = branchId ? parseInt(branchId) : (user?.branchId || null);

  const voucher = await prisma.voucher.create({
    data: {
      voucherNumber,
      voucherType: 'CONTRA',
      date: new Date(date),
      narration,
      reference,
      totalAmount: parseFloat(amount),
      createdBy: user.id,
      branchId: targetBranchId,
      entries: {
        create: [
          {
            debitLedgerId: parseInt(toAccount),
            amount: parseFloat(amount),
            description: narration
          },
          {
            creditLedgerId: parseInt(fromAccount),
            amount: parseFloat(amount),
            description: narration
          }
        ]
      }
    },
    include: {
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      }
    }
  });

  res.json(voucher);
});

// Get all vouchers
exports.getVouchers = asyncHandler(async (req, res) => {
  const { voucherType, startDate, endDate, ledgerId, status, branchId: requestedBranchId } = req.query;
  const { branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const where = { ...branchFilter };
  if (voucherType) where.voucherType = voucherType;
  if (status) where.status = status;
  if (startDate && endDate) {
    where.date = {
      gte: new Date(startDate),
      lte: new Date(endDate)
    };
  }

  if (ledgerId) {
    where.entries = {
      some: {
        OR: [
          { debitLedgerId: parseInt(ledgerId) },
          { creditLedgerId: parseInt(ledgerId) }
        ]
      }
    };
  }

  const vouchers = await prisma.voucher.findMany({
    where,
    include: {
      branch: true,
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      },
      creator: {
        select: {
          id: true,
          name: true,
          username: true
        }
      },
      branch: {
        select: {
          id: true,
          name: true,
          currencyCode: true,
          currencySymbol: true
        }
      }
    },
    orderBy: { date: 'desc' }
  });

  res.json(vouchers);
});

// Get single voucher
exports.getVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const voucher = await prisma.voucher.findUnique({
    where: { id: parseInt(id) },
    include: {
      branch: true,
      entries: {
        include: {
          debitLedger: true,
          creditLedger: true
        }
      },
      creator: {
        select: {
          id: true,
          name: true,
          username: true
        }
      }
    }
  });

  if (!voucher) {
    res.status(404);
    throw new Error('Voucher not found');
  }

  res.json(voucher);
});

// Cancel voucher
exports.cancelVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const voucher = await prisma.voucher.update({
    where: { id: parseInt(id) },
    data: { status: 'CANCELLED' }
  });

  res.json(voucher);
});

// Update Voucher
exports.updateVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { date, narration, reference, totalAmount, entries } = req.body;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    res.status(400);
    throw new Error('Voucher must have at least one entry');
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Delete existing entries (Cascade is on schema, but explicit delete entries if needed)
    // Actually with onDelete: Cascade, we just need to replace them.
    // But Prisma doesn't have a "replace" for relations in update unless using disconnect/connect or deleteMany.
    await tx.journalEntry.deleteMany({
      where: { voucherId: parseInt(id) }
    });

    // 2. Update voucher record and create new entries
    const voucher = await tx.voucher.update({
      where: { id: parseInt(id) },
      data: {
        date: date ? new Date(date) : undefined,
        narration,
        reference,
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        entries: {
          create: entries.map(e => ({
            debitLedgerId: e.debitLedgerId ? parseInt(e.debitLedgerId) : (e.type === 'DEBIT' ? parseInt(e.ledgerId) : null),
            creditLedgerId: e.creditLedgerId ? parseInt(e.creditLedgerId) : (e.type === 'CREDIT' ? parseInt(e.ledgerId) : null),
            amount: parseFloat(e.amount),
            description: e.description || narration
          }))
        }
      },
      include: {
        entries: true
      }
    });

    return voucher;
  });

  res.json(result);
});

// Delete Voucher
exports.deleteVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.voucher.delete({
    where: { id: parseInt(id) }
  });
  res.json({ message: 'Voucher deleted successfully' });
});

// ==================== HELPER FUNCTIONS ====================

async function calculateLedgerBalance(ledgerId) {
  const ledger = await prisma.ledger.findUnique({
    where: { id: ledgerId }
  });

  if (!ledger) return 0;

  const [debitSum, creditSum] = await Promise.all([
    prisma.journalEntry.aggregate({
      _sum: { amount: true },
      where: { debitLedgerId: ledgerId, voucher: { status: 'POSTED' } }
    }),
    prisma.journalEntry.aggregate({
      _sum: { amount: true },
      where: { creditLedgerId: ledgerId, voucher: { status: 'POSTED' } }
    })
  ]);

  const totalDebit = Number(debitSum._sum.amount || 0);
  const totalCredit = Number(creditSum._sum.amount || 0);

  let balance = Number(ledger.openingBalance);
  if (ledger.balanceType === 'DEBIT') {
    balance = balance + totalDebit - totalCredit;
  } else {
    balance = balance + totalCredit - totalDebit;
  }

  return balance;
}

exports.calculateLedgerBalance = calculateLedgerBalance;

// ==================== BULK POSTING ====================

/**
 * Bulk Post Transactions for a given date range.
 */
exports.bulkPostTransactions = asyncHandler(async (req, res) => {
  const { fromDate, toDate, transactionTypes } = req.body;
  const userId = req.user ? req.user.id : 1;

  if (!fromDate || !toDate) {
    res.status(400);
    throw new Error('Please provide fromDate and toDate');
  }

  const start = new Date(fromDate);
  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  const results = {
    sales: { total: 0, processed: 0, errors: [] },
    purchases: { total: 0, processed: 0, errors: [] },
    expenses: { total: 0, processed: 0, errors: [] },
    payments: { total: 0, processed: 0, errors: [] }
  };

  // 1. Process Sales
  if (!transactionTypes || transactionTypes.includes('SALES')) {
    const sales = await prisma.sale.findMany({
      where: { saleDate: { gte: start, lte: end } },
      include: { customer: true }
    });
    results.sales.total = sales.length;

    for (const sale of sales) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.journalEntry.deleteMany({ where: { voucher: { reference: sale.invoiceNumber } } });
          await tx.voucher.deleteMany({ where: { reference: sale.invoiceNumber } });
          await processSalePosting(tx, sale, userId);
        });
        results.sales.processed++;
      } catch (err) {
        results.sales.errors.push({ id: sale.id, error: err.message });
      }
    }
  }

  // 2. Process Purchases
  if (!transactionTypes || transactionTypes.includes('PURCHASE')) {
    const purchases = await prisma.purchase.findMany({
      where: { purchaseDate: { gte: start, lte: end } },
      include: { supplier: true }
    });
    results.purchases.total = purchases.length;

    for (const purchase of purchases) {
      try {
        await prisma.$transaction(async (tx) => {
          const billRef = purchase.invoiceNumber || purchase.id.toString();
          await tx.journalEntry.deleteMany({ where: { voucher: { reference: billRef } } });
          await tx.voucher.deleteMany({ where: { reference: billRef } });
          await processPurchasePosting(tx, purchase, userId);
        });
        results.purchases.processed++;
      } catch (err) {
        results.purchases.errors.push({ id: purchase.id, error: err.message });
      }
    }
  }

  // 3. Process Expenses
  if (!transactionTypes || transactionTypes.includes('EXPENSE')) {
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: start, lte: end } }
    });
    results.expenses.total = expenses.length;

    for (const expense of expenses) {
      try {
        await prisma.$transaction(async (tx) => {
          const expRef = `EXP-${expense.id}`;
          await tx.journalEntry.deleteMany({ where: { voucher: { reference: expRef } } });
          await tx.voucher.deleteMany({ where: { reference: expRef } });
          await postTransaction(tx, 'EXPENSE', expense, userId, expRef, expense.title);
        });
        results.expenses.processed++;
      } catch (err) {
        results.expenses.errors.push({ id: expense.id, error: err.message });
      }
    }
  }

  // 4. Process Payments/Receipts
  if (!transactionTypes || transactionTypes.includes('PAYMENT') || transactionTypes.includes('RECEIPT')) {
    const payments = await prisma.payment.findMany({
      where: { paymentDate: { gte: start, lte: end } },
      include: { customer: true, supplier: true }
    });
    results.payments.total = payments.length;

    for (const payment of payments) {
      try {
        await prisma.$transaction(async (tx) => {
          const payRef = payment.reference || `PAY-${payment.id}`;
          await tx.journalEntry.deleteMany({ where: { voucher: { reference: payRef } } });
          await tx.voucher.deleteMany({ where: { reference: payRef } });
          await postTransaction(tx, payment.type.toUpperCase(), payment, userId, payRef, payment.description);
        });
        results.payments.processed++;
      } catch (err) {
        results.payments.errors.push({ id: payment.id, error: err.message });
      }
    }
  }

  res.json(results);
});

// ==================== DASHBOARD ====================

exports.getDashboardStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, branchId: requestedBranchId } = req.query;
  const { branchId, isConsolidated, activeBranch, branchFilter } = await resolveBranchFilter(req, requestedBranchId);

  const activeCurrency = activeBranch ? {
    code: activeBranch.currencyCode || 'AED',
    symbol: activeBranch.currencySymbol || (activeBranch.currencyCode === 'INR' ? '₹' : 'AED')
  } : { code: 'AED', symbol: 'AED' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dateFilter = undefined;
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter = { gte: start, lte: end };
  } else if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateFilter = { gte: start };
  } else if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter = { lte: end };
  }

  // 1. Total Accounts
  const totalAccounts = await prisma.ledger.count({
    where: { isActive: true }
  });

  // 2. Today Transactions
  const todayTransactions = await prisma.voucher.count({
    where: {
      date: dateFilter || { gte: today },
      status: 'POSTED',
      ...branchFilter
    }
  });

  // 3. Pending Vouchers
  const pendingVouchers = await prisma.voucher.count({
    where: { 
      status: 'DRAFT',
      ...branchFilter,
      ...(dateFilter ? { date: dateFilter } : {})
    }
  });

  // Fetch all ledgers to calculate Bank Balance, Cash in Hand, Income, Expense
  const ledgers = await prisma.ledger.findMany({
    include: { group: true }
  });

  const [debitSums, creditSums] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ['debitLedgerId'],
      _sum: { amount: true },
      where: { 
        voucher: { 
          status: 'POSTED',
          ...branchFilter,
          ...(dateFilter ? { date: dateFilter } : {})
        } 
      }
    }),
    prisma.journalEntry.groupBy({
      by: ['creditLedgerId'],
      _sum: { amount: true },
      where: { 
        voucher: { 
          status: 'POSTED',
          ...branchFilter,
          ...(dateFilter ? { date: dateFilter } : {})
        } 
      }
    })
  ]);

  const debitMap = new Map((debitSums || []).map(s => [s.debitLedgerId, Number(s._sum.amount || 0)]));
  const creditMap = new Map((creditSums || []).map(s => [s.creditLedgerId, Number(s._sum.amount || 0)]));

  let bankBalance = 0;
  let cashInHand = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  
  const accountTypeBreakdown = {};

  ledgers.forEach(ledger => {
    const totalDebit = debitMap.get(ledger.id) || 0;
    const totalCredit = creditMap.get(ledger.id) || 0;
    
    let balance = Number(ledger.openingBalance);
    if (ledger.balanceType === 'DEBIT') {
      balance = balance + totalDebit - totalCredit;
    } else {
      balance = balance + totalCredit - totalDebit;
    }

    const groupName = ledger.group.name.toLowerCase();
    const groupType = ledger.group.groupType;

    if (groupName.includes('bank')) {
      bankBalance += balance;
    } else if (groupName.includes('cash')) {
      cashInHand += balance;
    }

    if (groupType === 'INCOME') {
      totalIncome += balance;
    } else if (groupType === 'EXPENSES') {
      totalExpense += balance;
    }

    accountTypeBreakdown[groupType] = (accountTypeBreakdown[groupType] || 0) + 1;
  });

  const netProfit = totalIncome - totalExpense;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setHours(0, 0, 0, 0);
  sixMonthsAgo.setDate(1);

  const monthlyStatsRaw = await prisma.journalEntry.findMany({
    where: {
      voucher: {
        status: 'POSTED',
        date: { gte: sixMonthsAgo },
        ...branchFilter
      },
      OR: [
        { debitLedger: { group: { groupType: 'EXPENSES' } } },
        { creditLedger: { group: { groupType: 'INCOME' } } }
      ]
    },
    include: {
      voucher: true,
      debitLedger: { include: { group: true } },
      creditLedger: { include: { group: true } }
    }
  });

  const monthlyData = {};
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthName = d.toLocaleString('en-US', { month: 'short' });
    monthlyData[monthName] = { income: 0, expense: 0 };
  }

  monthlyStatsRaw.forEach(entry => {
    const monthName = new Date(entry.voucher.date).toLocaleString('en-US', { month: 'short' });
    if (monthlyData[monthName]) {
      if (entry.creditLedger?.group?.groupType === 'INCOME') {
        monthlyData[monthName].income += Number(entry.amount);
      }
      if (entry.debitLedger?.group?.groupType === 'EXPENSES') {
        monthlyData[monthName].expense += Number(entry.amount);
      }
    }
  });

  const months = Object.keys(monthlyData).reverse();
  const incomeTrend = months.map(m => monthlyData[m].income);
  const expenseTrend = months.map(m => monthlyData[m].expense);
  const cashFlowTrend = months.map(m => monthlyData[m].income - monthlyData[m].expense);

  const voucherCounts = await prisma.voucher.groupBy({
    by: ['status'],
    _count: { id: true },
    where: {
      ...branchFilter,
      ...(dateFilter ? { date: dateFilter } : {})
    }
  });
  
  const voucherStatusBreakdown = {
    POSTED: 0,
    DRAFT: 0,
    CANCELLED: 0
  };
  voucherCounts.forEach(v => {
    if (voucherStatusBreakdown[v.status] !== undefined) {
      voucherStatusBreakdown[v.status] = v._count.id;
    }
  });

  const recentActivity = await prisma.voucher.findMany({
    take: 5,
    where: {
      ...branchFilter,
      ...(dateFilter ? { date: dateFilter } : {})
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      voucherNumber: true,
      voucherType: true,
      totalAmount: true,
      date: true,
      status: true
    }
  });

  res.json({
    branch: activeBranch,
    isConsolidated,
    currency: activeCurrency,
    summary: {
      totalAccounts,
      todayTransactions,
      pendingVouchers,
      bankBalance,
      cashInHand,
      monthlyExpense: monthlyData[today.toLocaleString('en-US', { month: 'short' })]?.expense || 0,
      monthlyIncome: monthlyData[today.toLocaleString('en-US', { month: 'short' })]?.income || 0,
      netProfit
    },
    charts: {
      incomeVsExpense: {
        labels: months,
        income: incomeTrend,
        expense: expenseTrend
      },
      cashFlow: {
        labels: months,
        data: cashFlowTrend
      },
      voucherStatus: [
        voucherStatusBreakdown.POSTED,
        voucherStatusBreakdown.DRAFT,
        voucherStatusBreakdown.CANCELLED
      ],
      accountTypes: {
        labels: Object.keys(accountTypeBreakdown),
        data: Object.values(accountTypeBreakdown)
      }
    },
    recentActivity
  });
});
