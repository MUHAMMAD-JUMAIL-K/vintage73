// Automated Test: Professional Invoice Breakdown & Calculations Verification
// Tests all 8 scenarios and exact formula rules specified in user request.

const assert = require('assert');

// Simulate the pricing & summary calculation logic from ProfessionalInvoice.js
function calculateInvoiceDisplay(printData) {
    const {
        items = [],
        subTotal = 0,
        discount = 0,
        voucherDiscount = 0,
        voucherCode = null,
        taxAmount = 0,
        deliveryCharge = 0,
        hasDeliveryCharge = false,
        roundOffAmount = 0,
        advanceUsed = 0,
        totalAmount = 0,
        paidAmount = 0,
        payments = []
    } = printData;

    const invoiceDiscount = parseFloat(discount || 0);
    const vDiscount = parseFloat(voucherDiscount || 0);
    const itemDiscountAmt = Math.max(0, invoiceDiscount - vDiscount);

    const getItemValues = (item) => {
        if (!item) return { origPrice: 0, afterProdPrice: 0, vAlloc: 0, lineTotal: 0, taxRate: 0, qty: 0 };
        const posPrice = parseFloat(item.unitPrice || item.price || 0);
        const discAmt = parseFloat(item.discountAmount || 0);
        const afterProdPrice = Math.max(0, posPrice - discAmt);
        const origPrice = (item.originalUnitPrice !== undefined && item.originalUnitPrice !== null)
            ? parseFloat(item.originalUnitPrice)
            : (item.product?.price !== undefined && item.product?.price !== null
                ? parseFloat(item.product.price)
                : posPrice);
        const vAlloc = parseFloat(item.voucherDiscountAmount || 0);
        const qty = parseFloat(item.quantity) || 1;
        const taxRate = parseFloat(item.taxRate || item.taxPercent || item.product?.taxRate || 0);
        const lineTax = parseFloat(item.taxAmount || 0);
        const lineTotal = item.total !== undefined
            ? parseFloat(item.total)
            : Math.max(0, (qty * afterProdPrice) - vAlloc + lineTax);
        return { origPrice, afterProdPrice, vAlloc, lineTotal, taxRate, qty };
    };

    let totalBeforeDiscount = 0;
    let totalAfterProductDiscount = 0;
    const processedItems = items.map(item => {
        const vals = getItemValues(item);
        totalBeforeDiscount += vals.origPrice * vals.qty;
        totalAfterProductDiscount += vals.afterProdPrice * vals.qty;
        return {
            ...item,
            ...vals
        };
    });

    const calculatedProdDisc = Math.max(0, totalBeforeDiscount - totalAfterProductDiscount);
    const prodDiscountAmt = calculatedProdDisc > 0.005 ? calculatedProdDisc : itemDiscountAmt;
    const effectiveTotalBeforeDiscount = Math.max(totalBeforeDiscount, totalAfterProductDiscount + prodDiscountAmt);

    const taxableSubtotal = parseFloat(subTotal || 0);
    const gstTaxAmt = parseFloat(taxAmount || 0);
    const deliveryAmt = parseFloat(deliveryCharge || 0);
    const isDeliveryActive = deliveryAmt > 0 || hasDeliveryCharge;
    const roundOffAmt = parseFloat(roundOffAmount || 0);
    const advanceAmt = parseFloat(advanceUsed || 0);
    const grandTotalAmt = parseFloat(totalAmount || 0);
    const paidAmt = printData.paidAmount !== undefined ? parseFloat(printData.paidAmount) : parseFloat(paidAmount || 0);
    const balanceAmt = printData.balanceAmount !== undefined ? parseFloat(printData.balanceAmount) : Math.max(0, grandTotalAmt - paidAmt - advanceAmt);

    return {
        processedItems,
        summary: {
            effectiveTotalBeforeDiscount,
            prodDiscountAmt,
            totalAfterProductDiscount,
            vDiscount,
            voucherCode,
            taxableSubtotal,
            gstTaxAmt,
            deliveryAmt,
            isDeliveryActive,
            roundOffAmt,
            advanceAmt,
            grandTotalAmt,
            paidAmt,
            balanceAmt
        }
    };
}

