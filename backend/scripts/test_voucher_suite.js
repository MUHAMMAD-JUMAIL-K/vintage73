/**
 * Comprehensive Automated Test Suite for Customer Promotional Vouchers,
 * POS Integration, Accounting, Tax Breakdown, and Purchase Rewards.
 *
 * Vintage73 / QuickPOS - wholesale branch
 */

const prisma = require('../config/prisma');
const {
  generateVoucherCode,
  validateVoucherForSale,
  redeemVoucherInSale,
  checkAndIssuePurchaseReward,
  getPurchaseRewardRule,
  updatePurchaseRewardRule
} = require('../services/voucherService');
const salesController = require('../controllers/salesController');

// Test runner helper
let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    failedCount++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'} - Expected: ${expected}, Got: ${actual}`);
  }
}

function assertClose(actual, expected, delta = 0.05, message) {
  if (Math.abs(actual - expected) > delta) {
    throw new Error(`${message || 'Assertion failed'} - Expected: ~${expected}, Got: ${actual} (diff > ${delta})`);
  }
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('🚀 STARTING COMPREHENSIVE VOUCHER AUTOMATION TEST SUITE');
  console.log('======================================================\n');

  let testBranch;
  let testCustomer1;
  let testCustomer2;
  let testProductExclusive;
  let testProductInclusive;
  let adminUser;

  // Setup test environment data
  try {
    testBranch = await prisma.branch.findFirst();
    if (!testBranch) {
      testBranch = await prisma.branch.create({
        data: { name: 'Voucher Test Branch', code: `VTB-${Date.now()}`, address: 'Test St' }
      });
    }

    adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!adminUser) {
      adminUser = await prisma.user.findFirst();
    }

    testCustomer1 = await prisma.customer.create({
      data: { name: 'Voucher Customer One', phone: `9899${Math.floor(100000 + Math.random() * 900000)}` }
    });

    testCustomer2 = await prisma.customer.create({
      data: { name: 'Voucher Customer Two', phone: `9898${Math.floor(100000 + Math.random() * 900000)}` }
    });

    // Create 1 exclusive-tax product and 1 inclusive-tax product
    testProductExclusive = await prisma.product.create({
      data: {
        name: 'Voucher Test Shirt (Excl GST 18%)',
        barcode: `VTS-${Date.now()}`,
        price: 1000,
        costPrice: 500,
        taxRate: 18,
        isTaxInclusive: false
      }
    });

    testProductInclusive = await prisma.product.create({
      data: {
        name: 'Voucher Test Jeans (Incl GST 12%)',
        barcode: `VTJ-${Date.now()}`,
        price: 1120, // Net 1000, GST 120
        costPrice: 600,
        taxRate: 12,
        isTaxInclusive: true
      }
    });

    // Create stock records in branch
    await prisma.productStock.upsert({
      where: { branchId_productId: { branchId: testBranch.id, productId: testProductExclusive.id } },
      create: { branchId: testBranch.id, productId: testProductExclusive.id, quantity: 100 },
      update: { quantity: 100 }
    });
    await prisma.productStock.upsert({
      where: { branchId_productId: { branchId: testBranch.id, productId: testProductInclusive.id } },
      create: { branchId: testBranch.id, productId: testProductInclusive.id, quantity: 100 },
      update: { quantity: 100 }
    });
  } catch (setupErr) {
    console.error('Setup failed:', setupErr);
    process.exit(1);
  }

  // ----------------------------------------------------
  // SECTION 1: CODE GENERATION & RANDOMNESS
  // ----------------------------------------------------
  console.log('--- SECTION 1: Code Generation & Uniqueness ---');

  await test('generateVoucherCode generates distinct, unguessable uppercase codes', async () => {
    const codes = new Set();
    for (let i = 0; i < 50; i++) {
      const code = await generateVoucherCode('TEST', prisma);
      assert(code.startsWith('TEST-'), 'Code must start with requested prefix');
      assert(code.length >= 10, 'Code length must be at least 10 chars');
      assert(code === code.toUpperCase(), 'Code must be strictly uppercase');
      codes.add(code);
    }
    assertEqual(codes.size, 50, 'All 50 generated codes must be completely unique');
  });

  // ----------------------------------------------------
  // SECTION 2: VALIDATION RULES & EDGE CASES
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: Validation Rules & Edge Cases ---');

  await test('Reject non-existent voucher code', async () => {
    const res = await validateVoucherForSale(prisma, {
      code: 'DOESNOTEXIST999',
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(res.valid, false, 'Non-existent code must be rejected');
    assert(res.message.includes('not found'), 'Message must indicate voucher not found');
  });

  await test('Reject INACTIVE voucher', async () => {
    const code = await generateVoucherCode('INACT', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Inactive Promo',
        type: 'FIXED',
        value: 100,
        status: 'INACTIVE',
        usageLimit: 1
      }
    });

    const res = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(res.valid, false, 'Inactive voucher must be rejected');
    assert(res.message.includes('inactive'), 'Message must indicate inactive status');
  });

  await test('Reject EXPIRED voucher and opportunistically update status in DB', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const code = await generateVoucherCode('EXP', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Expired Promo',
        type: 'FIXED',
        value: 150,
        status: 'ACTIVE',
        expiryDate: pastDate,
        usageLimit: 1
      }
    });

    const res = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(res.valid, false, 'Expired voucher must be rejected');
    assert(res.message.includes('expired'), 'Message must mention expired');

    // Verify DB record status was updated to EXPIRED
    const refreshed = await prisma.customerVoucher.findUnique({ where: { id: v.id } });
    assertEqual(refreshed.status, 'EXPIRED', 'DB status should be updated to EXPIRED');
  });

  await test('Reject voucher that has reached usageLimit', async () => {
    const code = await generateVoucherCode('USED', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Exhausted Voucher',
        type: 'FIXED',
        value: 100,
        status: 'ACTIVE',
        usageLimit: 2,
        usageCount: 2
      }
    });

    const res = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(res.valid, false, 'Exhausted voucher must be rejected');
    assert(res.message.includes('maximum usage limit'), 'Message must indicate limit reached');
  });

  await test('Reject customer-restricted voucher when used by wrong customer', async () => {
    const code = await generateVoucherCode('CUST', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Customer Exclusive',
        type: 'FIXED',
        value: 200,
        status: 'ACTIVE',
        customerId: testCustomer1.id,
        usageLimit: 1
      }
    });

    const resMismatch = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer2.id, // Different customer!
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(resMismatch.valid, false, 'Wrong customer must be rejected');

    const resMatch = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id, // Correct customer!
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(resMatch.valid, true, 'Matching customer must be accepted');
  });

  await test('Reject branch-restricted voucher when used at wrong branch', async () => {
    const otherBranch = await prisma.branch.create({
      data: { name: `Other Branch ${Date.now()}` }
    });

    const code = await generateVoucherCode('BRAN', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Branch Exclusive',
        type: 'FIXED',
        value: 100,
        status: 'ACTIVE',
        branchId: testBranch.id,
        usageLimit: 1
      }
    });

    const resMismatch = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: otherBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(resMismatch.valid, false, 'Wrong branch must be rejected');

    const resMatch = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(resMatch.valid, true, 'Matching branch must be accepted');
  });

  await test('Reject voucher if cart subtotal is below minimumPurchaseAmount', async () => {
    const code = await generateVoucherCode('MINSP', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Min Spend Promo',
        type: 'FIXED',
        value: 100,
        status: 'ACTIVE',
        minimumPurchaseAmount: 1500,
        usageLimit: 1
      }
    });

    // Cart total = 1000 < 1500
    const resLow = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(resLow.valid, false, 'Cart below min spend must be rejected');
    assert(resLow.message.includes('Minimum purchase of ₹1500.00 required'), 'Message must display min spend requirement');

    // Cart total = 2000 >= 1500
    const resHigh = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 2 }]
    });
    assertEqual(resHigh.valid, true, 'Cart meeting min spend must be accepted');
    assertEqual(resHigh.finalVoucherDiscount, 100, 'Discount must be 100');
  });

  // ----------------------------------------------------
  // SECTION 3: DISCOUNT CALCULATION & PERCENTAGE CAPS
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: Discount Calculations & Percentage Caps ---');

  await test('Percentage voucher without cap calculates exact % of eligible subtotal', async () => {
    const code = await generateVoucherCode('PCT', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: '10 Percent Off',
        type: 'PERCENTAGE',
        value: 10,
        status: 'ACTIVE',
        usageLimit: 1
      }
    });

    // Cart total: 2000 => 10% = 200
    const res = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 2 }]
    });
    assertEqual(res.valid, true);
    assertEqual(res.finalVoucherDiscount, 200);
  });

  await test('Percentage voucher with maximumDiscount cap enforces ceiling', async () => {
    const code = await generateVoucherCode('PCTCAP', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: '50% Off Capped at ₹150',
        type: 'PERCENTAGE',
        value: 50,
        maximumDiscount: 150,
        status: 'ACTIVE',
        usageLimit: 1
      }
    });

    // Cart total: 1000 => 50% = 500, but cap is 150
    const res = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items: [{ productId: testProductExclusive.id, unitPrice: 1000, quantity: 1 }]
    });
    assertEqual(res.valid, true);
    assertEqual(res.finalVoucherDiscount, 150, 'Discount must be strictly capped at maximumDiscount');
  });

  // ----------------------------------------------------
  // SECTION 4: DETERMINISTIC PROPORTIONAL ALLOCATION
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: Deterministic Proportional Line-Item Allocation ---');

  await test('Proportional allocation distributes discount correctly and handles rounding delta', async () => {
    const code = await generateVoucherCode('PROP', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Flat 100 Off',
        type: 'FIXED',
        value: 100,
        status: 'ACTIVE',
        usageLimit: 1
      }
    });

    // 3 items with fractional values:
    // Item 0: 333.33
    // Item 1: 333.33
    // Item 2: 333.34
    // Total = 1000.00
    const items = [
      { productId: testProductExclusive.id, unitPrice: 333.33, quantity: 1 },
      { productId: testProductExclusive.id, unitPrice: 333.33, quantity: 1 },
      { productId: testProductExclusive.id, unitPrice: 333.34, quantity: 1 }
    ];

    const res = await validateVoucherForSale(prisma, {
      code: v.code,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      items
    });

    assertEqual(res.valid, true);
    assertEqual(res.finalVoucherDiscount, 100);

    const alloc0 = res.lineAllocations[0];
    const alloc1 = res.lineAllocations[1];
    const alloc2 = res.lineAllocations[2];

    const sumAlloc = Number((alloc0 + alloc1 + alloc2).toFixed(2));
    assertEqual(sumAlloc, 100.00, 'Sum of proportional line allocations must exactly match total voucher discount (100.00)');
  });

  // ----------------------------------------------------
  // SECTION 5: COMPLETE POS TRANSACTION & GST RECONCILIATION
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: POS Transaction & GST Section 15(3) Compliance ---');

  await test('POS Sale with Voucher applies discount before GST and records audit trail', async () => {
    const code = await generateVoucherCode('GST15', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'GST Compliance Voucher',
        type: 'FIXED',
        value: 200,
        status: 'ACTIVE',
        usageLimit: 1
      }
    });

    // Exclusive item: Price = 1000, 18% GST
    // Voucher Discount = 200
    // Net Taxable Base = 800
    // 18% GST on 800 = 144
    // Final Grand Total = 944.00
    const salePayload = {
      customerId: testCustomer1.id,
      customerName: testCustomer1.name,
      branchId: testBranch.id,
      saleDate: new Date().toISOString().split('T')[0],
      voucherCode: v.code,
      items: [
        {
          productId: testProductExclusive.id,
          quantity: 1,
          unitPrice: 1000,
          originalUnitPrice: 1000,
          discountPercent: 0,
          discountAmount: 0,
          taxPercent: 18,
          isTaxInclusive: false
        }
      ],
      paymentMethod: 'Cash',
      paidAmount: 944.00,
      payments: [{ method: 'Cash', amount: 944.00 }]
    };

    // Simulate req/res for salesController.createSale
    let responseStatus = 200;
    let responseBody = null;
    const req = {
      body: salePayload,
      user: { id: adminUser.id, role: 'admin', branchId: testBranch.id }
    };
    const res = {
      status: (s) => { responseStatus = s; return res; },
      json: (b) => { responseBody = b; return res; }
    };

    await salesController.createSale(req, res, (err) => { if (err) throw err; });

    assertEqual(responseStatus, 201, 'Sale must be created with status 201');
    assert(responseBody !== null, 'Response body must exist');
    assertEqual(responseBody.voucherCode, v.code, 'Sale must record voucherCode');
    assertEqual(Number(responseBody.voucherDiscount), 200, 'Sale must record voucherDiscount=200');
    assertClose(Number(responseBody.subTotal), 800, 0.05, 'Taxable subtotal must be 800 (1000 - 200)');
    assertClose(Number(responseBody.taxAmount), 144, 0.05, 'GST must be 144 (18% of 800)');
    assertClose(Number(responseBody.totalAmount), 944, 0.05, 'Grand total must be 944 (800 + 144)');

    // Verify SaleItem has originalUnitPrice and voucherDiscountAmount
    const createdItem = responseBody.items[0];
    assertEqual(Number(createdItem.originalUnitPrice), 1000, 'SaleItem originalUnitPrice must be 1000');
    assertEqual(Number(createdItem.voucherDiscountAmount), 200, 'SaleItem voucherDiscountAmount must be 200');

    // Verify Voucher is marked REDEEMED in DB
    const refreshedVoucher = await prisma.customerVoucher.findUnique({ where: { id: v.id } });
    assertEqual(refreshedVoucher.usageCount, 1, 'usageCount must increment to 1');
    assertEqual(refreshedVoucher.status, 'REDEEMED', 'Status must be REDEEMED for single-use voucher');

    // Verify CustomerVoucherRedemption audit record
    const redemption = await prisma.customerVoucherRedemption.findFirst({
      where: { voucherId: v.id, saleId: responseBody.id }
    });
    assert(redemption !== null, 'Redemption audit record must exist');
    assertEqual(Number(redemption.discountAmount), 200, 'Redemption record must record applied discount 200');
  });

  // ----------------------------------------------------
  // SECTION 6: CONCURRENCY & DOUBLE REDEMPTION
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: Concurrency & Double Redemption Prevention ---');

  await test('Concurrent redemption attempts on single-use voucher block double redemption', async () => {
    const code = await generateVoucherCode('RACE', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Race Condition Test',
        type: 'FIXED',
        value: 50,
        status: 'ACTIVE',
        usageLimit: 1,
        usageCount: 0
      }
    });

    // Create 2 test sales concurrently
    const sale1 = await prisma.sale.create({
      data: {
        invoiceNumber: `INV-RACE-1-${Date.now()}`,
        branchId: testBranch.id,
        paymentMethod: 'Cash',
        totalAmount: 500,
        subTotal: 500,
        taxAmount: 0
      }
    });

    const sale2 = await prisma.sale.create({
      data: {
        invoiceNumber: `INV-RACE-2-${Date.now()}`,
        branchId: testBranch.id,
        paymentMethod: 'Cash',
        totalAmount: 500,
        subTotal: 500,
        taxAmount: 0
      }
    });

    // Execute first redemption
    await redeemVoucherInSale(prisma, {
      voucherId: v.id,
      saleId: sale1.id,
      customerId: testCustomer1.id,
      branchId: testBranch.id,
      appliedDiscount: 50
    });

    // Attempt second redemption on exhausted voucher
    let secondFailed = false;
    try {
      await redeemVoucherInSale(prisma, {
        voucherId: v.id,
        saleId: sale2.id,
        customerId: testCustomer1.id,
        branchId: testBranch.id,
        appliedDiscount: 50
      });
    } catch (e) {
      secondFailed = true;
    }

    assert(secondFailed, 'Second redemption attempt on single-use voucher must be blocked');

    // Verify redemption count in DB is strictly 1
    const redemptionsCount = await prisma.customerVoucherRedemption.count({
      where: { voucherId: v.id }
    });
    assertEqual(redemptionsCount, 1, 'Only 1 redemption record must exist in DB');
  });

  // ----------------------------------------------------
  // SECTION 7: AUTOMATIC PURCHASE REWARD ISSUANCE
  // ----------------------------------------------------
  console.log('\n--- SECTION 7: Automatic Purchase Reward Issuance ---');

  await test('Configuring reward rule generates automatic coupon for qualifying purchases', async () => {
    // Configure rule: min qualifying spend 2000 => ₹150 off next purchase, valid 30 days
    await updatePurchaseRewardRule({
      enabled: true,
      minQualifyingSpend: 2000,
      rewardType: 'FIXED',
      rewardValue: 150,
      validityDays: 30,
      customerSpecific: true,
      branchSpecific: false,
      minFutureSpend: 500
    }, prisma);

    // Qualifying sale: 2500 total amount
    const qualifyingSale = await prisma.sale.create({
      data: {
        invoiceNumber: `INV-RWD-QUAL-${Date.now()}`,
        customerId: testCustomer1.id,
        branchId: testBranch.id,
        totalAmount: 2500,
        subTotal: 2500,
        taxAmount: 0,
        paymentMethod: 'Cash'
      }
    });

    const issuedVoucher = await checkAndIssuePurchaseReward(prisma, qualifyingSale);
    assert(issuedVoucher !== null, 'Reward voucher must be generated for qualifying spend');
    assert(issuedVoucher.code.startsWith('RWD-'), 'Reward voucher must start with RWD-');
    assertEqual(Number(issuedVoucher.value), 150, 'Reward voucher value must be 150');
    assertEqual(issuedVoucher.customerId, testCustomer1.id, 'Reward voucher must be linked to customer');

    // Non-qualifying sale: 1000 total amount (< 2000)
    const nonQualifyingSale = await prisma.sale.create({
      data: {
        invoiceNumber: `INV-RWD-NONQUAL-${Date.now()}`,
        customerId: testCustomer1.id,
        branchId: testBranch.id,
        totalAmount: 1000,
        subTotal: 1000,
        taxAmount: 0,
        paymentMethod: 'Cash'
      }
    });

    const noReward = await checkAndIssuePurchaseReward(prisma, nonQualifyingSale);
    assertEqual(noReward, null, 'Non-qualifying sale must NOT generate reward voucher');

    // Duplicate protection test: calling again on the same sale must return the existing voucher without creating a new record
    const dupCheck = await checkAndIssuePurchaseReward(prisma, qualifyingSale);
    assertEqual(dupCheck.id, issuedVoucher.id, 'Re-checking same sale must return same voucher');

    const totalVouchersForSale = await prisma.customerVoucher.count({
      where: { issuedSaleId: qualifyingSale.id }
    });
    assertEqual(totalVouchersForSale, 1, 'Exactly 1 reward voucher must exist for this sale');
  });

  // ----------------------------------------------------
  // SECTION 8: SALE CANCELLATION ROLLBACK & ACCOUNTING
  // ----------------------------------------------------
  console.log('\n--- SECTION 8: Sale Cancellation Rollback & Accounting ---');

  await test('Cancelling sale restores redeemed voucher and cancels reward voucher', async () => {
    // 1. Create and redeem a voucher on a sale
    const code = await generateVoucherCode('CANCRB', prisma);
    const v = await prisma.customerVoucher.create({
      data: {
        code,
        name: 'Rollback Test Voucher',
        type: 'FIXED',
        value: 100,
        status: 'ACTIVE',
        usageLimit: 1
      }
    });

    const cancelReq = {
      body: {
        customerId: testCustomer2.id,
        customerName: testCustomer2.name,
        branchId: testBranch.id,
        saleDate: new Date().toISOString().split('T')[0],
        voucherCode: v.code,
        items: [
          {
            productId: testProductExclusive.id,
            quantity: 3, // 3000 spend => qualifies for reward
            unitPrice: 1000,
            originalUnitPrice: 1000,
            discountPercent: 0,
            discountAmount: 0,
            taxPercent: 0,
            isTaxInclusive: false
          }
        ],
        paymentMethod: 'Cash',
        paidAmount: 2900,
        payments: [{ method: 'Cash', amount: 2900 }]
      },
      user: { id: adminUser.id, role: 'admin', branchId: testBranch.id }
    };

    let cancelResBody = null;
    const cancelRes = {
      status: () => cancelRes,
      json: (b) => { cancelResBody = b; return cancelRes; }
    };

    await salesController.createSale(cancelReq, cancelRes, (err) => { if (err) throw err; });
    const saleId = cancelResBody.id;
    assert(saleId !== undefined, 'Sale must be created');

    // Verify voucher is currently REDEEMED
    const vBefore = await prisma.customerVoucher.findUnique({ where: { id: v.id } });
    assertEqual(vBefore.status, 'REDEEMED', 'Voucher must be REDEEMED before cancellation');

    // Now call cancelSale
    const cancelReq2 = {
      params: { id: saleId },
      body: { cancelReason: 'Customer return / mistake', cancelledBy: 'Admin' },
      user: { id: adminUser.id, name: 'Admin', role: 'admin' }
    };
    let cancelSaleStatus = 200;
    let cancelSaleBody = null;
    const cancelRes2 = {
      status: (s) => { cancelSaleStatus = s; return cancelRes2; },
      json: (b) => { cancelSaleBody = b; return cancelRes2; }
    };

    await salesController.cancelSale(cancelReq2, cancelRes2, (err) => { if (err) throw err; });
    assertEqual(cancelSaleStatus, 200, 'Sale cancellation must succeed');

    // Verify redeemed voucher was restored to ACTIVE
    const vAfter = await prisma.customerVoucher.findUnique({ where: { id: v.id } });
    assertEqual(vAfter.status, 'ACTIVE', 'Voucher status must be rolled back to ACTIVE');
    assertEqual(vAfter.usageCount, 0, 'Voucher usageCount must be decremented back to 0');

    // Verify redemption record was removed
    const redAfter = await prisma.customerVoucherRedemption.findFirst({
      where: { voucherId: v.id, saleId }
    });
    assertEqual(redAfter, null, 'Redemption record must be cleaned up on sale cancellation');

    // Verify issued reward voucher was CANCELLED
    const rewardVoucher = await prisma.customerVoucher.findFirst({
      where: { issuedSaleId: saleId }
    });
    if (rewardVoucher) {
      assertEqual(rewardVoucher.status, 'CANCELLED', 'Reward voucher issued on cancelled sale must be CANCELLED');
    }
  });

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 TEST SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSuite()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
