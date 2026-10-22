import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import {
  FiDollarSign, FiShoppingBag, FiBox, FiUsers, FiTrendingUp, FiArrowUpRight, FiPrinter,
  FiClock, FiCheckCircle, FiAlertTriangle, FiLock, FiSearch, FiLayers, FiX
} from 'react-icons/fi';
import { HiOutlineReceiptRefund } from 'react-icons/hi';
import { TbBusinessplan } from 'react-icons/tb';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'react-toastify';
import DynamicInvoice from '@/components/DynamicInvoice';
import { getCurrencySymbol, normalizeCurrencySymbol, formatAmountWithCurrency } from '@/lib/currency';

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [printSale, setPrintSale] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [branch, setBranch] = useState(null);
  const [invoiceSettings, setInvoiceSettings] = useState(null);
  const componentRef = useRef();

  // Day Opening Modal State
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingActualCash, setOpeningActualCash] = useState('');
  const [openingAddCash, setOpeningAddCash] = useState('0');
  const [openingRemCash, setOpeningRemCash] = useState('0');
  const [openingReason, setOpeningReason] = useState('');
  const [openingRemarks, setOpeningRemarks] = useState('');
  const [submittingOpen, setSubmittingOpen] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchCompanyData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchCompanyData = async () => {
    try {
      const storedUser = localStorage.getItem('user');
      let branchId = null;
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed && !isNaN(parseInt(parsed.branchId))) {
            branchId = parseInt(parsed.branchId);
          }
        } catch (e) {
          console.error("Error parsing stored user", e);
        }
      }

      const [compRes, branchRes] = await Promise.all([
        api.get('/company'),
        branchId ? api.get(`/branches/${branchId}`) : null
      ]);

      if (compRes.data) {
        setCompanyProfile(compRes.data);
      }

      if (branchRes?.data) {
        setBranch(branchRes.data);
      }

      if (branchRes?.data?.invoiceSettings) {
        setInvoiceSettings(branchRes.data.invoiceSettings);
      } else if (compRes.data?.invoiceSettings) {
        setInvoiceSettings(compRes.data.invoiceSettings);
      }
    } catch (err) {
      console.error('Failed to fetch company profile', err);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const storedUser = localStorage.getItem('user');
      let branchId = null;
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed && !isNaN(parseInt(parsed.branchId))) {
            branchId = parseInt(parsed.branchId);
          }
        } catch (e) { console.error(e); }
      }
      const res = await api.get('/dashboard/stats', { params: { branchId } });
      setData(res.data);
      if (storedUser) {
        setUserData(JSON.parse(storedUser));
      }
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
  });

  const triggerPrint = (sale) => {
    setPrintSale(sale);
    toast.loading("Preparing Invoice...", { duration: 1000 });
    setTimeout(() => {
      handlePrint();
    }, 500);
  };

  // Permissions Helper
  const hasAccess = (moduleName) => {
    if (!userData) return false;
    if (userData.role === 'admin') return true;
    return userData.allowedModules?.includes(moduleName);
  };

  const hasItemAccess = (group, item) => {
    if (!userData) return false;
    if (userData.role === 'admin') return true;
    if (userData.allowedModules?.includes(group)) return true;
    return userData.allowedModules?.includes(`${group}:${item}`);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Dashboard...</div>;
  }

  if (!data) return null;

  // If "Screen Layout Only" is enabled, hide stats and just show existing background from Layout.js
  if (companyProfile?.showOnlyLogoOnDashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center pointer-events-none">
        {/* Optional: Add a welcome message or clock if needed, otherwise clean slate */}
      </div>
    );
  }

  const handleOpenDaySubmit = async (e) => {
    e.preventDefault();
    setSubmittingOpen(true);
    try {
      const dm = data?.dayManagement;
      const prevCash = Number(dm?.expectedOpeningCash || 0);
      const addCash = parseFloat(openingAddCash) || 0;
      const remCash = parseFloat(openingRemCash) || 0;
      const actualCash = parseFloat(openingActualCash) || 0;
      const expectedCash = prevCash + addCash - remCash;
      const diff = actualCash - expectedCash;

      if (Math.abs(diff) > 0.01 && !openingReason.trim()) {
        toast.warn(`Please provide an explanation for the opening difference of ₹${diff.toFixed(2)}.`);
        setSubmittingOpen(false);
        return;
      }

      const res = await api.post('/day-close/open', {
        branchId: branch?.id || userData?.branchId,
        previousClosingCash: prevCash,
        additionalCashAdded: addCash,
        cashRemovedBeforeOpening: remCash,
        actualOpeningCash: actualCash,
        openingDiscrepancyReason: openingReason.trim(),
        openingRemarks: openingRemarks.trim()
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'Business day opened successfully!');
        setShowOpenModal(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to open business day');
    } finally {
      setSubmittingOpen(false);
    }
  };

  const dm = data?.dayManagement;
  const isDayOpened = dm && dm.status !== 'NOT_OPENED';
  const isDayClosed = dm && (dm.status === 'CLOSED' || dm.status === 'ADMIN_CLOSED');

  return (
    <div className="space-y-6 md:space-y-8 font-sans relative">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 relative z-10">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-800 tracking-tight">Main Menu</h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">Welcome back, {userData?.name || userData?.username || 'User'}!</p>
        </div>
        <div className="text-xs md:text-sm text-slate-400 font-medium mt-1 md:mt-0">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </header>

      {/* Day Opening & Daily Activity Summary Card */}
      {dm && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
                <FiClock />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800">
                    Business Date: {dm.businessDateDisplay || dm.businessDate || 'Today'}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isDayClosed
                      ? 'bg-slate-100 text-slate-700 border border-slate-200'
                      : isDayOpened
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                  }`}>
                    {dm.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isDayClosed
                    ? 'This business day has been closed.'
                    : isDayOpened
                    ? `Opened at ${dm.openingTime ? new Date(dm.openingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} by ${dm.openedBy || 'Staff'}`
                    : 'Business day has not been opened yet. Please open to begin operations.'}
                </p>
              </div>
            </div>

            {/* Direct Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {!isDayOpened && (
                <button
                  type="button"
                  onClick={() => {
                    setOpeningActualCash(dm.expectedOpeningCash ? dm.expectedOpeningCash.toString() : '0');
                    setShowOpenModal(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FiCheckCircle /> Open Business Day
                </button>
              )}
              {isDayOpened && !isDayClosed && (
                <button
                  type="button"
                  onClick={() => router.push('/settings/day-close')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FiLock /> Verify & Close Day
                </button>
              )}
              {isDayClosed && (
                <button
                  type="button"
                  onClick={() => router.push(`/reports/sales?businessDate=${dm.businessDate}`)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FiEye /> View Closing Report
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push('/settings/day-close')}
                className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-1"
              >
                <FiSearch /> Find Open Days
              </button>
              <button
                type="button"
                onClick={() => router.push('/reports/sales')}
                className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-1"
              >
                <FiTrendingUp /> Sales Report
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Opening Cash</span>
              <p className="font-extrabold text-slate-800">
                {formatAmountWithCurrency(dm.openingCash, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Today's Sales</span>
              <p className="font-extrabold text-emerald-600">
                {formatAmountWithCurrency(data.sales.today, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Today's Orders</span>
              <p className="font-extrabold text-slate-800">{data.sales.todayCount} completed</p>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Cancelled Invoices</span>
              <p className={`font-extrabold ${dm.todayCancelledCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                {dm.todayCancelledCount} cancelled
              </p>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Today's Expenses</span>
              <p className="font-extrabold text-slate-800">
                {formatAmountWithCurrency(dm.todayExpenses, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Stats Grid - Dark Theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {hasAccess('SALES') && (
          <DarkStatCard
            title="Total Sales"
            value={formatAmountWithCurrency(data.sales.total, activeCurrencyCode, activeCurrencySymbol)}
            subtext={`${data.sales.count} transactions`}
            icon={<FiTrendingUp />}
          />
        )}
        {hasAccess('SALES') && (
          <DarkStatCard
            title="Today's Sales"
            value={formatAmountWithCurrency(data.sales.today, activeCurrencyCode, activeCurrencySymbol)}
            subtext={`${data.sales.todayCount} sales today`}
            icon={<FiDollarSign />}
          />
        )}
        {hasAccess('INVENTORY') && (
          <DarkStatCard
            title="Total Products"
            value={data.inventory.totalProducts}
            subtext={`${data.inventory.inStock} in stock`}
            icon={<FiBox />}
          />
        )}
        {(hasAccess('SALES') || hasAccess('CRM')) && (
          <DarkStatCard
            title="Customers"
            value={data.customers.total}
            subtext={`${data.customers.active} Active customers`}
            icon={<FiUsers />}
          />
        )}
      </div>

      {/* Middle Section: Recent Sales, Stock Balance & Fast Moving Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Recent Sales */}
        {hasAccess('SALES') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col transition-all hover:shadow-md">
            <div className="flex items-center space-x-2 mb-4 md:mb-6 text-slate-800">
              <FiShoppingBag className="text-primary" />
              <h3 className="text-base md:text-lg font-medium">Recent Sales</h3>
            </div>
            <div className="space-y-3 md:space-y-4 flex-1">
              {data.recentSales.length === 0 ? (
                <p className="text-slate-400 text-sm">No recent sales</p>
              ) : (
                data.recentSales.map(sale => (
                  <div key={sale.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition-colors group">
                    <div>
                      <p className="font-medium text-slate-700 text-[13px] md:text-sm uppercase truncate max-w-[140px] md:max-w-none">INV-{new Date(sale.createdAt).getFullYear()}-{sale.id}</p>
                      <p className="text-[11px] md:text-xs text-slate-400 mt-0.5">{new Date(sale.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                      <span className="font-medium text-primary text-[13px] md:text-sm">{formatAmountWithCurrency(sale.totalAmount, sale.currencyCode || activeCurrencyCode, sale.currencySymbol || activeCurrencySymbol)}</span>
                      <button
                        onClick={() => triggerPrint(sale)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-light rounded-md transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        title="Print Invoice"
                      >
                        <FiPrinter size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Stock Balance (Low Stock) */}
        {hasAccess('INVENTORY') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col transition-all hover:shadow-md">
            <div className="flex items-center space-x-2 mb-4 md:mb-6 text-slate-800">
              <FiBox className="text-blue-500" />
              <h3 className="text-base md:text-lg font-medium">Stock Balance</h3>
            </div>
            <div className="space-y-3 md:space-y-4 flex-1">
              {data.inventory.stockBalance.length === 0 ? (
                <p className="text-slate-400 text-sm">No stock data</p>
              ) : (
                data.inventory.stockBalance.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-medium text-slate-700 text-[13px] md:text-sm truncate" title={item.name}>{item.name}</p>
                      <p className="text-[11px] md:text-xs text-slate-400 mt-0.5 truncate">{item.category || 'Uncategorized'}</p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className={`font-medium text-[13px] md:text-sm ${item.stock < 10 ? 'text-red-500' : 'text-slate-800'}`}>{item.stock} units</p>
                      <p className="text-[11px] md:text-xs text-slate-400 mt-0.5">{formatAmountWithCurrency(item.price, activeCurrencyCode, activeCurrencySymbol)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Fast Moving Products */}
        {(hasAccess('SALES') || hasAccess('REPORTS')) && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col transition-all hover:shadow-md">
            <div className="flex items-center space-x-2 mb-4 md:mb-6 text-slate-800">
              <FiTrendingUp className="text-purple-500" />
              <h3 className="text-base md:text-lg font-medium">Fast Moving</h3>
            </div>
            <div className="space-y-3 md:space-y-4 flex-1">
              {!data.fastMovingProducts || data.fastMovingProducts.length === 0 ? (
                <p className="text-slate-400 text-sm">No sales data yet</p>
              ) : (
                data.fastMovingProducts.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 md:py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="flex items-center space-x-2 md:space-x-3 flex-1 min-w-0 pr-2">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-purple-50 flex items-center justify-center text-[10px] md:text-xs font-medium text-purple-600 border border-purple-100 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-700 text-[13px] md:text-sm truncate" title={item.name}>{item.name}</p>
                        <p className="text-[11px] md:text-xs text-slate-400 mt-0.5 truncate">{item.category}</p>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="font-medium text-slate-800 text-[13px] md:text-sm">{item.sold} Sold</p>
                      <div className="flex items-center justify-end text-[9px] md:text-[10px] text-primary font-medium mt-0.5">
                        <FiArrowUpRight className="mr-0.5" />
                        TOP SELLER
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Financial Summary */}
      {hasAccess('ACCOUNTING') && (
        <div className="transition-all animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-base md:text-lg font-medium text-slate-800 mb-3 md:mb-4">Financial Summary</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            <FinanceCard
              label="Total Receipts"
              value={data.finance.receipts}
              color="text-primary"
              bgColor="bg-primary-light"
              currencyCode={activeCurrencyCode}
              currencySymbol={activeCurrencySymbol}
            />
            <FinanceCard
              label="Total Expenses"
              value={data.finance.expenses}
              color="text-red-500"
              bgColor="bg-red-50"
              currencyCode={activeCurrencyCode}
              currencySymbol={activeCurrencySymbol}
            />
            <FinanceCard
              label="Total Purchases"
              value={data.finance.purchases}
              color="text-blue-600"
              bgColor="bg-blue-50"
              currencyCode={activeCurrencyCode}
              currencySymbol={activeCurrencySymbol}
            />
            <FinanceCard
              label="Net Profit"
              value={data.finance.netProfit}
              color="text-purple-600"
              bgColor="bg-purple-50"
              currencyCode={activeCurrencyCode}
              currencySymbol={activeCurrencySymbol}
            />
          </div>
        </div>
      )}

      {/* Hidden Print Component */}
      <div style={{ display: 'none' }}>
        <DynamicInvoice
          ref={componentRef}
          printData={printSale}
          companyProfile={companyProfile}
          invoiceSettings={invoiceSettings}
        />
      </div>

      {/* Day Opening Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 pt-16 sm:pt-20 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-4 my-auto translate-y-4 sm:translate-y-6">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FiClock className="text-emerald-600" /> Open Business Day
              </h3>
              <button onClick={() => setShowOpenModal(false)} className="text-slate-400 hover:text-slate-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleOpenDaySubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Business Date</span>
                  <p className="font-bold text-slate-800">{dm?.businessDateDisplay || dm?.businessDate || 'Today'}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Previous Closing Cash</span>
                  <p className="font-bold text-slate-800">
                    {formatAmountWithCurrency(dm?.expectedOpeningCash || 0, activeCurrencyCode, activeCurrencySymbol)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-600">Additional Cash Added to Till (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingAddCash}
                    onChange={(e) => setOpeningAddCash(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600">Cash Removed Before Opening (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingRemCash}
                    onChange={(e) => setOpeningRemCash(e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600">Actual Opening Cash Counted (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={openingActualCash}
                    onChange={(e) => setOpeningActualCash(e.target.value)}
                    placeholder="Enter physical cash in drawer"
                    className="w-full mt-1 p-2 bg-white border border-emerald-400 rounded-lg font-extrabold text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600">Discrepancy Explanation (if difference is not zero)</label>
                  <textarea
                    rows={2}
                    value={openingReason}
                    onChange={(e) => setOpeningReason(e.target.value)}
                    placeholder="Explanation for any cash variance..."
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600">Opening Remarks (Optional)</label>
                  <input
                    type="text"
                    value={openingRemarks}
                    onChange={(e) => setOpeningRemarks(e.target.value)}
                    placeholder="Opening remarks or shift notes"
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOpen}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  {submittingOpen ? 'Opening...' : 'Confirm & Open Day'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DarkStatCard({ title, value, subtext, icon }) {
  return (
    <div className="bg-gradient-to-br from-primary to-primary-dark rounded-xl p-4 md:p-6 relative overflow-hidden group hover:shadow-xl transition-shadow shadow-lg">
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <p className="text-white/90 text-xs md:text-sm font-medium mb-1 md:mb-2">{title}</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-white truncate max-w-[180px]">{value}</h2>
          <p className="text-[10px] md:text-xs text-white/80 font-medium">{subtext}</p>
        </div>
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm group-hover:bg-white/30 transition-colors shrink-0">
          <span className="text-lg md:text-xl text-white">{icon}</span>
        </div>
      </div>
      {/* Decorative */}
      <div className="absolute -right-4 -bottom-4 w-20 h-20 md:w-24 md:h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/15 transition-colors"></div>
    </div>
  );
}

function FinanceCard({ label, value, color, bgColor, currencyCode, currencySymbol }) {
  const num = Number(value) || 0;
  const sign = num < 0 ? '-' : '';
  const formatted = formatAmountWithCurrency(Math.abs(num), currencyCode, currencySymbol);
  return (
    <div className={`rounded-xl p-3 md:p-6 flex flex-col items-center justify-center text-center ${bgColor} border-2 border-white shadow-sm`}>
      <p className="text-slate-500 text-[10px] md:text-xs font-medium uppercase tracking-wider mb-1 md:mb-2">{label}</p>
      <p className={`text-lg md:text-2xl font-semibold ${color} truncate max-w-full`}>
        {sign}{formatted}
      </p>
    </div>
  );
}
