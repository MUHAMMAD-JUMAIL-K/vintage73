import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useTabs } from '@/context/TabContext';
import { formatCurrency as formatCurrencyLib, resolveActiveCurrency, DEFAULT_CURRENCY } from '@/lib/currency';
import { 
  FiFileText, FiRefreshCw, FiBook, FiLayers, FiCheckCircle, 
  FiSettings, FiLock, FiList, FiArrowUpRight, FiPieChart, 
  FiArrowDownLeft, FiActivity, FiDollarSign, FiBriefcase,
  FiTrendingUp, FiCreditCard, FiTarget, FiPlus, FiFilter,
  FiCalendar, FiX, FiAlertTriangle, FiGlobe
} from 'react-icons/fi';
import { Bar, Line, Doughnut, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

export default function AccountingDashboard() {
  const { addTab } = useTabs();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState({ code: 'AED', symbol: 'AED' });

  useEffect(() => {
    const saved = localStorage.getItem('activeBranchId');
    if (saved) setSelectedBranchId(saved);

    const fetchBranches = async () => {
      try {
        const res = await api.get('/branches');
        const branchList = Array.isArray(res.data) ? res.data : (res.data?.branches || []);
        setBranches(branchList);
      } catch (e) {
        console.error('Failed to load branches:', e);
      }
    };
    fetchBranches();

    const handleBranchChange = (e) => {
      const nextId = e.detail?.branchId || localStorage.getItem('activeBranchId') || '';
      setSelectedBranchId(nextId);
    };
    window.addEventListener('activeBranchChanged', handleBranchChange);
    return () => window.removeEventListener('activeBranchChanged', handleBranchChange);
  }, []);

  useEffect(() => {
    fetchDashboardStats(filterStartDate, filterEndDate, selectedBranchId);
  }, [selectedBranchId]);

  const fetchDashboardStats = async (start = filterStartDate, end = filterEndDate, branchId = selectedBranchId) => {
    try {
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      if (branchId) params.append('branchId', branchId);
      const queryString = params.toString();
      const url = `/accounting/dashboard${queryString ? `?${queryString}` : ''}`;
      
      const res = await api.get(url);
      setStats(res.data);
      if (res.data?.currency) {
        setActiveCurrency(res.data.currency);
      } else {
        const matchedBranch = branches.find(b => String(b.id) === String(branchId));
        setActiveCurrency(resolveActiveCurrency(matchedBranch, null));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBranchSelect = (branchId) => {
    setSelectedBranchId(branchId);
    if (branchId) {
      localStorage.setItem('activeBranchId', branchId);
    } else {
      localStorage.removeItem('activeBranchId');
    }
    window.dispatchEvent(new CustomEvent('activeBranchChanged', { detail: { branchId } }));
  };

  const handleClear = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    fetchDashboardStats('', '', selectedBranchId);
  };

  const formatCurrency = (val) => {
    return formatCurrencyLib(val, activeCurrency);
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading Dashboard...</div>;

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
        <FiAlertTriangle className="text-5xl text-amber-500 mb-4 opacity-50" />
        <h2 className="text-xl font-bold text-slate-700 tracking-tight">Dashboard Unavailable</h2>
        <p className="text-slate-500 mt-2 max-w-xs mx-auto text-sm">We couldn't retrieve the financial summary. This might be due to a server error or missing permissions.</p>
        <button 
          onClick={() => { setLoading(true); fetchDashboardStats(); }} 
          className="mt-8 px-8 py-2.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 border-t border-slate-200">
      
      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Accounting Dashboard</h1>
            <p className="text-slate-500 mt-1 font-medium text-sm">Comprehensive overview of financial health and operations</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {branches.length > 0 && (
              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm text-xs font-semibold gap-2">
                <FiGlobe className="text-slate-400" />
                <select
                  value={selectedBranchId}
                  onChange={e => handleBranchSelect(e.target.value)}
                  className="bg-transparent border-none text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="">All Branches</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.currencyCode || 'AED'})
                    </option>
                  ))}
                </select>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-bold text-[11px] border border-emerald-200">
                  {activeCurrency.code || 'AED'}
                </span>
              </div>
            )}

            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-full sm:w-auto transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <div className="hidden sm:flex items-center px-3 border-r border-slate-100">
                <FiCalendar className="text-slate-400 mr-2" size={14} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</span>
              </div>
              <div className="flex items-center flex-1 justify-between sm:justify-start px-2">
                <input 
                  type="date" 
                  className="text-xs font-semibold text-slate-700 bg-transparent border-none focus:ring-0 outline-none py-1.5 cursor-pointer w-full max-w-[125px]" 
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                />
                <span className="text-slate-300 font-medium px-2">to</span>
                <input 
                  type="date" 
                  className="text-xs font-semibold text-slate-700 bg-transparent border-none focus:ring-0 outline-none py-1.5 cursor-pointer w-full max-w-[125px]" 
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 justify-end sm:justify-start">
              {(filterStartDate || filterEndDate) && (
                <button
                  onClick={handleClear}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 text-slate-500 text-[10px] font-bold rounded-xl uppercase tracking-widest hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <FiX size={14} /> Clear
                </button>
              )}
              <button 
                onClick={() => fetchDashboardStats(filterStartDate, filterEndDate)}
                className="flex-1 sm:flex-none px-6 py-2 bg-slate-900 text-white text-[10px] font-bold rounded-xl uppercase tracking-widest hover:bg-slate-800 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <FiFilter size={14} /> Apply Filter
              </button>
            </div>
          </div>
        </header>

        {/* SUMMARY CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Bank Balance" value={formatCurrency(stats?.summary?.bankBalance)} icon={FiBriefcase} color="emerald" />
          <StatCard title="Cash in Hand" value={formatCurrency(stats?.summary?.cashInHand)} icon={FiCreditCard} color="amber" />
          <StatCard title="Monthly Income" value={formatCurrency(stats?.summary?.monthlyIncome)} icon={FiTrendingUp} color="blue" />
          <StatCard title="Monthly Expense" value={formatCurrency(stats?.summary?.monthlyExpense)} icon={FiActivity} color="rose" />
          
          <StatCard title="Net Profit" value={formatCurrency(stats?.summary?.netProfit)} icon={FiDollarSign} color="indigo" />
          <StatCard title="Total Accounts" value={stats?.summary?.totalAccounts} icon={FiLayers} color="slate" />
          <StatCard title="Today's Txns" value={stats?.summary?.todayTransactions} icon={FiFileText} color="cyan" />
          <StatCard title="Pending Vouchers" value={stats?.summary?.pendingVouchers} icon={FiLock} color="orange" />
        </div>

        {/* QUICK ACTIONS */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
           <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
             <FiTarget className="text-primary" /> Quick Actions
           </h3>
           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <ActionButton name="Journal Entry" icon={FiFileText} path="/accounting/vouchers/journal" addTab={addTab} />
              <ActionButton name="Payment Voucher" icon={FiArrowUpRight} path="/accounting/vouchers/payment" addTab={addTab} />
              <ActionButton name="Receipt Voucher" icon={FiArrowDownLeft} path="/accounting/vouchers/receipt" addTab={addTab} />
              <ActionButton name="Contra Entry" icon={FiRefreshCw} path="/accounting/vouchers/contra" addTab={addTab} />
              <ActionButton name="Chart of Accounts" icon={FiList} path="/accounting/chart-of-accounts" addTab={addTab} />
              <ActionButton name="Balance Sheet" icon={FiPieChart} path="/accounting/reports/balance-sheet" addTab={addTab} />
           </div>
        </div>

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
             <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Income vs Expense (6M)</h3>
             <div className="h-64">
                <Bar 
                  data={{
                    labels: stats?.charts?.incomeVsExpense?.labels || [],
                    datasets: [
                      { label: 'Income', data: stats?.charts?.incomeVsExpense?.income || [], backgroundColor: 'rgba(16, 185, 129, 0.7)', borderRadius: 4 },
                      { label: 'Expense', data: stats?.charts?.incomeVsExpense?.expense || [], backgroundColor: 'rgba(244, 63, 94, 0.7)', borderRadius: 4 }
                    ]
                  }}
                  options={{ maintainAspectRatio: false }}
                />
             </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
             <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Cash Flow Trend</h3>
             <div className="h-64">
                <Line 
                  data={{
                    labels: stats?.charts?.cashFlow?.labels || [],
                    datasets: [
                      { 
                        label: 'Net Cash Flow', 
                        data: stats?.charts?.cashFlow?.data || [], 
                        borderColor: '#3b82f6', 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4 
                      }
                    ]
                  }}
                  options={{ maintainAspectRatio: false }}
                />
             </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
             <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Voucher Status</h3>
             <div className="h-64 flex justify-center">
                <Doughnut 
                  data={{
                    labels: ['Posted', 'Draft', 'Cancelled'],
                    datasets: [{
                      data: stats?.charts?.voucherStatus || [0,0,0],
                      backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
                    }]
                  }}
                  options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
                />
             </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
             <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Account Type Distribution</h3>
             <div className="h-64 flex justify-center">
                <Pie 
                  data={{
                    labels: stats?.charts?.accountTypes?.labels || [],
                    datasets: [{
                      data: stats?.charts?.accountTypes?.data || [],
                      backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
                    }]
                  }}
                  options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
                />
             </div>
          </div>
        </div>

        {/* RECENT ACTIVITY */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Recent Vouchers</h3>
          <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto shadow-sm border border-slate-200 rounded-lg">
            <table className="w-full text-left text-sm text-slate-600 table-modern">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr className="whitespace-nowrap">
                  <th className="px-4 py-3 rounded-tl-lg">Voucher #</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats?.recentActivity?.map((activity, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary-dark">{activity.voucherNumber}</td>
                    <td className="px-4 py-3">{activity.voucherType}</td>
                    <td className="px-4 py-3">{new Date(activity.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        activity.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' :
                        activity.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {activity.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {formatCurrency(activity.totalAmount)}
                    </td>
                  </tr>
                ))}
                {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
                  <tr><td colSpan="5" className="px-4 py-4 text-center text-slate-400">No recent activity</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    slate: 'bg-slate-50 text-slate-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    orange: 'bg-orange-50 text-orange-600'
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl flex flex-shrink-0 items-center justify-center text-xl ${colorClasses[color] || colorClasses.slate}`}>
        <Icon />
      </div>
      <div className="overflow-hidden">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">{title}</p>
        <h3 className="text-lg md:text-xl font-extrabold text-slate-800 truncate">{value}</h3>
      </div>
    </div>
  );
}

function ActionButton({ name, icon: Icon, path, addTab }) {
  return (
    <button
      onClick={() => addTab({ name, path })}
      className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-primary/30 hover:bg-primary-light transition-all group"
    >
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
        <Icon className="text-slate-500 group-hover:text-primary-dark" />
      </div>
      <span className="text-[10px] font-semibold text-slate-600 text-center uppercase tracking-wider break-words w-full px-1">{name}</span>
    </button>
  );
}
