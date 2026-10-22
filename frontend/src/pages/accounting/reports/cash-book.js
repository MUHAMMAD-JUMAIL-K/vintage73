import React, { useState, useEffect, Fragment } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiDownload, FiPrinter, FiFilter, FiChevronDown, FiChevronRight, FiPhone, FiCalendar } from 'react-icons/fi';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency, extractCurrencyMeta } from '@/lib/currency';

export default function CashBookReport() {
    const { theme } = useTheme();
    const primaryColor = theme?.primaryColor || '#059669';
    const [transactions, setTransactions] = useState([]);
    const [ledgerInfo, setLedgerInfo] = useState(null);
    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expandedRows, setExpandedRows] = useState({});

    // Branch Filtering & Currency
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [activeBranch, setActiveBranch] = useState(null);
    const [reportCurrency, setReportCurrency] = useState({ code: 'INR', symbol: '₹' });

    const toggleRow = (id) => {
        setExpandedRows(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    // Date Filtering (Default to current month)
    const date = new Date();
    const [startDate, setStartDate] = useState(new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        fetchCompanyProfile();
        fetchBranches();
        fetchCashReport();
    }, []); // Initial load

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data || []);
        } catch (err) {
            console.error("Failed to load branches", err);
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

    const fetchCashReport = async (overrideBranchId) => {
        setLoading(true);
        const targetBranchId = overrideBranchId !== undefined ? overrideBranchId : selectedBranch;
        try {
            // Call dedicated Cash Book report endpoint with branchId
            const res = await api.get('/accounting/reports/cash-book', {
                params: {
                    startDate,
                    endDate,
                    branchId: targetBranchId || undefined
                }
            });

            setLedgerInfo(res.data.ledger);
            setTransactions(res.data.statement || []);
            setActiveBranch(res.data.branch || null);
            if (res.data.currency) {
                setReportCurrency(res.data.currency);
            } else if (res.data.branch) {
                setReportCurrency({
                    code: res.data.branch.currencyCode || 'INR',
                    symbol: res.data.branch.currencySymbol || '₹'
                });
            } else {
                setReportCurrency({ code: 'INR', symbol: '₹' });
            }
        } catch (err) {
            console.error("Cash Book fetch error:", err);
            // Fallback to ledger-statement with isCashBook=true
            try {
                const ledgersRes = await api.get('/accounting/ledgers?search=Cash');
                let cashLedger = (ledgersRes.data || []).find(l => {
                    const name = (l.name || '').trim().toLowerCase();
                    return name === 'cash' || name === 'cash in hand' || name === 'cash-in-hand' || name === 'cash account';
                }) || (ledgersRes.data || []).find(l => (l.name || '').toLowerCase().includes('cash'));

                if (cashLedger) {
                    const fallbackRes = await api.get('/accounting/reports/ledger-statement', {
                        params: {
                            ledgerId: cashLedger.id,
                            startDate,
                            endDate,
                            branchId: targetBranchId || undefined,
                            isCashBook: 'true'
                        }
                    });
                    setLedgerInfo(fallbackRes.data.ledger);
                    setTransactions(fallbackRes.data.statement || []);
                    setActiveBranch(fallbackRes.data.branch || null);
                    if (fallbackRes.data.currency) {
                        setReportCurrency(fallbackRes.data.currency);
                    }
                    return;
                }
            } catch (fallbackErr) {
                console.error("Fallback error:", fallbackErr);
            }
            toast.error('Failed to load Cash Book');
        } finally {
            setLoading(false);
        }
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
        const currLabel = reportCurrency?.code || 'INR';

        const csvContent = [
            ['Report', 'Cash Book Report'],
            ['Branch', `"${branchLabel.replace(/"/g, '""')}"`],
            ['Currency', currLabel],
            ['Period', `${startDate} to ${endDate}`],
            [],
            ['Date', 'Voucher No', 'Particulars', `Debit (Out) [${currLabel}]`, `Credit (In) [${currLabel}]`, `Balance [${currLabel}]`],
            // Opening Balance Row
            [
                startDate,
                '-',
                'By Balance b/d (Opening)',
                '-',
                '-',
                `${openingBal.toFixed(2)} ${ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr'}`
            ],
            // Transactions
            ...transactions.map(tx => [
                new Date(tx.date).toLocaleDateString(),
                `"${(tx.voucherNumber || '-').replace(/"/g, '""')}"`,
                `"${(tx.particulars || 'Sale').replace(/"/g, '""')}"`,
                (Number(tx.debit) || 0).toFixed(2),
                (Number(tx.credit) || 0).toFixed(2),
                `${Math.abs(Number(tx.balance) || 0).toFixed(2)} ${Number(tx.balance) >= 0 ? 'Dr' : 'Cr'}`
            ]),
            // Closing Balance Row
            [
                endDate,
                '-',
                'Total Closing Balance',
                totalDebit.toFixed(2),
                totalCredit.toFixed(2),
                `${closingBal.toFixed(2)} ${transactions.length > 0 ? (Number(transactions[transactions.length - 1].balance) >= 0 ? 'Dr' : 'Cr') : (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr')}`
            ]
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const branchFilename = activeBranch ? `_${activeBranch.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '_AllBranches';
        a.download = `CashBook${branchFilename}_${startDate}_to_${endDate}.csv`;
        a.click();
    };

    const handlePrint = () => {
        window.print();
    };

    const totalDebit = transactions.reduce((sum, tx) => sum + (Number(tx.debit) || 0), 0);
    const totalCredit = transactions.reduce((sum, tx) => sum + (Number(tx.credit) || 0), 0);
    const openingBalanceNum = ledgerInfo?.openingBalance !== undefined && ledgerInfo?.openingBalance !== null
        ? Math.abs(Number(ledgerInfo.openingBalance))
        : 0;
    const closingBalanceNum = transactions.length > 0
        ? Math.abs(Number(transactions[transactions.length - 1].balance) || 0)
        : openingBalanceNum;
    const closingBalanceType = transactions.length > 0
        ? (transactions[transactions.length - 1].balance >= 0 ? 'Dr' : 'Cr')
        : (ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr');

    const companyAddress = [company?.address, company?.city, company?.pincode ? `PIN: ${company.pincode}` : ''].filter(Boolean).join(', ');

    if (loading && !ledgerInfo) return <div className="p-12 text-center text-slate-500 font-medium text-sm">Loading Cash Book...</div>;

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
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Branch:</span>
                        <select
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 transition-all cursor-pointer"
                            style={{ borderColor: primaryColor + '40' }}
                            value={selectedBranch}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSelectedBranch(val);
                                fetchCashReport(val);
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
                        onClick={fetchCashReport}
                        className="text-white px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <FiFilter size={15} /> Filter
                    </button>
                    <button
                        onClick={handleExport}
                        className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
                    >
                        <FiDownload size={15} /> Excel
                    </button>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                        onClick={handlePrint}
                        className="bg-slate-900 text-white hover:bg-slate-800 active:scale-95 px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
                    >
                        <FiPrinter size={15} /> Print Report
                    </button>
                </div>
            </div>

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
                        Cash Book Report
                    </h2>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {activeBranch ? `Branch: ${activeBranch.name}` : 'All Branches (Consolidated)'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Currency: {reportCurrency?.code || 'INR'} ({reportCurrency?.symbol || '₹'})
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">
                        Period: {startDate} to {endDate}
                    </p>
                </div>
            </div>

            {/* Report Content Table */}
            <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto rounded-xl border border-slate-200">
                <table className="table-modern w-full border-collapse text-sm min-w-[750px]">
                    <thead>
                        <tr className="bg-slate-100 text-slate-700 whitespace-nowrap text-xs font-bold uppercase tracking-wider">
                            <th className="border-b border-r border-slate-300 px-3 py-3 text-center w-[4%] print:hidden"></th>
                            <th className="border-b border-r border-slate-300 px-4 py-3 text-left w-[12%]">Date</th>
                            <th className="border-b border-r border-slate-300 px-4 py-3 text-left w-[15%]">Voucher No</th>
                            <th className="border-b border-r border-slate-300 px-4 py-3 text-left w-[33%]">Particulars</th>
                            <th className="border-b border-r border-slate-300 px-4 py-3 text-right w-[12%]">Debit (Out)</th>
                            <th className="border-b border-r border-slate-300 px-4 py-3 text-right w-[12%]">Credit (In)</th>
                            <th className="border-b border-slate-300 px-4 py-3 text-right w-[12%]">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Opening Balance Row */}
                        <tr className="bg-slate-50 font-semibold text-slate-700">
                            <td className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-slate-400 print:hidden">-</td>
                            <td className="border-b border-r border-slate-200 px-4 py-2.5">{startDate}</td>
                            <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-400">-</td>
                            <td className="border-b border-r border-slate-200 px-4 py-2.5 italic">By Balance b/d (Opening)</td>
                            <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right text-slate-400">-</td>
                            <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right text-slate-400">-</td>
                            <td className="border-b border-slate-200 px-4 py-2.5 text-right font-medium text-slate-800">
                                {formatCurrency(openingBalanceNum, reportCurrency)}
                                <span className="text-[10px] ml-1 text-slate-500 font-bold">{ledgerInfo?.balanceType === 'DEBIT' ? 'Dr' : 'Cr'}</span>
                            </td>
                        </tr>

                        {/* Transactions */}
                        {transactions.map((tx, idx) => {
                            const rowKey = tx.id || idx;
                            const isExpanded = !!expandedRows[rowKey];
                            return (
                                <Fragment key={rowKey}>
                                    <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-slate-50/60' : ''}`}>
                                        <td className="border-b border-r border-slate-200 px-2.5 py-2.5 text-center print:hidden">
                                            {tx.isSale ? (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRow(rowKey)}
                                                    className="inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 active:scale-95 transition-all focus:outline-none"
                                                    title={isExpanded ? "Collapse sale details" : "Expand sale details"}
                                                >
                                                    {isExpanded ? <FiChevronDown size={15} className="text-slate-700" /> : <FiChevronRight size={15} />}
                                                </button>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                            {new Date(tx.date).toLocaleDateString()}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-600 text-xs">
                                            <div className="font-medium text-slate-800" title={tx.voucherNumber}>
                                                {tx.details?.invoiceNumbers && tx.details.invoiceNumbers.length > 2
                                                    ? `${tx.details.invoiceNumbers.slice(0, 2).join(', ')} (+${tx.details.invoiceNumbers.length - 2} more)`
                                                    : (tx.voucherNumber || '-')}
                                            </div>
                                            {tx.voucherType && (
                                                <span className="block text-[10px] text-slate-400 uppercase font-semibold">{tx.voucherType.toLowerCase()}</span>
                                            )}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-slate-800 font-medium">
                                            {tx.particulars}
                                            {tx.particulars !== 'Sale' && tx.narration && (
                                                <div className="text-[11px] text-slate-500 font-normal italic mt-0.5">{tx.narration}</div>
                                            )}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right font-medium text-red-700">
                                            {Number(tx.debit) > 0
                                                ? formatCurrency(tx.debit, reportCurrency)
                                                : (tx.particulars === 'Customer Credit' || tx.voucherType === 'Credit' || tx.details?.isCustomerCredit
                                                    ? formatCurrency(0, reportCurrency)
                                                    : '-')}
                                        </td>
                                        <td className="border-b border-r border-slate-200 px-4 py-2.5 text-right font-medium text-emerald-700">
                                            {Number(tx.credit) > 0 ? formatCurrency(tx.credit, reportCurrency) : '-'}
                                        </td>
                                        <td className="border-b border-slate-200 px-4 py-2.5 text-right font-mono text-slate-800 bg-slate-50/40">
                                            {formatCurrency(Math.abs(Number(tx.balance) || 0), reportCurrency)}
                                            <span className="text-[10px] ml-1 text-slate-400 font-semibold">{tx.balance >= 0 ? 'Dr' : 'Cr'}</span>
                                        </td>
                                    </tr>

                                    {/* Expandable Sale Breakdown */}
                                    {isExpanded && tx.isSale && (
                                        <tr className="bg-slate-50/80 border-b border-slate-200 animate-in fade-in duration-200 print:table-row">
                                            <td colSpan="7" className="p-3 sm:p-5">
                                                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                                                    {/* 1. Daily Sales Summary Header */}
                                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase border border-slate-200/60">
                                                                S
                                                            </span>
                                                            <div>
                                                                <span className="font-bold text-slate-900 text-sm block">Daily Sales</span>
                                                                <span className="text-[11px] text-slate-400">
                                                                    {(() => { const cnt = tx.details?.totalSalesCount || tx.details?.sales?.length || 1; return cnt > 1 ? `${cnt} invoices on this date` : '1 invoice on this date'; })()}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                                            <span className="text-slate-600 flex items-center gap-1 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60 text-xs">
                                                                <FiCalendar size={12} className="text-slate-400" />
                                                                {new Date(tx.date).toLocaleDateString()}
                                                            </span>
                                                            {tx.details?.invoiceNumbers?.length > 0 && (
                                                                <span className="bg-slate-100 text-slate-700 font-mono font-medium px-2.5 py-1 rounded-lg border border-slate-200/60 text-xs">
                                                                    {tx.details.invoiceNumbers.length === 1
                                                                        ? `Invoice: ${tx.details.invoiceNumbers[0]}`
                                                                        : `${tx.details.invoiceNumbers.length} Invoices`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* 2. All Customers & Invoices — Table Layout */}
                                                    {tx.details?.sales && tx.details.sales.length > 0 && (
                                                        <div className="overflow-x-auto -mx-1">
                                                            <table className="min-w-full text-xs border-collapse">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                                        <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Date</th>
                                                                        <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Customer Name</th>
                                                                        <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Mobile</th>
                                                                        <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Invoice No</th>
                                                                        <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Sale Amount</th>
                                                                        <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Cash</th>
                                                                        <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">UPI</th>
                                                                        <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Card</th>
                                                                        <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">Cust. Credit</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {tx.details.sales.map((sale, sIdx) => {
                                                                        const fmt = (v) => Number(v || 0) > 0
                                                                            ? formatCurrency(v, reportCurrency)
                                                                            : '—';
                                                                        return (
                                                                            <tr
                                                                                key={sale.id || sIdx}
                                                                                className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${sIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                                                                            >
                                                                                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                                                                    {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-slate-800 font-medium max-w-[140px]">
                                                                                    <span className="truncate block" title={sale.customerName || 'Walk-in'}>
                                                                                        {sale.customerName || <span className="text-slate-400 italic">Walk-in</span>}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-3 py-2 text-slate-500 font-mono whitespace-nowrap">
                                                                                    {sale.customerPhone || '—'}
                                                                                </td>
                                                                                <td className="px-3 py-2 whitespace-nowrap">
                                                                                    <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                                                                        {sale.invoiceNumber || '—'}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-semibold text-slate-900 font-mono whitespace-nowrap">
                                                                                    {formatCurrency(sale.totalAmount || 0, reportCurrency)}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right text-slate-700 font-mono whitespace-nowrap">
                                                                                    {fmt(sale.cashAmount)}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right text-slate-700 font-mono whitespace-nowrap">
                                                                                    {fmt(sale.upiAmount)}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right text-slate-700 font-mono whitespace-nowrap">
                                                                                    {fmt(sale.cardAmount)}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                                                                                    {Number(sale.creditAmount) > 0
                                                                                        ? <span className="text-amber-700 font-semibold">{formatCurrency(sale.creditAmount, reportCurrency)}</span>
                                                                                        : <span className="text-slate-400">—</span>}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                                {/* Totals Footer */}
                                                                {tx.details.sales.length > 1 && (() => {
                                                                    const tot = tx.details.sales.reduce((acc, s) => ({
                                                                        totalAmount: acc.totalAmount + Number(s.totalAmount || 0),
                                                                        cashAmount:  acc.cashAmount  + Number(s.cashAmount  || 0),
                                                                        upiAmount:   acc.upiAmount   + Number(s.upiAmount   || 0),
                                                                        cardAmount:  acc.cardAmount  + Number(s.cardAmount  || 0),
                                                                        creditAmount:acc.creditAmount+ Number(s.creditAmount|| 0),
                                                                    }), { totalAmount: 0, cashAmount: 0, upiAmount: 0, cardAmount: 0, creditAmount: 0 });
                                                                    const fmtTot = (v) => v > 0
                                                                        ? formatCurrency(v, reportCurrency)
                                                                        : '—';
                                                                    return (
                                                                        <tfoot>
                                                                            <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                                                                                <td className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500" colSpan="4">Total ({tx.details.sales.length} invoices)</td>
                                                                                <td className="px-3 py-2 text-right font-mono">{formatCurrency(tot.totalAmount, reportCurrency)}</td>
                                                                                <td className="px-3 py-2 text-right font-mono">{fmtTot(tot.cashAmount)}</td>
                                                                                <td className="px-3 py-2 text-right font-mono">{fmtTot(tot.upiAmount)}</td>
                                                                                <td className="px-3 py-2 text-right font-mono">{fmtTot(tot.cardAmount)}</td>
                                                                                <td className="px-3 py-2 text-right font-mono text-amber-700">{fmtTot(tot.creditAmount)}</td>
                                                                            </tr>
                                                                        </tfoot>
                                                                    );
                                                                })()}
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}

                        {/* Empty Row if no transactions */}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan="7" className="border-b border-slate-200 px-4 py-12 text-center text-slate-400 italic">
                                    No transactions found in this period.
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        {/* Closing Balance Row */}
                        <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-800 text-slate-900">
                            <td className="border-r border-slate-300 px-4 py-3 print:hidden" colSpan="1"></td>
                            <td className="border-r border-slate-300 px-4 py-3" colSpan="3">Total Closing Balance</td>
                            <td className="border-r border-slate-300 px-4 py-3 text-right text-red-700">
                                {totalDebit > 0 ? formatCurrency(totalDebit, reportCurrency) : '-'}
                            </td>
                            <td className="border-r border-slate-300 px-4 py-3 text-right text-emerald-700">
                                {totalCredit > 0 ? formatCurrency(totalCredit, reportCurrency) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-base text-slate-900 font-extrabold font-mono">
                                {formatCurrency(closingBalanceNum, reportCurrency)}
                                <span className="text-xs ml-1 text-slate-600 font-bold">
                                    {closingBalanceType}
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
        </div>
    );
}
