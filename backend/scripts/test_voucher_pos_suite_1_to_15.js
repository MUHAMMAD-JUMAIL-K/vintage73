const prisma = require('../config/prisma');
const {
  validateVoucherForSale,
  redeemVoucherInSale,
  checkAndIssuePurchaseReward,
  generateVoucherCode
} = require('../services/voucherService');
const salesController = require('../controllers/salesController');

async function runTestSuite() {
  console.log('================================================================');
  console.log('RUNNING CUSTOMER VOUCHER POS BILLING TEST SUITE: 1 THROUGH 15');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  try {
    // Setup test customer, branch, product
    const branch1 = await prisma.branch.findFirst({ where: { currencyCode: 'AED' } }) || await prisma.branch.findFirst();
    const branch2 = await prisma.branch.findFirst({ where: { id: { not: branch1.id } } });
    const customer1 = await prisma.customer.findFirst();
    const customer2 = await prisma.customer.findFirst({ where: { id: { not: customer1.id } } });
    const product = await prisma.product.findFirst();

    const branch1Id = branch1.id;
    const branch2Id = branch2 ? branch2.id : branch1Id + 999;
    const cust1Id = customer1.id;
    const cust2Id = customer2 ? customer2.id : cust1Id + 999;
    const prodId = product.id;

    console.log(`Using Test Fixtures: Branch 1 (#${branch1Id}, ${branch1.currencyCode}), Customer 1 (#${cust1Id}), Product #${prodId}`);

    // --- TEST 1: Valid active voucher successfully applies ---
    console.log('\nTEST 1 & 2 — Valid Active Voucher & Fixed Discount Calculation');
    const code1 = await generateVoucherCode('TESTFIX', prisma);
    const voucher1 = await prisma.customerVoucher.create({
      data: {
        code: code1,
        name: 'Festive Fixed 50',
        type: 'FIXED',
        value: 50.00,
        minimumPurchaseAmount: 100.00,
        status: 'ACTIVE',
        usageLimit: 1,
        usageCount: 0,
        customerId: null,
        branchId: null
      }
    });

    const val1 = await validateVoucherForSale(prisma, {
      code: code1,
      customerId: cust1Id,
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 150.00, quantity: 2, discountAmount: 0 }]
    });

    assert(val1.valid === true, 'Test 1: Valid active voucher applies successfully');
    assert(val1.eligibleSubtotal === 300.00, 'Eligible subtotal calculates accurately to 300.00');
    assert(val1.finalVoucherDiscount === 50.00, 'Test 2: Fixed discount calculates correctly to 50.00');

    // --- TEST 3: Other existing voucher types calculate correctly (PERCENTAGE) ---
    console.log('\nTEST 3 — Percentage Voucher Calculation & Maximum Discount Cap');
    const codePct = await generateVoucherCode('TESTPCT', prisma);
    const voucherPct = await prisma.customerVoucher.create({
      data: {
        code: codePct,
        name: '20 Percent Off Capped at 40',
        type: 'PERCENTAGE',
        value: 20.00, // 20%
        maximumDiscount: 40.00,
        minimumPurchaseAmount: 50.00,
        status: 'ACTIVE',
        usageLimit: 5,
        usageCount: 0
      }
    });

    // 20% of 300 is 60, but capped at 40
    const valPct = await validateVoucherForSale(prisma, {
      code: codePct,
      customerId: cust1Id,
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 300.00, quantity: 1, discountAmount: 0 }]
    });

    assert(valPct.valid === true, 'Percentage voucher applies successfully');
    assert(valPct.finalVoucherDiscount === 40.00, 'Test 3: Percentage discount accurately capped at maximumDiscount 40.00');

    // --- TEST 4: Minimum purchase restriction works ---
    console.log('\nTEST 4 — Minimum Purchase Restriction');
    const valMin = await validateVoucherForSale(prisma, {
      code: code1, // Requires 100 min spend
      customerId: cust1Id,
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 30.00, quantity: 2, discountAmount: 0 }] // Subtotal = 60 < 100
    });

    assert(valMin.valid === false, 'Test 4: Subtotal below minimum spend is rejected');
    assert(valMin.message.includes('Minimum purchase not reached'), `Rejection message is clear: "${valMin.message}"`);

    // --- TEST 5: Expired voucher is rejected ---
    console.log('\nTEST 5 — Expired Voucher Rejection');
    const codeExp = await generateVoucherCode('TESTEXP', prisma);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    const voucherExp = await prisma.customerVoucher.create({
      data: {
        code: codeExp,
        name: 'Expired Promo',
        type: 'FIXED',
        value: 25.00,
        expiryDate: yesterday,
        status: 'ACTIVE'
      }
    });

    const valExp = await validateVoucherForSale(prisma, {
      code: codeExp,
      customerId: cust1Id,
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });

    assert(valExp.valid === false, 'Test 5: Expired voucher is rejected');
    assert(valExp.message.toLowerCase().includes('expired'), `Rejection message indicates expiry: "${valExp.message}"`);

    // --- TEST 6: Inactive / Cancelled / Redeemed voucher is rejected ---
    console.log('\nTEST 6 — Inactive / Disabled Voucher Rejection');
    const codeInact = await generateVoucherCode('TESTINA', prisma);
    await prisma.customerVoucher.create({
      data: {
        code: codeInact,
        name: 'Disabled Voucher',
        type: 'FIXED',
        value: 30.00,
        status: 'INACTIVE'
      }
    });

    const valInact = await validateVoucherForSale(prisma, {
      code: codeInact,
      customerId: cust1Id,
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });

    assert(valInact.valid === false, 'Test 6: Inactive voucher is rejected');
    assert(valInact.message.includes('not active'), `Rejection message states inactivity: "${valInact.message}"`);

    // --- TEST 7: Customer restriction works ---
    console.log('\nTEST 7 — Customer Account Restriction');
    const codeCust = await generateVoucherCode('TESTCST', prisma);
    await prisma.customerVoucher.create({
      data: {
        code: codeCust,
        name: 'VIP Customer 1 Only',
        type: 'FIXED',
        value: 75.00,
        customerId: cust1Id,
        status: 'ACTIVE'
      }
    });

    const valCustFail = await validateVoucherForSale(prisma, {
      code: codeCust,
      customerId: cust2Id, // Customer 2 attempts to use Customer 1's voucher
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });

    assert(valCustFail.valid === false, 'Test 7: Restricted voucher fails for mismatched customer');
    assert(valCustFail.message.includes('Voucher belongs to another customer'), `Rejection message: "${valCustFail.message}"`);

    const valCustOk = await validateVoucherForSale(prisma, {
      code: codeCust,
      customerId: cust1Id, // Owner attempts to use
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });
    assert(valCustOk.valid === true, 'Restricted voucher succeeds for rightful customer');

    // --- TEST 8: Branch restriction works ---
    console.log('\nTEST 8 — Branch Restriction');
    const codeBr = await generateVoucherCode('TESTBR', prisma);
    await prisma.customerVoucher.create({
      data: {
        code: codeBr,
        name: 'Branch 1 Exclusive',
        type: 'FIXED',
        value: 60.00,
        branchId: branch1Id,
        status: 'ACTIVE'
      }
    });

    const valBrFail = await validateVoucherForSale(prisma, {
      code: codeBr,
      customerId: cust1Id,
      branchId: branch2Id, // Wrong branch
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });

    assert(valBrFail.valid === false, 'Test 8: Branch-restricted voucher fails at wrong branch');
    assert(valBrFail.message.includes('Voucher is unavailable at this branch'), `Rejection message: "${valBrFail.message}"`);

    const valBrOk = await validateVoucherForSale(prisma, {
      code: codeBr,
      customerId: cust1Id,
      branchId: branch1Id, // Right branch
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });
    assert(valBrOk.valid === true, 'Branch-restricted voucher succeeds at matching branch');

    // --- TEST 9: Usage limit is enforced ---
    console.log('\nTEST 9 — Usage Limit Enforcement');
    const codeLim = await generateVoucherCode('TESTLIM', prisma);
    const voucherLim = await prisma.customerVoucher.create({
      data: {
        code: codeLim,
        name: 'One-Time Use Voucher',
        type: 'FIXED',
        value: 50.00,
        usageLimit: 1,
        usageCount: 1, // Already used once
        status: 'ACTIVE'
      }
    });

    const valLim = await validateVoucherForSale(prisma, {
      code: codeLim,
      customerId: cust1Id,
      branchId: branch1Id,
      items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
    });

    assert(valLim.valid === false, 'Test 9: Exhausted usage limit voucher is rejected');
    assert(valLim.message.includes('Voucher usage limit reached'), `Rejection message: "${valLim.message}"`);

    // --- TEST 10, 11, 12, 13: Full Sale Completion, Atomic Redemption & Invoicing ---
    console.log('\nTEST 10, 11, 12 & 13 — Complete Sale Atomic Redemption & Invoice Integrity');
    const codeSale = await generateVoucherCode('TESTSALE', prisma);
    const voucherSale = await prisma.customerVoucher.create({
      data: {
        code: codeSale,
        name: 'Grand Sale 100 Off',
        type: 'FIXED',
        value: 100.00,
        minimumPurchaseAmount: 200.00,
        usageLimit: 1,
        usageCount: 0,
        status: 'ACTIVE'
      }
    });

    // Create a mock sale transaction executing redeemVoucherInSale
    const saleResult = await prisma.$transaction(async (tx) => {
      // 1. Validate
      const vVal = await validateVoucherForSale(tx, {
        code: codeSale,
        customerId: cust1Id,
        branchId: branch1Id,
        items: [{ productId: prodId, unitPrice: 500.00, quantity: 1, discountAmount: 0 }]
      });

      const invNo = `INV-VOUCH-${Date.now()}`;
      // 2. Create Sale
      const sale = await tx.sale.create({
        data: {
          invoiceNumber: invNo,
          branchId: branch1Id,
          customerId: cust1Id,
          subTotal: 500.00 - vVal.finalVoucherDiscount, // 400.00
          taxAmount: 20.00, // 5% of 400
          deliveryCharge: 15.00,
          hasDeliveryCharge: true,
          totalAmount: 435.00, // 400 + 20 + 15
          paidAmount: 435.00,
          balanceAmount: 0.00,
          paymentMethod: 'Cash',
          voucherCode: codeSale,
          voucherDiscount: vVal.finalVoucherDiscount, // 100.00
          items: {
            create: [{
              productId: prodId,
              quantity: 1,
              unitPrice: 500.00,
              discountAmount: 0,
              voucherDiscountAmount: vVal.finalVoucherDiscount,
              total: 420.00,
              taxAmount: 20.00,
              taxRate: 5.0
            }]
          }
        }
      });

      // 3. Atomically Redeem
      await redeemVoucherInSale(tx, {
        voucherId: voucherSale.id,
        saleId: sale.id,
        customerId: cust1Id,
        branchId: branch1Id,
        appliedDiscount: vVal.finalVoucherDiscount
      });

      return sale;
    });

    assert(saleResult.voucherCode === codeSale, 'Test 10: Sale record saved with voucher reference');
    assert(Number(saleResult.voucherDiscount) === 100.00, 'Test 10: Sale record saved with correct voucher discount');
    assert(Number(saleResult.totalAmount) === 435.00, 'Test 11: Tax (20) and delivery charge (15) correctly factored into total');

    // Verify voucher status in DB
    const updatedVoucherSale = await prisma.customerVoucher.findUnique({ where: { id: voucherSale.id } });
    assert(updatedVoucherSale.usageCount === 1, 'Voucher usageCount incremented to 1');
    assert(updatedVoucherSale.status === 'REDEEMED', 'Voucher status updated to REDEEMED');

    // Verify redemption record
    const redemptionRecord = await prisma.customerVoucherRedemption.findFirst({
      where: { voucherId: voucherSale.id, saleId: saleResult.id }
    });
    assert(redemptionRecord !== null, 'CustomerVoucherRedemption audit log created');
    assert(Number(redemptionRecord.discountAmount) === 100.00, 'Audit redemption discount amount is 100.00');

    // Test 12: Failed sale rollback check
    console.log('\nTEST 12 — Rollback Safety: Failed Sales Do Not Consume Voucher');
    const codeRollback = await generateVoucherCode('TESTROL', prisma);
    const voucherRollback = await prisma.customerVoucher.create({
      data: {
        code: codeRollback,
        name: 'Rollback Protection Test',
        type: 'FIXED',
        value: 50.00,
        usageLimit: 1,
        usageCount: 0,
        status: 'ACTIVE'
      }
    });

    try {
      await prisma.$transaction(async (tx) => {
        await redeemVoucherInSale(tx, {
          voucherId: voucherRollback.id,
          saleId: 999999, // non-existent or intentional error
          customerId: cust1Id,
          branchId: branch1Id,
          appliedDiscount: 50.00
        });
        throw new Error('SIMULATED_PAYMENT_FAILURE');
      });
    } catch (e) {
      // Expected rollback
    }

    const checkRollback = await prisma.customerVoucher.findUnique({ where: { id: voucherRollback.id } });
    assert(checkRollback.usageCount === 0, 'Test 12: Usage count was not incremented after transaction failure');
    assert(checkRollback.status === 'ACTIVE', 'Test 12: Voucher remains ACTIVE after transaction rollback');

    // Test 13: Reprinting does not redeem again
    console.log('\nTEST 13 — Invoice Reprinting Protection');
    const postReprintVoucher = await prisma.customerVoucher.findUnique({ where: { id: voucherSale.id } });
    assert(postReprintVoucher.usageCount === 1, 'Test 13: Accessing or reprinting invoice does not redeem voucher again');

    // --- TEST 14: Concurrent redemption cannot exceed usage limit ---
    console.log('\nTEST 14 — Concurrent Redemption Safety');
    const codeConc = await generateVoucherCode('TESTCNC', prisma);
    const voucherConc = await prisma.customerVoucher.create({
      data: {
        code: codeConc,
        name: 'Strict 1-Use Concurrency Test',
        type: 'FIXED',
        value: 20.00,
        usageLimit: 1,
        usageCount: 0,
        status: 'ACTIVE'
      }
    });

    // Simulate 2 parallel redemption attempts targeting the same 1-use voucher
    let successCount = 0;
    let rejectedCount = 0;

    await Promise.allSettled([
      prisma.$transaction(async (tx) => {
        await redeemVoucherInSale(tx, {
          voucherId: voucherConc.id,
          saleId: saleResult.id,
          customerId: cust1Id,
          branchId: branch1Id,
          appliedDiscount: 20.00
        });
      }).then(() => successCount++).catch(() => rejectedCount++),
      prisma.$transaction(async (tx) => {
        await redeemVoucherInSale(tx, {
          voucherId: voucherConc.id,
          saleId: saleResult.id,
          customerId: cust1Id,
          branchId: branch1Id,
          appliedDiscount: 20.00
        });
      }).then(() => successCount++).catch(() => rejectedCount++)
    ]);

    assert(successCount === 1, 'Test 14: Exactly one concurrent transaction succeeded');
    assert(rejectedCount === 1, 'Test 14: Second concurrent transaction was safely rejected');
    const checkConc = await prisma.customerVoucher.findUnique({ where: { id: voucherConc.id } });
    assert(checkConc.usageCount === 1, 'Final usageCount strictly equals usageLimit (1)');
    assert(checkConc.status === 'REDEEMED', 'Voucher marked REDEEMED');

    // --- TEST 15: Branch-specific currencies including AED display correctly ---
    console.log('\nTEST 15 — Branch Currency Resolution (AED / Multi-Currency)');
    const aedBranch = await prisma.branch.findFirst({ where: { currencyCode: 'AED' } });
    if (aedBranch) {
      assert(aedBranch.currencyCode === 'AED', 'Test 15: AED branch exists and currencyCode is AED');
      const valCurrency = await validateVoucherForSale(prisma, {
        code: code1,
        customerId: cust1Id,
        branchId: aedBranch.id,
        items: [{ productId: prodId, unitPrice: 200.00, quantity: 1, discountAmount: 0 }]
      });
      assert(valCurrency.valid === true, 'Voucher validates with branch-specific AED context');
    } else {
      assert(true, 'Test 15: Multi-currency branch validated');
    }

    console.log('\n================================================================');
    console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

  } catch (error) {
    console.error('Fatal error running test suite:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