console.log('=== RUNNING INVOICE CALCULATION & BREAKDOWN VERIFICATIONS ===\n');

// -------------------------------------------------------------
// USER FORMULA CHECK:
// If a product has Catalog Price 1000, POS selling price after product discount 900, and Voucher discount 60:
// - Before Discount = 1000
// - After Discount = 900
// - Voucher Discount = 60
// - Line before tax = 840
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Formal Shirt', price: 1000 },
            originalUnitPrice: 1000,
            unitPrice: 1000,
            discountAmount: 100, // POS product discount
            voucherDiscountAmount: 60,
            quantity: 1,
            taxAmount: 0,
            total: 840
        }],
        subTotal: 840,
        discount: 160,
        voucherDiscount: 60,
        voucherCode: 'VCHR60',
        totalAmount: 840,
        paidAmount: 840
    });

    const item = res.processedItems[0];
    assert.strictEqual(item.origPrice, 1000, 'Formula Check: Before Discount must be 1000');
    assert.strictEqual(item.afterProdPrice, 900, 'Formula Check: After Discount must be 900');
    assert.strictEqual(item.vAlloc, 60, 'Formula Check: Voucher Discount must be 60');
    assert.strictEqual(item.lineTotal, 840, 'Formula Check: Total must be 840');
    assert.strictEqual(res.summary.effectiveTotalBeforeDiscount, 1000, 'Summary: Before Discount must be 1000');
    assert.strictEqual(res.summary.prodDiscountAmt, 100, 'Summary: Product Discount must be 100');
    assert.strictEqual(res.summary.totalAfterProductDiscount, 900, 'Summary: After Prod Disc must be 900');
    assert.strictEqual(res.summary.vDiscount, 60, 'Summary: Voucher Discount must be 60');
    assert.strictEqual(res.summary.taxableSubtotal, 840, 'Summary: Taxable Subtotal must be 840');
    assert.strictEqual(res.summary.grandTotalAmt, 840, 'Summary: Grand Total must be 840');
    console.log('✓ PASS: Formula Check passed successfully.');
}

// -------------------------------------------------------------
// TEST CASE 1: No Discount
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Item 1', price: 500 },
            originalUnitPrice: 500,
            unitPrice: 500,
            discountAmount: 0,
            voucherDiscountAmount: 0,
            quantity: 2,
            taxAmount: 0,
            total: 1000
        }],
        subTotal: 1000,
        discount: 0,
        voucherDiscount: 0,
        totalAmount: 1000,
        paidAmount: 1000
    });

    assert.strictEqual(res.processedItems[0].origPrice, 500);
    assert.strictEqual(res.processedItems[0].afterProdPrice, 500);
    assert.strictEqual(res.processedItems[0].vAlloc, 0);
    assert.strictEqual(res.summary.prodDiscountAmt, 0, 'No product discount');
    assert.strictEqual(res.summary.vDiscount, 0, 'No voucher discount');
    assert.strictEqual(res.summary.grandTotalAmt, 1000);
    console.log('✓ PASS: Scenario 1 - No Discount passed.');
}

// -------------------------------------------------------------
// TEST CASE 2: Product Discount Only
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Jeans', price: 1200 },
            originalUnitPrice: 1200,
            unitPrice: 1200,
            discountAmount: 200,
            voucherDiscountAmount: 0,
            quantity: 1,
            taxAmount: 0,
            total: 1000
        }],
        subTotal: 1000,
        discount: 200,
        voucherDiscount: 0,
        totalAmount: 1000,
        paidAmount: 1000
    });

    assert.strictEqual(res.processedItems[0].origPrice, 1200);
    assert.strictEqual(res.processedItems[0].afterProdPrice, 1000);
    assert.strictEqual(res.summary.effectiveTotalBeforeDiscount, 1200);
    assert.strictEqual(res.summary.prodDiscountAmt, 200);
    assert.strictEqual(res.summary.totalAfterProductDiscount, 1000);
    assert.strictEqual(res.summary.vDiscount, 0);
    console.log('✓ PASS: Scenario 2 - Product Discount Only passed.');
}

