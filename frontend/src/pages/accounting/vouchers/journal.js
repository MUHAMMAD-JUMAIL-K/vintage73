import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiBook, FiPlus, FiTrash2, FiSave, FiList, FiEdit2, FiCalendar, FiPrinter, FiX, FiSearch } from 'react-icons/fi';
import ConfirmationModal from '@/components/ConfirmationModal';
import ProfessionalModal from '@/components/ProfessionalModal';
import VoucherPrint from '@/components/VoucherPrint';
import SearchableSelect from '@/components/SearchableSelect';
import { formatCurrency } from '@/lib/currency';

export default function JournalEntry() {
    const [ledgers, setLedgers] = useState([]);
    const [activeTab, setActiveTab] = useState('create');
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        narration: '',
        reference: ''
    });

    // Grid Entries State: Unified array of objects
    const [entries, setEntries] = useState([
        { ledgerId: '', debitAmount: '', creditAmount: '', description: '' },
        { ledgerId: '', debitAmount: '', creditAmount: '', description: '' }
    ]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    // History State
    const [vouchers, setVouchers] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [editId, setEditId] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    // Print State
    const [printVoucher, setPrintVoucher] = useState(null);

    // Filter State
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterLedgerId, setFilterLedgerId] = useState('');

    useEffect(() => {
        fetchLedgers();
        fetchHistory();
    }, []);

    const fetchLedgers = async () => {
        try {
            const res = await api.get('/accounting/ledgers');
            setLedgers(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load ledgers');
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            let url = `/accounting/vouchers?voucherType=JOURNAL`;
            if (filterStartDate) url += `&startDate=${filterStartDate}`;
            if (filterEndDate) url += `&endDate=${filterEndDate}`;
            if (filterLedgerId) url += `&ledgerId=${filterLedgerId}`;

            const res = await api.get(url);
            setVouchers(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load voucher history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const clearFilters = () => {
        setFilterStartDate('');
        setFilterEndDate('');
        setFilterLedgerId('');
        fetchHistoryWithParams('', '', '');
    };

    const fetchHistoryWithParams = async (start, end, ledger) => {
        setHistoryLoading(true);
        try {
            let url = `/accounting/vouchers?voucherType=JOURNAL`;
            if (start) url += `&startDate=${start}`;
            if (end) url += `&endDate=${end}`;
            if (ledger) url += `&ledgerId=${ledger}`;

            const res = await api.get(url);
            setVouchers(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load voucher history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const addRow = () => {
        setEntries([...entries, { ledgerId: '', debitAmount: '', creditAmount: '', description: '' }]);
    };

    const removeRow = (index) => {
        if (entries.length > 2) {
            setEntries(entries.filter((_, i) => i !== index));
        }
    };

    const updateEntry = (index, field, value) => {
        const updated = [...entries];

        // If updating debit, clear credit and vice versa
        if (field === 'debitAmount' && value !== '') {
            updated[index].creditAmount = '';
        } else if (field === 'creditAmount' && value !== '') {
            updated[index].debitAmount = '';
        }

        updated[index][field] = value;
        setEntries(updated);
    };

    const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debitAmount) || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.creditAmount) || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);
    const isBalanced = difference < 0.01 && totalDebit > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isBalanced) {
            toast.error(`Voucher is not balanced. Current Difference: ${formatCurrency(difference, 'INR')}`);
            return;
        }

        // Validate that all rows have a ledger and an amount
        const invalidRows = entries.filter(e => !e.ledgerId || (!e.debitAmount && !e.creditAmount));
        if (invalidRows.length > 0) {
            toast.error('Please ensure all rows have a ledger and an amount (Debit or Credit)');
            return;
        }

        // Open professional confirmation instead of immediate submit
        setIsSaveModalOpen(true);
    };

    const confirmSave = async () => {
        setIsSaveModalOpen(false);
        setIsSubmitting(true);
        try {
            const apiEntries = entries.map(e => ({
                ledgerId: e.ledgerId,
                type: e.debitAmount ? 'DEBIT' : 'CREDIT',
                amount: parseFloat(e.debitAmount || e.creditAmount),
                description: e.description
            }));

            let res;
            if (editId) {
                const updatePayload = {
                    ...formData,
                    entries: apiEntries,
                    totalAmount: totalDebit,
                    voucherType: 'JOURNAL'
                };
                res = await api.put(`/accounting/vouchers/${editId}`, updatePayload);
                toast.success('Journal entry updated successfully!');
            } else {
                res = await api.post('/accounting/vouchers/journal', {
                    ...formData,
                    entries: apiEntries
                });
                toast.success(`Journal entry ${res.data.voucherNumber} created successfully!`);
            }

            const savedVoucher = res.data;
            if (window.confirm('Journal entry saved. Do you want to print the voucher?')) {
                const fullVoucher = await api.get(`/accounting/vouchers/${savedVoucher.id}`);
                setPrintVoucher(fullVoucher.data);
            }

            resetForm();
            setActiveTab('history');
            fetchHistory();
            fetchLedgers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save journal entry');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            narration: '',
            reference: ''
        });
        setEntries([
            { ledgerId: '', debitAmount: '', creditAmount: '', description: '' },
            { ledgerId: '', debitAmount: '', creditAmount: '', description: '' }
        ]);
        setEditId(null);
    };

    const handleEdit = (v) => {
        setEditId(v.id);
        setFormData({
            date: new Date(v.date).toISOString().split('T')[0],
            narration: v.narration || '',
            reference: v.reference || ''
        });

        // Map original API entries back to grid format
        const gridEntries = v.entries.map(e => ({
            ledgerId: e.debitLedgerId || e.creditLedgerId,
            debitAmount: e.debitLedgerId ? e.amount : '',
            creditAmount: e.creditLedgerId ? e.amount : '',
            description: e.description || ''
        }));
        setEntries(gridEntries);
        setActiveTab('create');
    };

    const handleDeleteClick = (id) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/accounting/vouchers/${deleteId}`);
            toast.success('Voucher deleted successfully');
            fetchHistory();
        } catch (err) {
            toast.error('Failed to delete voucher');
        } finally {
            setIsDeleteModalOpen(false);
        }
    };

    return (
        <div className="w-full p-4 md:p-6 min-h-screen bg-slate-50/50 animate-in fade-in duration-300">
            {printVoucher && (
                <VoucherPrint
                    voucher={printVoucher}
                    onClose={() => setPrintVoucher(null)}
                />
            )}

            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg transform -rotate-1">
                            <FiBook className="text-white" size={20} />
                        </div>
                        Journal Voucher
                    </h1>
                    <p className="text-slate-500 text-[10px] font-medium mt-1 ml-13 uppercase tracking-wider">Double-entry accounting console</p>
                </div>

                <div className="flex bg-white/80 backdrop-blur-sm p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
                    <button
                        onClick={() => { setActiveTab('create'); if (!editId) resetForm(); }}
                        className={`px-5 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'create' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <FiPlus size={14} /> {editId ? 'EDIT VOUCHER' : 'NEW VOUCHER'}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-5 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <FiList size={14} /> HISTORY
                    </button>
                </div>
            </header>

            {activeTab === 'create' ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                        {/* Status Bar */}
                        <div className={`px-6 py-2 flex justify-between items-center ${isBalanced ? 'bg-primary' : 'bg-red-600'} transition-colors duration-500`}>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-medium text-white/70 uppercase tracking-widest">Transaction Status:</span>
                                <span className="text-xs font-medium text-white uppercase tracking-wider">
                                    {isBalanced ? 'READY TO POST (BALANCED)' : `UNBALANCED (DIFF: ${formatCurrency(difference, 'INR')})`}
                                </span>
                            </div>
                            {editId && (
                                <button onClick={resetForm} className="text-[10px] font-medium text-white uppercase tracking-wider hover:underline flex items-center gap-1">
                                    <FiX size={14} /> Cancel Editing
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
                            {/* Meta Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Voucher Date</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-primary transition-colors">
                                            <FiCalendar size={18} className="text-slate-400 group-focus-within:text-primary" />
                                        </div>
                                        <input
                                            required
                                            type="date"
                                            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm font-semibold transition-all"
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Reference No. (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm font-semibold transition-all"
                                        value={formData.reference}
                                        onChange={e => setFormData({ ...formData, reference: e.target.value })}
                                        placeholder="Ex: BN-1002"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Voucher Serial</label>
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 h-[46px]">
                                        <div className="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center font-medium text-xs text-slate-800">
                                            #
                                        </div>
                                        <span className="text-xs font-semibold text-slate-400 italic">Auto-generated</span>
                                    </div>
                                </div>
                            </div>

                            {/* Entry Table Grid */}
                            <div className="border border-primary-light rounded-lg mb-6 shadow-sm table-container scroll-line lg:no-scrollbar overflow-x-auto">
                                <table className="table-modern w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-primary-dark whitespace-nowrap">
                                            <th className="px-5 py-3 text-[10px] font-medium text-white uppercase tracking-wider w-[40%]">Account Particulars</th>
                                            <th className="px-5 py-3 text-[10px] font-medium text-white uppercase tracking-wider w-[18%] text-right bg-primary-dark/80">Debit (Dr)</th>
                                            <th className="px-5 py-3 text-[10px] font-medium text-white uppercase tracking-wider w-[18%] text-right bg-primary-dark/80">Credit (Cr)</th>
                                            <th className="px-5 py-3 text-[10px] font-medium text-white uppercase tracking-wider w-[18%]">Line Narration</th>
                                            <th className="px-5 py-3 text-center w-[6%] text-white/40">#</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {entries.map((entry, idx) => {
                                            const selectedLedger = ledgers.find(l => l.id == entry.ledgerId);
                                            return (
                                                <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-3 py-2">
                                                        <div className="flex flex-col gap-1">
                                                            <SearchableSelect
                                                                options={ledgers.map(l => ({ value: l.id, label: `${l.name} (${l.group?.name})` }))}
                                                                value={entry.ledgerId}
                                                                onChange={val => updateEntry(idx, 'ledgerId', val)}
                                                                placeholder="Select Account..."
                                                                className="h-10"
                                                            />
                                                            {selectedLedger && (
                                                                <div className="flex items-center gap-2 pl-2">
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${selectedLedger.currentBalance >= 0 ? 'bg-primary' : 'bg-red-500'}`} />
                                                                    <span className="text-[10px] font-semibold text-slate-400">
                                                                        Balance: {formatCurrency(Math.abs(selectedLedger.currentBalance), 'INR')} {selectedLedger.currentBalance >= 0 ? 'Dr' : 'Cr'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 bg-red-50/10 group-hover:bg-red-50/30 transition-colors">
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-red-400">Dr</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                className="w-full pl-7 pr-2 py-2 bg-transparent border border-transparent focus:border-red-500 focus:ring-0 rounded-lg text-sm font-medium text-red-600 text-right tabular-nums transition-all outline-none"
                                                                value={entry.debitAmount}
                                                                onChange={e => updateEntry(idx, 'debitAmount', e.target.value)}
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 bg-primary-light/10 group-hover:bg-primary-light/30 transition-colors">
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-primary">Cr</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                className="w-full pl-7 pr-2 py-2 bg-transparent border border-transparent focus:border-primary focus:ring-0 rounded-lg text-sm font-medium text-primary text-right tabular-nums transition-all outline-none"
                                                                value={entry.creditAmount}
                                                                onChange={e => updateEntry(idx, 'creditAmount', e.target.value)}
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 border-x border-slate-100">
                                                        <input
                                                            type="text"
                                                            className="w-full bg-white border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary rounded-lg text-[11px] font-medium text-slate-600 p-2 transition-all outline-none italic"
                                                            value={entry.description}
                                                            onChange={e => updateEntry(idx, 'description', e.target.value)}
                                                            placeholder="Line narration..."
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeRow(idx)}
                                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                                            disabled={entries.length <= 2}
                                                        >
                                                            <FiTrash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-primary-dark text-white">
                                            <td className="px-5 py-3">
                                                <button
                                                    type="button"
                                                    onClick={addRow}
                                                    className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all border border-white/10"
                                                >
                                                    <FiPlus size={12} /> Add Line Item
                                                </button>
                                            </td>
                                            <td className="px-5 py-3 text-right bg-primary-dark/80">
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[9px] font-medium text-white/50 uppercase tracking-widest">Total DR</span>
                                                    <span className="text-sm font-medium tabular-nums">{formatCurrency(totalDebit, 'INR')}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-right bg-primary-dark/80">
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[9px] font-medium text-white/50 uppercase tracking-widest">Total CR</span>
                                                    <span className="text-sm font-medium tabular-nums">{formatCurrency(totalCredit, 'INR')}</span>
                                                </div>
                                            </td>
                                            <td colSpan="2" className="px-5 py-3 bg-primary-darker/20">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[9px] font-medium text-white/50 uppercase tracking-widest">Difference</span>
                                                    <span className={`text-sm font-medium tabular-nums ${difference === 0 ? 'text-primary' : 'text-orange-400'}`}>
                                                        {formatCurrency(difference, 'INR')}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Narration */}
                            <div className="mb-8">
                                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Main Narration / Remarks</label>
                                <textarea
                                    required
                                    rows="2"
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm font-semibold text-slate-800 transition-all resize-none italic"
                                    value={formData.narration}
                                    onChange={e => setFormData({ ...formData, narration: e.target.value })}
                                    placeholder="Enter the overall purpose or description of this journal entry..."
                                />
                            </div>

                            {/* Action Row */}
                            <div className="flex flex-col md:flex-row items-center gap-6 pt-6 border-t border-slate-100">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !isBalanced}
                                    className="w-full md:w-auto px-8 py-4 bg-primary text-white rounded-xl font-medium text-sm uppercase tracking-widest hover:bg-primary-dark hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <FiSave size={18} />
                                    {isSubmitting ? 'PROCESSING...' : (editId ? 'UPDATE VOUCHER' : 'POST JOURNAL ENTRY')}
                                </button>

                                <div className="hidden md:block flex-grow" />

                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${isBalanced ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`} />
                                    <span className={`text-[10px] font-medium uppercase tracking-wider ${isBalanced ? 'text-primary' : 'text-red-500'}`}>
                                        {isBalanced ? 'Integrity Check Passed' : 'Manual Balancing Required'}
                                    </span>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Pro Tip */}
                    <div className="bg-primary-dark rounded-xl p-3 flex items-center gap-3 border-l-4 border-primary shadow-sm">
                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary font-medium text-xs ring-1 ring-primary/20">!</div>
                        <p className="text-[10px] font-semibold text-primary-light uppercase tracking-wider">
                            Journal entries must balance to zero. Ensure total debits equal total credits before posting.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-visible">
                        {/* Filter Bar */}
                        <div className="bg-slate-50/50 p-4 border-b border-slate-200 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Date From</label>
                                    <div className="relative">
                                        <input 
                                            type="date" 
                                            className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md p-1.5 outline-none focus:border-primary focus:ring-1 focus:ring-primary/10 transition-all" 
                                            value={filterStartDate}
                                            onChange={e => setFilterStartDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Date To</label>
                                    <div className="relative">
                                        <input 
                                            type="date" 
                                            className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md p-1.5 outline-none focus:border-primary focus:ring-1 focus:ring-primary/10 transition-all" 
                                            value={filterEndDate}
                                            onChange={e => setFilterEndDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex-1 min-w-[200px] flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Account/Ledger</label>
                                <SearchableSelect
                                    options={ledgers.map(l => ({ value: l.id, label: `${l.name} (${l.group?.name})` }))}
                                    value={filterLedgerId}
                                    onChange={val => setFilterLedgerId(val)}
                                    placeholder="All Accounts..."
                                />
                            </div>

                            <div className="flex items-end gap-2 pt-4">
                                <button 
                                    onClick={fetchHistory}
                                    className="px-6 py-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg uppercase tracking-widest hover:bg-slate-800 shadow-sm hover:shadow transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <FiSearch size={12} /> Search
                                </button>
                                <button 
                                    onClick={clearFilters}
                                    className="px-6 py-2 border border-slate-200 text-slate-500 text-[10px] font-bold rounded-lg uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                        <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                            <table className="table-modern w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider w-[15%]">Date</th>
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider w-[15%]">Voucher No</th>
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider w-[45%]">Particulars</th>
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right w-[15%]">Amount</th>
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-center w-[10%]">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {historyLoading ? (
                                        <tr>
                                            <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-3"></div>
                                                <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Syncing Registry...</span>
                                            </td>
                                        </tr>
                                    ) : vouchers.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-medium uppercase tracking-widest text-[10px]">
                                                No ledger activity found
                                            </td>
                                        </tr>
                                    ) : (
                                        vouchers.map(v => (
                                            <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-slate-800 tracking-tight">
                                                            {new Date(v.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                        <span className="text-[10px] font-medium text-slate-400 uppercase">
                                                            {v.reference || '-'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-medium text-slate-900">{v.voucherNumber}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1 max-w-sm">
                                                        <div className="flex flex-wrap gap-1">
                                                            {v.entries.map((e, idx) => (
                                                                <span key={idx} className={`text-[9px] font-medium px-1.5 py-0.5 rounded uppercase ${e.debitLedgerId ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-primary-light text-primary border border-primary-light'}`}>
                                                                    {e.debitLedger?.name || e.creditLedger?.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <p className="text-[10px] font-medium text-slate-500 italic truncate" title={v.narration}>
                                                            {v.narration}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                                        {formatCurrency(v.totalAmount, v.branch || 'INR')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => setPrintVoucher(v)}
                                                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-light rounded transition-colors"
                                                            title="Print Voucher"
                                                        >
                                                            <FiPrinter size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(v)}
                                                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-light rounded transition-colors"
                                                            title="Adjustment / Edit"
                                                        >
                                                            <FiEdit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(v.id)}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title="Void Voucher"
                                                        >
                                                            <FiTrash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Confirm Cancellation"
                message="Are you sure you want to void this journal entry? This will immediately reverse all ledger impacts. This action cannot be undone."
            />

            <ProfessionalModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onConfirm={confirmSave}
                type="success"
                title={editId ? "Update Journal Entry" : "Post Journal Entry"}
                message={editId ? "Confirm that you want to apply these adjustments to the existing voucher." : "This will create a new journal entry and update ledger balances immediately."}
                confirmText={editId ? "Update Now" : "Post Entry"}
                details={[
                    { label: 'Voucher Date', value: formData.date },
                    { label: 'Account Items', value: entries.filter(e => e.ledgerId).length },
                    { label: 'Total Value', value: formatCurrency(totalDebit, 'INR') },
                    { label: 'Status', value: 'BALANCED' }
                ]}
            />
        </div>
    );
}
