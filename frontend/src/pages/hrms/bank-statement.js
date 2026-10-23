import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiCreditCard, FiPrinter, FiFilter, FiCalendar, FiSearch, FiFileText } from 'react-icons/fi';
import { useReactToPrint } from 'react-to-print';

export default function BankStatementPage() {
    const [payrolls, setPayrolls] = useState([]);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        month: new Date().toLocaleString('default', { month: 'long' }),
        year: new Date().getFullYear().toString(),
        status: 'APPROVED' // Default to approved/paid for bank statement
    });

    const bankStatementRef = useRef();
    const handlePrint = useReactToPrint({
        contentRef: bankStatementRef,
    });

    useEffect(() => {
        fetchCompanyProfile();
    }, []);

    useEffect(() => {
        fetchPayroll();
    }, [filters.month, filters.year, filters.status]);

    const fetchPayroll = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
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

    const totalAmount = payrolls.reduce((s, p) => s + Number(p.netSalary), 0);

    return (
        <div className="p-6 w-full space-y-6">
            {/* Standard Header */}
            <header className="bg-slate-900 p-4 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <FiCreditCard className="text-primary text-xl" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-white leading-tight">Salary Disbursement</h1>
                        <p className="text-slate-400 text-[10px] uppercase font-medium tracking-widest mt-0.5">Bank Statement Report</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Month Picker */}
                    <div className="bg-slate-800 rounded-lg p-1 border border-slate-700 flex items-center">
                        <select
                            className="bg-transparent text-white text-xs font-medium border-none focus:ring-0 cursor-pointer py-1 pl-2 pr-8"
                            value={filters.month}
                            onChange={e => setFilters({ ...filters, month: e.target.value })}
                        >
                            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                                <option key={m} value={m} className="bg-slate-800 text-white">{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Year Input */}
                    <div className="bg-slate-800 rounded-lg px-3 py-1.5 border border-slate-700 w-24">
                        <input
                            type="number"
                            className="bg-transparent text-white text-xs font-medium w-full border-none p-0 focus:ring-0"
                            value={filters.year}
                            onChange={e => setFilters({ ...filters, year: e.target.value })}
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="bg-slate-800 rounded-lg p-1 border border-slate-700 flex items-center">
                        <select
                            className="bg-transparent text-white text-xs font-medium border-none focus:ring-0 cursor-pointer py-1 pl-2 pr-8"
                            value={filters.status}
                            onChange={e => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="GENERATED" className="bg-slate-800">Generated</option>
                            <option value="APPROVED" className="bg-slate-800">Approved</option>
                            <option value="PAID" className="bg-slate-800">Paid</option>
                        </select>
                    </div>

                    <div className="h-8 w-px bg-slate-700 mx-1 hidden md:block"></div>

                    <button
                        onClick={fetchPayroll}
                        className="h-9 bg-primary hover:bg-primary-dark text-white rounded-lg px-4 flex items-center gap-2 transition-all text-xs font-medium uppercase tracking-wider shadow-lg shadow-primary/20"
                    >
                        <FiSearch /> Search
                    </button>

                    <button
                        onClick={handlePrint}
                        disabled={payrolls.length === 0}
                        className="h-9 bg-white text-slate-900 hover:bg-slate-50 rounded-lg px-4 flex items-center gap-2 transition-all text-xs font-medium uppercase tracking-wider shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FiPrinter /> Print
                    </button>
                </div>
            </header>

            {/* Statement Preview */}
            <div className="bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 p-12 overflow-x-auto min-h-[600px] flex items-start justify-center">
                {loading ? (
                    <div className="mt-20 flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                        <p className="text-slate-400 font-medium uppercase text-[10px] tracking-[0.2em]">Preparing Statement...</p>
                    </div>
                ) : payrolls.length === 0 ? (
                    <div className="mt-20 text-center">
                        <FiFileText size={48} className="mx-auto text-slate-200 mb-4" />
                        <p className="text-slate-400 font-medium italic">No payroll records found for the selected period.</p>
                        <p className="text-slate-400 text-xs">Try selecting a different month or status.</p>
                    </div>
                ) : (
                    <div className="bg-white p-16 shadow-2xl rounded-[2rem] w-full max-w-4xl print:shadow-none print:p-0 print:m-0" ref={bankStatementRef}>
                        {/* Print Header */}
                        <div className="text-center border-b-2 border-slate-900 pb-8 mb-10">
                            <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-tighter mb-1">{companyProfile?.companyName}</h2>
                            <p className="text-slate-500 text-sm font-medium">{companyProfile?.address}, {companyProfile?.city}, {companyProfile?.state}</p>
                            <p className="text-slate-500 text-xs mt-1 font-medium">GSTIN: {companyProfile?.gstin} | Pan: {companyProfile?.pan}</p>
                        </div>

                        <div className="flex justify-between items-end mb-8 border-b border-slate-100 pb-8">
                            <div>
                                <h3 className="text-lg font-medium text-slate-800 uppercase underline decoration-2 underline-offset-4 mb-4">SALARY DISBURSEMENT STATEMENT</h3>
                                <div className="space-y-1 text-sm text-slate-600 font-medium">
                                    <p><span className="font-medium text-slate-900">Period:</span> {filters.month} {filters.year}</p>
                                    <p><span className="font-medium text-slate-900">Document Type:</span> Bank Disbursement</p>
                                </div>
                            </div>
                            <div className="text-right">
                                {companyProfile?.bank && (
                                    <div className="mb-4 text-xs">
                                        <p className="font-medium text-slate-400 uppercase tracking-widest text-[9px] mb-1">Source Bank Details</p>
                                        <p className="font-medium text-slate-800">{companyProfile.bank.name} - {companyProfile.bank.branchName}</p>
                                        <p className="text-slate-600">A/C: <span className="font-mono">{companyProfile.bank.accountNumber}</span></p>
                                        <p className="text-slate-600 text-[10px]">IFSC: <span className="font-mono">{companyProfile.bank.ifscCode}</span></p>
                                    </div>
                                )}
                                <div className="text-xs font-medium text-slate-500 space-y-1">
                                    <p>Date: {new Date().toLocaleDateString('en-GB')}</p>
                                    <p>Document No: BS-{filters.month?.substring(0, 3).toUpperCase()}-{filters.year}</p>
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        <table className="w-full border-collapse border border-slate-300 text-[11px] mb-10">
                        <thead className="whitespace-nowrap">
                            <tr className="bg-slate-50">
                                <th className="border border-slate-300 p-2 text-center w-8">#</th>
                                <th className="border border-slate-300 p-2 text-left">EMPLOYEE NAME</th>
                                <th className="border border-slate-300 p-2 text-left">BANK NAME</th>
                                <th className="border border-slate-300 p-2 text-left w-32">ACCOUNT NUMBER</th>
                                <th className="border border-slate-300 p-2 text-left w-24">IFSC CODE</th>
                                <th className="border border-slate-300 p-2 text-right w-24">AMOUNT ({companyProfile?.currencySymbol || 'AED'})</th>
                            </tr>
                        </thead>
                            <tbody>
                                {payrolls.map((p, idx) => (
                                    <tr key={p.id}>
                                        <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                                        <td className="border border-slate-300 p-2 font-medium uppercase">{p.user?.name}</td>
                                        <td className="border border-slate-300 p-2">{p.user?.employeeProfile?.bankName || '-'}</td>
                                        <td className="border border-slate-300 p-2 font-mono font-medium tracking-tight">{p.user?.employeeProfile?.accountNumber || '-'}</td>
                                        <td className="border border-slate-300 p-2 font-mono uppercase text-[10px]">{p.user?.employeeProfile?.ifscCode || '-'}</td>
                                        <td className="border border-slate-300 p-2 text-right font-medium text-slate-900">{Number(p.netSalary).toLocaleString()}</td>
                                    </tr>
                                ))}
                                <tr className="bg-slate-50 font-medium">
                                    <td colSpan="5" className="border border-slate-300 p-3 text-right text-xs uppercase">Total Transfer Amount</td>
                                    <td className="border border-slate-300 p-3 text-right text-xs">{companyProfile?.currencySymbol || 'AED'}{totalAmount.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Summary */}
                        <div className="mb-16">
                            <p className="text-[10px] text-slate-400 font-medium uppercase mb-1 tracking-widest">Amount in Words</p>
                            <p className="border-b border-slate-200 pb-2 text-sm font-medium italic text-slate-700">
                                {totalAmount.toLocaleString()} {companyProfile?.currencyName || 'Rupees'} Only
                            </p>
                        </div>

                        {/* Signatures */}
                        <div className="flex justify-between items-end mt-20 px-4">
                            <div className="text-center w-56">
                                <div className="border-t-2 border-slate-900 pt-3">
                                    <p className="text-[10px] font-medium uppercase tracking-widest">Prepared By</p>
                                </div>
                            </div>
                            <div className="text-center w-56">
                                <div className="border-t-2 border-slate-900 pt-3">
                                    <p className="text-[10px] font-medium uppercase tracking-widest">Authorized Signatory</p>
                                    <p className="text-[8px] text-slate-400 mt-1 uppercase">For {companyProfile?.companyName}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-16 text-center text-[9px] text-slate-300 font-medium uppercase tracking-[0.2em] print:hidden">
                            This is a computer generated document
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
