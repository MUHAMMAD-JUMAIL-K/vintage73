import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import {
  FiDollarSign, FiShoppingBag, FiBox, FiUsers, FiTrendingUp, FiArrowUpRight, FiPrinter,
  FiClock, FiCheckCircle, FiAlertTriangle, FiLock, FiSearch, FiLayers, FiX, FiEdit, FiEye
} from 'react-icons/fi';
import { HiOutlineReceiptRefund } from 'react-icons/hi';
import { TbBusinessplan } from 'react-icons/tb';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'react-toastify';
import DynamicInvoice from '@/components/DynamicInvoice';
import { getCurrencySymbol, normalizeCurrencySymbol, formatAmountWithCurrency, DEFAULT_CURRENCY } from '@/lib/currency';

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

  // Edit Opening Amount Modal State
  const [showEditOpenModal, setShowEditOpenModal] = useState(false);
  const [editOpeningAmount, setEditOpeningAmount] = useState('');
  const [editOpeningReason, setEditOpeningReason] = useState('');
  const [submittingEditOpen, setSubmittingEditOpen] = useState(false);

  // Edit Closing Cash Count Modal State
  const [showEditCloseModal, setShowEditCloseModal] = useState(false);
  const [editClosingCashVal, setEditClosingCashVal] = useState('');
  const [editClosingReason, setEditClosingReason] = useState('');
  const [submittingEditClose, setSubmittingEditClose] = useState(false);

  // Cash Movements Modal State
  const [showMovementsModal, setShowMovementsModal] = useState(false);

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
      const prevCash = Number(dm?.previousClosingCash ?? dm?.expectedOpeningCash ?? 0);
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

  const handleEditOpeningSubmit = async (e) => {
    e.preventDefault();
    if (!editOpeningReason.trim()) {
      toast.warn('Please provide a mandatory explanation for modifying the opening balance.');
      return;
    }
    setSubmittingEditOpen(true);
    try {
      const dm = data?.dayManagement;
      const res = await api.post('/day-close/edit-opening', {
        branchId: branch?.id || userData?.branchId,
        businessDate: dm?.businessDate,
        actualOpeningCash: parseFloat(editOpeningAmount) || 0,
        reason: editOpeningReason.trim()
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Opening balance updated successfully!');
        setShowEditOpenModal(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to edit opening balance');
    } finally {
      setSubmittingEditOpen(false);
    }
  };

  const handleEditClosingSubmit = async (e) => {
    e.preventDefault();
    setSubmittingEditClose(true);
    try {
      const dm = data?.dayManagement;
      const res = await api.post('/day-close/edit-closing-cash', {
        branchId: branch?.id || userData?.branchId,
        businessDate: dm?.businessDate,
        physicalCash: parseFloat(editClosingCashVal) || 0,
        reason: editClosingReason.trim()
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Closing cash count recorded successfully!');
        setShowEditCloseModal(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update closing cash count');
    } finally {
      setSubmittingEditClose(false);
    }
  };

  const dm = data?.dayManagement;
  const isDayOpened = dm && dm.status !== 'NOT_OPENED';
  const isDayClosed = dm && (dm.status === 'CLOSED' || dm.status === 'ADMIN_CLOSED');
  const activeCurrencyCode = branch?.currencyCode || companyProfile?.currencyCode || DEFAULT_CURRENCY;
  const activeCurrencySymbol = normalizeCurrencySymbol(branch?.currencySymbol || companyProfile?.currencySymbol, activeCurrencyCode);

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
                    const prevC = Number(dm.previousClosingCash ?? dm.expectedOpeningCash ?? 0);
                    setOpeningActualCash(prevC ? prevC.toString() : '0');
                    setOpeningAddCash('0');
                    setOpeningRemCash('0');
                    setOpeningReason('');
                    setShowOpenModal(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FiCheckCircle /> Open Business Day
                </button>
              )}
              {isDayOpened && !isDayClosed && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpeningAmount(dm.openingCash.toString());
                      setEditOpeningReason('');
                      setShowEditOpenModal(true);
                    }}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiEdit /> Edit Opening Amount
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditClosingCashVal(dm.actualClosingCash !== null ? dm.actualClosingCash.toString() : dm.expectedClosingCash.toString());
                      setEditClosingReason('');
                      setShowEditCloseModal(true);
                    }}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-xs rounded-xl border border-blue-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiDollarSign /> {dm.actualClosingCash !== null ? 'Edit Closing Cash' : 'Enter Closing Cash'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMovementsModal(true)}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiLayers /> View Cash Movements
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/settings/day-close')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <FiLock /> Verify & Close Day
                  </button>
                </>
              )}
              {isDayClosed && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMovementsModal(true)}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiLayers /> View Cash Movements
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/settings/day-close?date=${dm.businessDate}`)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <FiEye /> View Closing Report
                  </button>
                </>
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

          {/* Prior Day Modification Discrepancy Alert */}
          {dm.hasPriorDayDiscrepancy && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FiAlertTriangle className="text-amber-600 text-base flex-shrink-0" />
                <span>
                  <strong>Prior Day Closing Modified:</strong> The previous business day's closing balance was altered by {formatAmountWithCurrency(dm.priorDayDiscrepancyAmount, activeCurrencyCode, activeCurrencySymbol)} after this session was opened.
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push('/settings/day-close')}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg shadow-sm whitespace-nowrap cursor-pointer"
              >
                Reconcile in Day Close →
              </button>
            </div>
          )}

          {/* 8 Required Cash & Financial Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
            {/* 1. Opening Balance */}
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase truncate block">Opening Balance</span>
              <p className="font-extrabold text-slate-800">
                {formatAmountWithCurrency(dm.openingCash, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
            {/* 2. Previous Day's Closing Balance */}
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase truncate block">Prev Closing Balance</span>
              <p className="font-extrabold text-slate-800">
                {formatAmountWithCurrency(dm.previousClosingCash, activeCurrencyCode, activeCurrencySymbol)}
              </p>
              {dm.previousClosingDateDisplay && (
                <span className="text-[9px] text-slate-400 block truncate">{dm.previousClosingDateDisplay}</span>
              )}
            </div>
            {/* 3. Total Cash Received */}
            <div className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-0.5">
              <span className="text-[10px] text-emerald-700 font-bold uppercase truncate block">Cash Received</span>
              <p className="font-extrabold text-emerald-700">
                +{formatAmountWithCurrency(dm.totalCashReceived || 0, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
            {/* 4. Total Cash Paid */}
            <div className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl space-y-0.5">
              <span className="text-[10px] text-rose-700 font-bold uppercase truncate block">Cash Paid</span>
              <p className="font-extrabold text-rose-700">
                -{formatAmountWithCurrency(dm.totalCashPaid || 0, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
            {/* 5. Expected Closing Balance */}
            <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl space-y-0.5">
              <span className="text-[10px] text-blue-700 font-bold uppercase truncate block">Expected Closing</span>
              <p className="font-extrabold text-blue-800">
                {formatAmountWithCurrency(dm.expectedClosingCash || 0, activeCurrencyCode, activeCurrencySymbol)}
              </p>
            </div>
            {/* 6. Actual Closing Balance */}
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase truncate block">Actual Closing</span>
              <p className="font-extrabold text-slate-800">
                {dm.actualClosingCash !== null
                  ? formatAmountWithCurrency(dm.actualClosingCash, activeCurrencyCode, activeCurrencySymbol)
                  : <span className="text-slate-400 font-medium italic">Pending Count</span>}
              </p>
            </div>
            {/* 7. Cash Difference */}
            <div className={`p-2.5 rounded-xl space-y-0.5 border ${
              dm.cashDifference === null
                ? 'bg-slate-50 border-slate-100 text-slate-500'
                : dm.cashDifference === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : dm.cashDifference > 0
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              <span className="text-[10px] font-bold uppercase truncate block">Cash Difference</span>
              <p className="font-extrabold">
                {dm.cashDifference !== null
                  ? `${dm.cashDifference >= 0 ? '+' : ''}${formatAmountWithCurrency(dm.cashDifference, activeCurrencyCode, activeCurrencySymbol)}`
                  : '—'}
              </p>
            </div>
            {/* 8. Session Status */}
            <div className="p-2.5 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase truncate block">Session Status</span>
              <p className="font-extrabold text-slate-800">
                {dm.status}
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
      {showOpenModal && (() => {
        const prevC = Number(dm?.previousClosingCash ?? dm?.expectedOpeningCash ?? 0);
        const addC = parseFloat(openingAddCash) || 0;
        const remC = parseFloat(openingRemCash) || 0;
        const expC = prevC + addC - remC;
        const actC = parseFloat(openingActualCash) || 0;
        const diffC = actC - expC;

        return (
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
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Previous Closing Balance</span>
                    <p className="font-bold text-slate-800">
                      {formatAmountWithCurrency(prevC, activeCurrencyCode, activeCurrencySymbol)}
                    </p>
                    {dm?.previousClosingDateDisplay ? (
                      <span className="text-[9px] text-emerald-600 font-semibold">Carried from {dm.previousClosingDateDisplay}</span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-medium italic">Initial session opening</span>
                    )}
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
                      placeholder="0.00"
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
                      placeholder="0.00"
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                    />
                  </div>

                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-blue-900 uppercase">Expected Opening Balance:</span>
                      <span className="text-sm font-extrabold text-blue-900">
                        {formatAmountWithCurrency(expC, activeCurrencyCode, activeCurrencySymbol)}
                      </span>
                    </div>
                    <p className="text-[10px] text-blue-700">Prev Closing ({formatAmountWithCurrency(prevC, activeCurrencyCode, activeCurrencySymbol)}) + Added ({formatAmountWithCurrency(addC, activeCurrencyCode, activeCurrencySymbol)}) - Removed ({formatAmountWithCurrency(remC, activeCurrencyCode, activeCurrencySymbol)})</p>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">Actual Physical Cash Counted (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={openingActualCash}
                      onChange={(e) => setOpeningActualCash(e.target.value)}
                      placeholder="Enter physical cash counted in drawer"
                      className="w-full mt-1 p-2 bg-white border-2 border-emerald-500 rounded-lg font-extrabold text-sm text-slate-900 shadow-sm"
                    />
                  </div>

                  {/* Dynamic Opening Difference preview */}
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[11px] font-semibold text-slate-500">Opening Cash Difference:</span>
                    <span className={`text-xs font-extrabold ${Math.abs(diffC) <= 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {diffC >= 0 ? '+' : ''}{formatAmountWithCurrency(diffC, activeCurrencyCode, activeCurrencySymbol)}
                      {Math.abs(diffC) <= 0.01 ? ' (Balanced)' : ' (Variance)'}
                    </span>
                  </div>

                  {Math.abs(diffC) > 0.01 && (
                    <div className="space-y-1">
                      <label className="font-bold text-amber-800">
                        Discrepancy Explanation <span className="text-red-500">* (Mandatory)</span>
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={openingReason}
                        onChange={(e) => setOpeningReason(e.target.value)}
                        placeholder="Reason for opening cash difference..."
                        className="w-full p-2 bg-amber-50 border border-amber-300 rounded-lg text-xs font-medium text-slate-800"
                      />
                    </div>
                  )}

                  <div>
                    <label className="font-semibold text-slate-600">Opening Remarks (Optional)</label>
                    <input
                      type="text"
                      value={openingRemarks}
                      onChange={(e) => setOpeningRemarks(e.target.value)}
                      placeholder="Shift notes or opening remarks"
                      className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowOpenModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingOpen}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all"
                  >
                    {submittingOpen ? 'Opening...' : 'Confirm & Open Day'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Edit Opening Amount Modal */}
      {showEditOpenModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FiEdit className="text-amber-600" /> Edit Opening Amount
              </h3>
              <button onClick={() => setShowEditOpenModal(false)} className="text-slate-400 hover:text-slate-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleEditOpeningSubmit} className="space-y-4">
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1 text-xs">
                <span className="font-bold text-amber-900 uppercase text-[10px]">Current Saved Opening Balance:</span>
                <p className="font-extrabold text-amber-950 text-base">
                  {formatAmountWithCurrency(dm?.openingCash || 0, activeCurrencyCode, activeCurrencySymbol)}
                </p>
                <p className="text-[10px] text-amber-800">
                  Expected Opening: {formatAmountWithCurrency(dm?.expectedOpeningCash || 0, activeCurrencyCode, activeCurrencySymbol)}
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700">Corrected Opening Cash Count (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editOpeningAmount}
                    onChange={(e) => setEditOpeningAmount(e.target.value)}
                    placeholder="Enter corrected opening cash"
                    className="w-full mt-1 p-2.5 bg-white border-2 border-amber-400 rounded-lg font-extrabold text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700">
                    Reason for Correction * <span className="text-red-500">(Mandatory for audit trail)</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={editOpeningReason}
                    onChange={(e) => setEditOpeningReason(e.target.value)}
                    placeholder="Explain why the opening balance is being corrected..."
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditOpenModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditOpen}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all"
                >
                  {submittingEditOpen ? 'Saving...' : 'Save Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Enter Closing Cash Count Modal */}
      {showEditCloseModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FiDollarSign className="text-blue-600" /> Physical Closing Cash Count
              </h3>
              <button onClick={() => setShowEditCloseModal(false)} className="text-slate-400 hover:text-slate-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleEditClosingSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1 text-xs">
                <span className="font-bold text-blue-900 uppercase text-[10px]">Calculated Expected Closing Cash:</span>
                <p className="font-extrabold text-blue-950 text-base">
                  {formatAmountWithCurrency(dm?.expectedClosingCash || 0, activeCurrencyCode, activeCurrencySymbol)}
                </p>
                <p className="text-[10px] text-blue-700">Calculated from Opening + Cash Receipts - Cash Payments + Net Transfers.</p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700">Actual Physical Cash Counted in Drawer (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editClosingCashVal}
                    onChange={(e) => setEditClosingCashVal(e.target.value)}
                    placeholder="Enter physical cash counted"
                    className="w-full mt-1 p-2.5 bg-white border-2 border-blue-400 rounded-lg font-extrabold text-sm text-slate-900"
                  />
                </div>

                {(() => {
                  const actVal = parseFloat(editClosingCashVal) || 0;
                  const expVal = Number(dm?.expectedClosingCash || 0);
                  const diffVal = actVal - expVal;
                  return (
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[11px] font-semibold text-slate-500">Calculated Cash Difference:</span>
                      <span className={`text-xs font-extrabold ${Math.abs(diffVal) <= 0.01 ? 'text-emerald-600' : diffVal > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {diffVal >= 0 ? '+' : ''}{formatAmountWithCurrency(diffVal, activeCurrencyCode, activeCurrencySymbol)}
                        {Math.abs(diffVal) <= 0.01 ? ' (Balanced)' : diffVal > 0 ? ' (Cash Excess)' : ' (Cash Shortage)'}
                      </span>
                    </div>
                  );
                })()}

                <div>
                  <label className="font-semibold text-slate-700">Reason / Shift Notes</label>
                  <textarea
                    rows={2}
                    value={editClosingReason}
                    onChange={(e) => setEditClosingReason(e.target.value)}
                    placeholder="Enter explanation for count correction or notes..."
                    className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditCloseModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditClose}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all"
                >
                  {submittingEditClose ? 'Saving...' : 'Record Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Movements Summary Modal */}
      {showMovementsModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FiLayers className="text-emerald-600" /> Cash Movements for {dm?.businessDateDisplay}
              </h3>
              <button onClick={() => setShowMovementsModal(false)} className="text-slate-400 hover:text-slate-600">
                <FiX size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl">
                <span className="font-bold text-slate-600">Starting Cash Drawer (Opening)</span>
                <span className="font-extrabold text-slate-900">
                  {formatAmountWithCurrency(dm?.openingCash || 0, activeCurrencyCode, activeCurrencySymbol)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                <span className="font-bold text-emerald-800">Total Cash Received (Sales + Receipts)</span>
                <span className="font-extrabold text-emerald-700">
                  +{formatAmountWithCurrency(dm?.totalCashReceived || 0, activeCurrencyCode, activeCurrencySymbol)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl">
                <span className="font-bold text-rose-800">Total Cash Paid (Expenses + Refunds + Supplier)</span>
                <span className="font-extrabold text-rose-700">
                  -{formatAmountWithCurrency(dm?.totalCashPaid || 0, activeCurrencyCode, activeCurrencySymbol)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-purple-50/50 border border-purple-100 rounded-xl">
                <span className="font-bold text-purple-800">Transfers In (Bank to Till)</span>
                <span className="font-extrabold text-purple-700">
                  +{formatAmountWithCurrency(dm?.transfersIn || 0, activeCurrencyCode, activeCurrencySymbol)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-purple-50/50 border border-purple-100 rounded-xl">
                <span className="font-bold text-purple-800">Transfers Out (Till to Bank)</span>
                <span className="font-extrabold text-purple-700">
                  -{formatAmountWithCurrency(dm?.transfersOut || 0, activeCurrencyCode, activeCurrencySymbol)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                <span className="font-extrabold text-blue-900">Expected Closing Balance</span>
                <span className="font-extrabold text-blue-900">
                  {formatAmountWithCurrency(dm?.expectedClosingCash || 0, activeCurrencyCode, activeCurrencySymbol)}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 bg-slate-100 rounded-xl">
                <span className="font-bold text-slate-700">Actual Counted Physical Cash</span>
                <span className="font-extrabold text-slate-900">
                  {dm?.actualClosingCash !== null
                    ? formatAmountWithCurrency(dm.actualClosingCash, activeCurrencyCode, activeCurrencySymbol)
                    : 'Count Pending'}
                </span>
              </div>

              {dm?.cashDifference !== null && (
                <div className={`flex justify-between items-center p-2.5 rounded-xl border ${
                  dm.cashDifference === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : dm.cashDifference > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <span className="font-bold">Cash Difference ({dm.cashDifference === 0 ? 'Balanced' : dm.cashDifference > 0 ? 'Excess' : 'Shortage'})</span>
                  <span className="font-extrabold">
                    {dm.cashDifference >= 0 ? '+' : ''}{formatAmountWithCurrency(dm.cashDifference, activeCurrencyCode, activeCurrencySymbol)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowMovementsModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
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
