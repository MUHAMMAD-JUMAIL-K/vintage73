const prisma = require('../config/prisma');
const { evaluateFormula } = require('./accountingUtils');

/**
 * Ensure a ledger exists for a given name and group.
 * @param {Object} tx - Prisma transaction client (optional) or prisma instance
 * @param {string} name - Ledger name (e.g., "Customer Name")
 * @param {string} groupName - Account Group name (e.g., "Sundry Debtors")
 * @returns {Promise<Object>} - The Ledger object
 */
async function ensureLedger(tx, name, groupName) {
  const client = tx || prisma;

  // 1. Find the group first
  let group = await client.accountGroup.findFirst({
    where: { name: groupName }
  });

  if (!group) {
    const defaultGroupTypes = {
      'Sundry Debtors': 'ASSETS',
      'Sundry Creditors': 'LIABILITIES',
      'Sales Accounts': 'INCOME',
      'Purchase Accounts': 'EXPENSES',
      'Duties & Taxes': 'LIABILITIES',
      'Bank Accounts': 'ASSETS',
      'Cash-in-Hand': 'ASSETS',
      'Indirect Expenses': 'EXPENSES',
      'Direct Incomes': 'INCOME',
      'Stock-in-Hand': 'ASSETS',
      'Direct Expenses': 'EXPENSES',
      'Indirect Incomes': 'INCOME',
      'Fixed Assets': 'ASSETS',
      'Current Assets': 'ASSETS',
      'Current Liabilities': 'LIABILITIES',
      'Capital Account': 'LIABILITIES'
    };
    const groupType = defaultGroupTypes[groupName] || 'EXPENSES';

    try {
      group = await client.accountGroup.upsert({
        where: { name: groupName },
        update: {},
        create: {
          name: groupName,
          groupType: groupType
        }
      });
    } catch (err) {
      group = await client.accountGroup.findFirst({
        where: { name: groupName }
      });
    }
  }

  if (!group) {
    throw new Error(`Accounting Group '${groupName}' not found and could not be created. Please run seed script.`);
  }

  // 2. Find or Create Ledger
  // Note: Ledger names must be unique.
  const ledger = await client.ledger.upsert({
    where: { name: name },
    update: {}, // No update if exists
    create: {
      name: name,
      groupId: group.id,
      balanceType: group.groupType === 'ASSETS' || group.groupType === 'EXPENSES' ? 'DEBIT' : 'CREDIT',
      openingBalance: 0,
      description: `Auto-created for ${name}`
    }
  });

  return ledger;
}

/**
 * Create a specialized Voucher (Sales, Receipt, etc.) with Journal Entries
 * @param {Object} tx - Prisma Transaction Client
 * @param {Object} params - { type: 'SALES'|'RECEIPT', date: Date, amount: Float, narration: string, reference: string, createdBy: Int, branchId: Int }
 * @param {Array} entries - Array of { ledgerId: Int, type: 'DEBIT'|'CREDIT', amount: Float }
 */
