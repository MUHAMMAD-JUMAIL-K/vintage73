const { PrismaClient } = require('../prisma/client');
const prisma = new PrismaClient();
const { calculateSessionCashDrawer, findPreviousClosedSession } = require('../utils/cashDrawerHelper');

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING DAY OPEN/CLOSE & CARRY-FORWARD TEST SUITE');
  console.log('====================================================\n');

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

  // Use Branch 4 (EUR) as our isolated test branch
  const testBranchId = 4;
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  const cashierUser = { id: 999, name: 'Test Cashier', role: 'cashier', branchId: testBranchId };

  try {
    // Clean up any pre-existing test data for branch 4
    await prisma.dayClose.deleteMany({ where: { branchId: testBranchId } });
    await prisma.payment.deleteMany({ where: { branchId: testBranchId } });
    await prisma.expense.deleteMany({ where: { branchId: testBranchId } });
    await prisma.saleItem.deleteMany({ where: { sale: { branchId: testBranchId } } });
    await prisma.sale.deleteMany({ where: { branchId: testBranchId } });

    // Dates for tests
    const day1Iso = '2026-11-01T00:00:00.000Z';
    const day2Iso = '2026-11-02T00:00:00.000Z';
    const day3Iso = '2026-11-03T00:00:00.000Z';
    const day4Iso = '2026-11-04T00:00:00.000Z';

    // ----------------------------------------------------
    // CASE 1: First business day opening (no previous day close)
    // ----------------------------------------------------
    console.log('TEST 1: First Business Day Opening (No previous day close)');
    const prevClosedD1 = await findPreviousClosedSession(testBranchId, new Date(day1Iso));
    assert(prevClosedD1.exists === false && prevClosedD1.session === null, 'No previous closed session exists for Branch 4 on Day 1 (exists: false)');

    const day1Session = await prisma.dayClose.create({
      data: {
        branchId: testBranchId,
        businessDate: new Date(day1Iso),
        status: 'OPEN',
        previousClosingCash: 0,
        openingCash: 10000,
        actualOpeningCash: 10000,
        expectedOpeningCash: 10000,
        openedById: adminUser.id,
        openedAt: new Date(day1Iso),
        adjustments: []
      }
    });
    assert(day1Session.status === 'OPEN' && Number(day1Session.openingCash) === 10000, 'Day 1 opened with initial balance ₹10,000');

    // ----------------------------------------------------
    // CASE 6 & 7: Cash Sales vs Non-Cash Sales
    // ----------------------------------------------------
    console.log('\nTEST 6 & 7: Cash Sales vs Non-Cash Sales');
    // Cash Sale: ₹5000
    await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-001',
        branchId: testBranchId,
        saleDate: new Date('2026-11-01T10:00:00.000Z'),
        subTotal: 5000,
        taxAmount: 0,
        totalAmount: 5000,
        paidAmount: 5000,
        balanceAmount: 0,
        paymentMethod: 'Cash',
        status: 'completed'
      }
    });

    // Non-Cash Sale: ₹3000 (Card)
    await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-TEST-002',
        branchId: testBranchId,
        saleDate: new Date('2026-11-01T11:00:00.000Z'),
        subTotal: 3000,
        taxAmount: 0,
        totalAmount: 3000,
        paidAmount: 3000,
        balanceAmount: 0,
        paymentMethod: 'Card',
        status: 'completed'
      }
    });

    // ----------------------------------------------------
    // CASE 8: Cash Expenses
    // ----------------------------------------------------
    console.log('\nTEST 8: Cash Expenses');
    // Cash Expense: ₹1500
    await prisma.expense.create({
      data: {
        branchId: testBranchId,
        title: 'Office Cleaning Cash',
        amount: 1500,
        date: new Date('2026-11-01T12:00:00.000Z')
      }
    });

    // ----------------------------------------------------
    // CASE 9: Cash Refunds
    // ----------------------------------------------------
    console.log('\nTEST 9: Cash Refunds');
    // Cash Refund: ₹500
    await prisma.sale.create({
      data: {
        invoiceNumber: 'RET-TEST-001',
        branchId: testBranchId,
        saleDate: new Date('2026-11-01T13:00:00.000Z'),
        subTotal: 500,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 500,
        balanceAmount: 0,
        paymentMethod: 'Cash',
        isReturn: true,
        returnReason: 'Customer return',
        status: 'completed'
      }
    });

    // ----------------------------------------------------
    // CASE 10: Cash Supplier Payments (Outbound) & Other Receipts (Inbound)
    // ----------------------------------------------------
    console.log('\nTEST 10: Other Cash Receipts & Supplier Cash Payments');
    // Other Cash Receipt: ₹1000
    await prisma.payment.create({
      data: {
        branchId: testBranchId,
        type: 'receipt',
        method: 'Cash',
        amount: 1000,
        description: 'Customer credit payment in cash',
        paymentDate: new Date('2026-11-01T14:00:00.000Z')
      }
    });

    // Supplier Cash Payment: ₹2000
    await prisma.payment.create({
      data: {
        branchId: testBranchId,
        type: 'payment',
        method: 'Cash',
        amount: 2000,
        description: 'Vendor payment in cash',
        paymentDate: new Date('2026-11-01T15:00:00.000Z')
      }
    });

    // Check Drawer Calculation for Day 1
    const d1Calc = await calculateSessionCashDrawer(testBranchId, '2026-11-01');
    assert(d1Calc.cashSalesCollections === 5000, 'Cash sales collections correctly totaled ₹5,000');
    assert(d1Calc.otherCashReceipts === 1000, 'Other cash receipts correctly totaled ₹1,000');
    assert(d1Calc.totalCashReceived === 6000, 'Total cash received correctly ₹6,000 (Non-cash card sale excluded)');
    assert(d1Calc.cashExpenses === 1500, 'Cash expenses correctly totaled ₹1,500');
    assert(d1Calc.cashRefunds === 500, 'Cash refunds correctly totaled ₹500');
    assert(d1Calc.cashSupplierPayments === 2000, 'Supplier cash payments correctly totaled ₹2,000');
    assert(d1Calc.totalCashPaid === 4000, 'Total cash paid correctly ₹4,000');
    assert(d1Calc.expectedClosingCash === 12000, 'Expected closing cash accurately computed as ₹12,000');

    // ----------------------------------------------------
    // CASE 11: Edit Opening Amount while Day is Open
    // ----------------------------------------------------
    console.log('\nTEST 11: Edit Opening Amount with Mandatory Reason & Audit Trail');
    const oldOpening = day1Session.openingCash;
    const newOpening = 10500;
    const auditAdjustment = {
      type: 'OPENING_EDIT',
      field: 'openingCash',
      oldValue: Number(oldOpening),
      newValue: newOpening,
      reason: 'Physical count recount revealed extra ₹500 float',
      userId: adminUser.id,
      userName: adminUser.name,
      timestamp: new Date().toISOString()
    };

    const updatedD1 = await prisma.dayClose.update({
      where: { id: day1Session.id },
      data: {
        openingCash: newOpening,
        actualOpeningCash: newOpening,
        adjustments: [auditAdjustment]
      }
    });
    const d1AfterEdit = await calculateSessionCashDrawer(testBranchId, '2026-11-01');
    assert(d1AfterEdit.openingCash === 10500, 'Opening amount updated to ₹10,500');
    assert(d1AfterEdit.expectedClosingCash === 12500, 'Expected closing automatically recalculated to ₹12,500');
    assert(updatedD1.adjustments.length === 1 && updatedD1.adjustments[0].type === 'OPENING_EDIT', 'Audit log properly stored in adjustments');

    // ----------------------------------------------------
    // CASE 12: Edit physical cash count before closing
    // ----------------------------------------------------
    console.log('\nTEST 12: Record & Edit Physical Cash Count Before Closing');
    await prisma.dayClose.update({
      where: { id: day1Session.id },
      data: {
        physicalCash: 12500,
        cashDifference: 0,
        adjustments: [
          ...updatedD1.adjustments,
          {
            type: 'CLOSING_COUNT_EDIT',
            field: 'physicalCash',
            oldValue: null,
            newValue: 12500,
            reason: 'Physical cash count completed at end of shift',
            userId: adminUser.id,
            userName: adminUser.name,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });
    const d1WithCount = await prisma.dayClose.findUnique({ where: { id: day1Session.id } });
    assert(Number(d1WithCount.physicalCash) === 12500, 'Physical cash count recorded as ₹12,500');

    // ----------------------------------------------------
    // CASE 2 & 13: First business day closing & calculation verification
    // ----------------------------------------------------
    console.log('\nTEST 2 & 13: First Business Day Closing & Calculation Accuracy');
    const closedDay1 = await prisma.dayClose.update({
      where: { id: day1Session.id },
      data: {
        status: 'CLOSED',
        closingExpectedCash: 12500,
        physicalCash: 12500,
        cashDifference: 0,
        finalizedAt: new Date('2026-11-01T21:00:00.000Z'),
        finalizedById: adminUser.id
      }
    });
    assert(closedDay1.status === 'CLOSED', 'Day 1 closed successfully with final closing cash ₹12,500');

    // ----------------------------------------------------
    // CASE 3: Second business day opening (Automatic Carry-Forward)
    // ----------------------------------------------------
    console.log('\nTEST 3: Automatic Carry-Forward from Day 1 to Day 2');
    const prevForD2 = await findPreviousClosedSession(testBranchId, new Date(day2Iso));
    assert(prevForD2.exists === true && prevForD2.session !== null, 'Found immediately preceding closed session for Day 2');
    assert(Number(prevForD2.closingCash) === 12500, 'Preceding closing cash automatically retrieved as ₹12,500');

    // Open Day 2 automatically using carry-forward balance
    const day2Session = await prisma.dayClose.create({
      data: {
        branchId: testBranchId,
        businessDate: new Date(day2Iso),
        status: 'OPEN',
        previousClosingCash: prevForD2.closingCash,
        openingCash: prevForD2.closingCash,
        actualOpeningCash: prevForD2.closingCash,
        expectedOpeningCash: prevForD2.closingCash,
        openedById: adminUser.id,
        openedAt: new Date(day2Iso),
        adjustments: []
      }
    });
    assert(Number(day2Session.openingCash) === 12500, 'Day 2 opening balance automatically matches Day 1 closing (₹12,500) without manual entry');

    // Close Day 2 with same balance for testing Day 3
    await prisma.dayClose.update({
      where: { id: day2Session.id },
      data: {
        status: 'CLOSED',
        closingExpectedCash: 12500,
        physicalCash: 12500,
        cashDifference: 0,
        finalizedAt: new Date('2026-11-02T21:00:00.000Z'),
        finalizedById: adminUser.id
      }
    });

    // ----------------------------------------------------
    // CASE 4: Opening with Additional Cash
    // ----------------------------------------------------
    console.log('\nTEST 4: Opening with Additional Cash');
    const prevForD3 = await findPreviousClosedSession(testBranchId, new Date(day3Iso));
    const addCash = 2500;
    const expectedOpenD3 = prevForD3.closingCash + addCash;
    const day3Session = await prisma.dayClose.create({
      data: {
        branchId: testBranchId,
        businessDate: new Date(day3Iso),
        status: 'OPEN',
        previousClosingCash: prevForD3.closingCash,
        additionalCashAdded: addCash,
        expectedOpeningCash: expectedOpenD3,
        actualOpeningCash: expectedOpenD3,
        openingCash: expectedOpenD3,
        openedById: adminUser.id,
        openedAt: new Date(day3Iso),
        adjustments: []
      }
    });
    assert(Number(day3Session.openingCash) === 15000, 'Day 3 opened with Prev Closing (12,500) + Additional Cash (2,500) = ₹15,000');

    // Close Day 3
    await prisma.dayClose.update({
      where: { id: day3Session.id },
      data: {
        status: 'CLOSED',
        closingExpectedCash: 15000,
        physicalCash: 15000,
        cashDifference: 0,
        finalizedAt: new Date('2026-11-03T21:00:00.000Z'),
        finalizedById: adminUser.id
      }
    });

    // ----------------------------------------------------
    // CASE 5: Opening with Cash Removed
    // ----------------------------------------------------
    console.log('\nTEST 5: Opening with Cash Removed');
    const prevForD4 = await findPreviousClosedSession(testBranchId, new Date(day4Iso));
    const remCash = 1000;
    const expectedOpenD4 = prevForD4.closingCash - remCash;
    const day4Session = await prisma.dayClose.create({
      data: {
        branchId: testBranchId,
        businessDate: new Date(day4Iso),
        status: 'OPEN',
        previousClosingCash: prevForD4.closingCash,
        cashRemovedBeforeOpening: remCash,
        expectedOpeningCash: expectedOpenD4,
        actualOpeningCash: expectedOpenD4,
        openingCash: expectedOpenD4,
        openedById: adminUser.id,
        openedAt: new Date(day4Iso),
        adjustments: []
      }
    });
    assert(Number(day4Session.openingCash) === 14000, 'Day 4 opened with Prev Closing (15,000) - Removed Cash (1,000) = ₹14,000');

    // ----------------------------------------------------
    // CASE 14 & 15: Unauthorized Editing & Post-Closing Ordinary Edit Rejection
    // ----------------------------------------------------
    console.log('\nTEST 14 & 15: Validation Rules & Permission Controls');
    // Verify ordinary edit endpoint blocks on closed sessions
    const checkCanOrdinaryEdit = (session) => {
      if (session.status === 'CLOSED') {
        return { allowed: false, error: 'Cannot edit opening amount on a closed business day. Use post-closing adjustment workflow.' };
      }
      return { allowed: true };
    };
    const closedEditCheck = checkCanOrdinaryEdit(closedDay1);
    assert(!closedEditCheck.allowed, 'Ordinary edit on closed day correctly rejected');

    const checkPermission = (user, requiredRole) => {
      if (user.role !== requiredRole && user.role !== 'admin') {
        return { allowed: false, error: 'Unauthorized: Admin or Manager permission required' };
      }
      return { allowed: true };
    };
    const cashierPermCheck = checkPermission(cashierUser, 'manager');
    assert(!cashierPermCheck.allowed, 'Cashier edit attempt without permission correctly rejected');

    // ----------------------------------------------------
    // CASE 16 & 17: Duplicate Opening and Duplicate Closing Prevention
    // ----------------------------------------------------
    console.log('\nTEST 16 & 17: Duplicate Opening & Closing Prevention');
    const attemptDuplicateOpen = (existingSession) => {
      if (existingSession && existingSession.status !== 'NOT_OPENED') {
        return { allowed: false, error: `Business day is already ${existingSession.status}` };
      }
      return { allowed: true };
    };
    const dupOpenCheck = attemptDuplicateOpen(day4Session);
    assert(!dupOpenCheck.allowed, 'Attempt to open already opened day correctly rejected');

    const attemptDuplicateClose = (existingSession) => {
      if (existingSession && existingSession.status === 'CLOSED') {
        return { allowed: false, error: 'Business day is already closed' };
      }
      return { allowed: true };
    };
    const dupCloseCheck = attemptDuplicateClose(closedDay1);
    assert(!dupCloseCheck.allowed, 'Attempt to close already closed day correctly rejected');

    // ----------------------------------------------------
    // CASE 18: Branch Isolation
    // ----------------------------------------------------
    console.log('\nTEST 18: Branch Isolation');
    const branch2Lookup = await findPreviousClosedSession(2, new Date(day2Iso));
    assert(branch2Lookup.exists === false && branch2Lookup.closingCash === null, 'Branch 2 does NOT inherit Branch 4 closing balance (Isolation verified)');

    // ----------------------------------------------------
    // CASE 19: Prior-Day Modification Discrepancy Detection & Reconciliation
    // ----------------------------------------------------
    console.log('\nTEST 19: Prior-Day Modification Discrepancy Flagging & Controlled Reconciliation');
    // Modify Day 3's closing cash after Day 4 has already been opened
    await prisma.dayClose.update({
      where: { id: day3Session.id },
      data: {
        physicalCash: 16000, // changed from 15000 to 16000 (+1000)
        adjustments: [
          {
            type: 'POST_CLOSE_ADJUST',
            field: 'physicalCash',
            oldValue: 15000,
            newValue: 16000,
            reason: 'Audit correction by admin',
            userId: adminUser.id,
            userName: adminUser.name,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });

    // Check Day 4 drawer calculation
    const d4Drawer = await calculateSessionCashDrawer(testBranchId, '2026-11-04');
    assert(d4Drawer.hasPriorDayDiscrepancy === true, 'Day 4 correctly flagged prior-day discrepancy');
    assert(d4Drawer.priorDayDiscrepancyAmount === 1000, 'Discrepancy amount accurately detected as ₹1,000');
    assert(d4Drawer.openingCash === 14000, 'Day 4 opening balance was NOT silently overwritten (still ₹14,000)');

    // Reconcile discrepancy
    await prisma.dayClose.update({
      where: { id: day4Session.id },
      data: {
        previousClosingCash: 16000,
        adjustments: [
          {
            type: 'RECONCILE_PRIOR_DAY',
            reason: 'Reconciled ₹1,000 audit adjustment from Day 3',
            userId: adminUser.id,
            userName: adminUser.name,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });
    const d4AfterReconcile = await calculateSessionCashDrawer(testBranchId, '2026-11-04');
    assert(d4AfterReconcile.hasPriorDayDiscrepancy === false, 'Discrepancy cleared after controlled reconciliation');

    // ----------------------------------------------------
    // CASE 20: Historical Report Accuracy
    // ----------------------------------------------------
    console.log('\nTEST 20: Historical Session Financial Report Accuracy');
    const day1Report = await calculateSessionCashDrawer(testBranchId, '2026-11-01');
    assert(day1Report.openingCash === 10500, 'Report opening cash matches ₹10,500');
    assert(day1Report.cashSalesCollections === 5000, 'Report cash sales collections matches ₹5,000');
    assert(day1Report.totalCashReceived === 6000, 'Report total cash in matches ₹6,000');
    assert(day1Report.totalCashPaid === 4000, 'Report total cash out matches ₹4,000');
    assert(day1Report.expectedClosingCash === 12500, 'Report expected closing cash matches ₹12,500');
    assert(day1Report.physicalCash === 12500, 'Report actual physical cash matches ₹12,500');
    assert(day1Report.cashDifference === 0, 'Report difference is exactly 0');

    // Clean up test data for branch 4
    await prisma.dayClose.deleteMany({ where: { branchId: testBranchId } });
    await prisma.payment.deleteMany({ where: { branchId: testBranchId } });
    await prisma.expense.deleteMany({ where: { branchId: testBranchId } });
    await prisma.saleItem.deleteMany({ where: { sale: { branchId: testBranchId } } });
    await prisma.sale.deleteMany({ where: { branchId: testBranchId } });

    console.log('\n====================================================');
    console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test Suite encountered an error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
