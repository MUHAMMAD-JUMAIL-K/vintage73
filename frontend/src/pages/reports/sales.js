import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import {
    FiDownload, FiEye, FiPrinter, FiX, FiCalendar, FiSearch, FiRefreshCw,
    FiTrendingUp, FiDollarSign, FiShoppingBag, FiCreditCard, FiPercent,
    FiBox, FiUser, FiSliders, FiCheckCircle, FiChevronRight, FiLayers,
    FiArrowUpRight, FiTag, FiFileText, FiPieChart, FiLock, FiClock, FiAlertTriangle, FiActivity
} from 'react-icons/fi';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'react-toastify';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';
import SearchableSelect from '@/components/SearchableSelect';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency, getCurrencySymbol } from '@/lib/currency';

// Timezone-aware date utilities for Business Timezone (Asia/Kolkata, UTC+5:30)
const BUSINESS_TZ = 'Asia/Kolkata';

// Formats a Date object or timestamp string into YYYY-MM-DD in Asia/Kolkata (for <input type="date">)
const toLocalDateInputString = (dateVal = new Date()) => {
    try {
        const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
        return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(d);
    } catch (e) {
        return new Date().toISOString().split('T')[0];
    }
};

// Formats a Date object or timestamp string into DD/MM/YYYY in Asia/Kolkata (for table / print / CSV display)
const formatDisplayDate = (dateVal) => {
    if (!dateVal) return '—';
    try {
        const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: BUSINESS_TZ,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(d);
    } catch (e) {
        return new Date(dateVal).toLocaleDateString('en-GB');
    }
};

