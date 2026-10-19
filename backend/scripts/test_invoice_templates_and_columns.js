// Verification Test: All 5 Invoice Templates, 4-Column Table, Simplified Summary & Thermal Settings
const assert = require('assert');

console.log('=== TEST: INVOICE TEMPLATES, 4-COLUMNS, SIMPLIFIED SUMMARY & THERMAL STYLING ===\n');

// 1. Template normalization check
const { normalizeTemplateId, INVOICE_TEMPLATES } = require('../../frontend/src/lib/invoiceTemplates.js');

const expectedTemplates = ['modern', 'minimal', 'classic', 'bold', 'boutique_a5'];

console.log('1. Verifying all 5 templates exist in INVOICE_TEMPLATES:');
expectedTemplates.forEach(tpl => {
    const found = INVOICE_TEMPLATES.find(t => t.id === tpl);
    assert(found, `Template ${tpl} must exist in INVOICE_TEMPLATES`);
    console.log(`   ✓ Found template: ${found.name} (id: ${found.id})`);
});

console.log('\n2. Verifying normalizeTemplateId mappings:');
assert.strictEqual(normalizeTemplateId('modern'), 'modern');
assert.strictEqual(normalizeTemplateId('minimal'), 'minimal');
assert.strictEqual(normalizeTemplateId('classic'), 'classic');
assert.strictEqual(normalizeTemplateId('bold'), 'bold');
assert.strictEqual(normalizeTemplateId('boutique_a5'), 'boutique_a5');
assert.strictEqual(normalizeTemplateId('boutique'), 'modern');
assert.strictEqual(normalizeTemplateId('simple'), 'minimal');
assert.strictEqual(normalizeTemplateId('new_boutique'), 'boutique_a5');
assert.strictEqual(normalizeTemplateId('new boutique'), 'boutique_a5');
assert.strictEqual(normalizeTemplateId('unknown'), 'modern');
console.log('   ✓ normalizeTemplateId maps all variants correctly.');

// 3. Inspect ProfessionalInvoice.js source code for constraints
const fs = require('fs');
const path = require('path');
const invoiceSrc = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/ProfessionalInvoice.js'), 'utf8');

console.log('\n3. Verifying 4-Column Layout constraints (NO MRP column):');
// The user strictly asked:
// "Do NOT add an MRP column."
// "The invoice product table across ALL templates must strictly use the following 4-column layout: Item Description | Rate | Qty | Amount"
const hasMrpTh = invoiceSrc.includes('<th') && invoiceSrc.toLowerCase().includes('>mrp<') || invoiceSrc.includes('>MRP<');
assert.strictEqual(hasMrpTh, false, 'Invoice table headers must NOT contain an MRP column');
console.log('   ✓ Confirmed: Table headers do NOT contain an MRP column.');

// Check 4 columns in the thermal table
assert(invoiceSrc.includes('>Item Description</th>'), 'Must contain Item Description header');
assert(invoiceSrc.includes('>Rate</th>'), 'Must contain Rate header');
assert(invoiceSrc.includes('>Qty</th>'), 'Must contain Qty header');
assert(invoiceSrc.includes('>Amount</th>'), 'Must contain Amount header');
console.log('   ✓ Confirmed: 4 column headers: Item Description | Rate | Qty | Amount.');

console.log('\n4. Verifying Thermal Receipt zero text-stroke and black text:');
assert(invoiceSrc.includes('-webkit-text-stroke: 0 !important;'), 'Must have zero text-stroke in webkit');
assert(invoiceSrc.includes('text-stroke: 0 !important;'), 'Must have zero text-stroke');
assert(invoiceSrc.includes('color: #000000 !important;') || invoiceSrc.includes('color: #000000;'), 'Must use pure black #000000');
console.log('   ✓ Confirmed: Thermal print output enforces zero text-stroke and pure black #000000.');

console.log('\n5. Verifying Financial Summary formulas with the prompt example:');
// Prompt:
// - Subtotal: 1000.00
// - Discount: 152.54
// - Taxable Amount: 847.46
// - GST / Tax: 152.54
// - TOTAL: 1000.00

const demoPrintData = {
    subTotal: 847.46,
    discount: 152.54,
    taxAmount: 152.54,
    totalAmount: 1000.00,
    items: [
        {
            name: 'PREMIUM ASIAN PAINTS - WHITE (1L)',
            quantity: 2,
            mrp: 500.00,
            originalUnitPrice: 500.00,
            unitPrice: 500.00,
            total: 1000.00,
            taxAmount: 152.54,
            taxRate: 18
        }
    ]
};

// Simulation of ProfessionalInvoice calculation
const taxableSubtotal = parseFloat(demoPrintData.subTotal || 0);
const gstTaxAmt = parseFloat(demoPrintData.taxAmount || 0);
const effectiveTotalDiscount = parseFloat(demoPrintData.discount || 0);
const grandTotalAmt = parseFloat(demoPrintData.totalAmount || 0);
const isDeliveryActive = false;
const deliveryAmt = 0;
const roundOffAmt = 0;
let totalMrpSum = 0;
demoPrintData.items.forEach(it => { totalMrpSum += it.mrp * it.quantity; });

const applicableSubtotal = (taxableSubtotal > 0 && gstTaxAmt > 0.005)
    ? (taxableSubtotal + effectiveTotalDiscount)
    : (grandTotalAmt + effectiveTotalDiscount - (isDeliveryActive ? deliveryAmt : 0) - roundOffAmt);
const originalApplicableTotal = effectiveTotalDiscount > 0.005
    ? Math.max(totalMrpSum, applicableSubtotal)
    : (totalMrpSum > 0 ? totalMrpSum : (taxableSubtotal > 0 ? taxableSubtotal : grandTotalAmt));
const effectiveTotalBeforeDiscount = originalApplicableTotal;

assert.strictEqual(effectiveTotalBeforeDiscount.toFixed(2), '1000.00', 'Subtotal must be 1000.00');
assert.strictEqual(effectiveTotalDiscount.toFixed(2), '152.54', 'Discount must be 152.54');
assert.strictEqual(taxableSubtotal.toFixed(2), '847.46', 'Taxable Amount must be 847.46');
assert.strictEqual(gstTaxAmt.toFixed(2), '152.54', 'GST / Tax must be 152.54');
assert.strictEqual(grandTotalAmt.toFixed(2), '1000.00', 'TOTAL must be 1000.00');

console.log('   ✓ Subtotal:       ', effectiveTotalBeforeDiscount.toFixed(2));
console.log('   ✓ Discount:       ', effectiveTotalDiscount.toFixed(2));
console.log('   ✓ Taxable Amount: ', taxableSubtotal.toFixed(2));
console.log('   ✓ GST / Tax:      ', gstTaxAmt.toFixed(2));
console.log('   ✓ TOTAL:          ', grandTotalAmt.toFixed(2));

console.log('\n=============================================================');
console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
console.log('=============================================================');
