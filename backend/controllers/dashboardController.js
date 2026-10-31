const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const {
    getLocalDateString,
    getUtcDateObj,
    formatDisplayDate,
    getBranchActiveBusinessDate
} = require('../utils/businessDateHelper');
const { calculateSessionCashDrawer } = require('../utils/cashDrawerHelper');

exports.getDashboardStats = asyncHandler(async (req, res) => {
    const { branchId: queryBranchId } = req.query;
    const user = req.user;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- BRANCH ENFORCEMENT & ISOLATION ---
    let branchId = queryBranchId;
    const isGlobalAdmin = user?.role === 'admin' && !user?.branchId;

    // If not global admin, they are strictly locked to their assigned branch
    if (!isGlobalAdmin) {
        if (!user?.branchId) {
            res.status(403);
            throw new Error('Access denied. No branch assigned to this account.');
        }
        branchId = user.branchId;
    }
    // If admin but didn't specify branchId, branchId remains undefined (GLOBAL VIEW)

    const parsedBranchId = branchId && !isNaN(parseInt(branchId)) ? parseInt(branchId) : undefined;
    const where = parsedBranchId ? { branchId: parsedBranchId } : {};

    // 1. Sales Metrics
    let totalSales = 0;
    let todaySales = 0;
    let totalOrders = 0;
    let todaySalesCount = 0;

    try {
        const totalSalesAgg = await prisma.sale.aggregate({ where, _sum: { totalAmount: true } });
        totalSales = Number(totalSalesAgg._sum.totalAmount) || 0;

        const todaySalesAgg = await prisma.sale.aggregate({
            where: { ...where, saleDate: { gte: today } },
            _sum: { totalAmount: true }
        });
        todaySales = Number(todaySalesAgg._sum.totalAmount) || 0;

        todaySalesCount = await prisma.sale.count({
            where: { ...where, saleDate: { gte: today } }
        });
        totalOrders = await prisma.sale.count({ where });
    } catch (e) {
        // Silent catch or log to monitoring service in production
    }

    // 2. Inventory Metrics
    let totalProducts = 0;
    let inStockProducts = 0;
    let stockBalance = [];

    try {
        totalProducts = await prisma.product.count();
        inStockProducts = await prisma.productStock.count({
            where: {
                ...(parsedBranchId ? { branchId: parsedBranchId } : {}),
                quantity: { gt: 0 }
            }
        });

        const stockBalanceRaw = await prisma.productStock.findMany({
            where: { ...(parsedBranchId ? { branchId: parsedBranchId } : {}) },
            orderBy: { quantity: 'asc' },
            take: 5,
            include: { product: true }
        });

        stockBalance = stockBalanceRaw.map(s => ({
            name: s.product ? s.product.name : 'Unknown Product',
            category: (s.product && s.product.categoryName) ? s.product.categoryName : 'Uncategorized',
            stock: s.quantity,
            price: s.product ? Number(s.product.price) : 0
        }));
    } catch (e) {
        console.error("Dashboard Inventory metrics error:", e);
    }

    // 3. Customer Metrics
    let totalCustomers = 0;
    let activeCustomers = 0;
    try {
        totalCustomers = await prisma.customer.count({
            where: parsedBranchId ? { branchId: parsedBranchId } : {}
        });

        const customerWhere = {};
        if (parsedBranchId) {
            customerWhere.branchId = parsedBranchId;
            customerWhere.sales = { some: { branchId: parsedBranchId } };
        } else {
            customerWhere.sales = { some: {} };
        }

        activeCustomers = await prisma.customer.count({ where: customerWhere });
    } catch (e) {
        console.error("Dashboard Customer metrics error:", e);
    }

    // 4. Financial Summary
    let totalReceipts = 0;
    let totalExpenses = 0;
    let totalPurchases = 0;

    try {
        const receiptsAgg = await prisma.payment.aggregate({
            where: { ...where, type: 'receipt' },
            _sum: { amount: true }
        });
        totalReceipts = Number(receiptsAgg._sum.amount) || 0;
    } catch (e) { console.error("Dashboard Receipts error:", e); }

    try {
        const expensesAgg = await prisma.expense.aggregate({ where, _sum: { amount: true } });
        totalExpenses = Number(expensesAgg._sum.amount) || 0;
    } catch (e) { console.error("Dashboard Expenses error:", e); }

    try {
        const purchasesAgg = await prisma.purchase.aggregate({
            where,
            _sum: { totalAmount: true }
        });
        totalPurchases = Number(purchasesAgg._sum.totalAmount) || 0;
    } catch (e) { console.error("Dashboard Purchases error:", e); }

    const netProfit = totalSales - totalExpenses - totalPurchases;

    // 5. Recent Sales
    let recentSales = [];
    try {
        recentSales = await prisma.sale.findMany({
            where,
            take: 5,
            orderBy: { saleDate: 'desc' },
            include: {
                customer: true,
                items: {
                    include: { product: true }
                }
            }
        });
    } catch (e) { console.error("Dashboard Recent sales error:", e); }

    // 6. Fast Moving Products
    let fastMovingProducts = [];
    try {
        const fastMovingRaw = await prisma.saleItem.groupBy({
            by: ['productId'],
            _sum: { quantity: true },
            where: { sale: where },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5
        });

        fastMovingProducts = await Promise.all(fastMovingRaw.map(async item => {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: { name: true, categoryName: true, price: true }
            });
            return {
                name: product ? product.name : 'Unknown',
                category: product ? product.categoryName : 'Uncategorized',
                sold: item._sum.quantity || 0,
                price: product ? Number(product.price) : 0
            };
        }));
    } catch (e) { console.error("Dashboard Fast moving products error:", e); }

    // 7. Day Opening & Closing Status (Authoritative Cash Drawer Calculations)
    let dayManagement = {
        businessDate: null,
        businessDateDisplay: null,
        status: 'OPEN',
        openingCash: 0,
        previousClosingCash: 0,
        previousClosingDate: null,
        previousClosingDateDisplay: null,
        hasPreviousClosedDay: false,
        additionalCashAdded: 0,
        cashRemovedBeforeOpening: 0,
        expectedOpeningCash: 0,
        actualOpeningCash: 0,
        openingDifference: 0,
        openingTime: null,
        openedBy: null,
        totalCashReceived: 0,
        totalCashPaid: 0,
        transfersIn: 0,
        transfersOut: 0,
        expectedClosingCash: 0,
        actualClosingCash: null,
        cashDifference: null,
        closingStatus: 'OPEN',
        closedAt: null,
        closedBy: null,
        todayCancelledCount: 0,
        todayExpenses: 0,
        hasPendingPrevious: false,
        pendingDateDisplay: null,
        hasPriorDayDiscrepancy: false,
        priorDayDiscrepancyAmount: 0
    };

    try {
        const targetBId = parsedBranchId || 1;
        const activeDateInfo = await getBranchActiveBusinessDate(targetBId);
        const dateStr = activeDateInfo.dateStr;

        const drawer = await calculateSessionCashDrawer(targetBId, dateStr);

        const cancelledCount = await prisma.sale.count({
            where: {
                ...(parsedBranchId ? { branchId: parsedBranchId } : {}),
                status: 'cancelled',
                saleDate: { gte: today }
            }
        });

        dayManagement = {
            businessDate: dateStr,
            businessDateDisplay: formatDisplayDate(dateStr),
            status: drawer.status,
            openingCash: drawer.openingCash,
            previousClosingCash: drawer.previousClosingCash !== null ? drawer.previousClosingCash : 0,
            previousClosingDate: drawer.previousClosingDate,
            previousClosingDateDisplay: drawer.previousClosingDateDisplay,
            hasPreviousClosedDay: drawer.hasPreviousClosedDay,
            additionalCashAdded: drawer.additionalCashAdded,
            cashRemovedBeforeOpening: drawer.cashRemovedBeforeOpening,
            expectedOpeningCash: drawer.expectedOpeningCash,
            actualOpeningCash: drawer.actualOpeningCash,
            openingDifference: drawer.openingDifference,
            openingTime: drawer.openedAt,
            openedBy: drawer.openedBy,
            totalCashReceived: drawer.totalCashReceived,
            totalCashPaid: drawer.totalCashPaid,
            transfersIn: drawer.transfersIn,
            transfersOut: drawer.transfersOut,
            expectedClosingCash: drawer.expectedClosingCash,
            actualClosingCash: drawer.physicalCash,
            cashDifference: drawer.cashDifference,
            closingStatus: drawer.status,
            closedAt: drawer.finalizedAt,
            closedBy: drawer.finalizedBy,
            todayCancelledCount: cancelledCount,
            todayExpenses: drawer.cashExpenses,
            hasPendingPrevious: activeDateInfo.isPendingPrevious,
            pendingDate: activeDateInfo.isPendingPrevious ? activeDateInfo.dateStr : null,
            pendingDateDisplay: activeDateInfo.isPendingPrevious ? formatDisplayDate(activeDateInfo.dateStr) : null,
            hasPriorDayDiscrepancy: drawer.hasPriorDayDiscrepancy,
            priorDayDiscrepancyAmount: drawer.priorDayDiscrepancyAmount
        };
    } catch (e) {
        console.error("Dashboard Day Management error:", e);
    }

    res.json({
        sales: {
            total: totalSales,
            today: todaySales,
            count: totalOrders,
            todayCount: todaySalesCount
        },
        inventory: {
            totalProducts,
            inStock: inStockProducts,
            stockBalance
        },
        customers: {
            total: totalCustomers,
            active: activeCustomers
        },
        finance: {
            receipts: totalReceipts,
            expenses: totalExpenses,
            purchases: totalPurchases,
            netProfit
        },
        recentSales,
        fastMovingProducts,
        dayManagement,
        scope: parsedBranchId ? `Branch: ${parsedBranchId}` : "Global"
    });
});
