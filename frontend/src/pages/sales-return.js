import { useState, useEffect, useRef, useMemo } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { useReactToPrint } from 'react-to-print';
import {
  FiSearch,
  FiSave,
  FiPrinter,
  FiRefreshCw,
  FiPlus,
  FiTrash2,
  FiEye,
  FiX,
  FiAlertCircle,
  FiCheckCircle,
  FiDollarSign,
  FiBox,
  FiRotateCcw,
  FiShoppingBag,
  FiArrowRight,
  FiFilter,
  FiCalendar,
  FiUser,
  FiPhone,
  FiCreditCard,
  FiArchive,
  FiTag
} from 'react-icons/fi';
import ExchangeBill from '@/components/ExchangeBill';
import { formatAmountWithCurrency, normalizeCurrencySymbol, DEFAULT_CURRENCY } from '@/lib/currency';

export default function AdvancedSalesReturn() {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'

  // Invoice Search & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Return Items State
  const [returnItems, setReturnItems] = useState([]);
  const [commonReturnReason, setCommonReturnReason] = useState('Customer Choice / Exchange');

  // New Products / Exchange Cart State
  const [newCart, setNewCart] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [categories, setCategories] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Settlement & Payment State
  const [settlementChoice, setSettlementChoice] = useState('STORE_CREDIT'); // 'STORE_CREDIT' | 'REFUNDED'
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Master Data & Configuration
  const [companyProfile, setCompanyProfile] = useState(null);
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(null);
  const [customerBalance, setCustomerBalance] = useState(0);

  // History & KPIs State
  const [historyList, setHistoryList] = useState([]);
  const [kpis, setKpis] = useState({
    totalReturns: 0,
    totalReturnValue: 0,
    totalExchanges: 0,
    totalCreditNotes: 0,
    productsRestocked: 0,
    pendingRefunds: 0
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilterType, setHistoryFilterType] = useState('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [viewingTransaction, setViewingTransaction] = useState(null);

  // Printing State
  const printComponentRef = useRef();
  const [lastPrintData, setLastPrintData] = useState(null);

  const handlePrint = useReactToPrint({
    contentRef: printComponentRef,
    pageStyle: `@page { size: auto; margin: 5mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`
  });

  // Currency
  const curCode = selectedInvoice?.currencyCode || companyProfile?.currencyCode || DEFAULT_CURRENCY;
  const curSymbol = normalizeCurrencySymbol(selectedInvoice?.currencySymbol || companyProfile?.currencySymbol, curCode);
  const fmt = (val) => formatAmountWithCurrency(val || 0, curCode, curSymbol);

  // --- Initial Data Loading ---
  useEffect(() => {
    fetchInitialSetup();
    fetchHistory();
  }, []);

  const fetchInitialSetup = async () => {
    try {
      const [compRes, branchRes, catRes] = await Promise.all([
        api.get('/company').catch(() => ({ data: null })),
        api.get('/branches').catch(() => ({ data: [] })),
        api.get('/categories').catch(() => ({ data: [] }))
      ]);

      if (compRes.data) setCompanyProfile(compRes.data);
      if (branchRes.data) setBranches(branchRes.data);
      if (catRes.data) setCategories(catRes.data);

      const localBranch = typeof window !== 'undefined' ? localStorage.getItem('activeBranchId') : null;
      if (localBranch) {
        setActiveBranchId(parseInt(localBranch));
      } else if (branchRes.data?.length > 0) {
        setActiveBranchId(branchRes.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial setup:', err);
    }
  };

  // --- Fetch History & KPIs ---
  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/sales/exchange-history', {
        params: {
          transactionType: historyFilterType !== 'ALL' ? historyFilterType : undefined,
          search: historySearch || undefined,
          branchId: activeBranchId || undefined
        }
      });
      if (res.data) {
        setKpis(res.data.kpis || {});
        setHistoryList(res.data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching exchange history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyFilterType, historySearch]);

  // --- Search Original Invoices ---
  const handleSearchInvoices = async (val) => {
    const term = val !== undefined ? val : searchQuery;
    if (!term || term.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const res = await api.get('/sales/return-search', {
        params: { q: term.trim(), branchId: activeBranchId || undefined }
      });
      setSearchResults(res.data || []);
      if (res.data?.length === 0) {
        toast.info('No matching invoices found for return.');
      }
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Failed to search invoices');
    } finally {
      setIsSearching(false);
    }
  };

  // --- Select Original Invoice ---
  const selectInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    setSearchResults([]);
    setSearchQuery(invoice.invoiceNumber);

    // Initialize return items table
    const mappedItems = (invoice.items || []).map((it) => {
      const alreadyReturned = it.alreadyReturnedQty || 0;
      const remaining = Math.max(0, it.quantity - alreadyReturned);
      const unitPrice = parseFloat(it.unitPrice || 0);
      const discAmt = parseFloat(it.discountAmount || 0);
      const netPrice = Math.max(0, unitPrice - discAmt);
      return {
        ...it,
        originalQty: it.quantity,
        alreadyReturnedQty: alreadyReturned,
        remainingQty: remaining,
        netUnitPrice: netPrice,
        returnQty: 0,
        returnReason: commonReturnReason,
        isSelected: false
      };
    });
    setReturnItems(mappedItems);
    setNewCart([]);
    setCustomerBalance(invoice.customerBalance || 0);
    toast.success(`Loaded Invoice ${invoice.invoiceNumber}`);
  };

  // --- Return Items Controls ---
  const handleItemReturnQtyChange = (itemId, newQty) => {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const parsed = Math.min(Math.max(0, parseInt(newQty) || 0), item.remainingQty);
          return {
            ...item,
            returnQty: parsed,
            isSelected: parsed > 0
          };
        }
        return item;
      })
    );
  };

  const handleItemReasonChange = (itemId, reason) => {
    setReturnItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, returnReason: reason } : item))
    );
  };

  const selectAllMaxReturn = () => {
    setReturnItems((prev) =>
      prev.map((item) => ({
        ...item,
        returnQty: item.remainingQty,
        isSelected: item.remainingQty > 0
      }))
    );
  };

  const clearAllReturn = () => {
    setReturnItems((prev) =>
      prev.map((item) => ({
        ...item,
        returnQty: 0,
        isSelected: false
      }))
    );
  };

  // --- New Purchase / Exchange Product Selector ---
  const openProductSelector = async () => {
    setShowProductModal(true);
    if (availableProducts.length === 0) {
      try {
        setLoadingProducts(true);
        const res = await api.get('/products', {
          params: { branchId: activeBranchId || selectedInvoice?.branchId || undefined }
        });
        setAvailableProducts(res.data || []);
        setFilteredProducts(res.data || []);
      } catch (err) {
        console.error('Failed to load products:', err);
        toast.error('Failed to load products catalogue');
      } finally {
        setLoadingProducts(false);
      }
    }
  };

  // Filter products in modal
  useEffect(() => {
    let result = availableProducts;
    if (selectedCategory !== 'ALL') {
      result = result.filter(
        (p) => String(p.categoryId) === String(selectedCategory) || p.category?.name === selectedCategory
      );
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q))
      );
    }
    setFilteredProducts(result);
  }, [productSearch, selectedCategory, availableProducts]);

  // Add Product to New Cart
  const addProductToNewCart = (product, selectedSize = null) => {
    let sizeStock = parseInt(product.stock, 10) || 0;
    if (selectedSize && product.sizeStocks) {
      let pStocks = product.sizeStocks;
      if (typeof pStocks === 'string') {
        try { pStocks = JSON.parse(pStocks); } catch (e) { pStocks = []; }
      }
      if (Array.isArray(pStocks)) {
        const found = pStocks.find(
          (s) => String(s.size).trim().toLowerCase() === String(selectedSize).trim().toLowerCase()
        );
        if (found) {
          sizeStock = parseInt(found.stock, 10) || 0;
        }
      }
    }

    if (sizeStock <= 0) {
      toast.error(`"${product.name}"${selectedSize ? ` (${selectedSize})` : ''} is out of stock!`);
      return;
    }

    const cartKey = `${product.id}_${selectedSize || 'nosize'}`;
    const existing = newCart.find((i) => i.cartKey === cartKey);

    if (existing) {
      if (existing.quantity + 1 > sizeStock) {
        toast.error(`Cannot add more than available stock (${sizeStock})`);
        return;
      }
      setNewCart(
        newCart.map((i) =>
          i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      const unitPrice = parseFloat(product.price || 0);
      const taxRate = parseFloat(product.taxRate || 0);
      setNewCart([
        ...newCart,
        {
          cartKey,
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          sku: product.sku,
          size: selectedSize,
          unitPrice,
          originalUnitPrice: unitPrice,
          discountAmount: 0,
          discountPercent: 0,
          taxRate,
          isTaxInclusive: product.isTaxInclusive === true,
          availableStock: sizeStock,
          quantity: 1
        }
      ]);
    }
    toast.success(`Added ${product.name}${selectedSize ? ` (${selectedSize})` : ''}`);
  };

  const updateNewCartQty = (cartKey, newQty) => {
    const item = newCart.find((i) => i.cartKey === cartKey);
    if (!item) return;
    const parsed = parseInt(newQty) || 0;
    if (parsed <= 0) {
      removeNewCartItem(cartKey);
      return;
    }
    if (parsed > item.availableStock) {
      toast.error(`Cannot exceed available stock (${item.availableStock})`);
      return;
    }
    setNewCart(newCart.map((i) => (i.cartKey === cartKey ? { ...i, quantity: parsed } : i)));
  };

  const removeNewCartItem = (cartKey) => {
    setNewCart(newCart.filter((i) => i.cartKey !== cartKey));
  };

  // --- Financial Calculations ---
  const activeReturnedItems = useMemo(
    () => returnItems.filter((i) => i.returnQty > 0),
    [returnItems]
  );

  const returnCreditTotal = useMemo(() => {
    return activeReturnedItems.reduce((sum, item) => {
      const lineVal = item.returnQty * item.netUnitPrice;
      return sum + lineVal;
    }, 0);
  }, [activeReturnedItems]);

  const newPurchaseTotal = useMemo(() => {
    return newCart.reduce((sum, item) => {
      const netPrice = Math.max(0, item.unitPrice - (item.discountAmount || 0));
      const lineSub = item.quantity * netPrice;
      let lineTax = 0;
      if (item.taxRate > 0) {
        lineTax = item.isTaxInclusive
          ? lineSub - lineSub / (1 + item.taxRate / 100)
          : (lineSub * item.taxRate) / 100;
      }
      return sum + (item.isTaxInclusive ? lineSub : lineSub + lineTax);
    }, 0);
  }, [newCart]);

  const creditAdjustment = useMemo(() => {
    if (newCart.length === 0) return 0;
    return Math.min(returnCreditTotal, newPurchaseTotal);
  }, [returnCreditTotal, newPurchaseTotal, newCart]);

  const remainingPayable = useMemo(() => {
    return Math.max(0, newPurchaseTotal - returnCreditTotal);
  }, [newPurchaseTotal, returnCreditTotal]);

  const remainingCustomerCredit = useMemo(() => {
    return Math.max(0, returnCreditTotal - newPurchaseTotal);
  }, [returnCreditTotal, newPurchaseTotal]);
  const remainingCredit = remainingCustomerCredit;

  // Keep tendered amount synchronized
  useEffect(() => {
    setTenderedAmount(remainingPayable > 0 ? remainingPayable.toFixed(2) : '0.00');
  }, [remainingPayable]);

  // --- Submit Return & Exchange ---
  const handleSubmitTransaction = async () => {
    if (!selectedInvoice) {
      toast.error('Please search and select an original invoice first.');
      return;
    }

    if (activeReturnedItems.length === 0) {
      toast.error('Please specify return quantity for at least one item.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        originalInvoice: selectedInvoice.invoiceNumber,
        customerId: selectedInvoice.customerId || null,
        branchId: selectedInvoice.branchId || activeBranchId,
        returnReason: commonReturnReason,
        settlementType:
          newCart.length > 0
            ? remainingPayable > 0
              ? 'DIFFERENCE_PAID'
              : remainingCustomerCredit > 0
              ? settlementChoice
              : 'EXACT_EXCHANGE'
            : settlementChoice,
        paymentMethod: remainingPayable > 0 ? paymentMethod : settlementChoice === 'REFUNDED' ? 'Cash' : 'Credit',
        payments:
          remainingPayable > 0
            ? [{ method: paymentMethod, amount: parseFloat(tenderedAmount || remainingPayable) }]
            : [],
        returnItems: activeReturnedItems.map((item) => ({
          productId: item.productId,
          size: item.size || null,
          quantity: item.returnQty,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount || 0,
          taxPercent: item.taxRate || 0
        })),
        newItems: newCart.map((item) => ({
          productId: item.productId,
          size: item.size || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount || 0,
          discountPercent: item.discountPercent || 0,
          taxRate: item.taxRate || 0,
          isTaxInclusive: item.isTaxInclusive
        })),
        notes: `Exchange against ${selectedInvoice.invoiceNumber}`
      };

      const res = await api.post('/sales/exchange', payload);
      const data = res.data;

      toast.success(
        newCart.length > 0
          ? `Product Exchange Processed: #${data.exchange?.exchangeNumber || 'SUCCESS'}`
          : `Return Processed: Credit Note #${data.returnSale?.invoiceNumber || 'SUCCESS'}`
      );

      // Stash for printing
      setLastPrintData({
        exchange: data.exchange,
        returnSale: data.returnSale,
        newSale: data.newSale,
        customer: selectedInvoice.customer,
        branch: selectedInvoice.branch,
        financials: data.financials,
        companyProfile
      });

      // Clear workspace
      setSelectedInvoice(null);
      setSearchQuery('');
      setReturnItems([]);
      setNewCart([]);

      // Trigger automatic print
      setTimeout(() => {
        handlePrint();
      }, 500);

      // Refresh history & KPIs
      fetchHistory();
    } catch (err) {
      console.error('Submission error:', err);
      toast.error(err.response?.data?.message || 'Failed to process return and exchange');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* TOP HEADER & TAB NAVIGATION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-primary to-indigo-600 text-white rounded-xl shadow-md shadow-primary/20">
              <FiRotateCcw className="text-xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Sales Return & Product Exchange
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Integrated Returns, Credit Notes, Variant Restocking & Instant Product Exchanges
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200/80 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'new'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FiPlus className="text-sm" /> New Return / Exchange
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FiArchive className="text-sm" /> History & Audit ({historyList.length})
          </button>
        </div>
      </div>

      {/* SECTION A: DASHBOARD KPIS (Always visible at top of page) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Returns</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><FiRotateCcw className="text-xs" /></div>
          </div>
          <div className="text-xl font-bold text-slate-800">{kpis.totalReturns}</div>
          <div className="text-[10px] text-slate-400 mt-1">Processed transactions</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Return Value</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><FiDollarSign className="text-xs" /></div>
          </div>
          <div className="text-xl font-bold text-rose-600 font-mono">{fmt(kpis.totalReturnValue)}</div>
          <div className="text-[10px] text-slate-400 mt-1">Gross returned value</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Exchanges</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><FiShoppingBag className="text-xs" /></div>
          </div>
          <div className="text-xl font-bold text-emerald-600">{kpis.totalExchanges}</div>
          <div className="text-[10px] text-slate-400 mt-1">Replacement orders</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Credit Notes</span>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><FiCreditCard className="text-xs" /></div>
          </div>
          <div className="text-xl font-bold text-indigo-600">{kpis.totalCreditNotes}</div>
          <div className="text-[10px] text-slate-400 mt-1">Issued credit notes</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Restocked Units</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><FiBox className="text-xs" /></div>
          </div>
          <div className="text-xl font-bold text-blue-600">{kpis.productsRestocked}</div>
          <div className="text-[10px] text-slate-400 mt-1">Returned to inventory</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Store Credit</span>
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg"><FiCheckCircle className="text-xs" /></div>
          </div>
          <div className="text-xl font-bold text-purple-600 font-mono">{fmt(kpis.pendingRefunds)}</div>
          <div className="text-[10px] text-slate-400 mt-1">Held customer balance</div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: NEW RETURN & EXCHANGE WORKFLOW                          */}
      {/* ============================================================== */}
      {activeTab === 'new' && (
        <div className="space-y-6">
          {/* SECTION B: ORIGINAL INVOICE SEARCH */}
          <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <FiSearch className="text-primary" /> Search Original Sales Invoice
                </label>
                <p className="text-[11px] text-slate-400">
                  Search by Invoice Number, Customer Name, Mobile Number, Product Barcode or Name
                </p>
              </div>

              {selectedInvoice && (
                <button
                  onClick={() => {
                    setSelectedInvoice(null);
                    setSearchQuery('');
                    setReturnItems([]);
                    setNewCart([]);
                  }}
                  className="btn btn-outline text-xs px-3 py-1.5 text-slate-500 hover:text-rose-600 flex items-center gap-1"
                >
                  <FiX /> Change Invoice
                </button>
              )}
            </div>

            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchInvoices()}
                    placeholder="Enter Invoice No (e.g. INV-1001), Customer Name, Mobile or Barcode..."
                    className="input w-full py-2.5 pl-10 pr-4 text-sm font-medium border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 font-mono"
                  />
                  <FiSearch className="absolute left-3.5 top-3.5 text-slate-400 text-sm" />
                </div>
                <button
                  onClick={() => handleSearchInvoices()}
                  disabled={isSearching}
                  className="btn btn-primary px-6 rounded-xl flex items-center gap-2 text-xs font-semibold"
                >
                  {isSearching ? <FiRefreshCw className="animate-spin" /> : <FiSearch />} Search
                </button>
              </div>

              {/* SEARCH AUTO-COMPLETE DROPDOWN */}
              {searchResults.length > 0 && !selectedInvoice && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-96 overflow-y-auto animate-fade-in">
                  <div className="p-2.5 bg-slate-50 border-b text-[11px] font-bold uppercase text-slate-500">
                    Found {searchResults.length} Matching Invoices
                  </div>
                  <div className="divide-y divide-slate-100">
                    {searchResults.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => selectInvoice(inv)}
                        className="p-3.5 hover:bg-primary-light/5 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900">{inv.invoiceNumber}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              {new Date(inv.saleDate).toLocaleDateString()}
                            </span>
                            {inv.branch?.name && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                {inv.branch.name}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 flex items-center gap-3">
                            <span className="font-medium text-slate-800">{inv.customer?.name || 'Walk-in'}</span>
                            {inv.customer?.phone && <span className="text-slate-400 font-mono">{inv.customer.phone}</span>}
                            <span className="text-slate-400">• {inv.items?.length || 0} line items</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-bold font-mono text-slate-900">{fmt(inv.totalAmount)}</div>
                          <div className="text-[10px] text-emerald-600 font-medium uppercase">{inv.paymentMethod || 'Paid'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SELECTED INVOICE INFO STRIP */}
            {selectedInvoice && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200/80 rounded-xl grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs animate-fade-in">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Customer</span>
                  <p className="font-semibold text-slate-800 truncate">{selectedInvoice.customer?.name || 'Walk-in Customer'}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{selectedInvoice.customer?.phone || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Invoice No</span>
                  <p className="font-bold text-primary font-mono">{selectedInvoice.invoiceNumber}</p>
                  <p className="text-[10px] text-slate-500">{new Date(selectedInvoice.saleDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Original Total</span>
                  <p className="font-bold text-slate-800 font-mono">{fmt(selectedInvoice.totalAmount)}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{selectedInvoice.paymentMethod || 'Cash'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Branch</span>
                  <p className="font-semibold text-slate-800 truncate">{selectedInvoice.branch?.name || 'Main Branch'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Customer Balance</span>
                  <p className={`font-bold font-mono ${customerBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {fmt(customerBalance)}
                  </p>
                  <p className="text-[10px] text-slate-400">{customerBalance > 0 ? 'Due from Customer' : 'No Overdue'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Return Eligibility</span>
                  <p className="font-semibold text-emerald-700">
                    {returnItems.filter((i) => i.remainingQty > 0).length} of {returnItems.length} items eligible
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* MAIN TWO-COLUMN WORKSPACE: RETURNED ITEMS & EXCHANGE CART */}
          {selectedInvoice && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
              {/* LEFT COLUMN: SECTION C - RETURNED PRODUCTS */}
              <div className="lg:col-span-7 space-y-4">
                <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">1</span>
                      <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
                        Returned Product Details
                      </h2>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllMaxReturn}
                        className="btn btn-outline text-[11px] px-2.5 py-1 text-slate-600 hover:text-primary rounded-lg"
                      >
                        Select Max
                      </button>
                      <button
                        onClick={clearAllReturn}
                        className="btn btn-outline text-[11px] px-2.5 py-1 text-slate-600 hover:text-rose-600 rounded-lg"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* PRODUCTS TABLE */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase text-[10px]">
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-2 text-center">Sold</th>
                          <th className="py-2.5 px-2 text-center">Ret'd</th>
                          <th className="py-2.5 px-2 text-center text-slate-900">Eligible</th>
                          <th className="py-2.5 px-3 text-right">Net Price</th>
                          <th className="py-2.5 px-3 text-center w-28">Return Qty</th>
                          <th className="py-2.5 px-3 text-right">Return Amt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {returnItems.map((item) => {
                          const isEligible = item.remainingQty > 0;
                          const lineReturnTotal = item.returnQty * item.netUnitPrice;
                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                item.returnQty > 0 ? 'bg-amber-50/30' : 'hover:bg-slate-50/50'
                              } ${!isEligible ? 'opacity-40 bg-slate-50/20' : ''}`}
                            >
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-800">{item.product?.name || item.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                                  {item.product?.barcode && <span>{item.product.barcode}</span>}
                                  {item.size && <span className="text-slate-600 font-bold bg-slate-100 px-1 rounded">Size: {item.size}</span>}
                                </div>
                              </td>
                              <td className="py-3 px-2 text-center font-mono text-slate-600">{item.originalQty}</td>
                              <td className="py-3 px-2 text-center font-mono text-amber-600 font-medium">
                                {item.alreadyReturnedQty || 0}
                              </td>
                              <td className="py-3 px-2 text-center font-mono font-bold text-slate-900">
                                {item.remainingQty}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-slate-700">
                                {fmt(item.netUnitPrice)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                                  <button
                                    type="button"
                                    onClick={() => handleItemReturnQtyChange(item.id, item.returnQty - 1)}
                                    disabled={item.returnQty <= 0 || !isEligible}
                                    className="px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.remainingQty}
                                    value={item.returnQty}
                                    disabled={!isEligible}
                                    onChange={(e) => handleItemReturnQtyChange(item.id, e.target.value)}
                                    className="w-12 text-center font-bold text-slate-900 font-mono py-1 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleItemReturnQtyChange(item.id, item.returnQty + 1)}
                                    disabled={item.returnQty >= item.remainingQty || !isEligible}
                                    className="px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-bold font-mono text-slate-900">
                                {fmt(lineReturnTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* RETURN SUMMARY STRIP */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex-1 max-w-sm">
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Reason for Return
                      </label>
                      <input
                        type="text"
                        value={commonReturnReason}
                        onChange={(e) => setCommonReturnReason(e.target.value)}
                        placeholder="e.g. Defective, Wrong Size, Customer Choice"
                        className="input w-full py-1.5 px-3 text-xs border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Total Return Credit ({activeReturnedItems.length} items)
                      </span>
                      <span className="text-lg font-bold font-mono text-amber-700">
                        {fmt(returnCreditTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* INVENTORY RESTOCK NOTICE */}
                <div className="p-3.5 bg-amber-50 border border-amber-200/60 rounded-xl flex items-start gap-3">
                  <FiBox className="text-amber-600 text-base mt-0.5" />
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    <strong>Automatic Stock Restoration:</strong> All selected returned quantities will automatically be
                    restocked into your branch inventory and variant size stock upon completing this transaction.
                  </p>
                </div>
              </div>

              {/* RIGHT COLUMN: SECTION D - PURCHASE NEW PRODUCTS / EXCHANGE & SETTLEMENT */}
              <div className="lg:col-span-5 space-y-4">
                {/* NEW PURCHASE / EXCHANGE SECTION */}
                <div className="card p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">2</span>
                      <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
                        Exchange / New Products
                      </h2>
                    </div>
                    <button
                      onClick={openProductSelector}
                      className="btn btn-primary px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-primary/20"
                    >
                      <FiPlus /> Add New Products
                    </button>
                  </div>

                  {newCart.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                      <FiShoppingBag className="text-slate-300 text-3xl mx-auto mb-2" />
                      <p className="text-xs font-medium text-slate-600">No exchange products selected</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "+ Add New Products" to purchase replacements in this bill
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase text-[10px]">
                              <th className="py-2 px-2">New Product</th>
                              <th className="py-2 px-2 text-center">Stock</th>
                              <th className="py-2 px-2 text-center w-20">Qty</th>
                              <th className="py-2 px-2 text-right">Price</th>
                              <th className="py-2 px-2 text-right">Total</th>
                              <th className="py-2 px-2 text-center w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {newCart.map((item) => (
                              <tr key={item.cartKey} className="hover:bg-emerald-50/20">
                                <td className="py-2.5 px-2">
                                  <div className="font-semibold text-slate-800 leading-tight">{item.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {item.size ? `Size: ${item.size}` : item.barcode || 'Variant'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-center font-mono text-[11px] text-slate-500">
                                  {item.availableStock}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <div className="inline-flex items-center border border-slate-200 rounded overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => updateNewCartQty(item.cartKey, item.quantity - 1)}
                                      className="px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                                    >
                                      -
                                    </button>
                                    <span className="w-7 text-center font-bold text-slate-900 font-mono text-xs">
                                      {item.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => updateNewCartQty(item.cartKey, item.quantity + 1)}
                                      className="px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono text-slate-700">
                                  {fmt(item.unitPrice)}
                                </td>
                                <td className="py-2.5 px-2 text-right font-bold font-mono text-slate-900">
                                  {fmt(item.quantity * item.unitPrice)}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <button
                                    onClick={() => removeNewCartItem(item.cartKey)}
                                    className="text-slate-400 hover:text-rose-600 transition-colors"
                                  >
                                    <FiTrash2 className="text-xs" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="pt-2 border-t flex justify-between items-center text-xs">
                        <span className="text-slate-500">New Purchase Subtotal:</span>
                        <span className="font-bold font-mono text-emerald-700">{fmt(newPurchaseTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION E: FINANCIAL SETTLEMENT PANEL */}
                <div className="card p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-lg shadow-slate-900/10">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-700 mb-3 flex items-center justify-between">
                    <span>Financial Settlement</span>
                    <span className="text-[10px] font-mono text-primary-light">AUTO ADJUSTED</span>
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">Total Return Credit:</span>
                      <span className="font-mono font-bold text-amber-400">{fmt(returnCreditTotal)}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-300">New Purchase Total:</span>
                      <span className="font-mono font-bold text-emerald-400">{fmt(newPurchaseTotal)}</span>
                    </div>

                    {newCart.length > 0 && (
                      <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-700/60">
                        <span>Credit Applied against Purchase:</span>
                        <span className="font-mono font-bold text-primary-light">- {fmt(creditAdjustment)}</span>
                      </div>
                    )}

                    {/* DYNAMIC CASE RENDERING */}
                    {/* Case 1: Customer Pays Difference */}
                    {remainingPayable > 0 && (
                      <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-xs uppercase font-bold text-amber-400">Customer Needs to Pay</span>
                          <span className="text-xl font-bold font-mono text-amber-400">{fmt(remainingPayable)}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Return credit of {fmt(creditAdjustment)} automatically deducted from new purchase.
                        </p>
                      </div>
                    )}

                    {/* Case 2: Exact Exchange */}
                    {newCart.length > 0 && Math.abs(newPurchaseTotal - returnCreditTotal) < 0.01 && (
                      <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                        <div className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
                          Exact Exchange Completed
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">No additional payment required (₹0.00)</p>
                      </div>
                    )}

                    {/* Case 3: Customer Has Remaining Credit */}
                    {remainingCredit > 0 && (
                      <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs uppercase font-bold text-blue-400">
                            {newCart.length > 0 ? 'Remaining Credit Balance' : 'Total Return Value'}
                          </span>
                          <span className="text-xl font-bold font-mono text-blue-400">{fmt(remainingCredit)}</span>
                        </div>

                        {/* Settlement Choice Radios */}
                        <div className="pt-2 border-t border-slate-700/60 grid grid-cols-2 gap-2 text-[11px]">
                          <label
                            className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center gap-1.5 ${
                              settlementChoice === 'STORE_CREDIT'
                                ? 'bg-blue-600 text-white border-blue-500 font-bold'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="settlement"
                              value="STORE_CREDIT"
                              checked={settlementChoice === 'STORE_CREDIT'}
                              onChange={() => setSettlementChoice('STORE_CREDIT')}
                              className="hidden"
                            />
                            <span>Store Credit</span>
                          </label>

                          <label
                            className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center gap-1.5 ${
                              settlementChoice === 'REFUNDED'
                                ? 'bg-purple-600 text-white border-purple-500 font-bold'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="settlement"
                              value="REFUNDED"
                              checked={settlementChoice === 'REFUNDED'}
                              onChange={() => setSettlementChoice('REFUNDED')}
                              className="hidden"
                            />
                            <span>Cash Refund</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECTION F: PAYMENT METHOD SELECTION (When difference is payable) */}
                  {remainingPayable > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-700 space-y-2 text-xs">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Payment Method for Balance
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['Cash', 'UPI', 'Card', 'Bank Transfer'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-all ${
                              paymentMethod === m
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ACTION BUTTON */}
                  <button
                    onClick={handleSubmitTransaction}
                    disabled={isSubmitting || activeReturnedItems.length === 0}
                    className="w-full mt-5 btn btn-primary py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <FiRefreshCw className="animate-spin text-base" />
                    ) : (
                      <FiSave className="text-base" />
                    )}
                    {newCart.length > 0 ? 'Process Exchange & Print Bill' : 'Process Return & Print Note'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* EMPTY WORKSPACE PLACEHOLDER */}
          {!selectedInvoice && (
            <div className="py-20 text-center bg-white border border-slate-200/80 rounded-2xl p-8">
              <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <FiRotateCcw className="text-2xl" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Invoice Selected</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Search an original customer invoice using the search bar above to begin processing a product return,
                credit note, or product exchange.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: AUDIT & HISTORY REGISTER                                */}
      {/* ============================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* FILTERS TOOLBAR */}
          <div className="card p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {['ALL', 'EXCHANGE', 'RETURN'].map((t) => (
                <button
                  key={t}
                  onClick={() => setHistoryFilterType(t)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    historyFilterType === t
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t === 'ALL' ? 'All Transactions' : t === 'EXCHANGE' ? 'Exchanges Only' : 'Returns Only'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search return/exchange no, invoice, customer..."
                  className="input py-1.5 pl-8 pr-3 text-xs w-64 border-slate-200 rounded-lg"
                />
                <FiSearch className="absolute left-2.5 top-2.5 text-slate-400 text-xs" />
              </div>

              <button
                onClick={fetchHistory}
                className="btn btn-outline p-2 text-slate-600 hover:text-primary rounded-lg text-xs"
                title="Refresh history"
              >
                <FiRefreshCw className={historyLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* HISTORY TABLE */}
          <div className="card p-0 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase text-[10px]">
                    <th className="py-3 px-3">Transaction #</th>
                    <th className="py-3 px-3">Original Inv</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-2 text-center">Type</th>
                    <th className="py-3 px-3 text-right">Return Val</th>
                    <th className="py-3 px-3 text-right">New Purchase</th>
                    <th className="py-3 px-3 text-right">Credit Adj</th>
                    <th className="py-3 px-3 text-right">Paid Difference</th>
                    <th className="py-3 px-2 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Date</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        {historyLoading ? 'Loading transactions...' : 'No return or exchange records found'}
                      </td>
                    </tr>
                  ) : (
                    historyList.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-mono font-bold text-slate-900">{tx.exchangeNumber}</div>
                          <div className="text-[10px] text-slate-400 font-mono">CN: {tx.returnNumber}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">{tx.originalInvoice}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{tx.customer?.name || 'Walk-in'}</div>
                          {tx.customer?.phone && (
                            <div className="text-[10px] text-slate-400 font-mono">{tx.customer.phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              tx.transactionType === 'EXCHANGE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {tx.transactionType}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">
                          {fmt(tx.returnValue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                          {tx.purchaseValue > 0 ? fmt(tx.purchaseValue) : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {tx.creditApplied > 0 ? fmt(tx.creditApplied) : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {tx.amountPaid > 0 ? fmt(tx.amountPaid) : '₹0.00'}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              tx.status === 'cancelled'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center text-slate-500 font-mono text-[10px]">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setViewingTransaction(tx)}
                              className="p-1.5 text-slate-500 hover:text-primary rounded hover:bg-slate-100"
                              title="View full audit details"
                            >
                              <FiEye className="text-sm" />
                            </button>
                            <button
                              onClick={() => {
                                setLastPrintData({
                                  exchange: tx,
                                  returnSale: tx.returnSale,
                                  newSale: tx.newSale,
                                  customer: tx.customer,
                                  branch: tx.branch,
                                  financials: {
                                    returnTotal: tx.returnValue,
                                    newPurchaseTotal: tx.purchaseValue,
                                    creditApplied: tx.creditApplied,
                                    remainingPayable: tx.amountPaid,
                                    remainingCredit: tx.remainingCredit,
                                    refundAmount: tx.refundAmount,
                                    settlementType: tx.settlementType
                                  },
                                  companyProfile
                                });
                                setTimeout(() => handlePrint(), 300);
                              }}
                              className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
                              title="Reprint Bill / Note"
                            >
                              <FiPrinter className="text-sm" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: ADD PRODUCTS SELECTOR MODAL                           */}
      {/* ============================================================== */}
      {showProductModal && (
        <div
          className="fixed inset-0 z-[100000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProductModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden animate-scale-up my-auto">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-lg shadow-sm border border-teal-500/20">
                  <FiPlus className="stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base tracking-wide">
                      Select Exchange / Replacement Product
                    </h3>
                    {newCart.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                        {newCart.length} in cart
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select variants or scan barcodes to add items into this exchange bill
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors"
                title="Close"
              >
                <FiX className="text-xl" />
              </button>
            </div>

            {/* Modal Search & Filter Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name, barcode or SKU..."
                  className="input w-full py-2 pl-9 pr-4 text-xs border-slate-200 rounded-xl"
                  autoFocus
                />
                <FiSearch className="absolute left-3 top-3 text-slate-400 text-xs" />
              </div>

              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-md">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === 'ALL'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategory(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      String(selectedCategory) === String(c.id)
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Products List / Grid */}
            <div className="p-4 flex-1 overflow-y-auto">
              {loadingProducts ? (
                <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
                  <FiRefreshCw className="animate-spin text-lg" /> Loading product inventory...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  No products found matching your search.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredProducts.map((p) => {
                    let parsedSizes = p.sizeStocks;
                    if (typeof parsedSizes === 'string') {
                      try { parsedSizes = JSON.parse(parsedSizes); } catch (e) { parsedSizes = []; }
                    }
                    const hasSizes = Array.isArray(parsedSizes) && parsedSizes.length > 0;

                    return (
                      <div
                        key={p.id}
                        className="p-3.5 border border-slate-200/80 rounded-xl hover:border-primary/40 hover:shadow-sm transition-all bg-white flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="font-semibold text-slate-900 text-xs leading-snug">{p.name}</h4>
                            <span className="font-bold font-mono text-xs text-primary">{fmt(p.price)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {p.barcode || p.sku || 'No Barcode'}
                          </div>
                        </div>

                        {/* Size Variants */}
                        {hasSizes ? (
                          <div className="mt-2.5 pt-2 border-t border-slate-100">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">
                              Select Size Variant:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {parsedSizes.map((sObj, idx) => {
                                const vStock = parseInt(sObj.stock, 10) || 0;
                                const isOos = vStock <= 0;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    disabled={isOos}
                                    onClick={() => addProductToNewCart(p, sObj.size)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                                      isOos
                                        ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-primary hover:text-white hover:border-primary'
                                    }`}
                                  >
                                    {sObj.size} <span className="opacity-70">({vStock})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-mono">Stock: {p.stock || 0}</span>
                            <button
                              type="button"
                              onClick={() => addProductToNewCart(p)}
                              disabled={(p.stock || 0) <= 0}
                              className="btn btn-outline text-[10px] px-2 py-1 text-primary hover:bg-primary hover:text-white rounded"
                            >
                              Add Product
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">
                {newCart.length} new items added to exchange cart
              </span>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="btn btn-primary px-5 py-1.5 rounded-lg text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: VIEW TRANSACTION AUDIT DETAILS MODAL                   */}
      {/* ============================================================== */}
      {viewingTransaction && (
        <div
          className="fixed inset-0 z-[100000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingTransaction(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden animate-scale-up my-auto">
            <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-lg shadow-sm border border-blue-500/20">
                  <FiEye className="stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base tracking-wide">
                    Transaction Details: {viewingTransaction.exchangeNumber}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Original Invoice: {viewingTransaction.originalInvoice} • Created on{' '}
                    {new Date(viewingTransaction.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingTransaction(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors"
                title="Close"
              >
                <FiX className="text-xl" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              {/* Financial Summary Strip */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Return Value</span>
                  <p className="font-mono font-bold text-rose-600 text-sm">{fmt(viewingTransaction.returnValue)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">New Purchase</span>
                  <p className="font-mono font-bold text-emerald-600 text-sm">
                    {viewingTransaction.purchaseValue > 0 ? fmt(viewingTransaction.purchaseValue) : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Credit Adjusted</span>
                  <p className="font-mono font-bold text-slate-800 text-sm">{fmt(viewingTransaction.creditApplied)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Additional Paid</span>
                  <p className="font-mono font-bold text-primary text-sm">{fmt(viewingTransaction.amountPaid)}</p>
                </div>
              </div>

              {/* Returned Items */}
              <div>
                <h4 className="font-bold text-slate-800 uppercase text-[11px] mb-2 flex items-center gap-1.5">
                  <FiRotateCcw className="text-amber-600" /> Returned Items
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                      <tr>
                        <th className="p-2">Product</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2 text-right">Price</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(viewingTransaction.returnSale?.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-medium text-slate-800">{it.product?.name || 'Item'}</td>
                          <td className="p-2 text-center font-bold text-amber-700">{it.quantity}</td>
                          <td className="p-2 text-right font-mono">{fmt(it.unitPrice)}</td>
                          <td className="p-2 text-right font-mono font-bold">{fmt(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Newly Purchased Items (if exchange) */}
              {viewingTransaction.newSale?.items && viewingTransaction.newSale.items.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 uppercase text-[11px] mb-2 flex items-center gap-1.5">
                    <FiShoppingBag className="text-emerald-600" /> Newly Purchased Products
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                        <tr>
                          <th className="p-2">Product</th>
                          <th className="p-2 text-center">Variant</th>
                          <th className="p-2 text-center">Qty</th>
                          <th className="p-2 text-right">Price</th>
                          <th className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingTransaction.newSale.items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-medium text-slate-800">{it.product?.name || 'Item'}</td>
                            <td className="p-2 text-center text-slate-500">{it.size || '-'}</td>
                            <td className="p-2 text-center font-bold text-emerald-700">{it.quantity}</td>
                            <td className="p-2 text-right font-mono">{fmt(it.unitPrice)}</td>
                            <td className="p-2 text-right font-mono font-bold">{fmt(it.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingTransaction(null)}
                className="btn btn-outline px-4 py-1.5 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN PRINT COMPONENT */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <ExchangeBill ref={printComponentRef} printData={lastPrintData} companyProfile={companyProfile} />
      </div>
    </div>
  );
}