async function postVoucher(tx, params, entries) {
  const { type, date, amount, narration, reference, createdBy, branchId } = params;

  const { generateVoucherNumber } = require('../services/dynamicPostingService');
  const voucherNumber = await generateVoucherNumber(tx, type);

  // Validate Totals
  const totalDebit = entries
    .filter(e => e.type === 'DEBIT')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCredit = entries
    .filter(e => e.type === 'CREDIT')
    .reduce((sum, e) => sum + e.amount, 0);

  // Allow small floating point diff
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Accounting Error: Dr (${totalDebit}) != Cr (${totalCredit}) in ${type}`);
  }

  const voucher = await tx.voucher.create({
    data: {
      voucherNumber,
      voucherType: type,
      date: date || new Date(),
      totalAmount: parseFloat(amount),
      narration,
      reference,
      status: 'POSTED',
      createdBy: createdBy || 1, // Default admin if null
      branchId: branchId ? parseInt(branchId) : null,
      entries: {
        create: entries.map(e => ({
          debitLedgerId: e.type === 'DEBIT' ? e.ledgerId : null,
          creditLedgerId: e.type === 'CREDIT' ? e.ledgerId : null,
          amount: parseFloat(e.amount),
          description: narration
        }))
      }
    }
  });

  return voucher;
}

/**
 * Get configured ledger ID for a specific transaction role.
 * Falls back to hardcoded defaults if not configured in TransactionPosting.
 * @param {Object} tx - Prisma Transaction Client
 * @param {string} transactionType - e.g. 'SALES'
 * @param {string} role - e.g. 'MAIN_ACCOUNT'
 * @param {string} defaultLedgerName - Fallback name
 * @param {string} defaultGroupName - Fallback group
 * @returns {Promise<Object>} - Ledger object
 */
async function getLedgerByRole(tx, transactionType, role, defaultLedgerName, defaultGroupName) {
  const client = tx || prisma;

  const setup = await client.transactionPosting.findUnique({
    where: {
      transactionType_role: {
        transactionType,
        role
      }
    },
    include: { ledger: true }
  });

  if (setup && setup.ledger) {
    // Return setup with ledger attached
    return {
      id: setup.ledger.id,
      name: setup.ledger.name,
      ledger: setup.ledger,
      targetTable: setup.targetTable,
      postingMethod: setup.postingMethod,
      amountField: setup.amountField,
      customFormula: setup.customFormula
    };
  }

  // Fallback to ensuring the default ledger exists
  const ledger = await ensureLedger(tx, defaultLedgerName, defaultGroupName);
  return {
    id: ledger.id,
    name: ledger.name,
    ledger: ledger,
    postingMethod: 'SUM',
    amountField: null,
    customFormula: null
  };
}

// evaluateFormula moved to accountingUtils.js to break circular dependency

const { postTransaction } = require('../services/dynamicPostingService');

/**
 * Centralized logic for Sale posting.
 */
async function processSalePosting(tx, sale, userId) {
  const { invoiceNumber, totalAmount, paidAmount, paymentMethod, saleDate, customer, taxAmount, subTotal } = sale;
  const grandTotal = parseFloat(String(totalAmount || 0));

  if (!grandTotal || grandTotal === 0) {
    console.warn('Sale totalAmount is 0, skipping accounting posting.');
    return;
  }

  // 1. Dynamic Posting for the Sale itself (if configured in TransactionPosting)
  let dynamicPosted = false;
  try {
    const dynamicResult = await postTransaction(tx, 'SALES', sale, userId, invoiceNumber, `Sales Invoice #${invoiceNumber}`);
    if (dynamicResult) {
      dynamicPosted = true;
    }
  } catch (err) {
    console.warn('Dynamic posting for SALES failed or incomplete, using fallback posting:', err.message);
  }

  // 2. If dynamic posting was not executed (e.g. no rules), use robust fallback posting
  if (!dynamicPosted) {
    let customerName = 'Walk-in Customer';
    if (customer && customer.name) {
      customerName = customer.name;
    } else if (sale.customerId) {
      const cust = await tx.customer.findUnique({ where: { id: parseInt(sale.customerId) } });
      if (cust && cust.name) customerName = cust.name;
    }

    const customerLedger = await ensureLedger(tx, customerName, 'Sundry Debtors');
    const salesLedger = await ensureLedger(tx, 'Sales Account', 'Sales Accounts');

    const entries = [];
    const tax = parseFloat(String(taxAmount || 0));
    const sub = parseFloat((grandTotal - tax).toFixed(2));
    const isReturn = sale.isReturn === true;

    if (isReturn) {
      const returnLedger = await ensureLedger(tx, 'Sales Return Account', 'Sales Accounts');
      entries.push({ ledgerId: returnLedger.id, type: 'DEBIT', amount: sub });
      if (tax > 0) {
        const halfTax = parseFloat((tax / 2).toFixed(2));
        const otherHalf = parseFloat((tax - halfTax).toFixed(2));
        const cgstLedger = await ensureLedger(tx, 'Output CGST', 'Duties & Taxes');
        const sgstLedger = await ensureLedger(tx, 'Output SGST', 'Duties & Taxes');
        entries.push({ ledgerId: cgstLedger.id, type: 'DEBIT', amount: halfTax });
        entries.push({ ledgerId: sgstLedger.id, type: 'DEBIT', amount: otherHalf });
      }
      entries.push({ ledgerId: customerLedger.id, type: 'CREDIT', amount: grandTotal });

      await postVoucher(tx, {
        type: 'JOURNAL',
        date: saleDate ? new Date(saleDate) : new Date(),
        amount: grandTotal,
        narration: `Sales Return Credit Note for #${invoiceNumber}${sale.originalInvoice ? ` (Orig: ${sale.originalInvoice})` : ''}`,
        reference: invoiceNumber,
        createdBy: userId,
        branchId: sale.branchId
      }, entries);
    } else {
      entries.push({ ledgerId: customerLedger.id, type: 'DEBIT', amount: grandTotal });

      if (tax > 0) {
        entries.push({ ledgerId: salesLedger.id, type: 'CREDIT', amount: sub });
        const halfTax = parseFloat((tax / 2).toFixed(2));
        const otherHalf = parseFloat((tax - halfTax).toFixed(2));
        const cgstLedger = await ensureLedger(tx, 'Output CGST', 'Duties & Taxes');
        const sgstLedger = await ensureLedger(tx, 'Output SGST', 'Duties & Taxes');
        entries.push({ ledgerId: cgstLedger.id, type: 'CREDIT', amount: halfTax });
        entries.push({ ledgerId: sgstLedger.id, type: 'CREDIT', amount: otherHalf });
      } else {
        entries.push({ ledgerId: salesLedger.id, type: 'CREDIT', amount: grandTotal });
      }

      const voucherNarration = sale.voucherCode ? ` [Voucher: ${sale.voucherCode} Discount: ${sale.voucherDiscount}]` : '';
      await postVoucher(tx, {
        type: 'SALES',
        date: saleDate ? new Date(saleDate) : new Date(),
        amount: grandTotal,
        narration: `Sales Invoice #${invoiceNumber}${voucherNarration}`,
        reference: invoiceNumber,
        createdBy: userId,
        branchId: sale.branchId
      }, entries);
    }
  }

  // 3. Handle Receipt if paid
  const paid = parseFloat(String(paidAmount || 0));
  if (paid > 0) {
    const payMethod = paymentMethod || 'Cash';
    let role = 'CASH';
    let defaultLedger = 'Cash';
    let defaultGroup = 'Cash-in-Hand';

    if (payMethod.toLowerCase().includes('online') || payMethod.toLowerCase().includes('bank') || payMethod.toLowerCase().includes('card') || payMethod.toLowerCase().includes('upi')) {
      role = 'BANK';
      defaultLedger = 'Bank Account';
      defaultGroup = 'Bank Accounts';
    }

    const assetLedger = await getLedgerByRole(tx, 'PAYMENT', role, defaultLedger, defaultGroup);

    let customerName = 'Walk-in Customer';
    if (customer && customer.name) {
      customerName = customer.name;
    } else if (sale.customerId) {
      const cust = await tx.customer.findUnique({ where: { id: parseInt(sale.customerId) } });
      if (cust && cust.name) customerName = cust.name;
    }
    const customerLedger = await ensureLedger(tx, customerName, 'Sundry Debtors');

    await postVoucher(tx, {
      type: 'RECEIPT',
      date: saleDate ? new Date(saleDate) : new Date(),
      amount: paid,
      narration: `Payment for #${invoiceNumber}`,
      reference: invoiceNumber,
      createdBy: userId,
      branchId: sale.branchId
    }, [
      { ledgerId: assetLedger.id, type: 'DEBIT', amount: paid },
      { ledgerId: customerLedger.id, type: 'CREDIT', amount: paid }
    ]);
  }
}

