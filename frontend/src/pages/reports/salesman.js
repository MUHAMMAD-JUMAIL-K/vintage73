import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import {
    FiCalendar, FiUser, FiDownload, FiDollarSign, FiTrendingUp, FiActivity, FiAward, FiStar
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

export default function SalesmanReport() {
    const [reportData, setReportData] = useState([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [user, setUser] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const u = JSON.parse(storedUser);
            setUser(u);
            setSelectedBranch(u.branchId?.toString() || '');
            if (u.role === 'admin') {
                api.get('/branches').then(res => setBranches(res.data)).catch(console.error);
            }
        }
    }, []);

    useEffect(() => {
        fetchReport();
    }, [selectedBranch, startDate, endDate]);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const queryBranchId = selectedBranch === 'all' ? undefined : selectedBranch;

            const params = { branchId: queryBranchId };
            if (startDate) params.startDate = startDate;
            if (endDate) {
                const nextDay = new Date(endDate);
                nextDay.setDate(nextDay.getDate() + 1);
                params.endDate = nextDay.toISOString().split('T')[0];
            }

            const { data } = await api.get('/sales', { params });

            const agg = {};
            data.filter(s => s.status !== 'cancelled').forEach(sale => {
                if (sale.salesman) {
                    const name = sale.salesman.name || 'Unknown';
                    if (!agg[name]) agg[name] = { name, salesCount: 0, totalRevenue: 0, totalIncentive: 0 };
                    agg[name].salesCount++;
                    agg[name].totalRevenue += parseFloat(sale.totalAmount);
                    agg[name].totalIncentive += parseFloat(sale.incentiveAmount || 0);
                }
            });

            const result = Object.values(agg).sort((a, b) => b.totalRevenue - a.totalRevenue);
            setReportData(result);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load report');
        } finally {
            setLoading(false);
        }
    };

    const totals = reportData.reduce((acc, curr) => ({
        revenue: acc.revenue + curr.totalRevenue,
        incentive: acc.incentive + curr.totalIncentive,
        count: acc.count + curr.salesCount
    }), { revenue: 0, incentive: 0, count: 0 });

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    return (
        <div className="min-h-screen bg-slate-50/50 p-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        Salesman Performance <span className="bg-amber-100 text-amber-600 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest font-medium">Elite</span>
                    </h1>
                    <p className="text-slate-500 text-xs font-medium">Productivity tracking</p>
                </div>
                <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 text-xs font-medium text-slate-600 hover:text-primary transition-all" onClick={() => window.print()}>
                    <FiDownload size={14} /> Export
                </button>
            </div>

            {/* Compact Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6">
                <div className="flex flex-wrap gap-4 items-end">
                    {user?.role === 'admin' && (
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">Branch</label>
                            <select
                                className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-primary/20 transition-all font-medium text-slate-700"
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                            >
                                <option value="all">Global</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">From</label>
                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-primary/20 font-medium text-slate-700" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">To</label>
                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-primary/20 font-medium text-slate-700" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <button className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-rose-500 hover:bg-rose-50 rounded-xl transition-all" onClick={() => { setStartDate(''); setEndDate(''); }}>Clear</button>
                </div>
            </div>

            {/* Summary Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-900 rounded-2xl p-5 relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-indigo-300/80 text-[8px] font-medium uppercase tracking-widest mb-1 text-xs">Managed Revenue</p>
                        <h3 className="text-xl font-extrabold text-white tabular-nums">₹{totals.revenue.toLocaleString()}</h3>
                    </div>
                    <FiDollarSign className="absolute right-[-10px] bottom-[-10px] text-white/5 text-[5rem] rotate-12" />
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <p className="text-slate-400 text-[8px] font-extrabold uppercase tracking-widest mb-1 text-xs">Total Incentives</p>
                    <h3 className="text-xl font-extrabold text-slate-900 tabular-nums">₹{totals.incentive.toLocaleString()}</h3>
                    <div className="mt-2 text-[9px] font-medium text-emerald-500 flex items-center gap-1">
                        <FiTrendingUp size={10} /> {totals.revenue > 0 ? ((totals.incentive / totals.revenue) * 100).toFixed(1) : 0}% Efficiency
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <p className="text-slate-400 text-[8px] font-medium uppercase tracking-widest mb-1 text-xs">Transact. Volume</p>
                    <h3 className="text-xl font-extrabold text-slate-900 tabular-nums">{totals.count}</h3>
                </div>
            </div>

            {/* Chart Section */}
            {reportData.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-6">
                    <h3 className="text-sm font-medium text-slate-800 tracking-tight mb-6">Performance Comparison</h3>
                    <div className="h-[300px] w-full min-w-0" style={{ minHeight: 300 }}>
                        <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={300} debounce={50}>
                            <BarChart data={reportData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} dy={5} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} dx={-5} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 700 }} />
                                <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 700, fontSize: '9px' }} />
                                <Bar dataKey="totalRevenue" name="Revenue" radius={[6, 6, 0, 0]} barSize={30}>
                                    {reportData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={0.8} />
                                    ))}
                                </Bar>
                                <Bar dataKey="totalIncentive" name="Incentive" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={10} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Individual Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reportData.map((d, i) => (
                    <div key={i} className="group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all relative overflow-hidden">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all relative">
                                <FiUser size={24} />
                                {i === 0 && <FiStar size={12} className="absolute -top-1 -right-1 text-amber-500 fill-amber-500" />}
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-slate-800 tracking-tight leading-none mb-1">{d.name}</h3>
                                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-widest">{d.salesCount} Closures</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="p-3 bg-slate-50/50 rounded-xl flex justify-between items-center text-xs">
                                <span className="font-medium text-slate-400 uppercase text-[9px]">Revenue</span>
                                <span className="font-extrabold text-slate-800">₹{d.totalRevenue.toLocaleString()}</span>
                            </div>
                            <div className="p-3 bg-indigo-50/50 rounded-xl flex justify-between items-center text-xs">
                                <span className="font-medium text-indigo-400 uppercase text-[9px] flex items-center gap-1">
                                    <FiAward /> Incentive
                                </span>
                                <span className="font-extrabold text-indigo-600">₹{d.totalIncentive.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="flex justify-between text-[9px] font-medium uppercase text-slate-400 mb-2">
                                <span>Market Share</span>
                                <span>{((d.totalRevenue / totals.revenue) * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${(d.totalRevenue / reportData[0].totalRevenue) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                ))}

                {reportData.length === 0 && (
                    <div className="col-span-full py-16 text-center rounded-2xl border-2 border-dashed border-slate-100">
                        <p className="text-sm font-medium text-slate-300 italic">No performance data found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
