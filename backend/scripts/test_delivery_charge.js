const prisma = require('../config/prisma');
const { createSale, updateSale, getAllSales } = require('../controllers/salesController');

// Mock express req/res
function createMockReqRes(body = {}, params = {}, query = {}, user = { id: 1, role: 'admin', branchId: 1 }) {
  const req = {
    body,
    params,
    query,
    user
  };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status: function (code) {
      statusCode = code;
      return this;
    },
    json: function (data) {
      responseData = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };

  return { req, res };
}

function execute(handler, mock) {
  return new Promise((resolve, reject) => {
    const origJson = mock.res.json;
    mock.res.json = function (data) {
      origJson.call(mock.res, data);
      resolve(data);
    };
    handler(mock.req, mock.res, (err) => {
      if (err) reject(err);
      else resolve(mock.res.getData());
    });
  });
}

async function runTests() {
  console.log('=== STARTING DELIVERY CHARGE VERIFICATION SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}. ${details}`);
      failed++;
    }
  }

  try {
    // Setup test prerequisites: find or create branch and product
    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: { name: 'Test Branch', stockIncluded: false }
      });
    }

    let product = await prisma.product.findFirst({ where: { isActive: true } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          name: 'Test Delivery Item',
          price: 500,
          taxRate: 18,
          isActive: true
        }
      });
    }

    const testUnitPrice = parseFloat(product.price) || 500;
    const testTaxRate = parseFloat(product.taxRate) || 0;

    // Test 1: Delivery Charge OFF
    console.log('\n--- Scenario 1: Delivery Charge OFF ---');
    {
      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: testTaxRate
        }],
        deliveryCharge: 0,
        hasDeliveryCharge: false,
        paymentMethod: 'Cash',
        roundOffAmount: 0
      }, {}, {}, { id: 1, branchId: branch.id });

      const data = await execute(createSale, mock);

      assert(mock.res.getStatusCode() === 201, 'Scenario 1: Sale created successfully');
      assert(Number(data.deliveryCharge) === 0, 'Scenario 1: deliveryCharge is 0');
      assert(data.hasDeliveryCharge === false, 'Scenario 1: hasDeliveryCharge is false');
      const expectedTotal = Number((testUnitPrice + (testUnitPrice * testTaxRate / 100)).toFixed(2));
      assert(Number(data.totalAmount) === expectedTotal, `Scenario 1: Total amount matches Subtotal + Tax (${expectedTotal})`);
    }

    // Test 2: Delivery Charge ON with ₹100
    console.log('\n--- Scenario 2: Delivery Charge ON with ₹100 ---');
    let saleWithDeliveryId = null;
    let saleWithDeliveryInvoice = null;
    {
      const deliveryAmt = 100;
      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: testTaxRate
        }],
        deliveryCharge: deliveryAmt,
        hasDeliveryCharge: true,
        paymentMethod: 'Cash',
        roundOffAmount: 0
      }, {}, {}, { id: 1, branchId: branch.id });

      const data = await execute(createSale, mock);
      saleWithDeliveryId = data.id;
      saleWithDeliveryInvoice = data.invoiceNumber;

      assert(mock.res.getStatusCode() === 201, 'Scenario 2: Sale created successfully');
      assert(Number(data.deliveryCharge) === 100, 'Scenario 2: deliveryCharge is 100');
      assert(data.hasDeliveryCharge === true, 'Scenario 2: hasDeliveryCharge is true');
      const expectedTotal = Number((testUnitPrice + (testUnitPrice * testTaxRate / 100) + deliveryAmt).toFixed(2));
      assert(Number(data.totalAmount) === expectedTotal, `Scenario 2: Total amount includes delivery charge (${expectedTotal})`);
    }

    // Test 3: Delivery Charge ON with ₹0 (Free Delivery)
    console.log('\n--- Scenario 3: Delivery Charge ON with ₹0 ---');
    {
      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: testTaxRate
        }],
        deliveryCharge: 0,
        hasDeliveryCharge: true,
        paymentMethod: 'Cash',
        roundOffAmount: 0
      }, {}, {}, { id: 1, branchId: branch.id });

      const data = await execute(createSale, mock);

      assert(mock.res.getStatusCode() === 201, 'Scenario 3: Sale created successfully');
      assert(Number(data.deliveryCharge) === 0, 'Scenario 3: deliveryCharge is 0');
      assert(data.hasDeliveryCharge === true, 'Scenario 3: hasDeliveryCharge is explicitly preserved as true');
      const expectedTotal = Number((testUnitPrice + (testUnitPrice * testTaxRate / 100)).toFixed(2));
      assert(Number(data.totalAmount) === expectedTotal, `Scenario 3: Total amount is unchanged (${expectedTotal})`);
    }

    // Test 4: Validation - Reject negative amount
    console.log('\n--- Scenario 4: Validation - Reject negative amount ---');
    {
      let caughtError = false;
      try {
        const mock = createMockReqRes({
          branchId: branch.id,
          items: [{
            productId: product.id,
            quantity: 1,
            unitPrice: testUnitPrice,
            taxPercent: testTaxRate
          }],
          deliveryCharge: -50,
          hasDeliveryCharge: true,
          paymentMethod: 'Cash'
        }, {}, {}, { id: 1, branchId: branch.id });

        await execute(createSale, mock);
      } catch (err) {
        caughtError = true;
      }
      assert(caughtError, 'Scenario 4: Correctly rejected negative delivery charge');
    }

    // Test 5: Validation - Reject invalid/NaN amount
    console.log('\n--- Scenario 5: Validation - Reject NaN amount ---');
    {
      let caughtError = false;
      try {
        const mock = createMockReqRes({
          branchId: branch.id,
          items: [{
            productId: product.id,
            quantity: 1,
            unitPrice: testUnitPrice,
            taxPercent: testTaxRate
          }],
          deliveryCharge: 'invalid_charge',
          hasDeliveryCharge: true,
          paymentMethod: 'Cash'
        }, {}, {}, { id: 1, branchId: branch.id });

        await execute(createSale, mock);
      } catch (err) {
        caughtError = true;
      }
      assert(caughtError, 'Scenario 5: Correctly rejected NaN delivery charge');
    }

    // Test 6: Tax OFF and Delivery Charge ON
    console.log('\n--- Scenario 6: Tax OFF and Delivery Charge ON ---');
    {
      const deliveryAmt = 75.50;
      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: 0 // Tax OFF
        }],
        deliveryCharge: deliveryAmt,
        hasDeliveryCharge: true,
        paymentMethod: 'Cash',
        roundOffAmount: 0
      }, {}, {}, { id: 1, branchId: branch.id });

      const data = await execute(createSale, mock);

      assert(mock.res.getStatusCode() === 201, 'Scenario 6: Sale created successfully');
      assert(Number(data.taxAmount) === 0, 'Scenario 6: Tax is 0');
      assert(Number(data.deliveryCharge) === 75.5, 'Scenario 6: deliveryCharge is 75.50');
      const expectedTotal = Number((testUnitPrice + deliveryAmt).toFixed(2));
      assert(Number(data.totalAmount) === expectedTotal, `Scenario 6: Total equals subtotal + delivery (${expectedTotal})`);
    }

    // Test 7: Split Payment including Delivery Charge
    console.log('\n--- Scenario 7: Split Payment including Delivery Charge ---');
    {
      const deliveryAmt = 50;
      const lineTax = Number((testUnitPrice * testTaxRate / 100).toFixed(2));
      const grandTotal = Number((testUnitPrice + lineTax + deliveryAmt).toFixed(2));
      const cashPart = 300;
      const cardPart = Number((grandTotal - cashPart).toFixed(2));

      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: testTaxRate
        }],
        deliveryCharge: deliveryAmt,
        hasDeliveryCharge: true,
        paymentMethod: 'Split',
        payments: [
          { method: 'Cash', amount: cashPart },
          { method: 'Card', amount: cardPart }
        ],
        roundOffAmount: 0
      }, {}, {}, { id: 1, branchId: branch.id });

      const data = await execute(createSale, mock);

      assert(mock.res.getStatusCode() === 201, 'Scenario 7: Sale created successfully');
      assert(Number(data.paidAmount) === grandTotal, `Scenario 7: Paid amount (${data.paidAmount}) matches grand total (${grandTotal})`);
      assert(Number(data.balanceAmount) === 0, 'Scenario 7: Balance amount is 0');
      assert(data.status === 'completed', 'Scenario 7: Sale status is completed');
    }

    // Test 8: Partial Payment and Balance with Delivery Charge
    console.log('\n--- Scenario 8: Partial Payment with Delivery Charge ---');
    {
      const deliveryAmt = 60;
      const lineTax = Number((testUnitPrice * testTaxRate / 100).toFixed(2));
      const grandTotal = Number((testUnitPrice + lineTax + deliveryAmt).toFixed(2));
      const partialPaid = 200;
      const expectedBalance = Number((grandTotal - partialPaid).toFixed(2));

      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: testTaxRate
        }],
        deliveryCharge: deliveryAmt,
        hasDeliveryCharge: true,
        paymentMethod: 'Cash',
        paidAmount: partialPaid,
        roundOffAmount: 0
      }, {}, {}, { id: 1, branchId: branch.id });

      const data = await execute(createSale, mock);

      assert(mock.res.getStatusCode() === 201, 'Scenario 8: Sale created successfully');
      assert(Number(data.balanceAmount) === expectedBalance, `Scenario 8: Balance (${data.balanceAmount}) matches expected (${expectedBalance})`);
      assert(data.status === 'partial', 'Scenario 8: Sale status is partial');
    }

    // Test 9: Accounting Integration Voucher Dr/Cr Check
    console.log('\n--- Scenario 9: Accounting Voucher Balancing ---');
    {
      const voucher = await prisma.voucher.findFirst({
        where: { reference: saleWithDeliveryInvoice },
        include: { entries: true }
      });

      assert(voucher !== null, 'Scenario 9: Voucher exists for sale with delivery charge');
      if (voucher) {
        const totalDebit = voucher.entries.filter(e => e.debitLedgerId !== null).reduce((sum, e) => sum + Number(e.amount), 0);
        const totalCredit = voucher.entries.filter(e => e.creditLedgerId !== null).reduce((sum, e) => sum + Number(e.amount), 0);
        assert(Math.abs(totalDebit - totalCredit) < 0.01, `Scenario 9: Voucher is balanced: Dr (${totalDebit.toFixed(2)}) == Cr (${totalCredit.toFixed(2)})`);
      }
    }

    // Test 10: Update Sale modifying Delivery Charge
    console.log('\n--- Scenario 10: Update Sale Delivery Charge ---');
    {
      const newDeliveryAmt = 150;
      const mock = createMockReqRes({
        branchId: branch.id,
        items: [{
          productId: product.id,
          quantity: 1,
          unitPrice: testUnitPrice,
          taxPercent: testTaxRate
        }],
        deliveryCharge: newDeliveryAmt,
        hasDeliveryCharge: true,
        paymentMethod: 'Cash',
        roundOffAmount: 0
      }, { id: String(saleWithDeliveryId) }, {}, { id: 1, branchId: branch.id });

      const data = await execute(updateSale, mock);

      assert(mock.res.getStatusCode() === 200, 'Scenario 10: Sale updated successfully');
      assert(Number(data.deliveryCharge) === 150, 'Scenario 10: Updated delivery charge is 150');
      const expectedTotal = Number((testUnitPrice + (testUnitPrice * testTaxRate / 100) + newDeliveryAmt).toFixed(2));
      assert(Number(data.totalAmount) === expectedTotal, `Scenario 10: Updated total matches new delivery charge (${expectedTotal})`);
    }

    // Test 11: Retrieval via getAllSales
    console.log('\n--- Scenario 11: Retrieval via getAllSales ---');
    {
      const mock = createMockReqRes({}, {}, { invoice: saleWithDeliveryInvoice }, { id: 1, branchId: branch.id });
      const data = await execute(getAllSales, mock);

      assert(Array.isArray(data) && data.length > 0, 'Scenario 11: Sales list returned');
      const retrieved = data.find(s => s.id === saleWithDeliveryId);
      assert(retrieved !== undefined, 'Scenario 11: Sale found in list');
      assert(Number(retrieved.deliveryCharge) === 150, 'Scenario 11: deliveryCharge is 150');
      assert(retrieved.hasDeliveryCharge === true, 'Scenario 11: hasDeliveryCharge is true');
    }

    // Test 12: Historical Sales compatibility
    console.log('\n--- Scenario 12: Historical Sales without Delivery Charge ---');
    {
      const historical = await prisma.sale.findFirst({
        where: { id: { not: saleWithDeliveryId } }
      });
      if (historical) {
        assert(historical.deliveryCharge !== undefined, 'Scenario 12: Historical sale has deliveryCharge field');
        assert(Number(historical.deliveryCharge) === 0, 'Scenario 12: Historical sale defaults to 0 deliveryCharge');
        assert(historical.hasDeliveryCharge === false, 'Scenario 12: Historical sale defaults to false hasDeliveryCharge');
      } else {
        console.log('ℹ️ No older historical sales in DB, default schema values verified.');
      }
    }

    console.log(`\n==============================================`);
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==============================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error in tests:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
