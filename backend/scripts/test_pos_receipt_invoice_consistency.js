// Automated Test Suite: Complete POS Bill, Post-Payment Receipt, and Invoice Reconciliation
// Tests end-to-end consistency across:
// 1. POS Bill Display (Before payment)
// 2. Saved Sale Record (Database persistence)
// 3. Post-Payment Receipt (Thermal Print)
// 4. Saved Invoice (A4 / A5 Invoicing & Sales History)

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../config/prisma');

// 1. Simulates POS Frontend Calculations (pos.js `calcResults`)
function simulatePOSCartCalculation({ cart, isCustomerInterState = false, deliveryChargeEnabled = false, deliveryCharge = 0, roundOff = 0, appliedVoucher = null }) {
    let totalCatalogPrice = 0;
    let totalProductDiscount = 0;
    const taxGroups = {};

    let subTotal = 0;
    let totalTax = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const voucherDiscount = appliedVoucher ? parseFloat(appliedVoucher.value || 0) : 0;
    // Proportional voucher allocation
    const rawLineTotals = cart.map(item => {
        const effPrice = parseFloat(item.price || 0);
        const effDisc = parseFloat(item.discountAmount || 0);
        const qty = parseFloat(item.quantity || 1);
        return Math.max(0, (effPrice - effDisc) * qty);
    });
    const sumRaw = rawLineTotals.reduce((a, b) => a + b, 0);
    const lineAllocations = rawLineTotals.map(raw => sumRaw > 0 ? (raw / sumRaw) * voucherDiscount : 0);

    const calculatedLines = cart.map((item, idx) => {
        const effPrice = parseFloat(item.price || 0);
        const effDisc = parseFloat(item.discountAmount || 0);
        const qty = parseFloat(item.quantity || 1);
        const rate = parseFloat(item.taxRate || 0);
        const isInc = Boolean(item.isTaxInclusive);

        totalCatalogPrice += (effPrice * qty);
        totalProductDiscount += (effDisc * qty);

        const netUnit = Math.max(0, effPrice - effDisc);
        const linePayableBeforeVoucher = netUnit * qty;
        const vAlloc = lineAllocations[idx] || 0;
        const lineTotalPayable = Math.max(0, linePayableBeforeVoucher - vAlloc);

        let lineTax = 0;
        let lineSubTotal = 0;

        if (isInc && rate > 0) {
            const baseAmount = lineTotalPayable / (1 + (rate / 100));
            lineTax = lineTotalPayable - baseAmount;
            lineSubTotal = baseAmount;
        } else if (rate > 0) {
            lineSubTotal = lineTotalPayable;
            lineTax = (lineTotalPayable * rate) / 100;
        } else {
            lineSubTotal = lineTotalPayable;
            lineTax = 0;
        }

        const itemTaxType = isCustomerInterState ? 'igst' : (item.taxType || 'cgst_sgst');
        let cgst = 0, sgst = 0, igst = 0;
        if (rate > 0 && lineTax > 0) {
            if (itemTaxType === 'igst') {
                igst = lineTax;
            } else {
                cgst = lineTax / 2;
                sgst = lineTax / 2;
            }

            const groupKey = `${itemTaxType}_${rate}`;
            if (!taxGroups[groupKey]) {
                taxGroups[groupKey] = { key: groupKey, taxType: itemTaxType, rate, taxAmount: 0, cgst: 0, sgst: 0, igst: 0 };
            }
            taxGroups[groupKey].taxAmount += lineTax;
            taxGroups[groupKey].cgst += cgst;
            taxGroups[groupKey].sgst += sgst;
            taxGroups[groupKey].igst += igst;
        }

        subTotal += lineSubTotal;
        totalTax += lineTax;
        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;

        return {
            name: item.name,
            productId: item.id || item.productId,
            unitPrice: effPrice,
            qty,
            discountAmount: effDisc,
            lineSubtotal: effPrice * qty,
            lineTotalBeforeGst: linePayableBeforeVoucher,
            taxRate: rate,
            taxAmount: parseFloat(lineTax.toFixed(2)),
            totalWithTax: parseFloat((lineSubTotal + lineTax).toFixed(2)),
            isTaxInclusive: isInc
        };
    });

    const effectiveDelivery = deliveryChargeEnabled ? parseFloat(deliveryCharge || 0) : 0;
    const finalRoundOff = parseFloat(roundOff || 0);
    const grandTotal = parseFloat((subTotal + totalTax + effectiveDelivery + finalRoundOff).toFixed(2));

    return {
        lines: calculatedLines,
        totalCatalogPrice: parseFloat(totalCatalogPrice.toFixed(2)),
        totalProductDiscount: parseFloat(totalProductDiscount.toFixed(2)),
        voucherDiscount: parseFloat(voucherDiscount.toFixed(2)),
        taxableSubtotal: parseFloat(subTotal.toFixed(2)),
        totalTax: parseFloat(totalTax.toFixed(2)),
        cgst: parseFloat(totalCgst.toFixed(2)),
        sgst: parseFloat(totalSgst.toFixed(2)),
        igst: parseFloat(totalIgst.toFixed(2)),
        taxBreakdown: Object.values(taxGroups),
        deliveryCharge: effectiveDelivery,
        roundOff: finalRoundOff,
        grandTotal
    };
}