export default function SalesReport() {
    const { theme } = useTheme();
    const router = useRouter();

    // Active Navigation Tab: 'dashboard' | 'summary' | 'detailed' | 'dailyActivity'
    const [activeTab, setActiveTab] = useState('dashboard');
    const [dateMode, setDateMode] = useState('range'); // 'range' | 'single'
    const [singleDate, setSingleDate] = useState(() => toLocalDateInputString(new Date()));

    // Sync with URL query parameter (e.g. from Day Close / Dashboard)
    useEffect(() => {
        if (router.query.businessDate) {
            setDateMode('single');
            setSingleDate(router.query.businessDate);
            setStartDate(router.query.businessDate);
            setEndDate(router.query.businessDate);
            setActiveTab('dailyActivity');
        }
    }, [router.query.businessDate]);

    // Filter States (Default to current month in Asia/Kolkata)
    const [startDate, setStartDate] = useState(() => {
        const todayStr = toLocalDateInputString(new Date());
        const [year, month] = todayStr.split('-').map(Number);
        const startOfMonth = new Date(year, month - 1, 1);
        return toLocalDateInputString(startOfMonth);
    });
    const [endDate, setEndDate] = useState(() => toLocalDateInputString(new Date()));
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');
    const [selectedSalesman, setSelectedSalesman] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [dailySection, setDailySection] = useState('all');

    // Data States
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState({
        dashboard: {
            kpis: {
                totalSales: 0,
                totalInvoices: 0,
                totalItemsSold: 0,
                totalDiscount: 0,
                totalTax: 0,
                netSales: 0,
                avgBillValue: 0,
                totalCost: 0,
                grossProfit: 0,
                profitMargin: 0
            },
            paymentSummary: [],
            salesTrend: [],
            topProducts: []
        },
        summary: [],
        detailed: [],
        summaryTotals: {
            totalInvoices: 0,
            totalItems: 0,
            subTotal: 0,
            totalDiscount: 0,
            totalTax: 0,
            netSales: 0
        }
    });

    // Options & User State
    const [branches, setBranches] = useState([]);
    const [salesmen, setSalesmen] = useState([]);
    const [user, setUser] = useState(null);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [salesSettings, setSalesSettings] = useState(null);
    const [returnSettings, setReturnSettings] = useState(null);

    // Modals
    const [selectedSale, setSelectedSale] = useState(null);
    const [printSale, setPrintSale] = useState(null);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [saleToCancel, setSaleToCancel] = useState(null);
    const [cancelReasonInput, setCancelReasonInput] = useState('');

    // Pagination for Summary & Detailed Tables
    const [summaryPage, setSummaryPage] = useState(1);
    const [detailedPage, setDetailedPage] = useState(1);
    const pageSize = 25;

    const componentRef = useRef();

    // Dynamic branch and currency resolution
    const activeBranch = useMemo(() => {
        if (!selectedBranch || selectedBranch === 'all') {
            if (user?.branchId) {
                return branches.find(b => b.id?.toString() === user.branchId?.toString()) || null;
            }
            return null;
        }
        return branches.find(b => b.id?.toString() === selectedBranch?.toString()) || null;
    }, [branches, selectedBranch, user]);

    const activeCurrencyCode = useMemo(() => {
        if (activeBranch?.currencyCode) return activeBranch.currencyCode;
        if (reportData?.currency?.code) return reportData.currency.code;
        return companyProfile?.currencyCode || 'INR';
    }, [activeBranch, reportData?.currency, companyProfile]);

    const activeCurrencySymbol = useMemo(() => {
        if (activeBranch?.currencySymbol) return activeBranch.currencySymbol;
        if (reportData?.currency?.symbol) return reportData.currency.symbol;
        return companyProfile?.currencySymbol || getCurrencySymbol(activeCurrencyCode) || '₹';
    }, [activeBranch, reportData?.currency, companyProfile, activeCurrencyCode]);

    // Initial setup: User, branches, salesmen, settings
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const u = JSON.parse(storedUser);
            setUser(u);
            setSelectedBranch(u.branchId?.toString() || (u.role === 'admin' ? 'all' : ''));
        }

        // Fetch branches unconditionally so branch currency metadata is always available
        api.get('/branches').then(res => {
            if (Array.isArray(res.data)) {
                setBranches(res.data);
            }
        }).catch(console.error);

        // Fetch salesmen / staff for filter
        api.get('/users').then(res => {
            if (Array.isArray(res.data)) {
                setSalesmen(res.data);
            }
        }).catch(() => {});

        // Fetch settings & company profile
        Promise.all([
            api.get('/company').catch(() => ({ data: null })),
            api.get('/invoice-settings', { params: { type: 'sales' } }).catch(() => ({ data: null })),
            api.get('/invoice-settings', { params: { type: 'return' } }).catch(() => ({ data: null }))
        ]).then(([compRes, salesSettingsRes, returnSettingsRes]) => {
            if (compRes?.data) setCompanyProfile(compRes.data);
            if (salesSettingsRes?.data?.settings) setSalesSettings(salesSettingsRes.data.settings);
            if (returnSettingsRes?.data?.settings) setReturnSettings(returnSettingsRes.data.settings);
        });
    }, []);

    // Fetch Report Data whenever primary filters change
    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const queryBranchId = selectedBranch === 'all' ? undefined : selectedBranch;

            const effectiveStart = dateMode === 'single' ? singleDate : startDate;
            const effectiveEnd = dateMode === 'single' ? singleDate : endDate;

            const params = {
                startDate: effectiveStart,
                endDate: effectiveEnd,
                businessDate: dateMode === 'single' ? singleDate : undefined,
                branchId: queryBranchId,
                paymentMethod: selectedPaymentMethod !== 'all' ? selectedPaymentMethod : undefined,
                salesmanId: selectedSalesman !== 'all' ? selectedSalesman : undefined,
                status: selectedStatus !== 'all' ? selectedStatus : undefined,
                search: searchTerm.trim() ? searchTerm.trim() : undefined
            };

            const res = await api.get('/reports/sales-analytics', { params });
            if (res.data) {
                setReportData(res.data);
            }
            setSummaryPage(1);
            setDetailedPage(1);
        } catch (err) {
            console.error('Error fetching sales analytics report:', err);
            toast.error(err.response?.data?.message || 'Failed to load sales report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedBranch !== '') {
            fetchAnalytics();
        }
    }, [selectedBranch, startDate, endDate, singleDate, dateMode, selectedPaymentMethod, selectedSalesman, selectedStatus]);

    // Quick Date Presets in Asia/Kolkata
    const applyDatePreset = (preset) => {
        const todayStr = toLocalDateInputString(new Date());
        const [year, month, day] = todayStr.split('-').map(Number);
        const localToday = new Date(year, month - 1, day);
        let s = new Date(localToday);
        let e = new Date(localToday);

        if (preset === 'today') {
            s = localToday;
            e = localToday;
            const targetIso = toLocalDateInputString(s);
            setSingleDate(targetIso);
            setStartDate(targetIso);
            setEndDate(targetIso);
        } else if (preset === 'yesterday') {
            s = new Date(year, month - 1, day - 1);
            e = new Date(year, month - 1, day - 1);
            const targetIso = toLocalDateInputString(s);
            setSingleDate(targetIso);
            setStartDate(targetIso);
            setEndDate(targetIso);
        } else if (preset === 'this_week') {
            const dayOfWeek = localToday.getDay(); // 0 is Sunday
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            s = new Date(year, month - 1, day - diffToMonday);
            e = localToday;
            setDateMode('range');
            setStartDate(toLocalDateInputString(s));
            setEndDate(toLocalDateInputString(e));
        } else if (preset === 'this_month') {
            s = new Date(year, month - 1, 1);
            e = localToday;
            setDateMode('range');
            setStartDate(toLocalDateInputString(s));
            setEndDate(toLocalDateInputString(e));
        } else if (preset === 'last_month') {
            s = new Date(year, month - 2, 1);
            e = new Date(year, month - 1, 0);
            setDateMode('range');
            setStartDate(toLocalDateInputString(s));
            setEndDate(toLocalDateInputString(e));
        }
    };

    // Printing single invoice
    const handlePrintInvoice = useReactToPrint({
        contentRef: componentRef,
        pageStyle: `@page { size: auto; margin: 0mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`
    });
    const triggerInvoicePrint = (sale) => {
        setPrintSale(sale);
        toast.info("Preparing Invoice Print...", { autoClose: 1000, position: 'bottom-right' });
        setTimeout(() => handlePrintInvoice(), 500);
    };

    // Printing full report view
    const triggerReportPrint = () => {
        window.print();
    };

    // Invoice Cancellation
    const handleCancelClick = (sale) => {
        setSaleToCancel(sale);
        setShowCancelModal(true);
    };

    const confirmCancel = async () => {
        if (!saleToCancel || !cancelReasonInput.trim()) {
            toast.error('Please provide a reason');
            return;
        }
        try {
            setLoading(true);
            await api.put(`/sales/${saleToCancel.id}/cancel`, {
                cancelledBy: user?.username || 'Admin',
                cancelReason: cancelReasonInput
            });
            toast.success('Invoice cancelled successfully');
            setShowCancelModal(false);
            setSaleToCancel(null);
            setCancelReasonInput('');
            fetchAnalytics();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel invoice');
        } finally {
            setLoading(false);
        }
    };

    // Client-side search refinement if user types without enter
    const filteredSummary = useMemo(() => {
        if (!searchTerm.trim()) return reportData.summary || [];
        const q = searchTerm.trim().toLowerCase();
        return (reportData.summary || []).filter(s =>
            s.invoiceNumber?.toLowerCase().includes(q) ||
            s.customer?.name?.toLowerCase().includes(q) ||
            s.customer?.phone?.includes(q) ||
            s.salesman?.name?.toLowerCase().includes(q) ||
            s.items?.some(i => i.productName?.toLowerCase().includes(q) || i.productTypeName?.toLowerCase().includes(q))
        );
    }, [reportData.summary, searchTerm]);

    const filteredDetailed = useMemo(() => {
        if (!searchTerm.trim()) return reportData.detailed || [];
        const q = searchTerm.trim().toLowerCase();
        return (reportData.detailed || []).filter(i =>
            i.invoiceNumber?.toLowerCase().includes(q) ||
            i.customerName?.toLowerCase().includes(q) ||
            i.customerPhone?.includes(q) ||
            i.productName?.toLowerCase().includes(q) ||
            i.productTypeName?.toLowerCase().includes(q) ||
            i.size?.toLowerCase().includes(q) ||
            i.barcode?.toLowerCase().includes(q)
        );
    }, [reportData.detailed, searchTerm]);

    // Paginated datasets
    const paginatedSummary = useMemo(() => {
        const start = (summaryPage - 1) * pageSize;
        return filteredSummary.slice(start, start + pageSize);
    }, [filteredSummary, summaryPage]);

    const paginatedDetailed = useMemo(() => {
        const start = (detailedPage - 1) * pageSize;
        return filteredDetailed.slice(start, start + pageSize);
    }, [filteredDetailed, detailedPage]);

    // Detailed Report Totals (Calculated from filteredDetailed)
    const detailedTotals = useMemo(() => {
        return filteredDetailed.reduce((acc, row) => {
            acc.totalQty += (row.quantity || 0);
            acc.totalSales += (row.lineTotal || 0);
            if (row.lineCost !== null && row.lineCost !== undefined) {
                acc.totalCost += row.lineCost;
            }
            if (row.profit !== null && row.profit !== undefined) {
                acc.totalProfit += row.profit;
            }
            return acc;
        }, { totalQty: 0, totalSales: 0, totalCost: 0, totalProfit: 0 });
    }, [filteredDetailed]);

    // CSV Export: adapts cleanly to active tab
    const handleExportCSV = () => {
        let csvRows = [];
        let filename = `sales-report-${activeTab}-${startDate}-to-${endDate}.csv`;

        if (activeTab === 'summary') {
            csvRows = [
                ['Invoice #', 'Date', 'Customer', 'Phone', 'Salesman', 'Payment Methods', `Subtotal (${activeCurrencyCode})`, `Discount (${activeCurrencyCode})`, `Tax (${activeCurrencyCode})`, `Total Amount (${activeCurrencyCode})`, 'Status'],
                ...filteredSummary.map(s => [
                    `"${s.invoiceNumber}"`,
                    `"${formatDisplayDate(s.saleDate)}"`,
                    `"${s.customer?.name || 'Walk-in'}"`,
                    `"${s.customer?.phone || '—'}"`,
                    `"${s.salesman?.name || 'System'}"`,
                    `"${s.paymentMethodDisplay || 'Cash'}"`,
                    s.subTotal,
                    s.discount,
                    s.taxAmount,
                    s.totalAmount,
                    `"${s.status === 'cancelled' ? 'Void' : (s.isReturn ? 'Return' : 'Active')}"`
                ])
            ];
        } else if (activeTab === 'detailed') {
            csvRows = [
                ['Invoice #', 'Date', 'Customer', 'Phone', 'Salesman', 'Payment Method', 'Product Name', 'Product Type', 'Gender', 'Size', 'Barcode', 'Quantity', `Unit Price (${activeCurrencyCode})`, `Discount (${activeCurrencyCode})`, `Tax (${activeCurrencyCode})`, `Line Total (${activeCurrencyCode})`, `Purchase Cost (${activeCurrencyCode})`, `Profit (${activeCurrencyCode})`, 'Status'],
                ...filteredDetailed.map(row => [
                    `"${row.invoiceNumber}"`,
                    `"${formatDisplayDate(row.saleDate)}"`,
                    `"${row.customerName || 'Walk-in'}"`,
                    `"${row.customerPhone || '—'}"`,
                    `"${row.salesmanName || 'System'}"`,
                    `"${row.paymentMethod || 'Cash'}"`,
                    `"${row.productName}"`,
                    `"${row.productTypeName || '—'}"`,
                    `"${row.gender || '—'}"`,
                    `"${row.size || '—'}"`,
                    `"${row.barcode || '—'}"`,
                    row.quantity,
                    row.unitPrice,
                    row.discountAmount,
                    row.taxAmount,
                    row.lineTotal,
                    row.purchaseCost !== null ? row.purchaseCost : '—',
                    row.profit !== null ? row.profit : '—',
                    `"${row.status}"`
                ])
            ];
        } else if (activeTab === 'dailyActivity') {
            const da = reportData.dailyActivity || {};
            const dc = da.dayCloseRecord || {};
            const openingVal = da.openingAmount ?? dc.actualOpeningCash ?? dc.openingCash ?? 0;
            const closingVal = da.closingAmount ?? dc.closingActualCash ?? dc.closingExpectedCash ?? 0;
            const expClosingVal = dc.closingExpectedCash ?? da.closingExpectedCash ?? 0;
            const totalExpVal = da.totalExpensesAmount ?? (da.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

            csvRows = [
                ['Daily Activity Operational Audit', `Business Date: ${formatDisplayDate(da.businessDate || singleDate)}`],
                ['Branch', `"${dc.branchName || 'All Branches'}"`],
                ['Session Status', `"${dc.status || 'UNREGISTERED'}"`],
                [],
                ['Operational KPI', `Amount / Count (${activeCurrencyCode})`],
                ['Opening Amount', openingVal],
                ['Total Sales', reportData.dashboard?.kpis?.totalSales || 0],
                ['Closing Amount (Actual / Final)', closingVal],
                ['Expected Closing Amount', expClosingVal],
                ['Daily Expenses Total', totalExpVal],
                ['Total Invoices Count', da.counts?.totalInvoicesCount || 0],
                ['Cancelled Invoices Count', da.counts?.cancelledCount || 0],
                ['Sales Returns Count', da.counts?.returnsCount || 0],
                ['GST Total Tax Collection', da.gstSummary?.totalTax || 0],
                [],
                ['Invoices Register'],
                ['Invoice #', 'Sale Date', 'Customer', 'Payment Method', `Total (${activeCurrencyCode})`, 'Status'],
                ...(da.invoices || []).map(inv => [
                    `"${inv.invoiceNumber}"`,
                    `"${formatDisplayDate(inv.saleDate)}"`,
                    `"${inv.customerName}"`,
                    `"${inv.paymentMethod}"`,
                    inv.totalAmount,
                    `"${inv.status}"`
                ]),
                [],
                ['Payment Collections Breakdown'],
                ['Payment Date', 'Invoice #', 'Customer', 'Method', `Amount (${activeCurrencyCode})`],
                ...(da.payments || []).map(p => [
                    `"${formatDisplayDate(p.date)}"`,
                    `"${p.invoiceNumber}"`,
                    `"${p.customer}"`,
                    `"${p.method}"`,
                    p.amount
                ]),
                [],
                ['Daily Expenses & Cash Outflows'],
                ['Title', 'Category', `Amount (${activeCurrencyCode})`, 'Description'],
                ...(da.expenses || []).map(e => [
                    `"${e.title}"`,
                    `"${e.category}"`,
                    e.amount,
                    `"${e.description || '—'}"`
                ])
            ];
        } else {
            // Dashboard Export
            const kpis = reportData.dashboard.kpis;
            csvRows = [
                ['KPI Metric', `Value (${activeCurrencyCode} where applicable)`],
                ['Total Sales', kpis.totalSales],
                ['Total Invoices', kpis.totalInvoices],
                ['Total Items Sold', kpis.totalItemsSold],
                ['Total Discount', kpis.totalDiscount],
                ['Total Tax', kpis.totalTax],
                ['Net Sales (Subtotal)', kpis.netSales],
                ['Average Bill Value', kpis.avgBillValue],
                ['Total Purchase Cost', kpis.totalCost],
                ['Gross Profit', kpis.grossProfit],
                ['Profit Margin %', `${kpis.profitMargin}%`],
                [],
                ['Payment Method', `Amount (${activeCurrencyCode})`, 'Count', 'Share %'],
                ...reportData.dashboard.paymentSummary.map(p => [
                    `"${p.method}"`, p.amount, p.count, `${p.percentage}%`
                ]),
                [],
                ['Top Product', 'Product Type', 'Qty Sold', `Revenue (${activeCurrencyCode})`],
                ...reportData.dashboard.topProducts.map(tp => [
                    `"${tp.name}"`, `"${tp.productTypeName}"`, tp.qtySold, tp.salesAmount
                ])
            ];
        }

        const csvContent = csvRows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    };

    const { kpis, paymentSummary, salesTrend, topProducts } = reportData.dashboard;

    return (
        <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
            {/* Top Title & Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm print:hidden">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-primary/10 text-primary font-bold">
                            <FiFileText size={20} style={{ color: theme.primaryColor }} />
                        </span>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Sales Report</h1>
                            <p className="text-slate-500 text-xs mt-0.5">POS Sales Analytics, Invoice Summaries & Item-level Detail</p>
                        </div>
                    </div>
                </div>

                {/* Main Tab Navigation */}
                <div className="flex flex-wrap items-center bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/70 w-full sm:w-auto gap-1">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'dashboard'
                                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                        style={activeTab === 'dashboard' ? { color: theme.primaryColor } : {}}
                    >
                        <FiTrendingUp size={15} /> Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('summary')}
                        className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'summary'
                                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                        style={activeTab === 'summary' ? { color: theme.primaryColor } : {}}
                    >
                        <FiFileText size={15} /> Summary Report
                    </button>
                    <button
                        onClick={() => setActiveTab('detailed')}
                        className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'detailed'
                                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                        style={activeTab === 'detailed' ? { color: theme.primaryColor } : {}}
                    >
                        <FiLayers size={15} /> Detailed Report
                    </button>
                    <button
                        onClick={() => setActiveTab('dailyActivity')}
                        className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'dailyActivity'
                                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                        style={activeTab === 'dailyActivity' ? { color: theme.primaryColor } : {}}
                    >
                        <FiActivity size={15} /> Daily Activity
                    </button>
                </div>
            </div>

            {/* COMMON FILTER BAR */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 print:hidden">
                {/* Mode Selector Toggle: Specific Business Date vs Date Range */}
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date Mode:</span>
                    <button
                        type="button"
                        onClick={() => setDateMode('range')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            dateMode === 'range' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Date Range
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setDateMode('single');
                            setStartDate(singleDate);
                            setEndDate(singleDate);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            dateMode === 'single' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Specific Business Date
                    </button>
                </div>

                {/* Row 1: Dates, Branch, Search & Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                    {dateMode === 'single' ? (
                        /* Single Business Date Selector */
                        <div className="lg:col-span-4">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <FiCalendar size={12} /> Specific Business Date
                                </label>
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    Single Day
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    title="Previous Day"
                                    onClick={() => {
                                        const [y, m, d] = singleDate.split('-').map(Number);
                                        const prev = new Date(y, m - 1, d - 1);
                                        const prevStr = toLocalDateInputString(prev);
                                        setSingleDate(prevStr);
                                        setStartDate(prevStr);
                                        setEndDate(prevStr);
                                    }}
                                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors shrink-0 flex items-center justify-center cursor-pointer shadow-xs"
                                >
                                    ←
                                </button>
                                <input
                                    type="date"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary transition-all font-bold"
                                    value={singleDate}
                                    onChange={e => {
                                        setSingleDate(e.target.value);
                                        setStartDate(e.target.value);
                                        setEndDate(e.target.value);
                                    }}
                                />
                                <button
                                    type="button"
                                    title="Next Day"
                                    onClick={() => {
                                        const [y, m, d] = singleDate.split('-').map(Number);
                                        const next = new Date(y, m - 1, d + 1);
                                        const nextStr = toLocalDateInputString(next);
                                        setSingleDate(nextStr);
                                        setStartDate(nextStr);
                                        setEndDate(nextStr);
                                    }}
                                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors shrink-0 flex items-center justify-center cursor-pointer shadow-xs"
                                >
                                    →
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* From Date */}
                            <div className="lg:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                                    <FiCalendar size={12} /> From Date
                                </label>
                                <input
                                    type="date"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                />
                            </div>

                            {/* To Date */}
                            <div className="lg:col-span-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                                    <FiCalendar size={12} /> To Date
                                </label>
                                <input
                                    type="date"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* Branch Filter (for Admin) */}
                    {user?.role === 'admin' ? (
                        <div className="lg:col-span-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                Branch
                            </label>
                            <SearchableSelect
                                options={[
                                    { label: 'All Branches', value: 'all' },
                                    ...branches.map(b => ({ label: b.name, value: b.id }))
                                ]}
                                value={selectedBranch}
                                onChange={val => setSelectedBranch(val)}
                                direction="down"
                                triggerClassName="h-10 px-3 border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-white font-medium"
                                placeholder="All Branches"
                            />
                        </div>
                    ) : (
                        <div className="lg:col-span-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                Branch
                            </label>
                            <div className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 flex items-center font-medium">
                                {activeBranch ? activeBranch.name : 'Current Branch'}
                            </div>
                        </div>
                    )}

                    {/* Search Bar */}
                    <div className="lg:col-span-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                            Search
                        </label>
                        <div className="relative">
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                type="text"
                                placeholder="Search invoice, customer, product..."
                                className="w-full h-10 pl-10 pr-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium placeholder:text-slate-400"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') fetchAnalytics(); }}
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="lg:col-span-2 flex items-center gap-2">
                        <button
                            onClick={fetchAnalytics}
                            disabled={loading}
                            title="Refresh Report"
                            className="h-10 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                        >
                            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                        <button
                            onClick={triggerReportPrint}
                            title="Print Current View"
                            className="h-10 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                            <FiPrinter size={15} />
                            <span className="hidden sm:inline">Print</span>
                        </button>
                        <button
                            onClick={handleExportCSV}
                            title="Export CSV"
                            className="h-10 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                            <FiDownload size={15} />
                            <span className="hidden sm:inline">CSV</span>
                        </button>
                    </div>
                </div>

                {/* Quick Date Presets & Filter Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-400 font-medium text-[11px] mr-1">Quick Range:</span>
                        {(() => {
                            const todayIso = toLocalDateInputString(new Date());
                            const [year, month, day] = todayIso.split('-').map(Number);
                            const yestIso = toLocalDateInputString(new Date(year, month - 1, day - 1));
                            const currentTarget = dateMode === 'single' ? singleDate : (startDate === endDate ? startDate : null);

                            return (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset('today')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            currentTarget === todayIso
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                        }`}
                                    >
                                        Today
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset('yesterday')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            currentTarget === yestIso
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                        }`}
                                    >
                                        Yesterday
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset('this_week')}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                                    >
                                        This Week
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset('this_month')}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                                    >
                                        This Month
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset('last_month')}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                                    >
                                        Last Month
                                    </button>
                                </>
                            );
                        })()}
                    </div>

                    {(() => {
                        const activeCount = [
                            selectedPaymentMethod !== 'all',
                            selectedSalesman !== 'all',
                            selectedStatus !== 'all'
                        ].filter(Boolean).length;
                        return (
                            <button
                                type="button"
                                onClick={() => setShowMoreFilters(!showMoreFilters)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                                    showMoreFilters || activeCount > 0
                                        ? 'bg-primary/10 border-primary/40 text-primary'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                                style={showMoreFilters || activeCount > 0 ? { color: theme.primaryColor, borderColor: `${theme.primaryColor}55` } : {}}
                            >
                                <FiSliders size={13} />
                                <span>{showMoreFilters ? 'Hide Advanced Filters' : 'More Filters'}</span>
                                {activeCount > 0 && (
                                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-600 text-white font-bold">
                                        {activeCount}
                                    </span>
                                )}
                            </button>
                        );
                    })()}
                </div>

                {/* Expandable Advanced Filters */}
                {showMoreFilters && (
                    <div className="pt-3 border-t border-slate-100 bg-slate-50/70 p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <FiSliders size={13} className="text-primary" style={{ color: theme.primaryColor }} />
                                Advanced Filters
                            </span>
                            {(selectedPaymentMethod !== 'all' || selectedSalesman !== 'all' || selectedStatus !== 'all' || searchTerm.trim()) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedPaymentMethod('all');
                                        setSelectedSalesman('all');
                                        setSelectedStatus('all');
                                        setSearchTerm('');
                                    }}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                                >
                                    <FiX size={13} /> Reset All Filters
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Payment Method Filter */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                    Payment Method
                                </label>
                                <select
                                    className="w-full h-9 px-3 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                    value={selectedPaymentMethod}
                                    onChange={e => setSelectedPaymentMethod(e.target.value)}
                                >
                                    <option value="all">All Payment Methods</option>
                                    <option value="Cash">Cash</option>
                                    <option value="UPI">UPI</option>
                                    <option value="Card">Card</option>
                                    <option value="Credit">Credit</option>
                                    <option value="Split">Split</option>
                                    <option value="Bank">Bank Transfer</option>
                                    <option value="Cheque">Cheque</option>
                                </select>
                            </div>

                            {/* Salesman Filter */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                    Salesman / Cashier
                                </label>
                                <select
                                    className="w-full h-9 px-3 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                    value={selectedSalesman}
                                    onChange={e => setSelectedSalesman(e.target.value)}
                                >
                                    <option value="all">All Salesmen</option>
                                    <option value="unassigned">Unassigned / System</option>
                                    {salesmen.map(s => (
                                        <option key={s.id} value={s.id}>{s.name || s.username}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Invoice Status Filter */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                    Invoice Status
                                </label>
                                <select
                                    className="w-full h-9 px-3 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                    value={selectedStatus}
                                    onChange={e => setSelectedStatus(e.target.value)}
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="active">Active Sales (Completed)</option>
                                    <option value="return">Returns Only</option>
                                    <option value="cancelled">Void / Cancelled</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 1: SALES DASHBOARD */}
            {/* ========================================================================= */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {/* KPI Cards Grid (10 KPIs) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                        {/* 1. Total Sales */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Sales</span>
                                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><FiDollarSign size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                                    {formatCurrency(kpis.totalSales, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Net Revenue (after returns)</p>
                            </div>
                        </div>

                        {/* 2. Total Invoices */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Invoices</span>
                                <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600"><FiFileText size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">{kpis.totalInvoices}</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Unique active sales bills</p>
                            </div>
                        </div>

                        {/* 3. Items Sold */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Items Sold</span>
                                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600"><FiShoppingBag size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">{kpis.totalItemsSold}</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Total product units</p>
                            </div>
                        </div>

                        {/* 4. Total Discount */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Discount</span>
                                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600"><FiTag size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                                    {formatCurrency(kpis.totalDiscount, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Customer discounts given</p>
                            </div>
                        </div>

                        {/* 5. Total Tax */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Tax</span>
                                <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600"><FiPercent size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                                    {formatCurrency(kpis.totalTax, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Collected GST / VAT</p>
                            </div>
                        </div>

                        {/* 6. Net Sales (Subtotal) */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Sales (Subtotal)</span>
                                <span className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600"><FiLayers size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                                    {formatCurrency(kpis.netSales, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Pre-tax subtotal</p>
                            </div>
                        </div>

                        {/* 7. Average Bill Value */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Bill Value</span>
                                <span className="p-1.5 rounded-lg bg-teal-50 text-teal-600"><FiTrendingUp size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                                    {formatCurrency(kpis.avgBillValue, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Sales / Invoice count</p>
                            </div>
                        </div>

                        {/* 8. Total Cost */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Purchase Cost</span>
                                <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600"><FiBox size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
                                    {formatCurrency(kpis.totalCost, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">COGS from inventory cost</p>
                            </div>
                        </div>

                        {/* 9. Gross Profit */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Profit</span>
                                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><FiArrowUpRight size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className={`text-xl sm:text-2xl font-black tabular-nums ${kpis.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {formatCurrency(kpis.grossProfit, activeCurrencyCode)}
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Total Sales - Total Cost</p>
                            </div>
                        </div>

                        {/* 10. Profit Margin */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Profit Margin</span>
                                <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600"><FiPieChart size={16} /></span>
                            </div>
                            <div className="mt-2">
                                <h3 className={`text-xl sm:text-2xl font-black tabular-nums ${kpis.profitMargin >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                                    {kpis.profitMargin}%
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Gross Profit / Sales %</p>
                            </div>
                        </div>
                    </div>

                    {/* Sales Trend Chart */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-800">Sales Performance Trend</h3>
                                <p className="text-xs text-slate-400">Daily sales revenue timeline for the selected range</p>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
                                {salesTrend.length} Days Active
                            </span>
                        </div>
                        <div className="h-72 w-full">
                            {salesTrend.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                                    No sales trend recorded for this period
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={theme.primaryColor || '#10b981'} stopOpacity={0.4} />
                                                <stop offset="95%" stopColor={theme.primaryColor || '#10b981'} stopOpacity={0.0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => `${activeCurrencySymbol}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                                        <Tooltip
                                            formatter={(value) => [formatCurrency(parseFloat(value) || 0, activeCurrencyCode), 'Sales Revenue']}
                                            labelFormatter={(label) => `Date: ${label}`}
                                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                        />
                                        <Area type="monotone" dataKey="sales" stroke={theme.primaryColor || '#10b981'} strokeWidth={2.5} fillOpacity={1} fill="url(#salesGradient)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* 2 Columns: Payment Summary & Top Products */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Payment Breakdown */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800">Payment Summary</h3>
                                        <p className="text-xs text-slate-400">Breakdown of collections by tender method</p>
                                    </div>
                                    <span className="p-2 rounded-xl bg-slate-100 text-slate-500"><FiCreditCard size={18} /></span>
                                </div>
                                <div className="space-y-3">
                                    {paymentSummary.length === 0 ? (
                                        <p className="text-slate-400 text-sm italic text-center py-8">No payments recorded</p>
                                    ) : (
                                        paymentSummary.map(p => (
                                            <div key={p.method} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-2">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-slate-800 flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-primary" style={{ backgroundColor: theme.primaryColor }}></span>
                                                        {p.method}
                                                    </span>
                                                    <div className="text-right">
                                                        <span className="font-extrabold text-slate-900 tabular-nums">
                                                            {formatCurrency(p.amount, activeCurrencyCode)}
                                                        </span>
                                                        <span className="text-xs text-slate-400 ml-2 font-medium">({p.percentage}%)</span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min(100, p.percentage)}%`, backgroundColor: theme.primaryColor }}></div>
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-medium">
                                                    {p.count} transaction{p.count === 1 ? '' : 's'} recorded
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Top Selling Products */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800">Top Selling Products</h3>
                                        <p className="text-xs text-slate-400">Consolidated at product level across all sizes</p>
                                    </div>
                                    <span className="p-2 rounded-xl bg-slate-100 text-slate-500"><FiShoppingBag size={18} /></span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                                <th className="py-2.5 text-left">Product</th>
                                                <th className="py-2.5 text-left">Type</th>
                                                <th className="py-2.5 text-center">Qty Sold</th>
                                                <th className="py-2.5 text-right">Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {topProducts.length === 0 ? (
                                                <tr>
                                                    <td colSpan="4" className="text-center py-8 text-slate-400 italic">No products sold in this period</td>
                                                </tr>
                                            ) : (
                                                topProducts.map((tp, idx) => (
                                                    <tr key={`tp-${tp.productId || 'p'}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                                        <td className="py-3 font-semibold text-slate-800">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                                                                    {idx + 1}
                                                                </span>
                                                                <span className="truncate max-w-[160px]" title={tp.name}>{tp.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3">
                                                            {tp.productTypeName && tp.productTypeName !== '—' ? (
                                                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px] border border-indigo-100">
                                                                    {tp.productTypeName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 text-center font-bold text-slate-700">{tp.qtySold}</td>
                                                        <td className="py-3 text-right font-extrabold text-slate-900 tabular-nums">
                                                            {formatCurrency(tp.salesAmount, activeCurrencyCode)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION 2: SUMMARY REPORT (INVOICE-LEVEL) */}
            {/* ========================================================================= */}
            {activeTab === 'summary' && (
                <div className="space-y-4">
                    {/* Summary Metric Header Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Invoices</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{reportData.summaryTotals.totalInvoices}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Items Qty</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{reportData.summaryTotals.totalItems}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Subtotal</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{formatCurrency(reportData.summaryTotals.subTotal, activeCurrencyCode)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Discount</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{formatCurrency(reportData.summaryTotals.totalDiscount, activeCurrencyCode)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tax</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{formatCurrency(reportData.summaryTotals.totalTax, activeCurrencyCode)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Net Sales Total</span>
                            <p className="text-base font-black text-emerald-600 mt-0.5">{formatCurrency(reportData.summaryTotals.netSales, activeCurrencyCode)}</p>
                        </div>
                    </div>

                    {/* Invoice Table Container */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left" style={{ minWidth: '1000px' }}>
                                <thead>
                                    <tr className="bg-slate-50/75 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                        <th className="p-3.5">Invoice #</th>
                                        <th className="p-3.5">Date</th>
                                        <th className="p-3.5">Customer</th>
                                        <th className="p-3.5">Salesman / Cashier</th>
                                        <th className="p-3.5">Payment Method</th>
                                        <th className="p-3.5 text-right">Subtotal</th>
                                        <th className="p-3.5 text-right">Discount</th>
                                        <th className="p-3.5 text-right">Tax</th>
                                        <th className="p-3.5 text-right">Total</th>
                                        <th className="p-3.5 text-center">Status</th>
                                        <th className="p-3.5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedSummary.length === 0 ? (
                                        <tr>
                                            <td colSpan="11" className="text-center py-12 text-slate-400 italic">
                                                {loading ? 'Fetching sales summary records...' : 'No invoices found matching criteria'}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedSummary.map((sale, idx) => (
                                            <tr key={`sale-${sale.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="p-3.5 font-bold text-primary whitespace-nowrap" style={{ color: theme.primaryColor }}>
                                                    #{sale.invoiceNumber}
                                                </td>
                                                <td className="p-3.5 text-slate-600 whitespace-nowrap">
                                                    {formatDisplayDate(sale.saleDate)}
                                                </td>
                                                <td className="p-3.5">
                                                    <p className="font-semibold text-slate-800 leading-snug">{sale.customer?.name || 'Walk-in Profile'}</p>
                                                    <p className="text-[10px] text-slate-400">{sale.customer?.phone || '—'}</p>
                                                </td>
                                                <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">
                                                    {sale.salesman?.name || 'System'}
                                                </td>
                                                <td className="p-3.5 whitespace-nowrap">
                                                    {/* CRITICAL: Aggregated payment method pill with breakdown */}
                                                    <div className="flex flex-wrap gap-1 items-center">
                                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200">
                                                            {sale.paymentMethodDisplay}
                                                        </span>
                                                        {sale.payments && sale.payments.length > 1 && (
                                                            <div className="flex items-center gap-1 text-[9px] text-slate-400 ml-1">
                                                                {sale.payments.map((p, pIdx) => (
                                                                    <span key={pIdx} className="bg-slate-50 px-1 rounded text-slate-500">
                                                                        {p.method}: {formatCurrency(p.amount, activeCurrencyCode)}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3.5 text-right font-medium text-slate-700 tabular-nums">
                                                    {formatCurrency(sale.subTotal, activeCurrencyCode)}
                                                </td>
                                                <td className="p-3.5 text-right font-medium text-amber-600 tabular-nums">
                                                    {sale.discount > 0 ? formatCurrency(sale.discount, activeCurrencyCode) : '—'}
                                                </td>
                                                <td className="p-3.5 text-right font-medium text-slate-700 tabular-nums">
                                                    {sale.taxAmount > 0 ? formatCurrency(sale.taxAmount, activeCurrencyCode) : '—'}
                                                </td>
                                                <td className="p-3.5 text-right font-extrabold text-slate-900 tabular-nums">
                                                    {formatCurrency(sale.totalAmount, activeCurrencyCode)}
                                                </td>
                                                <td className="p-3.5 text-center whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                                        sale.status === 'cancelled'
                                                            ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                                            : (sale.isReturn ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100')
                                                    }`}>
                                                        {sale.status === 'cancelled' ? 'Void' : (sale.isReturn ? 'Return' : 'Active')}
                                                    </span>
                                                </td>
                                                <td className="p-3.5 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => setSelectedSale(sale)}
                                                            title="View Invoice Details"
                                                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors"
                                                        >
                                                            <FiEye size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => triggerInvoicePrint(sale)}
                                                            title="Print Invoice"
                                                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white transition-colors"
                                                        >
                                                            <FiPrinter size={13} />
                                                        </button>
                                                        {user?.role === 'admin' && sale.status !== 'cancelled' && (
                                                            <button
                                                                onClick={() => handleCancelClick(sale)}
                                                                title="Cancel/Void Invoice"
                                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white transition-colors"
                                                            >
                                                                <FiX size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                            <span className="text-slate-500 font-medium">
                                Showing {paginatedSummary.length} of {filteredSummary.length} invoices
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={summaryPage === 1}
                                    onClick={() => setSummaryPage(p => Math.max(1, p - 1))}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 font-semibold"
                                >
                                    Previous
                                </button>
                                <span className="font-bold text-slate-700">
                                    Page {summaryPage} of {Math.max(1, Math.ceil(filteredSummary.length / pageSize))}
                                </span>
                                <button
                                    disabled={summaryPage >= Math.ceil(filteredSummary.length / pageSize)}
                                    onClick={() => setSummaryPage(p => p + 1)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 font-semibold"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION 3: DETAILED REPORT (LINE-ITEM LEVEL) */}
            {/* ========================================================================= */}
            {activeTab === 'detailed' && (
                <div className="space-y-4">
                    {/* Detailed Metric Header Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Sales Lines</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{filteredDetailed.length}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Units Sold</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{detailedTotals.totalQty}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Revenue</span>
                            <p className="text-base font-extrabold text-slate-900 mt-0.5">{formatCurrency(detailedTotals.totalSales, activeCurrencyCode)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Profit</span>
                            <p className="text-base font-extrabold text-emerald-600 mt-0.5">{formatCurrency(detailedTotals.totalProfit, activeCurrencyCode)}</p>
                        </div>
                    </div>

                    {/* Detailed Line Items Table */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left" style={{ minWidth: '1200px' }}>
                                <thead>
                                    <tr className="bg-slate-50/75 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                        <th className="p-3">Invoice #</th>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Customer</th>
                                        <th className="p-3">Product Name</th>
                                        <th className="p-3">Product Type</th>
                                        <th className="p-3">Gender</th>
                                        <th className="p-3 text-center">Size</th>
                                        <th className="p-3">Barcode</th>
                                        <th className="p-3 text-center">Qty</th>
                                        <th className="p-3 text-right">Selling Price</th>
                                        <th className="p-3 text-right">Discount</th>
                                        <th className="p-3 text-right">Tax</th>
                                        <th className="p-3 text-right">Line Total</th>
                                        <th className="p-3 text-right">Unit Cost</th>
                                        <th className="p-3 text-right">Line Profit</th>
                                        <th className="p-3">Payment</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedDetailed.length === 0 ? (
                                        <tr>
                                            <td colSpan="16" className="text-center py-12 text-slate-400 italic">
                                                {loading ? 'Fetching line items...' : 'No sales line items found matching criteria'}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedDetailed.map((row, idx) => (
                                            <tr key={`det-${row.id || 'r'}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="p-3 font-bold text-primary whitespace-nowrap" style={{ color: theme.primaryColor }}>
                                                    #{row.invoiceNumber}
                                                </td>
                                                <td className="p-3 text-slate-600 whitespace-nowrap">
                                                    {formatDisplayDate(row.saleDate)}
                                                </td>
                                                <td className="p-3 font-medium text-slate-800 whitespace-nowrap">
                                                    {row.customerName}
                                                </td>
                                                <td className="p-3 font-bold text-slate-800">
                                                    {row.productName}
                                                </td>
                                                <td className="p-3 whitespace-nowrap">
                                                    {row.productTypeName && row.productTypeName !== '—' ? (
                                                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px] border border-indigo-100">
                                                            {row.productTypeName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-slate-500 whitespace-nowrap">
                                                    {row.gender || '—'}
                                                </td>
                                                <td className="p-3 text-center whitespace-nowrap">
                                                    {/* CRITICAL: exact size or '—' if no size variant */}
                                                    {row.size && row.size !== '—' ? (
                                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-extrabold border border-slate-200">
                                                            {row.size}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 font-medium">—</span>
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                                                    {row.barcode || '—'}
                                                </td>
                                                <td className="p-3 text-center font-bold text-slate-900">
                                                    {row.quantity}
                                                </td>
                                                <td className="p-3 text-right font-medium text-slate-800 tabular-nums">
                                                    {formatCurrency(row.unitPrice, activeCurrencyCode)}
                                                </td>
                                                <td className="p-3 text-right font-medium text-amber-600 tabular-nums">
                                                    {row.discountAmount > 0 ? formatCurrency(row.discountAmount, activeCurrencyCode) : '—'}
                                                </td>
                                                <td className="p-3 text-right font-medium text-slate-700 tabular-nums">
                                                    {row.taxAmount > 0 ? formatCurrency(row.taxAmount, activeCurrencyCode) : '—'}
                                                </td>
                                                <td className="p-3 text-right font-extrabold text-slate-900 tabular-nums">
                                                    {formatCurrency(row.lineTotal, activeCurrencyCode)}
                                                </td>
                                                <td className="p-3 text-right font-medium text-slate-600 tabular-nums">
                                                    {row.purchaseCost !== null ? formatCurrency(row.purchaseCost, activeCurrencyCode) : '—'}
                                                </td>
                                                <td className={`p-3 text-right font-bold tabular-nums ${row.profit !== null && row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {row.profit !== null ? formatCurrency(row.profit, activeCurrencyCode) : '—'}
                                                </td>
                                                <td className="p-3 whitespace-nowrap text-slate-600">
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium">
                                                        {row.paymentMethod}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                            <span className="text-slate-500 font-medium">
                                Showing {paginatedDetailed.length} of {filteredDetailed.length} line items
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={detailedPage === 1}
                                    onClick={() => setDetailedPage(p => Math.max(1, p - 1))}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 font-semibold"
                                >
                                    Previous
                                </button>
                                <span className="font-bold text-slate-700">
                                    Page {detailedPage} of {Math.max(1, Math.ceil(filteredDetailed.length / pageSize))}
                                </span>
                                <button
                                    disabled={detailedPage >= Math.ceil(filteredDetailed.length / pageSize)}
                                    onClick={() => setDetailedPage(p => p + 1)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 font-semibold"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION 4: DAILY ACTIVITY INSPECTION (SINGLE BUSINESS DATE) */}
            {/* ========================================================================= */}
            {activeTab === 'dailyActivity' && (
                <div className="space-y-6">
                    {dateMode !== 'single' ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3 text-amber-600">
                                <FiCalendar size={24} />
                            </div>
                            <h3 className="text-base font-bold text-amber-900 mb-1">Single Business Date Required</h3>
                            <p className="text-xs text-amber-700 max-w-md mx-auto mb-4">
                                Daily Activity Inspection provides a comprehensive single-day operational audit including sessions, invoices, cancellations, refunds, cash movements, and stock ledger.
                            </p>
                            <button
                                onClick={() => {
                                    setDateMode('single');
                                    setStartDate(singleDate);
                                    setEndDate(singleDate);
                                }}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                            >
                                Switch to Specific Business Date ({singleDate})
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 1. Day Opening & Closing Session Banner */}
                            {reportData?.dailyActivity?.dayCloseRecord ? (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                                <FiLock size={20} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-bold text-slate-800">
                                                        Business Day Session: {formatDisplayDate(reportData.dailyActivity.businessDate)}
                                                    </h3>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                                        reportData.dailyActivity.dayCloseRecord.status === 'CLOSED' || reportData.dailyActivity.dayCloseRecord.status === 'ADMIN_CLOSED'
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            : (reportData.dailyActivity.dayCloseRecord.status === 'OPEN' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-amber-100 text-amber-800 border border-amber-200')
                                                    }`}>
                                                        {reportData.dailyActivity.dayCloseRecord.status}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500">
                                                    Official Register & Shift Session Records
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={triggerReportPrint}
                                                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
                                            >
                                                <FiPrinter size={13} /> Print Daily Report
                                            </button>
                                            <button
                                                onClick={() => router.push('/settings/day-close')}
                                                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-xs"
                                            >
                                                Day Close Console &rarr;
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Opening Amount</span>
                                            <span className="text-sm font-extrabold text-slate-800 mt-0.5 block">
                                                {formatCurrency(reportData.dailyActivity.dayCloseRecord.actualOpeningCash ?? reportData.dailyActivity.dayCloseRecord.openingCash ?? reportData.dailyActivity.openingAmount ?? 0, activeCurrencyCode)}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                By: {reportData.dailyActivity.dayCloseRecord.openedBy || 'System'}
                                            </span>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Expected Closing</span>
                                            <span className="text-sm font-extrabold text-slate-800 mt-0.5 block">
                                                {formatCurrency(reportData.dailyActivity.dayCloseRecord.closingExpectedCash ?? reportData.dailyActivity.closingExpectedCash ?? 0, activeCurrencyCode)}
                                            </span>
                                            <span className="text-[10px] text-slate-500">System register formula</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Closing Amount</span>
                                            <span className="text-sm font-extrabold text-slate-800 mt-0.5 block">
                                                {formatCurrency(reportData.dailyActivity.dayCloseRecord.closingActualCash ?? reportData.dailyActivity.dayCloseRecord.closingExpectedCash ?? reportData.dailyActivity.closingAmount ?? 0, activeCurrencyCode)}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {reportData.dailyActivity.dayCloseRecord.status === 'CLOSED' || reportData.dailyActivity.dayCloseRecord.status === 'ADMIN_CLOSED'
                                                    ? 'Counted & closed'
                                                    : 'Estimated closing'}
                                            </span>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Closing Discrepancy</span>
                                            <span className={`text-sm font-extrabold mt-0.5 block ${
                                                Number(reportData.dailyActivity.dayCloseRecord.closingDifference ?? reportData.dailyActivity.dayCloseRecord.cashDifference ?? 0) === 0
                                                    ? 'text-emerald-600'
                                                    : 'text-rose-600'
                                            }`}>
                                                {Number(reportData.dailyActivity.dayCloseRecord.closingDifference ?? reportData.dailyActivity.dayCloseRecord.cashDifference ?? 0) > 0 ? '+' : ''}
                                                {formatCurrency(reportData.dailyActivity.dayCloseRecord.closingDifference ?? reportData.dailyActivity.dayCloseRecord.cashDifference ?? 0, activeCurrencyCode)}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {Number(reportData.dailyActivity.dayCloseRecord.closingDifference ?? reportData.dailyActivity.dayCloseRecord.cashDifference ?? 0) === 0 ? 'Balanced' : 'Discrepancy logged'}
                                            </span>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Closed By</span>
                                            <span className="text-xs font-bold text-slate-800 mt-0.5 block truncate">
                                                {reportData.dailyActivity.dayCloseRecord.closedBy || '—'}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {reportData.dailyActivity.dayCloseRecord.closedAt || reportData.dailyActivity.dayCloseRecord.closingTime ? new Date(reportData.dailyActivity.dayCloseRecord.closedAt || reportData.dailyActivity.dayCloseRecord.closingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </span>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remarks</span>
                                            <span className="text-xs text-slate-600 mt-0.5 block line-clamp-2" title={reportData.dailyActivity.dayCloseRecord.remarks || reportData.dailyActivity.dayCloseRecord.notes}>
                                                {reportData.dailyActivity.dayCloseRecord.remarks || reportData.dailyActivity.dayCloseRecord.notes || 'No closing notes'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <FiAlertTriangle className="text-amber-600 shrink-0" size={20} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm">No Day Session Record Found for {formatDisplayDate(singleDate)}</span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                                    Not Registered
                                                </span>
                                            </div>
                                            <p className="text-xs text-amber-700">This business date has not been formally opened or closed in the POS register.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-amber-200 text-xs shadow-2xs">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Opening Amount</span>
                                            <span className="font-black text-slate-800">
                                                {formatCurrency(reportData.dailyActivity?.openingAmount || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                        <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-amber-200 text-xs shadow-2xs">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Closing Amount</span>
                                            <span className="font-black text-indigo-700">
                                                {formatCurrency(reportData.dailyActivity?.closingAmount || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => router.push('/settings/day-close')}
                                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all shadow-xs"
                                        >
                                            Open Day Close &rarr;
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 2. Operations KPI Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Opening Amount</span>
                                    <p className="text-lg font-black text-slate-800 mt-0.5">
                                        {formatCurrency(
                                            reportData.dailyActivity?.openingAmount ??
                                            reportData.dailyActivity?.dayCloseRecord?.actualOpeningCash ??
                                            reportData.dailyActivity?.dayCloseRecord?.openingCash ?? 0,
                                            activeCurrencyCode
                                        )}
                                    </p>
                                    <span className="text-[10px] text-slate-400 block truncate">
                                        {reportData.dailyActivity?.dayCloseRecord?.openedBy ? `By: ${reportData.dailyActivity.dayCloseRecord.openedBy}` : 'Register opening'}
                                    </span>
                                </div>
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Sales</span>
                                    <p className="text-lg font-black text-emerald-700 mt-0.5">
                                        {formatCurrency(reportData.dashboard?.kpis?.totalSales || 0, activeCurrencyCode)}
                                    </p>
                                    <span className="text-[10px] text-slate-400 block">Gross revenue</span>
                                </div>
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Closing Amount</span>
                                    <p className="text-lg font-black text-indigo-700 mt-0.5">
                                        {formatCurrency(
                                            reportData.dailyActivity?.closingAmount ??
                                            reportData.dailyActivity?.dayCloseRecord?.closingActualCash ??
                                            reportData.dailyActivity?.dayCloseRecord?.closingExpectedCash ?? 0,
                                            activeCurrencyCode
                                        )}
                                    </p>
                                    <span className="text-[10px] text-slate-400 block truncate">
                                        {reportData.dailyActivity?.dayCloseRecord?.status === 'CLOSED' || reportData.dailyActivity?.dayCloseRecord?.status === 'ADMIN_CLOSED'
                                            ? 'Actual closed cash'
                                            : 'Expected closing'}
                                    </span>
                                </div>
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Daily Expenses</span>
                                    <p className="text-lg font-black text-slate-800 mt-0.5">
                                        {formatCurrency(
                                            reportData.dailyActivity?.totalExpensesAmount ??
                                            (reportData.dailyActivity?.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0),
                                            activeCurrencyCode
                                        )}
                                    </p>
                                    <span className="text-[10px] text-slate-400 block">
                                        {reportData.dailyActivity?.counts?.expensesCount || 0} bills logged
                                    </span>
                                </div>
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoices</span>
                                    <p className="text-lg font-black text-slate-800 mt-0.5">{reportData.dailyActivity?.counts?.totalInvoicesCount || 0}</p>
                                    <span className="text-[10px] text-slate-400 block">Created today</span>
                                </div>
                                <div className={`p-3.5 rounded-2xl border shadow-xs ${
                                    (reportData.dailyActivity?.counts?.cancelledCount || 0) > 0 ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-slate-100'
                                }`}>
                                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">Cancelled Invoices</span>
                                    <p className="text-lg font-black text-rose-700 mt-0.5">{reportData.dailyActivity?.counts?.cancelledCount || 0}</p>
                                    <span className="text-[10px] text-rose-400 block">Voided / Cancelled</span>
                                </div>
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sales Returns</span>
                                    <p className="text-lg font-black text-amber-700 mt-0.5">{reportData.dailyActivity?.counts?.returnsCount || 0}</p>
                                    <span className="text-[10px] text-slate-400 block">Credit notes / returns</span>
                                </div>
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">GST Collection</span>
                                    <p className="text-lg font-black text-indigo-700 mt-0.5">
                                        {formatCurrency(reportData.dailyActivity?.gstSummary?.totalTax || 0, activeCurrencyCode)}
                                    </p>
                                    <span className="text-[10px] text-slate-400 block">CGST + SGST + IGST</span>
                                </div>
                            </div>

                            {/* 3. Sub-domain Tabs */}
                            <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80">
                                {[
                                    { id: 'all', label: 'All Operations' },
                                    { id: 'invoices', label: `Invoices (${reportData.dailyActivity?.invoices?.length || 0})` },
                                    { id: 'cancelled', label: `Cancelled (${reportData.dailyActivity?.cancelledInvoices?.length || 0})`, alert: (reportData.dailyActivity?.cancelledInvoices?.length || 0) > 0 },
                                    { id: 'returns', label: `Returns (${reportData.dailyActivity?.returns?.length || 0})` },
                                    { id: 'payments', label: `Payments (${reportData.dailyActivity?.payments?.length || 0})` },
                                    { id: 'expenses', label: `Expenses (${reportData.dailyActivity?.expenses?.length || 0})` },
                                    { id: 'stock', label: `Stock Movements (${reportData.dailyActivity?.stockMovements?.length || 0})` },
                                    { id: 'gst', label: 'GST Tax Summary' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDailySection(tab.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                            dailySection === tab.id
                                                ? 'bg-white text-slate-900 shadow-xs'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                        } ${tab.alert && dailySection !== tab.id ? 'text-rose-600 font-extrabold' : ''}`}
                                    >
                                        {tab.alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>}
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Sub-domain Content Sections */}

                            {/* DOMAIN A: INVOICES REGISTER */}
                            {(dailySection === 'all' || dailySection === 'invoices') && (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3.5 bg-slate-50/75 border-b border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FiFileText className="text-emerald-600" size={16} />
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                Invoices Register ({reportData.dailyActivity?.invoices?.length || 0})
                                            </h4>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                                                    <th className="p-3">Invoice #</th>
                                                    <th className="p-3">Time</th>
                                                    <th className="p-3">Customer</th>
                                                    <th className="p-3">Payment Method</th>
                                                    <th className="p-3 text-right">Amount</th>
                                                    <th className="p-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {!reportData.dailyActivity?.invoices || reportData.dailyActivity.invoices.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="p-6 text-center text-slate-400 italic">No invoices created for this business date</td>
                                                    </tr>
                                                ) : (
                                                    reportData.dailyActivity.invoices.map((inv, idx) => (
                                                        <tr key={`inv-${inv.id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                                            <td className="p-3 font-bold text-slate-900">#{inv.invoiceNumber}</td>
                                                            <td className="p-3 text-slate-500 font-medium">
                                                                {new Date(inv.saleDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="p-3 font-semibold text-slate-700">{inv.customerName || 'Walk-in'}</td>
                                                            <td className="p-3">
                                                                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-[10px] text-slate-700">
                                                                    {inv.paymentMethod}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-right font-black text-slate-900 tabular-nums">
                                                                {formatCurrency(inv.totalAmount, activeCurrencyCode)}
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                    inv.status === 'cancelled'
                                                                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                                                        : (inv.isReturn ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')
                                                                }`}>
                                                                    {inv.status === 'cancelled' ? 'Cancelled' : (inv.isReturn ? 'Return' : 'Active')}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* DOMAIN B: CANCELLED INVOICES AUDIT */}
                            {(dailySection === 'all' || dailySection === 'cancelled') && (
                                <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3.5 bg-rose-50/80 border-b border-rose-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FiAlertTriangle className="text-rose-600" size={16} />
                                            <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                                                Cancelled Invoices Audit ({reportData.dailyActivity?.cancelledInvoices?.length || 0})
                                            </h4>
                                        </div>
                                        <span className="text-[10px] font-bold text-rose-600 bg-white px-2 py-0.5 rounded-full border border-rose-200">
                                            Audit Preserved
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="bg-rose-50/40 text-slate-500 uppercase text-[10px] font-bold border-b border-rose-100">
                                                    <th className="p-3">Invoice #</th>
                                                    <th className="p-3">Original Date/Time</th>
                                                    <th className="p-3 text-right">Original Amount</th>
                                                    <th className="p-3">Cancelled By</th>
                                                    <th className="p-3">Cancelled Timestamp</th>
                                                    <th className="p-3">Reason for Cancellation</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-rose-50">
                                                {!reportData.dailyActivity?.cancelledInvoices || reportData.dailyActivity.cancelledInvoices.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="p-6 text-center text-slate-400 italic">No cancelled invoices for this business date</td>
                                                    </tr>
                                                ) : (
                                                    reportData.dailyActivity.cancelledInvoices.map((inv, idx) => (
                                                        <tr key={`can-${inv.id}-${idx}`} className="hover:bg-rose-50/30 transition-colors">
                                                            <td className="p-3 font-bold text-rose-700">#{inv.invoiceNumber}</td>
                                                            <td className="p-3 text-slate-500">
                                                                {new Date(inv.saleDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="p-3 text-right font-black text-slate-800 tabular-nums">
                                                                {formatCurrency(inv.originalAmount, activeCurrencyCode)}
                                                            </td>
                                                            <td className="p-3 font-bold text-slate-700">{inv.cancelledBy || 'Admin'}</td>
                                                            <td className="p-3 text-slate-500">
                                                                {inv.cancelledAt ? new Date(inv.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                            </td>
                                                            <td className="p-3 text-rose-800 font-semibold bg-rose-50/50 rounded-lg">
                                                                {inv.cancelReason || 'No reason specified'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* DOMAIN C: SALES RETURNS & REFUNDS */}
                            {(dailySection === 'all' || dailySection === 'returns') && (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3.5 bg-slate-50/75 border-b border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FiRefreshCw className="text-amber-600" size={16} />
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                Sales Returns & Refunds ({reportData.dailyActivity?.returns?.length || 0})
                                            </h4>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                                                    <th className="p-3">Return #</th>
                                                    <th className="p-3">Ref Invoice #</th>
                                                    <th className="p-3 text-center">Items Returned</th>
                                                    <th className="p-3 text-right">Refund Amount</th>
                                                    <th className="p-3">Refund Method</th>
                                                    <th className="p-3">Return Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {!reportData.dailyActivity?.returns || reportData.dailyActivity.returns.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="p-6 text-center text-slate-400 italic">No sales returns recorded for this business date</td>
                                                    </tr>
                                                ) : (
                                                    reportData.dailyActivity.returns.map((ret, idx) => (
                                                        <tr key={`ret-${ret.id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                                            <td className="p-3 font-bold text-amber-700">#{ret.returnNumber}</td>
                                                            <td className="p-3 font-semibold text-slate-700">#{ret.originalInvoiceNumber}</td>
                                                            <td className="p-3 text-center font-bold text-slate-800">{ret.itemsCount}</td>
                                                            <td className="p-3 text-right font-black text-rose-600 tabular-nums">
                                                                {formatCurrency(ret.totalRefund, activeCurrencyCode)}
                                                            </td>
                                                            <td className="p-3">
                                                                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-[10px] text-slate-700">
                                                                    {ret.refundMethod}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-slate-600">{ret.reason || 'Customer Return'}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* DOMAIN D: PAYMENT COLLECTIONS */}
                            {(dailySection === 'all' || dailySection === 'payments') && (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3.5 bg-slate-50/75 border-b border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FiCreditCard className="text-blue-600" size={16} />
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                Payment Collections Breakdown ({reportData.dailyActivity?.payments?.length || 0})
                                            </h4>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                                                    <th className="p-3">Time</th>
                                                    <th className="p-3">Invoice #</th>
                                                    <th className="p-3">Payment Method</th>
                                                    <th className="p-3 text-right">Amount</th>
                                                    <th className="p-3">Cashier / Staff</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {!reportData.dailyActivity?.payments || reportData.dailyActivity.payments.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="5" className="p-6 text-center text-slate-400 italic">No payments recorded for this business date</td>
                                                    </tr>
                                                ) : (
                                                    reportData.dailyActivity.payments.map((p, idx) => (
                                                        <tr key={`pay-${p.id || 'p'}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                                            <td className="p-3 text-slate-500">
                                                                {new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="p-3 font-bold text-slate-800">#{p.invoiceNumber}</td>
                                                            <td className="p-3">
                                                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-100">
                                                                    {p.method}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-right font-black text-slate-900 tabular-nums">
                                                                {formatCurrency(p.amount, activeCurrencyCode)}
                                                            </td>
                                                            <td className="p-3 text-slate-600 font-semibold">{p.recordedBy || 'System'}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* DOMAIN E: EXPENSES & CASH MOVEMENTS */}
                            {(dailySection === 'all' || dailySection === 'expenses') && (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3.5 bg-slate-50/75 border-b border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FiDollarSign className="text-amber-600" size={16} />
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                Daily Expenses & Cash Movements ({reportData.dailyActivity?.expenses?.length || 0})
                                            </h4>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                                                    <th className="p-3">Time</th>
                                                    <th className="p-3">Expense Title</th>
                                                    <th className="p-3">Category</th>
                                                    <th className="p-3">Tender Mode</th>
                                                    <th className="p-3">Notes</th>
                                                    <th className="p-3 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {!reportData.dailyActivity?.expenses || reportData.dailyActivity.expenses.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" className="p-6 text-center text-slate-400 italic">No business expenses recorded for this business date</td>
                                                    </tr>
                                                ) : (
                                                    reportData.dailyActivity.expenses.map((exp, idx) => (
                                                        <tr key={`exp-${exp.id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                                            <td className="p-3 text-slate-500">
                                                                {new Date(exp.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="p-3 font-bold text-slate-800">{exp.title}</td>
                                                            <td className="p-3 text-slate-600">{exp.category || 'General'}</td>
                                                            <td className="p-3">
                                                                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-[10px]">
                                                                    {exp.paymentMethod || 'Cash'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-slate-500">{exp.notes || '—'}</td>
                                                            <td className="p-3 text-right font-black text-rose-600 tabular-nums">
                                                                {formatCurrency(exp.amount, activeCurrencyCode)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* DOMAIN F: STOCK MOVEMENTS */}
                            {(dailySection === 'all' || dailySection === 'stock') && (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3.5 bg-slate-50/75 border-b border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FiBox className="text-indigo-600" size={16} />
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                Daily Stock Movements ({reportData.dailyActivity?.stockMovements?.length || 0} products)
                                            </h4>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                                                    <th className="p-3">SKU</th>
                                                    <th className="p-3">Product Name</th>
                                                    <th className="p-3 text-center">Units Sold</th>
                                                    <th className="p-3 text-center">Units Returned</th>
                                                    <th className="p-3 text-right">Net Inventory Impact</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {!reportData.dailyActivity?.stockMovements || reportData.dailyActivity.stockMovements.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="5" className="p-6 text-center text-slate-400 italic">No inventory movements recorded for this business date</td>
                                                    </tr>
                                                ) : (
                                                    reportData.dailyActivity.stockMovements.map((sm, idx) => (
                                                        <tr key={`sm-${sm.productId || 'p'}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                                            <td className="p-3 font-mono font-bold text-slate-600">{sm.sku || '—'}</td>
                                                            <td className="p-3 font-semibold text-slate-800">{sm.productName}</td>
                                                            <td className="p-3 text-center font-bold text-slate-700">{sm.unitsSold}</td>
                                                            <td className="p-3 text-center font-bold text-amber-600">{sm.unitsReturned}</td>
                                                            <td className="p-3 text-right font-black tabular-nums">
                                                                <span className={sm.netChange < 0 ? 'text-rose-600' : 'text-slate-800'}>
                                                                    {sm.netChange}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* DOMAIN G: GST SUMMARY */}
                            {(dailySection === 'all' || dailySection === 'gst') && (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <FiPercent className="text-primary" size={18} style={{ color: theme.primaryColor }} />
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                            GST & Tax Summary for {formatDisplayDate(singleDate)}
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Taxable Turnover</span>
                                            <span className="text-base font-extrabold text-slate-900 mt-1 block">
                                                {formatCurrency(reportData.dailyActivity?.gstSummary?.taxableAmount || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">CGST</span>
                                            <span className="text-base font-extrabold text-slate-900 mt-1 block">
                                                {formatCurrency(reportData.dailyActivity?.gstSummary?.cgst || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SGST</span>
                                            <span className="text-base font-extrabold text-slate-900 mt-1 block">
                                                {formatCurrency(reportData.dailyActivity?.gstSummary?.sgst || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">IGST</span>
                                            <span className="text-base font-extrabold text-slate-900 mt-1 block">
                                                {formatCurrency(reportData.dailyActivity?.gstSummary?.igst || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-100">
                                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Total Tax Collected</span>
                                            <span className="text-base font-black text-emerald-800 mt-1 block">
                                                {formatCurrency(reportData.dailyActivity?.gstSummary?.totalTax || 0, activeCurrencyCode)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Rate-wise tax breakdown */}
                                    <div className="mt-4 pt-3 border-t border-slate-100">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                                            Tax Collections by GST Rate Slab
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                            {Object.entries(reportData.dailyActivity?.gstSummary?.rates || {}).map(([rate, amt]) => (
                                                <div key={rate} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex justify-between items-center text-xs">
                                                    <span className="font-bold text-slate-600">{rate}</span>
                                                    <span className="font-extrabold text-slate-900 tabular-nums">
                                                        {formatCurrency(amt, activeCurrencyCode)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* INVOICE DETAIL VIEW MODAL */}
            {/* ========================================================================= */}
            {selectedSale && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedSale(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in duration-200 border border-slate-100" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50/60">
                            <div>
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Invoice Details</span>
                                <h3 className="text-lg font-bold text-slate-900">#{selectedSale.invoiceNumber}</h3>
                            </div>
                            <button onClick={() => setSelectedSale(null)} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-500 transition-colors">
                                <FiX size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-5">
                            {/* Meta Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Date</span>
                                    <span className="font-semibold text-slate-800">{formatDisplayDate(selectedSale.saleDate)}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
                                    <span className="font-semibold text-slate-800">{selectedSale.customer?.name || 'Walk-in Profile'}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Salesman</span>
                                    <span className="font-semibold text-slate-800">{selectedSale.salesman?.name || 'System'}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                        selectedSale.status === 'cancelled'
                                            ? 'bg-rose-100 text-rose-700'
                                            : (selectedSale.isReturn ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')
                                    }`}>
                                        {selectedSale.status === 'cancelled' ? 'Void' : (selectedSale.isReturn ? 'Return' : 'Active')}
                                    </span>
                                </div>
                            </div>

                            {/* Payment Breakdown */}
                            <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                                    Payment Method Breakdown
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {selectedSale.payments && selectedSale.payments.length > 0 ? (
                                        selectedSale.payments.map((p, idx) => (
                                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-primary" style={{ backgroundColor: theme.primaryColor }}></span>
                                                {p.method}: <strong className="text-slate-900">{formatCurrency(p.amount, activeCurrencyCode)}</strong>
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs font-semibold text-slate-700">{selectedSale.paymentMethodDisplay || 'Cash'}</span>
                                    )}
                                </div>
                            </div>

                            {/* Items List */}
                            <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                                    Sold Line Items ({selectedSale.items?.length || 0})
                                </span>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                                            <th className="py-2 text-left">Product</th>
                                            <th className="py-2 text-left">Type / Size</th>
                                            <th className="py-2 text-center">Qty</th>
                                            <th className="py-2 text-right">Price</th>
                                            <th className="py-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {selectedSale.items?.map((item, idx) => (
                                            <tr key={`item-${item.id}-${idx}`}>
                                                <td className="py-2.5 font-semibold text-slate-800">{item.productName}</td>
                                                <td className="py-2.5 text-slate-500">
                                                    {item.productTypeName !== '—' && <span className="font-medium mr-1.5">{item.productTypeName}</span>}
                                                    {item.size && item.size !== '—' && (
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-[10px] text-slate-700">
                                                             {item.size}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 text-center font-bold text-slate-800">{item.quantity}</td>
                                                <td className="py-2.5 text-right font-medium text-slate-700">{formatCurrency(item.unitPrice, activeCurrencyCode)}</td>
                                                <td className="py-2.5 text-right font-bold text-slate-900">{formatCurrency(item.total, activeCurrencyCode)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Financial Summary */}
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                                <div className="flex justify-between text-slate-600">
                                    <span>Subtotal:</span>
                                    <span className="font-medium">{formatCurrency(selectedSale.subTotal, activeCurrencyCode)}</span>
                                </div>
                                {selectedSale.discount > 0 && (
                                    <div className="flex justify-between text-amber-600">
                                        <span>Discount:</span>
                                        <span className="font-medium">-{formatCurrency(selectedSale.discount, activeCurrencyCode)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-slate-600">
                                    <span>Tax Amount:</span>
                                    <span className="font-medium">{formatCurrency(selectedSale.taxAmount, activeCurrencyCode)}</span>
                                </div>
                                <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2 mt-2">
                                    <span>Total Payable:</span>
                                    <span className="text-primary" style={{ color: theme.primaryColor }}>{formatCurrency(selectedSale.totalAmount, activeCurrencyCode)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-50/75 border-t border-slate-100 flex justify-between items-center">
                            <button
                                onClick={() => setSelectedSale(null)}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => triggerInvoicePrint(selectedSale)}
                                className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                            >
                                <FiPrinter size={14} /> Print Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden Professional Invoice for printing */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
                <ProfessionalInvoice
                    ref={componentRef}
                    printData={{ 
                        ...printSale, 
                        currencyCode: printSale?.branch?.currencyCode || activeCurrencyCode,
                        currencySymbol: printSale?.branch?.currencySymbol || activeCurrencySymbol,
                        settings: {
                            ...(printSale?.isReturn ? returnSettings : salesSettings),
                            template: (printSale?.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern'
                        }
                    }}
                    companyProfile={companyProfile}
                />
            </div>

            {/* Cancel Modal (Admin only) */}
            {showCancelModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
                                <FiX size={28} />
                            </div>
                            <h3 className="text-base font-bold text-slate-900 mb-1">Cancel Invoice?</h3>
                            <p className="text-slate-500 text-xs mb-4">This will reverse stock and void accounting entries for #{saleToCancel?.invoiceNumber}.</p>
                            <textarea
                                className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all font-medium text-slate-700 min-h-[70px] mb-4"
                                placeholder="Reason for cancellation..."
                                value={cancelReasonInput}
                                onChange={e => setCancelReasonInput(e.target.value)}
                            ></textarea>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button onClick={() => setShowCancelModal(false)} className="py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-xs hover:bg-slate-200">
                                    Go Back
                                </button>
                                <button onClick={confirmCancel} disabled={loading} className="py-2.5 bg-rose-600 text-white rounded-xl font-semibold text-xs hover:bg-rose-700 disabled:opacity-50">
                                    Cancel Invoice
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
