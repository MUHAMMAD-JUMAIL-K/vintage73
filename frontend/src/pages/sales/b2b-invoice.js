import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { useReactToPrint } from 'react-to-print';
import { FiPlus, FiTrash2, FiPrinter, FiTruck, FiFileText, FiSearch, FiChevronDown, FiChevronUp, FiList, FiFilter, FiEye, FiCalendar, FiMessageSquare } from 'react-icons/fi';
import GSTInvoicePrint from '@/components/GSTInvoicePrint';
import SearchableSelect from '@/components/SearchableSelect';
import { getCurrencySymbol, normalizeCurrencySymbol, formatAmountWithCurrency } from '@/lib/currency';

export default function B2BInvoice() {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [states, setStates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [company, setCompany] = useState(null);
  const [user, setUser] = useState(null);
  const [currencyCode, setCurrencyCode] = useState('AED');
  const [currencySymbol, setCurrencySymbol] = useState('AED');
  const [branchSettings, setBranchSettings] = useState({ stockIncluded: true });

  // Tab State
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'history'

  // Invoice History
  const [invoices, setInvoices] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');

  // Product Search
  const [productSearch, setProductSearch] = useState('');

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // Populated from active business date API
  const [items, setItems] = useState([]);
  const [roundOff, setRoundOff] = useState(0);

  // Transport Details
  const [showTransport, setShowTransport] = useState(false);
  const [transportMode, setTransportMode] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [transporterId, setTransporterId] = useState('');

  // E-Way Bill
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [showEwayModal, setShowEwayModal] = useState(false);

  // Print
  const [lastInvoice, setLastInvoice] = useState(null);
  const printRef = useRef();
  const handlePrint = useReactToPrint({ contentRef: printRef });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));

    const fetchData = async () => {
      try {
        const [custRes, prodRes, statesRes, settingsRes, companyRes] = await Promise.all([
          api.get('/customers'),
          api.get('/products', { params: { branchId: user?.branchId } }),
          api.get('/states'),
          api.get('/gst-settings'),
          api.get('/company')
        ]);
        setCustomers(custRes.data.filter(c => c.gstin));
        setProducts(prodRes.data);
        setStates(statesRes.data);
        setSettings(settingsRes.data);
        setCompany(companyRes.data);

        let code = companyRes?.data?.currencyCode || 'AED';
        let symbol = companyRes?.data?.currencySymbol;

        if (user?.branchId) {
          const { data: bData } = await api.get(`/branches/${user.branchId}`);
          setBranchSettings({
            stockIncluded: bData.stockIncluded !== undefined ? bData.stockIncluded : true
          });
          if (bData?.currencyCode) {
            code = bData.currencyCode;
            symbol = bData.currencySymbol;
          }

          // Fetch the authoritative active business date
          try {
            const bdRes = await api.get('/day-close/status', { params: { branchId: user.branchId } });
            if (bdRes.data?.activeDate) {
              setInvoiceDate(bdRes.data.activeDate);
            } else if (bdRes.data?.currentDate) {
              setInvoiceDate(bdRes.data.currentDate);
            } else {
              setInvoiceDate(new Date().toISOString().split('T')[0]);
            }
          } catch (bdErr) {
            console.error('Failed to fetch business date:', bdErr);
            setInvoiceDate(new Date().toISOString().split('T')[0]);
          }
        } else {
          // No branch — fall back to calendar date
          setInvoiceDate(new Date().toISOString().split('T')[0]);
        }
        setCurrencyCode(code);
        setCurrencySymbol(normalizeCurrencySymbol(symbol, code));
      } catch (err) {
        console.error(err);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.branchId]);

  // Fetch invoice history
  const fetchInvoiceHistory = async () => {
    setHistoryLoading(true);
    try {
      const params = {};
      if (filterStartDate && filterEndDate) {
        params.startDate = filterStartDate;
        params.endDate = filterEndDate;
      }
      const { data } = await api.get('/b2b/invoices', { params });
      let filtered = data;
      if (filterCustomer) {
        filtered = data.filter(inv => inv.customerId === parseInt(filterCustomer));
      }
      setInvoices(filtered);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load invoice history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load history when tab changes or filters change
  useEffect(() => {
    if (activeTab === 'history') {
      fetchInvoiceHistory();
    }
  }, [activeTab, filterStartDate, filterEndDate, filterCustomer]);

  // When customer changes, update place of supply
  useEffect(() => {
    if (customerId) {
      const cust = customers.find(c => c.id === parseInt(customerId));
      setSelectedCustomer(cust);
      if (cust?.state) {
        // Find existing state in master for exact case matching
        const matchingState = states.find(s => s.name.toLowerCase() === cust.state.toLowerCase());
        setPlaceOfSupply(matchingState ? matchingState.name : cust.state);
      }
    } else {
      setSelectedCustomer(null);
    }
  }, [customerId, customers, states]);

  // Determine tax type
  const taxType = company?.state?.toLowerCase() === placeOfSupply?.toLowerCase() ? 'INTRA' : 'INTER';

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.hsnCode && p.hsnCode.includes(productSearch)) ||
    (p.barcode && p.barcode.includes(productSearch))
  );

  // Add Item
  const addItem = (product) => {
    if (branchSettings.stockIncluded && (product.stock || 0) <= 0) {
      toast.error('Out of stock in your branch');
      return;
    }

    const existing = items.find(i => i.productId === product.id);
    if (existing) {
      if (branchSettings.stockIncluded && (existing.quantity + 1) > product.stock) {
        toast.error(`Only ${product.stock} units available in stock`);
        return;
      }
      setItems(items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, {
        productId: product.id,
        product,
        quantity: 1,
        unitPrice: parseFloat(product.price),
        discountPercent: 0,
        taxRate: parseFloat(product.taxRate || 0),
        hsnCode: product.hsnCode || ''
      }]);
    }
  };

  // Update Item
  const updateItem = (productId, field, value) => {
    if (field === 'quantity' && branchSettings.stockIncluded) {
      const item = items.find(i => i.productId === productId);
      const product = products.find(p => p.id === productId);
      if (product && parseInt(value) > product.stock) {
        toast.error(`Only ${product.stock} units available in stock`);
        return;
      }
    }
    setItems(items.map(i => {
      if (i.productId === productId) {
        return { ...i, [field]: parseFloat(value) || 0 };
      }
      return i;
    }));
  };

  // Remove Item
  const removeItem = (productId) => {
    setItems(items.filter(i => i.productId !== productId));
  };

  // Calculations
  const calculations = items.reduce((acc, item) => {
    const discountAmount = (item.unitPrice * item.discountPercent) / 100;
    const netPrice = item.unitPrice - discountAmount;
    const taxable = netPrice * item.quantity;
    const tax = (taxable * item.taxRate) / 100;

    return {
      subTotal: acc.subTotal + taxable,
      taxAmount: acc.taxAmount + tax,
      cgst: taxType === 'INTRA' ? acc.cgst + (tax / 2) : acc.cgst,
      sgst: taxType === 'INTRA' ? acc.sgst + (tax / 2) : acc.sgst,
      igst: taxType === 'INTER' ? acc.igst + tax : acc.igst
    };
  }, { subTotal: 0, taxAmount: 0, cgst: 0, sgst: 0, igst: 0 });

  const grandTotal = calculations.subTotal + calculations.taxAmount + parseFloat(roundOff || 0);
  const ewayRequired = settings && grandTotal >= parseFloat(settings.ewayBillThreshold || 50000);

  // Save Invoice
  const handleSave = async () => {
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customerId: parseInt(customerId),
        items: items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPercent: i.discountPercent
        })),
        saleDate: invoiceDate,
        branchId: user?.branchId || 1,
        placeOfSupply,
        transportMode,
        vehicleNumber,
        transporterName,
        transporterId,
        roundOffAmount: parseFloat(roundOff || 0),
        paidAmount: 0,
        paymentMethod: 'Credit'
      };

      const { data } = await api.post('/b2b/invoices', payload);

      // Fetch print data
      const printRes = await api.get(`/b2b/invoices/${data.sale.id}/print`);
      setLastInvoice(printRes.data);

      toast.success('Invoice created successfully!');

      // Show E-Way Bill prompt if required
      if (data.ewayRequired) {
        setShowEwayModal(true);
      } else {
        setTimeout(() => handlePrint(), 100);
      }

      // Reset form and capture values for WhatsApp
      const savedCustomerId = customerId;
      setItems([]);
      setCustomerId('');
      setRoundOff(0);

      // WhatsApp Integration for B2B Invoices
      const wsSettings = await api.get('/whatsapp/settings').then(r => r.data).catch(() => null);
      if (wsSettings && wsSettings.isActive && wsSettings.apiKey && savedCustomerId) {
        const customer = customers.find(c => c.id === parseInt(savedCustomerId));
        const phone = customer?.phone;

        if (phone) {
          let msg = wsSettings.salesTemplate || 'Hello [[customer_name]], your B2B invoice [[bill_no]] for [[total_amount]] is ready.';
          msg = msg.replace(/\[\[customer_name\]\]/g, customer.name)
            .replace(/\[\[bill_no\]\]/g, data.sale.invoiceNumber)
            .replace(/\[\[total_amount\]\]/g, formatAmountWithCurrency(data.sale.totalAmount, data.sale.currencyCode || currencyCode, data.sale.currencySymbol || currencySymbol))
            .replace(/\[\[company_name\]\]/g, 'Our Store');

          try {
            await api.post('/whatsapp/send', { mobile: phone, message: msg });
            toast.info('WhatsApp Invoice Sent!');
          } catch (wsErr) {
            console.error('WhatsApp failed:', wsErr);
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  // Save E-Way Bill
  const handleSaveEway = async () => {
    if (!ewayBillNumber) {
      toast.error('Please enter E-Way Bill number');
      return;
    }
    try {
      await api.put(`/b2b/invoices/${lastInvoice.sale.id}/eway-bill`, {
        ewayBillNumber,
        ewayBillDate: new Date().toISOString()
      });
      setLastInvoice(prev => ({
        ...prev,
        sale: { ...prev.sale, ewayBillNumber }
      }));
      setShowEwayModal(false);
      toast.success('E-Way Bill saved');
      setTimeout(() => handlePrint(), 100);
    } catch (err) {
      toast.error('Failed to save E-Way Bill');
    }
  };

  // Export Invoice as GST JSON
  const handleExportJSON = (invoice) => {
    const exportData = {
      invoiceHeader: {
        invoiceNo: invoice.invoiceNumber,
        invoiceDate: invoice.saleDate,
        isB2B: true,
        supplyType: invoice.taxType === 'INTER' ? 'Inter-State' : 'Intra-State',
        placeOfSupply: invoice.placeOfSupply
      },
      sellerDetails: {
        gstin: company?.gstNumber || '',
        tradeName: company?.companyName || '',
        address: company?.address || '',
        state: company?.state || ''
      },
      buyerDetails: {
        gstin: invoice.customer?.gstin || '',
        tradeName: invoice.customer?.name || '',
        address: invoice.customer?.address || '',
        state: invoice.customer?.state || ''
      },
      itemList: invoice.items?.map(item => ({
        hsnCode: item.product?.hsnCode || '',
        productName: item.product?.name || '',
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice),
        discountAmount: parseFloat(item.discountAmount || 0),
        taxableValue: (parseFloat(item.unitPrice) - parseFloat(item.discountAmount || 0)) * item.quantity,
        taxRate: parseFloat(item.taxRate || 0),
        taxAmount: parseFloat(item.taxAmount || 0)
      })),
      summary: {
        totalTaxableValue: parseFloat(invoice.subTotal),
        totalTaxAmount: parseFloat(invoice.taxAmount),
        roundOff: parseFloat(invoice.roundOffAmount || 0),
        grandTotal: parseFloat(invoice.totalAmount)
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}.json`;
    a.click();
  };

  // View/Print Invoice from History
  const handleViewInvoice = async (id) => {
    try {
      const { data } = await api.get(`/b2b/invoices/${id}/print`);
      setLastInvoice(data);
      setTimeout(() => handlePrint(), 100);
    } catch (err) {
      toast.error('Failed to load invoice');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center flex-shrink-0">
            <FiFileText className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">B2B Tax Invoice</h1>
            <p className="text-sm text-slate-500">Create GST-compliant invoice for registered parties</p>
          </div>
        </div>

        {/* Tab Switch */}
        <div className="flex bg-slate-100 rounded-lg p-1 w-full md:w-auto justify-center">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all text-center ${activeTab === 'create' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
          >
            <FiPlus className="inline mr-1" /> New Invoice
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all text-center ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
          >
            <FiList className="inline mr-1" /> Invoice History
          </button>
        </div>
      </div>

      {activeTab === 'create' ? (
        /* Create Invoice Tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Product Search */}
          <div className="bg-white rounded-xl border border-slate-200 h-fit sticky top-4">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700 mb-3">Products</h3>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search by name, HSN, barcode..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto p-2">
              {filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">No products found</div>
              ) : (
                filteredProducts.map(product => (
                  <div
                    key={product.id}
                    onClick={() => addItem(product)}
                    className="p-3 hover:bg-primary-light rounded-lg cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium text-slate-700">{product.name}</div>
                      <div className="text-xs text-slate-400">HSN: {product.hsnCode || 'N/A'} | GST: {product.taxRate}%</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-primary">{formatAmountWithCurrency(product.price, currencyCode, currencySymbol)}</div>
                      <div className="text-xs text-slate-400">Stock: {product.stock || 0}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Invoice Form */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer & Date */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Party (Customer)</label>
                  <SearchableSelect
                    options={customers.map(c => ({ value: c.id, label: `${c.name} - ${c.gstin}` }))}
                    value={customerId}
                    onChange={val => setCustomerId(val)}
                    placeholder="Select Customer with GSTIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {selectedCustomer && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-slate-500">GSTIN:</span> <span className="font-medium">{selectedCustomer.gstin}</span></div>
                    <div><span className="text-slate-500">State:</span> <span className="font-medium">{selectedCustomer.state}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Address:</span> <span className="font-medium">{selectedCustomer.address}</span></div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Place of Supply</label>
                  <SearchableSelect
                    options={states.map(s => ({ value: s.name, label: s.name }))}
                    value={placeOfSupply}
                    onChange={val => setPlaceOfSupply(val)}
                    placeholder="Select State"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Tax Type</label>
                  <div className={`font-medium text-lg ${taxType === 'INTER' ? 'text-orange-600' : 'text-primary'}`}>
                    {taxType === 'INTER' ? 'IGST' : 'CGST + SGST'}
                  </div>
                </div>
              </div>
            </div>

            {/* Transport Details */}
            <div className="bg-white rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowTransport(!showTransport)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <FiTruck className="text-slate-500" />
                  <span className="font-medium text-slate-700">Transport Details</span>
                  <span className="text-xs text-slate-400">(Optional)</span>
                </div>
                {showTransport ? <FiChevronUp /> : <FiChevronDown />}
              </button>

              {showTransport && (
                <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Mode</label>
                    <SearchableSelect
                      options={[
                        { value: 'Road', label: 'Road' },
                        { value: 'Rail', label: 'Rail' },
                        { value: 'Air', label: 'Air' },
                        { value: 'Ship', label: 'Ship' }
                      ]}
                      value={transportMode}
                      onChange={val => setTransportMode(val)}
                      placeholder="Select"
                      direction="down"
                      triggerClassName="min-h-0 h-[38px] py-1.5 px-3 text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle No.</label>
                    <input type="text" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="input text-sm" placeholder="MH12AB1234" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Transporter</label>
                    <input type="text" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} className="input text-sm" placeholder="Name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Transporter GSTIN</label>
                    <input type="text" value={transporterId} onChange={(e) => setTransporterId(e.target.value)} className="input text-sm" placeholder="GSTIN" />
                  </div>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700">Invoice Items</h3>
              </div>

              <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-slate-50 text-slate-600 whitespace-nowrap">
                    <tr>
                      <th className="text-left p-3">Product</th>
                      <th className="text-left p-3">HSN</th>
                      <th className="text-center p-3 w-20">Qty</th>
                      <th className="text-right p-3 w-24">Rate</th>
                      <th className="text-center p-3 w-20">Disc %</th>
                      <th className="text-right p-3">Taxable</th>
                      {taxType === 'INTRA' ? (
                        <>
                          <th className="text-right p-3">CGST</th>
                          <th className="text-right p-3">SGST</th>
                        </>
                      ) : (
                        <th className="text-right p-3">IGST</th>
                      )}
                      <th className="text-right p-3">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const discAmt = (item.unitPrice * item.discountPercent) / 100;
                      const net = item.unitPrice - discAmt;
                      const taxable = net * item.quantity;
                      const tax = (taxable * item.taxRate) / 100;
                      const total = taxable + tax;

                      return (
                        <tr key={item.productId} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="p-3 font-medium">{item.product.name}</td>
                          <td className="p-3 text-slate-500">{item.hsnCode || '-'}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.productId, 'quantity', e.target.value)}
                              className="w-16 text-center border border-slate-200 rounded p-1"
                              min="1"
                            />
                          </td>
                          <td className="p-3 text-right">{formatAmountWithCurrency(item.unitPrice, currencyCode, currencySymbol)}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              value={item.discountPercent}
                              onChange={(e) => updateItem(item.productId, 'discountPercent', e.target.value)}
                              className="w-14 text-center border border-slate-200 rounded p-1"
                              min="0" max="100"
                            />
                          </td>
                          <td className="p-3 text-right">{formatAmountWithCurrency(taxable, currencyCode, currencySymbol)}</td>
                          {taxType === 'INTRA' ? (
                            <>
                              <td className="p-3 text-right text-slate-600">{formatAmountWithCurrency(tax / 2, currencyCode, currencySymbol)}</td>
                              <td className="p-3 text-right text-slate-600">{formatAmountWithCurrency(tax / 2, currencyCode, currencySymbol)}</td>
                            </>
                          ) : (
                            <td className="p-3 text-right text-slate-600">{formatAmountWithCurrency(tax, currencyCode, currencySymbol)}</td>
                          )}
                          <td className="p-3 text-right font-medium">{formatAmountWithCurrency(total, currencyCode, currencySymbol)}</td>
                          <td className="p-3">
                            <button onClick={() => removeItem(item.productId)} className="text-red-500 hover:text-red-700">
                              <FiTrash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {items.length === 0 && (
                <div className="p-8 text-center text-slate-400">No items added. Select products from the left panel.</div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-end">
                <div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subtotal:</span>
                    <span className="font-medium">{formatAmountWithCurrency(calculations.subTotal, currencyCode, currencySymbol)}</span>
                  </div>
                  {taxType === 'INTRA' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">CGST:</span>
                        <span className="font-medium">{formatAmountWithCurrency(calculations.cgst, currencyCode, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">SGST:</span>
                        <span className="font-medium">{formatAmountWithCurrency(calculations.sgst, currencyCode, currencySymbol)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-slate-500">IGST:</span>
                      <span className="font-medium">{formatAmountWithCurrency(calculations.igst, currencyCode, currencySymbol)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Round Off:</span>
                    <input
                      type="number"
                      value={roundOff}
                      onChange={(e) => setRoundOff(e.target.value)}
                      className="w-24 text-right border border-slate-200 rounded p-1"
                      step="0.01"
                    />
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-medium text-slate-700">Grand Total:</span>
                    <span className="font-bold text-lg text-primary">{formatAmountWithCurrency(grandTotal, currencyCode, currencySymbol)}</span>
                  </div>
                  {ewayRequired && (
                    <div className="text-xs text-orange-600 text-right">⚠️ E-Way Bill Required</div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={handleSave}
                  disabled={saving || items.length === 0}
                  className="btn bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  <FiPrinter size={18} />
                  {saving ? 'Saving...' : 'Save & Print'}
                </button>
              </div>
            </div>
          </div>
        </div>

      ) : (
        /* Invoice History Tab */
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FiFilter className="text-slate-500" />
              <span className="font-medium text-slate-700">Filters</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Customer</label>
                <SearchableSelect
                  options={customers.map(c => ({ value: c.id, label: c.name }))}
                  value={filterCustomer}
                  onChange={val => setFilterCustomer(val)}
                  placeholder="All Customers"
                  direction="down"
                  triggerClassName="min-h-0 h-[38px] py-1.5 px-3 text-sm w-full"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterCustomer(''); }}
                  className="btn border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Invoice List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {historyLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-slate-50 text-slate-600 whitespace-nowrap">
                    <tr>
                      <th className="text-left p-4">Invoice No</th>
                      <th className="text-left p-4">Date</th>
                      <th className="text-left p-4">Customer</th>
                      <th className="text-left p-4">GSTIN</th>
                      <th className="text-right p-4">Amount</th>
                      <th className="text-center p-4">E-Way Bill</th>
                      <th className="text-center p-4">Status</th>
                      <th className="text-center p-4">Actions</th>
                    </tr>
                  </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-4 font-medium text-blue-600">{inv.invoiceNumber}</td>
                      <td className="p-4">{new Date(inv.saleDate).toLocaleDateString('en-GB')}</td>
                      <td className="p-4 font-medium">{inv.customer?.name}</td>
                      <td className="p-4 text-slate-500 text-xs">{inv.customer?.gstin}</td>
                      <td className="p-4 text-right font-medium">{formatAmountWithCurrency(inv.totalAmount, inv.currencyCode || currencyCode, inv.currencySymbol || currencySymbol)}</td>
                      <td className="p-4 text-center">
                        {inv.ewayBillNumber ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">{inv.ewayBillNumber}</span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded ${inv.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={async () => {
                              const wsSettings = await api.get('/whatsapp/settings').then(r => r.data).catch(() => null);
                              if (!wsSettings?.apiKey) return toast.error('WhatsApp not configured');

                              const phone = inv.customer?.phone;
                              if (!phone) return toast.error('Customer phone missing');

                              let msg = wsSettings.salesTemplate || '';
                              msg = msg.replace(/\[\[customer_name\]\]/g, inv.customer?.name || 'Customer')
                                .replace(/\[\[bill_no\]\]/g, inv.invoiceNumber)
                                .replace(/\[\[total_amount\]\]/g, formatAmountWithCurrency(inv.totalAmount, inv.currencyCode || currencyCode, inv.currencySymbol || currencySymbol))
                                .replace(/\[\[company_name\]\]/g, 'Our Store');

                              try {
                                await api.post('/whatsapp/send', { mobile: phone, message: msg });
                                toast.success('WhatsApp Sent!');
                              } catch (err) {
                                toast.error('WhatsApp failed');
                              }
                            }}
                            className="text-emerald-500 hover:text-emerald-700 p-1"
                            title="Send WhatsApp"
                          >
                            <FiMessageSquare size={16} />
                          </button>
                          <button
                            onClick={() => handleViewInvoice(inv.id)}
                            className="text-primary hover:text-primary-dark p-1 bg-primary-light rounded"
                            title="Print Invoice"
                          >
                            <FiPrinter size={16} />
                          </button>
                          <button
                            onClick={() => handleExportJSON(inv)}
                            className="text-blue-600 hover:text-blue-800 p-1 bg-blue-50 rounded"
                            title="Export GST JSON"
                          >
                            <FiFileText size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        No invoices found. {filterStartDate || filterEndDate || filterCustomer ? 'Try adjusting filters.' : 'Create your first B2B invoice!'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* E-Way Bill Modal */}
      {showEwayModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-slate-800 mb-4">E-Way Bill Required</h3>
            <p className="text-sm text-slate-500 mb-4">Invoice value exceeds {formatAmountWithCurrency(settings?.ewayBillThreshold, currencyCode, currencySymbol)}. Please enter E-Way Bill number.</p>
            <input
              type="text"
              value={ewayBillNumber}
              onChange={(e) => setEwayBillNumber(e.target.value)}
              className="input mb-4"
              placeholder="E-Way Bill Number"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowEwayModal(false); handlePrint(); }} className="flex-1 btn border border-slate-300 text-slate-600 py-2 rounded-lg">
                Skip for Now
              </button>
              <button onClick={handleSaveEway} className="flex-1 btn bg-emerald-600 text-white py-2 rounded-lg">
                Save & Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Component */}
      <div className="hidden">
        <div ref={printRef}>
          {lastInvoice && <GSTInvoicePrint data={lastInvoice} />}
        </div>
      </div>
    </div>
  );
}
