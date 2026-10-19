export const INVOICE_TEMPLATES = [
    { 
        id: 'modern', 
        name: 'Boutique / Modern Invoice', 
        shortName: 'Modern', 
        type: 'Design 1',
        description: 'Contemporary boutique layout with colored accent header and structured cards'
    },
    { 
        id: 'minimal', 
        name: 'Simple / Minimal Invoice', 
        shortName: 'Minimal', 
        type: 'Design 2',
        description: 'Clean, simple and uncluttered invoice format'
    },
    { 
        id: 'classic', 
        name: 'Classic Invoice', 
        shortName: 'Classic', 
        type: 'Design 3',
        description: 'Traditional formal bordered invoice design'
    },
    { 
        id: 'bold', 
        name: 'Bold Invoice', 
        shortName: 'Bold', 
        type: 'Design 4',
        description: 'High-contrast header layout with prominent branding'
    },
    { 
        id: 'boutique_a5', 
        name: 'New Boutique Invoice', 
        shortName: 'New Boutique', 
        type: 'Design 5',
        description: 'Clean, simple A5 portrait boutique invoice layout with item grid and totals'
    }
];

export const getTemplateById = (id) => {
    if (!id) return null;
    const normalized = String(id).trim().toLowerCase();
    if (['boutique_a5', 'new_boutique', 'new boutique'].includes(normalized)) {
        return INVOICE_TEMPLATES.find(t => t.id === 'boutique_a5');
    }
    if (normalized === 'boutique') return INVOICE_TEMPLATES.find(t => t.id === 'modern');
    if (normalized === 'simple') return INVOICE_TEMPLATES.find(t => t.id === 'minimal');
    return INVOICE_TEMPLATES.find(t => t.id.toLowerCase() === normalized) || null;
};

export const getTemplateName = (id) => {
    const tpl = getTemplateById(id);
    return tpl ? tpl.name : (id || 'Not Assigned');
};

export const normalizeTemplateId = (id) => {
    if (!id) return 'modern';
    const normalized = String(id).trim().toLowerCase();
    if (['boutique_a5', 'new_boutique', 'new boutique'].includes(normalized)) return 'boutique_a5';
    if (normalized === 'boutique') return 'modern';
    if (normalized === 'simple') return 'minimal';
    if (['modern', 'minimal', 'classic', 'bold', 'boutique_a5'].includes(normalized)) return normalized;
    return 'modern';
};

export const getDemoInvoiceData = (templateId = 'modern', branch = null, companyProfile = null) => {
    const activeTemplate = normalizeTemplateId(templateId);
    return {
        invoiceNumber: 'INV-0001',
        saleDate: '2026-09-16T10:00:00.000Z',
        createdAt: '2026-09-16T10:00:00.000Z',
        customerName: 'WALK-IN CUSTOMER',
        customer: {
            name: 'WALK-IN CUSTOMER',
            phone: '+971 50 123 4567',
            address: 'Al Fahidi, Bur Dubai',
            city: 'Dubai'
        },
        items: [
            {
                product: { name: 'Designer Silk Abaya', price: 500.00, hsnCode: '6204' },
                name: 'Designer Silk Abaya',
                size: 'M',
                quantity: 1,
                mrp: 500.00,
                originalUnitPrice: 500.00,
                unitPrice: 450.00,
                total: 450.00,
                discountAmount: 50.00,
                taxRate: 5,
                taxAmount: 20.00
            },
            {
                product: { name: 'Embroidered Kaftan Dress', price: 200.00, hsnCode: '6204' },
                name: 'Embroidered Kaftan Dress',
                size: 'L',
                quantity: 2,
                mrp: 200.00,
                originalUnitPrice: 200.00,
                unitPrice: 200.00,
                total: 400.00,
                discountAmount: 0.00,
                taxRate: 5,
                taxAmount: 20.00
            }
        ],
        subTotal: 850.00,
        discount: 50.00,
        taxAmount: 40.00,
        roundOffAmount: 0.00,
        totalAmount: 840.00,
        paidAmount: 840.00,
        balanceAmount: 0.00,
        paymentMethod: 'Credit Card / POS',
        currencyCode: companyProfile?.currencyCode || 'AED',
        currencySymbol: companyProfile?.currencySymbol || 'AED ',
        terms: 'Items can be exchanged within 7 days with original receipt and intact tags. No refunds.',
        settings: {
            template: activeTemplate,
            headerTitle: 'TAX INVOICE',
            footerText: 'Thank you for your business! Visit again.',
            accentColor: '#009262',
            pageSize: 'A5',
            showLogo: true,
            showCompanyName: true,
            showAddress: true,
            showInvoiceMeta: true,
            showCustomer: true,
            showColHsn: false,
            showColQty: true,
            showColPrice: true,
            showColTax: true,
            showColTotal: true,
            showTaxSummary: true,
            showBankDetails: false
        }
    };
};