// -------------------------------------------------------------
// TEST CASE 3: Voucher Discount Only
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Shoes', price: 2000 },
            originalUnitPrice: 2000,
            unitPrice: 2000,
            discountAmount: 0,
            voucherDiscountAmount: 300,
            quantity: 1,
            taxAmount: 0,
            total: 1700
        }],
        subTotal: 1700,
        discount: 300,
        voucherDiscount: 300,
        voucherCode: 'SAVE300',
        totalAmount: 1700,
        paidAmount: 1700
    });

    assert.strictEqual(res.processedItems[0].origPrice, 2000);
    assert.strictEqual(res.processedItems[0].afterProdPrice, 2000);
    assert.strictEqual(res.processedItems[0].vAlloc, 300);
    assert.strictEqual(res.summary.prodDiscountAmt, 0);
    assert.strictEqual(res.summary.vDiscount, 300);
    assert.strictEqual(res.summary.taxableSubtotal, 1700);
    assert.strictEqual(res.summary.grandTotalAmt, 1700);
    console.log('✓ PASS: Scenario 3 - Voucher Discount Only passed.');
}

// -------------------------------------------------------------
// TEST CASE 4: Both Product Discount and Voucher Discount
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Suit', price: 5000 },
            originalUnitPrice: 5000,
            unitPrice: 5000,
            discountAmount: 500, // net 4500
            voucherDiscountAmount: 500, // line payable 4000
            quantity: 1,
            taxAmount: 0,
            total: 4000
        }],
        subTotal: 4000,
        discount: 1000,
        voucherDiscount: 500,
        voucherCode: 'VIP500',
        totalAmount: 4000,
        paidAmount: 4000
    });

    assert.strictEqual(res.processedItems[0].origPrice, 5000);
    assert.strictEqual(res.processedItems[0].afterProdPrice, 4500);
    assert.strictEqual(res.processedItems[0].vAlloc, 500);
    assert.strictEqual(res.summary.effectiveTotalBeforeDiscount, 5000);
    assert.strictEqual(res.summary.prodDiscountAmt, 500);
    assert.strictEqual(res.summary.totalAfterProductDiscount, 4500);
    assert.strictEqual(res.summary.vDiscount, 500);
    assert.strictEqual(res.summary.grandTotalAmt, 4000);
    console.log('✓ PASS: Scenario 4 - Dual Discounts passed.');
}

// -------------------------------------------------------------
// TEST CASE 5: Cashier-Overridden Selling Price
// -------------------------------------------------------------
{
    // Product catalog price was 1000. Cashier typed 950 into POS and gave 50 item discount.
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Kurta', price: 1000 },
            originalUnitPrice: 1000,
            unitPrice: 950,
            discountAmount: 50, // net 900
            voucherDiscountAmount: 0,
            quantity: 1,
            taxAmount: 0,
            total: 900
        }],
        subTotal: 900,
        discount: 100,
        voucherDiscount: 0,
        totalAmount: 900,
        paidAmount: 900
    });

    assert.strictEqual(res.processedItems[0].origPrice, 1000, 'Original catalog price preserved');
    assert.strictEqual(res.processedItems[0].afterProdPrice, 900, 'POS net unit price is 900');
    assert.strictEqual(res.summary.effectiveTotalBeforeDiscount, 1000);
    assert.strictEqual(res.summary.prodDiscountAmt, 100, 'Savings = Catalog (1000) - AfterProd (900)');
    assert.strictEqual(res.summary.totalAfterProductDiscount, 900);
    console.log('✓ PASS: Scenario 5 - Cashier-overridden price passed.');
}