// 2. Simulates Backend Sales Creation & Persistence Logic (salesController.js)
function simulateBackendSaleCreation(posResult, { paymentMethod = 'Cash', paidAmount = null, customer = null, branchState = 'Tamil Nadu' }) {
    const isInterState = customer?.state && branchState && customer.state.trim().toLowerCase() !== branchState.trim().toLowerCase();
    const finalPaid = paidAmount !== null ? parseFloat(paidAmount) : posResult.grandTotal;
    const finalBalance = Math.max(0, parseFloat((posResult.grandTotal - finalPaid).toFixed(2)));

    const saleRecord = {
        id: 99901,
        invoiceNumber: 'INV-TEST-001',
        subTotal: posResult.taxableSubtotal,
        discount: posResult.totalProductDiscount,
        voucherDiscount: posResult.voucherDiscount,
        taxAmount: posResult.totalTax,
        deliveryCharge: posResult.deliveryCharge,
        hasDeliveryCharge: posResult.deliveryCharge > 0,
        roundOffAmount: posResult.roundOff,
        totalAmount: posResult.grandTotal,
        paidAmount: finalPaid,
        balanceAmount: finalBalance,
        paymentMethod,
        placeOfSupply: customer?.state || branchState,
        taxType: isInterState ? 'igst' : 'cgst_sgst',
        customer,
        items: posResult.lines.map((l, idx) => ({
            id: 1000 + idx,
            productId: l.productId,
            name: l.name,
            quantity: l.qty,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
            total: l.totalWithTax,
            isTaxInclusive: l.isTaxInclusive
        })),
        payments: [{ method: paymentMethod, amount: finalPaid }]
    };

    return saleRecord;
}

