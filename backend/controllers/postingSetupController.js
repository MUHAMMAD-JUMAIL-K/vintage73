const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

// Get all postings
exports.getAllPostings = asyncHandler(async (req, res) => {
    const postings = await prisma.transactionPosting.findMany({
        include: {
            ledger: {
                select: {
                    id: true,
                    name: true,
                    group: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        },
        orderBy: { label: 'asc' }
    });
    res.json(postings);
});

// Get schema metadata (Models and Fields)
exports.getSchemaMetadata = asyncHandler(async (req, res) => {
    // Comprehensive list of transaction-relevant models and their fields based on schema
    const metadata = [
        {
            id: 'Sale',
            name: 'Sales (Invoice)',
            fields: [
                'subTotal', 'taxAmount', 'totalAmount', 'discount',
                'deliveryCharge', 'roundOffAmount', 'paidAmount', 'balanceAmount',
                'incentiveAmount', 'isReturn', 'isB2B'
            ]
        },
        {
            id: 'Purchase',
            name: 'Purchase (Bill)',
            fields: [
                'totalAmount', 'totalSubTotal', 'totalTax',
                'paidAmount', 'balanceAmount', 'discount'
            ]
        },
        {
            id: 'StockTransfer',
            name: 'Stock Transfer',
            fields: ['totalCost', 'taxAmount', 'quantity']
        },
        {
            id: 'StockReceipt',
            name: 'Stock Receipt',
            fields: ['totalCost', 'taxAmount', 'quantity']
        },
        {
            id: 'Expense',
            name: 'Expense',
            fields: ['amount', 'taxAmount']
        },
        {
            id: 'Payment',
            name: 'Payment/Receipt',
            fields: ['amount']
        },
        {
            id: 'Payroll',
            name: 'Payroll (Salary)',
            fields: ['basicSalary', 'allowances', 'deductions', 'netSalary']
        },
        {
            id: 'SalaryAdvance',
            name: 'Salary Advance',
            fields: ['amount']
        }
    ];
    res.json(metadata);
});

// Create or update a posting
exports.upsertPosting = asyncHandler(async (req, res) => {
    const { transactionType, role, ledgerId } = req.body;

    if (!transactionType || !role || !ledgerId) {
        res.status(400);
        throw new Error('Missing required fields');
    }

    const posting = await prisma.transactionPosting.upsert({
        where: {
            transactionType_role: {
                transactionType,
                role
            }
        },
        update: {
            ledgerId: parseInt(ledgerId),
            label: req.body.label || null,
            targetTable: req.body.targetTable || null,
            side: req.body.side || 'CREDIT',
            postingMethod: req.body.postingMethod || 'SUM',
            amountField: req.body.amountField || null,
            customFormula: req.body.customFormula || null,
            condition: req.body.condition || null
        },
        create: {
            transactionType,
            role,
            label: req.body.label || null,
            ledgerId: parseInt(ledgerId),
            side: req.body.side || 'CREDIT',
            targetTable: req.body.targetTable || null,
            postingMethod: req.body.postingMethod || 'SUM',
            amountField: req.body.amountField || null,
            customFormula: req.body.customFormula || null,
            condition: req.body.condition || null,
            isSystem: req.body.isSystem || false
        }
    });

    res.json(posting);
});

// Bulk upsert postings
exports.bulkUpsertPostings = asyncHandler(async (req, res) => {
    const { postings } = req.body;

    if (!Array.isArray(postings)) {
        res.status(400);
        throw new Error('Postings must be an array');
    }

    const results = await prisma.$transaction(
        postings.map(p => prisma.transactionPosting.upsert({
            where: {
                transactionType_role: {
                    transactionType: p.transactionType,
                    role: p.role
                }
            },
            update: {
                ledgerId: parseInt(p.ledgerId),
                side: p.side || 'CREDIT',
                targetTable: p.targetTable || null,
                postingMethod: p.postingMethod || 'SUM',
                amountField: p.amountField || null,
                customFormula: p.customFormula || null,
                condition: p.condition || null
            },
            create: {
                transactionType: p.transactionType,
                role: p.role,
                ledgerId: parseInt(p.ledgerId),
                side: p.side || 'CREDIT',
                targetTable: p.targetTable || null,
                postingMethod: p.postingMethod || 'SUM',
                amountField: p.amountField || null,
                customFormula: p.customFormula || null,
                condition: p.condition || null
            }
        }))
    );

    res.json(results);
});

// Delete a posting
exports.deletePosting = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const posting = await prisma.transactionPosting.findUnique({
        where: { id: parseInt(id) }
    });

    if (!posting) {
        res.status(404);
        throw new Error('Posting not found');
    }

    if (posting.isSystem) {
        res.status(403);
        throw new Error('System posting rules cannot be deleted');
    }

    await prisma.transactionPosting.delete({
        where: { id: parseInt(id) }
    });
    res.json({ message: 'Posting deleted successfully' });
});
