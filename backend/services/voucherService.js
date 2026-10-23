const crypto = require('crypto');
const prisma = require('../config/prisma');

/**
 * Generate a unique, secure random voucher code.
 * Format: PREFIX-XXXX-XXXX (e.g. VOUCH-7K9M-2P4Q or RWD-8F2K-9A1B)
 */
async function generateVoucherCode(prefix = 'VOUCH', client = prisma) {
  let uniqueCode = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 100) {
    attempts++;
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous chars (0, 1, I, O)
    let randomPart = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      randomPart += chars[bytes[i] % chars.length];
    }
    const formatted = `${prefix.toUpperCase()}-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}`;
    
    const existing = await client.customerVoucher.findUnique({
      where: { code: formatted }
    });
    if (!existing) {
      uniqueCode = formatted;
      isUnique = true;
    }
  }

  if (!uniqueCode) {
    uniqueCode = `${prefix.toUpperCase()}-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return uniqueCode;
}

/**
 * Get the Purchase Reward Rule from SystemSetting
 */
async function getPurchaseRewardRule(client = prisma) {
  try {
    const setting = await client.systemSetting.findUnique({
      where: { key: 'VOUCHER_PURCHASE_REWARD_RULE' }
    });
    if (setting && setting.value) {
      return JSON.parse(setting.value);
    }
  } catch (e) {
    console.error('Error fetching purchase reward rule:', e);
  }
  // Default rule configuration
  return {
    enabled: false,
    minQualifyingSpend: 100,
    rewardType: 'FIXED',
    rewardValue: 50,
    minFutureSpend: 200,
    validityDays: 30,
    branchSpecific: false,
    customerSpecific: true
  };
}

/**
 * Update Purchase Reward Rule
 */
async function updatePurchaseRewardRule(ruleData, client = prisma) {
  const jsonValue = JSON.stringify(ruleData);
  return client.systemSetting.upsert({
    where: { key: 'VOUCHER_PURCHASE_REWARD_RULE' },
    update: {
      value: jsonValue,
      description: 'Rule configuration for automatic purchase reward voucher issuance',
      category: 'VOUCHER'
    },
    create: {
      key: 'VOUCHER_PURCHASE_REWARD_RULE',
      value: jsonValue,
      description: 'Rule configuration for automatic purchase reward voucher issuance',
      category: 'VOUCHER'
    }
  });
}

/**
 * Validate a Voucher Code for a POS Sale.
 * Deterministically calculates discount and line-item allocation.
 */
async function validateVoucherForSale(tx, { code, customerId, branchId, items = [] }) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    return { valid: false, message: 'Please provide a valid voucher code.' };
  }

  const normalizedCode = code.trim().toUpperCase();
  const voucher = await tx.customerVoucher.findUnique({
    where: { code: normalizedCode },
    include: { customer: { select: { id: true, name: true, phone: true } } }
  });

  if (!voucher) {
    return { valid: false, message: `Voucher "${normalizedCode}" not found.` };
  }

  // 1. Status Check
  if (voucher.status === 'REDEEMED') {
    return { valid: false, message: 'This voucher has already been redeemed.' };
  }
  if (voucher.status === 'EXPIRED') {
    return { valid: false, message: 'This voucher has expired.' };
  }
  if (voucher.status === 'CANCELLED') {
    return { valid: false, message: 'This voucher has been cancelled.' };
  }
  if (voucher.status !== 'ACTIVE') {
    return { valid: false, message: `Voucher is currently ${voucher.status.toLowerCase()}.` };
  }

  // 2. Expiry Check
  if (voucher.expiryDate) {
    const now = new Date();
    const expiry = new Date(voucher.expiryDate);
    // Set to end of day if it was a date without time
    if (expiry < now) {
      // Opportunistically update status
      await tx.customerVoucher.update({
        where: { id: voucher.id },
        data: { status: 'EXPIRED' }
      });
      return { valid: false, message: 'This voucher has expired.' };
    }
  }

  // 3. Usage Limit Check
  if (voucher.usageLimit > 0 && voucher.usageCount >= voucher.usageLimit) {
    return { valid: false, message: 'This voucher has reached its maximum usage limit.' };
  }

  // 4. Customer Restriction Check
  if (voucher.customerId) {
    const targetCustId = customerId ? parseInt(customerId) : null;
    if (!targetCustId || targetCustId !== voucher.customerId) {
      return { 
        valid: false, 
        message: 'This voucher is exclusive to a specific customer account.' 
      };
    }
  }

  // 5. Branch Restriction Check
  if (voucher.branchId) {
    const targetBranchId = branchId ? parseInt(branchId) : null;
    if (!targetBranchId || targetBranchId !== voucher.branchId) {
      return { valid: false, message: 'This voucher is not valid at this store branch.' };
    }
  }

  // 6. Calculate Eligible Items Value
  // Eligible item line value = quantity * (unitPrice - discountAmount)
  let eligibleSubtotal = 0;
  const lineDetails = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qty = parseFloat(item.quantity || 1);
    const unitPrice = parseFloat(item.unitPrice || item.price || 0);
    const itemDisc = parseFloat(item.discountAmount || 0);
    const netUnitPrice = Math.max(0, unitPrice - itemDisc);
    const lineNetTotal = Number((qty * netUnitPrice).toFixed(2));

    if (lineNetTotal > 0) {
      eligibleSubtotal += lineNetTotal;
      lineDetails.push({
        index: idx,
        productId: parseInt(item.productId || item.id),
        lineNetTotal,
        quantity: qty,
        unitPrice,
        discountAmount: itemDisc
      });
    }
  }

  eligibleSubtotal = Number(eligibleSubtotal.toFixed(2));

  if (eligibleSubtotal <= 0) {
    return { valid: false, message: 'No eligible items found in cart for voucher discount.' };
  }

  // 7. Minimum Purchase Requirement
  const minSpend = parseFloat(voucher.minimumPurchaseAmount || 0);
  if (eligibleSubtotal < minSpend) {
    const sym = voucher.branch?.currencySymbol || (voucher.branch?.currencyCode === 'INR' ? '₹' : 'AED ');
    return {
      valid: false,
      message: `Minimum purchase of ${sym}${minSpend.toFixed(2)} required for this voucher (Current eligible: ${sym}${eligibleSubtotal.toFixed(2)}).`
    };
  }

  // 8. Calculate Discount Value
  const voucherVal = parseFloat(voucher.value);
  let calculatedDiscount = 0;

  if (voucher.type === 'PERCENTAGE') {
    const rawDisc = (eligibleSubtotal * voucherVal) / 100;
    const maxLimit = voucher.maximumDiscount ? parseFloat(voucher.maximumDiscount) : Infinity;
    calculatedDiscount = Math.min(rawDisc, maxLimit, eligibleSubtotal);
  } else {
    // FIXED or PURCHASE_REWARD
    calculatedDiscount = Math.min(voucherVal, eligibleSubtotal);
  }

  const finalVoucherDiscount = Number(calculatedDiscount.toFixed(2));

  if (finalVoucherDiscount <= 0) {
    return { valid: false, message: 'Voucher discount calculates to 0.' };
  }

  // 9. Deterministic Proportional Line-Item Allocation
  // Guarantees: sum(lineAllocations) === finalVoucherDiscount to 2 decimals
  const lineAllocations = {};
  let totalAllocated = 0;
  let maxLineIdx = lineDetails[0]?.index || 0;
  let maxLineVal = -1;

  for (const line of lineDetails) {
    const proportion = line.lineNetTotal / eligibleSubtotal;
    const alloc = Number((proportion * finalVoucherDiscount).toFixed(2));
    lineAllocations[line.index] = alloc;
    totalAllocated = Number((totalAllocated + alloc).toFixed(2));

    if (line.lineNetTotal > maxLineVal) {
      maxLineVal = line.lineNetTotal;
      maxLineIdx = line.index;
    }
  }

  // Handle rounding discrepancy by adjusting the largest line item
  const roundingDelta = Number((finalVoucherDiscount - totalAllocated).toFixed(2));
  if (roundingDelta !== 0 && lineAllocations[maxLineIdx] !== undefined) {
    lineAllocations[maxLineIdx] = Number((lineAllocations[maxLineIdx] + roundingDelta).toFixed(2));
  }

  return {
    valid: true,
    voucher: {
      id: voucher.id,
      code: voucher.code,
      name: voucher.name,
      type: voucher.type,
      value: Number(voucher.value),
      maximumDiscount: voucher.maximumDiscount ? Number(voucher.maximumDiscount) : null,
      minimumPurchaseAmount: Number(voucher.minimumPurchaseAmount),
      expiryDate: voucher.expiryDate
    },
    eligibleSubtotal,
    finalVoucherDiscount,
    lineAllocations
  };
}

/**
 * Redeem Voucher atomically inside a Sale transaction.
 */
async function redeemVoucherInSale(tx, { voucherId, saleId, customerId, branchId, appliedDiscount }) {
  const current = await tx.customerVoucher.findUnique({
    where: { id: voucherId }
  });

  if (!current) {
    throw new Error('Voucher record not found for redemption.');
  }

  if (current.status !== 'ACTIVE') {
    throw new Error(`Voucher is no longer active (Status: ${current.status}).`);
  }

  if (current.usageLimit > 0 && current.usageCount >= current.usageLimit) {
    throw new Error('Voucher usage limit has already been reached.');
  }

  const newUsageCount = current.usageCount + 1;
  const isFullyRedeemed = current.usageLimit > 0 && newUsageCount >= current.usageLimit;

  // 1. Update Voucher
  await tx.customerVoucher.update({
    where: { id: current.id },
    data: {
      usageCount: newUsageCount,
      status: isFullyRedeemed ? 'REDEEMED' : 'ACTIVE',
      redeemedSaleId: saleId,
      redeemedAt: new Date()
    }
  });

  // 2. Create Audit Redemption Record
  const redemption = await tx.customerVoucherRedemption.create({
    data: {
      voucherId: current.id,
      saleId,
      customerId: customerId ? parseInt(customerId) : null,
      branchId: parseInt(branchId),
      discountAmount: appliedDiscount,
      redeemedAt: new Date()
    }
  });

  return redemption;
}

/**
 * Check reward criteria and issue a new Purchase Reward Voucher if eligible.
 */
async function checkAndIssuePurchaseReward(tx, sale) {
  if (sale.isReturn || sale.status === 'cancelled') {
    return null;
  }

  // Prevent duplicate issuance on retry
  const existing = await tx.customerVoucher.findFirst({
    where: { issuedSaleId: sale.id }
  });
  if (existing) {
    return existing;
  }

  const rule = await getPurchaseRewardRule(tx);
  if (!rule || !rule.enabled) {
    return null;
  }

  const saleTotal = parseFloat(sale.totalAmount || 0);
  const minQualifying = parseFloat(rule.minQualifyingSpend || 100);

  if (saleTotal < minQualifying) {
    return null;
  }

  const code = await generateVoucherCode('RWD', tx);
  const validityDays = parseInt(rule.validityDays) || 30;
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + validityDays);

  const rewardVoucher = await tx.customerVoucher.create({
    data: {
      code,
      name: `Purchase Reward for #${sale.invoiceNumber}`,
      type: rule.rewardType || 'FIXED',
      value: parseFloat(rule.rewardValue || 50),
      minimumPurchaseAmount: parseFloat(rule.minFutureSpend || 200),
      maximumDiscount: rule.maximumDiscount ? parseFloat(rule.maximumDiscount) : null,
      issueDate: new Date(),
      expiryDate,
      status: 'ACTIVE',
      customerId: rule.customerSpecific ? sale.customerId : null,
      branchId: rule.branchSpecific ? sale.branchId : null,
      issuedSaleId: sale.id,
      usageLimit: 1,
      usageCount: 0,
      description: `Automatically awarded for purchase #${sale.invoiceNumber} exceeding ${sale.currencyCode || sale.branch?.currencyCode || 'AED'} ${minQualifying.toFixed(2)}`,
      createdBy: sale.salesmanId || null
    }
  });

  return rewardVoucher;
}

module.exports = {
  generateVoucherCode,
  getPurchaseRewardRule,
  updatePurchaseRewardRule,
  validateVoucherForSale,
  redeemVoucherInSale,
  checkAndIssuePurchaseReward
};
