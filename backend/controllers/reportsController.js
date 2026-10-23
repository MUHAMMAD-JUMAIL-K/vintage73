const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

const getEffectiveBranchId = (req) => {
  const { branchId: queryBranchId } = req.query;
  const user = req.user;

  // New Hierarchical Logic: Global Admin has no branchId
  const isGlobalAdmin = user?.role === 'admin' && !user?.branchId;

  if (!isGlobalAdmin) {
    if (!user?.branchId) return -1; // Force failure if no branch assigned
    return user.branchId;
  }
  return queryBranchId && queryBranchId !== 'all' ? parseInt(queryBranchId) : null;
};

// Helper functions to parse business dates in Asia/Kolkata timezone (UTC+5:30)
const parseBusinessDateStart = (dateStr) => {
  if (!dateStr) return null;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${clean}T00:00:00.000+05:30`);
};

const parseBusinessDateEnd = (dateStr) => {
  if (!dateStr) return null;
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${clean}T23:59:59.999+05:30`);
};

exports.getSalesReports = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  const where = {};
  if (effectiveBranchId) where.branchId = effectiveBranchId;

  if (startDate && endDate) {
    where.createdAt = {
      gte: parseBusinessDateStart(startDate),
      lte: parseBusinessDateEnd(endDate)
    };
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: true,
      items: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  res.json(sales);
});

exports.getDailyPaymentReport = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const searchDate = date ? new Date(date) : new Date();
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  // Set range for the whole day
  const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));

  const where = {
    paymentDate: {
      gte: startOfDay,
      lte: endOfDay
    }
  };
  if (effectiveBranchId) where.branchId = effectiveBranchId;

  const payments = await prisma.payment.findMany({
    where
  });

  // Group by method
  const summary = payments.reduce((acc, p) => {
    const method = p.method || 'Other';
    if (!acc[method]) {
      acc[method] = { method, receipts: 0, payments: 0, net: 0 };
    }

    const amt = parseFloat(p.amount);
    if (p.type === 'receipt') {
      acc[method].receipts += amt;
      acc[method].net += amt;
    } else {
      acc[method].payments += amt;
      acc[method].net -= amt;
    }
    return acc;
  }, {});

  res.json(Object.values(summary));
});

exports.getStockMovementRegister = asyncHandler(async (req, res) => {
  const { productId, startDate, endDate } = req.query;
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  if (!productId) {
    res.status(400);
    throw new Error("Product ID is required for Stock Movement Register");
  }

  const pId = parseInt(productId);
  const start = startDate ? new Date(startDate) : new Date(0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // 1. Calculate Opening Balance (Transactions BEFORE start date)
  const getAggregates = async (beforeDate) => {
    // Purchases
    const purchases = await prisma.purchaseItem.findMany({
      where: {
        productId: pId,
        purchase: {
          purchaseDate: { lt: beforeDate },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
        }
      },
      select: { quantity: true }
    });
    const purchaseIn = purchases.reduce((sum, item) => sum + item.quantity, 0);

    // Sales
    const sales = await prisma.saleItem.findMany({
      where: {
        productId: pId,
        sale: {
          saleDate: { lt: beforeDate },
          status: { not: 'cancelled' },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
        }
      },
      include: { sale: { select: { isReturn: true } } }
    });
    const saleOut = sales.reduce((sum, item) => sum + (item.sale.isReturn ? 0 : item.quantity), 0);
    const saleReturnIn = sales.reduce((sum, item) => sum + (item.sale.isReturn ? item.quantity : 0), 0);

    // Transfers In
    const transfersIn = await prisma.stockTransferItem.findMany({
      where: {
        productId: pId,
        transfer: {
          transferDate: { lt: beforeDate },
          status: 'RECEIVED',
          ...(effectiveBranchId ? { toBranchId: effectiveBranchId } : {})
        }
      },
      select: { quantity: true }
    });
    const transferIn = transfersIn.reduce((sum, item) => sum + item.quantity, 0);

    // Transfers Out
    const transfersOut = await prisma.stockTransferItem.findMany({
      where: {
        productId: pId,
        transfer: {
          transferDate: { lt: beforeDate },
          status: { not: 'CANCELLED' },
          ...(effectiveBranchId ? { fromBranchId: effectiveBranchId } : {})
        }
      },
      select: { quantity: true }
    });
    const transferOut = transfersOut.reduce((sum, item) => sum + item.quantity, 0);

    // Delivery Challans
    const challans = await prisma.deliveryChallanItem.findMany({
      where: {
        productId: pId,
        challan: {
          challanDate: { lt: beforeDate },
          status: { not: 'cancelled' },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
        }
      },
      select: { quantity: true }
    });
    const challanOut = challans.reduce((sum, item) => sum + item.quantity, 0);

    return (purchaseIn + transferIn + saleReturnIn) - (saleOut + transferOut + challanOut);
  };

  const openingStock = await getAggregates(start);

  // 2. Fetch Movements (Transactions WITHIN date range)
  const movements = [];

  // Purchases
  const pItems = await prisma.purchaseItem.findMany({
    where: {
      productId: pId,
      purchase: {
        purchaseDate: { gte: start, lte: end },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
      }
    },
    include: { purchase: { include: { supplier: true } } }
  });
  pItems.forEach(item => {
    movements.push({
      date: item.purchase.purchaseDate,
      reference: item.purchase.invoiceNumber || `Pur #${item.purchase.id}`,
      type: 'Purchase',
      party: item.purchase.supplier?.name || 'Cash Supplier',
      inQty: item.quantity,
      outQty: 0
    });
  });

  // Sales
  const sItems = await prisma.saleItem.findMany({
    where: {
      productId: pId,
      sale: {
        saleDate: { gte: start, lte: end },
        status: { not: 'cancelled' },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
      }
    },
    include: { sale: { include: { customer: true } } }
  });
  sItems.forEach(item => {
    const isReturn = item.sale.isReturn;
    movements.push({
      date: item.sale.saleDate,
      reference: item.sale.invoiceNumber,
      type: isReturn ? 'Sales Return' : 'Sale',
      party: item.sale.customer?.name || 'Walk-in Customer',
      inQty: isReturn ? item.quantity : 0,
      outQty: isReturn ? 0 : item.quantity
    });
  });

  // Transfers In
  const transIn = await prisma.stockTransferItem.findMany({
    where: {
      productId: pId,
      transfer: {
        transferDate: { gte: start, lte: end },
        status: 'RECEIVED',
        ...(effectiveBranchId ? { toBranchId: effectiveBranchId } : {})
      }
    },
    include: { transfer: { include: { fromBranch: true } } }
  });
  transIn.forEach(item => {
    movements.push({
      date: item.transfer.transferDate,
      reference: `Trf #${item.transfer.id}`,
      type: 'Transfer In',
      party: item.transfer.fromBranch?.name || 'Other Branch',
      inQty: item.quantity,
      outQty: 0
    });
  });

  // Transfers Out
  const transOut = await prisma.stockTransferItem.findMany({
    where: {
      productId: pId,
      transfer: {
        transferDate: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
        ...(effectiveBranchId ? { fromBranchId: effectiveBranchId } : {})
      }
    },
    include: { transfer: { include: { toBranch: true } } }
  });
  transOut.forEach(item => {
    movements.push({
      date: item.transfer.transferDate,
      reference: `Trf #${item.transfer.id}`,
      type: 'Transfer Out',
      party: item.transfer.toBranch?.name || 'Other Branch',
      inQty: 0,
      outQty: item.quantity
    });
  });

  // Delivery Challans
  const dItems = await prisma.deliveryChallanItem.findMany({
    where: {
      productId: pId,
      challan: {
        challanDate: { gte: start, lte: end },
        status: { not: 'cancelled' },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
      }
    },
    include: { challan: true }
  });
  dItems.forEach(item => {
    movements.push({
      date: item.challan.challanDate,
      reference: item.challan.challanNumber,
      type: 'Challan Out',
      party: 'Various',
      inQty: 0,
      outQty: item.quantity
    });
  });
  // 3. Combine and Sort
  movements.sort((a, b) => new Date(a.date) - new Date(b.date));

  // 4. Calculate Running Balance
  let runningBalance = openingStock;
  const dataWithBalance = movements.map(m => {
    runningBalance = runningBalance + m.inQty - m.outQty;
    return { ...m, balance: runningBalance };
  });

  res.json({
    openingBalance: openingStock,
    movements: dataWithBalance,
    closingBalance: runningBalance
  });
});

exports.getCurrentStockBalance = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  const where = {};
  if (effectiveBranchId) where.branchId = effectiveBranchId;
  if (categoryId && categoryId !== 'all') {
    where.product = { categoryId: parseInt(categoryId) };
  }

  const stocks = await prisma.productStock.findMany({
    where,
    include: {
      product: {
        include: { category: true }
      }
    },
    orderBy: {
      product: { name: 'asc' }
    }
  });

  const result = stocks.map(s => ({
    productId: s.productId,
    productName: s.product.name,
    category: s.product.category?.name || 'Uncategorized',
    barcode: s.product.barcode,
    currentPrice: s.product.price,
    quantity: s.quantity,
    minStock: s.product.minStockLevel
  }));

  res.json(result);
});

