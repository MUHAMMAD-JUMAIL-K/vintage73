import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import {
    FiCheckCircle,
    FiSearch,
    FiFilter,
    FiCreditCard,
    FiBook,
    FiArrowRight,
    FiCalendar,
    FiInfo,
    FiSave
} from 'react-icons/fi';
import { useTheme } from '@/context/ThemeContext';
import SearchableSelect from '@/components/SearchableSelect';
import { formatCurrency } from '@/lib/currency';

export default function BankReconciliation() {
    const { theme } = useTheme();
    const [ledgers, setLedgers] = useState([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [reconData, setReconData] = useState({}); // Stores bankDate and remarks per entryId

    useEffect(() => {
        fetchBankLedgers();
    }, []);

    const fetchBankLedgers = async () => {
        try {
            const res = await api.get('/accounting/ledgers');
            // Filter by "Bank Accounts" or "Cash-in-Hand" or similar groups if needed
            // For now, filtering by Bank-related names or groups
            const bankLedgers = res.data.filter(l =>
                l.group?.name === 'Bank Accounts' ||
                l.group?.name === 'Cash-in-Hand' ||
                l.name.toLowerCase().includes('bank')
            );
            setLedgers(bankLedgers.map(l => ({ value: l.id, label: `${l.name} (${l.group?.name})` })));
        } catch (err) {
            toast.error("Failed to load ledgers");
        }
    };

    const fetchReconData = async (ledgerId) => {
        if (!ledgerId) return;
        setLoading(true);
        try {
            const [transRes, summaryRes] = await Promise.all([
                api.get(`/accounting/reconciliation/transactions?ledgerId=${ledgerId}`),
                api.get(`/accounting/reconciliation/summary?ledgerId=${ledgerId}`)
            ]);
            setTransactions(transRes.data);
            setSummary(summaryRes.data);

            // Pre-fill reconData with voucher dates as default bank dates
            const initialRecon = {};
            transRes.data.forEach(tx => {
                initialRecon[tx.id] = {
                    bankDate: new Date(tx.voucher.date).toISOString().split('T')[0],
                    remarks: ''
                };
            });
            setReconData(initialRecon);
        } catch (err) {
            toast.error("Failed to load reconciliation data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedLedgerId) {
            fetchReconData(selectedLedgerId);
        } else {
            setTransactions([]);
            setSummary(null);
        }
    }, [selectedLedgerId]);

    const handleReconUpdate = (entryId, field, value) => {
        setReconData(prev => ({
            ...prev,
            [entryId]: { ...prev[entryId], [field]: value }
        }));
    };

    const handleReconcile = async (entryId) => {
        const data = reconData[entryId];
        if (!data.bankDate) return toast.error("Please select a bank date");

        try {
            await api.post('/accounting/reconciliation/reconcile', {
                reconciliations: [{
                    entryId,
                    bankDate: data.bankDate,
                    remarks: data.remarks
                }]
            });
            toast.success("Transaction reconciled");
            fetchReconData(selectedLedgerId);
        } catch (err) {
            toast.error("Reconciliation failed");
        }
    };

    const filteredTransactions = transactions.filter(tx =>
        tx.voucher.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.voucher.reference || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-4 sm:p-6 w-full min-h-screen bg-slate-50 animate-in fade-in duration-500">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg text-white">
                            <FiCheckCircle size={24} />
                        </div>
                        Bank Reconciliation
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Match system vouchers with your bank statement clearances</p>
                </div>

                <div className="w-full md:w-80">
                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-2 ml-1">Select Bank Account</label>
                    <SearchableSelect
                        options={ledgers}
                        value={selectedLedgerId}
                        onChange={setSelectedLedgerId}
                        placeholder="Choose Bank Ledger..."
                        className="bg-white shadow-sm"
                    />
                </div>
            </header>

            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <SummaryCard
                        title="Balance as per Books"
                        amount={summary.systemBalance}
                        icon={<FiBook className="text-blue-500" />}
                        hint="System posted records"
                    />
                    <div className="flex items-center justify-center text-slate-300">
                        <FiArrowRight size={24} className="hidden md:block" />
                    </div>
                    <SummaryCard
                        title="Balance as per Bank"
                        amount={summary.bankBalance}
                        icon={<FiCreditCard className="text-emerald-500" />}
                        hint="Cleared (Reconciled) amount"
                        highlight
                    />
                    <SummaryCard
                        title="Unreconciled Amount"
                        amount={summary.unreconciledAmount}
                        icon={<FiInfo className="text-red-400" />}
                        hint={`${summary.unreconciledCount} pending transactions`}
                        warning
                    />
                </div>
            )}

            {!selectedLedgerId ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-20 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                        <FiCreditCard size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-700">No Account Selected</h3>
                    <p className="text-slate-400 max-w-xs mx-auto mt-2">Please select a bank or cash ledger above to start the reconciliation process.</p>
                </div>
            ) : loading ? (
                <div className="p-20 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-slate-500 font-medium uppercase tracking-widest text-xs">Syncing Transactions...</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Unreconciled Transactions</h2>
                        <div className="relative w-full md:w-64">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search reference or amount..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto shadow-sm border border-slate-200">
                        <table className="w-full text-left border-collapse table-modern">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider font-medium text-slate-500 whitespace-nowrap">
                                    <th className="px-6 py-4">System Date</th>
                                    <th className="px-6 py-4">Voucher Info</th>
                                    <th className="px-6 py-4">Tx Path</th>
                                    <th className="px-6 py-4 text-right">Debit</th>
                                    <th className="px-6 py-4 text-right">Credit</th>
                                    <th className="px-6 py-4">Clear Date (Bank)</th>
                                    <th className="px-6 py-4">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-12 text-center text-slate-400 italic">No unreconciled transactions found.</td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(tx => (
                                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-slate-600">
                                                {new Date(tx.voucher.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-slate-900">{tx.voucher.voucherNumber}</span>
                                                    <span className="text-[10px] text-slate-400 uppercase font-medium">{tx.voucher.voucherType}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[11px] font-medium text-slate-700">
                                                        {tx.debitLedgerId === parseInt(selectedLedgerId) ? `From: ${tx.creditLedger?.name}` : `To: ${tx.debitLedger?.name}`}
                                                    </span>
                                                    {tx.description && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{tx.description}</p>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-blue-600 tabular-nums">
                                                {tx.debitLedgerId === parseInt(selectedLedgerId) ? formatCurrency(parseFloat(tx.amount), tx.voucher?.branch || 'INR') : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-red-500 tabular-nums">
                                                {tx.creditLedgerId === parseInt(selectedLedgerId) ? formatCurrency(parseFloat(tx.amount), tx.voucher?.branch || 'INR') : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <input
                                                    type="date"
                                                    className="border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={reconData[tx.id]?.bankDate || ''}
                                                    onChange={e => handleReconUpdate(tx.id, 'bankDate', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => handleReconcile(tx.id)}
                                                    className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all border border-emerald-100"
                                                >
                                                    <FiSave size={14} /> Clear
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ title, amount, icon, hint, highlight, warning }) {
    return (
        <div className={`p-5 rounded-2xl border ${highlight ? 'bg-emerald-50 border-emerald-100' : warning ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'} shadow-sm`}>
            <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] font-medium uppercase tracking-widest ${highlight ? 'text-emerald-600' : warning ? 'text-red-600' : 'text-slate-400'}`}>{title}</span>
                <div className="p-2 rounded-lg bg-white shadow-sm ring-1 ring-slate-100">
                    {icon}
                </div>
            </div>
            <div className={`text-xl font-bold tabular-nums ${highlight ? 'text-emerald-700' : warning ? 'text-red-700' : 'text-slate-900'}`}>
                {formatCurrency(Math.abs(amount || 0), 'INR')}
                <span className="text-[10px] ml-1 font-medium">{(amount || 0) >= 0 ? 'Dr' : 'Cr'}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{hint}</p>
        </div>
    );
}
