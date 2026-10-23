import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiDollarSign, FiSave, FiList, FiPlus, FiTrash2, FiEdit2, FiSearch, FiCalendar, FiPrinter, FiX } from 'react-icons/fi';
import ConfirmationModal from '@/components/ConfirmationModal';
import ProfessionalModal from '@/components/ProfessionalModal';
import VoucherPrint from '@/components/VoucherPrint';
import SearchableSelect from '@/components/SearchableSelect';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency } from '@/lib/currency';

export default function PaymentVoucher() {
    const { theme } = useTheme();
    const [ledgers, setLedgers] = useState([]);
    const [activeTab, setActiveTab] = useState('create');
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        paymentAccount: '',
        expenseAccount: '',
        amount: '',
        narration: '',
        reference: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // History State
    const [vouchers, setVouchers] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [editId, setEditId] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    // Filter State
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterLedgerId, setFilterLedgerId] = useState('');
    const [user, setUser] = useState(null);

    // Print State
    const [printVoucher, setPrintVoucher] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try { setUser(JSON.parse(storedUser)); } catch (e) {}
        }
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
            let url = `/accounting/vouchers?voucherType=PAYMENT`;
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
        // We need to fetch again with empty filters
        fetchHistoryWithParams('', '', '');
    };

    // Helper to fetch with explicit params because state update might be async
    const fetchHistoryWithParams = async (start, end, ledger) => {
        setHistoryLoading(true);
        try {
            let url = `/accounting/vouchers?voucherType=PAYMENT`;
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaveModalOpen(true);
    };

    const confirmSave = async () => {
        setIsSaveModalOpen(false);
        setIsSubmitting(true);
        try {
            let res;
            if (editId) {
                const apiEntries = [
                    { type: 'DEBIT', ledgerId: parseInt(formData.expenseAccount), amount: parseFloat(formData.amount), description: formData.narration },
                    { type: 'CREDIT', ledgerId: parseInt(formData.paymentAccount), amount: parseFloat(formData.amount), description: formData.narration }
                ];
                res = await api.put(`/accounting/vouchers/${editId}`, {
                    date: formData.date,
                    narration: formData.narration,
                    reference: formData.reference,
                    totalAmount: parseFloat(formData.amount),
                    entries: apiEntries,
                    voucherType: 'PAYMENT'
                });
                toast.success('Payment voucher updated successfully!');
            } else {
                res = await api.post('/accounting/vouchers/payment', formData);
                toast.success(`Payment voucher ${res.data.voucherNumber} created successfully!`);
            }

            const savedVoucher = res.data;
            if (window.confirm('Voucher saved. Do you want to print it?')) {
                const fullVoucher = await api.get(`/accounting/vouchers/${savedVoucher.id}`);
                setPrintVoucher(fullVoucher.data);
            }

            resetForm();
            setActiveTab('history');
            fetchHistory();
            fetchLedgers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save payment voucher');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            paymentAccount: '',
            expenseAccount: '',
            amount: '',
            narration: '',
            reference: ''
        });
        setEditId(null);
    };

    const handleEdit = (v) => {
        setEditId(v.id);
        const debitEntry = v.entries.find(e => e.type === 'DEBIT' || e.debitLedgerId);
        const creditEntry = v.entries.find(e => e.type === 'CREDIT' || e.creditLedgerId);

        setFormData({
            date: new Date(v.date).toISOString().split('T')[0],
            paymentAccount: creditEntry?.ledgerId || creditEntry?.creditLedgerId || '',
            expenseAccount: debitEntry?.ledgerId || debitEntry?.debitLedgerId || '',
            amount: v.totalAmount,
            narration: v.narration || '',
            reference: v.reference || ''
        });
        setActiveTab('create');
    };

    const handleDeleteClick = (id) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        const idToDelete = deleteId;
        setIsDeleteModalOpen(false);
        setDeleteId(null);
        try {
            await api.delete(`/accounting/vouchers/${idToDelete}`);
            toast.success('Voucher deleted successfully');
            fetchHistory();
        } catch (err) {
            console.error('Delete voucher error:', err);
            toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to delete voucher');
        }
    };

    const handlePrint = (v) => {
        setPrintVoucher(v);
    };

    // Filter ledgers by type
    const cashBankLedgers = ledgers.filter(l =>
        (l.group?.name === 'Bank Accounts' || l.group?.name === 'Cash-in-Hand' || l.group?.name === 'Current Assets') &&
        (l.name.toLowerCase().includes('cash') || l.name.toLowerCase().includes('bank') || l.name.toLowerCase().includes('paytm') || l.name.toLowerCase().includes('upi'))
    );

    const expenseLedgers = ledgers.filter(l =>
        l.group?.groupType === 'EXPENSES' || l.group?.name === 'Current Liabilities' || l.group?.name === 'Sundry Creditors'
    );

    const selectedPaymentAccount = ledgers.find(l => l.id == formData.paymentAccount);
    const selectedExpenseAccount = ledgers.find(l => l.id == formData.expenseAccount);

    return (
        <div className="w-full space-y-6 pb-12 animate-in fade-in duration-300">
            {printVoucher && (
                <VoucherPrint
                    voucher={printVoucher}
                    onClose={() => setPrintVoucher(null)}
                />
            )}

            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center shadow-md">
                            <FiDollarSign className="text-white" size={20} />
                        </div>
                        Payment Voucher
                    </h1>
                    <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">Record cash or bank payments</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-lg w-fit shadow-inner">
                    <button
                        onClick={() => { setActiveTab('create'); if (!editId) resetForm(); }}
                        className={`px-5 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'create' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <FiPlus /> {editId ? 'EDIT ENTRY' : 'NEW ENTRY'}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-5 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <FiList /> HISTORY
                    </button>
                </div>
            </header>

            {activeTab === 'create' ? (
                <div className="space-y-4">
                    <div className="bg-white rounded-xl shadow-md border border-slate-200">
                        {/* Status / Header Bar */}
                        <div className={`px-6 py-2 flex justify-between items-center ${editId ? 'bg-blue-600' : 'bg-primary-dark'} transition-colors`}>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-medium text-white/70 uppercase tracking-widest">Type:</span>
                                <span className="text-xs font-medium text-white uppercase tracking-wider">
                                    {editId ? 'AMENDMENT MODE' : 'OFFICIAL PAYMENT VOUCHER'}
                                </span>
                            </div>
                            {editId && (
                                <button onClick={resetForm} className="text-[10px] font-medium text-white uppercase tracking-wider hover:underline flex items-center gap-1">
                                    <FiX size={14} /> Cancel Editing
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
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
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Reference / Chq No.</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm font-semibold transition-all font-mono"
                                        value={formData.reference}
                                        onChange={e => setFormData({ ...formData, reference: e.target.value })}
                                        placeholder="EX: BK-1002, IMPS, etc."
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2 text-red-600">Disbursement Amount</label>
                                    <div className="relative">
                                        <input
                                            required
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            className="w-full px-4 py-3 bg-red-50/30 border border-red-100 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-transparent focus:bg-white text-lg font-medium text-red-600 tabular-nums transition-all"
                                            value={formData.amount}
                                            onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                            Payment Source (Credit)
                                        </label>
                                        {selectedPaymentAccount && (
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${selectedPaymentAccount.currentBalance >= 0 ? 'bg-primary' : 'bg-red-500'}`} />
                                                <span className="text-[10px] font-medium text-slate-500">
                                                    Bal: {formatCurrency(Math.abs(selectedPaymentAccount.currentBalance), user?.branch || 'AED')} {selectedPaymentAccount.currentBalance >= 0 ? 'Dr' : 'Cr'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <SearchableSelect
                                        options={cashBankLedgers.map(l => ({ value: l.id, label: l.name }))}
                                        value={formData.paymentAccount}
                                        onChange={val => setFormData({ ...formData, paymentAccount: val })}
                                        placeholder="Select Cash/Bank Ledger..."
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2 italic">The account from which funds are departing.</p>
                                </div>

                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                            Destination Account (Debit)
                                        </label>
                                        {selectedExpenseAccount && (
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${selectedExpenseAccount.currentBalance >= 0 ? 'bg-primary' : 'bg-red-500'}`} />
                                                <span className="text-[10px] font-medium text-slate-500">
                                                    Bal: {formatCurrency(Math.abs(selectedExpenseAccount.currentBalance), user?.branch || 'AED')} {selectedExpenseAccount.currentBalance >= 0 ? 'Dr' : 'Cr'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <SearchableSelect
                                        options={expenseLedgers.map(l => ({ value: l.id, label: `${l.name} (${l.group?.name})` }))}
                                        value={formData.expenseAccount}
                                        onChange={val => setFormData({ ...formData, expenseAccount: val })}
                                        placeholder="Select Expense/Liability Ledger..."
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2 italic">The account receiving the payment (Expense/Creditor).</p>
                                </div>
                            </div>

                            <div className="mb-8">
                                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Detailed Narration</label>
                                <textarea
                                    required
                                    rows="2"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent focus:bg-white text-sm font-semibold text-slate-800 transition-all resize-none italic"
                                    value={formData.narration}
                                    onChange={e => setFormData({ ...formData, narration: e.target.value })}
                                    placeholder="Enter purpose of payment, invoice details, etc..."
                                />
                            </div>

                            <div className="flex items-center gap-4 pt-6 border-t border-slate-100">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 bg-slate-900 text-white py-3.5 rounded-lg font-medium text-xs uppercase tracking-widest hover:bg-slate-800 shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <FiSave size={16} />
                                    {isSubmitting ? 'PROCESSING...' : (editId ? 'UPDATE VOUCHER' : 'POST PAYMENT')}
                                </button>
                                {editId && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="px-8 py-3.5 rounded-lg font-medium text-xs uppercase tracking-widest border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                                    >
                                        CANCEL
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-3 border-l-4 border-red-500">
                        <div className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center text-red-500 font-medium text-xs">!</div>
                        <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                            Payment vouchers affect ledger balances immediately. Ensure accurate bank reconciliation before posting.
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
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider w-[45%]">Transaction Path</th>
                                        <th className="px-6 py-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider text-right w-[15%]">Amount Paid</th>
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
                                                No payment history detected
                                            </td>
                                        </tr>
                                    ) : (
                                        vouchers.map(v => {
                                            const debitEntry = v.entries.find(e => e.type === 'DEBIT' || e.debitLedgerId);
                                            const creditEntry = v.entries.find(e => e.type === 'CREDIT' || e.creditLedgerId);
                                            return (
                                                <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-slate-800 tracking-tight">
                                                                {new Date(v.date).toLocaleDateString('en-GB')}
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
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 uppercase tracking-tighter">Debit:</span>
                                                                <span className="text-[11px] font-medium text-slate-700">{debitEntry?.ledger?.name || debitEntry?.debitLedger?.name || 'Unknown'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-primary-light/10 text-primary border border-primary/20 uppercase tracking-tighter">Credit:</span>
                                                                <span className="text-[11px] font-medium text-slate-700">{creditEntry?.ledger?.name || creditEntry?.creditLedger?.name || 'Unknown'}</span>
                                                            </div>
                                                            <p className="text-[10px] font-medium text-slate-500 italic truncate max-w-sm mt-1" title={v.narration}>
                                                                {v.narration}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-sm font-medium text-slate-900 tabular-nums">
                                                                {formatCurrency(v.totalAmount, v.branch || 'AED')}
                                                            </span>
                                                            {v.status === 'CANCELLED' ? (
                                                                <span className="mt-1 px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[8px] font-medium uppercase tracking-widest ring-1 ring-red-200">Voided</span>
                                                            ) : (
                                                                <span className="mt-1 px-1.5 py-0.5 rounded bg-primary-light text-primary text-[8px] font-medium uppercase tracking-widest ring-1 ring-primary/20">Cleared</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => setPrintVoucher(v)}
                                                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-light rounded transition-colors"
                                                                title="Print"
                                                            >
                                                                <FiPrinter size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleEdit(v)}
                                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                title="Edit"
                                                            >
                                                                <FiEdit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteClick(v.id)}
                                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <FiTrash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
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
                title="Confirm Annulment"
                message="Are you sure you want to permanently void this payment voucher? This action will immediately reverse the ledger impact. This cannot be undone."
            />

            <ProfessionalModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onConfirm={confirmSave}
                type="success"
                title={editId ? "Update Payment Voucher" : "Post Payment Voucher"}
                message={editId ? "Confirm that you want to apply these adjustments to the existing voucher." : "This will create a new payment voucher and update ledger balances immediately."}
                confirmText={editId ? "Update Now" : "Post Payment"}
                details={[
                    { label: 'Voucher Date', value: formData.date },
                    { label: 'Payment From', value: ledgers.find(l => l.id == formData.paymentAccount)?.name || 'N/A' },
                    { label: 'Amount', value: formatCurrency(formData.amount || 0, user?.branch || 'AED') },
                    { label: 'Reference', value: formData.reference || 'N/A' }
                ]}
            />
        </div>
    );
}