exports.getStockSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate, categoryId } = req.query;
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  const catId = categoryId && categoryId !== 'all' ? parseInt(categoryId) : null;
  const start = startDate ? new Date(startDate) : new Date(0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // 1. Get all products (optionally filtered by category)
  const products = await prisma.product.findMany({
    where: catId ? { categoryId: catId } : {},
    select: { id: true, name: true, barcode: true, category: { select: { name: true } } }
  });

  const report = [];

  for (const prod of products) {
    const pId = prod.id;

    // Helper to aggregate based on date range
    const getPeriodAggregation = async (sDate, eDate) => {
      const dateFilter = eDate ? { gte: sDate, lte: eDate } : { lt: sDate };

      const [purchases, sales, transIn, transOut, challans] = await Promise.all([
        prisma.purchaseItem.aggregate({
          where: { productId: pId, purchase: { purchaseDate: dateFilter, ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}) } },
          _sum: { quantity: true }
        }),
        prisma.saleItem.findMany({
          where: { productId: pId, sale: { saleDate: dateFilter, status: { not: 'cancelled' }, ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}) } },
          include: { sale: { select: { isReturn: true } } }
        }),
        prisma.stockTransferItem.aggregate({
          where: { productId: pId, transfer: { transferDate: dateFilter, status: 'RECEIVED', ...(effectiveBranchId ? { toBranchId: effectiveBranchId } : {}) } },
          _sum: { quantity: true }
        }),
        prisma.stockTransferItem.aggregate({
          where: { productId: pId, transfer: { transferDate: dateFilter, status: { not: 'CANCELLED' }, ...(effectiveBranchId ? { fromBranchId: effectiveBranchId } : {}) } },
          _sum: { quantity: true }
        }),
        prisma.deliveryChallanItem.aggregate({
          where: { productId: pId, challan: { challanDate: dateFilter, status: { not: 'cancelled' }, ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}) } },
          _sum: { quantity: true }
        })
      ]);

      const pIn = purchases._sum.quantity || 0;
      const sOut = sales.reduce((sum, i) => sum + (i.sale.isReturn ? 0 : i.quantity), 0);
      const sReturnIn = sales.reduce((sum, i) => sum + (i.sale.isReturn ? i.quantity : 0), 0);
      const tIn = transIn._sum.quantity || 0;
      const tOut = transOut._sum.quantity || 0;
      const cOut = challans._sum.quantity || 0;

      return {
        in: pIn + tIn + sReturnIn,
        out: sOut + tOut + cOut
      };
    };

    // Calculate Opening
    const opening = await getPeriodAggregation(start, null);
    const openingStockValue = opening.in - opening.out;

    // Calculate Period Movement
    const period = await getPeriodAggregation(start, end);

    report.push({
      productId: pId,
      productName: prod.name,
      barcode: prod.barcode,
      category: prod.category?.name || 'Uncategorized',
      openingStock: openingStockValue,
      periodIn: period.in,
      periodOut: period.out,
      closingStock: openingStockValue + period.in - period.out
    });
  }

  res.json(report);
});