/**
 * Centralized logic for Purchase posting.
 * Uses hardcoded Dr/Cr logic so it works even if TransactionPosting DB rules are missing.
 */
async function processPurchasePosting(tx, purchase, userId) {
  const reference = purchase.invoiceNumber || `PUR-${purchase.id}`;
  const { paymentMethod, purchaseDate, supplier } = purchase;
  const totalAmount = parseFloat(String(purchase.totalAmount || 0));

  if (!totalAmount || totalAmount === 0) {
    console.warn('Purchase totalAmount is 0, skipping accounting posting.');
    return;
  }

  // 1. Resolve ledgers
  const purchaseLedger = await ensureLedger(tx, 'Purchase Account', 'Purchase Accounts');
  const supplierLedger = supplier
    ? await ensureLedger(tx, supplier.name, 'Sundry Creditors')
    : await ensureLedger(tx, 'Sundry Creditors (General)', 'Sundry Creditors');

  // 2. Separate base purchase amount and tax amount
  const taxAmount = parseFloat(String(purchase.taxAmount || 0));
  const subTotal = parseFloat(String(purchase.subTotal || 0));
  const baseAmount = subTotal > 0 ? subTotal : (taxAmount > 0 ? totalAmount - taxAmount : totalAmount);

  const entries = [];

  if (taxAmount > 0) {
    const taxLedger = await ensureLedger(tx, 'Tax Account', 'Duties & Taxes');
    entries.push({ ledgerId: purchaseLedger.id, type: 'DEBIT', amount: baseAmount });
    entries.push({ ledgerId: taxLedger.id, type: 'DEBIT', amount: taxAmount });
    entries.push({ ledgerId: supplierLedger.id, type: 'CREDIT', amount: totalAmount });
  } else {
    entries.push({ ledgerId: purchaseLedger.id, type: 'DEBIT', amount: totalAmount });
    entries.push({ ledgerId: supplierLedger.id, type: 'CREDIT', amount: totalAmount });
  }

  // 3. Post Purchase Voucher
  const mainNarration = `${paymentMethod || 'Credit'} Purchase Bill #${reference}`;
  await postVoucher(tx, {
    type: 'PURCHASE',
    date: purchaseDate || new Date(),
    amount: totalAmount,
    narration: mainNarration,
    reference: reference,
    createdBy: userId,
    branchId: purchase.branchId
  }, entries);

  // 3. If Payment is not Credit, also settle the Supplier Ledger (Cr Bank/Cash, Dr Supplier)
  const isSettled = paymentMethod && paymentMethod.toUpperCase() !== 'CREDIT';

  if (isSettled) {
    let paymentLedger;
    const methodUpper = paymentMethod.toUpperCase();
    if (methodUpper.includes('CASH')) {
      paymentLedger = await getLedgerByRole(tx, 'PAYMENT', 'CASH', 'Cash', 'Cash-in-Hand');
    } else {
      paymentLedger = await getLedgerByRole(tx, 'PAYMENT', 'BANK', 'Bank Account', 'Bank Accounts');
    }

    await postVoucher(tx, {
      type: 'PAYMENT',
      date: purchaseDate || new Date(),
      amount: totalAmount,
      narration: `${paymentMethod} Settlement for Bill #${reference}`,
      reference: reference,
      createdBy: userId,
      branchId: purchase.branchId
    }, [
      { ledgerId: supplierLedger.id, type: 'DEBIT', amount: totalAmount },
      { ledgerId: paymentLedger.id, type: 'CREDIT', amount: totalAmount }
    ]);
  }
}

