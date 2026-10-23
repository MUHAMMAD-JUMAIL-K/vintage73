import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiMessageCircle, FiEye, FiPhone } from 'react-icons/fi';
import { formatCurrency as formatCurrencyLib, resolveActiveCurrency, DEFAULT_CURRENCY } from '@/lib/currency';

export default function CreditManagement() {
    const [debtors, setDebtors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [stats, setStats] = useState({ totalCredit: 0, todayCredit: 0 });

    // Settlement State
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [settleForm, setSettleForm] = useState({ amount: '', method: 'Cash', notes: '' });

    useEffect(() => {
        fetchDebtors();
    }, []);

    const fetchDebtors = async () => {
        try {
            const [credRes, compRes] = await Promise.all([
                api.get('/credits'),
                api.get('/company')
            ]);
            setDebtors(credRes.data);
            setCompanyProfile(compRes.data);

            // Calculate basic stats for display
            const total = credRes.data.reduce((acc, d) => acc + d.totalDebt, 0);
            setStats({ totalCredit: total, todayCredit: 0 }); // todayCredit can befetched if endpoint exists
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (id) => {
        try {
            const res = await api.get(`/credits/${id}`);
            setSelectedCustomer(res.data);
            setShowModal(true);
        } catch (err) {
            toast.error("Failed to fetch details");
        }
    };

    const sendWhatsApp = async (phone, name, amount, pendingInvoices) => {
        if (!phone) {
            toast.error("Phone number not available");
            return;
        }

        const wsSettings = await api.get('/whatsapp/settings').then(r => r.data).catch(() => null);
        if (!wsSettings || !wsSettings.isActive || !wsSettings.apiKey) {
            return toast.error("WhatsApp integration is not configured or is inactive");
        }

        let msg = wsSettings.creditTemplate || 'Hello [[customer_name]], your outstanding balance is [[total_amount]]. Please pay at your earliest convenience. Thank you.';

        const activeCurrency = resolveActiveCurrency(null, companyProfile);
        msg = msg.replace(/\[\[customer_name\]\]/g, name)
            .replace(/\[\[total_amount\]\]/g, formatCurrencyLib(amount, activeCurrency))
            .replace(/\[\[pending_invoices\]\]/g, pendingInvoices || 'N/A')
            .replace(/\[\[company_name\]\]/g, companyProfile?.companyName || 'Our Store');

        try {
            await api.post('/whatsapp/send', { mobile: phone, message: msg });
            toast.success('WhatsApp Reminder Sent!');
        } catch (wsErr) {
            console.error('WhatsApp failed:', wsErr);
            toast.error('Failed to send WhatsApp');
        }
    };

    const formatCurrency = (val) => formatCurrencyLib(val, resolveActiveCurrency(null, companyProfile));

    const handleSettle = async (e) => {
        e.preventDefault();
        try {
            await api.post('/credits/settle', {
                customerId: selectedCustomer.id,
                amount: settleForm.amount,
                paymentMethod: settleForm.method,
                notes: settleForm.notes
            });
            toast.success("Payment Recorded & Settled");
            setShowSettleModal(false);
            setShowModal(false); // Close details too to refresh
            fetchDebtors(); // Refresh list
        } catch (err) {
            toast.error(err.response?.data?.error || "Settlement Failed");
        }
    };

    return (
        <div className="p-4 sm:p-8 w-full">
            <div className="mb-8">
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight">{formatCurrency(stats.totalCredit)}</span>
                <p className="text-slate-500 mt-1 font-medium">Track outstanding payments and send reminders</p>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[800px]">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs whitespace-nowrap">
                            <tr>
                                <th className="px-6 py-5">Customer</th>
                                <th className="px-6 py-5">Phone</th>
                                <th className="px-6 py-5">Pending Invoices</th>
                                <th className="px-6 py-5">Total Debt</th>
                                <th className="px-6 py-5 text-right">Actions</th>
                            </tr>
                        </thead>
                    <tbody className="divide-y divide-slate-100">
                        {debtors.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-800">{c.name}</td>
                                <td className="px-6 py-4 text-slate-600 font-mono">{c.phone || '-'}</td>
                                <td className="px-6 py-4">
                                    <span className="bg-orange-100 text-orange-700 font-medium px-2 py-1 rounded-md text-xs">
                                        {c.pendingInvoices} Invoices
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-extrabold text-red-600 text-base">{formatCurrency(c.totalDebt)}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => handleViewDetails(c.id)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                            title="View Details"
                                        >
                                            <FiEye size={18} />
                                        </button>
                                        <button
                                            onClick={() => sendWhatsApp(c.phone, c.name, c.totalDebt, c.pendingInvoices)}
                                            className="flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-xl font-medium hover:bg-primary-dark transition-all shadow-lg shadow-primary/30 text-xs"
                                        >
                                            <FiMessageCircle size={16} /> WhatsApp
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {debtors.length === 0 && !loading && (
                            <tr><td colSpan="5" className="p-12 text-center text-slate-400">No customers with outstanding credit.</td></tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Detail Modal */}
            {showModal && selectedCustomer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">{selectedCustomer.name}</h2>
                                <p className="text-sm text-slate-500 font-medium">{selectedCustomer.phone}</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 font-medium transition">✕</button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                                <table className="w-full text-sm min-w-[500px]">
                                    <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs whitespace-nowrap">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Date</th>
                                            <th className="px-4 py-3 text-left">Invoice No</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3 text-right">Paid</th>
                                            <th className="px-4 py-3 text-right">Balance</th>
                                        </tr>
                                    </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedCustomer.sales.map(sale => (
                                        <tr key={sale.id}>
                                            <td className="px-4 py-3 text-slate-600">{new Date(sale.saleDate).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 font-medium text-slate-700">{sale.invoiceNumber}</td>
                                            <td className="px-4 py-3 text-right font-medium">₹{sale.totalAmount}</td>
                                            <td className="px-4 py-3 text-right text-primary">₹{sale.paidAmount}</td>
                                            <td className="px-4 py-3 text-right font-medium text-red-600">₹{sale.balanceAmount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <span className="text-xs font-medium text-slate-400 uppercase">Total Outstanding</span>
                                <p className="text-2xl font-extrabold text-slate-800">₹{selectedCustomer.totalDebt}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => sendWhatsApp(selectedCustomer.phone, selectedCustomer.name, selectedCustomer.totalDebt, selectedCustomer.sales.length)}
                                    className="bg-primary text-white px-4 py-2 rounded-xl font-medium hover:bg-primary-dark flex items-center justify-center gap-2 text-sm flex-1 sm:flex-initial"
                                >
                                    <FiMessageCircle /> WhatsApp
                                </button>
                                <button
                                    onClick={() => {
                                        setSettleForm({ amount: selectedCustomer.totalDebt, method: 'Cash', notes: '' });
                                        setShowSettleModal(true);
                                    }}
                                    className="bg-slate-900 text-white px-6 py-2 rounded-xl font-medium hover:bg-slate-800 shadow-lg text-sm flex-1 sm:flex-initial text-center"
                                >
                                    Settle Payment
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Modal */}
            {showSettleModal && selectedCustomer && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-medium text-slate-800">Record Payment</h3>
                            <button onClick={() => setShowSettleModal(false)} className="text-slate-400 hover:text-slate-600 font-medium">✕</button>
                        </div>
                        <form onSubmit={handleSettle} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase mb-1">Received Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                                    <input
                                        autoFocus
                                        type="number"
                                        required
                                        className="input w-full pl-8 font-medium text-lg text-primary"
                                        value={settleForm.amount}
                                        onChange={e => setSettleForm({ ...settleForm, amount: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase mb-1">Payment Method</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['Cash', 'UPI', 'Bank'].map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setSettleForm({ ...settleForm, method: m })}
                                            className={`py-2 text-xs font-medium rounded border ${settleForm.method === m ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase mb-1">Notes</label>
                                <input className="input w-full" placeholder="Reference No. etc" value={settleForm.notes} onChange={e => setSettleForm({ ...settleForm, notes: e.target.value })} />
                            </div>
                            <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-medium shadow-lg shadow-primary/30 hover:bg-primary-dark transition">
                                Confirm Settlement
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
