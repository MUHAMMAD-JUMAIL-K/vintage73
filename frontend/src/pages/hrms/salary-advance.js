import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiPlus, FiDollarSign, FiCheck, FiX, FiCheckCircle } from 'react-icons/fi';

export default function SalaryAdvance() {
    const [advances, setAdvances] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [formData, setFormData] = useState({
        amount: '',
        reason: ''
    });

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        fetchAdvances();
        fetchCompanyProfile();
    }, []);

    const fetchAdvances = async () => {
        try {
            const res = await api.get('/hrms/salary-advance');
            setAdvances(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load advances');
        } finally {
            setLoading(false);
        }
    };

    const fetchCompanyProfile = async () => {
        try {
            const res = await api.get('/company');
            setCompanyProfile(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/hrms/salary-advance', formData);
            toast.success('Salary advance request submitted successfully');
            setIsModalOpen(false);
            setFormData({ amount: '', reason: '' });
            fetchAdvances();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to submit request');
        }
    };

    const handleStatusUpdate = async (id, status) => {
        try {
            await api.put(`/hrms/salary-advance/${id}/status`, { status });
            toast.success(`Request ${status.toLowerCase()} successfully`);
            fetchAdvances();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update status');
        }
    };

    const getStatusBadge = (advance) => {
        if (advance.deductedInPayroll) {
            return (
                <span className="px-3 py-1 rounded-full text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200">
                    DEDUCTED
                </span>
            );
        }

        const styles = {
            PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
            APPROVED: 'bg-primary-light/10 text-primary border-primary-light/20',
            REJECTED: 'bg-red-50 text-red-700 border-red-200'
        };
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[advance.status] || styles.PENDING}`}>
                {advance.status}
            </span>
        );
    };

    const isAdmin = user?.role === 'admin';
    const currencySymbol = companyProfile?.currencySymbol || 'AED';

    // Calculate pending approved advances total
    const pendingTotal = advances
        .filter(a => a.status === 'APPROVED' && !a.deductedInPayroll)
        .reduce((sum, a) => sum + parseFloat(a.amount), 0);

    return (
        <div className="p-6 w-full space-y-6">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 leading-tight">
                        <FiDollarSign className="text-primary" />
                        Salary Advance
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Request and manage salary advances</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-black transition-all shadow-sm hover:shadow-lg"
                >
                    <FiPlus /> Request Advance
                </button>
            </header>

            {/* Pending Advances Alert */}
            {!isAdmin && pendingTotal > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-[1.5rem] p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 border border-amber-200/50">
                            <FiCheckCircle className="text-amber-600" size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-900 uppercase tracking-wider">Pending Deduction</p>
                            <p className="text-xs text-amber-700 mt-1 font-medium leading-relaxed">
                                You have <span className="font-bold text-amber-900">{currencySymbol}{pendingTotal.toLocaleString()}</span> in approved advances that will be automatically deducted from your next generated salary.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 uppercase text-[10px] tracking-wider">
                            <tr className="whitespace-nowrap">
                                <th className="px-6 py-4 text-left">Employee</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                                <th className="px-6 py-4 text-left">Reason</th>
                                <th className="px-6 py-4 text-left">Request Date</th>
                                <th className="px-6 py-4 text-left">Status</th>
                                <th className="px-6 py-4 text-left">Approved By</th>
                                <th className="px-6 py-4 text-left">Deducted In</th>
                                {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={isAdmin ? "8" : "7"} className="p-8 text-center text-slate-400">Loading...</td></tr>
                            ) : advances.length === 0 ? (
                                <tr><td colSpan={isAdmin ? "8" : "7"} className="p-8 text-center text-slate-400">No advance requests found</td></tr>
                            ) : (
                                advances.map(adv => (
                                    <tr key={adv.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-800">{adv.user?.name}</div>
                                            <div className="text-xs text-slate-400">@{adv.user?.username}</div>
                                            {adv.user?.employeeProfile?.basicSalary && (
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    Salary: {currencySymbol}{parseFloat(adv.user.employeeProfile.basicSalary).toFixed(2)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-medium text-primary text-base">
                                                {currencySymbol}{parseFloat(adv.amount).toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                                            {adv.reason}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {new Date(adv.requestDate).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(adv)}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {adv.approver ? (
                                                <div>
                                                    <div className="font-medium">{adv.approver.name}</div>
                                                    <div className="text-xs text-slate-400">
                                                        {adv.approvedAt ? new Date(adv.approvedAt).toLocaleDateString('en-GB') : ''}
                                                    </div>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {adv.payroll ? (
                                                <div>
                                                    <div className="font-medium">{adv.payroll.month} {adv.payroll.year}</div>
                                                    <div className="text-xs text-slate-400">
                                                        Net: {currencySymbol}{parseFloat(adv.payroll.netSalary).toFixed(2)}
                                                    </div>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        {isAdmin && (
                                            <td className="px-6 py-4 text-right">
                                                {adv.status === 'PENDING' && (
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleStatusUpdate(adv.id, 'APPROVED')}
                                                            className="p-2 text-primary hover:bg-primary-light/10 rounded-lg transition-colors"
                                                            title="Approve"
                                                        >
                                                            <FiCheck size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(adv.id, 'REJECTED')}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Reject"
                                                        >
                                                            <FiX size={18} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                </div>

            {/* Request Modal */}
            {isModalOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[95vh] flex flex-col">
                        <header className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 leading-tight">Request Advance</h3>
                                <p className="text-slate-400 text-xs mt-0.5">Submit salary advance request</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-all">
                                <FiX size={20} />
                            </button>
                        </header>

                        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Amount ({currencySymbol})</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currencySymbol}</div>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-4 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-bold text-xl text-slate-800"
                                        value={formData.amount}
                                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Approved amount will be deducted from your next payslip.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Reason for Advance</label>
                                <textarea
                                    required
                                    rows="3"
                                    className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-800 min-h-[100px]"
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                    placeholder="e.g. Medical emergency / Family function"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-6 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-all text-xs uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-6 py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg text-xs uppercase tracking-widest"
                                >
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
