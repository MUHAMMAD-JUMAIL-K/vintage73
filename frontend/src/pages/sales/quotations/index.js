import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { FiPlus, FiPrinter, FiEye, FiCheckCircle, FiFileText, FiDollarSign, FiX, FiMessageSquare } from 'react-icons/fi';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { useReactToPrint } from 'react-to-print';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';
import Swal from 'sweetalert2';
import { getCurrencySymbol, normalizeCurrencySymbol, formatAmountWithCurrency } from '@/lib/currency';

export default function QuotationsList() {
    const [quotations, setQuotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [salesSettings, setSalesSettings] = useState(null);
    const router = useRouter();

    // Print/View State
    const [printData, setPrintData] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const printRef = useRef();
    const handlePrint = useReactToPrint({ contentRef: printRef });

    useEffect(() => {
        fetchQuotations();
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const [compRes, settingsRes] = await Promise.all([
                api.get('/company'),
                api.get('/invoice-settings', { params: { type: 'sales' } })
            ]);
            setCompanyProfile(compRes.data);
            if (settingsRes.data?.settings) setSalesSettings(settingsRes.data.settings);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchQuotations = async () => {
        try {
            const { data } = await api.get('/quotations');
            setQuotations(data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to fetch quotations');
        } finally {
            setLoading(false);
        }
    };

    const handleConvert = async (id) => {
        const result = await Swal.fire({
            title: 'Convert to Invoice?',
            text: "This will create a Sale Invoice and adjust your stock levels. This action cannot be undone.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary)',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, Convert it!',
            cancelButtonText: 'Not now',
            background: '#fff',
            customClass: {
                confirmButton: 'btn btn-primary px-6 py-2',
                cancelButton: 'btn border border-gray-300 px-6 py-2 ml-3'
            },
            buttonsStyling: false
        });

        if (result.isConfirmed) {
            try {
                Swal.fire({
                    title: 'Converting...',
                    text: 'Please wait while we process the invoice.',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                await api.post(`/quotations/${id}/convert`);

                await Swal.fire({
                    title: 'Success!',
                    text: 'Quotation converted to Sale successfully!',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });

                fetchQuotations();
            } catch (error) {
                console.error(error);
                Swal.fire({
                    title: 'Error',
                    text: error.response?.data?.error || 'Conversion failed',
                    icon: 'error'
                });
            }
        }
    };

    const handleView = async (id) => {
        try {
            const { data } = await api.get(`/quotations/${id}`);
            // Format data for DynamicInvoice
            const formattedData = {
                ...data,
                items: data.items.map(item => ({
                    ...item,
                    name: item.product?.name || 'Unknown Product',
                    hsnCode: item.product?.hsnCode || ''
                }))
            };
            setPrintData(formattedData);
            setShowPreview(true);
        } catch (error) {
            toast.error('Failed to load quotation details');
        }
    };

    const handleDirectPrint = async (id) => {
        try {
            const { data } = await api.get(`/quotations/${id}`);
            const formattedData = {
                ...data,
                items: data.items.map(item => ({
                    ...item,
                    name: item.product?.name || 'Unknown Product',
                    hsnCode: item.product?.hsnCode || ''
                }))
            };
            setPrintData(formattedData);
            setTimeout(() => handlePrint(), 100);
        } catch (error) {
            toast.error('Failed to print quotation');
        }
    };

    return (
        <div className="p-6 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800">Quotations</h1>
                    <p className="text-slate-500 text-sm">Manage and track customer quotations</p>
                </div>
                <button
                    onClick={() => router.push('/sales/quotations/create')}
                    className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                    <FiPlus /> New Quotation
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                    <table className="w-full min-w-[850px]">
                        <thead className="bg-gray-50 border-b border-gray-200 whitespace-nowrap">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Quote #</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                    <tbody className="divide-y divide-gray-200">
                        {quotations.map((q) => (
                            <tr key={q.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {new Date(q.quotationDate).toLocaleDateString('en-GB')}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-blue-600">
                                    {q.quotationNumber}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-800">
                                    {q.customer?.name || 'Walk-in'}
                                </td>
                                <td className="px-6 py-4 text-sm text-right font-medium text-slate-700">
                                    {formatAmountWithCurrency(q.totalAmount, q.currencyCode || companyProfile?.currencyCode, q.currencySymbol || companyProfile?.currencySymbol)}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                                            ${q.status === 'CONVERTED' ? 'bg-green-100 text-green-800' :
                                            q.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                                                'bg-blue-100 text-blue-800'}`}>
                                        {q.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    {q.status !== 'CONVERTED' && (
                                        <button
                                            onClick={() => handleConvert(q.id)}
                                            className="text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1"
                                            title="Convert to Invoice"
                                        >
                                            <FiCheckCircle /> Convert
                                        </button>
                                    )}
                                    <button
                                        onClick={async () => {
                                            const wsSettings = await api.get('/whatsapp/settings').then(r => r.data).catch(() => null);
                                            if (!wsSettings?.apiKey) return toast.error('WhatsApp not configured');
                                            if (!q.customer?.phone) return toast.error('Customer phone missing');

                                            let msg = wsSettings.quotationTemplate || '';
                                            msg = msg.replace(/\[\[customer_name\]\]/g, q.customer?.name || 'Customer')
                                                .replace(/\[\[quotation_no\]\]/g, q.quotationNumber)
                                                .replace(/\[\[total_amount\]\]/g, formatAmountWithCurrency(q.totalAmount, q.currencyCode || companyProfile?.currencyCode, q.currencySymbol || companyProfile?.currencySymbol))
                                                .replace(/\[\[company_name\]\]/g, companyProfile?.companyName || 'Our Store');

                                            try {
                                                await api.post('/whatsapp/send', { mobile: q.customer.phone, message: msg });
                                                toast.success('WhatsApp Sent!');
                                            } catch (err) {
                                                toast.error('WhatsApp failed');
                                            }
                                        }}
                                        className="text-emerald-600 hover:text-emerald-800 text-sm font-medium flex items-center gap-1"
                                        title="Send WhatsApp"
                                    >
                                        <FiMessageSquare /> WhatsApp
                                    </button>
                                    <button
                                        onClick={() => handleView(q.id)}
                                        className="text-slate-400 hover:text-blue-600 p-1"
                                        title="View Quotation"
                                    >
                                        <FiEye />
                                    </button>
                                    <button
                                        onClick={() => handleDirectPrint(q.id)}
                                        className="text-slate-400 hover:text-orange-600 p-1"
                                        title="Print Quotation"
                                    >
                                        <FiPrinter />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {quotations.length === 0 && !loading && (
                            <tr>
                                <td colSpan="6" className="text-center py-8 text-gray-400">
                                    No quotations found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Preview Modal */}
            {
                showPreview && (
                    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl relative">
                            <div className="flex justify-between items-center p-4 border-b">
                                <h2 className="text-lg font-semibold">Quotation Preview</h2>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handlePrint()}
                                        className="btn btn-primary flex items-center gap-2 py-1.5"
                                    >
                                        <FiPrinter /> Print
                                    </button>
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                                    >
                                        <FiX size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="p-8 max-h-[80vh] overflow-y-auto bg-gray-100">
                                <div className="mx-auto shadow-lg bg-white">
                                    <ProfessionalInvoice
                                        printData={{ ...printData, settings: salesSettings }}
                                        companyProfile={companyProfile}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Off-screen Print Container (Always available for both modal and direct print) */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
                <div ref={printRef}>
                    <ProfessionalInvoice
                        printData={{ ...printData, settings: salesSettings }}
                        companyProfile={companyProfile}
                    />
                </div>
            </div>
        </div >
    );
}