/**
 * Validate and resolve branch filtering for accounting reports and operations.
 * Enforces strict user authorization:
 * - If user is bound to a branch (req.user.branchId is set):
 *     - Only permitted to access their assigned branch.
 *     - Requesting another branch returns 403 Forbidden.
 *     - Requesting 'all' resolves safely to their assigned branch.
 * - If user is global admin (req.user.role === 'admin' && !req.user.branchId):
 *     - Can request any specific branch or 'all' (consolidated).
 * @param {Object} req - Express request
 * @param {string|number} requestedBranchId - Query param branchId
 * @returns {Promise<Object>} { branchId, isConsolidated, activeBranch, branches, branchFilter }
 */
async function resolveBranchFilter(req, requestedBranchId) {
  const user = req.user || {};
  const allBranches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, currencyCode: true, currencySymbol: true },
    orderBy: { id: 'asc' }
  });

  // User restricted to a specific branch
  if (user.branchId) {
    if (requestedBranchId && requestedBranchId !== 'all' && parseInt(requestedBranchId) !== user.branchId) {
      const err = new Error('Access denied: You do not have permission to access another branch');
      err.status = 403;
      throw err;
    }
    const userBranch = allBranches.find(b => b.id === user.branchId) || null;
    return {
      branchId: user.branchId,
      isConsolidated: false,
      activeBranch: userBranch,
      branches: userBranch ? [userBranch] : [],
      branchFilter: { branchId: user.branchId }
    };
  }

  // Global Admin
  if (!requestedBranchId || requestedBranchId === 'all') {
    return {
      branchId: null,
      isConsolidated: true,
      activeBranch: null,
      branches: allBranches,
      branchFilter: {}
    };
  }

  const parsedId = parseInt(requestedBranchId);
  const targetBranch = allBranches.find(b => b.id === parsedId);
  if (!targetBranch) {
    const err = new Error('Branch not found');
    err.status = 404;
    throw err;
  }

  return {
    branchId: parsedId,
    isConsolidated: false,
    activeBranch: targetBranch,
    branches: allBranches,
    branchFilter: { branchId: parsedId }
  };
}

module.exports = {
  ensureLedger,
  postVoucher,
  getLedgerByRole,
  evaluateFormula,
  processSalePosting,
  processPurchasePosting,
  resolveBranchFilter
};
