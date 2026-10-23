import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiPlus, FiCalendar, FiDollarSign, FiUsers, FiCheckCircle, FiLoader, FiTrash2, FiFileText, FiSearch, FiFilter, FiTrendingUp } from 'react-icons/fi';
import ProfessionalModal from '@/components/ProfessionalModal';
import SearchableSelect from '@/components/SearchableSelect';

export default function SalaryProcessing() {
    const [users, setUsers] = useState([]);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [processingMode, setProcessingMode] = useState('individual'); // 'individual' or 'bulk'
    const [processingData, setProcessingData] = useState({
        userId: '',
        fromDate: '',
        toDate: '',
        allowances: '0',
        deductions: '0',
        month: '',
        year: new Date().getFullYear().toString()
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [recentProcessed, setRecentProcessed] = useState([]);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, processing: false });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Simple Debounce implementation
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        confirmText: 'Confirm',
        onConfirm: () => { },
        details: []
    });

    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    useEffect(() => {
        fetchUsers();
        fetchCompanyProfile();
        fetchRecentProcessed();
    }, []);

    useEffect(() => {
        if (processingMode === 'individual' && processingData.userId && processingData.fromDate && processingData.toDate) {
            fetchPreview();
        } else {
            setPreview(null);
        }
    }, [processingData.userId, processingData.fromDate, processingData.toDate, processingMode]);

    const fetchPreview = async () => {
        setLoadingPreview(true);
        try {
            const res = await api.get(`/hrms/payroll/preview`, {
                params: {
                    userId: processingData.userId,
                    fromDate: processingData.fromDate,
                    toDate: processingData.toDate
                }
            });
            setPreview(res.data);
        } catch (err) {
            console.error("Preview failed:", err);
        } finally {
            setLoadingPreview(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await api.get('/users');
            // Filter only active users
            setUsers(res.data.filter(u => u.isActive));
        } catch (err) {
            console.error(err);
            toast.error('Failed to load users');
        }
    };

    const fetchCompanyProfile = async () => {
        try {
            const res = await api.get('/company');
            setCompanyProfile(res.data);
        } catch (err) {
            console.error("Failed to fetch company profile:", err);
        }
    };

    const fetchRecentProcessed = async () => {
        try {
            const res = await api.get('/hrms/payroll/history');
            setRecentProcessed(res.data); // Removed slice(0, 10) to show all records
        } catch (err) {
            console.error(err);
        }
    };

    const filteredProcessed = useMemo(() => {
        return recentProcessed.filter(p => {
            const matchesSearch = 
                p.user?.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                p.user?.username?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                p.user?.employeeProfile?.employeeCode?.toLowerCase().includes(debouncedSearch.toLowerCase());
            
            const matchesStatus = statusFilter === '' || p.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
    }, [recentProcessed, debouncedSearch, statusFilter]);

    const stats = useMemo(() => {
        const totalSalary = filteredProcessed.reduce((sum, p) => sum + Number(p.netSalary), 0);
        const uniqueEmployees = new Set(filteredProcessed.map(p => p.userId)).size;
        return { totalSalary, totalEmployees: uniqueEmployees };
    }, [filteredProcessed]);

    const handleProcessSalary = async (e) => {
        e.preventDefault();
        if (!processingData.userId || !processingData.fromDate || !processingData.toDate) {
            toast.error("Please fill all required fields");
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                ...processingData,
                allowances: parseFloat(processingData.allowances || 0),
                deductions: parseFloat(processingData.deductions || 0),
                year: parseInt(processingData.year),
                month: processingData.month || new Date(processingData.fromDate).toLocaleString('default', { month: 'long' })
            };
            await api.post('/hrms/payroll/generate', payload);
            toast.success("Salary Processed Successfully!");
            setProcessingData({
                userId: '', fromDate: '', toDate: '',
                allowances: '0', deductions: '0',
                month: '', year: new Date().getFullYear().toString()
            });
            fetchRecentProcessed();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to process salary");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkProcess = async (e) => {
        e.preventDefault();
        if (!processingData.fromDate || !processingData.toDate) {
            toast.error("Please select date range");
            return;
        }

        const eligibleUsers = users.filter(u => u.employeeProfile?.basicSalary > 0);
        if (eligibleUsers.length === 0) {
            toast.error("No employees with salary configured");
            return;
        }

        setBulkProgress({ current: 0, total: eligibleUsers.length, processing: true });
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < eligibleUsers.length; i++) {
            const user = eligibleUsers[i];
            try {
                const payload = {
                    userId: user.id,
                    fromDate: processingData.fromDate,
                    toDate: processingData.toDate,
                    allowances: parseFloat(processingData.allowances || 0),
                    deductions: parseFloat(processingData.deductions || 0),
                    year: parseInt(processingData.year),
                    month: processingData.month || new Date(processingData.fromDate).toLocaleString('default', { month: 'long' })
                };
                await api.post('/hrms/payroll/generate', payload);
                successCount++;
            } catch (err) {
                console.error(`Failed to process salary for ${user.name}:`, err);
                failCount++;
            }
            setBulkProgress({ current: i + 1, total: eligibleUsers.length, processing: true });
            // Small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        setBulkProgress({ current: 0, total: 0, processing: false });
        toast.success(`Processed ${successCount} employees successfully${failCount > 0 ? `, ${failCount} failed` : ''}`);
        fetchRecentProcessed();
    };

    const handleApprovePayroll = (payroll) => {
        setConfirmModal({
            isOpen: true,
            type: 'success',
            title: 'Approve Payroll',
            message: `Are you sure you want to approve the salary for ${payroll.user?.name}? Once approved, the record will be locked and ready for payment disbursement.`,
            confirmText: 'Approve Now',
            onConfirm: () => executeApprove(payroll.id),
            details: [
                { label: 'Employee', value: payroll.user?.name },
                { label: 'Period', value: `${payroll.month} ${payroll.year}` },
                { label: 'Net Salary', value: `${companyProfile?.currencySymbol || 'AED'}${parseFloat(payroll.netSalary).toLocaleString()}` }
            ]
        });
    };

    const executeApprove = async (id) => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
            await api.put(`/hrms/payroll/${id}/status`, { status: 'APPROVED' });
            toast.success("Payroll approved successfully");
            fetchRecentProcessed();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to approve payroll");
        }
    };

    const handleDeletePayroll = (payroll) => {
        setConfirmModal({
            isOpen: true,
            type: 'danger',
            title: 'Delete Payroll Record',
            message: `You are about to delete the generated payroll for ${payroll.user?.name}. This action will reset any associated salary advances so they can be processed again. This cannot be undone.`,
            confirmText: 'Yes, Delete',
            onConfirm: () => executeDelete(payroll.id),
            details: [
                { label: 'Employee', value: payroll.user?.name },
                { label: 'Period', value: `${payroll.month} ${payroll.year}` },
                { label: 'Amount to Void', value: `${companyProfile?.currencySymbol || 'AED'}${parseFloat(payroll.netSalary).toLocaleString()}` }
            ]
        });
    };

    const executeDelete = async (id) => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
            await api.delete(`/hrms/payroll/${id}`);
            toast.success("Payroll deleted successfully");
            fetchRecentProcessed();
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to delete payroll");
        }
    };

    const progressPercentage = bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0;

    return (
        <div className="p-6 w-full">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                        <FiDollarSign className="text-primary" />
                        Salary Processing
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Process employee salaries with custom date ranges</p>
                </div>
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <FiUsers size={28} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Employees</p>
                        <p className="text-2xl font-extrabold text-slate-800">{stats.totalEmployees}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <FiTrendingUp size={28} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Salary</p>
                        <p className="text-2xl font-extrabold text-slate-800">
                            {companyProfile?.currencySymbol || 'AED'}{stats.totalSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-[280px] relative group">
                    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors z-10" />
                    <input
                        type="text"
                        placeholder="Search by name or employee code..."
                        className="w-full h-11 pl-11 pr-4 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all text-sm font-medium placeholder:text-slate-400 outline-none flex items-center"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="min-w-[180px]">
                        <SearchableSelect
                            options={[
                                { value: 'GENERATED', label: 'Generated' },
                                { value: 'APPROVED', label: 'Approved' }
                            ]}
                            value={statusFilter}
                            onChange={val => setStatusFilter(val)}
                            placeholder="All Statuses"
                            className="w-full"
                            direction="down"
                        />
                    </div>
                    {(searchQuery || statusFilter) && (
                        <button 
                            onClick={() => { setSearchQuery(''); setStatusFilter(''); }}
                            className="px-4 h-11 text-xs font-bold text-primary hover:text-primary-dark uppercase tracking-widest transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Processing Mode Selector */}
            <div className="mb-6 flex bg-slate-100 p-1 rounded-xl gap-1 w-fit">
                <button
                    onClick={() => setProcessingMode('individual')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${processingMode === 'individual' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Individual Processing
                </button>
                <button
                    onClick={() => setProcessingMode('bulk')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${processingMode === 'bulk' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Bulk Processing (All Employees)
                </button>
            </div>

            {/* Bulk Progress Bar */}
            {bulkProgress.processing && (
                <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <FiLoader className="text-primary animate-spin" size={20} />
                            <span className="font-medium text-slate-800">Processing Salaries...</span>
                        </div>
                        <span className="text-sm font-medium text-slate-600">
                            {bulkProgress.current} / {bulkProgress.total}
                        </span>
                    </div>
                    <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary-dark transition-all duration-300 ease-out rounded-full shadow-sm"
                            style={{ width: `${progressPercentage}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Please wait while we process all employee salaries...</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Process Salary Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                <FiPlus className="text-primary" />
                                {processingMode === 'individual' ? 'Process Individual' : 'Process All Employees'}
                            </h2>
                        </div>
                        <form 
                            onSubmit={processingMode === 'individual' ? handleProcessSalary : handleBulkProcess} 
                            className="p-6 space-y-5 overflow-y-auto"
                            style={{ height: 'calc(100vh - 550px)', minHeight: '400px' }}
                        >
                            {processingMode === 'individual' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">Employee</label>
                                    <SearchableSelect
                                        options={users.map(u => ({
                                            value: u.id,
                                            label: `${u.name} (@${u.username})${u.employeeProfile?.basicSalary ? ` - ${companyProfile?.currencySymbol || 'AED'}${u.employeeProfile.basicSalary}` : ' - No salary set'}`
                                        }))}
                                        value={processingData.userId}
                                        onChange={val => setProcessingData({ ...processingData, userId: val })}
                                        placeholder="Select Employee"
                                        direction="down"
                                    />
                                </div>
                            )}

                            {processingMode === 'bulk' && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <FiUsers className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
                                        <div>
                                            <p className="text-sm font-medium text-blue-900">Bulk Processing</p>
                                            <p className="text-xs text-blue-700 mt-1">
                                                This will process salaries for all employees with configured basic salary ({users.filter(u => u.employeeProfile?.basicSalary > 0).length} employees)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">From Date</label>
                                    <input
                                        required
                                        type="date"
                                        className="input w-full bg-slate-50 border-transparent focus:bg-white transition-all font-semibold"
                                        value={processingData.fromDate}
                                        onChange={e => setProcessingData({ ...processingData, fromDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">To Date</label>
                                    <input
                                        required
                                        type="date"
                                        className="input w-full bg-slate-50 border-transparent focus:bg-white transition-all font-semibold"
                                        value={processingData.toDate}
                                        onChange={e => setProcessingData({ ...processingData, toDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Preview Section */}
                            {processingMode === 'individual' && preview && (
                                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                                        <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Calculation Summary</h3>
                                        <span className="text-[10px] font-medium text-primary bg-primary-light/10 px-2 py-0.5 rounded-full">Attendance Driven</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                            <p className="text-[10px] text-slate-400 font-medium uppercase mb-1">Total Days</p>
                                            <p className="text-lg font-extrabold text-slate-800">{preview.calculation.totalDays}</p>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                            <p className="text-[10px] text-primary font-medium uppercase mb-1">Payable Days</p>
                                            <p className="text-lg font-medium text-primary">{preview.calculation.payableDays}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 px-1">
                                        <div className="flex justify-between text-xs font-medium text-slate-600">
                                            <span>Monthly Basic</span>
                                            <span>{companyProfile?.currencySymbol || 'AED'}{parseFloat(preview.basicSalary).toLocaleString()}</span>
                                        </div>
                                        {preview.calculation.totalDays > preview.calculation.payableDays && (
                                            <div className="flex justify-between text-xs font-medium text-red-500">
                                                <span className="flex items-center gap-1">
                                                    Deductions ({Number(preview.calculation.totalDays - preview.calculation.payableDays).toFixed(1).replace(/\.0$/, '')} days)
                                                </span>
                                                <span>-{companyProfile?.currencySymbol || 'AED'}{(parseFloat(preview.basicSalary) - parseFloat(preview.calculation.calculatedBasic)).toLocaleString()}</span>
                                            </div>
                                        )}
                                        {preview.pendingAdvances > 0 && (
                                            <div className="flex justify-between text-xs font-medium text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100 mt-2">
                                                <span>Salary Advances</span>
                                                <span>-{companyProfile?.currencySymbol || 'AED'}{parseFloat(preview.pendingAdvances).toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                                            <span className="text-xs font-medium text-slate-800 uppercase tracking-wider">Final Pay</span>
                                            <span className="text-lg font-medium text-slate-900 leading-none">
                                                {companyProfile?.currencySymbol || 'AED'}{(parseFloat(preview.calculation.calculatedBasic) - parseFloat(preview.pendingAdvances || 0)).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {processingMode === 'individual' && loadingPreview && (
                                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <FiLoader className="mx-auto text-primary animate-spin mb-2" size={24} />
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Calculating...</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">
                                    Allowances ({companyProfile?.currencySymbol || 'AED'})
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input w-full bg-slate-50 border-transparent focus:bg-white transition-all font-semibold"
                                    value={processingData.allowances}
                                    onChange={e => setProcessingData({ ...processingData, allowances: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">
                                    Deductions ({companyProfile?.currencySymbol || 'AED'})
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input w-full bg-slate-50 border-transparent focus:bg-white transition-all font-semibold"
                                    value={processingData.deductions}
                                    onChange={e => setProcessingData({ ...processingData, deductions: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || bulkProgress.processing}
                                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-medium text-xs uppercase tracking-widest hover:bg-black hover:shadow-xl hover:shadow-slate-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting || bulkProgress.processing ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <FiLoader className="animate-spin" />
                                        Processing...
                                    </span>
                                ) : (
                                    processingMode === 'individual' ? 'Generate Payroll' : `Process All ${users.filter(u => u.employeeProfile?.basicSalary > 0).length} Employees`
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Recent Processed & Stats */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Recently Processed</h2>
                        </div>
                        <div className="p-6 overflow-y-auto" style={{ height: 'calc(100vh - 550px)', minHeight: '400px', scrollbarWidth: 'thin' }}>
                            {filteredProcessed.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <FiCalendar className="mx-auto text-4xl mb-2" />
                                    <p>{recentProcessed.length === 0 ? 'No salaries processed yet' : 'No records match your filters'}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredProcessed.map(p => (
                                        <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-primary/30 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary-light/10 flex items-center justify-center">
                                                    <FiCheckCircle className="text-primary" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-800">{p.user?.name || 'Unknown'}</div>
                                                    <div className="text-xs text-slate-500 uppercase font-medium tracking-tighter">
                                                        {p.fromDate && p.toDate ? (
                                                            `${new Date(p.fromDate).toLocaleDateString('en-GB')} - ${new Date(p.toDate).toLocaleDateString('en-GB')}`
                                                        ) : (
                                                            `${p.month} ${p.year}`
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="font-medium text-primary">
                                                        {companyProfile?.currencySymbol || 'AED'}{parseFloat(p.netSalary).toFixed(2)}
                                                    </div>
                                                    <div className={`text-[10px] font-medium uppercase tracking-widest ${p.status === 'GENERATED' ? 'text-amber-500' : 'text-primary'}`}>
                                                        {p.status}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {p.status === 'GENERATED' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApprovePayroll(p)}
                                                                className="p-2 bg-primary-light/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm"
                                                                title="Approve for Payment"
                                                            >
                                                                <FiCheckCircle size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeletePayroll(p)}
                                                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                                title="Delete Payroll"
                                                            >
                                                                <FiTrash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <ProfessionalModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                type={confirmModal.type}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                details={confirmModal.details}
            />
        </div>
    );
}