// Helper to accurately resolve purchase unit cost for a sold product
function resolveProductCostPrice(product, item, sale) {
  if (!product) return 0;
  const purchaseItems = product.purchaseItems || [];
  if (purchaseItems.length > 0) {
    const saleTime = sale ? new Date(sale.saleDate || sale.createdAt).getTime() : Date.now();
    const itemSize = item?.size && item.size !== '—' ? String(item.size).trim().toLowerCase() : null;

    const validPis = purchaseItems.filter(pi => {
      const cost = parseFloat(pi.unitCost);
      return !isNaN(cost) && cost > 0;
    });

    if (validPis.length > 0) {
      validPis.sort((a, b) => {
        const aTime = new Date(a.purchase?.purchaseDate || a.purchase?.createdAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.purchase?.purchaseDate || b.purchase?.createdAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      // 1. Branch + Size match on or before sale
      if (sale?.branchId && itemSize) {
        const bSizeMatch = validPis.find(pi => 
          pi.purchase?.branchId === sale.branchId &&
          pi.size && String(pi.size).trim().toLowerCase() === itemSize &&
          new Date(pi.purchase?.purchaseDate || pi.purchase?.createdAt || 0).getTime() <= saleTime + 86400000
        );
        if (bSizeMatch) return parseFloat(bSizeMatch.unitCost);
      }

      // 2. Branch match on or before sale
      if (sale?.branchId) {
        const bMatch = validPis.find(pi => 
          pi.purchase?.branchId === sale.branchId &&
          new Date(pi.purchase?.purchaseDate || pi.purchase?.createdAt || 0).getTime() <= saleTime + 86400000
        );
        if (bMatch) return parseFloat(bMatch.unitCost);
      }

      // 3. Size match on or before sale across any branch
      if (itemSize) {
        const sizeMatch = validPis.find(pi => 
          pi.size && String(pi.size).trim().toLowerCase() === itemSize &&
          new Date(pi.purchase?.purchaseDate || pi.purchase?.createdAt || 0).getTime() <= saleTime + 86400000
        );
        if (sizeMatch) return parseFloat(sizeMatch.unitCost);
      }

      // 4. Any purchase on or before sale
      const priorMatch = validPis.find(pi => 
        new Date(pi.purchase?.purchaseDate || pi.purchase?.createdAt || 0).getTime() <= saleTime + 86400000
      );
      if (priorMatch) return parseFloat(priorMatch.unitCost);

      // 5. Fallback to latest valid purchase item
      return parseFloat(validPis[0].unitCost);
    }
  }

  // Fallback to product.costPrice if set
  if (product.costPrice !== null && product.costPrice !== undefined) {
    const cp = parseFloat(product.costPrice);
    if (!isNaN(cp) && cp > 0) return cp;
  }

  return 0;
}

// Comprehensive POS Sales Analytics Report
// Supplies Dashboard KPIs, Trend Chart data, Payment Breakdown, Top Products,
// Single-row-per-invoice Summary Report, and Line-item Detailed Report.
exports.getSalesAnalyticsReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, businessDate, paymentMethod, salesmanId, customerId, status, search } = req.query;
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  const targetSingleDate = businessDate || (startDate && endDate && startDate === endDate ? startDate : null);

  const where = {};
  if (effectiveBranchId) where.branchId = effectiveBranchId;

  if (targetSingleDate) {
    const startUTC = parseBusinessDateStart(targetSingleDate);
    const endUTC = parseBusinessDateEnd(targetSingleDate);
    where.OR = [
      { saleDate: { gte: startUTC, lte: endUTC } },
      { createdAt: { gte: startUTC, lte: endUTC } }
    ];
  } else if (startDate || endDate) {
    const startUTC = parseBusinessDateStart(startDate);
    const endUTC = parseBusinessDateEnd(endDate);
    const dateFilter = {};
    if (startUTC) dateFilter.gte = startUTC;
    if (endUTC) dateFilter.lte = endUTC;
    where.OR = [
      { saleDate: dateFilter },
      { createdAt: dateFilter }
    ];
  }

  if (salesmanId && salesmanId !== 'all') {
    if (salesmanId === 'unassigned' || salesmanId === 'none' || salesmanId === '0') {
      where.salesmanId = null;
    } else {
      where.salesmanId = parseInt(salesmanId);
    }
  }
  if (customerId && customerId !== 'all') where.customerId = parseInt(customerId);

  if (status && status !== 'all') {
    if (status === 'cancelled') where.status = 'cancelled';
    else if (status === 'return') where.isReturn = true;
    else if (status === 'active') {
      where.status = { not: 'cancelled' };
      where.isReturn = false;
    }
  }

  // Fetch sales with complete relations (ordered by createdAt descending)
  const rawSales = await prisma.sale.findMany({
    where,
    include: {
      customer: true,
      branch: true,
      salesman: { select: { id: true, name: true, username: true } },
      payments: true,
      items: {
        include: {
          product: {
            include: {
              productType: true,
              category: true,
              purchaseItems: {
                include: {
                  purchase: {
                    select: { id: true, invoiceNumber: true, purchaseDate: true, branchId: true, createdAt: true }
                  }
                },
                orderBy: { id: 'desc' }
              }
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // In-memory filter for paymentMethod and search if supplied
  let sales = rawSales;

  if (paymentMethod && paymentMethod !== 'all') {
    const targetMethod = paymentMethod.trim().toLowerCase();
    sales = sales.filter(s => {
      if (targetMethod === 'split') {
        return (s.paymentMethod && s.paymentMethod.toLowerCase() === 'split') || (s.payments && s.payments.length > 1);
      }
      if (s.payments && s.payments.length > 0) {
        return s.payments.some(p => p.method && p.method.toLowerCase().includes(targetMethod)) ||
               (s.paymentMethod && s.paymentMethod.toLowerCase().includes(targetMethod));
      }
      return s.paymentMethod && s.paymentMethod.toLowerCase().includes(targetMethod);
    });
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    sales = sales.filter(s => {
      const invMatch = s.invoiceNumber?.toLowerCase().includes(q);
      const custMatch = s.customer?.name?.toLowerCase().includes(q) || s.customer?.phone?.includes(q);
      const prodMatch = s.items?.some(i => 
        i.product?.name?.toLowerCase().includes(q) ||
        i.product?.productTypeName?.toLowerCase().includes(q) ||
        i.product?.productType?.name?.toLowerCase().includes(q) ||
        i.product?.barcode?.toLowerCase().includes(q)
      );
      return invMatch || custMatch || prodMatch;
    });
  }

  // Active (non-cancelled, non-return) sales for revenue KPIs
  const activeSales = sales.filter(s => s.status !== 'cancelled' && !s.isReturn);
  const returnSales = sales.filter(s => s.status !== 'cancelled' && s.isReturn);

  // 1. Dashboard KPIs
  const grossSalesVal = activeSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
  const returnVal = returnSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
  const totalSales = Number(Math.max(0, grossSalesVal - returnVal).toFixed(2));

  const totalInvoices = activeSales.length;
  const totalItemsSold = activeSales.reduce((sum, s) => 
    sum + s.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0)
  , 0);

  const totalDiscount = Number(activeSales.reduce((sum, s) => sum + (parseFloat(s.discount) || 0), 0).toFixed(2));
  const totalTax = Number(activeSales.reduce((sum, s) => sum + (parseFloat(s.taxAmount) || 0), 0).toFixed(2));
  const netSales = Number(activeSales.reduce((sum, s) => sum + (parseFloat(s.subTotal) || 0), 0).toFixed(2));
  const avgBillValue = totalInvoices > 0 ? Number((totalSales / totalInvoices).toFixed(2)) : 0;

  // Total purchase cost calculation (COGS = Purchase Price * Qty)
  let activeCost = 0;
  activeSales.forEach(s => {
    s.items.forEach(item => {
      const unitCost = resolveProductCostPrice(item.product, item, s);
      activeCost += unitCost * (item.quantity || 0);
    });
  });

  let returnCost = 0;
  returnSales.forEach(s => {
    s.items.forEach(item => {
      const unitCost = resolveProductCostPrice(item.product, item, s);
      returnCost += unitCost * (item.quantity || 0);
    });
  });

  const totalCost = Number(Math.max(0, activeCost - returnCost).toFixed(2));
  const grossProfit = Number((totalSales - totalCost).toFixed(2));
  const profitMargin = totalSales > 0 ? Number(((grossProfit / totalSales) * 100).toFixed(2)) : 0;

  // 2. Payment Breakdown (Aggregated from actual payment records of active sales)
  const paymentMethodMap = new Map();
  activeSales.forEach(s => {
    if (s.payments && s.payments.length > 0) {
      s.payments.forEach(p => {
        const method = (p.method || 'Other').trim();
        const amt = parseFloat(p.amount) || 0;
        const cur = paymentMethodMap.get(method) || { method, amount: 0, count: 0 };
        cur.amount += amt;
        cur.count += 1;
        paymentMethodMap.set(method, cur);
      });
    } else {
      const method = (s.paymentMethod || 'Cash').trim();
      const amt = parseFloat(s.totalAmount) || 0;
      const cur = paymentMethodMap.get(method) || { method, amount: 0, count: 0 };
      cur.amount += amt;
      cur.count += 1;
      paymentMethodMap.set(method, cur);
    }
  });

  const totalPaymentsAmount = Array.from(paymentMethodMap.values()).reduce((sum, p) => sum + p.amount, 0);
  const paymentSummary = Array.from(paymentMethodMap.values()).map(p => ({
    method: p.method,
    amount: Number(p.amount.toFixed(2)),
    count: p.count,
    percentage: totalPaymentsAmount > 0 ? Number(((p.amount / totalPaymentsAmount) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.amount - a.amount);

  // 3. Sales Trend Chart Data (Chronologically grouped by local Asia/Kolkata business date)
  const dateMap = new Map();
  // Sort active sales ascending by date for chronological trend
  const sortedForTrend = [...activeSales].sort((a, b) => new Date(a.createdAt || a.saleDate) - new Date(b.createdAt || b.saleDate));
  sortedForTrend.forEach(s => {
    const saleDateObj = new Date(s.createdAt || s.saleDate);
    const dStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(saleDateObj);
    const cur = dateMap.get(dStr) || { date: dStr, sales: 0, invoices: 0 };
    cur.sales += (parseFloat(s.totalAmount) || 0);
    cur.invoices += 1;
    dateMap.set(dStr, cur);
  });

  const salesTrend = Array.from(dateMap.values()).map(d => {
    const labelDate = new Date(`${d.date}T12:00:00+05:30`);
    const dateLabel = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short'
    }).format(labelDate);
    return {
      date: d.date,
      dateLabel,
      sales: Number(d.sales.toFixed(2)),
      invoices: d.invoices
    };
  });

  // 4. Top Selling Products (Aggregated at product level, combining all sizes)
  const productAggMap = new Map();
  activeSales.forEach(s => {
    s.items.forEach(item => {
      const pId = item.productId;
      const pName = item.product?.name || 'Unknown Product';
      const pType = item.product?.productTypeName || item.product?.productType?.name || '—';
      const key = `${pId}_${pName}`;
      const cur = productAggMap.get(key) || {
        productId: pId,
        name: pName,
        productTypeName: pType,
        qtySold: 0,
        salesAmount: 0
      };
      cur.qtySold += (item.quantity || 0);
      cur.salesAmount += (parseFloat(item.total) || 0);
      productAggMap.set(key, cur);
    });
  });

  const topProducts = Array.from(productAggMap.values())
    .map(p => ({
      ...p,
      salesAmount: Number(p.salesAmount.toFixed(2))
    }))
    .sort((a, b) => b.qtySold - a.qtySold)
    .slice(0, 10);

  // 5. Summary Report (Strictly ONE row per invoice, aggregated payments)
  const summary = sales.map(s => {
    let paymentList = [];
    if (s.payments && s.payments.length > 0) {
      paymentList = s.payments.map(p => ({
        method: p.method || 'Other',
        amount: Number((parseFloat(p.amount) || 0).toFixed(2))
      }));
    } else if (s.paymentMethod) {
      paymentList = [{
        method: s.paymentMethod,
        amount: Number((parseFloat(s.totalAmount) || 0).toFixed(2))
      }];
    }

    const uniqueMethods = [...new Set(paymentList.map(p => p.method))];
    const paymentMethodDisplay = uniqueMethods.length > 0 ? uniqueMethods.join(' + ') : (s.paymentMethod || 'Cash');

    const totalQty = s.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const effectiveDate = s.createdAt || s.saleDate;

    let invCost = 0;
    s.items.forEach(item => {
      const unitCost = resolveProductCostPrice(item.product, item, s);
      invCost += unitCost * (item.quantity || 0);
    });
    invCost = Number(invCost.toFixed(2));
    const invTotal = s.status !== 'cancelled' ? (parseFloat(s.totalAmount) || 0) : 0;
    const invProfit = s.status !== 'cancelled' ? Number((invTotal - invCost).toFixed(2)) : 0;

    const productTotal = Number(s.items.reduce((sum, item) => sum + ((parseFloat(item.unitPrice) || 0) * (item.quantity || 1)), 0).toFixed(2));
    const rawDiscount = Number((parseFloat(s.discount) || 0).toFixed(2));
    const rawVoucherDiscount = Number((parseFloat(s.voucherDiscount) || 0).toFixed(2));
    const itemDiscountsSum = Number(s.items.reduce((sum, item) => sum + ((parseFloat(item.discountAmount) || 0) * (item.quantity || 1)), 0).toFixed(2));
    const effectiveDiscount = Number((Math.max(rawDiscount, itemDiscountsSum) + rawVoucherDiscount).toFixed(2));

    return {
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      saleDate: effectiveDate,
      createdAt: s.createdAt,
      branchId: s.branchId,
      branch: s.branch ? {
        id: s.branch.id,
        name: s.branch.name,
        currencyCode: s.branch.currencyCode,
        currencySymbol: s.branch.currencySymbol,
        taxNumber: s.branch.taxNumber,
        phone: s.branch.phone,
        address: s.branch.address,
        state: s.branch.state
      } : null,
      customer: s.customer ? {
        id: s.customer.id,
        name: s.customer.name,
        phone: s.customer.phone || '—',
        email: s.customer.email || '—'
      } : { name: 'Walk-in Profile', phone: '—' },
      salesman: s.salesman ? {
        id: s.salesman.id,
        name: s.salesman.name || s.salesman.username
      } : { name: 'System' },
      paymentMethodDisplay,
      payments: paymentList,
      productTotal,
      subTotal: Number((parseFloat(s.subTotal) || 0).toFixed(2)),
      discount: effectiveDiscount > 0 ? effectiveDiscount : rawDiscount,
      rawDiscount,
      voucherDiscount: rawVoucherDiscount,
      voucherCode: s.voucherCode || null,
      taxAmount: Number((parseFloat(s.taxAmount) || 0).toFixed(2)),
      totalAmount: Number((parseFloat(s.totalAmount) || 0).toFixed(2)),
      deliveryCharge: Number((parseFloat(s.deliveryCharge) || 0).toFixed(2)),
      hasDeliveryCharge: Boolean(s.hasDeliveryCharge),
      roundOffAmount: Number((parseFloat(s.roundOffAmount) || 0).toFixed(2)),
      advanceUsed: Number((parseFloat(s.advanceUsed) || 0).toFixed(2)),
      currencyCode: s.currencyCode || s.branch?.currencyCode || 'AED',
      exchangeRate: Number((parseFloat(s.exchangeRate) || 1).toFixed(4)),
      isTaxInclusive: Boolean(s.isTaxInclusive),
      totalCost: invCost,
      grossProfit: invProfit,
      itemCount: s.items.length,
      totalQty,
      status: s.status,
      isReturn: s.isReturn,
      returnReason: s.returnReason,
      cancelledAt: s.cancelledAt,
      cancelledBy: s.cancelledBy,
      cancelReason: s.cancelReason,
      items: s.items.map(i => {
        const uPrice = Number((parseFloat(i.unitPrice) || 0).toFixed(2));
        const qty = i.quantity || 1;
        const lineTotal = Number((uPrice * qty).toFixed(2));
        return {
          id: i.id,
          productId: i.productId,
          productName: i.product?.name || 'Item',
          productTypeName: i.product?.productTypeName || i.product?.productType?.name || '—',
          size: i.size || '—',
          quantity: qty,
          unitPrice: uPrice,
          originalUnitPrice: Number((parseFloat(i.originalUnitPrice || i.unitPrice) || 0).toFixed(2)),
          discountAmount: Number((parseFloat(i.discountAmount) || 0).toFixed(2)),
          discountPercent: Number((parseFloat(i.discountPercent) || 0).toFixed(2)),
          voucherDiscountAmount: Number((parseFloat(i.voucherDiscountAmount) || 0).toFixed(2)),
          taxAmount: Number((parseFloat(i.taxAmount) || 0).toFixed(2)),
          taxRate: Number((parseFloat(i.taxRate) || 0).toFixed(2)),
          isTaxInclusive: Boolean(i.isTaxInclusive),
          lineTotal,
          total: lineTotal,
          storedTotal: Number((parseFloat(i.total) || 0).toFixed(2))
        };
      })
    };
  });

  // 6. Detailed Report (Flattened Sales Line Items)
  const detailed = [];
  sales.forEach(s => {
    let paymentList = [];
    if (s.payments && s.payments.length > 0) {
      paymentList = s.payments.map(p => p.method);
    } else if (s.paymentMethod) {
      paymentList = [s.paymentMethod];
    }
    const uniqueMethods = [...new Set(paymentList)];
    const paymentMethodDisplay = uniqueMethods.length > 0 ? uniqueMethods.join(' + ') : (s.paymentMethod || 'Cash');
    const effectiveDate = s.createdAt || s.saleDate;

    s.items.forEach(item => {
      const qty = item.quantity || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const discAmt = parseFloat(item.discountAmount) || 0;
      const taxAmt = parseFloat(item.taxAmount) || 0;
      const lineTotal = parseFloat(item.total) || 0;

      const costPrice = resolveProductCostPrice(item.product, item, s);
      const lineCost = Number((costPrice * qty).toFixed(2));

      // Net selling price per unit after discount
      const netUnitPrice = Math.max(0, unitPrice - discAmt);
      const voucherAlloc = parseFloat(item.voucherDiscountAmount) || 0;
      const lineSelling = Math.max(0, (netUnitPrice * qty) - voucherAlloc);

      // Profit = Selling Price - Purchase Price
      const isCancelled = s.status === 'cancelled';
      const profit = !isCancelled ? Number((lineSelling - lineCost).toFixed(2)) : 0;

      detailed.push({
        id: `${s.id}_${item.id}`,
        itemId: item.id,
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        saleDate: effectiveDate,
        createdAt: s.createdAt,
        customerName: s.customer?.name || 'Walk-in Profile',
        customerPhone: s.customer?.phone || '—',
        salesmanName: s.salesman?.name || s.salesman?.username || 'System',
        paymentMethod: paymentMethodDisplay,
        productId: item.productId,
        productName: item.product?.name || 'Unknown Product',
        productTypeName: item.product?.productTypeName || item.product?.productType?.name || '—',
        gender: item.product?.gender || '—',
        size: item.size && item.size.trim() ? item.size.trim() : '—',
        barcode: item.product?.barcode || '—',
        quantity: qty,
        unitPrice: Number(unitPrice.toFixed(2)),
        discountAmount: Number(discAmt.toFixed(2)),
        taxAmount: Number(taxAmt.toFixed(2)),
        lineTotal: Number(lineTotal.toFixed(2)),
        purchaseCost: Number(costPrice.toFixed(2)),
        lineCost,
        profit,
        status: s.status === 'cancelled' ? 'Void' : (s.isReturn ? 'Return' : 'Active')
      });
    });
  });

  // 7. Summary Totals (Based strictly on unique invoices)
  const summaryTotals = {
    totalInvoices: summary.length,
    totalItems: summary.reduce((sum, s) => sum + s.totalQty, 0),
    subTotal: Number(summary.reduce((sum, s) => sum + s.subTotal, 0).toFixed(2)),
    totalDiscount: Number(summary.reduce((sum, s) => sum + s.discount, 0).toFixed(2)),
    totalTax: Number(summary.reduce((sum, s) => sum + s.taxAmount, 0).toFixed(2)),
    netSales: Number(summary.reduce((sum, s) => sum + (s.status !== 'cancelled' ? s.totalAmount : 0), 0).toFixed(2)),
    totalCost: Number(summary.reduce((sum, s) => sum + (s.status !== 'cancelled' ? s.totalCost : 0), 0).toFixed(2)),
    grossProfit: Number(summary.reduce((sum, s) => sum + (s.status !== 'cancelled' ? s.grossProfit : 0), 0).toFixed(2))
  };

  // 8. Resolve active currency for branch / company context
  let currency = { code: 'AED', symbol: 'AED' };
  if (effectiveBranchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: effectiveBranchId },
      select: { currencyCode: true, currencySymbol: true }
    });
    if (branch) {
      const code = branch.currencyCode || 'AED';
      currency = {
        code,
        symbol: branch.currencySymbol || (code === 'INR' ? '₹' : 'AED')
      };
    }
  } else {
    const comp = await prisma.companyProfile.findFirst({ select: { currencyCode: true, currencySymbol: true } });
    if (comp) {
      const code = comp.currencyCode || 'AED';
      currency = {
        code,
        symbol: comp.currencySymbol || (code === 'INR' ? '₹' : 'AED')
      };
    }
  }

  // 9. Build Comprehensive Daily Activity for Selected Business Date
  const cancelledInvoicesList = sales.filter(s => s.status === 'cancelled').map(s => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    saleDate: s.saleDate,
    createdAt: s.createdAt,
    cancelledAt: s.cancelledAt || s.updatedAt,
    cancelledBy: s.cancelledBy || 'Staff',
    cancelReason: s.cancelReason || 'Cancelled by staff',
    originalAmount: Number((parseFloat(s.totalAmount) || 0).toFixed(2)),
    customer: s.customer ? { name: s.customer.name, phone: s.customer.phone } : { name: 'Walk-in' },
    itemsCount: s.items.length
  }));

  const returnsList = returnSales.map(s => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    originalInvoice: s.originalInvoice,
    saleDate: s.saleDate,
    customer: s.customer ? { name: s.customer.name, phone: s.customer.phone } : { name: 'Walk-in' },
    refundAmount: Number((parseFloat(s.totalAmount) || 0).toFixed(2)),
    paymentMethod: s.paymentMethod || 'Cash',
    returnReason: s.returnReason || 'Product Return',
    itemsCount: s.items.length,
    items: s.items.map(i => ({
      name: i.product?.name || 'Item',
      size: i.size,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      total: Number(i.total)
    }))
  }));

  const paymentRecords = [];
  sales.forEach(s => {
    if (s.payments && s.payments.length > 0) {
      s.payments.forEach((p, pIdx) => {
        paymentRecords.push({
          id: `pay_${p.id}_${s.id}_${pIdx}`,
          rawId: p.id,
          reference: p.reference || s.invoiceNumber,
          invoiceNumber: s.invoiceNumber,
          customer: s.customer?.name || 'Walk-in',
          date: p.paymentDate || s.createdAt,
          method: p.method,
          amount: Number(p.amount),
          status: s.status,
          cashier: s.salesman?.name || 'Staff'
        });
      });
    } else if (s.paymentMethod && s.status !== 'cancelled') {
      paymentRecords.push({
        id: `sale_pay_${s.id}`,
        rawId: s.id,
        reference: s.invoiceNumber,
        invoiceNumber: s.invoiceNumber,
        customer: s.customer?.name || 'Walk-in',
        date: s.saleDate || s.createdAt,
        method: s.paymentMethod,
        amount: Number(s.paidAmount || s.totalAmount),
        status: s.status,
        cashier: s.salesman?.name || 'Staff'
      });
    }
  });

  const totalTaxable = Number(activeSales.reduce((sum, s) => sum + (parseFloat(s.subTotal) || 0) - (parseFloat(s.discount) || 0), 0).toFixed(2));
  const gstReport = {
    taxableAmount: totalTaxable,
    cgst: Number((totalTax / 2).toFixed(2)),
    sgst: Number((totalTax / 2).toFixed(2)),
    igst: 0,
    totalTax: totalTax
  };

  const productMovementMap = {};
  sales.forEach(s => {
    s.items.forEach(it => {
      const pId = it.productId;
      if (!productMovementMap[pId]) {
        productMovementMap[pId] = {
          productId: pId,
          productName: it.product?.name || 'Item',
          sku: it.product?.sku || '',
          unitsSold: 0,
          unitsReturned: 0,
          netMovement: 0
        };
      }
      if (s.status === 'cancelled') {
        // cancelled sales don't alter net inventory
      } else if (s.isReturn) {
        productMovementMap[pId].unitsReturned += it.quantity;
        productMovementMap[pId].netMovement -= it.quantity;
      } else {
        productMovementMap[pId].unitsSold += it.quantity;
        productMovementMap[pId].netMovement += it.quantity;
      }
    });
  });
  const inventoryMovements = Object.values(productMovementMap);

  let dayCloseSummary = null;
  let expensesList = [];
  if (targetSingleDate) {
    try {
      const [ty, tm, td] = targetSingleDate.split('-').map(Number);
      const targetUtc = new Date(Date.UTC(ty, tm - 1, td));

      const dayCloseWhere = { businessDate: targetUtc };
      if (effectiveBranchId) {
        dayCloseWhere.branchId = effectiveBranchId;
      }

      const dayCloses = await prisma.dayClose.findMany({
        where: dayCloseWhere,
        include: {
          branch: { select: { id: true, name: true } },
          openedBy: { select: { id: true, name: true, username: true } },
          finalizedBy: { select: { id: true, name: true, username: true } }
        },
        orderBy: { id: 'desc' }
      });

      if (dayCloses.length > 0) {
        if (dayCloses.length === 1) {
          const dc = dayCloses[0];
          const openingAmt = Number(dc.actualOpeningCash || dc.openingCash || dc.salesSummary?.openingCash || 0);
          const expClosingAmt = dc.closingExpectedCash !== null && dc.closingExpectedCash !== undefined
            ? Number(dc.closingExpectedCash)
            : (dc.salesSummary?.expectedClosingCash !== null && dc.salesSummary?.expectedClosingCash !== undefined
                ? Number(dc.salesSummary.expectedClosingCash)
                : null);
          const physCash = dc.physicalCash !== null && dc.physicalCash !== undefined
            ? Number(dc.physicalCash)
            : (dc.salesSummary?.physicalCash !== null && dc.salesSummary?.physicalCash !== undefined
                ? Number(dc.salesSummary.physicalCash)
                : null);
          const diff = dc.cashDifference !== null && dc.cashDifference !== undefined
            ? Number(dc.cashDifference)
            : (dc.salesSummary?.cashDifference !== null && dc.salesSummary?.cashDifference !== undefined
                ? Number(dc.salesSummary.cashDifference)
                : Number(dc.openingDifference || 0));

          dayCloseSummary = {
            id: dc.id,
            branchId: dc.branchId,
            branchName: dc.branch?.name || (effectiveBranchId ? 'Selected Branch' : 'All Branches'),
            businessDate: targetSingleDate,
            status: dc.status,
            openingTime: dc.openedAt,
            openedAt: dc.openedAt,
            openedBy: dc.openedBy ? (dc.openedBy.name || dc.openedBy.username) : null,
            openingCash: openingAmt,
            actualOpeningCash: openingAmt,
            openingAmount: openingAmt,
            openingDifference: Number(dc.openingDifference || 0),
            closingTime: dc.finalizedAt,
            closedAt: dc.finalizedAt,
            closedBy: dc.finalizedBy ? (dc.finalizedBy.name || dc.finalizedBy.username) : null,
            physicalCash: physCash,
            closingActualCash: physCash,
            closingExpectedCash: expClosingAmt,
            closingAmount: physCash ?? expClosingAmt,
            cashDifference: diff,
            closingDifference: diff,
            verificationChecks: dc.verificationChecks,
            remarks: dc.notes || dc.openingRemarks || null,
            notes: dc.notes || null
          };
        } else {
          // Multiple branches day close aggregation
          const totalOpening = dayCloses.reduce((sum, d) => sum + Number(d.actualOpeningCash || d.openingCash || d.salesSummary?.openingCash || 0), 0);
          const totalExpClosing = dayCloses.reduce((sum, d) => sum + Number(d.closingExpectedCash || d.salesSummary?.expectedClosingCash || 0), 0);
          const totalPhysCash = dayCloses.reduce((sum, d) => sum + Number(d.physicalCash || d.salesSummary?.physicalCash || 0), 0);
          const totalDiff = dayCloses.reduce((sum, d) => sum + Number(d.cashDifference || d.salesSummary?.cashDifference || 0), 0);
          const allClosed = dayCloses.every(d => d.status === 'CLOSED' || d.status === 'ADMIN_CLOSED');
          const anyOpen = dayCloses.some(d => d.status === 'OPEN');

          dayCloseSummary = {
            id: 'multi',
            branchName: 'All Branches',
            businessDate: targetSingleDate,
            status: allClosed ? 'CLOSED' : (anyOpen ? 'OPEN' : 'PARTIAL'),
            openingTime: dayCloses[0].openedAt,
            openedAt: dayCloses[0].openedAt,
            openedBy: dayCloses.map(d => d.openedBy?.name || d.openedBy?.username).filter(Boolean).join(', ') || 'Multiple Staff',
            openingCash: totalOpening,
            actualOpeningCash: totalOpening,
            openingAmount: totalOpening,
            openingDifference: dayCloses.reduce((sum, d) => sum + Number(d.openingDifference || 0), 0),
            closingTime: dayCloses[0].finalizedAt,
            closedAt: dayCloses[0].finalizedAt,
            closedBy: dayCloses.map(d => d.finalizedBy?.name || d.finalizedBy?.username).filter(Boolean).join(', ') || 'Multiple Staff',
            physicalCash: totalPhysCash,
            closingActualCash: totalPhysCash,
            closingExpectedCash: totalExpClosing,
            closingAmount: totalPhysCash || totalExpClosing,
            cashDifference: totalDiff,
            closingDifference: totalDiff,
            verificationChecks: null,
            remarks: `${dayCloses.length} branch day sessions aggregated.`,
            notes: `${dayCloses.length} branch day sessions aggregated.`
          };
        }
      }

      const startUTC = parseBusinessDateStart(targetSingleDate);
      const endUTC = parseBusinessDateEnd(targetSingleDate);
      const expenseWhere = {
        date: { gte: startUTC, lte: endUTC }
      };
      if (effectiveBranchId) {
        expenseWhere.branchId = effectiveBranchId;
      }
      const exps = await prisma.expense.findMany({
        where: expenseWhere,
        orderBy: { createdAt: 'asc' }
      });
      expensesList = exps.map(e => ({
        id: e.id,
        title: e.title,
        category: e.category || 'General',
        amount: Number(e.amount),
        description: e.description,
        date: e.date
      }));
    } catch (err) {
      console.error('Error fetching daily activity dayClose/expenses:', err);
    }
  }

  // Calculate Cash Sales & Cash Refunds for cashbook calculations
  let cashSalesReceived = 0;
  activeSales.forEach(s => {
    if (s.payments && s.payments.length > 0) {
      s.payments.forEach(p => {
        if ((p.method || '').toLowerCase() === 'cash') {
          cashSalesReceived += parseFloat(p.amount) || 0;
        }
      });
    } else if ((s.paymentMethod || '').toLowerCase() === 'cash') {
      cashSalesReceived += parseFloat(s.paidAmount || s.totalAmount) || 0;
    }
  });

  let cashRefunds = 0;
  returnSales.forEach(s => {
    if ((s.paymentMethod || '').toLowerCase() === 'cash') {
      cashRefunds += parseFloat(s.totalAmount) || 0;
    }
  });

  const totalExpensesAmount = Number(expensesList.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0).toFixed(2));

  const dailyOpeningAmount = dayCloseSummary
    ? Number(dayCloseSummary.actualOpeningCash ?? dayCloseSummary.openingCash ?? 0)
    : 0;

  const fallbackExpectedClosing = Number((dailyOpeningAmount + cashSalesReceived - totalExpensesAmount - cashRefunds).toFixed(2));

  const dailyExpectedClosing = dayCloseSummary && dayCloseSummary.closingExpectedCash !== null && dayCloseSummary.closingExpectedCash !== undefined
    ? Number(dayCloseSummary.closingExpectedCash)
    : fallbackExpectedClosing;

  const dailyActualClosing = dayCloseSummary && dayCloseSummary.closingActualCash !== null && dayCloseSummary.closingActualCash !== undefined
    ? Number(dayCloseSummary.closingActualCash)
    : (dayCloseSummary && (dayCloseSummary.status === 'CLOSED' || dayCloseSummary.status === 'ADMIN_CLOSED') ? dailyExpectedClosing : null);

  const dailyClosingAmount = dailyActualClosing !== null && dailyActualClosing !== undefined
    ? dailyActualClosing
    : dailyExpectedClosing;

  if (dayCloseSummary) {
    if (dayCloseSummary.closingExpectedCash === null || dayCloseSummary.closingExpectedCash === undefined) {
      dayCloseSummary.closingExpectedCash = dailyExpectedClosing;
    }
    if ((dayCloseSummary.status === 'CLOSED' || dayCloseSummary.status === 'ADMIN_CLOSED') &&
        (dayCloseSummary.closingActualCash === null || dayCloseSummary.closingActualCash === undefined)) {
      dayCloseSummary.closingActualCash = dailyClosingAmount;
      dayCloseSummary.physicalCash = dailyClosingAmount;
    }
    dayCloseSummary.openingAmount = dailyOpeningAmount;
    dayCloseSummary.closingAmount = dailyClosingAmount;
  }

  res.json({
    dashboard: {
      kpis: {
        totalSales,
        totalInvoices,
        totalItemsSold,
        totalDiscount,
        totalTax,
        netSales,
        avgBillValue,
        totalCost,
        grossProfit,
        profitMargin
      },
      paymentSummary,
      salesTrend,
      topProducts
    },
    summary,
    detailed,
    summaryTotals,
    dailyActivity: {
      targetDate: targetSingleDate,
      businessDate: targetSingleDate,
      openingAmount: dailyOpeningAmount,
      closingAmount: dailyClosingAmount,
      closingExpectedCash: dailyExpectedClosing,
      closingActualCash: dailyActualClosing,
      cashSalesReceived,
      cashRefunds,
      totalExpensesAmount,
      invoices: activeSales.map(s => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate,
        customerName: s.customer?.name || 'Walk-in',
        totalAmount: Number(s.totalAmount),
        paymentMethod: s.paymentMethod || 'Cash',
        status: s.status,
        isReturn: s.isReturn
      })),
      cancelledInvoices: cancelledInvoicesList,
      returns: returnsList,
      payments: paymentRecords,
      gstReport,
      gstSummary: gstReport,
      inventoryMovements,
      stockMovements: inventoryMovements,
      expenses: expensesList,
      dayCloseSummary,
      dayCloseRecord: dayCloseSummary,
      counts: {
        totalInvoicesCount: activeSales.length + cancelledInvoicesList.length,
        cancelledCount: cancelledInvoicesList.length,
        returnsCount: returnsList.length,
        expensesCount: expensesList.length,
        totalExpensesAmount
      }
    },
    currency
  });
});
