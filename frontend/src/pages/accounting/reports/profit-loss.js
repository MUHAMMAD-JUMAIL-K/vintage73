import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiTrendingUp, FiDownload, FiSearch } from 'react-icons/fi';
import { formatCurrency } from '@/lib/currency';

export default function ProfitLoss() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    });

    // Branch Filtering
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');

    useEffect(() => {
        fetchBranches();
        fetchProfitLoss();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data || []);
        } catch (err) {
            console.error('Failed to load branches', err);
        }
    };

    const fetchProfitLoss = async (overrideBranchId) => {
        setLoading(true);
        const targetBranchId = overrideBranchId !== undefined ? overrideBranchId : selectedBranch;
        try {
            const params = new URLSearchParams();
            if (dateRange.startDate) params.append('startDate', dateRange.startDate);
            if (dateRange.endDate) params.append('endDate', dateRange.endDate);
            if (targetBranchId) params.append('branchId', targetBranchId);
            
            const res = await api.get(`/accounting/reports/profit-loss?${params}`);
            setData(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load profit & loss statement');
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        fetchProfitLoss();
    };

    const activeCurrency = data?.currency || { code: 'INR', symbol: '₹' };
    const branchLabel = data?.branch ? data.branch.name : 'All Branches (Consolidated)';

    const filteredIncome = data?.income?.filter(item =>
        item.ledgerName.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const filteredExpenses = data?.expenses?.filter(item =>
        item.ledgerName.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const handleExport = () => {
        if (!data) return;
        const currLabel = activeCurrency?.code || 'INR';
        const csvContent = [
            ['Report', 'Profit & Loss Statement'],
            ['Branch', `"${branchLabel.replace(/"/g, '""')}"`],
            ['Currency', currLabel],
            ['Period', `${dateRange.startDate || 'Beginning'} to ${dateRange.endDate || 'Present'}`],
            [],
            ['INCOME'],
            ['Ledger Name', 'Group', `Amount [${currLabel}]`],
            ...filteredIncome.map(item => [`"${(item.ledgerName || '').replace(/"/g, '""')}"`, `"${(item.groupName || '').replace(/"/g, '""')}"`, item.amount.toFixed(2)]),
            ['', 'TOTAL INCOME', data.totalIncome.toFixed(2)],
            [''],
            ['EXPENSES'],
            ['Ledger Name', 'Group', `Amount [${currLabel}]`],
            ...filteredExpenses.map(item => [`"${(item.ledgerName || '').replace(/"/g, '""')}"`, `"${(item.groupName || '').replace(/"/g, '""')}"`, item.amount.toFixed(2)]),
            ['', 'TOTAL EXPENSES', data.totalExpenses.toFixed(2)],
            [''],
            ['SUMMARY'],
            [data.isProfitable ? 'Net Profit' : 'Net Loss', '', (Math.abs(data.netProfit) || 0).toFixed(2)]
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const branchFilename = data?.branch ? `_${data.branch.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '_AllBranches';
        a.download = `profit-loss${branchFilename}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    return (
        <div className="p-4 bg-[#f8fafc] min-h-screen text-slate-700">
            {/* Premium Gradient Header */}
            <header className="rounded-xl bg-gradient-to-r from-primary-dark to-primary p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-primary-dark/10 no-print">
                <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
                            <FiTrendingUp className="text-white" size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-normal text-white leading-tight">Profit & Loss Statement</h1>
                            <p className="text-white/80 text-[10px] uppercase font-normal tracking-widest mt-0.5">
                                Corporate Accounting Division • {branchLabel} ({activeCurrency.code})
                            </p>
                        </div>
                    </div>
                    <div className="hidden xl:block h-8 border-l border-white/10 mx-2" />
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full xl:w-auto mt-2 xl:mt-0">
                        {/* Branch Selector */}
                        <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded border border-white/10">
                            <span className="text-[9px] text-white/60 uppercase tracking-tighter">Branch:</span>
                            <select
                                className="bg-transparent border-none p-0 text-xs text-white focus:ring-0 cursor-pointer font-normal [color-scheme:dark]"
                                value={selectedBranch}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedBranch(val);
                                    fetchProfitLoss(val);
                                }}
                            >
                                <option value="" className="text-slate-800">All Branches (Consolidated)</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id} className="text-slate-800">
                                        {b.name} ({b.currencyCode || 'INR'})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] text-white/60 uppercase tracking-tighter">Period</span>
                            <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded border border-white/10">
                                <input
                                    type="date"
                                    className="bg-transparent border-none p-0 text-xs text-white focus:ring-0 cursor-pointer font-normal [color-scheme:dark]"
                                    value={dateRange.startDate}
                                    onChange={e => setDateRange({...dateRange, startDate: e.target.value})}
                                />
                                <span className="text-white/30 text-xs">to</span>
                                <input
                                    type="date"
                                    className="bg-transparent border-none p-0 text-xs text-white focus:ring-0 cursor-pointer font-normal [color-scheme:dark]"
                                    value={dateRange.endDate}
                                    onChange={e => setDateRange({...dateRange, endDate: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="relative">
                            <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" size={14} />
                            <input
                                type="text"
                                placeholder="Search ledgers..."
                                className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/50 w-48 font-normal"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={handleFilter}
                            className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-lg transition-all text-xs font-normal shadow-sm active:scale-95 cursor-pointer"
                        >
                            Apply
                        </button>
                    </div>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-all text-xs font-normal border border-white/10 backdrop-blur-sm shadow-sm cursor-pointer"
                >
                    <FiDownload size={14} className="text-white" /> Export CSV
                </button>
            </header>

            {loading ? (
                <div className="text-center py-20 text-xs text-slate-400 uppercase tracking-widest font-normal animate-pulse">Analyzing Financial Records...</div>
            ) : data ? (
                <div className="space-y-6 overflow-x-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                        {/* INCOME TABLE */}
                        <div className="border border-slate-300 shadow-xl shadow-slate-200/50 bg-white flex flex-col h-full rounded-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-primary-dark to-primary px-4 py-3 border-b border-slate-300 text-xs text-white uppercase font-normal tracking-wider shrink-0">
                                Income Analysis
                            </div>
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full border-collapse min-w-[300px]">
                                    <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 font-medium border-b border-slate-200">
                                        <tr className="whitespace-nowrap">
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200 w-12">#</th>
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200">Particulars</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Amount ({activeCurrency.symbol})</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-normal">
                                        {filteredIncome.length === 0 ? (
                                            <tr><td colSpan="3" className="px-4 py-10 text-center text-slate-400 text-xs uppercase tracking-widest font-medium">No Income Recorded</td></tr>
                                        ) : (
                                            filteredIncome.map((item, index) => (
                                                <tr key={index} className="hover:bg-slate-50 transition-colors text-[13px] text-slate-700">
                                                    <td className="px-4 py-2 text-[10px] text-slate-500 border-r border-slate-100">{index + 1}</td>
                                                    <td className="px-4 py-2 border-r border-slate-100">
                                                        <div className="font-medium text-[13px]">{item.ledgerName}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-tighter mt-0.5">{item.groupName}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums text-primary-dark font-medium">
                                                        {formatCurrency(item.amount, activeCurrency)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                        {/* Vertical Spacer */}
                                        {[...Array(Math.max(0, 12 - filteredIncome.length))].map((_, i) => (
                                            <tr key={`empty-inc-${i}`} className="h-12">
                                                <td className="border-r border-slate-100"></td>
                                                <td className="border-r border-slate-100"></td>
                                                <td></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gradient-to-r from-primary-dark to-primary border-t border-slate-300 px-4 py-3 flex justify-between items-center text-white shrink-0 mt-auto">
                                <span className="font-normal uppercase text-xs">Total Operating Income</span>
                                <span className="tabular-nums font-medium text-sm">
                                    {formatCurrency(data.totalIncome, activeCurrency)}
                                </span>
                            </div>
                        </div>

                        {/* EXPENSES TABLE */}
                        <div className="border border-slate-300 shadow-xl shadow-slate-200/50 bg-white flex flex-col h-full rounded-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-primary-dark to-primary px-4 py-3 border-b border-slate-300 text-xs text-white uppercase font-normal tracking-wider shrink-0">
                                Expense Analysis
                            </div>
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full border-collapse min-w-[300px]">
                                    <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 font-medium border-b border-slate-200">
                                        <tr className="whitespace-nowrap">
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200 w-12">#</th>
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200">Particulars</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Amount ({activeCurrency.symbol})</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-normal">
                                        {filteredExpenses.length === 0 ? (
                                            <tr><td colSpan="3" className="px-4 py-10 text-center text-slate-400 text-xs uppercase tracking-widest font-medium">No Expenses Recorded</td></tr>
                                        ) : (
                                            filteredExpenses.map((item, index) => (
                                                <tr key={index} className="hover:bg-slate-50 transition-colors text-[13px] text-slate-700">
                                                    <td className="px-4 py-2 text-[10px] text-slate-500 border-r border-slate-100">{index + 1}</td>
                                                    <td className="px-4 py-2 border-r border-slate-100">
                                                        <div className="font-medium text-[13px]">{item.ledgerName}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-tighter mt-0.5">{item.groupName}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums text-rose-600 font-medium">
                                                        {formatCurrency(item.amount, activeCurrency)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                        {/* Vertical Spacer */}
                                        {[...Array(Math.max(0, 12 - filteredExpenses.length))].map((_, i) => (
                                            <tr key={`empty-exp-${i}`} className="h-12">
                                                <td className="border-r border-slate-100"></td>
                                                <td className="border-r border-slate-100"></td>
                                                <td></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gradient-to-r from-primary-dark to-primary border-t border-slate-300 px-4 py-3 flex justify-between items-center text-white shrink-0 mt-auto">
                                <span className="font-normal uppercase text-xs">Total Operating Expenses</span>
                                <span className="tabular-nums font-medium text-sm">
                                    {formatCurrency(data.totalExpenses, activeCurrency)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* FINAL SUMMARY ROW */}
                    <div className="p-0.5 bg-gradient-to-r from-primary-dark to-primary rounded-xl overflow-hidden shadow-xl ring-1 ring-white/10">
                        <div className="bg-white/5 backdrop-blur-md px-8 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <span className="block text-white/60 uppercase text-[10px] tracking-[0.2em] font-normal mb-1">Statement Summary</span>
                                <h3 className="text-white text-xl font-normal tracking-tight">
                                    {data.isProfitable ? 'Operational Surplus (Net Profit)' : 'Operational Deficit (Net Loss)'}
                                </h3>
                            </div>
                            <div className="text-left md:text-right">
                                <span className="text-3xl font-normal text-white tabular-nums tracking-tighter">
                                    {formatCurrency(Math.abs(data.netProfit), activeCurrency)}
                                </span>
                                <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Reflected in Retained Earnings</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-center text-[10px] text-slate-300 uppercase tracking-[0.3em] font-normal pt-4 no-print">
                        Computer Generated Document - Professional Accounting Mode
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 text-slate-300 text-xs font-normal uppercase tracking-widest">No Analysis Available</div>
            )}

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0; padding: 0.5in; }
                    .bg-gradient-to-r { background: var(--primary) !important; -webkit-print-color-adjust: exact; }
                    .text-white { color: white !important; -webkit-print-color-adjust: exact; }
                    .border-slate-300 { border-color: #cbd5e1 !important; }
                    .grid { display: flex !important; flex-direction: row !important; gap: 20px !important; }
                    .grid > div { flex: 1 !important; }
                }
            `}</style>
        </div>
    );
}
