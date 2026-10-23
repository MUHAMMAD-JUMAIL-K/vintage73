import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiBarChart2, FiDownload, FiCheckCircle, FiAlertCircle, FiSearch, FiFileText } from 'react-icons/fi';
import { formatCurrency } from '@/lib/currency';

export default function TrialBalance() {
    const router = useRouter();
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
        fetchTrialBalance();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data || []);
        } catch (err) {
            console.error('Failed to load branches', err);
        }
    };

    const fetchTrialBalance = async (overrideBranchId) => {
        setLoading(true);
        const targetBranchId = overrideBranchId !== undefined ? overrideBranchId : selectedBranch;
        try {
            const params = new URLSearchParams();
            if (dateRange.startDate) params.append('startDate', dateRange.startDate);
            if (dateRange.endDate) params.append('endDate', dateRange.endDate);
            if (targetBranchId) params.append('branchId', targetBranchId);
            
            const res = await api.get(`/accounting/reports/trial-balance?${params}`);
            setData(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load trial balance');
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        fetchTrialBalance();
    };

    const filteredData = data?.trialBalance?.filter(item =>
        item.ledgerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.groupName.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const activeCurrency = data?.currency || { code: 'AED', symbol: 'AED' };
    const branchLabel = data?.branch ? data.branch.name : 'All Branches (Consolidated)';

    const handleExport = () => {
        if (!data) return;
        const currLabel = activeCurrency?.code || 'AED';
        const csvContent = [
            ['Report', 'Trial Balance'],
            ['Branch', `"${branchLabel.replace(/"/g, '""')}"`],
            ['Currency', currLabel],
            ['Period', `${dateRange.startDate || 'Beginning'} to ${dateRange.endDate || 'Present'}`],
            [],
            ['Ledger Name', 'Group', 'Group Type', `Opening Balance [${currLabel}]`, `Debit [${currLabel}]`, `Credit [${currLabel}]`, `Closing Balance [${currLabel}]`],
            ...filteredData.map(item => [
                `"${(item.ledgerName || '').replace(/"/g, '""')}"`,
                `"${(item.groupName || '').replace(/"/g, '""')}"`,
                item.groupType,
                (item.openingBalance || 0).toFixed(2),
                (item.debit || 0).toFixed(2),
                (item.credit || 0).toFixed(2),
                (item.closingBalance || 0).toFixed(2)
            ]),
            ['', '', 'TOTAL', (data.totalOpening || 0).toFixed(2), (data.totalDebit || 0).toFixed(2), (data.totalCredit || 0).toFixed(2), (data.totalClosing || 0).toFixed(2)]
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const branchFilename = data?.branch ? `_${data.branch.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '_AllBranches';
        a.download = `trial-balance${branchFilename}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const handleExportJSON = () => {
        if (!data) return;
        const exportData = {
            reportType: 'Trial Balance',
            branch: branchLabel,
            currency: activeCurrency,
            generatedAt: new Date().toISOString(),
            dateRange: dateRange,
            summary: {
                totalOpening: data.totalOpening,
                totalDebit: data.totalDebit,
                totalCredit: data.totalCredit,
                totalClosing: data.totalClosing,
                isBalanced: data.balanced
            },
            multiCurrencyBreakdown: data.currencyBreakdown || null,
            ledgers: filteredData.map(item => ({
                ledgerName: item.ledgerName,
                groupName: item.groupName,
                groupType: item.groupType,
                openingBalance: item.openingBalance || 0,
                debit: item.debit || 0,
                credit: item.credit || 0,
                closingBalance: item.closingBalance || 0
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const branchFilename = data?.branch ? `_${data.branch.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '_AllBranches';
        a.download = `trial-balance${branchFilename}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    return (
        <div className="p-4 bg-[#f8fafc] min-h-screen text-slate-700">
            {/* Premium Gradient Header */}
            <header className="rounded-xl bg-gradient-to-r from-primary-dark to-primary p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-primary-dark/10 no-print">
                <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
                            <FiBarChart2 className="text-white" size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-normal text-white leading-tight">Trial Balance</h1>
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
                                    fetchTrialBalance(val);
                                }}
                            >
                                <option value="" className="text-slate-800">All Branches (Consolidated)</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id} className="text-slate-800">
                                        {b.name} ({b.currencyCode || 'AED'})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] text-white/60 uppercase tracking-tighter">Period</span>
                            <div className="flex flex-wrap items-center gap-2 bg-white/5 px-2 py-1 rounded border border-white/10">
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
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-all text-[11px] font-normal border border-white/10 backdrop-blur-sm shadow-sm cursor-pointer"
                    >
                        <FiDownload size={14} className="text-white" /> Export CSV
                    </button>
                    <button
                        onClick={handleExportJSON}
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-all text-[11px] font-normal border border-white/10 backdrop-blur-sm shadow-sm cursor-pointer"
                    >
                        <FiFileText size={14} className="text-blue-400" /> Export JSON
                    </button>
                </div>
            </header>

            {/* Integrity Summary Row */}
            {data && (
                <div className={`mb-6 px-4 py-3 border rounded-xl shadow-sm ${data.balanced ? 'bg-primary-light/20 border-primary-light text-primary-dark' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 text-xs">
                        <div className="flex items-center gap-3">
                            {data.balanced ? <FiCheckCircle className="text-primary-dark" size={18} /> : <FiAlertCircle className="text-rose-600" size={18} />}
                            <span className="font-normal uppercase tracking-wider">
                                {data.balanced ? 'Trial Balance Equilibrium Maintained' : 'Accounting Variance Detected!'}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:flex sm:flex-row sm:gap-6 gap-4 items-start sm:items-center tabular-nums w-full lg:w-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200/60 lg:border-none">
                            <div className="flex flex-col items-start sm:items-end">
                                <span className="text-[9px] opacity-60 uppercase">Net Opening</span>
                                <span className="text-sm font-normal">{formatCurrency(data.totalOpening || 0, activeCurrency)}</span>
                            </div>
                            <div className="flex flex-col items-start sm:items-end">
                                <span className="text-[9px] opacity-60 uppercase">Total Debits</span>
                                <span className="text-sm font-normal">{formatCurrency(data.totalDebit || 0, activeCurrency)}</span>
                            </div>
                            <div className="flex flex-col items-start sm:items-end">
                                <span className="text-[9px] opacity-60 uppercase">Total Credits</span>
                                <span className="text-sm font-normal">{formatCurrency(data.totalCredit || 0, activeCurrency)}</span>
                            </div>
                            <div className={`flex flex-col items-start sm:items-end px-0 sm:px-4 border-none sm:border-l ${data.balanced ? 'border-primary-light' : 'border-red-200'}`}>
                                <span className="text-[9px] opacity-60 uppercase">Net Closing</span>
                                <span className="text-sm font-normal">{formatCurrency(data.totalClosing || 0, activeCurrency)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Multi-Currency Consolidated Breakdown (When consolidated) */}
            {data && data.isConsolidated && data.currencyBreakdown && data.currencyBreakdown.length > 0 && (
                <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Multi-Currency Branch Breakdown</h3>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">Distinct currency accounts are isolated to prevent cross-currency summation</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {data.currencyBreakdown.map((cb, idx) => (
                            <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 border-b border-slate-200/60 pb-1.5">
                                    <span>{cb.currencyCode} ({cb.currencySymbol})</span>
                                    <span className="text-[10px] text-slate-500 font-normal truncate max-w-[140px]" title={cb.branchNames.join(', ')}>
                                        {cb.branchNames.join(', ')}
                                    </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Debits</span>
                                        <span className="font-mono font-medium text-slate-700">{formatCurrency(cb.totalDebit, cb.currencyCode)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Credits</span>
                                        <span className="font-mono font-medium text-slate-700">{formatCurrency(cb.totalCredit, cb.currencyCode)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-20 text-xs text-slate-400 uppercase tracking-widest font-normal animate-pulse">Running Ledger Validation...</div>
            ) : data ? (
                <div className="w-full rounded-xl border border-slate-200 shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
                    <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                        <table className="table-modern w-full border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] uppercase text-slate-400 border-b border-slate-200 whitespace-nowrap">
                                    <th className="px-4 py-2 text-left font-normal border-r border-slate-200 w-12">#</th>
                                    <th className="px-4 py-2 text-left font-normal border-r border-slate-200">Account Particulars</th>
                                    <th className="px-4 py-2 text-left font-normal border-r border-slate-200 w-32">Classification</th>
                                    <th className="px-4 py-2 text-right font-normal border-r border-slate-200 w-32">Opening ({activeCurrency.symbol})</th>
                                    <th className="px-4 py-2 text-right font-normal border-r border-slate-200 w-32">Debit ({activeCurrency.symbol})</th>
                                    <th className="px-4 py-2 text-right font-normal border-r border-slate-200 w-32">Credit ({activeCurrency.symbol})</th>
                                    <th className="px-4 py-2 text-right font-normal w-32">Closing ({activeCurrency.symbol})</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-normal">
                                {filteredData.length === 0 ? (
                                    <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-300 text-xs uppercase tracking-widest font-normal">No Ledger Data Found</td></tr>
                                ) : (
                                    filteredData.map((item, index) => (
                                        <tr key={index} className="hover:bg-slate-100/50 transition-colors text-[13px] text-slate-600">
                                            <td className="px-4 py-1.5 text-[10px] text-slate-400 border-r border-slate-100">{index + 1}</td>
                                            <td className="px-4 py-1.5 border-r border-slate-100">
                                                <div 
                                                    className="font-normal text-slate-800 hover:text-primary hover:underline cursor-pointer transition-colors"
                                                    onClick={() => router.push(`/accounting/reports/ledger?ledgerId=${item.ledgerId}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}${selectedBranch ? `&branchId=${selectedBranch}` : ''}`)}
                                                >
                                                    {item.ledgerName}
                                                </div>
                                                <div className="text-[10px] text-slate-400 uppercase tracking-tighter">{item.groupName}</div>
                                            </td>
                                            <td className="px-4 py-1.5 border-r border-slate-100">
                                                <span className={`text-[9px] font-normal uppercase tracking-tighter px-2 py-0.5 rounded border inline-block w-10 text-center ${
                                                    item.groupType === 'ASSETS' ? 'border-blue-200 bg-blue-50 text-blue-600' :
                                                    item.groupType === 'LIABILITIES' ? 'border-rose-200 bg-rose-50 text-rose-600' :
                                                    item.groupType === 'EQUITY' ? 'border-purple-200 bg-purple-50 text-purple-600' :
                                                    item.groupType === 'INCOME' ? 'border-primary-light/50 bg-primary-light/20 text-primary-dark' :
                                                    item.groupType === 'EXPENSES' ? 'border-amber-200 bg-amber-50 text-amber-600' :
                                                    'border-slate-200 bg-slate-50 text-slate-600'
                                                }`}>
                                                    {item.groupType.substring(0, 3)}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-1.5 text-right tabular-nums border-r border-slate-100 font-normal ${(item.openingBalance || 0) >= 0 ? 'text-slate-600' : 'text-rose-600'}`}>
                                                {formatCurrency(item.openingBalance || 0, activeCurrency)}
                                            </td>
                                            <td className="px-4 py-1.5 text-right tabular-nums border-r border-slate-100 font-normal text-slate-600">
                                                {item.debit > 0 ? formatCurrency(item.debit, activeCurrency) : '-'}
                                            </td>
                                            <td className="px-4 py-1.5 text-right tabular-nums border-r border-slate-100 font-normal text-slate-600">
                                                {item.credit > 0 ? formatCurrency(item.credit, activeCurrency) : '-'}
                                            </td>
                                            <td className={`px-4 py-1.5 text-right tabular-nums font-normal ${(item.closingBalance || 0) >= 0 ? 'text-primary-dark' : 'text-rose-600'}`}>
                                                {formatCurrency(item.closingBalance || 0, activeCurrency)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                                {/* Vertical Spacer */}
                                {[...Array(Math.max(0, 15 - filteredData.length))].map((_, i) => (
                                    <tr key={`empty-${i}`} className="h-9">
                                        <td className="border-r border-slate-100"></td>
                                        <td className="border-r border-slate-100"></td>
                                        <td className="border-r border-slate-100"></td>
                                        <td className="border-r border-slate-100"></td>
                                        <td className="border-r border-slate-100"></td>
                                        <td className="border-r border-slate-100"></td>
                                        <td></td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gradient-to-r from-primary-dark to-primary border-t border-slate-300">
                                    <td className="px-4 py-3 font-normal text-white border-r border-white/10 uppercase text-xs" colSpan="3">Grand Trial Totals</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-white font-normal text-sm border-r border-white/10">
                                        {formatCurrency(data.totalOpening || 0, activeCurrency)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-white font-normal text-sm border-r border-white/10">
                                        {formatCurrency(data.totalDebit || 0, activeCurrency)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-white font-normal text-sm border-r border-white/10">
                                        {formatCurrency(data.totalCredit || 0, activeCurrency)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-white font-normal text-sm">
                                        {formatCurrency(data.totalClosing || 0, activeCurrency)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Footer Info */}
                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 no-print">
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-normal">
                            System Generated • High Density Reporting
                        </div>
                        <div className="text-[11px] text-slate-500 font-normal">
                            Displaying {filteredData.length} records
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 text-slate-300 text-xs font-normal uppercase tracking-widest">No Trial Balance Available</div>
            )}

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0; padding: 0.5in; }
                    .bg-gradient-to-r { background: var(--primary) !important; -webkit-print-color-adjust: exact; }
                    .text-white { color: white !important; -webkit-print-color-adjust: exact; }
                    .border-slate-300 { border-color: #cbd5e1 !important; }
                    table { border-collapse: collapse !important; width: 100% !important; }
                }
            `}</style>
        </div>
    );
}
