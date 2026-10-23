import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiDollarSign, FiPrinter, FiX, FiFilter, FiUser, FiCalendar, FiFileText, FiCheckCircle, FiCreditCard } from 'react-icons/fi';
import { useReactToPrint } from 'react-to-print';
import SearchableSelect from '@/components/SearchableSelect';

export default function PayrollPage() {
    const [payrolls, setPayrolls] = useState([]);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        userId: '',
        month: '',
        year: new Date().getFullYear().toString(),
        status: ''
    });

    // Pay Slip Modal
    const [selectedPayroll, setSelectedPayroll] = useState(null);
    const slipRef = useRef();
    const handlePrint = useReactToPrint({
        contentRef: slipRef,
    });

    // Bank Statement
    const [showBankStatement, setShowBankStatement] = useState(false);
    const bankStatementRef = useRef();
    const handlePrintBankStatement = useReactToPrint({
        contentRef: bankStatementRef,
    });

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const u = JSON.parse(storedUser);
            setCurrentUser(u);
            if (u.role === 'admin') {
                fetchUsers();
            } else {
                setFilters(prev => ({ ...prev, userId: u.id.toString() }));
            }
        }
        fetchCompanyProfile();
    }, []);

    useEffect(() => {
        // Fetch payroll whenever filters change (and after initial load)
        if (currentUser) fetchPayroll();
    }, [filters, currentUser]);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchPayroll = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.userId) query.append('userId', filters.userId);
            if (filters.month) query.append('month', filters.month);
            if (filters.year) query.append('year', filters.year);
            if (filters.status) query.append('status', filters.status);

            const res = await api.get(`/hrms/payroll/history?${query.toString()}`);
            setPayrolls(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load payroll history");
        } finally {
            setLoading(false);
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

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <FiFileText className="text-primary" />
                        Payroll Management
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Manage and view salary history</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    {payrolls.length > 0 && filters.month && filters.year && (
                        <button
                            onClick={() => setShowBankStatement(true)}
                            className="w-full md:w-auto bg-white text-slate-700 border border-slate-200 px-6 py-3 rounded-xl font-medium text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
                        >
                            <FiCreditCard className="text-primary" /> Bank Statement
                        </button>
                    )}
                </div>
            </header>

            {/* Filters Bar */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 items-end">
                {currentUser?.role === 'admin' && (
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                            <FiUser size={10} /> Employee
                        </label>
                        <SearchableSelect
                            options={users.map(u => ({ value: u.id.toString(), label: u.name }))}
                            value={filters.userId}
                            onChange={val => setFilters({ ...filters, userId: val })}
                            placeholder="All Employees"
                            className="w-full"
                            direction="down"
                        />
                    </div>
                )}
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <FiCalendar size={10} /> Month
                    </label>
                    <SearchableSelect
                        options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => ({ value: m, label: m }))}
                        value={filters.month}
                        onChange={val => setFilters({ ...filters, month: val })}
                        placeholder="All Months"
                        className="w-full"
                        direction="down"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <FiCalendar size={10} /> Year
                    </label>
                    <input
                        type="number"
                        className="input w-full bg-slate-50 border-slate-200 p-3 sm:p-4 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-800 text-xs"
                        value={filters.year}
                        onChange={e => setFilters({ ...filters, year: e.target.value })}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <FiFilter size={10} /> Status
                    </label>
                    <SearchableSelect
                        options={[
                            { value: 'GENERATED', label: 'Generated' },
                            { value: 'APPROVED', label: 'Approved' },
                            { value: 'PAID', label: 'Paid' }
                        ]}
                        value={filters.status}
                        onChange={val => setFilters({ ...filters, status: val })}
                        placeholder="All Statuses"
                        className="w-full"
                        direction="down"
                    />
                </div>
                <button
                    onClick={fetchPayroll}
                    className="w-full bg-slate-900 text-white rounded-xl h-[42px] sm:h-[48px] flex items-center justify-center gap-2 hover:bg-black transition-all text-[10px] font-bold uppercase tracking-widest shadow-sm"
                >
                    Refresh Data
                </button>
            </div>

            <div className="card shadow-md border border-slate-200 overflow-hidden">
                <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                    <table className="table-modern">
                        <thead className="whitespace-nowrap">
                            <tr>
                                <th style={{ width: '4%' }}>#</th>
                                <th style={{ width: '18%' }}>Employee</th>
                                <th style={{ width: '15%' }}>Period</th>
                                <th className="text-right" style={{ width: '10%' }}>Basic</th>
                                <th className="text-right" style={{ width: '10%' }}>Allowances</th>
                                <th className="text-right" style={{ width: '10%' }}>Deductions</th>
                                <th className="text-right" style={{ width: '12%' }}>Net Salary</th>
                                <th className="text-center" style={{ width: '10%' }}>Status</th>
                                <th className="text-center" style={{ width: '11%' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="9" className="p-12 text-center text-slate-400 font-medium italic">
                                    Loading history...
                                </td></tr>
                            ) : payrolls.length === 0 ? (
                                <tr><td colSpan="9" className="p-12 text-center text-slate-400 italic">No payroll records match your criteria</td></tr>
                            ) : (
                                payrolls.map((p, index) => (
                                    <tr key={p.id}>
                                        <td className="text-slate-500">{index + 1}</td>
                                        <td>
                                            <div className="font-medium text-slate-800">{p.user?.name}</div>
                                            <div className="text-[10px] text-slate-400">@{p.user?.username}</div>
                                        </td>
                                        <td>
                                            <div className="font-medium text-slate-700">{p.month} {p.year}</div>
                                            <div className="text-[10px] text-slate-400 uppercase tracking-tighter italic">
                                                {p.fromDate ? new Date(p.fromDate).toLocaleDateString('en-GB') : '?'} - {p.toDate ? new Date(p.toDate).toLocaleDateString('en-GB') : '?'}
                                            </div>
                                        </td>
                                        <td className="text-right font-mono text-slate-600">
                                            {companyProfile?.currencySymbol || 'AED'}{Number(p.basicSalary).toLocaleString()}
                                        </td>
                                        <td className="text-right font-mono text-primary">
                                            +{Number(p.allowances).toLocaleString()}
                                        </td>
                                        <td className="text-right font-mono text-red-400">
                                            -{Number(p.deductions).toLocaleString()}
                                        </td>
                                        <td className="text-right font-mono font-medium text-slate-900 text-sm">
                                            {companyProfile?.currencySymbol || 'AED'}{Number(p.netSalary).toLocaleString()}
                                        </td>
                                        <td className="text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-widest border ${p.status === 'PAID' ? 'bg-primary-light/10 text-primary border-primary-light/20' :
                                                p.status === 'APPROVED' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                                }`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <button
                                                onClick={() => setSelectedPayroll(p)}
                                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-light/10 rounded transition-colors"
                                                title="View Pay Slip"
                                            >
                                                <FiPrinter size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                </div>

                {/* Summary Footer */}
                {!loading && payrolls.length > 0 && (
                    <div className="bg-slate-50 border-t border-slate-300 px-6 py-3 flex justify-between items-center text-xs">
                        <div className="text-slate-500">
                            Showing <span className="font-medium text-slate-700">{payrolls.length}</span> payroll records
                        </div>
                        <div className="flex gap-8">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Allowances</span>
                                <span className="font-mono font-medium text-primary text-sm">
                                    {companyProfile?.currencySymbol || 'AED'}{payrolls.reduce((sum, p) => sum + Number(p.allowances), 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Deductions</span>
                                <span className="font-mono font-medium text-red-400 text-sm">
                                    {companyProfile?.currencySymbol || 'AED'}{payrolls.reduce((sum, p) => sum + Number(p.deductions), 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Net Payable</span>
                                <span className="font-mono font-medium text-slate-900 text-base">
                                    {companyProfile?.currencySymbol || 'AED'}{payrolls.reduce((sum, p) => sum + Number(p.netSalary), 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

            {/* Payslip Modal */}
            {selectedPayroll && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] border border-slate-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                    <FiFileText className="text-slate-600" />
                                </div>
                                <h3 className="font-medium text-slate-800 tracking-tight">Employee Pay Slip</h3>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-medium hover:bg-slate-900 transition-all shadow-sm">
                                    <FiPrinter /> Print Slip
                                </button>
                                <button onClick={() => setSelectedPayroll(null)} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-lg transition-all">
                                    <FiX size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 bg-slate-50" ref={slipRef}>
                            <div className="bg-white p-12 shadow-sm rounded-xl max-w-3xl mx-auto border border-slate-100 print:shadow-none print:border-none print:p-0">
                                {/* Company Header */}
                                <div className="flex justify-between items-start border-b border-slate-200 pb-8 mb-8">
                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">{companyProfile?.companyName}</h2>
                                        <p className="text-slate-500 text-sm font-medium max-w-xs leading-relaxed">{companyProfile?.address}, {companyProfile?.city}, {companyProfile?.state}</p>
                                        <p className="text-slate-500 text-[10px] uppercase font-medium tracking-wider pt-1">GSTIN: {companyProfile?.gstin}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-[0.2em] mb-4 inline-block">Payslip</div>
                                        <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest">Month & Year</p>
                                        <p className="text-slate-900 font-medium text-lg">{selectedPayroll.month} {selectedPayroll.year}</p>
                                    </div>
                                </div>

                                {/* Employee & Summary Grid */}
                                <div className="grid grid-cols-2 gap-12 mb-10">
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Employee Information</h4>
                                        <div className="space-y-2.5">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-400 font-medium">Name:</span>
                                                <span className="text-slate-900 font-medium uppercase">{selectedPayroll.user?.name}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-400 font-medium">Designation:</span>
                                                <span className="text-slate-900 font-medium">{selectedPayroll.user?.employeeProfile?.designation?.name || selectedPayroll.user?.employeeProfile?.designation || '-'}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-400 font-medium">Department:</span>
                                                <span className="text-slate-900 font-medium">{selectedPayroll.user?.employeeProfile?.department?.name || selectedPayroll.user?.employeeProfile?.department || '-'}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-400 font-medium">Employee Code:</span>
                                                <span className="text-slate-900 font-mono font-medium">{selectedPayroll.user?.employeeProfile?.employeeCode || '-'}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-400 font-medium">Joining Date:</span>
                                                <span className="text-slate-900 font-medium">{selectedPayroll.user?.employeeProfile?.joiningDate ? new Date(selectedPayroll.user.employeeProfile.joiningDate).toLocaleDateString('en-GB') : '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Attendance Summary</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Total Days</p>
                                                <p className="text-slate-900 font-extrabold text-lg">{selectedPayroll.totalDays}</p>
                                            </div>
                                            <div className="bg-primary-light/10 p-3 rounded-xl border border-primary-light/20">
                                                <p className="text-[9px] font-medium text-primary/60 uppercase tracking-widest mb-1">Present</p>
                                                <p className="text-primary font-medium text-lg">{selectedPayroll.presentDays}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* Earnings & Deductions Table */}
                                <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden mb-10">
                                    <div className="bg-white p-6">
                                        <h4 className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mb-4">Earnings</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">Basic Salary</span>
                                                <span className="text-slate-900 font-medium">{Number(selectedPayroll.fullBasicSalary).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">Incentives</span>
                                                <span className="text-slate-900 font-medium">{Number(selectedPayroll.incentives).toLocaleString()}</span>
                                            </div>
                                            <div className="pt-3 border-t border-slate-100 flex justify-between text-sm font-medium">
                                                <span className="text-slate-900 uppercase tracking-widest text-[10px]">Gross Earnings</span>
                                                <span className="text-slate-900">{Number(selectedPayroll.grossSalary).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-6">
                                        <h4 className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mb-4">Deductions</h4>
                                        <div className="space-y-3">
                                            {selectedPayroll.lopAmount > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-600 font-medium text-red-500">LOP (Loss of Pay)</span>
                                                    <span className="text-red-600 font-medium">-{Number(selectedPayroll.lopAmount).toLocaleString()}</span>
                                                </div>
                                            )}
                                            {(selectedPayroll.deductions - selectedPayroll.lopAmount) > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-600">Other Deductions</span>
                                                    <span className="text-red-600 font-medium">-{Number(selectedPayroll.deductions - selectedPayroll.lopAmount).toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">Salary Advance</span>
                                                <span className="text-red-600 font-medium">-{Number(selectedPayroll.advanceDeduction || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="pt-3 border-t border-slate-100 flex justify-between text-sm font-medium">
                                                <span className="text-slate-900 uppercase tracking-widest text-[10px]">Total Deductions</span>
                                                <span className="text-red-600">{Number(Number(selectedPayroll.deductions) + Number(selectedPayroll.advanceDeduction || 0)).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Net Salary Footer */}
                                <div className="bg-slate-900 rounded-2xl p-8 flex justify-between items-center text-white shadow-xl shadow-slate-900/10">
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.3em] mb-1">Net Payable Salary</p>
                                        <p className="text-xs text-slate-400 italic">Only {Number(selectedPayroll.netSalary).toLocaleString()} Rupees</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-3xl font-bold tracking-tight"><span className="text-slate-500 text-lg mr-2">{companyProfile?.currencySymbol || 'AED'}</span>{Number(selectedPayroll.netSalary).toLocaleString()}</p>
                                    </div>
                                </div>

                                {/* Signatures */}
                                <div className="flex justify-between mt-20 px-4">
                                    <div className="text-center">
                                        <div className="w-48 border-t border-slate-300 pt-3">
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Employee Signature</p>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="w-48 border-t border-slate-300 pt-3">
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Authorized Signatory</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-12 text-center">
                                    <p className="text-[9px] text-slate-300 font-medium uppercase tracking-[0.25em]">This is a computer generated document</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Bank Statement Modal */}
            {showBankStatement && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] border border-slate-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary-light/10 border border-primary-light/20 flex items-center justify-center">
                                    <FiCreditCard className="text-primary text-xl" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-slate-800 text-lg tracking-tight">Salary Statement for Bank</h3>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">{filters.month} {filters.year} • {payrolls.length} Employees</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handlePrintBankStatement} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-medium uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95">
                                    <FiPrinter /> Print Document
                                </button>
                                <button onClick={() => setShowBankStatement(false)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all">
                                    <FiX size={24} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 bg-slate-100" ref={bankStatementRef}>
                            <div className="bg-white p-16 shadow-lg rounded-[2rem] max-w-4xl mx-auto print:shadow-none print:p-0 print:m-0">
                                {/* Header */}
                                <div className="text-center border-b-2 border-slate-900 pb-8 mb-10">
                                    <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-tighter mb-1">{companyProfile?.companyName}</h2>
                                    <p className="text-slate-500 text-sm font-medium">{companyProfile?.address}, {companyProfile?.city}, {companyProfile?.state}</p>
                                    <p className="text-slate-500 text-xs mt-1 font-medium">GSTIN: {companyProfile?.gstin} | Pan: {companyProfile?.pan}</p>
                                </div>

                                <div className="flex justify-between items-end mb-8 border-b border-slate-100 pb-8">
                                    <div>
                                        <h3 className="text-lg font-medium text-slate-800 uppercase underline decoration-2 underline-offset-4 mb-4 text-center w-full">SALARY DISBURSEMENT STATEMENT</h3>
                                        <div className="space-y-1 text-sm text-slate-600 font-medium text-left">
                                            <p><span className="font-medium text-slate-900">Period:</span> {filters.month} {filters.year}</p>
                                            <p><span className="font-medium text-slate-900">Branch:</span> {filters.userId ? users.find(u => u.id === parseInt(filters.userId))?.name : 'All Employees'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {companyProfile?.bank && (
                                            <div className="mb-4 text-xs text-left">
                                                <p className="font-medium text-slate-400 uppercase tracking-widest text-[9px] mb-1 text-right">Source Bank Details</p>
                                                <p className="font-medium text-slate-800 text-right">{companyProfile.bank.name} - {companyProfile.bank.branchName}</p>
                                                <p className="text-slate-600 text-right">A/C: <span className="font-mono">{companyProfile.bank.accountNumber}</span></p>
                                                <p className="text-slate-600 text-[10px] text-right">IFSC: <span className="font-mono">{companyProfile.bank.ifscCode}</span></p>
                                            </div>
                                        )}
                                        <div className="text-[10px] font-medium text-slate-500 space-y-1">
                                            <p>Date: {new Date().toLocaleDateString('en-GB')}</p>
                                            <p>Document No: BS-{filters.month?.substring(0, 3).toUpperCase()}-{filters.year}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Table */}
                                <table className="w-full border-collapse border border-slate-300 text-xs mb-10">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="border border-slate-300 p-2 text-center w-8">#</th>
                                            <th className="border border-slate-300 p-2 text-left">EMPLOYEE NAME</th>
                                            <th className="border border-slate-300 p-2 text-left">BANK NAME</th>
                                            <th className="border border-slate-300 p-2 text-left">ACCOUNT NUMBER</th>
                                            <th className="border border-slate-300 p-2 text-left">IFSC CODE</th>
                                            <th className="border border-slate-300 p-2 text-right">AMOUNT ({companyProfile?.currencySymbol || 'AED'})</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payrolls.map((p, idx) => (
                                            <tr key={p.id} className="hover:bg-slate-50/50">
                                                <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                                                <td className="border border-slate-300 p-2 font-medium uppercase">{p.user?.name}</td>
                                                <td className="border border-slate-300 p-2">{p.user?.employeeProfile?.bankName || '-'}</td>
                                                <td className="border border-slate-300 p-2 font-mono font-medium tracking-tight">{p.user?.employeeProfile?.accountNumber || '-'}</td>
                                                <td className="border border-slate-300 p-2 font-mono uppercase">{p.user?.employeeProfile?.ifscCode || '-'}</td>
                                                <td className="border border-slate-300 p-2 text-right font-medium text-slate-900">{Number(p.netSalary).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-100 font-medium">
                                            <td colSpan="5" className="border border-slate-300 p-3 text-right text-sm uppercase">Total Payable Amount</td>
                                            <td className="border border-slate-300 p-3 text-right text-sm">{companyProfile?.currencySymbol || 'AED'}{payrolls.reduce((s, p) => s + Number(p.netSalary), 0).toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                {/* Footer summary */}
                                <div className="mb-16">
                                    <p className="text-xs text-slate-500 font-extrabold uppercase mb-1 tracking-widest">Total Amount in Words</p>
                                    <p className="border-b border-slate-300 pb-2 text-sm font-medium italic text-slate-700">
                                        Only {payrolls.reduce((s, p) => s + Number(p.netSalary), 0).toLocaleString()} {companyProfile?.currencyName || 'Rupees'}
                                    </p>
                                </div>

                                {/* Signatures */}
                                <div className="flex justify-between items-end mt-20 px-4">
                                    <div className="text-center w-56">
                                        <div className="border-t-2 border-slate-900 pt-3">
                                            <p className="text-[10px] font-medium uppercase tracking-widest">Accountant / Prepared By</p>
                                        </div>
                                    </div>
                                    <div className="text-center w-56">
                                        <div className="border-t-2 border-slate-900 pt-3">
                                            <p className="text-[10px] font-medium uppercase tracking-widest">Authorized Signatory</p>
                                            <p className="text-[8px] text-slate-400 mt-1 uppercase">For {companyProfile?.companyName}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-16 text-center text-[9px] text-slate-400 font-medium uppercase tracking-widest">
                                    This is a computer generated document and does not require a physical stamp unless specified.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
