const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ensureLedger } = require('../utils/accountingHelper');
const bcrypt = require('bcryptjs');

// Get all customers
exports.getCustomers = asyncHandler(async (req, res) => {
  const { branchId: queryBranchId } = req.query;
  const user = req.user;

  // GLOBAL CUSTOMERS: Return all customers regardless of branch
  const where = {};
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { sales: true }
      },
      branch: {
        select: { name: true }
      }
    }
  });
  res.json(customers);
});

// Create customer
exports.createCustomer = asyncHandler(async (req, res) => {
  const { name, phone, email, address, branchId: queryBranchId, city, state, pincode, gstin, partyType, username, password, accessPermissions } = req.body;
  const user = req.user;

  // --- BRANCH FALLBACK ---
  let branchId = queryBranchId;
  if (!branchId && user?.branchId) {
    branchId = user.branchId;
  }

  // --- SANITIZE & VALIDATE PHONE ---
  const sanitizedPhone = phone?.trim() === "" ? null : phone?.trim();

  if (sanitizedPhone) {
    const existingCustomer = await prisma.customer.findUnique({ where: { phone: sanitizedPhone } });
    if (existingCustomer) {
      res.status(400);
      throw new Error(`Customer with phone number ${sanitizedPhone} already exists.`);
    }
  }

  let hashedPassword = null;
  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  if (username) {
    const existingUser = await prisma.customer.findUnique({ where: { username } });
    if (existingUser) {
      res.status(400);
      throw new Error('Username is already taken by another customer.');
    }
    // Also check main User table just to avoid confusion, though they log in differently
    const adminUser = await prisma.user.findUnique({ where: { username } });
    if (adminUser) {
      res.status(400);
      throw new Error('Username is already taken by a system user.');
    }
  }

  const customer = await prisma.customer.create({
    data: {
      name,
      phone: sanitizedPhone,
      email,
      address,
      city,
      state,
      pincode,
      gstin,
      partyType: partyType || 'B2C',
      branchId: branchId ? parseInt(branchId) : null,
      username: username || null,
      password: hashedPassword,
      accessPermissions: accessPermissions || null,
      role: 'customer'
    }
  });

  // --- ACCOUNTING INTEGRATION ---
  try {
    await ensureLedger(prisma, name, 'Sundry Debtors');
  } catch (accErr) {
    console.error("Failed to create customer ledger:", accErr);
  }

  res.status(201).json(customer);
});

// Update customer
exports.updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, address, branchId, city, state, pincode, gstin, partyType, username, password, accessPermissions } = req.body;
  
  const sanitizedPhone = phone?.trim() === "" ? null : phone?.trim();

  const data = {
    name,
    phone: sanitizedPhone,
    email,
    address,
    city,
    state,
    pincode,
    gstin,
    partyType: partyType || 'B2C'
  };

  if (branchId !== undefined) {
    data.branchId = branchId ? parseInt(branchId) : null;
  }

  if (username !== undefined) {
    if (username) {
      const existingUser = await prisma.customer.findUnique({ where: { username } });
      if (existingUser && existingUser.id !== parseInt(id)) {
        res.status(400);
        throw new Error('Username is already taken by another customer.');
      }
      const adminUser = await prisma.user.findUnique({ where: { username } });
      if (adminUser) {
        res.status(400);
        throw new Error('Username is already taken by a system user.');
      }
    }
    data.username = username || null;
  }

  if (password) {
    data.password = await bcrypt.hash(password, 10);
  }

  if (accessPermissions !== undefined) {
    data.accessPermissions = accessPermissions;
  }

  const customer = await prisma.customer.update({
    where: { id: parseInt(id) },
    data
  });
  res.json(customer);
});

// Delete customer
exports.deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.customer.delete({ where: { id: parseInt(id) } });
  res.json({ message: 'Customer deleted successfully' });
});

// Get Customer Balance
exports.getCustomerBalance = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { branchId } = req.query;
  const where = { customerId: parseInt(id), status: { not: 'cancelled' } };
  if (branchId) where.branchId = parseInt(branchId);

  const sales = await prisma.sale.findMany({
    where
  });

  // Net Balance = (Sum of Sales Balance) - (Sum of Unapplied Return Values)
  const totalBalance = sales.reduce((sum, s) => {
    if (s.isReturn) {
      // Unapplied return credit = totalAmount - returnCreditUsed - refundAmount
      // If return was used in an exchange or refunded, it does not reduce customer balance again.
      const unappliedCredit = Math.max(0, parseFloat(s.totalAmount || 0) - parseFloat(s.returnCreditUsed || 0) - parseFloat(s.refundAmount || 0));
      return sum - unappliedCredit;
    } else {
      // Outstanding balance from regular sales
      return sum + parseFloat(s.balanceAmount || 0);
    }
  }, 0);

  res.json({ balance: Number(totalBalance.toFixed(2)) });
});
