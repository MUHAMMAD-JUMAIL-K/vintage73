import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { formatCurrency } from '@/lib/currency';

export default function BalanceSheet() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

    // Branch Filtering
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');

    useEffect(() => {
        fetchBranches();
        fetchBalanceSheet();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data || []);
        } catch (err) {
            console.error('Failed to load branches', err);
        }
    };

    const fetchBalanceSheet = async (overrideBranchId) => {
        setLoading(true);
        const targetBranchId = overrideBranchId !== undefined ? overrideBranchId : selectedBranch;
        try {
            const params = new URLSearchParams();
            if (asOfDate) params.append('asOfDate', asOfDate);
            if (targetBranchId) params.append('branchId', targetBranchId);
            
            const res = await api.get(`/accounting/reports/balance-sheet?${params}`);
            setData(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load balance sheet');
        } finally {
            setLoading(false);
        }
    };

    const activeCurrency = data?.currency || { code: 'INR', symbol: '₹' };
    const branchLabel = data?.branch ? data.branch.name : 'All Branches (Consolidated)';

    return (
        <div className="p-4 bg-[#f8fafc] min-h-screen text-slate-700">
            {/* Premium Gradient Header */}
            <header className="rounded-xl bg-gradient-to-r from-primary-dark to-primary p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-primary-dark/10 no-print">
                <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
                            <FiLayers className="text-white" size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-normal text-white leading-tight">Financial Balance Sheet</h1>
                            <p className="text-white/80 text-[10px] uppercase font-normal tracking-widest mt-0.5">
                                Corporate Accounting Division • {branchLabel} ({activeCurrency.code})
                            </p>
                        </div>
                    </div>
                    <div className="hidden xl:block h-8 border-l border-white/10 mx-2" />
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
                        {/* Branch Selector */}
                        <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded border border-white/10">
                            <span className="text-[9px] text-white/60 uppercase tracking-tighter">Branch:</span>
                            <select
                                className="bg-transparent border-none p-0 text-xs text-white focus:ring-0 cursor-pointer font-normal [color-scheme:dark]"
                                value={selectedBranch}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedBranch(val);
                                    fetchBalanceSheet(val);
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
                        <div className="flex flex-col flex-1 md:flex-none">
                            <span className="text-[9px] text-white/60 uppercase tracking-tighter">Reporting Date</span>
                            <input
                                type="date"
                                className="bg-transparent border-none p-0 text-sm text-white focus:ring-0 cursor-pointer font-normal [color-scheme:dark] w-full"
                                value={asOfDate}
                                onChange={e => setAsOfDate(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => fetchBalanceSheet()}
                            className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-lg transition-all text-xs font-normal shadow-sm active:scale-95 whitespace-nowrap cursor-pointer"
                        >
                            Update Report
                        </button>
                    </div>
                </div>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-all text-xs font-normal border border-white/10 backdrop-blur-sm shadow-sm cursor-pointer"
                >
                    <FiDownload size={14} className="text-white" /> Export PDF / Print
                </button>
            </header>

            {loading ? (
                <div className="text-center py-20 text-xs text-slate-400 uppercase tracking-widest font-normal">Processing Ledgers...</div>
            ) : data ? (
                <div className="overflow-x-auto text-[13px] font-normal">
                    {/* Integrity Summary Row */}
                    <div className={`mb-4 px-4 py-2 border rounded-xl shadow-sm ${data.balanced ? 'bg-primary-light/20 border-primary-light text-primary-dark' : 'bg-red-50 border-red-200 text-red-800'}`}>
                        <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                                {data.balanced ? <FiCheckCircle size={14} /> : <FiAlertCircle size={14} />}
                                <span>{data.balanced ? 'Equilibrium Maintained' : 'Out of Balance!'}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 md:gap-6 mt-2 sm:mt-0 font-mono">
                                <span>Assets: {formatCurrency(data.totalAssets, activeCurrency)}</span>
                                <span>Lia + Eq: {formatCurrency(data.totalLiabilities + data.totalEquity, activeCurrency)}</span>
                                <span>Variance: {formatCurrency(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)), activeCurrency)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                        {/* ASSETS TABLE */}
                        <div className="border border-slate-300 shadow-xl shadow-slate-200/50 bg-white flex flex-col h-full rounded-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-primary-dark to-primary px-4 py-3 border-b border-slate-300 text-xs text-white uppercase font-normal tracking-wider shrink-0">
                                Assets (Application of Funds)
                            </div>
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full border-collapse min-w-[300px]">
                                    <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 font-medium border-b border-slate-200">
                                        <tr className="whitespace-nowrap">
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200 w-12">#</th>
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200">Account Name</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Amount ({activeCurrency.symbol})</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.assets.length === 0 ? (
                                            <tr><td colSpan="3" className="px-4 py-10 text-center text-slate-400 text-xs uppercase tracking-widest font-medium">No Assets Recorded</td></tr>
                                        ) : (
                                            data.assets.map((item, index) => (
                                                <tr key={index} className="hover:bg-slate-50 transition-colors text-slate-700">
                                                    <td className="px-4 py-2 text-[10px] text-slate-500 border-r border-slate-100">{index + 1}</td>
                                                    <td className="px-4 py-2 border-r border-slate-100">
                                                        <div className="font-medium text-[13px]">{item.ledgerName}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-tighter mt-0.5">{item.groupName}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                                                        {formatCurrency(item.amount, activeCurrency)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                        {/* Vertical Spacer */}
                                        {[...Array(Math.max(0, 10 - data.assets.length))].map((_, i) => (
                                            <tr key={`empty-${i}`} className="h-12">
                                                <td className="border-r border-slate-100"></td>
                                                <td className="border-r border-slate-100"></td>
                                                <td></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gradient-to-r from-primary-dark to-primary border-t border-slate-300 px-4 py-3 flex justify-between items-center text-white shrink-0 mt-auto">
                                <span className="font-normal uppercase text-xs">Total Assets</span>
                                <span className="tabular-nums font-medium text-sm">{formatCurrency(data.totalAssets, activeCurrency)}</span>
                            </div>
                        </div>

                        {/* LIABILITIES & EQUITY TABLE */}
                        <div className="border border-slate-300 shadow-xl shadow-slate-200/50 bg-white flex flex-col h-full rounded-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-primary-dark to-primary px-4 py-3 border-b border-slate-300 text-xs text-white uppercase font-normal tracking-wider shrink-0">
                                Liabilities & Equity (Sources of Funds)
                            </div>
                            
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full border-collapse min-w-[300px]">
                                    <thead className="bg-slate-100 text-[11px] uppercase text-slate-600 font-medium border-b border-slate-200">
                                        <tr className="whitespace-nowrap">
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200 w-12">#</th>
                                            <th className="px-4 py-2.5 text-left font-medium border-r border-slate-200">Account Name</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Amount ({activeCurrency.symbol})</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        <tr>
                                            <td colSpan="3" className="px-4 py-1.5 bg-slate-50 text-[10px] text-slate-500 uppercase font-semibold tracking-widest border-b border-slate-100">
                                                Liabilities
                                            </td>
                                        </tr>
                                        {data.liabilities.map((item, index) => (
                                            <tr key={index} className="hover:bg-slate-50 transition-colors text-slate-700">
                                                <td className="px-4 py-2 text-[10px] text-slate-500 border-r border-slate-100">{index + 1}</td>
                                                <td className="px-4 py-2 border-r border-slate-100">
                                                    <div className="font-medium text-[13px]">{item.ledgerName}</div>
                                                    <div className="text-[10px] text-slate-500 uppercase tracking-tighter mt-0.5">{item.groupName}</div>
                                                </td>
                                                <td className="px-4 py-2 text-right tabular-nums font-medium">
                                                    {formatCurrency(item.amount, activeCurrency)}
                                                </td>
                                            </tr>
                                        ))}
                                        
                                        <tr>
                                            <td colSpan="3" className="px-4 py-1.5 bg-slate-50 text-[10px] text-slate-500 uppercase font-semibold tracking-widest border-b border-t border-slate-100 mt-2">
                                                Equity & Retained Earnings
                                            </td>
                                        </tr>
                                        {data.equity.map((item, index) => (
                                            <tr key={`eq-${index}`} className="hover:bg-slate-50 transition-colors text-slate-700">
                                                <td className="px-4 py-2 text-[10px] text-slate-500 border-r border-slate-100">{index + 1}</td>
                                                <td className="px-4 py-2 border-r border-slate-100">
                                                    <div className="font-medium text-[13px]">{item.ledgerName}</div>
                                                    <div className="text-[10px] text-slate-500 uppercase tracking-tighter mt-0.5">{item.groupName}</div>
                                                </td>
                                                <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-dark">
                                                    {formatCurrency(item.amount, activeCurrency)}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Vertical Spacer */}
                                        {[...Array(Math.max(0, 10 - (data.liabilities.length + data.equity.length)))].map((_, i) => (
                                            <tr key={`empty-lia-${i}`} className="h-12">
                                                <td className="border-r border-slate-100"></td>
                                                <td className="border-r border-slate-100"></td>
                                                <td></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gradient-to-r from-primary-dark to-primary border-t border-slate-300 px-4 py-3 flex justify-between items-center text-white shrink-0 mt-auto">
                                <span className="font-normal uppercase text-xs">Total Lia + Eq</span>
                                <span className="tabular-nums font-medium text-sm">{formatCurrency(data.totalLiabilities + data.totalEquity, activeCurrency)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8 text-center text-[10px] text-slate-300 uppercase tracking-[0.3em] font-normal no-print">
                        Computer Generated Document - Professional Accounting Mode
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 text-slate-300 text-xs font-normal uppercase tracking-widest">No Data Available</div>
            )}

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0; padding: 0.5in; }
                    .bg-slate-100 { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
                    .bg-slate-50 { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }
                    .border-slate-300 { border-color: #cbd5e1 !important; }
                    .grid { display: flex !important; flex-direction: row !important; }
                    .grid > div { flex: 1 !important; }
                }
            `}</style>
        </div>
    );
}
