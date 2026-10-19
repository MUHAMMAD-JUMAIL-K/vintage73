import { useState, useEffect, useRef } from 'react';

import api from '@/lib/api';
import { toast } from 'react-toastify';
import { 
  FiSave, FiLayout, FiFileText, FiRefreshCw, FiCalendar, FiPlus, FiSearch, FiEdit2, FiTrash2, 
  FiImage, FiHash, FiGrid, FiMapPin, FiPhone, FiUser, FiCheckSquare, FiPenTool, FiType, FiDollarSign, FiBriefcase, FiPercent,
  FiSettings, FiMonitor, FiSmartphone, FiPrinter, FiCloud, FiMoreHorizontal, FiDownloadCloud
} from 'react-icons/fi';

import Modal from '@/components/Modal';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';
import { INVOICE_TEMPLATES, getTemplateName, normalizeTemplateId } from '@/lib/invoiceTemplates';

const COMPONENT_METADATA = {
  showLogo: { label: 'Logo', icon: FiImage },
  showCompanyName: { label: 'Company Name', icon: FiType },
  showAddress: { label: 'Address', icon: FiMapPin },
  showContact: { label: 'Contact Info', icon: FiPhone },
  showInvoiceMeta: { label: 'Invoice Info', icon: FiGrid },
  showCustomer: { label: 'Customer', icon: FiUser },
  showSalesman: { label: 'Salesman', icon: FiUser },
  showDetailsTable: { label: 'Items Table', icon: FiGrid },
  showTotalSummary: { label: 'Billing Summary', icon: FiHash },
  showTaxSummary: { label: 'GST Breakdown', icon: FiPercent },
  showPaymentInfo: { label: 'Payment Details', icon: FiDollarSign },
  showBankDetails: { label: 'Bank Details', icon: FiBriefcase },
  showUdfFields: { label: 'Custom Fields', icon: FiEdit2 },
  showCustomNote: { label: 'Custom Note/Text', icon: FiFileText },
  showTerms: { label: 'Terms', icon: FiCheckSquare },
  showSignature: { label: 'Signature', icon: FiPenTool },
  showFooterNote: { label: 'Footer Note', icon: FiFileText },
  showReturnInfo: { label: 'Return Info', icon: FiRefreshCw },
  showColQty: { label: 'Qty Column', icon: FiGrid },
  showColPrice: { label: 'Price Column', icon: FiGrid },
  showColTax: { label: 'GST Column', icon: FiGrid },
  showColTotal: { label: 'Total Column', icon: FiGrid }
};


