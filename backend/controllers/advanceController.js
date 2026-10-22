const asyncHandler = require('../middleware/asyncHandler');
const prisma = require('../config/prisma');
const { ensureLedger, postVoucher, getLedgerByRole } = require('../utils/accountingHelper');

// Get all advances (used for the Product Advance page)
exports.getAdvances = asyncHandler(async (req, res) => {
    const advances = await prisma.advance.findMany({
        include: {
            customer: {
                select: { id: true, name: true, phone: true }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });
    res.json(advances);
});

// Get advance history for a specific customer
exports.getAdvanceHistory = asyncHandler(async (req, res) => {
    const { customerId } = req.params;
    const history = await prisma.advanceHistory.findMany({
        where: { customerId: Number(customerId) },
        orderBy: { createdAt: 'desc' }
    });
    res.json(history);
});

// Get total available advance balance for a specific customer (Used in POS)
exports.getCustomerAdvanceBalance = asyncHandler(async (req, res) => {
    const { customerId } = req.params;
    
    const advance = await prisma.advance.findUnique({
        where: { customerId: Number(customerId) }
    });
    
    res.json({ availableAdvance: Number(advance?.balance || 0) });
});

// Add a new advance
exports.addAdvance = asyncHandler(async (req, res) => {
    const { customerId, totalAmount, notes, paymentMethod = 'Cash', date } = req.body;
    
    if (!customerId || !totalAmount) {
        return res.status(400).json({ message: 'Customer and Amount are required.' });
    }
    
    const amount = Number(totalAmount);
    if (amount <= 0) {
        return res.status(400).json({ message: 'Amount must be greater than zero.' });
    }

    const cid = Number(customerId);
    const advanceDate = date ? new Date(date) : new Date();

    const result = await prisma.$transaction(async (tx) => {
        // 1. Upsert the single Advance row
        const advance = await tx.advance.upsert({
            where: { customerId: cid },
            update: {
                totalAmount: { increment: amount },
                balance: { increment: amount },
                notes: notes || null
            },
            create: {
                customerId: cid,
                totalAmount: amount,
                usedAmount: 0,
                balance: amount,
                notes: notes || null
            },
            include: { customer: true }
        });

        // 2. Create History record
        await tx.advanceHistory.create({
            data: {
                customerId: cid,
                advanceId: advance.id,
                action: 'ADD',
                amount: amount,
                balanceAfter: Number(advance.balance),
                date: advanceDate,
                reference: notes || 'Advance Added'
            }
        });

        // 3. Accounting Integration (Receipt Voucher)
        try {
            const customer = advance.customer;
            const payMethod = paymentMethod || 'Cash';
            let role = 'CASH';
            let defaultLedger = 'Cash';
            let defaultGroup = 'Cash-in-Hand';

            if (payMethod.toLowerCase().includes('online') || payMethod.toLowerCase().includes('bank') || payMethod.toLowerCase().includes('card')) {
                role = 'BANK';
                defaultLedger = 'Bank Account';
                defaultGroup = 'Bank Accounts';
            }

            const assetLedger = await getLedgerByRole(tx, 'PAYMENT', role, defaultLedger, defaultGroup);
            const customerLedger = await ensureLedger(tx, customer.name, 'Sundry Debtors');

            await postVoucher(tx, {
                type: 'RECEIPT',
                date: advanceDate,
                amount: amount,
                narration: `Customer Advance Received: ${customer.name}${notes ? ' - ' + notes : ''}`,
                reference: 'ADVANCE',
                createdBy: req.user?.id || 1,
                branchId: customer?.branchId || req.user?.branchId || null
            }, [
                { ledgerId: assetLedger.id, type: 'DEBIT', amount: amount },
                { ledgerId: customerLedger.id, type: 'CREDIT', amount: amount }
            ]);
        } catch (accErr) {
            console.error('Advance Accounting Integration Failed:', accErr);
            // We don't necessarily want to roll back the whole thing if accounting setup is just missing, 
            // but for consistency with sales/purchases, let's keep it in sync.
            throw new Error('Accounting Integration Failed: ' + accErr.message);
        }

        return advance;
    });
    
    res.status(201).json(result);
});
