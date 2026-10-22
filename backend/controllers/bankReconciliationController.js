const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

exports.getUnreconciledTransactions = asyncHandler(async (req, res) => {
    const { ledgerId } = req.query;
    if (!ledgerId) {
        res.status(400);
        throw new Error("Ledger ID is required");
    }

    const entries = await prisma.journalEntry.findMany({
        where: {
            OR: [
                { debitLedgerId: parseInt(ledgerId) },
                { creditLedgerId: parseInt(ledgerId) }
            ],
            isReconciled: false,
            voucher: {
                status: 'POSTED'
            }
        },
        include: {
            voucher: {
                include: { branch: true }
            },
            debitLedger: { select: { name: true } },
            creditLedger: { select: { name: true } }
        },
        orderBy: {
            voucher: {
                date: 'asc'
            }
        }
    });
    res.json(entries);
});

exports.reconcileTransactions = asyncHandler(async (req, res) => {
    const { reconciliations } = req.body; // Array of { entryId, bankDate, remarks }

    if (!Array.isArray(reconciliations)) {
        res.status(400);
        throw new Error("Invalid reconciliation data");
    }

    const updates = reconciliations.map(recon =>
        prisma.journalEntry.update({
            where: { id: parseInt(recon.entryId) },
            data: {
                isReconciled: true,
                bankDate: new Date(recon.bankDate),
                reconRemarks: recon.remarks
            }
        })
    );

    await prisma.$transaction(updates);
    res.json({ message: "Transactions reconciled successfully" });
});

exports.getReconciliationSummary = asyncHandler(async (req, res) => {
    const { ledgerId } = req.query;
    if (!ledgerId) {
        res.status(400);
        throw new Error("Ledger ID is required");
    }

    const ledger = await prisma.ledger.findUnique({
        where: { id: parseInt(ledgerId) }
    });

    if (!ledger) {
        res.status(404);
        throw new Error("Ledger not found");
    }

    // System Balance (Sum of all posted entries)
    const entries = await prisma.journalEntry.findMany({
        where: {
            OR: [
                { debitLedgerId: parseInt(ledgerId) },
                { creditLedgerId: parseInt(ledgerId) }
            ],
            voucher: {
                status: 'POSTED'
            }
        }
    });

    let systemBalance = parseFloat(ledger.openingBalance) * (ledger.balanceType === 'DEBIT' ? 1 : -1);
    let bankBalance = parseFloat(ledger.openingBalance) * (ledger.balanceType === 'DEBIT' ? 1 : -1);

    entries.forEach(entry => {
        const amount = parseFloat(entry.amount);
        const isDebit = entry.debitLedgerId === parseInt(ledgerId);

        const effect = isDebit ? amount : -amount;
        systemBalance += effect;

        if (entry.isReconciled) {
            bankBalance += effect;
        }
    });

    res.json({
        ledgerName: ledger.name,
        systemBalance,
        bankBalance,
        unreconciledCount: entries.filter(e => !e.isReconciled).length,
        unreconciledAmount: systemBalance - bankBalance
    });
});