export default function InvoiceSettings() {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'return' | 'fy'
    const [previewMode, setPreviewMode] = useState('Desktop'); // 'Desktop' | 'Mobile'
    const [previewScale, setPreviewScale] = useState(1);
    const [previewHeight, setPreviewHeight] = useState('auto');
    const previewContainerRef = useRef(null);
    const previewCanvasRef = useRef(null);
    const [fyList, setFyList] = useState([]);
    const [isFyModalOpen, setIsFyModalOpen] = useState(false);
    const [fySearch, setFySearch] = useState('');
    const [editingFy, setEditingFy] = useState(null);
    const [fyFormData, setFyFormData] = useState({
        name: '',
        startDate: '',
        endDate: '',
        invoicePrefix: 'INV',
        invoiceSequence: '001'
    });

    const defaultSettings = {
        showLogo: true,
        headerTitle: 'TAX INVOICE',
        footerText: 'Thank you for your business!',
        termsConditions: 'Goods once sold will not be taken back.',
        accentColor: '#009262',
        pageSize: 'A5', // A4, A5, Thermal
        invoicePrefix: 'INV26',
        invoiceSequence: '001',
        template: 'modern',
        showColQty: true,
        showColPrice: true,
        showColTax: true,
        showColTotal: true
    };

    const defaultReturnSettings = {
        showLogo: true,
        headerTitle: 'SALES RETURN / CREDIT NOTE',
        footerText: 'Authorized Signature',
        termsConditions: 'Valid for credit adjustment only.',
        accentColor: '#ef4444',
        pageSize: 'A5',
        invoicePrefix: 'RTN26',
        invoiceSequence: '001',
        template: 'modern',
        showColQty: true,
        showColPrice: true,
        showColTax: true,
        showColTotal: true
    };

    const TEMPLATES = INVOICE_TEMPLATES;

    const [settings, setSettings] = useState({
        sales: defaultSettings,
        return: defaultReturnSettings
    });

    const [previewTemplate, setPreviewTemplate] = useState(null);
    const [previewCompanyProfile, setPreviewCompanyProfile] = useState(null);
    const [branches, setBranches] = useState([]);
    const [selectedBranchId, setSelectedBranchId] = useState('');

    useEffect(() => {
        fetchSettings();
        fetchFinancialYears();
        fetchPreviewCompanyProfile();
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            const list = res.data || [];
            setBranches(list);
            if (list.length > 0) {
                setSelectedBranchId(list[0].id.toString());
            }
        } catch (err) {
            console.error('Failed to fetch branches for invoice settings', err);
        }
    };

    const fetchPreviewCompanyProfile = async () => {
        try {
            const res = await api.get('/company');
            if (res.data) setPreviewCompanyProfile(res.data);
        } catch (err) {
            console.error('Failed to fetch company profile for preview', err);
        }
    };

    const fetchFinancialYears = async () => {
        try {
            const res = await api.get('/financial-years');
            setFyList(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSettings = async () => {
        try {
            // Fetch both sales and return settings
            const [salesRes, returnRes] = await Promise.all([
                api.get('/invoice-settings', { params: { type: 'sales' } }),
                api.get('/invoice-settings', { params: { type: 'return' } })
            ]);

            const salesData = salesRes.data?.settings;
            const returnData = returnRes.data?.settings;

            setSettings({
                sales: salesData || defaultSettings,
                return: returnData || defaultReturnSettings
            });
        } catch (err) {
            console.error(err);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            // Save the current active tab's settings
            await api.post('/invoice-settings', { 
                type: activeTab, 
                settings: settings[activeTab] 
            });
            toast.success('Invoice Settings Saved!');
        } catch (err) {
            toast.error('Failed to save settings');
        }
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [key]: value
            }
        }));
    };

    const handleFySubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingFy) {
                await api.put(`/financial-years/${editingFy.id}`, fyFormData);
                toast.success('Financial Year Updated');
            } else {
                await api.post('/financial-years', fyFormData);
                toast.success('Financial Year Created');
            }
            setIsFyModalOpen(false);
            setEditingFy(null);
            fetchFinancialYears();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save financial year');
        }
    };

    const deleteFy = async (id) => {
        if (!window.confirm('Are you sure you want to delete this financial year?')) return;
        try {
            await api.delete(`/financial-years/${id}`);
            toast.success('Financial Year Deleted');
            fetchFinancialYears();
        } catch (err) {
            toast.error('Failed to delete financial year');
        }
    };

    const openFyModal = (fy = null) => {
        if (fy) {
            setEditingFy(fy);
            setFyFormData({
                name: fy.name,
                startDate: fy.startDate.split('T')[0],
                endDate: fy.endDate.split('T')[0],
                invoicePrefix: fy.invoicePrefix || 'INV',
                invoiceSequence: fy.invoiceSequence || 0
            });
        } else {
            setEditingFy(null);
            setFyFormData({
                name: '',
                startDate: '',
                endDate: '',
                invoicePrefix: 'INV',
                invoiceSequence: 0
            });
        }
        setIsFyModalOpen(true);
    };

    useEffect(() => {
        const updateScale = () => {
            if (!previewContainerRef.current || !previewCanvasRef.current) return;
            const containerWidth = previewContainerRef.current.offsetWidth - 64; 
            const canvasWidth = previewCanvasRef.current.offsetWidth;
            const canvasHeight = previewCanvasRef.current.offsetHeight;
            
            let scale = 1;
            if (canvasWidth > containerWidth) {
                scale = containerWidth / canvasWidth;
            }
            
            setPreviewScale(scale);
            setPreviewHeight(canvasHeight * scale);
        };

        // Delay slightly to ensure initial render is complete
        const timer = setTimeout(updateScale, 100);

        const observer = new ResizeObserver(updateScale);
        if (previewContainerRef.current) observer.observe(previewContainerRef.current);
        
        window.addEventListener('resize', updateScale);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
            window.removeEventListener('resize', updateScale);
        };
    }, [previewMode, activeTab, settings]);

    const currentConfig = settings[activeTab];

    return (
        <div className="flex min-h-screen bg-slate-50">

            <div className="flex-1 overflow-auto">
                <div className="p-8">
                    <h1 className="text-2xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
                        <FiLayout /> Invoice Customization
                    </h1>

                    {/* Tabs */}
                    <div className="flex gap-4 mb-6 border-b border-slate-200 overflow-x-auto no-scrollbar whitespace-nowrap">
                        <button
                            onClick={() => setActiveTab('sales')}
                            className={`pb-3 px-4 font-medium flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'sales' ? 'border-primary text-primary-dark' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <FiFileText /> Sales Invoice
                        </button>
                        <button
                            onClick={() => setActiveTab('return')}
                            className={`pb-3 px-4 font-medium flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'return' ? 'border-red-500 text-red-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <FiRefreshCw /> Return Invoice
                        </button>
                        <button
                            onClick={() => setActiveTab('fy')}
                            className={`pb-3 px-4 font-medium flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'fy' ? 'border-primary text-primary-dark' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <FiCalendar /> Financial Year
                        </button>
                    </div>

                    {activeTab !== 'fy' ? (
                    <div className="flex flex-col lg:flex-row gap-6 h-auto lg:h-[calc(100vh-200px)]">
                        {/* Left Panel - Controls */}
                        <div className="w-full lg:w-[400px] xl:w-[450px] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative pb-[80px]">
                            {/* Inner Header */}
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                                    <span className="text-slate-400 rotate-180 cursor-pointer hover:text-slate-600 transition-colors">➔</span> Invoice Settings
                                </h2>
                                <span className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">{'<'}Back</span>
                            </div>

                            <div className="p-5 overflow-y-auto flex-1 pb-10">
                                {/* Template Section */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
                                            <FiFileText className="text-slate-400" /> Invoice Templates
                                        </h3>
                                    </div>
                                    <div className="space-y-2.5">
                                        {TEMPLATES.map(t => {
                                            const effectiveTpl = previewTemplate || currentConfig.template || 'modern';
                                            const isSelected = currentConfig.template === t.id;
                                            const isPreviewing = effectiveTpl === t.id;

                                            return (
                                                <div 
                                                    key={t.id}
                                                    onClick={() => {
                                                        updateSetting('template', t.id);
                                                        setPreviewTemplate(t.id);
                                                    }}
                                                    className={`cursor-pointer rounded-xl border p-3 transition-all ${isPreviewing ? 'border-[#009262] bg-[#009262]/5 ring-1 ring-[#009262]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#009262] bg-[#009262]' : 'border-slate-300'}`}>
                                                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-slate-800">{t.name}</span>
                                                                {isSelected && <span className="ml-2 text-[10px] font-medium text-[#009262] bg-[#009262]/10 px-1.5 py-0.5 rounded">Saved Default</span>}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPreviewTemplate(t.id);
                                                                updateSetting('template', t.id);
                                                            }}
                                                            className={`text-[11px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium transition-colors ${isPreviewing ? 'bg-[#009262] text-white border-[#009262]' : 'bg-white text-[#009262] border-[#009262]/30 hover:bg-[#009262]/10'}`}
                                                        >
                                                            <FiMonitor size={11} /> {isPreviewing ? 'Active' : 'Preview'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-3 font-medium">Layout styles will update instantly in the preview canvas.</p>
                                </div>

                                {/* Page Size Section */}
                                <div className="mb-6">
                                    <h3 className="text-sm font-medium text-slate-800 mb-3 flex items-center gap-2">
                                        <FiLayout className="text-slate-400" /> Page Size
                                    </h3>
                                    <div className="flex gap-2">
                                        {['A4', 'A5', 'Thermal'].map(size => (
                                            <button
                                                key={size}
                                                onClick={() => updateSetting('pageSize', size)}
                                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${currentConfig.pageSize === size ? 'bg-[#009262] text-white border-[#009262]' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Header Customize Section */}
                                <div className="mb-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                            <FiGrid className="text-slate-400" /> Header
                                        </div>
                                        <button className="text-[10px] text-[#009262] flex items-center gap-1 hover:underline font-medium">
                                            <FiSettings size={10} /> Customize Header {'>'}
                                        </button>
                                    </div>
                                    
                                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl grid grid-cols-2 gap-3 relative">
                                        <div className="col-span-2 text-center text-[10px] text-slate-400 mb-1 border-b border-dashed border-slate-200 pb-2 flex items-center justify-center gap-2">
                                            <span className="text-slate-300 rotate-90">⬍</span> Drag & drop elements to change order.
                                        </div>
                                        {[
                                            { id: 'showLogo', label: 'Logo', icon: FiImage },
                                            { id: 'showCompanyName', label: 'Company Name', icon: FiType },
                                            { id: 'showAddress', label: 'Address', icon: FiMapPin },
                                            { id: 'showInvoiceMeta', label: 'Invoice Info', icon: FiFileText },
                                            { id: 'showCustomer', label: 'Customer', icon: FiUser }
                                        ].map(item => (
                                            <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-2 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center justify-between hover:border-[#009262] transition-colors">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className="w-5 h-5 rounded-full bg-[#009262] text-white flex items-center justify-center shrink-0">
                                                        <item.icon size={10} />
                                                    </div>
                                                    <span className="text-[11px] font-medium text-slate-700 truncate">{item.label}</span>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-1">
                                                    <input type="checkbox" className="sr-only peer" checked={currentConfig[item.id] !== false} onChange={e => updateSetting(item.id, e.target.checked)} />
                                                    <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#009262]"></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Items Table Columns */}
                                <div className="mt-4 border-t border-slate-100 pt-4">
                                    <div className="flex items-center justify-between mb-3 text-sm font-medium text-slate-800">
                                        <div className="flex items-center gap-2"><FiGrid className="text-slate-400" /> Items Table Columns</div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl grid grid-cols-2 gap-3 relative">
                                        {[
                                            { id: 'showColHsn', label: 'HSN/SAC' },
                                            { id: 'showColQty', label: 'Quantity' },
                                            { id: 'showColPrice', label: 'Price' },
                                            { id: 'showColTax', label: 'GST / Tax' },
                                            { id: 'showColTotal', label: 'Amount' }
                                        ].map(item => (
                                            <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-2 px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center justify-between hover:border-[#009262] transition-colors">
                                                <span className="text-[11px] font-medium text-slate-700 truncate">{item.label}</span>
                                                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-1">
                                                    <input type="checkbox" className="sr-only peer" checked={currentConfig[item.id] !== false} onChange={e => updateSetting(item.id, e.target.checked)} />
                                                    <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#009262]"></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Bank Details Note */}
                                <div className="mt-4 border-t border-slate-100 pt-4 pb-2">
                                    <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-800">
                                        <FiBriefcase className="text-slate-400" /> Bank Details
                                    </div>
                                    <p className="text-[11px] text-slate-500 bg-blue-50/50 p-2 rounded border border-blue-100/50">
                                        Bank details are automatically fetched from your user profile (Employee Settings) and displayed on the invoice.
                                    </p>
                                </div>

                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-10">
                                <button onClick={handleSave} className="w-full bg-[#009262] hover:bg-[#047857] text-white py-3 rounded-lg font-medium text-sm transition-colors shadow-sm active:scale-[0.98]">
                                    Save Changes
                                </button>
                            </div>
                        </div>

                        {/* Right Panel - Preview Canvas */}
                        <div className="flex-1 bg-[#f1f5f9] rounded-xl flex flex-col border border-slate-200 relative shadow-inner overflow-hidden">
                            {/* Preview Toolbar */}
                            <div className="bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-10 shrink-0 h-14">
                                <div className="flex items-center gap-8 h-full">
                                    <button 
                                        onClick={() => setPreviewMode('Desktop')}
                                        className={`flex items-center gap-2 text-sm font-medium h-full pt-1 px-1 transition-colors ${previewMode === 'Desktop' ? 'text-[#009262] border-b-2 border-[#009262]' : 'text-slate-400 hover:text-slate-600'}`}>
                                        <FiMonitor /> Desktop
                                    </button>
                                    <button 
                                        onClick={() => setPreviewMode('Mobile')}
                                        className={`flex items-center gap-2 text-sm font-medium h-full pt-1 px-1 transition-colors ${previewMode === 'Mobile' ? 'text-[#009262] border-b-2 border-[#009262]' : 'text-slate-400 hover:text-slate-600'}`}>
                                        <FiSmartphone /> Mobile
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"><FiRefreshCw size={14} /></button>
                                    <button className="w-12 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"><FiDownloadCloud size={16}/></button>
                                </div>
                            </div>

                            {/* Live Preview Area */}
                            <div 
                                ref={previewContainerRef}
                                className="flex-1 overflow-auto p-4 md:p-8 flex items-start justify-center bg-slate-100"
                            >
                                {/* Main Responsive Canvas with Intelligent Scaling */}
                                <div 
                                    className="relative flex justify-center w-full"
                                    style={{ height: previewHeight !== 'auto' ? `${previewHeight}px` : 'auto' }}
                                >
                                    <div 
                                        ref={previewCanvasRef}
                                        className={`transition-all duration-300 shadow-2xl origin-top mb-8 bg-white absolute top-0`}
                                        style={{
                                            width: previewMode === 'Mobile' 
                                                ? '360px' 
                                                : (currentConfig.pageSize === 'Thermal' 
                                                    ? '80mm' 
                                                    : ((previewTemplate || currentConfig.template) === 'boutique_a5' || currentConfig.pageSize === 'A5' 
                                                        ? '148mm' 
                                                        : '210mm')),
                                            transform: `scale(${previewScale})`,
                                            maxWidth: 'none'
                                        }}
                                    >
                                        <ProfessionalInvoice 
                                            previewMode={previewMode}
                                            companyProfile={previewCompanyProfile || {
                                                companyName: 'ABS HARDWARE & PAINTS',
                                                address: 'Ayiramkolly, Ambalavayal, Wayanad, Kerala - 673593',
                                                phone: '7510133133',
                                                gstNumber: '32DXHPK3898B1ZF',
                                                state: '32-KERALA'
                                            }}
                                            printData={{
                                                invoiceNumber: currentConfig.invoicePrefix + '-001',
                                                saleDate: new Date().toISOString(),
                                                customerName: 'WALK-IN CUSTOMER',
                                                placeOfSupply: '32-KERALA',
                                                currencySymbol: '₹',
                                                currencyCode: 'INR',
                                                exchangeRate: 1,
                                                subTotal: 847.46,
                                                discount: 152.54,
                                                taxAmount: 152.54,
                                                totalAmount: 1000.00,
                                                roundOffAmount: 0,
                                                paidAmount: 1000.00,
                                                balanceAmount: 0.00,
                                                currentBalance: 1250,
                                                settings: {
                                                    ...currentConfig,
                                                    template: previewTemplate || currentConfig.template || 'modern'
                                                },
                                                items: [
                                                    {
                                                        name: 'PREMIUM ASIAN PAINTS - WHITE (1L)',
                                                        quantity: 2,
                                                        mrp: 500.00,
                                                        originalUnitPrice: 500.00,
                                                        unitPrice: 500.00,
                                                        discountAmount: 0.00,
                                                        total: 1000.00,
                                                        taxAmount: 152.54,
                                                        taxRate: 18,
                                                        product: {
                                                            name: 'PREMIUM ASIAN PAINTS - WHITE (1L)',
                                                            price: 500.00,
                                                            barcode: '890123456789',
                                                            hsnCode: '3208'
                                                        }
                                                    }
                                                ]
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    ) : (
                        <FinancialYearSection 
                            fyList={fyList} 
                            onRefresh={fetchFinancialYears}
                            search={fySearch}
                            onSearchChange={setFySearch}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ──── THERMAL LAYOUT ──── */
function ThermalLayout({ config }) {
    return (
        <div className="flex flex-col gap-1 text-[10px] text-black font-mono">
            {/* Header */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-1">
                {config.showLogo !== false && (
                    <div className="w-8 h-8 border border-black rounded flex items-center justify-center text-[8px] font-medium mx-auto mb-1">LOGO</div>
                )}
                {config.showCompanyName !== false && (
                    <div className="font-medium uppercase text-[13px] leading-tight">{config.companyName || 'COMPANY NAME'}</div>
                )}
                {config.showAddress !== false && (
                    <div className="leading-snug">{config.companyAddress || '123 Business Road, City'}</div>
                )}
                <div className="leading-snug">Ph: +91 98765 43210</div>
                <div className="font-medium mt-1 border-t border-b border-gray-300 py-0.5 uppercase tracking-widest">
                    {config.headerTitle || 'TAX INVOICE'}
                </div>
            </div>
            {/* Customer */}
            {config.showCustomer !== false && (
                <div className="border-b border-dashed border-gray-400 pb-1 mb-1">
                    <div className="font-medium">Bill To: Customer Name</div>
                    <div>Ph: +91 9876543210  |  State: MH</div>
                </div>
            )}
            {/* Invoice meta */}
            {config.showInvoiceMeta !== false && (
                <div className="border-b border-dashed border-gray-400 pb-1 mb-1">
                    <div className="flex justify-between"><span>Invoice:</span><span className="font-medium">{config.invoicePrefix || 'INV'}-001</span></div>
                    <div className="flex justify-between"><span>Date:</span><span className="font-medium">{new Date().toLocaleDateString('en-GB')}</span></div>
                </div>
            )}
            {/* Items */}
            <div className="border-b border-dashed border-gray-400 pb-1 mb-1">
                <div className="flex justify-between font-medium border-b border-gray-300 pb-0.5 mb-0.5">
                    <span>Item</span><span>Amt</span>
                </div>
                <div>
                    <div className="font-medium">Premium Subscription</div>
                    <div className="flex justify-between text-gray-600"><span>1 x ₹100.00</span><span>₹100.00</span></div>
                </div>
            </div>
            {/* Tax */}
            {config.showTaxSummary !== false && (
                <div className="border-b border-dashed border-gray-400 pb-1 mb-1">
                    <div className="flex justify-between"><span>CGST 9%</span><span>₹9.00</span></div>
                    <div className="flex justify-between"><span>SGST 9%</span><span>₹9.00</span></div>
                </div>
            )}
            {/* Total */}
            <div className="border-t-2 border-black pt-1">
                <div className="flex justify-between text-[12px] font-medium">
                    <span>TOTAL</span><span>₹118.00</span>
                </div>
            </div>
            {/* Footer */}
            {config.showTerms !== false && (
                <div className="border-t border-dashed border-gray-400 pt-1 mt-2 text-center text-gray-600">
                    <div>{config.termsConditions || 'Goods once sold not taken back.'}</div>
                    <div className="font-medium mt-1">{config.footerText || 'Thank you!'}</div>
                </div>
            )}
        </div>
    );
}

/* ──── STANDARD LAYOUT (A4/A5/Mobile) ──── */
function StandardLayout({ config, tpl, isMobile, pageSize }) {
    const isClassic = tpl === 'classic';
    const isBold = tpl === 'bold';
    const isMinimal = tpl === 'minimal';
    const isA5 = pageSize === 'A5';
    const accent = config.accentColor || '#009262';

    // Classic: wrapped box with black borders throughout
    const sectionBorder = isClassic ? 'border border-black' : isMinimal ? '' : 'border border-slate-100';
    const headerBg = isBold ? '' : isClassic ? 'bg-slate-50' : '';
    const tableBorder = isClassic ? 'border border-black' : isMinimal ? '' : 'border border-slate-100';
    const thStyle = isClassic
        ? 'border border-black bg-slate-100'
        : isBold
            ? 'text-white'
            : isMinimal
                ? 'border-b border-slate-200'
                : 'border-b-2 border-slate-100 bg-slate-50';
    const tdBorder = isClassic ? 'border border-black' : '';
    const mbSection = isA5 ? 'mb-3' : 'mb-6';
    const mbSectionSm = isA5 ? 'mb-2' : 'mb-4';
    const padCell = isA5 ? 'py-1 px-2' : 'py-2.5 px-3';

    return (
        <div className="flex flex-col h-full">
            {/* HEADER */}
            <div className={`${mbSection} ${isClassic ? 'border-b border-black pb-4 text-center' : ''}`}>
                {isClassic ? (
                    <div className="flex flex-col items-center gap-1">
                        {config.showLogo !== false && (
                            <div className={`${isA5 ? 'w-10 h-10' : 'w-14 h-14'} border border-black rounded-sm flex items-center justify-center text-[10px] font-medium text-slate-500 mb-1`}>LOGO</div>
                        )}
                        {config.showCompanyName !== false && (
                            <h2 className={`font-bold uppercase tracking-wider ${isA5 ? 'text-xl' : 'text-2xl'} text-black leading-none`}>{config.companyName || 'YOUR COMPANY NAME'}</h2>
                        )}
                        {config.showAddress !== false && (
                            <p className="text-[0.85em] text-black">{config.companyAddress || '123 Business Road, Tech District, City 40001'}</p>
                        )}
                        <p className="text-[0.85em] text-black">Phone: +91 9876543210</p>
                        <p className="font-medium text-[0.85em] text-black">GSTIN: 27AAAAA0000A1Z5 | State: Maharashtra (27)</p>
                        <div className="border border-black px-4 py-1 font-semibold uppercase tracking-widest text-[0.85em] mt-1 bg-slate-50">{config.headerTitle || 'TAX INVOICE'}</div>
                    </div>
                ) : (
                    <div className={`flex ${isMobile ? 'flex-col items-center text-center gap-2' : 'justify-between items-start'}`}>
                        {config.showLogo !== false && (
                            <div className={`${isMobile ? 'w-10 h-10' : isA5 ? 'w-12 h-12' : 'w-14 h-14'} rounded-lg ${isBold ? 'bg-slate-100' : 'bg-slate-50'} border border-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-400`}>LOGO</div>
                        )}
                        <div className={`${isMobile ? 'text-center' : isA5 ? 'text-right' : 'text-right'}`}>
                            <h2 className={`font-bold uppercase tracking-widest ${isA5 ? 'text-xl' : 'text-2xl'} mb-1`} style={{ color: isMinimal ? '#1e293b' : accent }}>
                                {config.headerTitle || 'INVOICE'}
                            </h2>
                            {config.showCompanyName !== false && <p className="font-medium text-slate-800 mb-0.5">{config.companyName || 'Your Company Name'}</p>}
                            {config.showAddress !== false && <p className="text-slate-500 text-[0.9em] leading-snug">{config.companyAddress || '123 Business Road, City 40001'}<br />+91 9876543210</p>}
                        </div>
                    </div>
                )}
            </div>

            {/* CUSTOMER + INVOICE DETAILS */}
            {(config.showCustomer !== false || config.showInvoiceMeta !== false) && (
                <div className={`${mbSection} ${isClassic ? 'border border-black' : isMinimal ? '' : 'rounded-lg ' + sectionBorder}`}>
                    <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'}`}>
                        {config.showCustomer !== false && (
                            <div className={`p-3 ${isMobile ? '' : isClassic ? 'border-r border-black w-1/2' : 'w-1/2 border-r border-slate-100'}`}>
                                <p className="font-medium text-[0.8em] uppercase tracking-widest mb-1" style={{ color: isClassic ? '#000' : isMinimal ? '#64748b' : accent }}>
                                    {isClassic ? <span className="underline">Bill To</span> : 'Bill To'}
                                </p>
                                <p className="font-medium text-slate-800 mb-0.5">Customer Name</p>
                                <p className="text-slate-500 text-[0.9em]">customer@email.com</p>
                                <p className="text-slate-500 text-[0.9em]">+91 9876543210</p>
                                {isClassic && <p className="font-medium text-[0.9em] mt-1 text-black">State: Maharashtra (27)</p>}
                            </div>
                        )}
                        {config.showInvoiceMeta !== false && (
                            <div className={`p-3 ${isMobile ? '' : 'w-1/2'} ${isMobile ? '' : isClassic ? '' : 'text-right'}`}>
                                <p className="font-medium text-[0.8em] uppercase tracking-widest mb-1" style={{ color: isClassic ? '#000' : isMinimal ? '#64748b' : accent }}>
                                    {isClassic ? <span className="underline">Invoice Details</span> : 'Invoice Details'}
                                </p>
                                {isClassic ? (
                                    <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-0.5 text-[0.9em]">
                                        <span className="font-medium">Invoice No:</span><span>{config.invoicePrefix || 'INV'}-001</span>
                                        <span className="font-medium">Date:</span><span>{new Date().toLocaleDateString('en-GB')}</span>
                                        <span className="font-medium">Place of Supply:</span><span>Maharashtra (27)</span>
                                    </div>
                                ) : (
                                    <div className={`space-y-0.5 text-[0.9em] ${isMobile ? '' : 'text-right'}`}>
                                        <div className={`flex gap-3 ${isMobile ? '' : 'justify-end'}`}><span className="text-slate-500">Invoice No:</span><span className="font-medium">{config.invoicePrefix || 'INV'}-001</span></div>
                                        <div className={`flex gap-3 ${isMobile ? '' : 'justify-end'}`}><span className="text-slate-500">Date:</span><span className="font-medium">{new Date().toLocaleDateString('en-GB')}</span></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ITEMS TABLE */}
            <div className={`${mbSection} ${isMobile ? 'overflow-x-auto' : ''} ${tableBorder} ${isClassic ? '' : 'rounded-lg overflow-hidden'}`}>
                <table className="w-full text-left bg-white">
                    <thead style={isBold ? { backgroundColor: accent } : {}}>
                        <tr className={`text-[0.8em] uppercase tracking-widest ${isBold ? 'text-white' : 'text-slate-500'}`}>
                            {isClassic && <th className={`${padCell} font-medium ${thStyle} text-center w-8`}>#</th>}
                            <th className={`${padCell} font-medium ${thStyle}`}>{isClassic ? 'Item Name' : 'Description'}</th>
                            {isClassic && <th className={`${padCell} font-medium ${thStyle} text-center`}>HSN/SAC</th>}
                            {config.showColQty !== false && <th className={`${padCell} font-medium ${thStyle} text-center`}>Qty</th>}
                            {config.showColPrice !== false && <th className={`${padCell} font-medium ${thStyle} text-right`}>Price</th>}
                            {config.showColTax !== false && <th className={`${padCell} font-medium ${thStyle} text-center`}>GST%</th>}
                            {config.showColTotal !== false && <th className={`${padCell} font-medium ${thStyle} text-right`}>{isClassic ? 'Taxable Amt' : 'Total'}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className={`${isClassic ? 'border-t border-black' : isMinimal ? '' : 'border-t border-slate-100 hover:bg-slate-50/50 transition-colors'}`}>
                            {isClassic && <td className={`${padCell} ${tdBorder} text-center`}>1</td>}
                            <td className={`${padCell} ${tdBorder}`}>
                                <p className="font-medium text-slate-800 mb-0.5">Premium Subscription</p>
                                {!isA5 && <p className="text-[0.85em] text-slate-400">1 Year Valid / 5 Users</p>}
                            </td>
                            {isClassic && <td className={`${padCell} ${tdBorder} text-center text-slate-500`}>998311</td>}
                            {config.showColQty !== false && <td className={`${padCell} ${tdBorder} text-center font-medium`}>1</td>}
                            {config.showColPrice !== false && <td className={`${padCell} ${tdBorder} text-right text-slate-500`}>₹100.00</td>}
                            {config.showColTax !== false && <td className={`${padCell} ${tdBorder} text-center text-slate-500`}>18%</td>}
                            {config.showColTotal !== false && <td className={`${padCell} ${tdBorder} text-right font-medium text-slate-800`}>₹{isClassic ? '100.00' : '118.00'}</td>}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* SUMMARY */}
            {(config.showTotalSummary !== false || config.showTaxSummary !== false) && (
                <div className={`${mbSection} flex ${isMobile ? 'flex-col gap-3' : 'justify-between gap-6 items-start'}`}>
                    {/* Tax block */}
                    {config.showTaxSummary !== false && (
                        <div className={`${isMobile ? 'w-full' : 'w-1/2'} ${isClassic ? 'border border-black p-3' : isMinimal ? 'p-2' : 'bg-slate-50 rounded-lg p-3'}`}>
                            {isClassic ? (
                                <>
                                    <table className="w-full text-[0.85em]">
                                        <thead>
                                            <tr className="border-b border-dashed border-gray-400">
                                                <th className="pb-1 font-medium text-black">Tax Type</th>
                                                <th className="pb-1 font-medium text-right text-black">Taxable Amt</th>
                                                <th className="pb-1 font-medium text-center text-black">Rate</th>
                                                <th className="pb-1 font-medium text-right text-black">Tax Amt</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td className="py-0.5 text-black">CGST</td><td className="text-right text-black">₹100.00</td><td className="text-center text-black">9%</td><td className="text-right text-black">₹9.00</td></tr>
                                            <tr><td className="py-0.5 text-black">SGST</td><td className="text-right text-black">₹100.00</td><td className="text-center text-black">9%</td><td className="text-right text-black">₹9.00</td></tr>
                                        </tbody>
                                    </table>
                                    <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
                                        <p className="font-medium text-[0.8em] uppercase tracking-wide text-black">Invoice Amount In Words</p>
                                        <p className="font-medium italic text-[0.9em]" style={{ color: accent }}>Rupees One Hundred Eighteen Only</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="font-medium text-[0.8em] uppercase tracking-widest mb-2" style={{ color: isMinimal ? '#64748b' : accent }}>Tax Summary</p>
                                    <div className="space-y-1 text-[0.9em] text-slate-500">
                                        <div className="flex justify-between"><span>CGST (9%)</span><span>₹9.00</span></div>
                                        <div className="flex justify-between"><span>SGST (9%)</span><span>₹9.00</span></div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {/* Totals block */}
                    {config.showTotalSummary !== false && (
                        <div className={`${isMobile ? 'w-full' : 'w-1/2 ml-auto'}`}>
                            {isClassic ? (
                                <div className="space-y-1 text-[0.9em]">
                                    <div className="flex justify-between px-1"><span className="text-black">Sub Total</span><span className="font-medium text-black">₹100.00</span></div>
                                    {config.showTaxSummary !== false && <div className="flex justify-between px-1"><span className="text-black">Total Tax</span><span className="font-medium text-black">₹18.00</span></div>}
                                    <div className="flex justify-between px-1 border-b border-black pb-1"><span className="text-black">Round Off</span><span className="font-medium text-black">₹0.00</span></div>
                                    <div className="flex justify-between items-center px-1 py-2 mt-1 bg-slate-50 border border-black rounded-sm">
                                        <span className="font-extrabold text-[1.1em] uppercase tracking-wider text-black">TOTAL</span>
                                        <span className="font-medium text-[1.1em] text-black">₹118.00</span>
                                    </div>
                                </div>
                            ) : (
                                <div className={`p-3.5 space-y-2 ${isMinimal ? 'border border-slate-200' : 'bg-slate-50 rounded-lg'} ${tpl === 'modern' || isBold ? 'border-l-4' : ''}`} style={{ borderLeftColor: (tpl === 'modern' || isBold) ? accent : undefined }}>
                                    <div className="flex justify-between text-slate-500 text-[0.9em]"><span>Subtotal</span><span className="font-medium text-slate-800">₹100.00</span></div>
                                    {config.showTaxSummary !== false && (
                                        <div className="flex justify-between text-slate-500 border-b border-slate-200 pb-2 text-[0.9em]"><span>Total Tax</span><span className="font-medium text-slate-800">₹18.00</span></div>
                                    )}
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="font-medium uppercase tracking-wider text-[0.85em]" style={{ color: accent }}>Grand Total</span>
                                        <span className="font-medium text-lg" style={{ color: accent }}>₹118.00</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* FOOTER */}
            {(config.showTerms !== false || config.showFooterNote !== false) && (
                <div className={`mt-auto pt-4 flex ${isMobile ? 'flex-col gap-4' : 'justify-between items-end'} ${isClassic ? 'border-t border-black' : isMinimal ? 'border-t border-slate-200' : 'border-t-2 border-slate-50'}`}>
                    {config.showTerms !== false && (
                        <div className={`${isMobile ? 'w-full' : 'w-2/3'}`}>
                            <p className="font-medium text-[0.8em] uppercase tracking-widest mb-1" style={{ color: isClassic ? '#000' : isMinimal ? '#64748b' : accent }}>
                                {isClassic ? <span className="underline">Terms &amp; Conditions</span> : 'Terms'}
                            </p>
                            <p className="text-slate-500 text-[0.88em] leading-relaxed whitespace-pre-wrap">{config.termsConditions || (isClassic ? '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. if payment is delayed.' : 'Goods once sold will not be taken back.')}</p>
                        </div>
                    )}
                    <div className={`${isMobile ? 'w-full text-right' : 'w-1/3 flex justify-end pr-4 pb-2'}`}>
                        {isClassic ? (
                            <div className="text-center">
                                <div className="border-t border-black pt-1 mt-12">
                                    <p className="font-medium uppercase tracking-widest text-[0.8em] text-black">Authorized Signatory</p>
                                </div>
                            </div>
                        ) : config.showFooterNote !== false ? (
                            <p className="font-medium text-slate-400 italic text-[0.9em]">{config.footerText || 'Thank you!'}</p>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}

function FinancialYearSection({ fyList, onRefresh, search, onSearchChange }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFy, setEditingFy] = useState(null);
    const [formData, setFormData] = useState({
        name: '', startDate: '', endDate: '', invoicePrefix: 'INV', invoiceSequence: '001'
    });

    const filteredList = fyList.filter(fy => 
        fy.name.toLowerCase().includes(search.toLowerCase()) ||
        (fy.invoicePrefix && fy.invoicePrefix.toLowerCase().includes(search.toLowerCase()))
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingFy) {
                await api.put(`/financial-years/${editingFy.id}`, formData);
                toast.success('Financial Year Updated');
            } else {
                await api.post('/financial-years', formData);
                toast.success('Financial Year Created');
            }
            setIsModalOpen(false);
            onRefresh();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving financial year');
        }
    };

    const openModal = (fy = null) => {
        if (fy) {
            setEditingFy(fy);
            setFormData({
                name: fy.name,
                startDate: fy.startDate.split('T')[0],
                endDate: fy.endDate.split('T')[0],
                invoicePrefix: fy.invoicePrefix || 'INV',
                invoiceSequence: fy.invoiceSequence || '001'
            });
        } else {
            setEditingFy(null);
            setFormData({
                name: '', startDate: '', endDate: '', invoicePrefix: 'INV', invoiceSequence: '001'
            });
        }
        setIsModalOpen(true);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-slate-800">Financial Years</h2>
                    <p className="text-slate-500 text-sm">Manage prefixes and sequences for your invoices.</p>
                </div>
                <button 
                    onClick={() => openModal()}
                    className="bg-primary text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-primary-dark transition-all w-full md:w-auto justify-center whitespace-nowrap"
                >
                    <FiPlus /> Add Financial Year
                </button>
            </div>

            <div className="relative mb-6 max-w-md">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text"
                    placeholder="Search by prefix or name..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-primary bg-slate-50"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="overflow-x-auto lg:no-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 font-medium border-b whitespace-nowrap">
                            <th className="p-4">Name</th>
                            <th className="p-4">From Date</th>
                            <th className="p-4">To Date</th>
                            <th className="p-4">Prefix</th>
                            <th className="p-4">Next Seq</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.map(fy => (
                            <tr key={fy.id} className="border-b hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-medium text-slate-700">{fy.name}</td>
                                <td className="p-4 text-slate-600">{new Date(fy.startDate).toLocaleDateString('en-GB')}</td>
                                <td className="p-4 text-slate-600">{new Date(fy.endDate).toLocaleDateString('en-GB')}</td>
                                <td className="p-4"><span className="px-2 py-1 bg-slate-100 rounded text-slate-700 font-mono">{fy.invoicePrefix}</span></td>
                                <td className="p-4 text-slate-600 font-medium font-mono">{fy.invoiceSequence}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${fy.isClosed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {fy.isClosed ? 'Closed' : 'Active'}
                                    </span>
                                </td>
                                <td className="p-4 flex items-center justify-center gap-2">
                                    <button 
                                        onClick={() => openModal(fy)}
                                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                    >
                                        <FiEdit2 />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <Modal 
                    title={editingFy ? "Edit Financial Year" : "Add Financial Year"}
                    onClose={() => setIsModalOpen(false)}
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Financial Year Name</label>
                            <input 
                                type="text"
                                className="w-full p-2 border rounded-lg focus:outline-primary"
                                placeholder="e.g., FY 2026-27"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">From Date</label>
                                <input 
                                    type="date"
                                    className="w-full p-2 border rounded-lg focus:outline-primary"
                                    required
                                    value={formData.startDate}
                                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">To Date</label>
                                <input 
                                    type="date"
                                    className="w-full p-2 border rounded-lg focus:outline-primary"
                                    required
                                    value={formData.endDate}
                                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Invoice Prefix</label>
                                <input 
                                    type="text"
                                    className="w-full p-2 border rounded-lg focus:outline-primary"
                                    placeholder="e.g., INV26"
                                    required
                                    value={formData.invoicePrefix}
                                    onChange={e => setFormData({ ...formData, invoicePrefix: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Starting Seq #</label>
                                <input 
                                    type="text"
                                    className="w-full p-2 border rounded-lg focus:outline-primary"
                                    placeholder="e.g. 001"
                                    required
                                    value={formData.invoiceSequence}
                                    onChange={e => setFormData({ ...formData, invoiceSequence: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                            <button 
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 py-2 border rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                className="flex-1 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark shadow-sm transition-all"
                            >
                                {editingFy ? "Update" : "Save"} Financial Year
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}