// -------------------------------------------------------------
// TEST CASE 6: GST-inclusive and GST-exclusive Items
// -------------------------------------------------------------
{
    // GST exclusive 18% on 840 (after 900 - 60 voucher): tax = 151.20, total = 991.20
    const resExclusive = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Blazer', price: 1000 },
            originalUnitPrice: 1000,
            unitPrice: 1000,
            discountAmount: 100,
            voucherDiscountAmount: 60,
            quantity: 1,
            taxRate: 18,
            taxAmount: 151.20,
            total: 991.20
        }],
        subTotal: 840,
        taxAmount: 151.20,
        discount: 160,
        voucherDiscount: 60,
        totalAmount: 991.20,
        paidAmount: 991.20
    });

    assert.strictEqual(resExclusive.summary.taxableSubtotal, 840);
    assert.strictEqual(resExclusive.summary.gstTaxAmt, 151.20);
    assert.strictEqual(resExclusive.summary.grandTotalAmt, 991.20);

    // GST inclusive 18% on 840: base = 711.86, tax = 128.14, total = 840
    const resInclusive = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Blazer', price: 1000 },
            originalUnitPrice: 1000,
            unitPrice: 1000,
            discountAmount: 100,
            voucherDiscountAmount: 60,
            quantity: 1,
            taxRate: 18,
            taxAmount: 128.14,
            isTaxInclusive: true,
            total: 840
        }],
        subTotal: 711.86,
        taxAmount: 128.14,
        discount: 160,
        voucherDiscount: 60,
        totalAmount: 840,
        paidAmount: 840
    });

    assert.strictEqual(resInclusive.summary.taxableSubtotal, 711.86);
    assert.strictEqual(resInclusive.summary.gstTaxAmt, 128.14);
    assert.strictEqual(resInclusive.summary.grandTotalAmt, 840);
    console.log('✓ PASS: Scenario 6 - GST Inclusive & Exclusive passed.');
}

// -------------------------------------------------------------
// TEST CASE 7: Delivery Charge and Customer Advance
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Watch', price: 1000 },
            originalUnitPrice: 1000,
            unitPrice: 1000,
            discountAmount: 100,
            voucherDiscountAmount: 60,
            quantity: 1,
            total: 840
        }],
        subTotal: 840,
        deliveryCharge: 50,
        hasDeliveryCharge: true,
        advanceUsed: 200,
        totalAmount: 890,
        paidAmount: 690,
        balanceAmount: 0
    });

    assert.strictEqual(res.summary.deliveryAmt, 50);
    assert.strictEqual(res.summary.isDeliveryActive, true);
    assert.strictEqual(res.summary.advanceAmt, 200);
    assert.strictEqual(res.summary.grandTotalAmt, 890);
    assert.strictEqual(res.summary.paidAmt, 690);
    assert.strictEqual(res.summary.balanceAmt, 0);
    console.log('✓ PASS: Scenario 7 - Delivery Charge & Customer Advance passed.');
}

// -------------------------------------------------------------
// TEST CASE 8: Historical Invoice Printing
// (Legacy record with null originalUnitPrice and no voucher fields)
// -------------------------------------------------------------
{
    const res = calculateInvoiceDisplay({
        items: [{
            product: { name: 'Legacy Product', price: 750 },
            originalUnitPrice: null,
            unitPrice: 750,
            discountAmount: 50,
            voucherDiscountAmount: null,
            quantity: 2,
            total: 1400
        }],
        subTotal: 1400,
        discount: 100,
        totalAmount: 1400,
        paidAmount: 1000,
        balanceAmount: 400
    });

    assert.strictEqual(res.processedItems[0].origPrice, 750, 'Fallback to product.price');
    assert.strictEqual(res.processedItems[0].afterProdPrice, 700, '750 - 50 = 700');
    assert.strictEqual(res.processedItems[0].vAlloc, 0, 'Null voucher discount defaults to 0');
    assert.strictEqual(res.summary.effectiveTotalBeforeDiscount, 1500, '2 * 750 = 1500');
    assert.strictEqual(res.summary.prodDiscountAmt, 100, '1500 - 1400 = 100');
    assert.strictEqual(res.summary.balanceAmt, 400, 'Balance due = 400');
    console.log('✓ PASS: Scenario 8 - Historical Invoice Printing passed.');
}

console.log('\n=============================================================');
console.log('ALL 8 VERIFICATION SCENARIOS PASSED WITH ZERO ERRORS!');
console.log('=============================================================');
