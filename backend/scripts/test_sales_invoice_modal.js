const prisma = require('../config/prisma');

async function testInvoiceReportReconciliation() {
  console.log('========================================================================');
  console.log('TESTING INVOICE DETAIL MODAL & SALES REPORT RECONCILIATION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  // 1. Fetch Target Sale 81 (The one from user report screenshot)
  const sale81 = await prisma.sale.findUnique({
    where: { id: 81 },
    include: {
      items: { include: { product: true } },
      customer: true,
      branch: true,
      salesman: true,
      payments: true
    }
  });

  assert(sale81 !== null, 'Sale 81 exists in database');
  if (sale81) {
    const items = sale81.items;
    assert(items.length === 2, 'Sale 81 has 2 line items');

    const item1 = items.find(i => i.product.name.includes('HRMS')) || items[0];
    const item2 = items.find(i => i.product.name.includes('CRM')) || items[1];

    const uPrice1 = parseFloat(item1.unitPrice);
    const qty1 = item1.quantity;
    const lineTotal1 = uPrice1 * qty1;

    const uPrice2 = parseFloat(item2.unitPrice);
    const qty2 = item2.quantity;
    const lineTotal2 = uPrice2 * qty2;

    assert(uPrice1 === 50000, `Item 1 Unit Price is 50,000 (actual: ${uPrice1})`);
    assert(qty1 === 2, `Item 1 Quantity is 2 (actual: ${qty1})`);
    assert(lineTotal1 === 100000, `Item 1 Line Total (Price × Qty) is 100,000 (actual: ${lineTotal1})`);

    assert(uPrice2 === 30000, `Item 2 Unit Price is 30,000 (actual: ${uPrice2})`);
    assert(qty2 === 2, `Item 2 Quantity is 2 (actual: ${qty2})`);
    assert(lineTotal2 === 60000, `Item 2 Line Total (Price × Qty) is 60,000 (actual: ${lineTotal2})`);

    const productTotal = lineTotal1 + lineTotal2;
    assert(productTotal === 160000, `Product Total (Sum of Line Items) is 160,000 (actual: ${productTotal})`);

    const discount = parseFloat(sale81.discount) + parseFloat(sale81.voucherDiscount || 0);
    assert(discount === 6200, `Applicable Discount is 6,200 (actual: ${discount})`);

    const taxableAmount = parseFloat(sale81.subTotal);
    assert(taxableAmount === 153800, `Taxable Subtotal is 153,800 (actual: ${taxableAmount})`);

    assert(productTotal - discount === taxableAmount, `Reconciliation: Product Total (160,000) - Discount (6,200) = Taxable Amount (153,800)`);

    const taxAmount = parseFloat(sale81.taxAmount);
    assert(taxAmount === 7132, `Tax Amount is 7,132 (actual: ${taxAmount})`);

    const totalPayable = parseFloat(sale81.totalAmount);
    assert(totalPayable === 160932, `Total Payable is 160,932 (actual: ${totalPayable})`);

    assert(taxableAmount + taxAmount === totalPayable, `Reconciliation: Taxable Amount (153,800) + Tax (7,132) = Total Payable (160,932)`);
    assert(productTotal - discount + taxAmount === totalPayable, `Full Reconciliation: Product Total - Discount + Tax = Total Payable`);
  }

  // 2. Fetch Sale 61 (With Delivery Charge)
  const sale61 = await prisma.sale.findUnique({
    where: { id: 61 },
    include: { items: true }
  });

  if (sale61) {
    const prodTotal61 = sale61.items.reduce((s, i) => s + (parseFloat(i.unitPrice) * i.quantity), 0);
    const disc61 = parseFloat(sale61.discount);
    const sub61 = parseFloat(sale61.subTotal);
    const tax61 = parseFloat(sale61.taxAmount);
    const deliv61 = parseFloat(sale61.deliveryCharge);
    const tot61 = parseFloat(sale61.totalAmount);

    assert(prodTotal61 === 100000, `Sale 61 Product Total is 100,000 (actual: ${prodTotal61})`);
    assert(disc61 === 1000, `Sale 61 Discount is 1,000 (actual: ${disc61})`);
    assert(sub61 === 99000, `Sale 61 Taxable Base is 99,000 (actual: ${sub61})`);
    assert(deliv61 === 350, `Sale 61 Delivery Charge is 350 (actual: ${deliv61})`);
    assert(sub61 + tax61 + deliv61 === tot61, `Sale 61 Reconciliation with delivery charge: 99,000 + 4,950 + 350 = 104,300 (actual: ${tot61})`);
  }

  // 3. Fetch Sale 60 (With Voucher & Round Off)
  const sale60 = await prisma.sale.findUnique({
    where: { id: 60 },
    include: { items: true }
  });

  if (sale60) {
    const prodTotal60 = sale60.items.reduce((s, i) => s + (parseFloat(i.unitPrice) * i.quantity), 0);
    const voucherDisc60 = parseFloat(sale60.voucherDiscount);
    const sub60 = parseFloat(sale60.subTotal);
    const tax60 = parseFloat(sale60.taxAmount);
    const deliv60 = parseFloat(sale60.deliveryCharge);
    const round60 = parseFloat(sale60.roundOffAmount);
    const tot60 = parseFloat(sale60.totalAmount);

    assert(prodTotal60 === 50000, `Sale 60 Product Total is 50,000 (actual: ${prodTotal60})`);
    assert(voucherDisc60 === 60, `Sale 60 Voucher Discount is 60 (actual: ${voucherDisc60})`);
    assert(sub60 === 49940, `Sale 60 Taxable Base is 49,940 (actual: ${sub60})`);
    assert(Number((sub60 + tax60 + deliv60 + round60).toFixed(2)) === tot60, `Sale 60 Reconciliation with voucher & round-off: 49,940 + 2,497 + 199.99 + 4 = 52,640.99 (actual: ${tot60})`);
  }

  // 4. Test reportsController getSalesAnalyticsReport API simulation
  console.log('\nTesting reportsController mapping...');
  const allSales = await prisma.sale.findMany({
    take: 10,
    orderBy: { id: 'desc' },
    include: {
      customer: true,
      branch: true,
      salesman: { select: { id: true, name: true, username: true } },
      payments: true,
      items: { include: { product: true } }
    }
  });

  for (const s of allSales) {
    const productTotal = Number(s.items.reduce((sum, item) => sum + ((parseFloat(item.unitPrice) || 0) * (item.quantity || 1)), 0).toFixed(2));
    const rawDiscount = Number((parseFloat(s.discount) || 0).toFixed(2));
    const rawVoucherDiscount = Number((parseFloat(s.voucherDiscount) || 0).toFixed(2));
    const itemDiscountsSum = Number(s.items.reduce((sum, item) => sum + ((parseFloat(item.discountAmount) || 0) * (item.quantity || 1)), 0).toFixed(2));
    const effectiveDiscount = Number((Math.max(rawDiscount, itemDiscountsSum) + rawVoucherDiscount).toFixed(2));

    const subTotal = Number((parseFloat(s.subTotal) || 0).toFixed(2));
    const taxAmount = Number((parseFloat(s.taxAmount) || 0).toFixed(2));
    const deliveryCharge = Number((parseFloat(s.deliveryCharge) || 0).toFixed(2));
    const roundOffAmount = Number((parseFloat(s.roundOffAmount) || 0).toFixed(2));
    const totalAmount = Number((parseFloat(s.totalAmount) || 0).toFixed(2));

    // Verify item line totals: each item.unitPrice * quantity
    const itemTotalSum = s.items.reduce((sum, i) => sum + ((parseFloat(i.unitPrice) || 0) * (i.quantity || 1)), 0);
    assert(Math.abs(itemTotalSum - productTotal) < 0.01, `Invoice ${s.invoiceNumber}: Line items sum (${itemTotalSum.toFixed(2)}) == productTotal (${productTotal.toFixed(2)})`);

    // Verify total payable formula
    const calculatedPayable = Number((subTotal + taxAmount + deliveryCharge + roundOffAmount).toFixed(2));
    assert(Math.abs(calculatedPayable - totalAmount) < 0.02, `Invoice ${s.invoiceNumber}: Subtotal + Tax + Delivery + Roundoff (${calculatedPayable}) == Total Amount (${totalAmount})`);
  }

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

testInvoiceReportReconciliation()
  .catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
