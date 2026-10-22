const prisma = require('../config/prisma');
const accountingReportsController = require('../controllers/accountingReportsController');
const accountingController = require('../controllers/accountingController');

// Mock req and res helper
function mockReqRes(query = {}, user = { id: 1, role: 'admin' }) {
    let statusCode = 200;
    let responseData = null;
    const req = {
        query,
        user,
        headers: {},
        ip: '127.0.0.1'
    };
    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        }
    };
    return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runTests() {
    console.log('====================================================');
    console.log('STARTING CORPORATE ACCOUNTING BRANCH & CURRENCY TESTS');
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

    try {
        // 1. Verify Branches and Currencies in DB
        console.log('--- TEST GROUP 1: Branch & Currency Configuration in DB ---');
        const branches = await prisma.branch.findMany({ orderBy: { id: 'asc' } });
        assert(branches.length >= 3, `Found ${branches.length} branches in database`);
        
        const b1 = branches.find(b => b.id === 1);
        const b3 = branches.find(b => b.id === 3);
        assert(b1 && b1.currencyCode === 'INR' && b1.currencySymbol === '₹', 'Branch 1 is INR (₹)');
        assert(b3 && b3.currencyCode === 'AED' && (b3.currencySymbol === 'AED' || b3.currencySymbol === 'د.إ'), 'Branch 3 is AED (AED / د.إ)');

        // 2. Verify Voucher Integrity and Migration
        console.log('\n--- TEST GROUP 2: Voucher Data & Branch Association Integrity ---');
        const totalVouchers = await prisma.voucher.count();
        const vouchersWithoutBranch = await prisma.voucher.count({ where: { branchId: null } });
        assert(totalVouchers > 0, `Total vouchers preserved: ${totalVouchers}`);
        assert(vouchersWithoutBranch === 0, `All vouchers successfully mapped to branches (unmapped: ${vouchersWithoutBranch})`);

        // 3. Test Cash Book Controller (All Branches vs Branch 1 vs Branch 3)
        console.log('\n--- TEST GROUP 3: Cash Book Branch Filtering & Opening Balance ---');
        {
            const { req, res, getData } = mockReqRes({ branchId: 'all' });
            await accountingReportsController.getCashBook(req, res);
            const allData = getData();
            assert(allData && allData.isConsolidated === true, 'Cash Book in consolidated mode returns isConsolidated = true');
            assert(Array.isArray(allData.statement), 'Cash Book returns statement array');
            assert(typeof allData.ledger?.openingBalance === 'number', `Cash Book opening balance is numeric: ${allData.ledger?.openingBalance}`);
            assert(typeof allData.closingBalance === 'number', `Cash Book closing balance is numeric: ${allData.closingBalance}`);
        }
        {
            const { req, res, getData } = mockReqRes({ branchId: '1' });
            await accountingReportsController.getCashBook(req, res);
            const b1Data = getData();
            assert(b1Data && b1Data.branch && b1Data.branch.id === 1, 'Cash Book for branch 1 returns branch 1 metadata');
            assert(b1Data.currency && b1Data.currency.code === 'INR', 'Cash Book for branch 1 returns INR currency code');
            assert(b1Data.currency && b1Data.currency.symbol === '₹', 'Cash Book for branch 1 returns ₹ currency symbol');
        }
        {
            const { req, res, getData } = mockReqRes({ branchId: '3' });
            await accountingReportsController.getCashBook(req, res);
            const b3Data = getData();
            assert(b3Data && b3Data.branch && b3Data.branch.id === 3, 'Cash Book for branch 3 returns branch 3 metadata');
            assert(b3Data.currency && b3Data.currency.code === 'AED', 'Cash Book for branch 3 returns AED currency code');
        }

        // 4. Test Chart of Accounts / Ledgers API
        console.log('\n--- TEST GROUP 4: Chart of Accounts Branch Balances ---');
        {
            // Backwards-compatible call (no details=true)
            const { req, res, getData } = mockReqRes({});
            await accountingController.getLedgers(req, res);
            const list = getData();
            assert(Array.isArray(list), 'getLedgers without details returns plain array for backwards-compatibility');
        }
        {
            // Branch-aware call (details=true)
            const { req, res, getData } = mockReqRes({ details: 'true', branchId: '1' });
            await accountingController.getLedgers(req, res);
            const details = getData();
            assert(details && Array.isArray(details.ledgers), 'getLedgers with details=true returns ledgers array');
            assert(details.branch && details.branch.id === 1, 'getLedgers returns branch 1 metadata');
            assert(details.currency && details.currency.code === 'INR', 'getLedgers returns INR currency');
        }
        {
            // Branch 3 (AED) call
            const { req, res, getData } = mockReqRes({ details: 'true', branchId: '3' });
            await accountingController.getLedgers(req, res);
            const details = getData();
            assert(details.branch && details.branch.id === 3, 'getLedgers returns branch 3 metadata');
            assert(details.currency && details.currency.code === 'AED', 'getLedgers returns AED currency');
        }

        // 5. Test Trial Balance Controller
        console.log('\n--- TEST GROUP 5: Trial Balance Branch Filtering & Multi-Currency Handling ---');
        {
            // Consolidated mode
            const { req, res, getData } = mockReqRes({ branchId: 'all' });
            await accountingReportsController.getTrialBalance(req, res);
            const tb = getData();
            assert(tb && tb.isConsolidated === true, 'Trial Balance consolidated returns isConsolidated = true');
            assert(Array.isArray(tb.currencyBreakdown), 'Consolidated Trial Balance provides currencyBreakdown to prevent mixing differing currencies');
            assert(tb.currencyBreakdown.length > 0, `Currency breakdown has ${tb.currencyBreakdown.length} currencies`);
            for (const cb of tb.currencyBreakdown) {
                const diff = Math.abs(cb.totalDebit - cb.totalCredit);
                assert(diff < 0.01, `Branch currency [${cb.currencyCode}] debits (${cb.totalDebit}) == credits (${cb.totalCredit}) within tolerance`);
            }
        }
        {
            // Single branch (Branch 1)
            const { req, res, getData } = mockReqRes({ branchId: '1' });
            await accountingReportsController.getTrialBalance(req, res);
            const tb = getData();
            assert(tb && tb.isConsolidated === false, 'Single branch TB returns isConsolidated = false');
            assert(tb.branch && tb.branch.id === 1, 'Single branch TB returns branch 1');
            assert(tb.currency && tb.currency.code === 'INR', 'Single branch TB returns INR currency');
            const diff = Math.abs(tb.totalDebit - tb.totalCredit);
            assert(diff < 0.01, `Branch 1 TB total debits (${tb.totalDebit}) reconcile with total credits (${tb.totalCredit})`);
        }

        // 6. Test Profit & Loss and Balance Sheet
        console.log('\n--- TEST GROUP 6: Profit & Loss and Balance Sheet ---');
        {
            const { req, res, getData } = mockReqRes({ branchId: '1' });
            await accountingReportsController.getProfitLoss(req, res);
            const pl = getData();
            assert(pl && pl.branch && pl.branch.id === 1, 'Profit & Loss reflects branch 1');
            assert(pl.currency && pl.currency.code === 'INR', 'Profit & Loss currency is INR');
        }
        {
            const { req, res, getData } = mockReqRes({ branchId: '3' });
            await accountingReportsController.getBalanceSheet(req, res);
            const bs = getData();
            assert(bs && bs.branch && bs.branch.id === 3, 'Balance Sheet reflects branch 3');
            assert(bs.currency && bs.currency.code === 'AED', 'Balance Sheet currency is AED');
        }

        // 7. Test Ledger Statement with branch filter
        console.log('\n--- TEST GROUP 7: General Ledger Statement ---');
        {
            const cashLedger = await prisma.ledger.findFirst({ where: { name: { contains: 'Cash', mode: 'insensitive' } } });
            if (cashLedger) {
                const { req, res, getData } = mockReqRes({ ledgerId: cashLedger.id.toString(), branchId: '1' });
                await accountingReportsController.getLedgerStatement(req, res);
                const ls = getData();
                assert(ls && ls.branch && ls.branch.id === 1, 'Ledger Statement reflects branch 1');
                assert(ls.currency && ls.currency.code === 'INR', 'Ledger Statement currency is INR');
                assert(typeof ls.ledger?.openingBalance === 'number', 'Ledger Statement has numeric opening balance');
            }
        }

        // 8. Test Data Isolation & Security: User restricted to Branch 2 cannot query Branch 3
        console.log('\n--- TEST GROUP 8: Authorization and Branch Data Isolation ---');
        {
            const restrictedUser = { id: 99, role: 'cashier', branchId: 2 };
            const { req, res, getData, getStatus } = mockReqRes({ branchId: '3' }, restrictedUser);
            try {
                await accountingReportsController.getCashBook(req, res);
                assert(getStatus() === 403, 'Restricted user requesting unauthorized branch receives 403 Forbidden');
            } catch (err) {
                assert(err.message.includes('permission') || err.message.includes('Unauthorized') || err.statusCode === 403, 'Restricted user accessing unauthorized branch is rejected');
            }
        }

    } catch (error) {
        console.error('Unexpected error during testing:', error);
        failed++;
    } finally {
        await prisma.$disconnect();
    }

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
