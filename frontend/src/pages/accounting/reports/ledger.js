import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiDownload, FiPrinter, FiFilter, FiSearch, FiBook } from 'react-icons/fi';
import SearchableSelect from '@/components/SearchableSelect';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency } from '@/lib/currency';

export default function LedgerReport() {
    const router = useRouter();
    const { theme } = useTheme();
    const primaryColor = theme?.primaryColor || '#059669';
    const [transactions, setTransactions] = useState([]);
    const [ledgerInfo, setLedgerInfo] = useState(null);
    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(false);

    // Ledger Selection
    const [ledgers, setLedgers] = useState([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState('');

    // Branch Filtering & Currency
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [activeBranch, setActiveBranch] = useState(null);
    const [activeCurrency, setActiveCurrency] = useState({ code: 'INR', symbol: '₹' });

    // Date Filtering (Default to current month)
    const date = new Date();
    const [startDate, setStartDate] = useState(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        fetchCompanyProfile();
        fetchLedgers();
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data || []);
        } catch (err) {
            console.error('Failed to load branches', err);
        }
    };

    const fetchCompanyProfile = async () => {
        try {
            const res = await api.get('/company');
            setCompany(res.data);
        } catch (err) {
            console.error("Failed to load company info");
        }
    };

    const fetchLedgers = async () => {
        try {
            const res = await api.get('/accounting/ledgers');
            setLedgers(res.data || []);
            return res.data;
        } catch (err) {
            console.error(err);
            toast.error("Failed to load ledgers");
            return [];
        }
    };

    // Auto-fetch if ledgerId is in query
    useEffect(() => {
        if (router.isReady && router.query.ledgerId) {
            const { ledgerId, startDate: qStart, endDate: qEnd, branchId: qBranch } = router.query;

            setSelectedLedgerId(ledgerId);
            if (qStart) setStartDate(qStart);
            if (qEnd) setEndDate(qEnd);
            if (qBranch) setSelectedBranch(qBranch);

            const autoFetch = async () => {
                setLoading(true);
                try {
                    const res = await api.get('/accounting/reports/ledger-statement', {
                        params: {
                            ledgerId: ledgerId,
                            startDate: qStart || startDate,
                            endDate: qEnd || endDate,
                            branchId: qBranch || undefined
                        }
                    });

                    setLedgerInfo(res.data.ledger);
                    setTransactions(res.data.statement || []);
                    setActiveBranch(res.data.branch || null);
                    setActiveCurrency(res.data.currency || { code: 'INR', symbol: '₹' });
                } catch (err) {
                    console.error(err);
                    toast.error('Failed to load Ledger Report');
                } finally {
                    setLoading(false);
                }
            };
            autoFetch();
        }
    }, [router.isReady, router.query]);

    const fetchReport = async (overrideBranchId) => {
        if (!selectedLedgerId) {
            toast.error("Please select a ledger");
            return;
        }

        setLoading(true);
        const targetBranchId = overrideBranchId !== undefined ? overrideBranchId : selectedBranch;
        try {
            const res = await api.get('/accounting/reports/ledger-statement', {
                params: {
                    ledgerId: selectedLedgerId,
                    startDate,
                    endDate,
                    branchId: targetBranchId || undefined
                }
            });

            setLedgerInfo(res.data.ledger);
            setTransactions(res.data.statement || []);
            setActiveBranch(res.data.branch || null);
            setActiveCurrency(res.data.currency || { code: 'INR', symbol: '₹' });
        } catch (err) {
            console.error(err);
            toast.error('Failed to load Ledger Report');
        } finally {
            setLoading(false);
        }
    };

    const formatDateDMY = (dateInput) => {
        if (!dateInput) return '-';
        // Extract YYYY-MM-DD portion from ISO string or date-only string
        // This avoids timezone shifts (e.g. IST +5:30 shifting a UTC midnight date back by one day)
        let datePart;
        if (typeof dateInput === 'string') {
            // Handles "2026-09-23T10:00:00.000Z" → "2026-09-23"
            // Handles "2026-09-23" directly
            datePart = dateInput.substring(0, 10);
        } else if (dateInput instanceof Date) {
            // Safely convert Date object using local year/month/day
            const d = dateInput;
            datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
            return '-';
        }
        // datePart is now guaranteed to be "YYYY-MM-DD"
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '-';
        const [year, month, day] = datePart.split('-');
        return `${day}/${month}/${year}`;
    };

    const handleExport = () => {
        if (!transactions.length) {
            toast.error("No data to export");
            return;
        }

        const openingBal = ledgerInfo?.openingBalance !== undefined && ledgerInfo?.openingBalance !== null
            ? Math.abs(Number(ledgerInfo.openingBalance))
            : 0;

        const closingBal = transactions.length > 0
            ? Math.abs(Number(transactions[transactions.length - 1].balance) || 0)
            : openingBal;

        const branchLabel = activeBranch ? activeBranch.name : 'All Branches (Consolidated)';
        const currLabel = activeCurrency?.code || 'INR';

        const csvContent = [
            ['Report', `${ledgerInfo?.name || 'General Ledger'} Statement`],
            ['Branch', `"${branchLabel.replace(/"/g, '""')}"`],
            ['Currency', currLabel],
            ['Period', `${formatDateDMY(startDate)} to ${formatDateDMY(endDate)}`],
            [],
            ['Date', 'Voucher No', 'Particulars', `Debit (Out) [${currLabel}]`, `Credit (In) [${currLabel}]`, `Balance [${currLabel}]`],
            // Opening Balance Row
            [
                formatDateDMY(startDate),
                '-',
                'By Balance b/d (Opening)',
                '-',
                '-',
                `${openingBal.toFixed(2)} ${ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr'}`
            ],
            // Transactions
            ...transactions.map(tx => [
                formatDateDMY(tx.date),
                `"${(tx.voucherNumber || '-').replace(/"/g, '""')}"`,
                `"${(tx.particulars || '')}${tx.narration ? ` - ${tx.narration}` : ''}".replace(/"/g, '""')`,
                (Number(tx.debit) || 0).toFixed(2),
                (Number(tx.credit) || 0).toFixed(2),
                `${Math.abs(Number(tx.balance) || 0).toFixed(2)} ${Number(tx.balance) >= 0 ? (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr') : (ledgerInfo?.balanceType === 'DEBIT' ? 'Cr' : 'Dr')}`
            ]),
            // Closing Balance Row
            [
                formatDateDMY(endDate),
                '-',
                'Total Closing Balance',
                totalDebit.toFixed(2),
                totalCredit.toFixed(2),
                `${closingBal.toFixed(2)} ${transactions.length > 0 ? (Number(transactions[transactions.length - 1].balance) >= 0 ? (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr') : (ledgerInfo?.balanceType === 'DEBIT' ? 'Cr' : 'Dr')) : (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr')}`
            ]
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const branchFilename = activeBranch ? `_${activeBranch.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '_AllBranches';
        a.download = `Ledger_${ledgerInfo?.name || 'Report'}${branchFilename}_${startDate}_to_${endDate}.csv`;
        a.click();
    };

    const handlePrint = () => {
        window.print();
    };

    const companyAddress = [company?.address, company?.city, company?.pincode ? `PIN: ${company.pincode}` : ''].filter(Boolean).join(', ');
    const totalDebit = transactions.reduce((sum, tx) => sum + (Number(tx.debit) || 0), 0);
    const totalCredit = transactions.reduce((sum, tx) => sum + (Number(tx.credit) || 0), 0);
    const openingBalNum = ledgerInfo?.openingBalance !== undefined && ledgerInfo?.openingBalance !== null
        ? Math.abs(Number(ledgerInfo.openingBalance))
        : 0;
    const closingBalNum = transactions.length > 0
        ? Math.abs(Number(transactions[transactions.length - 1].balance) || 0)
        : openingBalNum;
    const closingBalType = transactions.length > 0
        ? (transactions[transactions.length - 1].balance >= 0 ? (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr') : (ledgerInfo?.balanceType === 'DEBIT' ? 'Cr' : 'Dr'))
        : (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr');

    return (
        <div id="printable-report" className="w-full p-4 sm:p-6 lg:p-8 print:p-0 bg-white min-h-screen rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-300">
            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    
                    /* Hide everything by default */
                    body * {
                        visibility: hidden;
                    }

                    /* Show only the report container and its children */
                    #printable-report, #printable-report * {
                        visibility: visible;
                    }

                    /* Position the report at the very top */
                    #printable-report {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        border: none;
                        box-shadow: none;
                    }

                    /* Hide specific elements marked as hidden in print */
                    .print\\:hidden { 
                        display: none !important; 
                        visibility: hidden !important;
                    }
                }
            `}</style>

            {/* Controls (Hidden in Print) */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="w-full sm:w-auto sm:min-w-[200px]">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Branch</label>
                        <select
                            className="border border-slate-200 rounded-xl px-3 py-2 text-xs w-full bg-white text-slate-700 font-medium shadow-sm focus:ring-2 focus:outline-none h-[38px] cursor-pointer"
                            value={selectedBranch}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSelectedBranch(val);
                                if (selectedLedgerId) fetchReport(val);
                            }}
                        >
                            <option value="">All Branches (Consolidated)</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.name} ({b.currencyCode || 'INR'})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="w-full sm:w-auto sm:min-w-[240px]">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Select Ledger</label>
                        <SearchableSelect
                            options={ledgers.map(l => ({ value: l.id, label: `${l.name} (${l.group?.name || ''})` }))}
                            value={selectedLedgerId}
                            onChange={(val) => setSelectedLedgerId(val)}
                            placeholder="-- Choose Ledger --"
                            direction="down"
                            triggerClassName="border border-slate-200 rounded-xl px-3 py-2 text-xs w-full bg-white flex items-center justify-between h-[38px] text-slate-700 font-medium shadow-sm focus:ring-2 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From:</span>
                        <input
                            type="date"
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 transition-all"
                            style={{ borderColor: primaryColor + '40' }}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To:</span>
                        <input
                            type="date"
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 transition-all"
                            style={{ borderColor: primaryColor + '40' }}
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={fetchReport}
                        className="text-white px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <FiFilter size={15} /> Generate
                    </button>
                    {transactions.length > 0 && (
                        <button
                            onClick={handleExport}
                            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                        >
                            <FiDownload size={15} /> Excel
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                        onClick={handlePrint}
                        className="bg-slate-900 text-white hover:bg-slate-800 active:scale-95 px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                        <FiPrinter size={15} /> Print
                    </button>
                </div>
            </div>

            {loading && !ledgerInfo ? (
                <div className="p-12 text-center text-slate-400 font-medium text-sm">Loading Report...</div>
            ) : !ledgerInfo ? (
                <div className="py-20 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/40">
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
                        <FiBook size={28} className="text-slate-400" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">General Ledger Statement</h4>
                    <p className="text-xs text-slate-400 max-w-sm">Select a ledger account and date range above, then click &ldquo;Generate&rdquo; to view the complete transaction statement.</p>
                </div>
            ) : (
                <>
                    {/* Report Header */}
                    <div className="text-center border-b-2 border-slate-800 pb-5 mb-6">
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 uppercase tracking-wide">
                            {company?.companyName || 'Company Name'}
                        </h1>
                        {companyAddress && (
                            <p className="text-sm text-slate-600 mt-1 font-medium">{companyAddress}</p>
                        )}
                        <div className="mt-4 border-t border-slate-300 pt-3 inline-block px-8">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
                                {ledgerInfo.name} Report
                            </h2>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                    {activeBranch ? `Branch: ${activeBranch.name}` : 'All Branches (Consolidated)'}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Currency: {activeCurrency?.code || 'INR'} ({activeCurrency?.symbol || '₹'})
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">
                                Period: {formatDateDMY(startDate)} to {formatDateDMY(endDate)}
                            </p>
                        </div>
                    </div>

                    {/* Report Content */}
                    <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto rounded-xl border border-slate-200">
                        <table className="table-modern w-full border-collapse text-sm min-w-[750px]">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 whitespace-nowrap text-xs font-bold uppercase tracking-wider">
                                    <th className="border-b border-r border-slate-300 px-4 py-3 text-left w-[12%]">Date</th>
                                    <th className="border-b border-r border-slate-300 px-4 py-3 text-left w-[15%]">Voucher No</th>
                                    <th className="border-b border-r border-slate-300 px-4 py-3 text-left w-[35%]">Particulars</th>
                                    <th className="border-b border-r border-slate-300 px-4 py-3 text-right w-[12%]">Debit (Out)</th>
                                    <th className="border-b border-r border-slate-300 px-4 py-3 text-right w-[12%]">Credit (In)</th>
                                    <th className="border-b border-slate-300 px-4 py-3 text-right w-[14%]">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Opening Balance Row */}
                                <tr className="bg-slate-50 font-semibold text-slate-700">
                                    <td className="border-b border-r border-slate-200 px-4 py-2.5">{startDate ? formatDateDMY(startDate) : 'Opening'}</td>
                                    <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-400">-</td>
                                    <td className="border-b border-r border-slate-200 px-4 py-2.5 italic">By Balance b/d (Opening)</td>
                                    <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right text-slate-700">
                                        {ledgerInfo?.openingDebit ? formatCurrency(ledgerInfo.openingDebit, activeCurrency) : '-'}
                                    </td>
                                    <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right text-slate-700">
                                        {ledgerInfo?.openingCredit ? formatCurrency(ledgerInfo.openingCredit, activeCurrency) : '-'}
                                    </td>
                                    <td className="border-b border-slate-200 px-4 py-2.5 text-right font-mono font-medium text-slate-800">
                                        {formatCurrency(openingBalNum, activeCurrency)}
                                        <span className="text-[10px] ml-1 text-slate-500 font-bold">
                                            {ledgerInfo?.openingBalance >= 0 ? (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr') : (ledgerInfo?.balanceType === 'DEBIT' ? 'Cr' : 'Dr')}
                                        </span>
                                    </td>
                                </tr>
                                {/* Transactions */}
                                {transactions.map((tx, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                            {formatDateDMY(tx.date)}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-600 text-xs">
                                            <span className="font-medium text-slate-800">{tx.voucherNumber}</span>
                                            {tx.voucherType && (
                                                <span className="block text-[10px] text-slate-400 uppercase font-semibold">{tx.voucherType.toLowerCase()}</span>
                                            )}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-800 font-medium">
                                            {tx.particulars}
                                            {tx.narration && (
                                                <div className="text-[11px] text-slate-500 font-normal italic mt-0.5">{tx.narration}</div>
                                            )}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right font-medium text-red-700">
                                            {tx.debit > 0 ? formatCurrency(tx.debit, activeCurrency) : '-'}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right font-medium text-emerald-700">
                                            {tx.credit > 0 ? formatCurrency(tx.credit, activeCurrency) : '-'}
                                        </td>
                                        <td className="border-b border-slate-200 px-4 py-2.5 text-right font-mono text-slate-800 bg-slate-50/40">
                                            {formatCurrency(Math.abs(Number(tx.balance) || 0), activeCurrency)}
                                            <span className="text-[10px] ml-1 text-slate-400 font-semibold">
                                                {tx.balance >= 0 ? (ledgerInfo.balanceType === 'DEBIT' ? 'Dr' : 'Cr') : (ledgerInfo.balanceType === 'DEBIT' ? 'Cr' : 'Dr')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}

                                {/* Empty Row if no transactions */}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="border-b border-slate-200 px-4 py-12 text-center text-slate-400 italic">
                                            No transactions found in this period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot>
                                {/* Closing Balance Row */}
                                <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-800 text-slate-900">
                                    <td className="border-r border-slate-300 px-4 py-3" colSpan="3">Total Closing Balance</td>
                                    <td className="border-r border-slate-300 px-4 py-3 text-right text-red-700">
                                        {totalDebit > 0 ? formatCurrency(totalDebit, activeCurrency) : '-'}
                                    </td>
                                    <td className="border-r border-slate-300 px-4 py-3 text-right text-emerald-700">
                                        {totalCredit > 0 ? formatCurrency(totalCredit, activeCurrency) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-base text-slate-900 font-extrabold font-mono">
                                        {formatCurrency(closingBalNum, activeCurrency)}
                                        <span className="text-xs ml-1 text-slate-600 font-bold">
                                            {closingBalType}
                                        </span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        <div className="mt-12 grid grid-cols-2 gap-8 print:mt-16 pb-6">
                            <div className="text-center pt-8 border-t border-slate-300 w-48 sm:w-60 ml-4 sm:ml-8">
                                <p className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wider">Accountant Sign</p>
                            </div>
                            <div className="text-center pt-8 border-t border-slate-300 w-48 sm:w-60 ml-auto mr-4 sm:mr-8">
                                <p className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wider">Authorized Signatory</p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
