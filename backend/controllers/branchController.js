const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

// Get All Branches
exports.getBranches = asyncHandler(async (req, res) => {
  let where = {};

  // If user is restricted to a branch, only show that branch
  // But allow bypassing for modules that need to see all branches (e.g., Stock Transfer Destination)
  if (req.user.branchId && req.query.all !== 'true') {
    where.id = req.user.branchId;
  }

  const branches = await prisma.branch.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
  res.json(branches);
});

// Get Single Branch
exports.getBranchById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const branchId = parseInt(id);

  // Security: Check if user has access to this branch
  if (req.user.branchId && req.user.branchId !== branchId) {
    res.status(403);
    throw new Error('Access denied: Cannot access other branch data');
  }

  if (isNaN(branchId)) {
    res.status(400);
    throw new Error('Invalid Branch ID');
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId }
  });
  if (!branch) {
    res.status(404);
    throw new Error('Branch not found');
  }
  res.json(branch);
});

const { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol, CURRENCY_SYMBOLS } = require('../utils/currencyHelper');

// Create Branch
exports.createBranch = asyncHandler(async (req, res) => {
  // Only global admin can create branches
  if (req.user.branchId) {
    res.status(403);
    throw new Error('Access denied: Only global admins can create branches');
  }

  const { name, address, phone, email, stockIncluded, invoiceTemplate, invoiceSettings, currencyCode, currencySymbol } = req.body;
  const code = (currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
  const symbol = (currencySymbol && currencySymbol.trim()) ? currencySymbol : getCurrencySymbol(code);

  const dataToSave = {
    name,
    address,
    phone,
    email,
    stockIncluded: stockIncluded !== undefined ? stockIncluded : true,
    currencyCode: code,
    currencySymbol: symbol
  };
  if (invoiceTemplate !== undefined) {
    dataToSave.invoiceTemplate = invoiceTemplate || null;
  }
  if (invoiceSettings !== undefined) {
    dataToSave.invoiceSettings = invoiceSettings;
  } else if (invoiceTemplate) {
    dataToSave.invoiceSettings = { template: invoiceTemplate };
  }

  const branch = await prisma.branch.create({
    data: dataToSave
  });
  res.status(201).json(branch);
});

// Update Branch
exports.updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const branchId = parseInt(id);

  // Security: Check if user has access to this branch
  if (req.user.branchId && req.user.branchId !== branchId) {
    res.status(403);
    throw new Error('Access denied: Cannot update other branches');
  }

  if (isNaN(branchId)) {
    res.status(400);
    throw new Error('Invalid Branch ID');
  }

  const { name, address, phone, email, isActive, stockIncluded, invoiceTemplate, invoiceSettings, currencyCode, currencySymbol } = req.body;
  const dataToUpdate = { name, address, phone, email, isActive, stockIncluded };

  if (currencyCode !== undefined) {
    const code = (currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
    dataToUpdate.currencyCode = code;
    dataToUpdate.currencySymbol = (currencySymbol && currencySymbol.trim()) ? currencySymbol : getCurrencySymbol(code);
  } else if (currencySymbol !== undefined) {
    dataToUpdate.currencySymbol = currencySymbol;
  }

  if (invoiceTemplate !== undefined) {
    dataToUpdate.invoiceTemplate = invoiceTemplate || null;
  }
  if (invoiceSettings !== undefined) {
    dataToUpdate.invoiceSettings = invoiceSettings;
  } else if (invoiceTemplate !== undefined) {
    const existing = await prisma.branch.findUnique({ where: { id: branchId }, select: { invoiceSettings: true } });
    const currentSettings = (existing?.invoiceSettings && typeof existing.invoiceSettings === 'object') ? existing.invoiceSettings : {};
    dataToUpdate.invoiceSettings = { ...currentSettings, template: invoiceTemplate || null };
  }

  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: dataToUpdate
  });
  res.json(branch);
});

// Delete Branch
exports.deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const branchId = parseInt(id);

  // Security: Only global admin can delete branches
  if (req.user.branchId) {
    res.status(403);
    throw new Error('Access denied: Only global admins can delete branches');
  }

  if (isNaN(branchId)) {
    res.status(400);
    throw new Error('Invalid Branch ID');
  }

  // Check if branch has associated data
  const usersCount = await prisma.user.count({ where: { branchId: branchId } });
  if (usersCount > 0) {
    res.status(400);
    throw new Error('Cannot delete branch with assigned users');
  }

  await prisma.branch.delete({ where: { id: branchId } });
  res.json({ message: 'Branch deleted' });
});

// Update Invoice Settings for a Branch
exports.updateInvoiceSettings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const branchId = parseInt(id);
  if (isNaN(branchId)) {
    res.status(400);
    throw new Error('Invalid Branch ID');
  }

  const { invoiceSettings } = req.body;
  const dataToUpdate = { invoiceSettings };
  if (invoiceSettings && invoiceSettings.template !== undefined) {
    dataToUpdate.invoiceTemplate = invoiceSettings.template || null;
  }
  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: dataToUpdate
  });
  res.json(branch);
});
