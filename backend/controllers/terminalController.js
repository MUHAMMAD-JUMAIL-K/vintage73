const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const crypto = require('crypto');

// Get all terminals
exports.getTerminals = asyncHandler(async (req, res) => {
    const where = {};

    // Branch Isolation
    if (req.user.branchId) {
        where.branchId = req.user.branchId;
    }

    const terminals = await prisma.terminal.findMany({
        where,
        include: {
            branch: true,
            users: {
                select: { id: true, username: true, name: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(terminals);
});

// Create/Register a terminal
exports.registerTerminal = asyncHandler(async (req, res) => {
    const { terminalCode, name, branchId, isManual = false } = req.body;

    // If branchId is provided, check for duplicate name in that branch
    if (branchId && name) {
        const existing = await prisma.terminal.findFirst({
            where: {
                name,
                branchId: parseInt(branchId)
            }
        });
        if (existing) {
            res.status(400);
            throw new Error(`Terminal with name "${name}" already exists in this branch.`);
        }
    }

    const terminal = await prisma.terminal.create({
        data: {
            terminalCode: terminalCode || crypto.randomUUID(),
            name: name || 'New Terminal',
            branchId: branchId ? parseInt(branchId) : null,
            isActive: isManual
        }
    });
    res.status(201).json(terminal);
});

// Bulk create terminals
exports.bulkCreateTerminals = asyncHandler(async (req, res) => {
    const { branchId, names } = req.body;
    if (!branchId || !names || !Array.isArray(names)) {
        res.status(400);
        throw new Error('branchId and an array of names are required.');
    }

    const results = {
        created: [],
        skipped: [],
        errors: []
    };

    for (const name of names) {
        try {
            const existing = await prisma.terminal.findFirst({
                where: {
                    name,
                    branchId: parseInt(branchId)
                }
            });

            if (existing) {
                results.skipped.push({ name, reason: 'Duplicate name in branch' });
                continue;
            }

            const terminal = await prisma.terminal.create({
                data: {
                    terminalCode: crypto.randomUUID(),
                    name,
                    branchId: parseInt(branchId),
                    isActive: true
                }
            });
            results.created.push(terminal);
        } catch (err) {
            results.errors.push({ name, error: err.message });
        }
    }

    res.json(results);
});

// Update terminal (Approve/Deactivate/Rename/Link User)
exports.updateTerminal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, branchId, isActive, userIds } = req.body;
    const terminal = await prisma.terminal.update({
        where: { id: parseInt(id) },
        data: {
            name,
            branchId: branchId ? parseInt(branchId) : null,
            isActive,
            users: userIds && Array.isArray(userIds) ? { set: userIds.map(id => ({ id: parseInt(id) })) } : undefined
        }
    });
    res.json(terminal);
});

// Delete terminal
exports.deleteTerminal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.terminal.delete({
        where: { id: parseInt(id) }
    });
    res.json({ message: 'Terminal deleted' });
});

// Get terminal lock setting
exports.getSettings = asyncHandler(async (req, res) => {
    const setting = await prisma.systemSetting.findUnique({
        where: { key: 'TERMINAL_LOCK' }
    });
    res.json({ terminalLock: setting ? setting.value === 'true' : false });
});

// Update terminal lock setting
exports.updateSettings = asyncHandler(async (req, res) => {
    const { terminalLock } = req.body;
    const setting = await prisma.systemSetting.upsert({
        where: { key: 'TERMINAL_LOCK' },
        update: { value: terminalLock.toString() },
        create: {
            key: 'TERMINAL_LOCK',
            value: terminalLock.toString(),
            description: 'Enable/Disable device-based access control',
            category: 'SECURITY'
        }
    });
    res.json({ terminalLock: setting.value === 'true' });
});

// Check if a terminal is authorized
exports.checkTerminal = asyncHandler(async (req, res) => {
    const { terminalCode } = req.query;
    if (!terminalCode) {
        res.status(400);
        throw new Error('Terminal code required');
    }

    const terminal = await prisma.terminal.findUnique({
        where: { terminalCode }
    });

    if (!terminal) {
        return res.json({ authorized: false, registered: false });
    }

    // Update last used
    await prisma.terminal.update({
        where: { id: terminal.id },
        data: { lastUsed: new Date(), ipAddress: req.ip }
    });

    res.json({
        authorized: terminal.isActive,
        registered: true,
        terminal: {
            id: terminal.id,
            name: terminal.name,
            branchId: terminal.branchId
        }
    });
});
