import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import {
    FiDownload, FiTrendingUp, FiTrendingDown, FiDollarSign, FiPercent, FiActivity, FiPieChart, FiBarChart2, FiBox, FiCalendar, FiRefreshCw
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend, BarChart, Bar
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import SearchableSelect from '@/components/SearchableSelect';
import { getCurrencySymbol, normalizeCurrencySymbol, formatAmountWithCurrency } from '@/lib/currency';

export default function SalesPerformance() {
    const { theme } = useTheme();
    const [sales, setSales] = useState([]);
    const [filteredSales, setFilteredSales] = useState([]);
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [paymentSummary, setPaymentSummary] = useState([]);

    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [companyProfile, setCompanyProfile] = useState(null);
    const [user, setUser] = useState(null);

    useEffect(() => {
        api.get('/company').then(res => setCompanyProfile(res.data)).catch(console.error);
        api.get('/branches').then(res => setBranches(res.data)).catch(console.error);

        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const u = JSON.parse(storedUser);
            setUser(u);
            setSelectedBranch(u.branchId?.toString() || '');
        }
    }, []);

    useEffect(() => {
        if (selectedBranch !== '') fetchData();
    }, [selectedBranch]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const queryBranchId = selectedBranch === 'all' ? undefined : selectedBranch;
            const [salesRes] = await Promise.all([
                api.get('/sales', { params: { branchId: queryBranchId } })
            ]);
            setSales(salesRes.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load data");
        } finally {
            setLoading(false);
        }
    };

    const fetchPaymentSummary = async () => {
        try {
            const queryBranchId = selectedBranch === 'all' ? undefined : selectedBranch;
            const targetDate = startDate || new Date().toISOString().split('T')[0];
            const { data } = await api.get(`/reports/payments`, {
                params: { date: targetDate, branchId: queryBranchId }
            });
            setPaymentSummary(data);
        } catch (err) {
            console.error("Failed to load payment summary", err);
        }
    };

    useEffect(() => {
        let result = sales;
        if (startDate) result = result.filter(s => new Date(s.saleDate) >= new Date(startDate));
        if (endDate) {
            const nextDay = new Date(endDate);
            nextDay.setDate(nextDay.getDate() + 1);
            result = result.filter(s => new Date(s.saleDate) < nextDay);
        }
        setFilteredSales(result);
        fetchPaymentSummary();
    }, [startDate, endDate, sales, selectedBranch]);

    // Calculations
    const currentBranch = branches.find(b => b.id?.toString() === selectedBranch?.toString());
    const activeCurrencyCode = currentBranch?.currencyCode || companyProfile?.currencyCode || 'INR';
    const activeCurrencySymbol = normalizeCurrencySymbol(currentBranch?.currencySymbol || companyProfile?.currencySymbol, activeCurrencyCode);

    const activeSales = filteredSales.filter(s => s.status !== 'cancelled');
    const grossSales = activeSales.reduce((sum, s) => sum + parseFloat(s.totalAmount), 0);
    const totalTax = activeSales.reduce((sum, s) => sum + parseFloat(s.taxAmount), 0);
    const totalReturns = activeSales.filter(s => s.isReturn).reduce((sum, s) => sum + parseFloat(s.totalAmount), 0);
    const netRevenue = grossSales - totalReturns;
    const totalDiscount = activeSales.reduce((sum, s) => {
        const itemDiscount = s.items?.reduce((iSum, item) => iSum + (parseFloat(item.discountAmount || 0) * item.quantity), 0) || 0;
        return sum + itemDiscount;
    }, 0);

    const salesByDate = activeSales.reduce((acc, sale) => {
        const date = new Date(sale.saleDate).toLocaleDateString();
        acc[date] = (acc[date] || 0) + parseFloat(sale.totalAmount);
        return acc;
    }, {});

    const chartData = Object.entries(salesByDate).map(([name, amount]) => ({ name, amount })).reverse().slice(-15);

    const paymentMethodData = activeSales.reduce((acc, sale) => {
        const method = sale.paymentMethod || 'Cash';
        acc[method] = (acc[method] || 0) + parseFloat(sale.totalAmount);
        return acc;
    }, {});

    const pieData = Object.entries(paymentMethodData).map(([name, value]) => ({ name, value }));
    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    const topProducts = activeSales.reduce((acc, sale) => {
        sale.items?.forEach(item => {
            const pName = item.product?.name || 'Unknown';
            if (!acc[pName]) acc[pName] = { name: pName, quantity: 0, total: 0 };
            acc[pName].quantity += item.quantity;
            acc[pName].total += parseFloat(item.total);
        });
        return acc;
    }, {});

    const sortedProducts = Object.values(topProducts).sort((a, b) => b.total - a.total).slice(0, 5);

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800">Sales Performance</h1>
                    <p className="text-slate-500 text-sm mt-1">Real-time revenue metrics tracking</p>
                </div>
                <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => window.print()}
                        className="flex-1 sm:flex-none px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                    >
                        <FiDownload size={16} /> Export View
                    </button>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="w-full sm:w-auto bg-primary text-white px-5 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary-dark transition-all shadow-sm"
                        style={{ backgroundColor: theme.primaryColor }}
                    >
                        <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">From Date</label>
                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-primary/20 transition-all font-medium text-slate-700 outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">To Date</label>
                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-primary/20 transition-all font-medium text-slate-700 outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    {user?.role === 'admin' && (
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">Branch</label>
                            <SearchableSelect
                                options={[
                                    { label: 'All Branches', value: 'all' },
                                    ...branches.map(b => ({ label: b.name, value: b.id }))
                                ]}
                                value={selectedBranch}
                                onChange={val => setSelectedBranch(val)}
                                direction="down"
                                triggerClassName="bg-slate-50 border-none rounded-xl py-1.5 px-3 text-xs font-medium text-slate-700"
                                placeholder="Select Branch"
                            />
                        </div>
                    )}
                    <button className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-rose-500 hover:bg-rose-50 rounded-xl transition-all" onClick={() => { setStartDate(''); setEndDate(''); }}>Reset Filters</button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-24 text-slate-400 font-medium">Analyzing performance data...</div>
            ) : (
                <>
                    {/* Compact Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="group bg-slate-900 rounded-2xl p-5 relative overflow-hidden transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-indigo-500/10">
                            <div className="relative z-10">
                                <p className="text-indigo-300/80 text-[9px] font-medium uppercase tracking-widest mb-1">Gross Revenue</p>
                                <h3 className="text-2xl font-bold text-white tabular-nums">{formatAmountWithCurrency(grossSales, activeCurrencyCode, activeCurrencySymbol)}</h3>
                                <p className="mt-2 text-[10px] text-indigo-400 font-medium flex items-center gap-1">
                                    <FiTrendingUp size={10} /> Insights Active
                                </p>
                            </div>
                            <FiDollarSign className="absolute right-[-10px] bottom-[-10px] text-white/5 text-[5rem] rotate-12" />
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:translate-y-[-2px]">
                            <p className="text-slate-400 text-[9px] font-medium uppercase tracking-widest mb-1">Net Revenue</p>
                            <h3 className="text-2xl font-bold text-slate-900 tabular-nums">{formatAmountWithCurrency(netRevenue, activeCurrencyCode, activeCurrencySymbol)}</h3>
                            <div className="mt-2 text-[10px] font-medium text-slate-500 uppercase">After Returns & Cancellations</div>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:translate-y-[-2px] group">
                            <div className="flex justify-between items-start mb-1">
                                <p className="text-slate-400 text-[9px] font-extrabold uppercase tracking-widest">Total Tax</p>
                                <FiActivity size={12} className="text-indigo-400" />
                            </div>
                            <h3 className="text-2xl font-extrabold text-slate-900 tabular-nums">{formatAmountWithCurrency(totalTax, activeCurrencyCode, activeCurrencySymbol)}</h3>
                            <p className="mt-2 text-[9px] text-slate-400 font-medium uppercase tracking-wider">GST Liability Tracked</p>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:translate-y-[-2px]">
                            <div className="flex justify-between items-start mb-1">
                                <p className="text-slate-400 text-[9px] font-medium uppercase tracking-widest">Discounts Given</p>
                                <FiPercent size={12} className="text-rose-400" />
                            </div>
                            <h3 className="text-2xl font-extrabold text-slate-900 tabular-nums">{formatAmountWithCurrency(totalDiscount, activeCurrencyCode, activeCurrencySymbol)}</h3>
                            <p className="mt-2 text-[9px] text-rose-500 font-medium uppercase tracking-widest">Promotion Impact</p>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-medium text-slate-800 tracking-tight mb-6 uppercase">Revenue Trajectory</h3>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={theme.primaryColor || '#6366f1'} stopOpacity={0.1} />
                                                <stop offset="95%" stopColor={theme.primaryColor || '#6366f1'} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} dx={-5} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 700 }} />
                                        <Area type="monotone" dataKey="amount" stroke={theme.primaryColor || '#6366f1'} strokeWidth={3} fill="url(#colorAmount)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
                            <h3 className="text-sm font-medium text-slate-800 tracking-tight mb-6 uppercase">Settlement Channels</h3>
                            <div className="flex-1 h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={pieData} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                                            {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={4} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '10px' }} />
                                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Sales Man Performance Chart */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-medium text-slate-800 tracking-tight uppercase">Sales Representative Performance</h3>
                            <span className="text-[10px] font-medium text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded-lg">Comparative View</span>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={Object.values(activeSales.reduce((acc, sale) => {
                                    if (sale.salesman) {
                                        const name = sale.salesman.name || 'Unknown';
                                        if (!acc[name]) acc[name] = { name, revenue: 0, count: 0 };
                                        acc[name].revenue += parseFloat(sale.totalAmount);
                                        acc[name].count++;
                                    }
                                    return acc;
                                }, {})).sort((a, b) => b.revenue - a.revenue)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} dx={-5} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 700 }}
                                    />
                                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={40}>
                                        {Object.values(activeSales.reduce((acc, sale) => {
                                            if (sale.salesman) {
                                                const name = sale.salesman.name || 'Unknown';
                                                if (!acc[name]) acc[name] = { name, revenue: 0, count: 0 };
                                                acc[name].revenue += parseFloat(sale.totalAmount);
                                                acc[name].count++;
                                            }
                                            return acc;
                                        }, {})).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-medium text-slate-800 mb-6 uppercase">Elite Performing SKUs</h3>
                            <div className="space-y-4">
                                {sortedProducts.map((p, idx) => (
                                    <div key={idx} className="flex items-center gap-4 group">
                                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-medium text-sm">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-slate-800 mb-0.5">{p.name}</p>
                                            <p className="text-[9px] text-slate-400 font-medium uppercase">{p.quantity} Units Sold</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-extrabold text-slate-900 tabular-nums">{formatAmountWithCurrency(p.total, activeCurrencyCode, activeCurrencySymbol)}</p>
                                            <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                                <div className="h-full bg-primary" style={{ backgroundColor: theme.primaryColor, width: `${sortedProducts[0].total > 0 ? (p.total / sortedProducts[0].total) * 100 : 0}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {sortedProducts.length === 0 && <div className="text-center py-8 text-slate-400 text-xs italic">No data records found</div>}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-medium text-slate-800 mb-6 flex items-center gap-2 uppercase">
                                <FiDollarSign className="text-amber-500" /> Cashflow Liquidity
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {paymentSummary.map(ps => (
                                    <div key={ps.method} className="bg-slate-50 p-4 rounded-xl border border-transparent hover:border-indigo-100 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-[10px] font-medium text-slate-400 uppercase">{ps.method}</p>
                                            <FiPieChart size={12} className="text-slate-200" />
                                        </div>
                                        <p className="text-lg font-medium text-slate-900 tabular-nums">{formatAmountWithCurrency(ps.net, activeCurrencyCode, activeCurrencySymbol)}</p>
                                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200/50">
                                            <span className="text-[9px] font-medium text-emerald-500 uppercase">+{formatAmountWithCurrency(ps.receipts, activeCurrencyCode, activeCurrencySymbol)}</span>
                                            <span className="text-[9px] font-medium text-rose-400 uppercase">-{formatAmountWithCurrency(ps.payments, activeCurrencyCode, activeCurrencySymbol)}</span>
                                        </div>
                                    </div>
                                ))}
                                {paymentSummary.length === 0 && <div className="col-span-full py-12 text-center text-slate-400 text-[11px] font-medium italic">No cashflow records detected for this selection</div>}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
