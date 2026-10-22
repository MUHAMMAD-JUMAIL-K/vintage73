const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ensureLedger, postVoucher, getLedgerByRole } = require('../utils/accountingHelper');

// Get all customers with outstanding balance
exports.getDebtors = asyncHandler(async (req, res) => {
    const debtors = await prisma.customer.findMany({
        where: {
            sales: {
                some: {
                    balanceAmount: { gt: 0 },
                    status: { not: 'cancelled' }
                }
            }
        },
        include: {
            sales: {
                where: {
                    balanceAmount: { gt: 0 },
                    status: { not: 'cancelled' }
                },
                select: {
                    id: true,
                    invoiceNumber: true,
                    saleDate: true,
                    totalAmount: true,
                    paidAmount: true,
                    balanceAmount: true
                }
            }
        }
    });

    // Calculate total debt for each customer
    const formattedDebtors = debtors.map(customer => {
        const totalDebt = customer.sales.reduce((sum, sale) => sum + Number(sale.balanceAmount), 0);
        return {
            ...customer,
            totalDebt,
            pendingInvoices: customer.sales.length
        };
    }).filter(c => c.totalDebt > 0);

    res.json(formattedDebtors);
});

// Settle Credit (Pay outstanding amount)
exports.settleCredit = asyncHandler(async (req, res) => {
    const { customerId, amount, paymentMethod, reference, notes } = req.body;
    
    // Validate inputs
    if (!customerId || !amount || amount <= 0) {
        res.status(400);
        throw new Error("Invalid customer or amount");
    }

    const result = await prisma.$transaction(async (tx) => {
        const payAmount = parseFloat(amount);
        
        // 1. Get Customer Pending Sales (FIFO)
        const pendingSales = await tx.sale.findMany({
            where: {
                customerId: parseInt(customerId),
                balanceAmount: { gt: 0 },
                status: { not: 'cancelled' }
            },
            orderBy: { saleDate: 'asc' } // Oldest first
        });

        if (pendingSales.length === 0) {
            throw new Error("No outstanding debt found for this customer");
        }

        let remainingPayment = payAmount;
        const updatedSales = [];

        // 2. Allocate Payment to Sales
        for (const sale of pendingSales) {
            if (remainingPayment <= 0) break;

            const pending = parseFloat(sale.balanceAmount);
            const deduction = Math.min(remainingPayment, pending);
            
            // Update Sale
            const updatedSale = await tx.sale.update({
                where: { id: sale.id },
                data: {
                    balanceAmount: { decrement: deduction },
                    paidAmount: { increment: deduction },
                    status: (pending - deduction) <= 0.01 ? 'completed' : 'partial'
                }
            });
            updatedSales.push(updatedSale);
            
            remainingPayment -= deduction;
        }

        // 3. Create Payment Record (Accounts Effect)
        const payment = await tx.payment.create({
            data: {
                type: 'receipt', // 'receipt' -> Money In
                amount: payAmount,
                method: paymentMethod || 'Cash',
                reference: reference || 'Credit Settlement',
                description: notes || `Credit Settlement for ${updatedSales.length} invoices`,
                customerId: parseInt(customerId),
                branchId: pendingSales[0].branchId,
                paymentDate: new Date()
            }
        });

        // 4. Create Accounting Voucher (RECEIPT)
        try {
            const customer = await tx.customer.findUnique({ where: { id: parseInt(customerId) } });
            const customerLedger = await ensureLedger(tx, customer ? customer.name : 'Walk-in Customer', 'Sundry Debtors');

            let role = 'CASH';
            let defaultLedger = 'Cash';
            let defaultGroup = 'Cash-in-Hand';
            const method = (paymentMethod || 'Cash').toLowerCase();
            if (method.includes('online') || method.includes('bank') || method.includes('card') || method.includes('upi')) {
                role = 'BANK';
                defaultLedger = 'Bank Account';
                defaultGroup = 'Bank Accounts';
            }
            const assetLedger = await getLedgerByRole(tx, 'PAYMENT', role, defaultLedger, defaultGroup);

            await postVoucher(tx, {
                type: 'RECEIPT',
                date: new Date(),
                amount: payAmount,
                narration: notes || `Credit Settlement for ${updatedSales.length} invoice(s)`,
                reference: reference || `SETTLE-${payment.id}`,
                createdBy: req.user ? req.user.id : 1,
                branchId: payment.branchId
            }, [
                { ledgerId: assetLedger.id, type: 'DEBIT', amount: payAmount },
                { ledgerId: customerLedger.id, type: 'CREDIT', amount: payAmount }
            ]);
        } catch (accErr) {
            console.error('Credit Settlement Accounting Error:', accErr);
        }

        return { payment, settledInvoices: updatedSales.length };
    });

    res.json({ message: "Settlement successful", ...result });
});

// Get specific customer credit deatils
exports.getCustomerCredits = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
        where: { id: parseInt(id) },
        include: {
            sales: {
                where: {
                    balanceAmount: { gt: 0 },
                    status: { not: 'cancelled' }
                },
                orderBy: { saleDate: 'asc' }
            }
        }
    });
    
    if (!customer) {
        res.status(404);
        throw new Error("Customer not found");
    }

    const totalDebt = customer.sales.reduce((sum, sale) => sum + Number(sale.balanceAmount), 0);
    res.json({ ...customer, totalDebt });
});
