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

// Comprehensive POS Sales Analytics Report
// Supplies Dashboard KPIs, Trend Chart data, Payment Breakdown, Top Products,
// Single-row-per-invoice Summary Report, and Line-item Detailed Report.
exports.getSalesAnalyticsReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, paymentMethod, salesmanId, customerId, status, search } = req.query;
  const effectiveBranchId = getEffectiveBranchId(req);

  if (effectiveBranchId === -1) {
    res.status(403);
    throw new Error('Access denied. No branch assigned to this account.');
  }

  const where = {};
  if (effectiveBranchId) where.branchId = effectiveBranchId;

  if (startDate || endDate) {
    const startUTC = parseBusinessDateStart(startDate);
    const endUTC = parseBusinessDateEnd(endDate);
    const dateFilter = {};
    if (startUTC) dateFilter.gte = startUTC;
    if (endUTC) dateFilter.lte = endUTC;
    where.createdAt = dateFilter;
  }

  if (salesmanId && salesmanId !== 'all') where.salesmanId = parseInt(salesmanId);
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
      salesman: { select: { id: true, name: true, username: true } },
      payments: true,
      items: {
        include: {
          product: {
            include: {
              productType: true,
              category: true
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
      if (s.payments && s.payments.length > 0) {
        return s.payments.some(p => p.method && p.method.toLowerCase() === targetMethod);
      }
      return s.paymentMethod && s.paymentMethod.toLowerCase() === targetMethod;
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

  // Total cost calculation based on product.costPrice
  let totalCost = 0;
  activeSales.forEach(s => {
    s.items.forEach(item => {
      const unitCost = item.product?.costPrice !== null && item.product?.costPrice !== undefined ? parseFloat(item.product.costPrice) : 0;
      totalCost += unitCost * (item.quantity || 0);
    });
  });
  totalCost = Number(totalCost.toFixed(2));

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

    return {
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      saleDate: effectiveDate,
      createdAt: s.createdAt,
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
      subTotal: Number((parseFloat(s.subTotal) || 0).toFixed(2)),
      discount: Number((parseFloat(s.discount) || 0).toFixed(2)),
      taxAmount: Number((parseFloat(s.taxAmount) || 0).toFixed(2)),
      totalAmount: Number((parseFloat(s.totalAmount) || 0).toFixed(2)),
      itemCount: s.items.length,
      totalQty,
      status: s.status,
      isReturn: s.isReturn,
      returnReason: s.returnReason,
      cancelledAt: s.cancelledAt,
      cancelledBy: s.cancelledBy,
      cancelReason: s.cancelReason,
      items: s.items.map(i => ({
        id: i.id,
        productId: i.productId,
        productName: i.product?.name || 'Item',
        productTypeName: i.product?.productTypeName || i.product?.productType?.name || '—',
        size: i.size || '—',
        quantity: i.quantity,
        unitPrice: Number((parseFloat(i.unitPrice) || 0).toFixed(2)),
        discountAmount: Number((parseFloat(i.discountAmount) || 0).toFixed(2)),
        taxAmount: Number((parseFloat(i.taxAmount) || 0).toFixed(2)),
        total: Number((parseFloat(i.total) || 0).toFixed(2))
      }))
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

      const hasCost = item.product?.costPrice !== null && item.product?.costPrice !== undefined;
      const costPrice = hasCost ? parseFloat(item.product.costPrice) : null;
      const lineCost = hasCost ? Number((costPrice * qty).toFixed(2)) : null;
      const profit = hasCost ? Number((lineTotal - lineCost).toFixed(2)) : null;

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
        purchaseCost: costPrice !== null ? Number(costPrice.toFixed(2)) : null,
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
    netSales: Number(summary.reduce((sum, s) => sum + (s.status !== 'cancelled' ? s.totalAmount : 0), 0).toFixed(2))
  };

  // 8. Resolve active currency for branch / company context
  let currency = null;
  if (effectiveBranchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: effectiveBranchId },
      select: { currencyCode: true, currencySymbol: true }
    });
    if (branch) {
      currency = {
        code: branch.currencyCode || 'INR',
        symbol: branch.currencySymbol || '₹'
      };
    }
  }

  if (!currency) {
    const company = await prisma.companyProfile.findFirst({
      select: { currencyCode: true, currencySymbol: true }
    });
    currency = {
      code: company?.currencyCode || 'INR',
      symbol: company?.currencySymbol || '₹'
    };
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
    currency
  });
});
