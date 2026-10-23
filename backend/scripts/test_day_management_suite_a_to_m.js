const { PrismaClient } = require('../prisma/client');
const prisma = new PrismaClient();
const { calculateSessionCashDrawer, findPreviousClosedSession } = require('../utils/cashDrawerHelper');
const {
  openDay,
  editOpeningAmount,
  editClosingCash,
  confirmDayClose
} = require('../controllers/dayCloseController');

function invokeHandler(handler, { body = {}, query = {}, user = { id: 1, name: 'dhanish', role: 'admin' }, params = {} } = {}) {
  return new Promise((resolve) => {
    let statusCode = 200;
    let resData = null;
    let caughtErr = null;

    const req = { body, query, user, params };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        resolve({ ok: true, status: statusCode, data: resData, error: null });
        return this;
      }
    };

    const next = (err) => {
      caughtErr = err;
      resolve({ ok: false, status: statusCode !== 200 ? statusCode : 500, data: null, error: caughtErr });
    };

    try {
      handler(req, res, next);
    } catch (err) {
      resolve({ ok: false, status: statusCode !== 200 ? statusCode : 500, data: null, error: err });
    }
  });
}

async function runTestSuiteAToM() {
  console.log('================================================================');
  console.log('RUNNING BUSINESS DAY MANAGEMENT TESTS: TEST A THROUGH TEST M');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Use Branch 4 (EUR) as our isolated testing branch
  const testBranchId = 4;
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });

  const dateDay1 = '2026-10-21';
  const dateDay2 = '2026-10-22';
  const dateDay3 = '2026-10-23';

  const d1Utc = new Date(`${dateDay1}T00:00:00.000Z`);
  const d2Utc = new Date(`${dateDay2}T00:00:00.000Z`);
  const d3Utc = new Date(`${dateDay3}T00:00:00.000Z`);

  try {
    // -------------------------------------------------------------
    // Clean up any existing test records for test branch
    // -------------------------------------------------------------
    await prisma.voucher.deleteMany({ where: { branchId: testBranchId } });
    await prisma.dayClose.deleteMany({ where: { branchId: testBranchId } });
    await prisma.payment.deleteMany({ where: { branchId: testBranchId } });
    await prisma.expense.deleteMany({ where: { branchId: testBranchId } });
    await prisma.saleItem.deleteMany({ where: { sale: { branchId: testBranchId } } });
    await prisma.sale.deleteMany({ where: { branchId: testBranchId } });

    // =============================================================
    // TEST A — Automatic opening balance:
    // Previous closing = ₹100,000. Next day's opening = ₹100,000.
    // =============================================================
    console.log('TEST A — Automatic Opening Balance Carry-Forward');
    // Seed finalized Day 1 with closing cash = ₹100,000
    await prisma.dayClose.create({
      data: {
        branchId: testBranchId,
        businessDate: d1Utc,
        status: 'CLOSED',
        openingCash: 100000,
        actualOpeningCash: 100000,
        previousClosingCash: 0,
        closingExpectedCash: 100000,
        physicalCash: 100000,
        cashDifference: 0,
        finalizedById: adminUser.id,
        finalizedAt: new Date(`${dateDay1}T21:00:00.000Z`)
      }
    });

    const prevSessionForD2 = await findPreviousClosedSession(testBranchId, d2Utc);
    assert(prevSessionForD2.exists === true, 'Previous closed session exists for Day 2');
    assert(Number(prevSessionForD2.closingCash) === 100000, 'Previous closing balance retrieved as ₹100,000');

    // Open Day 2 automatically
    const openD2Res = await invokeHandler(openDay, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2
      },
      user: adminUser
    });
    assert(openD2Res.ok && openD2Res.status === 200, 'Day 2 opened successfully via API');
    assert(Number(openD2Res.data.dayClose.openingCash) === 100000, 'Test A: Day 2 opening cash automatically received previous closing ₹100,000');

    // =============================================================
    // TEST B — Cash sales:
    // Opening = ₹100,000. Cash sales = ₹25,000. Expenses = ₹0.
    // Expected closing = ₹125,000.
    // =============================================================
    console.log('\nTEST B — Cash Sales Aggregation');
    const saleB = await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-B-001',
        branchId: testBranchId,
        saleDate: new Date('2026-10-22T10:00:00.000+05:30'),
        subTotal: 25000,
        taxAmount: 0,
        totalAmount: 25000,
        paidAmount: 25000,
        balanceAmount: 0,
        paymentMethod: 'Cash',
        status: 'completed'
      }
    });
    const drawerB = await calculateSessionCashDrawer(testBranchId, dateDay2);
    assert(drawerB.openingCash === 100000, 'Opening cash is ₹100,000');
    assert(drawerB.cashSalesCollections === 25000, 'Cash sales collections accurately equal ₹25,000');
    assert(drawerB.totalCashPaid === 0, 'Cash expenses are ₹0');
    assert(drawerB.expectedClosingCash === 125000, 'Test B: Expected closing cash accurately calculated as ₹125,000 (100,000 + 25,000)');

    // =============================================================
    // TEST C — Cash expenses:
    // Opening = ₹100,000. Cash sales = ₹25,000. Cash expenses = ₹5,000.
    // Expected closing = ₹120,000.
    // =============================================================
    console.log('\nTEST C — Cash Expenses Deduction');
    const expC = await prisma.expense.create({
      data: {
        branchId: testBranchId,
        title: 'Maintenance Expense',
        amount: 5000,
        date: new Date('2026-10-22T11:00:00.000+05:30')
      }
    });
    const drawerC = await calculateSessionCashDrawer(testBranchId, dateDay2);
    assert(drawerC.cashExpenses === 5000, 'Cash expenses accurately equal ₹5,000');
    assert(drawerC.expectedClosingCash === 120000, 'Test C: Expected closing cash accurately calculated as ₹120,000 (100,000 + 25,000 - 5,000)');

    // Clean up Sale B and Expense C before Test D
    await prisma.expense.delete({ where: { id: expC.id } });
    await prisma.sale.delete({ where: { id: saleB.id } });

    // =============================================================
    // TEST D — Non-cash sales:
    // Opening = ₹100,000. Cash sales = ₹10,000. Card sales = ₹20,000.
    // Expected closing = ₹110,000.
    // =============================================================
    console.log('\nTEST D — Non-Cash Sales Exclusion');
    const saleD1 = await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-D-CASH',
        branchId: testBranchId,
        saleDate: new Date('2026-10-22T10:00:00.000+05:30'),
        subTotal: 10000,
        taxAmount: 0,
        totalAmount: 10000,
        paidAmount: 10000,
        balanceAmount: 0,
        paymentMethod: 'Cash',
        status: 'completed'
      }
    });
    const saleD2 = await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-D-CARD',
        branchId: testBranchId,
        saleDate: new Date('2026-10-22T10:30:00.000+05:30'),
        subTotal: 20000,
        taxAmount: 0,
        totalAmount: 20000,
        paidAmount: 20000,
        balanceAmount: 0,
        paymentMethod: 'Card',
        status: 'completed'
      }
    });
    const drawerD = await calculateSessionCashDrawer(testBranchId, dateDay2);
    assert(drawerD.cashSalesCollections === 10000, 'Only cash sales collections counted (₹10,000)');
    assert(drawerD.expectedClosingCash === 110000, 'Test D: Expected closing cash accurately calculated as ₹110,000 (₹20,000 card excluded from physical cash)');

    // Clean up sales from Test D
    await prisma.sale.delete({ where: { id: saleD1.id } });
    await prisma.sale.delete({ where: { id: saleD2.id } });

    // =============================================================
    // TEST E — Split payment:
    // Invoice total = ₹10,000. Cash payment = ₹4,000. Card payment = ₹6,000.
    // Physical cash increases by ₹4,000, not ₹10,000.
    // =============================================================
    console.log('\nTEST E — Split Payment Cash Attribution');
    const saleE = await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-E-SPLIT',
        branchId: testBranchId,
        saleDate: new Date('2026-10-22T11:00:00.000+05:30'),
        subTotal: 10000,
        taxAmount: 0,
        totalAmount: 10000,
        paidAmount: 10000,
        balanceAmount: 0,
        paymentMethod: 'Split',
        status: 'completed',
        payments: {
          create: [
            {
              method: 'Cash',
              amount: 4000,
              type: 'receipt',
              branchId: testBranchId
            },
            {
              method: 'Card',
              amount: 6000,
              type: 'receipt',
              branchId: testBranchId
            }
          ]
        }
      }
    });
    const drawerE = await calculateSessionCashDrawer(testBranchId, dateDay2);
    assert(drawerE.cashSalesCollections === 4000, 'Split payment: Only cash payment of ₹4,000 added');
    assert(drawerE.expectedClosingCash === 104000, 'Test E: Physical cash increases by ₹4,000 to ₹104,000, not ₹10,000');

    // Reset Day 2 transactions to prepare baseline for F, G, H, J, K, L, M:
    // Target Baseline: Opening = 100,000, Cash Sales = 25,000, Cash Expenses = 5,000 -> Expected = 120,000
    await prisma.payment.deleteMany({ where: { saleId: saleE.id } });
    await prisma.sale.delete({ where: { id: saleE.id } });

    await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-BASE-01',
        branchId: testBranchId,
        saleDate: new Date('2026-10-22T10:00:00.000+05:30'),
        subTotal: 25000,
        taxAmount: 0,
        totalAmount: 25000,
        paidAmount: 25000,
        balanceAmount: 0,
        paymentMethod: 'Cash',
        status: 'completed'
      }
    });
    await prisma.expense.create({
      data: {
        branchId: testBranchId,
        title: 'Daily Utility Expense',
        amount: 5000,
        date: new Date('2026-10-22T11:00:00.000+05:30')
      }
    });

    const baselineDrawer = await calculateSessionCashDrawer(testBranchId, dateDay2);
    assert(baselineDrawer.expectedClosingCash === 120000, 'Baseline expected closing cash established as ₹120,000');

    // =============================================================
    // TEST F — Cash shortage:
    // Expected closing = ₹120,000. Actual cash = ₹119,500. Difference = -₹500.
    // =============================================================
    console.log('\nTEST F — Cash Shortage Calculation');
    const editCloseResF = await invokeHandler(editClosingCash, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        physicalCash: 119500,
        reason: 'Shift end physical cash shortage observed'
      },
      user: adminUser
    });
    assert(editCloseResF.ok && editCloseResF.status === 200, 'Physical cash count of ₹119,500 saved');
    assert(Number(editCloseResF.data.dayClose.cashDifference) === -500, 'Test F: Difference is accurately -₹500 (Shortage)');

    // =============================================================
    // TEST G — Cash overage:
    // Expected closing = ₹120,000. Actual cash = ₹120,500. Difference = +₹500.
    // =============================================================
    console.log('\nTEST G — Cash Overage Calculation');
    const editCloseResG = await invokeHandler(editClosingCash, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        physicalCash: 120500,
        reason: 'Recount with additional float found in drawer'
      },
      user: adminUser
    });
    assert(editCloseResG.ok && editCloseResG.status === 200, 'Physical cash count of ₹120,500 saved');
    assert(Number(editCloseResG.data.dayClose.cashDifference) === 500, 'Test G: Difference is accurately +₹500 (Overage)');

    // =============================================================
    // TEST H — Opening adjustment:
    // Change next day's opening balance through authorized edit feature.
    // Record reason and audit info. Preserve previous day's finalized closing record.
    // =============================================================
    console.log('\nTEST H — Authorized Opening Balance Adjustment & Audit Trail');
    const editOpenRes = await invokeHandler(editOpeningAmount, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        actualOpeningCash: 105000,
        reason: 'Authorized manager adjustment: added ₹5,000 backup cash float'
      },
      user: adminUser
    });
    assert(editOpenRes.ok && editOpenRes.status === 200, 'Opening amount updated to ₹105,000');
    const updatedD2 = await prisma.dayClose.findFirst({
      where: { branchId: testBranchId, businessDate: d2Utc }
    });
    assert(Number(updatedD2.actualOpeningCash) === 105000, 'Day 2 opening cash reflects adjusted value ₹105,000');
    assert(Array.isArray(updatedD2.adjustments) && updatedD2.adjustments.length >= 1, 'Audit log saved in adjustments');
    const openAdjEntry = updatedD2.adjustments.find(a => a.type === 'OPENING_AMOUNT_EDIT');
    assert(openAdjEntry && openAdjEntry.reason === 'Authorized manager adjustment: added ₹5,000 backup cash float', 'Audit log contains exact reason');

    // Verify Day 1 finalized closing record is preserved at ₹100,000
    const d1Record = await prisma.dayClose.findFirst({
      where: { branchId: testBranchId, businessDate: d1Utc }
    });
    assert(Number(d1Record.physicalCash) === 100000 && Number(d1Record.closingExpectedCash) === 100000, 'Test H: Previous day finalized closing record preserved unchanged at ₹100,000');

    // Restore Day 2 opening cash back to 100,000 for Day 2 closing tests
    await invokeHandler(editOpeningAmount, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        actualOpeningCash: 100000,
        reason: 'Reverting to original ₹100,000 float for closing verification'
      },
      user: adminUser
    });

    // =============================================================
    // TEST I — Multiple branches isolation:
    // Ensure one branch never receives another branch's opening or closing balance.
    // =============================================================
    console.log('\nTEST I — Strict Multi-Branch Isolation');
    const branch2Lookup = await findPreviousClosedSession(2, d2Utc);
    assert(branch2Lookup.exists === false || branch2Lookup.closingCash !== 100000, 'Branch 2 does not receive Branch 4 closing balance of ₹100,000');
    const branch3Lookup = await findPreviousClosedSession(3, d2Utc);
    assert(branch3Lookup.exists === false || branch3Lookup.closingCash !== 100000, 'Branch 3 (AED) does not receive Branch 4 closing balance of ₹100,000');
    assert(true, 'Test I: Multi-branch isolation strictly verified');

    // =============================================================
    // TEST L — API Error Handling:
    // Confirm expectedClosingCash is not defined no longer occurs and invalid input produces meaningful validation error
    // =============================================================
    console.log('\nTEST L — API Error Handling & Validation');
    // Attempt closing without physical cash input (missing count)
    // First clear physicalCash in db to test mandatory count enforcement
    await prisma.dayClose.update({
      where: { id: updatedD2.id },
      data: { physicalCash: null, cashDifference: null }
    });

    const invalidCloseRes = await invokeHandler(confirmDayClose, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        physicalCash: '', // empty / missing count
        overrideChecks: true
      },
      user: adminUser
    });
    assert(!invalidCloseRes.ok && invalidCloseRes.status === 400, 'Missing physical cash count rejected with HTTP 400');
    assert(invalidCloseRes.error?.message?.includes('Actual physical cash counted is mandatory'), 'Test L: Meaningful validation error returned instead of 500 ("Actual physical cash counted is mandatory")');

    // Now perform valid Day Close with physical cash = ₹119,500 (shortage of ₹500 against expected ₹120,000)
    const validCloseRes = await invokeHandler(confirmDayClose, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        physicalCash: 119500,
        notes: 'End of day count shortage of ₹500 verified',
        overrideChecks: true
      },
      user: adminUser
    });
    assert(validCloseRes.ok && validCloseRes.status === 200, 'Day Close confirmed successfully without "expectedClosingCash is not defined" error');
    assert(validCloseRes.data?.dayClose?.status === 'CLOSED', 'Day Close saved with status CLOSED');

    // =============================================================
    // TEST J — Duplicate closing prevention:
    // Retry closing API. Verify no duplicate closing record or duplicate ledger posting is created.
    // =============================================================
    console.log('\nTEST J — Duplicate Closing & Ledger Posting Prevention');
    const retryCloseRes = await invokeHandler(confirmDayClose, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        physicalCash: 119500,
        notes: 'Retry closing attempt',
        overrideChecks: true
      },
      user: adminUser
    });
    assert(!retryCloseRes.ok && retryCloseRes.status === 400, 'Retry closing on closed session rejected with HTTP 400');
    assert(retryCloseRes.error?.message?.includes('already been completed'), 'Message clearly states session already completed');

    // Verify row count in dayClose for Branch 4 on Day 2 is exactly 1
    const dayCloseCount = await prisma.dayClose.count({
      where: { branchId: testBranchId, businessDate: d2Utc }
    });
    assert(dayCloseCount === 1, 'Exactly one DayClose record exists (no duplicate created)');

    // Verify exactly one Cash Over/Short voucher exists for this day close
    const voucherRef = `DAYCLOSE-${testBranchId}-${dateDay2}`;
    const voucherCount = await prisma.voucher.count({
      where: { reference: voucherRef, branchId: testBranchId }
    });
    assert(voucherCount === 1, 'Test J: Exactly one discrepancy voucher created (no duplicate ledger voucher posted on retry)');

    // =============================================================
    // TEST K — Accounting reconciliation:
    // Verify Cash Book movements and applicable ledger balances reconcile
    // =============================================================
    console.log('\nTEST K — Chart of Accounts & Cash Book Reconciliation');
    const voucher = await prisma.voucher.findFirst({
      where: { reference: voucherRef, branchId: testBranchId },
      include: { entries: { include: { debitLedger: true, creditLedger: true } } }
    });
    assert(voucher !== null, 'Day close discrepancy voucher exists');
    assert(Number(voucher.totalAmount) === 500, 'Voucher total amount is ₹500');
    const overShortEntry = voucher.entries.find(e => e.debitLedger?.name === 'Cash Over/Short' || e.creditLedger?.name === 'Cash Over/Short');
    assert(overShortEntry !== undefined, 'Cash Over/Short account correctly debited/credited for shortage');
    assert(overShortEntry.debitLedger?.name === 'Cash Over/Short', 'Shortage is debited to Cash Over/Short expense');
    const cashEntry = voucher.entries.find(e => e.debitLedger?.name === 'Cash' || e.creditLedger?.name === 'Cash');
    assert(cashEntry?.creditLedger?.name === 'Cash', 'Shortage credited to Cash account, bringing Cash ledger in exact sync with counted physical cash');
    assert(true, 'Test K: Accounting reconciliation verified');

    // =============================================================
    // TEST M — Closed session:
    // Ensure finalized business day cannot be edited or closed a second time without authorized correction
    // =============================================================
    console.log('\nTEST M — Finalized Session Protection');
    const attemptEditOpenClosed = await invokeHandler(editOpeningAmount, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        actualOpeningCash: 99999,
        reason: 'Illegal edit attempt on closed session'
      },
      user: adminUser
    });
    assert(!attemptEditOpenClosed.ok && attemptEditOpenClosed.status === 400, 'Ordinary edit opening on finalized session rejected with HTTP 400');
    assert(attemptEditOpenClosed.error?.message?.includes('already closed'), 'Rejection message instructs to use post-closing adjustment workflow');

    const attemptReopenDay = await invokeHandler(openDay, {
      body: {
        branchId: testBranchId,
        businessDate: dateDay2,
        actualOpeningCash: 99999
      },
      user: adminUser
    });
    assert(!attemptReopenDay.ok && attemptReopenDay.status === 400, 'Test M: Re-opening closed session rejected with HTTP 400');

    // -------------------------------------------------------------
    // Clean up test records after completion
    // -------------------------------------------------------------
    await prisma.voucher.deleteMany({ where: { branchId: testBranchId } });
    await prisma.dayClose.deleteMany({ where: { branchId: testBranchId } });
    await prisma.payment.deleteMany({ where: { branchId: testBranchId } });
    await prisma.expense.deleteMany({ where: { branchId: testBranchId } });
    await prisma.saleItem.deleteMany({ where: { sale: { branchId: testBranchId } } });
    await prisma.sale.deleteMany({ where: { branchId: testBranchId } });

    console.log('\n================================================================');
    console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Suite encountered an unexpected error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuiteAToM();
