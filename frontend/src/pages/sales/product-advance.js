import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { FiPlus, FiCreditCard, FiSearch, FiClock, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import SearchableSelect from '@/components/SearchableSelect';
import { formatCurrency, resolveActiveCurrency, DEFAULT_CURRENCY } from '@/lib/currency';

export default function ProductAdvance() {
    const [advances, setAdvances] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCurrency, setActiveCurrency] = useState({ code: 'AED', symbol: 'AED' });

    const [formData, setFormData] = useState({
        customerId: '',
        totalAmount: '',
        notes: '',
        paymentMethod: 'Cash',
        date: new Date().toISOString().split('T')[0]
    });

    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);    const paymentMethodOptions = [
        { value: 'Cash', label: 'Cash' },
        { value: 'Online', label: 'Online' },
        { value: 'Bank Transfer', label: 'Bank Transfer' },
        { value: 'Card', label: 'Card' }
    ];

    useEffect(() => {
        fetchAdvances();
        fetchCustomers();
        fetchActiveCurrency();
    }, []);

    const fetchActiveCurrency = async () => {
        try {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
            const currentUser = userStr ? JSON.parse(userStr) : null;
            const branchId = currentUser?.branchId || (typeof window !== 'undefined' ? localStorage.getItem('activeBranchId') : null);

            let branch = null;
            if (branchId) {
                const bRes = await api.get(`/branches/${branchId}`).catch(() => null);
                branch = bRes?.data;
            }
            const compRes = await api.get('/company/profile').catch(() => null);
            setActiveCurrency(resolveActiveCurrency(branch, compRes?.data));
        } catch (e) {
            console.error('Failed to resolve active currency:', e);
        }
    };

    const fetchAdvances = async () => {
        try {
            const { data } = await api.get('/advances');
            setAdvances(data);
        } catch (err) {
            toast.error('Failed to fetch advances');
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const { data } = await api.get('/customers');
            setCustomers(data);
        } catch (err) {
            toast.error('Failed to fetch customers');
        }
    };

    const fetchHistory = async (customer) => {
        setSelectedCustomer(customer);
        setShowHistoryModal(true);
        setLoadingHistory(true);
        try {
            const { data } = await api.get(`/advances/history/${customer.id}`);
            setHistoryData(data);
        } catch (err) {
            toast.error('Failed to fetch history');
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!formData.customerId) {
                return toast.error('Please select a customer');
            }
            if (Number(formData.totalAmount) <= 0) {
                return toast.error('Amount must be greater than zero');
            }

            await api.post('/advances', formData);
            toast.success('Advance recorded successfully');
            setShowModal(false);
            setFormData({ 
                customerId: '', 
                totalAmount: '', 
                notes: '', 
                paymentMethod: 'Cash',
                date: new Date().toISOString().split('T')[0] 
            });
            fetchAdvances();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Operation failed');
        }
    };

    const filteredAdvances = advances.filter(a => 
        a.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        a.notes?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <FiCreditCard className="text-primary" /> Product Advance
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Manage customer deposits and advance payments.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    <div className="relative group flex-1 sm:w-64">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by customer..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button 
                        className="btn btn-primary px-6 py-2.5 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95" 
                        onClick={() => setShowModal(true)}
                    >
                        <FiPlus className="text-lg" /> Add Advance
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[800px]">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 whitespace-nowrap">
                            <tr>
                                <th className="p-4 font-semibold uppercase tracking-wider text-[11px]">Customer</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-[11px] text-right">Total Advance</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-[11px] text-right">Used Amount</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-[11px] text-right">Balance</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-[11px]">Notes</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-[11px] text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="6" className="p-8 text-center text-slate-400">Loading...</td></tr>
                            ) : filteredAdvances.length === 0 ? (
                                <tr><td colSpan="6" className="p-8 text-center text-slate-400">No advances found</td></tr>
                            ) : (
                                filteredAdvances.map(advance => (
                                    <tr key={advance.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-medium text-slate-800">{advance.customer?.name}</td>
                                        <td className="p-4 text-right text-slate-600 font-medium">{formatCurrency(advance.totalAmount, activeCurrency)}</td>
                                        <td className="p-4 text-right text-orange-500 font-medium">{formatCurrency(advance.usedAmount, activeCurrency)}</td>
                                        <td className="p-4 text-right text-emerald-600 font-bold">{formatCurrency(advance.balance, activeCurrency)}</td>
                                        <td className="p-4 text-slate-400 text-xs truncate max-w-[150px]">{advance.notes || '-'}</td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => fetchHistory(advance.customer)}
                                                className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                                                title="View History"
                                            >
                                                <FiClock />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h2 className="text-xl font-semibold text-slate-800">Add Advance</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
                                <SearchableSelect
                                    options={customers.map(c => ({ value: c.id, label: c.name }))}
                                    value={formData.customerId}
                                    onChange={val => setFormData({ ...formData, customerId: val })}
                                    placeholder="Search Customer..."
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Advance Amount ({activeCurrency.code || 'AED'}) <span className="text-red-500">*</span></label>
                                <input
                                    type="number"
                                    required
                                    className="input text-lg font-medium tracking-wider"
                                    placeholder="0.00"
                                    value={formData.totalAmount}
                                    onChange={e => setFormData({ ...formData, totalAmount: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Advance Date</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                                <textarea
                                    className="input w-full p-2 border rounded"
                                    rows="1"
                                    placeholder="E.g. Advance for custom order..."
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="w-full">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                                    <SearchableSelect
                                        options={paymentMethodOptions}
                                        value={formData.paymentMethod}
                                        onChange={(val) => setFormData({ ...formData, paymentMethod: val })}
                                        placeholder="Select Payment Method"
                                        direction="down"
                                        triggerClassName="min-h-0 h-[38px] py-1.5 px-3 text-sm w-full"
                                    />
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Advance</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
            {/* History Modal */}
            {showHistoryModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                                    <FiClock className="text-primary" /> Advance History
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">{selectedCustomer?.name}</p>
                            </div>
                            <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shadow-sm">&times;</button>
                        </div>
                        <div className="p-0 max-h-[60vh] overflow-y-auto">
                            <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                                <table className="w-full text-sm text-left min-w-[500px]">
                                    <thead className="bg-white text-slate-400 border-b sticky top-0 z-10 whitespace-nowrap">
                                        <tr>
                                            <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Date</th>
                                            <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Action</th>
                                            <th className="p-4 font-semibold uppercase tracking-wider text-[10px] text-right">Amount</th>
                                            <th className="p-4 font-semibold uppercase tracking-wider text-[10px] text-right">Pool Bal.</th>
                                            <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Reference</th>
                                        </tr>
                                    </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loadingHistory ? (
                                        <tr><td colSpan="5" className="p-8 text-center"><FiClock className="animate-spin mx-auto mb-2" /> Loading History...</td></tr>
                                    ) : historyData.length === 0 ? (
                                        <tr><td colSpan="5" className="p-8 text-center text-slate-400 italic">No history logged yet.</td></tr>
                                    ) : (
                                        historyData.map(log => (
                                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4 text-slate-500 text-xs">{new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.action === 'ADD' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className={`p-4 text-right font-medium ${log.action === 'ADD' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                                    {log.action === 'ADD' ? '+' : '-'} {formatCurrency(log.amount, activeCurrency)}
                                                </td>
                                                <td className="p-4 text-right text-slate-700 font-semibold">{formatCurrency(log.balanceAfter, activeCurrency)}</td>
                                                <td className="p-4 text-slate-500 text-xs italic">{log.reference || '-'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
                            <button className="btn btn-primary px-6" onClick={() => setShowHistoryModal(false)}>Close</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