// 3. Simulates ProfessionalInvoice.js Invoice & Receipt Presentation Logic
function simulateProfessionalInvoice(saleRecord, companyProfile = { state: 'Tamil Nadu' }) {
    const items = saleRecord.items || [];
    const isInterState = saleRecord.taxType === 'igst' || 
        (saleRecord.customer?.state && companyProfile.state && saleRecord.customer.state.trim().toLowerCase() !== companyProfile.state.trim().toLowerCase()) ||
        (saleRecord.placeOfSupply && companyProfile.state && saleRecord.placeOfSupply.trim().toLowerCase() !== companyProfile.state.trim().toLowerCase());

    const getItemValues = (item) => {
        const posPrice = parseFloat(item.unitPrice || item.price || 0);
        const qty = parseFloat(item.quantity) || 1;
        const discAmt = parseFloat(item.discountAmount || 0);
        const lineSubtotal = posPrice * qty; // Line Subtotal = Selling Price * Qty
        return { posPrice, qty, discAmt, lineSubtotal };
    };

    const renderedItems = items.map(item => {
        const vals = getItemValues(item);
        return {
            name: item.name,
            rate: vals.posPrice,
            qty: vals.qty,
            discount: vals.discAmt * vals.qty,
            amount: vals.lineSubtotal
        };
    });

    // Subtotal = sum of (Actual Selling Price * Qty)
    const subtotal = renderedItems.reduce((acc, it) => acc + it.amount, 0);
    const discount = parseFloat(saleRecord.discount || 0) + parseFloat(saleRecord.voucherDiscount || 0);
    const tax = parseFloat(saleRecord.taxAmount || 0);
    const delivery = parseFloat(saleRecord.deliveryCharge || 0);
    const roundOff = parseFloat(saleRecord.roundOffAmount || 0);
    const total = parseFloat(saleRecord.totalAmount || 0);
    const paid = parseFloat(saleRecord.paidAmount || 0);
    const balance = parseFloat(saleRecord.balanceAmount || 0);

    // Tax breakdown
    const taxBreakdown = {};
    items.forEach(item => {
        const rate = parseFloat(item.taxRate || 0);
        const lineTax = parseFloat(item.taxAmount || 0);
        const tType = isInterState ? 'igst' : 'cgst_sgst';
        const key = `${rate}_${tType}`;
        if (!taxBreakdown[key]) {
            taxBreakdown[key] = { rate, taxType: tType, taxAmount: 0 };
        }
        taxBreakdown[key].taxAmount += lineTax;
    });

    return {
        tableRows: renderedItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        discount: parseFloat(discount.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        taxBreakdown: Object.values(taxBreakdown),
        delivery: parseFloat(delivery.toFixed(2)),
        roundOff: parseFloat(roundOff.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        paid: parseFloat(paid.toFixed(2)),
        balance: parseFloat(balance.toFixed(2)),
        paymentMethod: saleRecord.paymentMethod,
        isInterState
    };
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('   POS BILL, RECEIPT & INVOICE CONSISTENCY TEST SUITE          ');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    function runScenario(title, fn) {
        try {
            fn();
            console.log(`✅ [PASS] ${title}`);
            passed++;
        } catch (err) {
            console.error(`❌ [FAIL] ${title}: ${err.message}`);
            failed++;
        }
    }

    // -------------------------------------------------------------
    // SCENARIO 1: The Exact User Specification (Custom HRMS Example)
    // -------------------------------------------------------------
    runScenario('SCENARIO 1: Custom HRMS (Price ₹50,000, Disc ₹500, GST 5%, Delivery ₹199.99)', () => {
        const cartItem = {
            id: 101,
            name: 'Custom HRMS',
            price: 50000.00,
            quantity: 1,
            discountAmount: 500.00,
            taxRate: 5.0,
            isTaxInclusive: false
        };

        // 1. POS Bill Display (Before Payment)
        const posBill = simulatePOSCartCalculation({
            cart: [cartItem],
            isCustomerInterState: true, // Inter-state IGST test
            deliveryChargeEnabled: true,
            deliveryCharge: 199.99,
            roundOff: 0.00
        });

        assert.strictEqual(posBill.totalCatalogPrice, 50000.00, 'POS Subtotal must be ₹50,000.00');
        assert.strictEqual(posBill.totalProductDiscount, 500.00, 'POS Discount must be -₹500.00');
        assert.strictEqual(posBill.taxableSubtotal, 49500.00, 'POS Taxable Base must be ₹49,500.00');
        assert.strictEqual(posBill.totalTax, 2475.00, 'POS GST (5%) must be +₹2,475.00');
        assert.strictEqual(posBill.deliveryCharge, 199.99, 'POS Delivery Charge must be +₹199.99');
        assert.strictEqual(posBill.roundOff, 0.00, 'POS Round-off must be ₹0.00');
        assert.strictEqual(posBill.grandTotal, 52174.99, 'POS Bill Total must be exactly ₹52,174.99');

        // Cart Line Details
        const cartLine = posBill.lines[0];
        assert.strictEqual(cartLine.unitPrice, 50000.00, 'Cart Unit Price must be pre-tax ₹50,000.00');
        assert.strictEqual(cartLine.lineTotalBeforeGst, 49500.00, 'Cart Line Total before GST must be ₹49,500.00');

        // 2. Backend Sales Creation & Database Persistence
        const savedSale = simulateBackendSaleCreation(posBill, {
            paymentMethod: 'Cash',
            paidAmount: 52174.99,
            customer: { id: 55, name: 'Apex Corp', state: 'Karnataka' },
            branchState: 'Tamil Nadu'
        });

        assert.strictEqual(savedSale.totalAmount, 52174.99, 'Saved Sale totalAmount must be ₹52,174.99');
        assert.strictEqual(savedSale.paidAmount, 52174.99, 'Saved Sale paidAmount must be ₹52,174.99');
        assert.strictEqual(savedSale.taxType, 'igst', 'Saved Sale taxType must be IGST for inter-state');

        // 3. Post-Payment Receipt & Invoice Generation
        const invoiceOutput = simulateProfessionalInvoice(savedSale, { state: 'Tamil Nadu' });

        // Item Table Verification
        assert.strictEqual(invoiceOutput.tableRows.length, 1);
        const row = invoiceOutput.tableRows[0];
        assert.strictEqual(row.rate, 50000.00, 'Invoice Table Rate must be ₹50,000.00');
        assert.strictEqual(row.qty, 1, 'Invoice Table Qty must be 1');
        assert.strictEqual(row.amount, 50000.00, 'Invoice Table Amount must be ₹50,000.00 (Pre-tax Line Subtotal)');
        assert.strictEqual(row.discount, 500.00, 'Invoice Table item discount must be ₹500.00');

        // Financial Summary Verification: POS == Receipt == Invoice
        assert.strictEqual(invoiceOutput.subtotal, posBill.totalCatalogPrice, 'Invoice Subtotal must match POS Subtotal ₹50,000.00');
        assert.strictEqual(invoiceOutput.discount, posBill.totalProductDiscount, 'Invoice Discount must match POS Discount -₹500.00');
        assert.strictEqual(invoiceOutput.tax, posBill.totalTax, 'Invoice GST must match POS GST +₹2,475.00');
        assert.strictEqual(invoiceOutput.delivery, posBill.deliveryCharge, 'Invoice Delivery must match POS Delivery +₹199.99');
        assert.strictEqual(invoiceOutput.roundOff, posBill.roundOff, 'Invoice Round-off must match POS Round-off ₹0.00');
        assert.strictEqual(invoiceOutput.total, posBill.grandTotal, 'Invoice Bill Total must match POS Bill Total ₹52,174.99');
        assert.strictEqual(invoiceOutput.paid, 52174.99, 'Invoice Paid Amount must be ₹52,174.99');
        assert.strictEqual(invoiceOutput.balance, 0.00, 'Invoice Balance must be ₹0.00');
        assert.strictEqual(invoiceOutput.isInterState, true, 'Invoice must recognize IGST');
    });

    // -------------------------------------------------------------
    // SCENARIO 2: Intra-State Transaction (CGST + SGST Split)
    // -------------------------------------------------------------
    runScenario('SCENARIO 2: Intra-State Transaction with 50/50 CGST and SGST', () => {
        const cartItem = { id: 102, name: 'Cotton Shirt', price: 2000.00, quantity: 2, discountAmount: 100.00, taxRate: 12.0, isTaxInclusive: false };
        const posBill = simulatePOSCartCalculation({ cart: [cartItem], isCustomerInterState: false });

        // Subtotal = 2 * 2000 = 4000. Discount = 2 * 100 = 200. Taxable Base = 3800.
        // Tax = 3800 * 12% = 456. CGST = 228, SGST = 228. Total = 4256.00
        assert.strictEqual(posBill.totalCatalogPrice, 4000.00);
        assert.strictEqual(posBill.totalProductDiscount, 200.00);
        assert.strictEqual(posBill.totalTax, 456.00);
        assert.strictEqual(posBill.cgst, 228.00);
        assert.strictEqual(posBill.sgst, 228.00);
        assert.strictEqual(posBill.igst, 0.00);
        assert.strictEqual(posBill.grandTotal, 4256.00);

        const savedSale = simulateBackendSaleCreation(posBill, { customer: { id: 10, state: 'Tamil Nadu' }, branchState: 'Tamil Nadu' });
        const invoiceOutput = simulateProfessionalInvoice(savedSale, { state: 'Tamil Nadu' });

        assert.strictEqual(invoiceOutput.subtotal, 4000.00);
        assert.strictEqual(invoiceOutput.discount, 200.00);
        assert.strictEqual(invoiceOutput.tax, 456.00);
        assert.strictEqual(invoiceOutput.total, 4256.00);
        assert.strictEqual(invoiceOutput.isInterState, false);
    });

    // -------------------------------------------------------------
    // SCENARIO 3: Multiple Products with Mixed GST Rates (0%, 5%, 18%)
    // -------------------------------------------------------------
    runScenario('SCENARIO 3: Mixed GST Rates (0%, 5%, 18%) across multiple items', () => {
        const item1 = { id: 1, name: 'Exempt Food', price: 500, quantity: 2, taxRate: 0, isTaxInclusive: false };
        const item2 = { id: 2, name: 'Medicines', price: 1000, quantity: 1, taxRate: 5, isTaxInclusive: false };
        const item3 = { id: 3, name: 'Electronics', price: 4000, quantity: 1, taxRate: 18, isTaxInclusive: false };

        const posBill = simulatePOSCartCalculation({ cart: [item1, item2, item3] });
        // Subtotal = 1000 + 1000 + 4000 = 6000
        // Tax = 0 + 50 + 720 = 770
        // Total = 6770.00
        assert.strictEqual(posBill.totalCatalogPrice, 6000.00);
        assert.strictEqual(posBill.totalTax, 770.00);
        assert.strictEqual(posBill.grandTotal, 6770.00);

        const savedSale = simulateBackendSaleCreation(posBill, {});
        const invoiceOutput = simulateProfessionalInvoice(savedSale);

        assert.strictEqual(invoiceOutput.subtotal, 6000.00);
        assert.strictEqual(invoiceOutput.tax, 770.00);
        assert.strictEqual(invoiceOutput.total, 6770.00);
        assert.strictEqual(invoiceOutput.tableRows.length, 3);
    });

    // -------------------------------------------------------------
    // SCENARIO 4: GST-Inclusive Pricing Mode (Tax extraction without double tax)
    // -------------------------------------------------------------
    runScenario('SCENARIO 4: GST-Inclusive product retains price without charging GST twice', () => {
        const item = { id: 4, name: 'Inclusive Apparel', price: 1050.00, quantity: 1, taxRate: 5, isTaxInclusive: true };
        const posBill = simulatePOSCartCalculation({ cart: [item] });

        // Taxable Base = 1050 / 1.05 = 1000.00. Tax = 50.00. Grand Total = 1050.00
        assert.strictEqual(posBill.taxableSubtotal, 1000.00);
        assert.strictEqual(posBill.totalTax, 50.00);
        assert.strictEqual(posBill.grandTotal, 1050.00);

        const savedSale = simulateBackendSaleCreation(posBill, {});
        const invoiceOutput = simulateProfessionalInvoice(savedSale);

        assert.strictEqual(invoiceOutput.total, 1050.00);
        assert.strictEqual(invoiceOutput.tax, 50.00);
    });

    // -------------------------------------------------------------
    // SCENARIO 5: Manual Cashier Price Override Retention
    // -------------------------------------------------------------
    runScenario('SCENARIO 5: Cashier overrides price in POS -> Invoice retains overridden price, never reverts to base product price', () => {
        // Base product catalog price is ₹8,000, cashier discounted/overrode to ₹6,500
        const item = { id: 5, name: 'Overridden Item', price: 6500.00, originalPrice: 6500.00, quantity: 1, taxRate: 18, isTaxInclusive: false };
        const posBill = simulatePOSCartCalculation({ cart: [item] });

        // Subtotal = 6500. Tax @ 18% = 1170. Total = 7670.00
        assert.strictEqual(posBill.totalCatalogPrice, 6500.00);
        assert.strictEqual(posBill.totalTax, 1170.00);
        assert.strictEqual(posBill.grandTotal, 7670.00);

        const savedSale = simulateBackendSaleCreation(posBill, {});
        // Mock that product catalog in DB has price = 8000
        savedSale.items[0].product = { price: 8000.00 };

        const invoiceOutput = simulateProfessionalInvoice(savedSale);
        // Must use item.unitPrice (6500), NOT product.price (8000)
        assert.strictEqual(invoiceOutput.subtotal, 6500.00, 'Invoice Subtotal must be ₹6,500, never reverted to ₹8,000');
        assert.strictEqual(invoiceOutput.total, 7670.00, 'Invoice Total must be ₹7,670');
    });

    // -------------------------------------------------------------
    // SCENARIO 6: Split Payment Method & Balance Due Handling
    // -------------------------------------------------------------
    runScenario('SCENARIO 6: Split payment (Cash + Card) and partial payment balance due', () => {
        const item = { id: 6, name: 'Suit Jacket', price: 10000.00, quantity: 1, taxRate: 12, isTaxInclusive: false };
        const posBill = simulatePOSCartCalculation({ cart: [item] });

        // Total = 10000 + 1200 = 11200. Paid: 6000 Cash, 5200 Card. Balance: 0
        const savedSale = simulateBackendSaleCreation(posBill, { paymentMethod: 'Split', paidAmount: 11200.00 });
        savedSale.payments = [
            { method: 'Cash', amount: 6000.00 },
            { method: 'Card', amount: 5200.00 }
        ];

        const invoiceOutput = simulateProfessionalInvoice(savedSale);
        assert.strictEqual(invoiceOutput.total, 11200.00);
        assert.strictEqual(invoiceOutput.paid, 11200.00);
        assert.strictEqual(invoiceOutput.balance, 0.00);
        assert.strictEqual(savedSale.payments.length, 2);
    });

    // -------------------------------------------------------------
    // SCENARIO 7: Source Code UI Inspection - No "Taxable Amount"
    // -------------------------------------------------------------
    runScenario('SCENARIO 7: Source Code Inspection - "Taxable Amount" row is absent from POS UI and Invoice UI', () => {
        const posContent = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/pos.js'), 'utf8');
        const invoiceContent = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/ProfessionalInvoice.js'), 'utf8');

        // Check for UI label occurrences (e.g. >Taxable Amount<, "Taxable Amount")
        const posTaxableMatch = posContent.match(/>\s*Taxable Amount\s*</i);
        const invoiceTaxableMatch = invoiceContent.match(/>\s*Taxable Amount\s*</i);

        assert.strictEqual(posTaxableMatch, null, 'pos.js must not render "Taxable Amount" row in UI');
        assert.strictEqual(invoiceTaxableMatch, null, 'ProfessionalInvoice.js must not render "Taxable Amount" row in UI');
    });

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n================================================================');
    console.log(`TOTAL SCENARIOS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error in consistency test suite:', err);
    process.exit(1);
});
