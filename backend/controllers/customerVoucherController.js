const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const {
  generateVoucherCode,
  validateVoucherForSale,
  getPurchaseRewardRule,
  updatePurchaseRewardRule
} = require('../services/voucherService');

// 1. Dashboard Statistics
exports.getVoucherDashboardStats = asyncHandler(async (req, res) => {
  const { branchId: queryBranchId } = req.query;
  const user = req.user;

  let branchId = queryBranchId;
  const isGlobalAdmin = user?.role === 'admin' && !user?.branchId;
  if (!isGlobalAdmin && user?.branchId) {
    branchId = user.branchId;
  }
  const parsedBranchId = branchId && !isNaN(parseInt(branchId)) ? parseInt(branchId) : undefined;
  const where = parsedBranchId ? { branchId: parsedBranchId } : {};

  const [
    totalVouchers,
    activeVouchers,
    redeemedVouchers,
    expiredVouchers,
    cancelledVouchers,
    sumIssued,
    sumRedeemed
  ] = await Promise.all([
    prisma.customerVoucher.count({ where }),
    prisma.customerVoucher.count({ where: { ...where, status: 'ACTIVE' } }),
    prisma.customerVoucher.count({ where: { ...where, status: 'REDEEMED' } }),
    prisma.customerVoucher.count({ where: { ...where, status: 'EXPIRED' } }),
    prisma.customerVoucher.count({ where: { ...where, status: 'CANCELLED' } }),
    prisma.customerVoucher.aggregate({ where, _sum: { value: true } }),
    prisma.customerVoucherRedemption.aggregate({
      where: parsedBranchId ? { branchId: parsedBranchId } : {},
      _sum: { discountAmount: true }
    })
  ]);

  res.json({
    totalVouchers,
    activeVouchers,
    redeemedVouchers,
    expiredVouchers,
    cancelledVouchers,
    totalValueIssued: Number(sumIssued._sum.value || 0),
    totalDiscountRedeemed: Number(sumRedeemed._sum.discountAmount || 0)
  });
});

// 2. List Vouchers with Search & Filter
exports.getVouchers = asyncHandler(async (req, res) => {
  const { search, status, type, branchId: queryBranchId, customerId } = req.query;
  const user = req.user;

  let branchId = queryBranchId;
  const isGlobalAdmin = user?.role === 'admin' && !user?.branchId;
  if (!isGlobalAdmin && user?.branchId) {
    branchId = user.branchId;
  }

  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (type && type !== 'ALL') where.type = type;
  if (branchId && !isNaN(parseInt(branchId))) {
    // Show branch-specific vouchers OR vouchers valid across all branches (branchId === null)
    where.OR = [
      { branchId: parseInt(branchId) },
      { branchId: null }
    ];
  }
  if (customerId && !isNaN(parseInt(customerId))) where.customerId = parseInt(customerId);

  if (search && search.trim()) {
    const q = search.trim();
    where.AND = [
      {
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { phone: { contains: q, mode: 'insensitive' } } }
        ]
      }
    ];
  }

  const vouchers = await prisma.customerVoucher.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      branch: { select: { id: true, name: true } },
      _count: { select: { redemptions: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(vouchers);
});

// 3. Single Voucher Details with Redemptions
exports.getVoucherById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const voucher = await prisma.customerVoucher.findUnique({
    where: { id: parseInt(id) },
    include: {
      customer: true,
      branch: true,
      issuedSale: {
        select: { id: true, invoiceNumber: true, totalAmount: true, createdAt: true }
      },
      redeemedSale: {
        select: { id: true, invoiceNumber: true, totalAmount: true, createdAt: true }
      },
      redemptions: {
        include: {
          sale: { select: { id: true, invoiceNumber: true, totalAmount: true } },
          voucher: true
        },
        orderBy: { redeemedAt: 'desc' }
      }
    }
  });

  if (!voucher) {
    res.status(404);
    throw new Error('Voucher not found');
  }

  res.json(voucher);
});

// 4. Create Voucher
exports.createVoucher = asyncHandler(async (req, res) => {
  const {
    code: customCode,
    name,
    type = 'FIXED',
    value,
    maximumDiscount,
    minimumPurchaseAmount = 0,
    issueDate,
    expiryDate,
    customerId,
    branchId,
    usageLimit = 1,
    description
  } = req.body;

  if (!name || !value) {
    res.status(400);
    throw new Error('Voucher Name and Value are required.');
  }

  const parsedVal = parseFloat(value);
  if (isNaN(parsedVal) || parsedVal <= 0) {
    res.status(400);
    throw new Error('Voucher Value must be a positive number.');
  }

  let code = customCode ? customCode.trim().toUpperCase() : null;
  if (!code) {
    code = await generateVoucherCode(type === 'PERCENTAGE' ? 'PCT' : 'VOUCH');
  } else {
    const existing = await prisma.customerVoucher.findUnique({ where: { code } });
    if (existing) {
      res.status(400);
      throw new Error(`Voucher code "${code}" is already in use.`);
    }
  }

  const voucher = await prisma.customerVoucher.create({
    data: {
      code,
      name: name.trim(),
      type,
      value: parsedVal,
      maximumDiscount: maximumDiscount ? parseFloat(maximumDiscount) : null,
      minimumPurchaseAmount: parseFloat(minimumPurchaseAmount || 0),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      status: 'ACTIVE',
      customerId: customerId ? parseInt(customerId) : null,
      branchId: branchId ? parseInt(branchId) : null,
      usageLimit: parseInt(usageLimit || 1),
      usageCount: 0,
      description: description ? description.trim() : null,
      createdBy: req.user?.id || 1
    },
    include: {
      customer: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } }
    }
  });

  res.status(201).json(voucher);
});

