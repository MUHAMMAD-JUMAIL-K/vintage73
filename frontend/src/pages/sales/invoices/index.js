import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { getCurrencySymbol } from '@/lib/currency';
import { FiPrinter, FiEye, FiCheckCircle, FiFileText, FiDollarSign, FiX, FiSearch, FiTrash2, FiAlertTriangle, FiEdit2, FiClock, FiUser, FiCalendar, FiTag, FiShoppingBag, FiCreditCard, FiLock } from 'react-icons/fi';

import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { useReactToPrint } from 'react-to-print';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';

export default function InvoicesList() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [salesSettings, setSalesSettings] = useState(null);
    const [returnSettings, setReturnSettings] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();

    // Print/View State — separate refs for preview modal vs direct print
    const [printData, setPrintData] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [viewLoading, setViewLoading] = useState(false);

    // Two separate refs to avoid ref collision
    const modalPrintRef = useRef();   // used inside preview modal
    const directPrintRef = useRef();  // used for direct print (off-screen)

    const handleModalPrint = useReactToPrint({ contentRef: modalPrintRef });
    const handleDirectPrint = useReactToPrint({ contentRef: directPrintRef });

    // Cancellation State — uses a DIFFERENT state var from printData
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedForDelete, setSelectedForDelete] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    
    // History Modal State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyInvoice, setHistoryInvoice] = useState(null);
    const closedDatesSet = new Set();

    useEffect(() => {
        fetchInvoices();
        fetchSettings();
    }, []);

    // Clear printData when preview modal closes to avoid stale data
    useEffect(() => {
        if (!showPreview) {
            setPrintData(null);
        }
    }, [showPreview]);

    const fetchSettings = async () => {
        try {
            const [companyRes, salesSettingsRes, returnSettingsRes] = await Promise.all([
                api.get('/company'),
                api.get('/invoice-settings', { params: { type: 'sales' } }),
                api.get('/invoice-settings', { params: { type: 'return' } })
            ]);
            setCompanyProfile(companyRes.data);
            if (salesSettingsRes.data?.settings) setSalesSettings(salesSettingsRes.data.settings);
            if (returnSettingsRes.data?.settings) setReturnSettings(returnSettingsRes.data.settings);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchInvoices = async () => {
        try {
            const { data } = await api.get('/sales?isInvoice=true');
            setInvoices(data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to fetch invoices');
        } finally {
            setLoading(false);
        }
    };

    // FIX: Pass invoiceNumber (not id) so backend query param ?invoice= works correctly
    const handleView = async (invoiceNumber) => {
        try {
            setViewLoading(true);
            const { data } = await api.get(`/sales?invoice=${encodeURIComponent(invoiceNumber)}`);
            const invoice = Array.isArray(data) ? data[0] : data;

            if (!invoice) { toast.error('Invoice not found'); return; }

            const baseSettings = invoice.isReturn ? returnSettings : salesSettings;
            const formattedData = {
                ...invoice,
                items: invoice.items.map(item => ({
                    ...item,
                    name: item.product?.name || 'Unknown Product',
                    hsnCode: item.product?.hsnCode || ''
                })),
                settings: {
                    ...(baseSettings || {}),
                    template: (invoice.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern'
                }
            };
            setPrintData(formattedData);   // set BEFORE opening modal
            setShowPreview(true);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load invoice details');
        } finally {
            setViewLoading(false);
        }
    };

    // Direct print: uses invoice row data already in the list (no extra API call)
    // Only missing: product.hsnCode — still works for printing
    const handleQuickPrint = async (inv) => {
        try {
            // Fetch full invoice data for accurate print
            const { data } = await api.get(`/sales?invoice=${encodeURIComponent(inv.invoiceNumber)}`);
            const invoice = Array.isArray(data) ? data[0] : data;
            if (!invoice) { toast.error('Invoice not found'); return; }

            const baseSettings = invoice.isReturn ? returnSettings : salesSettings;
            const formattedData = {
                ...invoice,
                items: invoice.items.map(item => ({
                    ...item,
                    name: item.product?.name || 'Unknown Product',
                    hsnCode: item.product?.hsnCode || ''
                })),
                settings: {
                    ...(baseSettings || {}),
                    template: (invoice.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern'
                }
            };
            setPrintData(formattedData);
            // small delay to let React update the off-screen ref
            setTimeout(() => handleDirectPrint(), 150);
        } catch (err) {
            toast.error('Failed to load invoice for printing');
        }
    };

    const handleDeleteClick = (invoice) => {
        setSelectedForDelete(invoice);
        setDeleteReason('');
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!deleteReason.trim()) {
            toast.warn('Please provide a reason for cancellation');
            return;
        }

        setIsDeleting(true);
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            await api.put(`/sales/${selectedForDelete.id}/cancel`, {
                cancelledBy: user.name || user.username || 'Admin',
                cancelReason: deleteReason
            });
            toast.success('Invoice cancelled successfully');
            setShowDeleteModal(false);
            fetchInvoices();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Failed to cancel invoice');
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredInvoices = invoices.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customer?.name && inv.customer.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800">Tax Invoices</h1>
                    <p className="text-slate-500 text-sm">View and manage converted quotation invoices</p>
                </div>
                <div className="relative w-full md:w-80">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search invoice # or customer..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-primary bg-white shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[850px]">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 font-medium border-b text-sm uppercase tracking-wider whitespace-nowrap">
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Invoice #</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Total Amount</th>
                                <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                        </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan="6" className="p-4 bg-slate-50/50"></td>
                                </tr>
                            ))
                        ) : filteredInvoices.map((inv) => {
                            const invDateIso = (inv.saleDate || inv.createdAt).split('T')[0];
                            const isClosedDay = closedDatesSet.has(invDateIso);

                            return (
                            <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-sm text-slate-600">
                                    {new Date(inv.createdAt || inv.saleDate).toLocaleDateString('en-GB')}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-primary">
                                    {inv.invoiceNumber}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-700">
                                    <div className="font-medium">{inv.customer?.name || 'Walk-in Customer'}</div>
                                    <div className="text-xs text-slate-400">{inv.customer?.phone}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-tighter border ${
                                            inv.status === 'cancelled'
                                            ? 'bg-red-50 text-red-600 border-red-100'
                                            : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        }`}>
                                            {inv.status}
                                        </span>
                                        {isClosedDay && (
                                            <span
                                                className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1 cursor-help"
                                                title={`This invoice belongs to a closed business day (${new Date(inv.saleDate || inv.createdAt).toLocaleDateString('en-GB')}). Closed financial records are immutable.`}
                                            >
                                                <FiLock size={9} /> Closed Day
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-right font-medium text-slate-800">
                                    {getCurrencySymbol(inv.currencyCode)}
                                    {(Number(inv.totalAmount) * Number(inv.exchangeRate || 1)).toFixed(2)}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center gap-2">
                                        {/* VIEW: pass invoiceNumber, not id */}
                                        <button
                                            onClick={() => handleView(inv.invoiceNumber)}
                                            disabled={viewLoading}
                                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                            title="View Invoice"
                                        >
                                            <FiEye size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleQuickPrint(inv)}
                                            className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                                            title="Print Invoice"
                                        >
                                            <FiPrinter size={16} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (isClosedDay) {
                                                    toast.error(`Invoice belongs to a closed business day (${new Date(inv.saleDate || inv.createdAt).toLocaleDateString('en-GB')}). Closed records cannot be edited.`);
                                                    return;
                                                }
                                                router.push(`/pos?editId=${inv.id}`);
                                            }}
                                            disabled={inv.status === 'cancelled' || isClosedDay}
                                            className={`p-1.5 rounded-lg transition-all ${
                                                inv.status === 'cancelled' || isClosedDay
                                                ? 'text-slate-200 cursor-not-allowed'
                                                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                            }`}
                                            title={isClosedDay ? 'Locked: Invoice belongs to a closed business day' : 'Edit Invoice'}
                                        >
                                            <FiEdit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (isClosedDay) {
                                                    toast.error(`Invoice belongs to a closed business day (${new Date(inv.saleDate || inv.createdAt).toLocaleDateString('en-GB')}). Closed records cannot be cancelled.`);
                                                    return;
                                                }
                                                handleDeleteClick(inv);
                                            }}
                                            disabled={inv.status === 'cancelled' || isClosedDay}
                                            className={`p-1.5 rounded-lg transition-all ${
                                                inv.status === 'cancelled' || isClosedDay
                                                ? 'text-slate-200 cursor-not-allowed'
                                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                            title={isClosedDay ? 'Locked: Invoice belongs to a closed business day' : 'Cancel Invoice'}
                                        >
                                            <FiTrash2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => { setHistoryInvoice(inv); setShowHistoryModal(true); }}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                            title="View Invoice Details"
                                        >
                                            <FiClock size={16} />
                                        </button>
                                        {isClosedDay && (
                                            <button
                                                onClick={() => router.push(`/reports/sales?businessDate=${invDateIso}`)}
                                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                title="View Closed Day Report"
                                            >
                                                <FiLock size={16} className="text-emerald-700" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                        {!loading && filteredInvoices.length === 0 && (
                            <tr>
                                <td colSpan="6" className="text-center py-12 text-slate-400">
                                    <FiFileText className="mx-auto mb-2 text-4xl opacity-20" />
                                    No invoices found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Preview Modal — uses modalPrintRef (separate from directPrintRef) */}
            {showPreview && printData && (
                <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl relative overflow-hidden flex flex-col h-[90vh]">
                        <div className="flex justify-between items-center p-4 border-b bg-white relative z-10">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800">Invoice Preview</h2>
                                <p className="text-xs text-slate-500">{printData?.invoiceNumber}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleModalPrint()}
                                    className="bg-primary text-white flex items-center gap-2 px-6 py-2 rounded-lg font-medium hover:bg-primary-dark transition-all"
                                >
                                    <FiPrinter /> Print Invoice
                                </button>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                                >
                                    <FiX size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 p-8 bg-slate-100 overflow-y-auto">
                            <div className="mx-auto shadow-2xl bg-white max-w-[800px]" ref={modalPrintRef}>
                                <ProfessionalInvoice
                                    printData={{ 
                                        ...printData, 
                                        settings: {
                                            ...((printData?.isReturn ? returnSettings : salesSettings) || {}),
                                            ...(printData?.settings || {}),
                                            template: (printData?.settings?.template || (printData?.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern')
                                        } 
                                    }}
                                    companyProfile={companyProfile}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-red-50 text-red-800">
                            <div className="flex items-center gap-2">
                                <FiAlertTriangle className="text-xl" />
                                <h2 className="font-bold uppercase tracking-widest text-xs">Cancel Invoice</h2>
                            </div>
                            <button onClick={() => setShowDeleteModal(false)} className="text-red-400 hover:text-red-600 transition-colors">
                                <FiX size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 italic text-sm text-slate-500">
                                Are you sure you want to cancel Invoice <span className="font-medium text-slate-800">{selectedForDelete?.invoiceNumber}</span>?
                                <p className="mt-1 text-[10px] non-italic text-slate-400">Stock will be restored and accounting reversed.</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1 tracking-widest ml-1">Reason for Cancellation</label>
                                <textarea
                                    className="input min-h-[100px] bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm"
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="e.g. Wrong items billed, Order returned, Duplicate entry..."
                                    required
                                />
                            </div>
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 py-3 px-4 rounded-xl font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all text-sm"
                            >
                                Nevermind
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting || !deleteReason.trim()}
                                className="flex-1 py-3 px-4 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isDeleting ? <span className="animate-pulse">Processing...</span> : 'Yes, Cancel Invoice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showHistoryModal && historyInvoice && (
                <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col">
                        <div className="p-5 border-b flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <FiClock className="text-primary" /> Invoice History
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">#{historyInvoice.invoiceNumber}</p>
                            </div>
                            <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shadow-sm">&times;</button>
                        </div>

                        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <FiUser size={12} /> Sale By
                                    </label>
                                    <p className="text-sm font-semibold text-slate-700">{historyInvoice.user?.name || historyInvoice.user?.username || 'System'}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 justify-end">
                                        <FiCalendar size={12} /> Created At
                                    </label>
                                    <p className="text-sm font-semibold text-slate-700">
                                        {new Date(historyInvoice.createdAt || historyInvoice.saleDate).toLocaleString('en-GB')}
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 flex items-center gap-1.5"><FiTag size={12} /> Customer</span>
                                    <span className="text-sm font-bold text-slate-700">{historyInvoice.customer?.name || 'Walk-in'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 flex items-center gap-1.5"><FiShoppingBag size={12} /> Items Count</span>
                                    <span className="text-sm font-medium text-slate-700">{historyInvoice.itemsCount || historyInvoice.items?.length || 0} Products</span>
                                </div>
                            </div>

                            {(() => {
                                const invoiceProductTotal = historyInvoice.items?.length > 0
                                    ? historyInvoice.items.reduce((sum, i) => sum + ((parseFloat(i.unitPrice || i.price || 0)) * (parseFloat(i.quantity) || 1)), 0)
                                    : (Number(historyInvoice.subTotal || 0) + Number(historyInvoice.discount || 0) + Number(historyInvoice.voucherDiscount || 0));
                                const invoiceDiscount = Number(historyInvoice.discount || 0) + Number(historyInvoice.voucherDiscount || 0);
                                const invoiceTaxable = historyInvoice.subTotal !== undefined && historyInvoice.subTotal !== null
                                    ? Number(historyInvoice.subTotal)
                                    : Math.max(0, invoiceProductTotal - invoiceDiscount);

                                return (
                                    <div className="space-y-2 border-t pt-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Subtotal</span>
                                            <span className="font-semibold text-slate-700">{getCurrencySymbol(historyInvoice.currencyCode)}{invoiceProductTotal.toFixed(2)}</span>
                                        </div>
                                        {invoiceDiscount > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Discount Applied</span>
                                                <span className="font-bold text-red-500">-{getCurrencySymbol(historyInvoice.currencyCode)}{invoiceDiscount.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {invoiceDiscount > 0 && (
                                            <div className="flex justify-between items-center text-sm text-slate-500 border-t border-slate-100 pt-1">
                                                <span>Taxable Amount</span>
                                                <span className="font-semibold text-slate-700">{getCurrencySymbol(historyInvoice.currencyCode)}{invoiceTaxable.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {Number(historyInvoice.taxAmount) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">Tax Total</span>
                                                <span className="font-semibold text-slate-700">{getCurrencySymbol(historyInvoice.currencyCode)}{Number(historyInvoice.taxAmount).toFixed(2)}</span>
                                            </div>
                                        )}
                                        {Number(historyInvoice.advanceUsed) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-emerald-500 font-medium flex items-center gap-1.5"><FiCreditCard size={12} /> Advance Used</span>
                                                <span className="font-bold text-emerald-600">-{getCurrencySymbol(historyInvoice.currencyCode)}{Number(historyInvoice.advanceUsed).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-3 border-t-2 border-dashed">
                                            <span className="font-bold text-slate-800 uppercase tracking-tight">Grand Total</span>
                                            <span className="text-xl font-black text-primary">
                                                {getCurrencySymbol(historyInvoice.currencyCode)}
                                                {(Number(historyInvoice.totalAmount) * Number(historyInvoice.exchangeRate || 1)).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="p-4 bg-slate-50 border-t flex justify-end">
                            <button 
                                onClick={() => setShowHistoryModal(false)}
                                className="btn btn-primary px-8 rounded-lg shadow-lg shadow-primary/20"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
                <div ref={directPrintRef}>
                    {printData && (
                        <ProfessionalInvoice
                            printData={{ 
                                ...printData, 
                                settings: {
                                    ...((printData?.isReturn ? returnSettings : salesSettings) || {}),
                                    ...(printData?.settings || {}),
                                    template: (printData?.settings?.template || (printData?.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern')
                                } 
                            }}
                            companyProfile={companyProfile}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