// 5. Update Voucher
exports.updateVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    value,
    maximumDiscount,
    minimumPurchaseAmount,
    expiryDate,
    status,
    description
  } = req.body;

  const voucher = await prisma.customerVoucher.findUnique({ where: { id: parseInt(id) } });
  if (!voucher) {
    res.status(404);
    throw new Error('Voucher not found');
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (value !== undefined) updateData.value = parseFloat(value);
  if (maximumDiscount !== undefined) updateData.maximumDiscount = maximumDiscount ? parseFloat(maximumDiscount) : null;
  if (minimumPurchaseAmount !== undefined) updateData.minimumPurchaseAmount = parseFloat(minimumPurchaseAmount);
  if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
  if (status !== undefined) updateData.status = status;
  if (description !== undefined) updateData.description = description ? description.trim() : null;

  const updated = await prisma.customerVoucher.update({
    where: { id: parseInt(id) },
    data: updateData,
    include: {
      customer: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } }
    }
  });

  res.json(updated);
});

// 6. Toggle Voucher Status (Active / Inactive)
exports.toggleVoucherStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const voucher = await prisma.customerVoucher.findUnique({ where: { id: parseInt(id) } });
  if (!voucher) {
    res.status(404);
    throw new Error('Voucher not found');
  }

  if (voucher.status === 'REDEEMED' || voucher.status === 'CANCELLED') {
    res.status(400);
    throw new Error(`Cannot toggle a voucher that is ${voucher.status}.`);
  }

  const newStatus = voucher.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const updated = await prisma.customerVoucher.update({
    where: { id: parseInt(id) },
    data: { status: newStatus }
  });

  res.json({ message: `Voucher is now ${newStatus.toLowerCase()}.`, voucher: updated });
});

// 7. Cancel Unused Voucher
exports.cancelVoucher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const voucher = await prisma.customerVoucher.findUnique({ where: { id: parseInt(id) } });
  if (!voucher) {
    res.status(404);
    throw new Error('Voucher not found');
  }

  if (voucher.status === 'REDEEMED') {
    res.status(400);
    throw new Error('Cannot cancel a voucher that has already been redeemed.');
  }

  const updated = await prisma.customerVoucher.update({
    where: { id: parseInt(id) },
    data: { status: 'CANCELLED' }
  });

  res.json({ message: 'Voucher cancelled successfully.', voucher: updated });
});

// 8. POS Validate Voucher
exports.validateVoucher = asyncHandler(async (req, res) => {
  const { code, customerId, branchId, items } = req.body;
  const effectiveBranchId = branchId || req.user?.branchId;

  const result = await validateVoucherForSale(prisma, {
    code,
    customerId,
    branchId: effectiveBranchId,
    items
  });

  if (!result.valid) {
    return res.status(400).json({ valid: false, message: result.message });
  }

  res.json(result);
});

// 9. Get Redemption History
exports.getRedemptions = asyncHandler(async (req, res) => {
  const { branchId: queryBranchId } = req.query;
  const user = req.user;

  let branchId = queryBranchId;
  const isGlobalAdmin = user?.role === 'admin' && !user?.branchId;
  if (!isGlobalAdmin && user?.branchId) {
    branchId = user.branchId;
  }
  const where = branchId ? { branchId: parseInt(branchId) } : {};

  const redemptions = await prisma.customerVoucherRedemption.findMany({
    where,
    include: {
      voucher: true,
      sale: { select: { id: true, invoiceNumber: true, totalAmount: true, customer: { select: { name: true } } } }
    },
    orderBy: { redeemedAt: 'desc' },
    take: 100
  });

  res.json(redemptions);
});

// 10. Get Purchase Reward Settings
exports.getRewardSettings = asyncHandler(async (req, res) => {
  const settings = await getPurchaseRewardRule(prisma);
  res.json(settings);
});

// 11. Update Purchase Reward Settings
exports.updateRewardSettings = asyncHandler(async (req, res) => {
  const ruleData = req.body;
  await updatePurchaseRewardRule(ruleData, prisma);
  res.json({ message: 'Purchase reward settings updated successfully.', settings: ruleData });
});
