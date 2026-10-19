
import { useRouter } from 'next/router';
import { useState, useEffect, useRef, useMemo } from 'react';
import api from '@/lib/api';
import { FiSearch, FiUser, FiX, FiPlus, FiTrash2, FiCreditCard, FiMonitor, FiShoppingCart, FiClock, FiCalendar, FiEdit2, FiAlertCircle, FiTag, FiGift, FiLoader, FiCheckCircle } from 'react-icons/fi';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'react-toastify';
import { getTerminalId, checkTerminalAccess } from '@/lib/terminal';
import SearchableSelect from '@/components/SearchableSelect';
import DynamicInvoice from '@/components/DynamicInvoice';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';
import { CURRENCY_LIST, CURRENCY_SYMBOLS, getCurrencySymbol, normalizeCurrencySymbol } from '@/lib/currency';
export default function POS() {
    const router = useRouter();
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [editingSaleId, setEditingSaleId] = useState(null);
    const [loadingInvoice, setLoadingInvoice] = useState(false);

    // Parse user from localStorage safely at top level for UI use
    const [user, setUser] = useState(null);
    const [terminal, setTerminal] = useState(null);
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [assignedBranch, setAssignedBranch] = useState(null);
    const [branchSettings, setBranchSettings] = useState({ stockIncluded: true });

    useEffect(() => {
        const stored = localStorage.getItem('user');
        let currentUser = null;
        if (stored) {
            currentUser = JSON.parse(stored);
            setUser(currentUser);
            setCashier(currentUser);
            if (currentUser.branchId) {
                setSelectedBranch(currentUser.branchId);
            }
        }

        // Fetch terminal details
        checkTerminalAccess().then(res => {
            if (res.authorized && res.terminal) {
                setTerminal(res.terminal);
                if (currentUser?.role === 'admin' && !currentUser.branchId && res.terminal.branchId) {
                    setSelectedBranch(prev => prev || res.terminal.branchId);
                }
            }
        });
    }, []);


    // Fetch branches for Admin to populate selector
    useEffect(() => {
        if (user?.role === 'admin') {
            api.get('/branches').then(res => setBranches(res.data)).catch(console.error);
        }
    }, [user]);

    const [cart, setCart] = useState([]);
    const [search, setSearch] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [saleDate, setSaleDate] = useState(''); // Populated from active business date API
    const [businessDateLoading, setBusinessDateLoading] = useState(true);

    // Salesman Selection
    const [salesmanId, setSalesmanId] = useState('');
    const [availableSalesmen, setAvailableSalesmen] = useState([]);
const EXCHANGE_RATES = {
    INR: 1,
    AED: 1,
    EUR: 1,
    USD: 1
};
    // Customer Search
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const dropdownRef = useRef(null);

    // New Customer Modal
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', email: '', address: '' });

    // Payment Modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [sizeModalProduct, setSizeModalProduct] = useState(null); // For size selection popup
    const [paymentData, setPaymentData] = useState({ method: 'Cash', paidAmount: '', notes: '' });
    const [addedPayments, setAddedPayments] = useState([]); // For Split Payments
    const [lastSale, setLastSale] = useState(null); // Store last sale for printing

    // History Modal
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [salesHistory, setSalesHistory] = useState([]);
    const [selectedHistorySale, setSelectedHistorySale] = useState(null); // For detail view

    // Numpad Support
    const [activeInput, setActiveInput] = useState('search'); // 'search' or cartItemId
    const [salesSettings, setSalesSettings] = useState(null);
    const [returnSettings, setReturnSettings] = useState(null);
    const [companyProfile, setCompanyProfile] = useState(null);
    const [customerBalance, setCustomerBalance] = useState(0);
    const [availableAdvance, setAvailableAdvance] = useState(0);
    const [advanceRedeemed, setAdvanceRedeemed] = useState('');
    const [useFullAdvance, setUseFullAdvance] = useState(false);
    const [cashier, setCashier] = useState(null);
    const [sessionTime, setSessionTime] = useState('');
    const [saleDescription, setSaleDescription] = useState('');

    // Round Off State
    const [roundOff, setRoundOff] = useState(0);
    const [taxEnabled, setTaxEnabled] = useState(true);
    const [deliveryChargeEnabled, setDeliveryChargeEnabled] = useState(false);
    const [deliveryCharge, setDeliveryCharge] = useState('');
    const [currencyCode, setCurrencyCode] = useState('INR');
    const [currencySymbol, setCurrencySymbol] = useState('₹');
    const [exchangeRate, setExchangeRate] = useState(1);

    // Promotional Voucher State
    const [voucherInput, setVoucherInput] = useState('');
    const [appliedVoucher, setAppliedVoucher] = useState(null);
    const [validatingVoucher, setValidatingVoucher] = useState(false);

    // Fetch the authoritative active business date from Day Close API
    const fetchBusinessDate = async (branchId) => {
        try {
            setBusinessDateLoading(true);
            const params = branchId ? { branchId } : {};
            const res = await api.get('/day-close/status', { params });
            if (res.data && res.data.activeDate) {
                setSaleDate(res.data.activeDate);
            } else if (res.data && res.data.currentDate) {
                setSaleDate(res.data.currentDate);
            } else {
                // Fallback: use today only if API fails to return a date
                const today = new Date();
                const y = today.getFullYear();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const d = String(today.getDate()).padStart(2, '0');
                setSaleDate(`${y}-${m}-${d}`);
            }
        } catch (err) {
            console.error('Failed to fetch active business date:', err);
            // Fallback on error
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            setSaleDate(`${y}-${m}-${d}`);
        } finally {
            setBusinessDateLoading(false);
        }
    };

    // Restore POS state on mount or when user changes
    useEffect(() => {
        if (user?.id) {
            const activeBranchId = user.branchId || selectedBranch || null;
            const storedPosState = localStorage.getItem(`pos_state_${user.id}`);
            if (storedPosState) {
                try {
                    const parsed = JSON.parse(storedPosState);
                    setCart(parsed.cart || []);
                    setCustomerId(parsed.customerId || '');
                    setCustomerName(parsed.customerName || '');
                    setSalesmanId(parsed.salesmanId || '');
                    setRoundOff(parsed.roundOff || 0);
                    setTaxEnabled(parsed.taxEnabled !== undefined ? parsed.taxEnabled : true);
                    setDeliveryChargeEnabled(Boolean(parsed.deliveryChargeEnabled));
                    setDeliveryCharge(parsed.deliveryCharge || '');
                    const restoredCode = parsed.currencyCode || 'INR';
                    setCurrencyCode(restoredCode);
                    setCurrencySymbol(normalizeCurrencySymbol(parsed.currencySymbol || CURRENCY_SYMBOLS[restoredCode], restoredCode));
                    setExchangeRate(1);
                    setSaleDescription(parsed.saleDescription || '');
                    if (parsed.appliedVoucher) {
                        setAppliedVoucher(parsed.appliedVoucher);
                    }
                } catch (e) {
                    console.error('Failed to restore POS state:', e);
                }
            }
            // Always fetch the authoritative business date from the server
            fetchBusinessDate(activeBranchId);
        }
    }, [user?.id]);

    // Save POS state whenever it changes
    useEffect(() => {
        if (user?.id) {
            const stateToStore = {
                cart,
                customerId,
                customerName,
                salesmanId,
                saleDate,
                roundOff,
                taxEnabled,
                deliveryChargeEnabled,
                deliveryCharge,
                currencyCode,
                currencySymbol,
                exchangeRate,
                advanceRedeemed,
                saleDescription,
                appliedVoucher
            };
            localStorage.setItem(`pos_state_${user.id}`, JSON.stringify(stateToStore));
        }
    }, [cart, customerId, customerName, salesmanId, saleDate, roundOff, taxEnabled, deliveryChargeEnabled, deliveryCharge, advanceRedeemed, appliedVoucher, user?.id]);

    // Calculations
    const calcResults = useMemo(() => {
        const lineAllocations = appliedVoucher?.lineAllocations || {};
        let totalCatalogPrice = 0;
        let totalProductDiscount = 0;

        const results = cart.reduce((acc, item, idx) => {
            const effectivePrice = parseFloat(item.price || 0);
            const origPrice = item.originalPrice !== undefined ? parseFloat(item.originalPrice) : effectivePrice;
            const qty = parseFloat(item.quantity || 0);
            const effectiveDisc = parseFloat(item.discountAmount || 0);

            totalCatalogPrice += (origPrice * qty);
            totalProductDiscount += (effectiveDisc * qty);

            const rate = taxEnabled ? parseFloat(item.taxRate || 0) : 0;
            const isInc = item.isTaxInclusive === true;

            // Net Price before voucher = Price - Discount
            const netPricePerUnit = Math.max(0, effectivePrice - effectiveDisc);
            const linePayableBeforeVoucher = qty * netPricePerUnit;
            const vAlloc = parseFloat(lineAllocations[idx] || 0);
            const lineTotalPayable = Math.max(0, linePayableBeforeVoucher - vAlloc);

            let lineTax = 0;
            let lineSubTotal = 0; // Exclusive of tax (taxable base)

            if (isInc && rate > 0) {
                const baseAmount = lineTotalPayable / (1 + (rate / 100));
                lineTax = lineTotalPayable - baseAmount;
                lineSubTotal = baseAmount;
            } else if (rate > 0) {
                lineSubTotal = lineTotalPayable;
                lineTax = (lineTotalPayable * rate) / 100;
            } else {
                lineSubTotal = lineTotalPayable;
                lineTax = 0;
            }

            return {
                subTotal: acc.subTotal + lineSubTotal,
                tax: acc.tax + lineTax
            };
        }, { subTotal: 0, tax: 0 });

        const voucherDiscount = appliedVoucher ? parseFloat(appliedVoucher.finalVoucherDiscount || 0) : 0;

        return {
            subTotal: results.subTotal,
            tax: results.tax,
            totalCatalogPrice,
            totalProductDiscount,
            voucherDiscount,
            totalBeforeVoucher: Math.max(0, totalCatalogPrice - totalProductDiscount)
        };
    }, [cart, taxEnabled, appliedVoucher]);

    useEffect(() => {
        if (customerId) {
            api.get(`/advances/customer/${customerId}`)
                .then(res => setAvailableAdvance(res.data.availableAdvance || 0))
                .catch(console.error);
        } else {
            setAvailableAdvance(0);
            setAdvanceRedeemed('');
            setUseFullAdvance(false);
        }
    }, [customerId]);

    // Auto-fill advance if toggle is ON
    useEffect(() => {
        if (useFullAdvance && availableAdvance > 0) {
            const effectiveDelivery = deliveryChargeEnabled ? (parseFloat(deliveryCharge) || 0) : 0;
            const payableBeforeAdvance = (calcResults.subTotal + calcResults.tax + effectiveDelivery + parseFloat(roundOff || 0));
            const toRedeem = Math.min(availableAdvance, payableBeforeAdvance);
            setAdvanceRedeemed(toRedeem.toFixed(2));
        } else if (useFullAdvance && availableAdvance === 0) {
            setAdvanceRedeemed('');
            setUseFullAdvance(false);
        }
    }, [useFullAdvance, availableAdvance, calcResults.subTotal, calcResults.tax, roundOff, deliveryChargeEnabled, deliveryCharge]);

    const fetchData = async () => {
        try {
            const activeBranchId = (user?.role === 'admin' && !user?.branchId) ? selectedBranch : (user?.branchId || selectedBranch);
            const [prodRes, custRes, compRes, userRes, branchRes, brandRes] = await Promise.all([
                api.get('/products', { params: { branchId: activeBranchId } }),
                api.get('/customers'),
                api.get('/company'),
                api.get('/users'),
                activeBranchId ? api.get(`/branches/${activeBranchId}`) : Promise.resolve({ data: null }),
                api.get('/brands').catch(() => ({ data: [] }))
            ]);
            setProducts(prodRes.data);
            setCustomers(custRes.data);
            setBrands(brandRes.data || []);
            if (branchRes.data) {
                setAssignedBranch(branchRes.data);
                // Robust check for stockIncluded
                const isStockEnabled = branchRes.data.stockIncluded !== false &&
                                       branchRes.data.stockIncluded !== 'false' &&
                                       branchRes.data.stockIncluded !== 0 &&
                                       branchRes.data.stockIncluded !== '0';
                setBranchSettings({ stockIncluded: isStockEnabled });

                const bCode = branchRes.data.currencyCode || 'INR';
                const bSymbol = normalizeCurrencySymbol(branchRes.data.currencySymbol, bCode);
                setCurrencyCode(bCode);
                setCurrencySymbol(bSymbol);

                if (user && !user.branchName && branchRes.data.name) {
                    const updatedUser = { ...user, branchName: branchRes.data.name };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    setUser(updatedUser);
                }
            } else {
                setAssignedBranch(null);
            }


            // Filter salesmen: match branchId or global (no branch)
            const branchUsers = userRes.data.filter(u => !u.branchId || u.branchId === activeBranchId);
            setAvailableSalesmen(branchUsers);
            if (compRes.data) {
                setCompanyProfile(compRes.data);
            }

            // Fetch Dedicated Invoice Settings (New System)
            try {
                const [salesRes, returnRes] = await Promise.all([
                    api.get('/invoice-settings', { params: { type: 'sales' } }),
                    api.get('/invoice-settings', { params: { type: 'return' } })
                ]);
                if (salesRes.data?.settings) setSalesSettings(salesRes.data.settings);
                if (returnRes.data?.settings) setReturnSettings(returnRes.data.settings);
            } catch (err) {
                console.error('Failed to load professional invoice settings', err);
            }

        } catch (err) {
            console.error(err);
            toast.error('Failed to fetch initial data');
        }
    };

    // --- STRICT EDIT MODE TRIGGER ---
    useEffect(() => {
        if (router.isReady) {
            const { editId } = router.query;
            if (editId) {
                // Only load if it's a new ID or we're not currently editing
                if (editingSaleId !== parseInt(editId)) {
                    loadInvoiceForEdit(editId, products);
                }
            } else {
                // If editId is not in the URL, explicitly exit edit mode
                setEditingSaleId(null);
            }
        }
    }, [router.isReady, router.query.editId]);

    const loadInvoiceForEdit = async (id, currentProducts) => {
        try {
            setLoadingInvoice(true);
            const { data } = await api.get(`/sales?isInvoice=true`);
            let invoice = data.find(inv => inv.id === parseInt(id));
            if (!invoice) {
                const allSalesRes = await api.get('/sales');
                invoice = allSalesRes.data.find(inv => inv.id === parseInt(id));
            }

            if (!invoice) {
                toast.error('Invoice to edit not found');
                return;
            }

            setEditingSaleId(invoice.id);
            if (invoice.branchId) {
                setSelectedBranch(invoice.branchId);
            }
            setCustomerId(invoice.customerId || '');
            setCustomerName(invoice.customerName || 'Walk-in Customer');
            setSalesmanId(invoice.salesmanId || '');
            setSaleDate(new Date(invoice.saleDate).toISOString().split('T')[0]);
            const invCode = invoice.currencyCode || 'INR';
            setCurrencyCode(invCode);
            setCurrencySymbol(normalizeCurrencySymbol(invoice.currencySymbol || CURRENCY_SYMBOLS[invCode], invCode));
            setExchangeRate(1);
            setSaleDescription(invoice.description || '');
            setTaxEnabled(parseFloat(invoice.taxAmount || 0) > 0);
            const hasDelivery = Boolean(invoice.hasDeliveryCharge || parseFloat(invoice.deliveryCharge || 0) > 0);
            setDeliveryChargeEnabled(hasDelivery);
            setDeliveryCharge(hasDelivery ? parseFloat(invoice.deliveryCharge || 0).toFixed(2) : '');

            // Set other transaction values without exchange rate conversion
            setRoundOff(parseFloat(invoice.roundOffAmount || 0).toFixed(2));
            setAdvanceRedeemed(parseFloat(invoice.advanceUsed || 0).toFixed(2));
            setAddedPayments([]);
            setPaymentData({ method: 'Cash', paidAmount: '0.00' });

            // Map items to cart
            const restoredCart = invoice.items.map(item => {
                const product = (currentProducts || products).find(p => p.id === item.productId);
                const selectedSize = item.size || null;
                const cartKey = `${item.productId}_${selectedSize || 'nosize'}`;
                return {
                    ...(product || item.product),
                    cartItemId: cartKey,
                    id: item.productId,
                    name: item.product?.name || 'Unknown Product',
                    productTypeName: item.product?.productTypeName || item.product?.productType?.name || '',
                    selectedSize,
                    size: selectedSize,
                    price: parseFloat(item.unitPrice || 0),
                    quantity: item.quantity,
                    discountPercent: item.discountPercent || 0,
                    discountAmount: parseFloat(item.discountAmount || 0),
                    taxRate: parseFloat(item.taxRate || 0),
                    taxPercent: parseFloat(item.taxRate || 0),
                    isTaxInclusive: item.isTaxInclusive === true || item.isTaxInclusive === 'true',
                    isPriceOverridden: true // CRITICAL: Prevent Master Product Sync from resetting this
                };
            });

            setCart(restoredCart);
            // toast.info removed to prevent redundant alerts after sale
        } catch (error) {
            console.error('Error loading invoice:', error);
            toast.error('Failed to load invoice for editing');
        } finally {
            setLoadingInvoice(false);
        }
    };

    // Fetch Data
    useEffect(() => {
        // Session time update
        setSessionTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        if (user) {
            fetchData();
        }
    }, [user?.branchId, selectedBranch]);

    // --- CART SYNC EFFECT ---
    useEffect(() => {
        if (products.length > 0 && cart.length > 0) {
            let hasChanges = false;

            const updatedCart = cart.map(cartItem => {
                const freshProd = products.find(p => p.id === cartItem.id);
                if (freshProd) {
                    const freshPrice = Number(freshProd.price);
                    const freshTaxRate = parseFloat(freshProd.taxRate || 0);
                    const freshTaxPercent = parseFloat(freshProd.taxPercent || freshProd.taxRate || 0);
                    const freshIsInclusive = freshProd.isTaxInclusive === true || freshProd.isTaxInclusive === 'true';

                    const isPriceDiff = !cartItem.isPriceOverridden && Number(cartItem.price) !== freshPrice;
                    const isTaxDiff = !cartItem.isPriceOverridden && (parseFloat(cartItem.taxRate || 0) !== freshTaxRate || parseFloat(cartItem.taxPercent || 0) !== freshTaxPercent);
                    const isIncDiff = !cartItem.isPriceOverridden && (cartItem.isTaxInclusive !== freshIsInclusive);

                    if (isPriceDiff || isTaxDiff || isIncDiff) {
                        hasChanges = true;
                        return {
                            ...cartItem,
                            price: isPriceDiff ? freshPrice : cartItem.price,
                            taxRate: freshTaxRate,
                            taxPercent: freshTaxPercent,
                            isTaxInclusive: freshIsInclusive,
                            name: freshProd.name
                        };
                    }
                }
                return cartItem;
            });

            if (hasChanges) {
                console.log("Syncing cart with fresh product data...");
                setCart(updatedCart);
                toast.info("Cart prices updated to latest values");
            }
        }
    }, [products, cart]);


    // Update Invoice Settings and Stock Settings when Branch Changes
    useEffect(() => {
        const updateSettings = async () => {
            const activeBranchId = (user?.role === 'admin' && !user?.branchId) ? selectedBranch : (user?.branchId || selectedBranch);
            if (activeBranchId) {
                try {
                    const { data } = await api.get(`/branches/${activeBranchId}`);
                    const isStockEnabled = data?.stockIncluded !== false &&
                                           data?.stockIncluded !== 'false' &&
                                           data?.stockIncluded !== 0 &&
                                           data?.stockIncluded !== '0';
                    setBranchSettings({
                        stockIncluded: isStockEnabled
                    });
                    if (companyProfile?.invoiceSettings && Object.keys(companyProfile.invoiceSettings).length > 0) {
                        setSalesSettings(prev => ({
                            ...(prev || {}),
                            ...companyProfile.invoiceSettings
                        }));
                    }
                } catch (err) {
                    console.error("Failed to fetch branch settings", err);
                }
            } else if (companyProfile?.invoiceSettings && Object.keys(companyProfile.invoiceSettings).length > 0) {
                setSalesSettings(prev => ({
                    ...(prev || {}),
                    ...companyProfile.invoiceSettings
                }));
            }
        };

        if (companyProfile && (selectedBranch || user?.branchId)) {
            updateSettings();
        }
    }, [selectedBranch, companyProfile, user?.branchId]);

    // Fetch Customer Balance when customerId changes
    useEffect(() => {
        const fetchBalance = async () => {
            if (customerId) {
                try {
                    const { data } = await api.get(`/customers/${customerId}/balance`);
                    setCustomerBalance(parseFloat(data.balance || 0));
                } catch (err) {
                    console.error(err);
                }
            } else {
                setCustomerBalance(0);
            }
        };
        fetchBalance();
    }, [customerId]);

    // ... (useEffect for dropdown click outside - lines 50-61, unchanged)

    // Group products by (Product Name + Product Type)
    // Conceptually:
    // - Same Product Name + Same Product Type -> ONE card (consolidating size variants)
    // - Same Product Name + Different Product Type -> DIFFERENT cards
    // - Products without type or sizes -> preserved cleanly
    const groupedProducts = useMemo(() => {
        const groups = new Map();

        products.forEach(p => {
            if (p.isActive === false) return;

            const rawName = (p.name || '').trim();
            const typeId = (p.productTypeId || p.productType?.id) ? String(p.productTypeId || p.productType?.id) : null;
            const typeName = (p.productTypeName || p.productType?.name || '').trim();

            let bPrices = p.brandPrices;
            if (typeof bPrices === 'string') {
                try { bPrices = JSON.parse(bPrices); } catch(e) { bPrices = null; }
            }

            const activeBrandEntries = (bPrices && typeof bPrices === 'object')
                ? Object.entries(bPrices).filter(([bIdKey, b]) => b && !b.isDeleted)
                : [];

            if (activeBrandEntries.length > 0) {
                activeBrandEntries.forEach(([bIdKey, bEntry]) => {
                    const brandId = bEntry.brandId ? parseInt(bEntry.brandId, 10) : (bIdKey && !isNaN(parseInt(bIdKey, 10)) ? parseInt(bIdKey, 10) : (p.brandId || null));
                    const matchedBrand = brands.find(b => String(b.id) === String(brandId));
                    const brandName = bEntry.brandName || matchedBrand?.name || (p.brand?.id === brandId ? p.brand?.name : '') || (p.brandId === brandId ? p.brandName : '') || p.brandName || '';
                    const groupKey = `prod_${p.id}___brand_${brandId || bIdKey || 'nobrand'}___type_${typeId || typeName || 'none'}`;

                    let bSizeStocks = bEntry.sizeStocks;
                    if (typeof bSizeStocks === 'string') {
                        try { bSizeStocks = JSON.parse(bSizeStocks); } catch(e) { bSizeStocks = null; }
                    }

                    if (!Array.isArray(bSizeStocks)) {
                        let pSizeStocks = p.sizeStocks;
                        if (typeof pSizeStocks === 'string') {
                            try { pSizeStocks = JSON.parse(pSizeStocks); } catch (e) { pSizeStocks = null; }
                        }
                        if (Array.isArray(pSizeStocks) && pSizeStocks.length > 0) {
                            bSizeStocks = pSizeStocks;
                        }
                    }

                    const brandBarcode = bEntry.barcode ? String(bEntry.barcode).trim() : (p.brand?.id === brandId && p.brand?.barcode ? String(p.brand.barcode).trim() : null);
                    const productBarcode = p.barcode ? String(p.barcode).trim() : null;
                    const primaryBarcode = brandBarcode || productBarcode;

                    const sizeMap = new Map();
                    if (Array.isArray(bSizeStocks) && bSizeStocks.length > 0) {
                        bSizeStocks.forEach(item => {
                            const sName = String(item.size || '').trim();
                            if (!sName) return;
                            sizeMap.set(sName, {
                                size: sName,
                                stock: parseInt(item.stock, 10) || 0,
                                productId: p.id,
                                barcode: item.barcode ? String(item.barcode).trim() : primaryBarcode,
                                brandId: brandId,
                                brandName: brandName
                            });
                        });
                    }

                    const variants = Array.from(sizeMap.values());
                    const hasSizes = variants.length > 0;
                    const totalStock = hasSizes
                        ? variants.reduce((sum, v) => sum + v.stock, 0)
                        : (parseInt(p.stock, 10) || 0);

                    groups.set(groupKey, {
                        groupKey,
                        id: p.id,
                        name: brandName ? `${rawName} (${brandName})` : rawName,
                        baseName: rawName,
                        brandId: brandId,
                        brandName: brandName,
                        productTypeId: p.productTypeId,
                        productTypeName: typeName || null,
                        gender: p.gender || (p.productType?.genders && p.productType.genders[0]) || null,
                        price: parseFloat(bEntry.price || p.price || 0),
                        imageUrl: p.imageUrl,
                        barcode: primaryBarcode,
                        brandBarcode: brandBarcode,
                        productBarcode: productBarcode,
                        hasBarcode: !!primaryBarcode,
                        taxRate: p.taxRate,
                        taxPercent: p.taxPercent,
                        isTaxInclusive: p.isTaxInclusive,
                        minDiscount: p.minDiscount,
                        maxDiscount: p.maxDiscount,
                        sizeMap,
                        variants,
                        hasSizes,
                        stock: totalStock,
                        totalStock
                    });
                });
            } else {
                const normName = rawName.toLowerCase();
                let groupKey = `prod_${p.id}___nobrand___type_${typeId || typeName || 'none'}`;

                const brandName = p.brandName || p.brand?.name || (brands.find(b => String(b.id) === String(p.brandId))?.name) || '';
                const brandBarcode = p.brand?.barcode ? String(p.brand.barcode).trim() : null;
                const productBarcode = p.barcode ? String(p.barcode).trim() : null;
                const primaryBarcode = productBarcode || brandBarcode;

                let sizeMap = new Map();
                let pSizeStocks = p.sizeStocks;
                if (typeof pSizeStocks === 'string') {
                    try { pSizeStocks = JSON.parse(pSizeStocks); } catch (e) { pSizeStocks = null; }
                }

                if (Array.isArray(pSizeStocks) && pSizeStocks.length > 0) {
                    pSizeStocks.forEach(item => {
                        const sName = (item.size || '').trim();
                        if (!sName) return;
                        sizeMap.set(sName, {
                            size: sName,
                            stock: parseInt(item.stock, 10) || 0,
                            productId: p.id,
                            barcode: item.barcode ? String(item.barcode).trim() : primaryBarcode,
                            brandId: p.brandId || null,
                            brandName: brandName
                        });
                    });
                }

                const variants = Array.from(sizeMap.values());
                const hasSizes = variants.length > 0;
                const totalStock = hasSizes
                    ? variants.reduce((sum, v) => sum + v.stock, 0)
                    : (parseInt(p.stock, 10) || 0);

                groups.set(groupKey, {
                    groupKey,
                    id: p.id,
                    name: brandName ? `${rawName} (${brandName})` : rawName,
                    baseName: rawName,
                    brandId: p.brandId || null,
                    brandName: brandName,
                    productTypeId: p.productTypeId,
                    productTypeName: typeName || null,
                    gender: p.gender,
                    price: parseFloat(p.price || 0),
                    imageUrl: p.imageUrl,
                    barcode: primaryBarcode,
                    brandBarcode: brandBarcode,
                    productBarcode: productBarcode,
                    hasBarcode: !!primaryBarcode,
                    taxRate: p.taxRate,
                    taxPercent: p.taxPercent,
                    isTaxInclusive: p.isTaxInclusive,
                    minDiscount: p.minDiscount,
                    maxDiscount: p.maxDiscount,
                    sizeMap,
                    variants,
                    hasSizes,
                    stock: totalStock,
                    totalStock
                });
            }
        });

        return Array.from(groups.values());
    }, [products, brands]);

    const handleProductCardClick = (product) => {
        if (!customerId) {
            toast.error('Please select a customer first');
            return;
        }

        if (product.hasSizes && product.variants && product.variants.length > 0) {
            const hasSaleableVariant = product.variants.some(v => (parseInt(v.stock, 10) || 0) > 0);
            if (!hasSaleableVariant || (parseInt(product.stock, 10) || 0) <= 0) {
                toast.error(`"${product.name}" is completely out of stock.`);
                return;
            }
            // Open size selection modal
            setSizeModalProduct(product);
        } else {
            // Sizeless product: directly add to cart using existing logic!
            const isStockEnabled = branchSettings.stockIncluded !== false && branchSettings.stockIncluded !== 'false';
            if (isStockEnabled && (parseInt(product.stock, 10) || 0) <= 0) {
                toast.error(`"${product.name}" is out of stock in your branch.`);
                return;
            }
            addToCart(product, null);
        }
    };

    const handleScan = (e) => {
        if (e.key === 'Enter') {
            const rawQuery = search;
            const query = rawQuery.trim().toLowerCase();
            if (!query) return;

            if (!customerId) {
                toast.error('Please select a customer first');
                return;
            }

            const foundGroup = groupedProducts.find(p => {
                const bCode = p.barcode ? String(p.barcode).trim().toLowerCase() : '';
                const brandCode = p.brandBarcode ? String(p.brandBarcode).trim().toLowerCase() : '';
                const prodCode = p.productBarcode ? String(p.productBarcode).trim().toLowerCase() : '';
                const pName = p.name ? p.name.toLowerCase() : '';
                const baseName = p.baseName ? p.baseName.toLowerCase() : '';

                if (bCode === query || brandCode === query || prodCode === query || pName === query || baseName === query) {
                    return true;
                }

                if (p.variants && p.variants.length > 0) {
                    return p.variants.some(v => v.barcode && String(v.barcode).trim().toLowerCase() === query);
                }

                return false;
            });

            if (foundGroup) {
                const matchedVariant = foundGroup.variants?.find(v =>
                    v.barcode && String(v.barcode).trim().toLowerCase() === query &&
                    String(v.barcode).trim().toLowerCase() !== String(foundGroup.barcode || '').trim().toLowerCase()
                );

                if (matchedVariant) {
                    if ((parseInt(matchedVariant.stock, 10) || 0) <= 0) {
                        toast.error(`"${foundGroup.name}" (${matchedVariant.size}) is out of stock (Stock: 0)`);
                        setSearch('');
                        return;
                    }
                    addToCart(foundGroup, matchedVariant.size);
                } else if (foundGroup.hasSizes && foundGroup.variants && foundGroup.variants.length > 0) {
                    if (foundGroup.variants.length === 1) {
                        const singleVar = foundGroup.variants[0];
                        if ((parseInt(singleVar.stock, 10) || 0) <= 0) {
                            toast.error(`"${foundGroup.name}" (${singleVar.size}) is out of stock (Stock: 0)`);
                            setSearch('');
                            return;
                        }
                        addToCart(foundGroup, singleVar.size);
                    } else {
                        handleProductCardClick(foundGroup);
                    }
                } else {
                    const isStockEnabled = branchSettings.stockIncluded !== false && branchSettings.stockIncluded !== 'false';
                    if (isStockEnabled && (parseInt(foundGroup.stock, 10) || 0) <= 0) {
                        toast.error(`"${foundGroup.name}" is out of stock in your branch.`);
                        setSearch('');
                        return;
                    }
                    addToCart(foundGroup, null);
                }
                setSearch('');
            } else {
                toast.error(`No product found with barcode or name "${rawQuery.trim()}"`);
            }
        }
    };

    const addToCart = (product, selectedSize = null) => {
        if (!customerId) {
            toast.error('Please select a customer first');
            return;
        }
        const isStockEnabled = branchSettings.stockIncluded !== false && branchSettings.stockIncluded !== 'false';

        // Determine stock for variant or product
        let availableStock = parseInt(product.stock, 10) || 0;
        let representativeProductId = product.id;

        if (selectedSize && product.variants && product.variants.length > 0) {
            const v = product.variants.find(item => item.size === selectedSize);
            if (v) {
                availableStock = parseInt(v.stock, 10) || 0;
                if (v.productId) representativeProductId = v.productId;
            }
        }

        // ZERO STOCK MUST NOT BE SALEABLE: If selectedSize has 0 stock, reject unconditionally
        if (selectedSize && availableStock <= 0) {
            toast.error(`Size "${selectedSize}" is out of stock (Stock: 0) and cannot be sold.`);
            return;
        }

        if (!selectedSize && isStockEnabled && availableStock <= 0) {
            toast.error('Out of stock in your branch');
            return;
        }

        const cartKey = `${representativeProductId}_${product.brandId || 'nobrand'}_${selectedSize || 'nosize'}`;
        const existing = cart.find(item => (item.cartItemId || `${item.id}_${item.brandId || 'nobrand'}_${item.selectedSize || 'nosize'}`) === cartKey);

        if (existing && isStockEnabled && (existing.quantity + 1) > availableStock) {
            toast.error(`Only ${availableStock} units available in stock`);
            return;
        }

        const freshPrice = Number(product.price);
        const freshTaxRate = parseFloat(product.taxRate || 0);
        const freshIsInclusive = product.isTaxInclusive === true || product.isTaxInclusive === 'true';

        if (existing) {
            setCart(cart.map(item => ((item.cartItemId || `${item.id}_${item.brandId || 'nobrand'}_${item.selectedSize || 'nosize'}`) === cartKey) ? {
                ...item,
                quantity: item.quantity + 1,
                originalPrice: item.originalPrice !== undefined ? item.originalPrice : freshPrice,
                price: item.isPriceOverridden ? item.price : freshPrice,
                taxRate: freshTaxRate,
                isTaxInclusive: freshIsInclusive,
                isPriceOverridden: item.isPriceOverridden || false
            } : item));
        } else {
            setCart([...cart, {
                ...product,
                cartItemId: cartKey,
                id: representativeProductId,
                brandId: product.brandId || null,
                brandName: product.brandName || null,
                name: product.name,
                productTypeName: product.productTypeName || product.productType?.name || '',
                selectedSize: selectedSize || null,
                size: selectedSize || product.size || null,
                stock: availableStock,
                originalPrice: freshPrice,
                price: freshPrice,
                isPriceOverridden: false,
                quantity: 1,
                discountPercent: 0,
                discountAmount: 0,
                taxRate: freshTaxRate,
                taxPercent: freshTaxRate,
                isTaxInclusive: freshIsInclusive
            }]);
        }
    };

    const updateQuantity = (cartKey, newQty) => {
        if (newQty < 1) return;
        const item = cart.find(i => (i.cartItemId || `${i.id}_${i.selectedSize || 'nosize'}`) === cartKey);
        if (!item) return;

        // Zero-stock variant check: variant with stock <= 0 cannot have quantity increased (skip if editing an existing invoice)
        const isEditingSale = Boolean(editingSaleId || (router.isReady && router.query?.editId));
        if (!isEditingSale && item.selectedSize && (parseInt(item.stock, 10) || 0) <= 0) {
            toast.error(`Size "${item.selectedSize}" has 0 stock and cannot be sold.`);
            return;
        }

        const isStockEnabled = branchSettings.stockIncluded !== false && branchSettings.stockIncluded !== 'false';

        // Only block if stockIncluded is ON
        if (isStockEnabled && newQty > item.stock) {
            toast.error(`Only ${item.stock} units available in stock`);
            return;
        }
        setCart(cart.map(item => (item.cartItemId || `${item.id}_${item.selectedSize || 'nosize'}`) === cartKey ? { ...item, quantity: newQty } : item));
    };

    const updatePrice = (cartKey, newPrice) => {
        setCart(cart.map(item => (item.cartItemId || `${item.id}_${item.selectedSize || 'nosize'}`) === cartKey ? {
            ...item,
            price: parseFloat(newPrice) || 0,
            isPriceOverridden: true
        } : item));
    };

    const updateDiscount = (cartKey, type, value) => {
        setCart(cart.map(item => {
            if ((item.cartItemId || `${item.id}_${item.selectedSize || 'nosize'}`) === cartKey) {
                let newPercent = item.discountPercent;
                let newAmount = item.discountAmount;

                if (type === 'percent') {
                    newPercent = parseFloat(value) || 0;
                    newAmount = (item.price * newPercent) / 100;
                    newAmount = parseFloat(newAmount.toFixed(2));
                } else if (type === 'amount') {
                    newAmount = parseFloat(value) || 0;
                    newPercent = (newAmount / item.price) * 100;
                    newPercent = parseFloat(newPercent.toFixed(2));
                }

                return { ...item, discountPercent: newPercent, discountAmount: newAmount };
            }
            return item;
        }));
    };

    const removeFromCart = (cartKey) => setCart(cart.filter(item => (item.cartItemId || `${item.id}_${item.selectedSize || 'nosize'}`) !== cartKey));

    // Numpad Input Handler
    const handleNumpadInput = (value) => {
        if (activeInput === 'search') {
            if (value === 'BACK') setSearch(prev => prev.slice(0, -1));
            else if (value === 'CLEAR') setSearch('');
            else setSearch(prev => prev + value);
        }
    };

    // Promotional Voucher Application & Revalidation
    const handleApplyVoucher = async () => {
        if (!voucherInput.trim()) {
            toast.error('Please enter a voucher code');
            return;
        }
        if (cart.length === 0) {
            toast.error('Please add products to cart first');
            return;
        }
        setValidatingVoucher(true);
        try {
            const activeBranchId = (user?.role === 'admin' && !user?.branchId) ? selectedBranch : (user?.branchId || selectedBranch);
            const res = await api.post('/customer-vouchers/validate', {
                code: voucherInput.trim(),
                customerId: customerId ? parseInt(customerId) : null,
                branchId: activeBranchId ? parseInt(activeBranchId) : null,
                items: cart.map(item => ({
                    productId: item.id,
                    price: parseFloat(item.price || 0),
                    unitPrice: parseFloat(item.price || 0),
                    quantity: parseFloat(item.quantity || 1),
                    discountAmount: parseFloat(item.discountAmount || 0)
                }))
            });

            if (res.data && res.data.valid) {
                setAppliedVoucher(res.data);
                toast.success(`Voucher "${res.data.voucher.code}" applied! Saved ${currencySymbol}${res.data.finalVoucherDiscount.toFixed(2)}`);
                setVoucherInput('');
            }
        } catch (err) {
            console.error('Voucher validation error:', err);
            toast.error(err.response?.data?.message || 'Invalid or inapplicable voucher');
        } finally {
            setValidatingVoucher(false);
        }
    };

    const handleRemoveVoucher = () => {
        setAppliedVoucher(null);
        toast.info('Voucher removed');
    };

    // Auto-revalidate voucher whenever cart or customer changes
    useEffect(() => {
        if (!appliedVoucher?.voucher?.code) return;
        if (cart.length === 0) {
            setAppliedVoucher(null);
            return;
        }
        const activeBranchId = (user?.role === 'admin' && !user?.branchId) ? selectedBranch : (user?.branchId || selectedBranch);
        api.post('/customer-vouchers/validate', {
            code: appliedVoucher.voucher.code,
            customerId: customerId ? parseInt(customerId) : null,
            branchId: activeBranchId ? parseInt(activeBranchId) : null,
            items: cart.map(item => ({
                productId: item.id,
                price: parseFloat(item.price || 0),
                unitPrice: parseFloat(item.price || 0),
                quantity: parseFloat(item.quantity || 1),
                discountAmount: parseFloat(item.discountAmount || 0)
            }))
        }).then(res => {
            if (res.data && res.data.valid) {
                setAppliedVoucher(res.data);
            } else {
                toast.warn(`Voucher removed: ${res.data?.message || 'Cart criteria not met'}`);
                setAppliedVoucher(null);
            }
        }).catch(err => {
            toast.warn(`Voucher removed: ${err.response?.data?.message || 'Cart criteria not met'}`);
            setAppliedVoucher(null);
        });
    }, [cart, customerId]);

    // Calculations Unpacking
    const { subTotal, tax, totalCatalogPrice, totalProductDiscount, voucherDiscount, totalBeforeVoucher } = calcResults;
    const effectiveDelivery = deliveryChargeEnabled ? (parseFloat(deliveryCharge) || 0) : 0;
    const totalBeforeRound = subTotal + tax + effectiveDelivery;
    const redeemedAmount = parseFloat(advanceRedeemed || 0);
    // 'total' is now the Gross Bill Amount (Sub + Tax + Delivery + RoundOff)
    const total = totalBeforeRound + parseFloat(roundOff || 0);
    // 'finalPayable' is what the customer actually pays now
    const finalPayable = Math.max(0, total - redeemedAmount);
    // Use the state currencySymbol instead of redeclaring

    const handleDeliveryChargeChange = (val) => {
        if (val === '') {
            setDeliveryCharge('');
            return;
        }
        const num = parseFloat(val);
        if (isNaN(num)) return;
        if (num < 0) {
            toast.error("Delivery charge cannot be negative");
            return;
        }
        if (num > 10000000) {
            toast.error("Delivery charge is too high");
            return;
        }
        const parts = val.split('.');
        if (parts.length === 2 && parts[1].length > 2) {
            setDeliveryCharge(`${parts[0]}.${parts[1].slice(0, 2)}`);
            return;
        }
        setDeliveryCharge(val);
    };

    // Auto Round Function
    const handleAutoRound = () => {
        const rounded = Math.round(totalBeforeRound);
        const diff = rounded - totalBeforeRound;
        setRoundOff(diff.toFixed(2));
    };

    // Manual Total Change -> Recalculate Items (Reverse Tax Calc)
    const handleTotalChange = (newTotalStr) => {
        // Allow decimal point while typing
        if (newTotalStr.endsWith('.')) return;

        const matchTotal = parseFloat(newTotalStr);
        if (isNaN(matchTotal)) return;

        // If cart is empty, do nothing
        if (cart.length === 0) return;

        // Calculate Ratio
        if (matchTotal <= 0) return;

        // Calculate current potential items total without round off and delivery
        const currentItemsTotal = subTotal + tax;
        const targetItemsTotal = matchTotal - effectiveDelivery;

        if (currentItemsTotal <= 0 || targetItemsTotal <= 0) return;

        const ratio = targetItemsTotal / currentItemsTotal;

        // Apply this ratio to the PRICE of items (effectively increasing discount)
        // NewNetPrice = OldNetPrice * ratio
        // DiscountAmount = Price - NewNetPrice

        const newCart = cart.map(item => {
            const effPrice = parseFloat(item.price || 0);
            const effDisc = parseFloat(item.discountAmount || 0);

            const currentNet = effPrice - effDisc;
            const newNet = currentNet * ratio;
            const newDiscountAmt = effPrice - newNet;

            return {
                ...item,
                price: parseFloat(effPrice.toFixed(2)),
                discountAmount: parseFloat(newDiscountAmt.toFixed(2)),
                discountPercent: 0,
                isPriceOverridden: true // Force to target currency mode
            };
        });

        setCart(newCart);

        // Also reset RoundOff because we absorbed the diff into items
        setRoundOff(0);
    };

    // Checkout
    const componentRef = useRef();
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        pageStyle: `@page { size: auto; margin: 0mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`
    });

    const closePaymentModal = () => {
        setShowPaymentModal(false);
        setAddedPayments([]);
        setPaymentData({ method: 'Cash', paidAmount: '0.00' });
    };

    const initiateCheckout = () => {
        const activeBranchId = (user?.role === 'admin' && !user?.branchId) ? selectedBranch : (user?.branchId || selectedBranch);
        if (!activeBranchId) {
            toast.error(user?.role === 'admin' ? "Please select a branch first" : "No branch assigned to your account");
            return;
        }
        if (cart.length === 0) { toast.error("Cart is empty"); return; }
        // For edit invoice flow: start received amount at 0 — user must explicitly enter the new payment.
        // For a brand-new sale: pre-fill the full payable amount (existing expected behavior).
        const isEditing = Boolean(editingSaleId || (router.isReady && router.query?.editId));
        const initialPaidAmount = isEditing ? '0.00' : finalPayable.toFixed(2);
        setPaymentData({ method: 'Cash', paidAmount: initialPaidAmount });
        setAddedPayments([]); // Always clear any stale split payments for a fresh checkout
        // Auto-select logged in user as salesman if not already selected
        if (!salesmanId && cashier) setSalesmanId(cashier.id);
        setShowPaymentModal(true);
    };

    const handleAddPayment = () => {
        const amount = parseFloat(paymentData.paidAmount) || 0;
        if (amount <= 0) return;

        const newPayment = { method: paymentData.method, amount: amount };
        const updatedList = [...addedPayments, newPayment];
        setAddedPayments(updatedList);

        // Calc remaining
        const totalPaidSoFar = updatedList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const remaining = finalPayable - totalPaidSoFar;
        setPaymentData({
            ...paymentData,
            paidAmount: remaining > 0 ? remaining.toFixed(2) : '0.00',
            method: 'Cash'
        });
    };

    const removePayment = (index) => {
        const isEditing = Boolean(editingSaleId || (router.isReady && router.query?.editId));
        const updatedList = addedPayments.filter((_, i) => i !== index);
        setAddedPayments(updatedList);

        // Update balance display input
        const totalPaidSoFar = updatedList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const remaining = finalPayable - totalPaidSoFar;
        setPaymentData({
            ...paymentData,
            paidAmount: isEditing && updatedList.length === 0 ? '0.00' : Math.max(0, remaining).toFixed(2)
        });
    };

    const handleCheckout = async () => {
        try {
            const activeBranchId = (user?.role === 'admin' && !user?.branchId) ? selectedBranch : (user?.branchId || selectedBranch);
            if (!activeBranchId) {
                toast.error(user?.role === 'admin' ? "Please select a branch first" : "No branch assigned to your account");
                return;
            }
            const currentInputAmount = parseFloat(paymentData.paidAmount) || 0;

            let finalPayments = [];

            // Combine added payments with current input if valid
            if (addedPayments.length > 0) {
                finalPayments = [...addedPayments];

                // If there's a value in the input, add it as a payment too (for "Add & Complete")
                if (currentInputAmount > 0) {
                    finalPayments.push({
                        method: paymentData.method,
                        amount: currentInputAmount
                    });
                }
            } else {
                // Simple Mode (No split list started)
                if (currentInputAmount < 0) { toast.error("Invalid Amount"); return; }
                const amountToRecord = currentInputAmount > 0 ? currentInputAmount : (paymentData.method === 'Credit' ? finalPayable : 0);
                finalPayments = [{ method: paymentData.method, amount: amountToRecord }];
            }

            const totalAllocated = finalPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
            const actualCollectedPaid = finalPayments
                .filter(p => p.method?.toLowerCase() !== 'credit')
                .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

            // Basic Total Validation
            // Check Overpayment
            if (totalAllocated > finalPayable + 1) {
                toast.error(`Total allocated (${currencySymbol}${totalAllocated.toFixed(2)}) cannot exceed Final Payable (${currencySymbol}${finalPayable.toFixed(2)})`);
                return;
            }

            // Validate Discounts before sending
            for (const item of cart) {
                if (!item.discountPercent || item.discountPercent === 0) continue; // Skip if no discount

                const effectiveMax = (item.maxDiscount !== null && item.maxDiscount !== undefined) ? item.maxDiscount : 100;
                const effectiveMin = (item.minDiscount !== null && item.minDiscount !== undefined) ? item.minDiscount : 0;

                if (item.discountPercent < effectiveMin || item.discountPercent > effectiveMax) {
                    toast.error(`Discount for ${item.name} must be between ${effectiveMin}% and ${effectiveMax}%`);
                    return;
                }
            }

            // Strict check: zero stock variants must never be sold on new sales (skip if editing an existing invoice where items are already deducted and will be reconciled on the backend)
            const isEditingSale = Boolean(editingSaleId || (router.isReady && router.query?.editId));
            if (!isEditingSale) {
                for (const item of cart) {
                    if (item.selectedSize && (parseInt(item.stock, 10) || 0) <= 0) {
                        toast.error(`Variant "${item.name}" (Size: ${item.selectedSize}) is out of stock (Stock: 0) and cannot be sold.`);
                        return;
                    }
                }
            }

            const payload = {
                customerId: customerId ? parseInt(customerId) : null,
                customerName: customerName || 'Walk-in Customer',
                branchId: activeBranchId ? parseInt(activeBranchId) : null,
                saleDate,
                voucherCode: appliedVoucher ? appliedVoucher.voucher.code : undefined,
                items: cart.map(item => {
                    return {
                        productId: item.id,
                        size: item.selectedSize || item.size || null,
                        quantity: item.quantity,
                        unitPrice: parseFloat(item.price || 0),
                        originalUnitPrice: item.originalPrice !== undefined ? parseFloat(item.originalPrice) : parseFloat(item.price || 0),
                        mrp: item.originalPrice !== undefined ? parseFloat(item.originalPrice) : parseFloat(item.price || 0),
                        taxPercent: taxEnabled ? item.taxPercent : 0,
                        discountPercent: item.discountPercent,
                        discountAmount: parseFloat(item.discountAmount || 0),
                        isTaxInclusive: item.isTaxInclusive
                    };
                }),
                paymentMethod: finalPayments.length === 1 ? finalPayments[0].method : 'Split',
                paidAmount: actualCollectedPaid,
                terminalId: terminal?.id,
                roundOffAmount: parseFloat(roundOff || 0),
                advanceRedeemed: parseFloat(advanceRedeemed || 0),
                deliveryCharge: effectiveDelivery,
                hasDeliveryCharge: deliveryChargeEnabled,
                payments: finalPayments.map(p => ({
                    method: p.method,
                    amount: p.amount
                })),
                salesmanId: salesmanId ? parseInt(salesmanId) : null,
                currencyCode,
                exchangeRate: 1,
                description: saleDescription
            };

            let res;
            const currentEditId = editingSaleId || (router.isReady && router.query?.editId ? parseInt(router.query.editId) : null);
            if (currentEditId) {
                res = await api.put(`/sales/${currentEditId}`, payload);
                toast.success('Invoice Updated Successfully!');
                setEditingSaleId(null);
            } else {
                res = await api.post('/sales', payload);
                toast.success('Sale Completed Successfully!');
            }

            // Always clear the URL query after successful transaction
            // Using shallow: false to ensure state resets correctly
            router.replace('/pos', undefined, { shallow: false });

            setLastSale({
                ...res.data,
                voucherCode: res.data.voucherCode || (appliedVoucher ? appliedVoucher.voucher.code : null),
                voucherDiscount: res.data.voucherDiscount !== undefined ? Number(res.data.voucherDiscount) : (appliedVoucher ? appliedVoucher.finalVoucherDiscount : 0),
                issuedRewardVoucher: res.data.issuedRewardVoucher || null,
                paidAmount: res.data.paidAmount !== undefined ? Number(res.data.paidAmount) : actualCollectedPaid,
                balanceAmount: res.data.balanceAmount !== undefined ? Number(res.data.balanceAmount) : Math.max(0, finalPayable - actualCollectedPaid),
                deliveryCharge: res.data.deliveryCharge !== undefined ? Number(res.data.deliveryCharge) : effectiveDelivery,
                hasDeliveryCharge: res.data.hasDeliveryCharge !== undefined ? Boolean(res.data.hasDeliveryCharge) : deliveryChargeEnabled,
                payments: res.data.payments && res.data.payments.length > 0 ? res.data.payments : finalPayments,
                currencyCode,
                currencySymbol,
                exchangeRate: 1,
                settings: {
                    ...((res.data.isReturn ? returnSettings : salesSettings) || {}),
                    template: (res.data.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern'
                }
            });
            setShowPaymentModal(false);
            setAddedPayments([]);
            setPaymentData({ method: 'Cash', paidAmount: '0.00' });
            // Delay print slightly to allow state update and DOM rasterization
            setTimeout(() => handlePrint(), 300);

            setAppliedVoucher(null);
            setVoucherInput('');

            setCart([]);
            setSearch('');
            setRoundOff(0);
            setDeliveryChargeEnabled(false);
            setDeliveryCharge('');
            setSaleDescription('');
            setSalesmanId(cashier?.id || ''); // Reset to cashier
            fetchBusinessDate(activeBranchId ? parseInt(activeBranchId) : (user?.branchId || null));
            localStorage.removeItem(`pos_state_${user?.id}`);

            // Refresh Products to update stock counts
            fetchData();

            // WhatsApp Integration
            const wsSettings = await api.get('/whatsapp/settings').then(r => r.data).catch(() => null);
            if (wsSettings && wsSettings.isActive && wsSettings.apiKey && (customerId || customerName)) {
                const customer = customers.find(c => c.id === customerId);
                const phone = customer?.phone || '';
                if (phone) {
                    let msg = wsSettings.salesTemplate || 'Hello [[customer_name]], your invoice [[bill_no]] for [[total_amount]] is ready.';
                    msg = msg.replace(/\[\[customer_name\]\]/g, customerName || customer?.name || 'Customer')
                        .replace(/\[\[bill_no\]\]/g, res.data.invoiceNumber)
                        .replace(/\[\[total_amount\]\]/g, currencyCode === 'AED' ? `${total.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${total.toFixed(2)}`)
                        .replace(/\[\[company_name\]\]/g, companyProfile?.companyName || 'Our Store');

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
            toast.error(err.response?.data?.message || err.response?.data?.error || 'Checkout Failed');
        }
    };

    const fetchHistory = async () => {
        try {

            const { data } = await api.get('/sales', {
                params: {
                    branchId: user?.branchId,
                    terminalId: terminal?.id
                }
            });
            setSalesHistory(data);
        } catch (err) {
            toast.error('Failed to fetch sales history');
        }
    };

    useEffect(() => {
        if (showHistoryModal) {
            fetchHistory();
        }
    }, [showHistoryModal]);

    const handleCreateCustomer = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post('/customers', newCustomerData);
            setCustomers([...customers, data]);
            setCustomerId(data.id);
            setCustomerName(data.name);
            setCustomerSearch(data.name);
            setShowCustomerModal(false);
            setNewCustomerData({ name: '', phone: '', email: '', address: '' });
            toast.success('Customer added');
        } catch (err) {
            toast.error('Failed to create customer');
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-80px)] gap-4 overflow-y-auto md:overflow-hidden">

            {/* LEFT PANEL: PRODUCTS (60%) */}
            <div className="w-full md:flex-[3] flex flex-col bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden min-h-[500px] md:min-h-0">
                {/* Search Bar */}
                <div className="p-4 border-b border-slate-100 bg-white z-10">
                    <div className="relative">
                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
                        <input
                            autoFocus
                            className="w-full pl-12 pr-4 h-12 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-primary transition-colors text-lg"
                            placeholder="Search product by name or scan barcode..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setActiveInput('search'); }}
                            onKeyDown={handleScan}
                            onClick={() => setActiveInput('search')}
                        />
                    </div>
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupedProducts.filter(p => {
                            const q = search.trim().toLowerCase();
                            if (!q) return true;
                            return p.name.toLowerCase().includes(q) ||
                                (p.baseName && p.baseName.toLowerCase().includes(q)) ||
                                (p.productTypeName && p.productTypeName.toLowerCase().includes(q)) ||
                                (p.brandName && p.brandName.toLowerCase().includes(q)) ||
                                (p.barcode && String(p.barcode).trim().toLowerCase().includes(q)) ||
                                (p.brandBarcode && String(p.brandBarcode).trim().toLowerCase().includes(q)) ||
                                (p.productBarcode && String(p.productBarcode).trim().toLowerCase().includes(q)) ||
                                (p.variants && p.variants.some(v => v.size.toLowerCase().includes(q) || (v.barcode && String(v.barcode).trim().toLowerCase().includes(q))));
                        }).map(product => {
                            const hasSaleableVariant = product.hasSizes ? product.variants?.some(v => (parseInt(v.stock, 10) || 0) > 0) : true;
                            const isOutOfStock = product.hasSizes ? !hasSaleableVariant : (parseInt(product.stock, 10) || 0) <= 0;

                            return (
                                <div key={product.groupKey || product.id}
                                    className={`bg-white p-3 rounded-xl border border-slate-100 shadow-sm transition-all flex flex-col justify-between ${
                                        isOutOfStock
                                            ? 'opacity-70 cursor-not-allowed border-slate-200'
                                            : 'hover:shadow-md cursor-pointer group active:scale-98'
                                    }`}
                                    onClick={() => {
                                        if (isOutOfStock) {
                                            toast.error(`"${product.name}" is completely out of stock.`);
                                            return;
                                        }
                                        handleProductCardClick(product);
                                    }}>
                                    <div>
                                        <div className="aspect-square bg-slate-50 rounded-lg mb-2.5 flex items-center justify-center overflow-hidden relative">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className={`w-full h-full object-cover transition-transform duration-300 ${!isOutOfStock ? 'group-hover:scale-105' : 'grayscale-[30%]'}`} />
                                            ) : (
                                                <span className="text-2xl font-semibold text-slate-300">{product.name.substring(0, 2).toUpperCase()}</span>
                                            )}
                                            <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm shadow-sm ${
                                                !isOutOfStock ? 'bg-slate-900/75 text-white' : 'bg-red-500 text-white uppercase tracking-wider'
                                            }`}>
                                                {!isOutOfStock ? `${product.stock} in stock` : 'Out of Stock'}
                                            </div>
                                            {product.gender && (
                                                <div className="absolute top-2 left-2 bg-white/90 text-slate-700 text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm shadow-xs">
                                                    {product.gender}
                                                </div>
                                            )}
                                        </div>

                                        {/* Product Type (Clearly visible) */}
                                        {product.productTypeName && (
                                            <div className="mb-1">
                                                <span className="inline-block text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                                                    {product.productTypeName}
                                                </span>
                                            </div>
                                        )}

                                        {/* Product Name */}
                                        <h3 className="font-semibold text-slate-800 text-sm truncate mb-0.5" title={product.name}>{product.name}</h3>

                                        {/* Product Barcode */}
                                        {(product.barcode || (product.variants?.length === 1 && product.variants[0]?.barcode)) && (
                                            <p className="font-mono text-xs text-slate-500 font-medium tracking-tight mb-1 truncate">
                                                {product.barcode || product.variants[0]?.barcode}
                                            </p>
                                        )}

                                        {/* Available Sizes & Stock (Compact display) */}
                                        {product.hasSizes && product.variants && product.variants.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1 mb-2">
                                                {product.variants.slice(0, 6).map(v => (
                                                    <span
                                                        key={v.size}
                                                        className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${
                                                            v.stock > 0
                                                                ? 'bg-slate-50 border-slate-200 text-slate-700'
                                                                : 'bg-red-50 border-red-200 text-red-500'
                                                        }`}
                                                        title={`${v.size}: ${v.stock} in stock`}
                                                    >
                                                        <strong className="font-bold">{v.size}</strong>: {v.stock}
                                                    </span>
                                                ))}
                                                {product.variants.length > 6 && (
                                                    <span className="text-[9px] text-slate-400 font-semibold px-0.5">
                                                        +{product.variants.length - 6}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center pt-2 border-t border-slate-50 mt-auto">
                                        <p className="text-primary font-bold text-sm">
                                            {currencyCode === 'AED' ? `${parseFloat(product.price || 0).toFixed(2)} ${currencySymbol}` : `${currencySymbol}${parseFloat(product.price || 0).toFixed(2)}`}
                                        </p>
                                        {isOutOfStock ? (
                                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 cursor-not-allowed opacity-50" title="Out of Stock">
                                                <FiPlus size={14} />
                                            </div>
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors cursor-pointer">
                                                <FiPlus size={14} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: CART & NUMPAD (40%) */}
            <div className="w-full md:w-[400px] lg:w-[450px] xl:w-[500px] flex flex-col bg-white h-auto md:h-full border-l border-slate-200">

                {/* Header: Cashier, Salesman & Customer - Compact View */}
                <div className="bg-white border-b border-slate-200 p-4 space-y-3">
                    {/* Cashier Info */}
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><FiUser size={16} /></span>
                            <div>
                                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Cashier</p>
                                <p className="text-sm font-medium text-slate-700">{cashier?.name || 'Admin'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            {user?.role === 'admin' && !user.branchId ? (
                                <div className="w-40 ml-auto">
                                    <label className="block text-[10px] text-slate-400 font-medium uppercase mb-1 text-right">Branch / Terminal</label>
                                    <SearchableSelect
                                        options={branches.map(b => ({ value: b.id, label: b.name }))}
                                        value={selectedBranch}
                                        onChange={val => setSelectedBranch(val)}
                                        placeholder="Select Branch"
                                        className="h-8 text-xs font-medium"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <p className="text-[10px] text-slate-400 font-medium uppercase">Branch / Terminal</p>
                                    <p className="text-xs font-semibold text-slate-700 truncate max-w-[180px]" title={assignedBranch?.name || user?.branchName || user?.branch?.name || ''}>
                                        {assignedBranch?.name || user?.branchName || user?.branch?.name || branches.find(b => b.id.toString() === (user?.branchId || selectedBranch)?.toString())?.name || (user?.branchId ? 'Loading...' : <span className="text-amber-600 font-medium">No Branch Assigned</span>)}
                                    </p>
                                    <p className="text-[10px] font-mono font-medium text-primary">
                                        {terminal?.name || 'POS-01'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Editing Indicator */}
                    {editingSaleId && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2 text-blue-700">
                                <FiAlertCircle size={14} className="animate-pulse" />
                                <span className="text-[10px] font-medium uppercase tracking-wider">Editing Mode</span>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingSaleId(null);
                                    setCart([]);
                                    setCustomerId('');
                                    setCustomerName('');
                                    setRoundOff(0);
                                    setAddedPayments([]);
                                    setPaymentData({ method: 'Cash', paidAmount: '0.00' });
                                    router.replace('/pos', undefined, { shallow: true });
                                    toast.info('Edit mode cancelled');
                                }}
                                className="text-[10px] font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors"
                            >
                                CANCEL EDIT
                            </button>
                        </div>
                    )}

                    {/* Combined Salesman & Customer Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1">Salesman</label>
                            <SearchableSelect
                                options={availableSalesmen.map(s => ({ value: s.id, label: s.name }))}
                                value={salesmanId}
                                onChange={val => setSalesmanId(val)}
                                placeholder="Select Salesman"
                            />
                        </div>
                        <div ref={dropdownRef} className="relative">
                            <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1">Customer</label>
                            <div
                                className="flex items-center justify-between text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded p-1.5 cursor-pointer hover:bg-slate-100"
                                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                            >
                                <span className="truncate">{customerId ? (customers.find(c => c.id === customerId)?.name || customerName) : 'Walk-in Customer'}</span>
                                <FiEdit2 size={12} className="text-slate-400 ml-1" />
                            </div>

                            {/* Customer Dropdown */}
                            {showCustomerDropdown && (
                                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-slate-200 mt-1 rounded-lg shadow-xl p-2">
                                    <input
                                        autoFocus
                                        className="w-full p-2 text-sm border border-slate-200 rounded mb-2 outline-none focus:border-primary"
                                        placeholder="Search Customer..."
                                        value={customerSearch}
                                        onChange={e => setCustomerSearch(e.target.value)}
                                    />
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        <div className="p-2 hover:bg-slate-50 rounded cursor-pointer text-sm font-medium text-slate-600" onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerSearch(''); setShowCustomerDropdown(false); }}>
                                            Walk-in Customer
                                        </div>
                                        {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                                            <div key={c.id} className="p-2 hover:bg-primary-light/10 rounded cursor-pointer text-sm font-semibold text-slate-700"
                                                onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(c.name); setShowCustomerDropdown(false); }}>
                                                {c.name}
                                                {c.phone && <span className="block text-xs text-slate-400 font-normal">{c.phone}</span>}
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => { setShowCustomerModal(true); setShowCustomerDropdown(false); }} className="w-full mt-2 py-2 bg-primary-light/10 text-primary text-xs font-medium rounded hover:bg-primary-light/20 flex items-center justify-center gap-1">
                                        <FiPlus /> New Customer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Advance Redemption (Compact Version) */}
                    {customerId && availableAdvance > 0 && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5 mt-1">
                            <div className="flex justify-between items-center h-5">
                                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Advance: {currencySymbol}{availableAdvance.toFixed(2)}</span>
                                <div className="flex items-center gap-1.5 scale-90 origin-right">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Use Full</span>
                                    <input
                                        type="checkbox"
                                        className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                                        checked={useFullAdvance}
                                        onChange={(e) => setUseFullAdvance(e.target.checked)}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center mt-1 pt-1 border-t border-emerald-100/50">
                                <span className="text-[9px] font-bold text-slate-500 uppercase italic">Redeem Amount</span>
                                <input
                                    type="number"
                                    className={`w-20 text-right bg-white border border-emerald-200 rounded outline-none focus:border-emerald-500 text-xs font-bold px-1 py-0 ${useFullAdvance ? 'opacity-50 pointer-events-none' : ''}`}
                                    placeholder="0.00"
                                    value={advanceRedeemed}
                                    onChange={(e) => {
                                        let val = parseFloat(e.target.value) || 0;
                                        if (val > availableAdvance) val = availableAdvance;
                                        setAdvanceRedeemed(e.target.value === '' ? '' : val);
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Options Panel (More Compact) */}
                    <div className="grid grid-cols-3 gap-1.5 mt-0.5">
                        <div className="flex items-center">
                             <select
                                className="w-full h-8 bg-slate-50 border border-slate-200 rounded px-1 text-[10px] font-bold text-slate-700 outline-none focus:border-primary transition-all"
                                value={currencyCode}
                                onChange={(e) => {
                                    const code = e.target.value;
                                    setCurrencyCode(code);
                                    setCurrencySymbol(normalizeCurrencySymbol(CURRENCY_SYMBOLS[code], code));
                                    setExchangeRate(1);
                                }}
                            >
                                {CURRENCY_LIST.map((c) => (
                                    <option key={c.code} value={c.code}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={() => setTaxEnabled(!taxEnabled)}
                                className={`w-full h-8 rounded font-bold text-[9px] uppercase transition-all flex items-center justify-center gap-1 border ${
                                    taxEnabled
                                    ? 'bg-primary/5 text-primary border-primary/20'
                                    : 'bg-slate-50 text-slate-400 border-slate-200'
                                }`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${taxEnabled ? 'bg-primary' : 'bg-slate-300'}`}></div>
                                TAX {taxEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !deliveryChargeEnabled;
                                    setDeliveryChargeEnabled(next);
                                    if (!next) setDeliveryCharge('');
                                }}
                                className={`w-full h-8 rounded font-bold text-[9px] uppercase transition-all flex items-center justify-center gap-1 border ${
                                    deliveryChargeEnabled
                                    ? 'bg-primary/5 text-primary border-primary/20'
                                    : 'bg-slate-50 text-slate-400 border-slate-200'
                                }`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${deliveryChargeEnabled ? 'bg-primary' : 'bg-slate-300'}`}></div>
                                DELIVERY {deliveryChargeEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>

                    {deliveryChargeEnabled && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1.5 bg-primary/5 border border-primary/20 rounded-lg">
                            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-tight flex items-center gap-1">
                                Delivery Charge ({currencySymbol})
                            </label>
                            <div className="relative flex items-center">
                                <span className="text-[11px] font-bold text-slate-400 mr-1">{currencySymbol}</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={deliveryCharge}
                                    onChange={(e) => handleDeliveryChargeChange(e.target.value)}
                                    className="w-20 h-6 px-1.5 text-right text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded outline-none focus:border-primary"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Cart Headers */}
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex text-[10px] font-medium text-slate-500 uppercase tracking-wide sticky top-0 z-10">
                    <div className="flex-[3]">Item</div>
                    <div className="flex-[2] text-center">Qty</div>
                    <div className="flex-[2] text-right">Price</div>
                    <div className="flex-[2] text-right">Total</div>
                    <div className="w-6"></div>
                </div>

                {/* Cart List */}
                <div className="flex-1 overflow-y-auto bg-white">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                                <FiShoppingCart size={24} className="text-slate-300" />
                            </div>
                            <p className="text-sm font-medium">Cart is empty</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {cart.map((item, idx) => {
                                const itemKey = item.cartItemId || `${item.id}_${item.selectedSize || 'nosize'}`;
                                const effPrice = parseFloat(item.price || 0);
                                const effDisc = parseFloat(item.discountAmount || 0);
                                const lineAlloc = appliedVoucher?.lineAllocations?.[idx] || 0;
                                const lineTotalBeforeVoucher = Math.max(0, (effPrice - effDisc) * (parseFloat(item.quantity) || 0));
                                const lineFinalTotal = Math.max(0, lineTotalBeforeVoucher - lineAlloc);

                                return (
                                    <div key={itemKey} className="px-4 py-3 hover:bg-slate-50 group transition-colors">
                                        <div className="flex items-center text-sm">
                                            {/* Item & Disc */}
                                            <div className="flex-[3] pr-2">
                                                <h4 className="font-medium text-slate-700 leading-tight mb-0.5">{item.name}</h4>
                                                <div className="flex flex-wrap items-center gap-1 mb-1">
                                                    {item.productTypeName && (
                                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                                                            {item.productTypeName}
                                                        </span>
                                                    )}
                                                    {item.selectedSize && (
                                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                                            Size: {item.selectedSize}
                                                        </span>
                                                    )}
                                                    {lineAlloc > 0 && (
                                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                                                            Voucher: -{currencySymbol}{lineAlloc.toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <div className="flex items-center border border-slate-200 rounded overflow-hidden h-6 bg-slate-50">
                                                        <input
                                                            className="w-10 text-center text-[10px] bg-transparent outline-none focus:bg-white transition-colors"
                                                            placeholder="%"
                                                            value={item.discountPercent || ''}
                                                            onChange={e => updateDiscount(itemKey, 'percent', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-slate-400">
                                                            {currencySymbol}
                                                        </span>
                                                        <input
                                                            className="w-10 p-0.5 text-[10px] text-center bg-slate-100 border border-slate-200 rounded outline-none focus:border-primary"
                                                            placeholder="Amt"
                                                            value={item.discountAmount || ''}
                                                            onChange={e => updateDiscount(itemKey, 'amount', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Qty */}
                                            <div className="flex-[2] flex justify-center">
                                                <div className="flex items-center border border-slate-200 rounded bg-white">
                                                    <button className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary-light/10" onClick={() => updateQuantity(itemKey, item.quantity - 1)}>-</button>
                                                    <input
                                                        className="w-8 text-center text-xs font-medium text-slate-700 outline-none"
                                                        value={item.quantity}
                                                        onChange={e => updateQuantity(itemKey, parseInt(e.target.value) || 1)}
                                                    />
                                                    <button className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary-light/10" onClick={() => updateQuantity(itemKey, item.quantity + 1)}>+</button>
                                                </div>
                                            </div>

                                            {/* Price */}
                                            <div className="flex-[2] text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-[10px] text-slate-400">
                                                        {currencySymbol}
                                                    </span>
                                                    <input
                                                        className="w-16 p-0.5 font-medium text-right text-slate-700 bg-slate-100 border border-slate-200 rounded outline-none focus:border-primary"
                                                        value={item.price}
                                                        onChange={e => updatePrice(itemKey, e.target.value)}
                                                        onClick={e => e.target.select()}
                                                    />
                                                </div>
                                                {effDisc > 0 && (
                                                    <div className="text-[10px] text-orange-500 line-through">
                                                        {currencyCode === 'AED' ? `${(effPrice * (parseFloat(item.quantity) || 0)).toFixed(2)} ${currencySymbol}` : `${currencySymbol}${(effPrice * (parseFloat(item.quantity) || 0)).toFixed(2)}`}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Total */}
                                            <div className="flex-[2] text-right font-medium text-slate-800">
                                                {lineAlloc > 0 ? (
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 line-through">
                                                            {currencyCode === 'AED' ? `${lineTotalBeforeVoucher.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${lineTotalBeforeVoucher.toFixed(2)}`}
                                                        </div>
                                                        <div className="font-bold text-emerald-700">
                                                            {currencyCode === 'AED' ? `${lineFinalTotal.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${lineFinalTotal.toFixed(2)}`}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        {currencyCode === 'AED' ? `${lineFinalTotal.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${lineFinalTotal.toFixed(2)}`}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Remove */}
                                            <div className="w-6 text-right pl-2">
                                                <button onClick={() => removeFromCart(itemKey)} className="text-slate-300 hover:text-red-500 transition-colors">
                                                    <FiTrash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Promo Voucher Box */}
                <div className="bg-slate-50 border-t border-slate-200 p-2.5">
                    {appliedVoucher ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2.5 py-1.5 rounded-lg shadow-sm">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                                    <FiTag size={12} />
                                </div>
                                <div className="truncate">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-black text-xs text-emerald-900 tracking-wide font-mono">{appliedVoucher.voucher.code}</span>
                                        <span className="text-[9px] px-1 py-0.2 bg-emerald-200/80 text-emerald-800 font-bold rounded uppercase">
                                            {appliedVoucher.voucher.type}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-emerald-700 font-semibold">
                                        Voucher Discount: -{currencySymbol}{appliedVoucher.finalVoucherDiscount.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleRemoveVoucher}
                                className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-2"
                                title="Remove Voucher"
                            >
                                <FiX size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-1.5 items-center">
                            <div className="relative flex-1">
                                <FiTag className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                <input
                                    type="text"
                                    className="w-full pl-8 pr-2 py-1.5 text-xs font-mono uppercase bg-white border border-slate-200 rounded-lg outline-none focus:border-primary placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 transition-all shadow-inner"
                                    placeholder="Enter Voucher Code (e.g. SAVE50)"
                                    value={voucherInput}
                                    onChange={e => setVoucherInput(e.target.value.toUpperCase())}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleApplyVoucher();
                                        }
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleApplyVoucher}
                                disabled={validatingVoucher || !voucherInput.trim() || cart.length === 0}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                            >
                                {validatingVoucher ? <FiLoader className="animate-spin" size={12} /> : 'Apply'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Totals & Actions - Compacted */}
                <div className="bg-slate-50 border-t border-slate-200 p-3 space-y-1.5">
                    <div className="space-y-0.5 text-xs">
                        {/* 1. Catalog Price Total */}
                        <div className="flex justify-between text-slate-500">
                            <span className="font-medium text-[10px] uppercase">Catalog Price</span>
                            <span className="font-semibold text-slate-700">
                                {currencyCode === 'AED' ? `${totalCatalogPrice.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${totalCatalogPrice.toFixed(2)}`}
                            </span>
                        </div>

                        {/* 2. Product Discount */}
                        {totalProductDiscount > 0 && (
                            <div className="flex justify-between text-slate-500">
                                <span className="font-medium text-[10px] uppercase">Product Discount</span>
                                <span className="font-semibold text-orange-600">
                                    -{currencyCode === 'AED' ? `${totalProductDiscount.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${totalProductDiscount.toFixed(2)}`}
                                </span>
                            </div>
                        )}

                        {/* 3. Voucher Discount */}
                        {voucherDiscount > 0 && (
                            <div className="flex justify-between items-center text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <span className="font-bold text-[10px] uppercase flex items-center gap-1">
                                    <FiTag size={10} /> Voucher ({appliedVoucher?.voucher?.code})
                                </span>
                                <span className="font-black">
                                    -{currencyCode === 'AED' ? `${voucherDiscount.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${voucherDiscount.toFixed(2)}`}
                                </span>
                            </div>
                        )}

                        {/* 4. Taxable Subtotal */}
                        <div className="flex justify-between text-slate-500">
                            <span className="font-medium text-[10px] uppercase">Taxable Subtotal</span>
                            <span className="font-semibold text-slate-700">
                                {currencyCode === 'AED' ? `${subTotal.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${subTotal.toFixed(2)}`}
                            </span>
                        </div>

                        {/* 5. Tax (GST) */}
                        {taxEnabled && (
                            <div className="flex justify-between text-slate-500">
                                <span className="font-medium text-[10px] uppercase">Tax (GST)</span>
                                <span className="font-semibold text-emerald-600">
                                    +{currencyCode === 'AED' ? `${tax.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${tax.toFixed(2)}`}
                                </span>
                            </div>
                        )}

                        {/* 6. Delivery Charge */}
                        {(deliveryChargeEnabled || effectiveDelivery > 0) && (
                            <div className="flex justify-between text-slate-500">
                                <span className="font-medium text-[10px] uppercase">Delivery Charge</span>
                                <span className="font-semibold text-blue-600">
                                    +{currencyCode === 'AED' ? `${effectiveDelivery.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${effectiveDelivery.toFixed(2)}`}
                                </span>
                            </div>
                        )}

                        {/* 7. Advance */}
                        {parseFloat(advanceRedeemed || 0) > 0 && (
                            <div className="flex justify-between items-center text-orange-600">
                                <span className="font-bold text-[10px] uppercase">Advance</span>
                                <span className="font-black">
                                    -{currencySymbol}{parseFloat(advanceRedeemed).toFixed(2)}
                                </span>
                            </div>
                        )}

                        {/* 8. Round Off */}
                        <div className="flex justify-between items-center text-slate-400 h-6">
                            <span className="flex items-center gap-1.5 text-[9px] uppercase font-bold">
                                Round Off <button onClick={handleAutoRound} className="text-[8px] bg-slate-200 px-1 py-0 rounded hover:bg-slate-300 font-black text-slate-600">AUTO</button>
                            </span>
                            <input
                                className="w-16 text-right bg-transparent border-b border-dashed border-slate-300 outline-none focus:border-primary font-mono text-xs"
                                value={roundOff}
                                onChange={e => setRoundOff(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                        <span className="text-slate-500 font-bold text-xs uppercase tracking-tight">Bill Total</span>
                        <div className="relative flex items-center gap-1">
                            <span className="text-xl font-black text-slate-800">{currencySymbol}</span>
                            <input
                                className="w-32 text-right text-xl font-black text-slate-800 bg-transparent outline-none"
                                value={total.toFixed(2)}
                                onChange={e => handleTotalChange(e.target.value)}
                                onFocus={e => e.target.select()}
                            />
                        </div>
                    </div>

                    {redeemedAmount > 0 && (
                        <div className="flex justify-between items-center py-2 px-3 bg-emerald-600 rounded-lg text-white shadow-md">
                            <div>
                                <span className="block text-[8px] font-black uppercase tracking-widest opacity-80 leading-none mb-0.5">Final Payable</span>
                                <span className="text-lg font-black leading-none tracking-tight">
                                    {currencyCode === 'AED' ? `${finalPayable.toFixed(2)} ${currencySymbol}` : `${currencySymbol}${finalPayable.toFixed(2)}`}
                                </span>
                            </div>
                            <FiCreditCard className="opacity-40" />
                        </div>
                    )}

                    {/* Description / Notes - Compacted & Moved here */}
                    <div className="pt-1.5">
                        <textarea
                            className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded outline-none focus:border-primary transition-all resize-none font-medium text-slate-500 placeholder:text-slate-300"
                            rows="1"
                            placeholder="Add sale notes..."
                            value={saleDescription}
                            onChange={(e) => setSaleDescription(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={initiateCheckout}
                        disabled={cart.length === 0}
                        className="w-full py-2.5 bg-primary hover:bg-primary-dark disabled:bg-slate-300 text-white rounded-lg shadow-sm font-bold text-sm transition-all flex items-center justify-center gap-2"
                    >
                        <FiMonitor /> {redeemedAmount > 0 ? 'Checkout' : 'Pay Now'}
                    </button>
                </div>
            </div>


            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-all duration-300">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                        {/* Standard Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h2 className="text-lg font-semibold text-slate-800">Complete Payment</h2>
                            <button onClick={closePaymentModal} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                                <FiX />
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto">

                            {/* Total Amount Display */}
                            <div className="text-center mb-8">
                                <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">Total Payable</p>
                                <span className="text-2xl font-extrabold text-slate-800">{currencySymbol}{finalPayable.toFixed(2)}</span>
                                {voucherDiscount > 0 && (
                                    <p className="text-[11px] text-emerald-600 font-bold mt-1">
                                        (Voucher &quot;{appliedVoucher?.voucher?.code}&quot; applied: -{currencySymbol}{voucherDiscount.toFixed(2)})
                                    </p>
                                )}
                                {redeemedAmount > 0 && (
                                    <p className="text-[10px] text-slate-400 mt-1 italic">(Gross: {currencySymbol}{total.toFixed(2)} - Adv: {currencySymbol}{redeemedAmount.toFixed(2)})</p>
                                )}
                            </div>

                            {/* Payment Method Tabs */}
                            <div className="mb-6">
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-2">Payment Method</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {['Cash', 'Card', 'UPI', 'Credit', 'Sales Return'].map(method => (
                                        <button
                                            key={method}
                                            onClick={() => {
                                                const isEditing = Boolean(editingSaleId || (router.isReady && router.query?.editId));
                                                const alreadyPaid = addedPayments.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
                                                const remaining = finalPayable - alreadyPaid;
                                                if (isEditing && addedPayments.length === 0 && (!paymentData.paidAmount || parseFloat(paymentData.paidAmount) === 0)) {
                                                    setPaymentData({
                                                        ...paymentData,
                                                        method,
                                                        paidAmount: '0.00'
                                                    });
                                                } else if (remaining <= 0 && addedPayments.length > 0) {
                                                    setAddedPayments([]);
                                                    setPaymentData({
                                                        ...paymentData,
                                                        method,
                                                        paidAmount: isEditing ? '0.00' : finalPayable.toFixed(2)
                                                    });
                                                } else {
                                                    setPaymentData({
                                                        ...paymentData,
                                                        method,
                                                        paidAmount: isEditing && addedPayments.length === 0 && (!paymentData.paidAmount || parseFloat(paymentData.paidAmount) === 0) ? '0.00' : Math.max(0, remaining).toFixed(2)
                                                    });
                                                }
                                            }}
                                            className={`py-2 px-1 rounded-lg text-[10px] font-medium transition-all border whitespace-nowrap ${paymentData.method === method
                                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-primary/50 hover:bg-primary-light/10'
                                                }`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Payment Input */}
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-medium text-slate-500 uppercase">Received Amount</label>
                                    <span className={`text-xs font-medium ${(parseFloat(paymentData.paidAmount || 0) - (finalPayable - addedPayments.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0))) >= 0
                                        ? 'text-primary'
                                        : 'text-orange-500'
                                        }`}>
                                        {(() => {
                                            const paid = parseFloat(paymentData.paidAmount || 0);
                                            const alreadyPaid = addedPayments.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
                                            const balance = finalPayable - alreadyPaid - paid;
                                            if (balance < -0.01) return `Change: ${currencySymbol}${Math.abs(balance).toFixed(2)}`;
                                            if (balance > 0.01) return `Balance: ${currencySymbol}${balance.toFixed(2)}`;
                                            return 'Settled';
                                        })()}
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <span className={`absolute top-1/2 -translate-y-1/2 text-slate-400 font-medium ${currencyCode === 'AED' ? 'right-3' : 'left-3'}`}>
                                            {currencySymbol}
                                        </span>
                                        <input
                                            autoFocus
                                            type="number"
                                            className={`w-full py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 font-medium text-lg text-slate-800 transition-all ${currencyCode === 'AED' ? 'pr-12 pl-4' : 'pl-8 pr-4'}`}
                                            placeholder="0.00"
                                            value={paymentData.paidAmount}
                                            onChange={e => setPaymentData({ ...paymentData, paidAmount: e.target.value })}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleCheckout();
                                            }}
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddPayment}
                                        className="px-4 py-3 bg-white border border-slate-200 text-primary rounded-lg font-medium hover:bg-primary-light/10 hover:border-primary/30 transition-all text-sm whitespace-nowrap"
                                        title="Add as Partial Payment"
                                    >
                                        + Add
                                    </button>
                                </div>
                            </div>

                            {/* Added Payments List */}
                            {addedPayments.length > 0 && (
                                <div className="mb-2 bg-slate-50 rounded-lg border border-slate-100 p-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] font-medium text-slate-400 uppercase">Split Payments</p>
                                        <button
                                            onClick={() => {
                                                const isEditing = Boolean(editingSaleId || (router.isReady && router.query?.editId));
                                                setAddedPayments([]);
                                                setPaymentData({ ...paymentData, paidAmount: isEditing ? '0.00' : finalPayable.toFixed(2) });
                                            }}
                                            className="text-[10px] text-slate-400 hover:text-red-500 font-medium transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {addedPayments.map((p, i) => (
                                            <div key={i} className="flex justify-between items-center text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                                                    <span className="font-medium text-slate-700">{p.method}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-medium text-slate-800">{currencySymbol}{(parseFloat(p.amount) || 0).toFixed(2)}</span>
                                                    <button onClick={() => removePayment(i)} className="text-slate-400 hover:text-red-500"><FiX size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button onClick={closePaymentModal} className="px-5 py-3 rounded-xl font-medium text-slate-500 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all text-sm">
                                Cancel
                            </button>
                            <button
                                onClick={handleCheckout}
                                className="flex-1 py-3 px-6 bg-primary hover:bg-primary-dark text-white rounded-xl font-medium shadow-lg shadow-primary/30 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <FiMonitor size={16} />
                                {addedPayments.length > 0 ? 'Complete Split Sale' : 'Complete Sale'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {lastSale && (
                <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
                    <div ref={componentRef}>
                        <ProfessionalInvoice
                            printData={{
                                ...lastSale,
                                settings: {
                                    ...(lastSale?.isReturn ? returnSettings : salesSettings),
                                    template: (lastSale?.isReturn ? returnSettings?.template : salesSettings?.template) || 'modern'
                                }
                            }}
                            companyProfile={companyProfile}
                        />
                    </div>
                </div>
            )}
            {/* Sales History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><FiClock /> Sales History</h2>
                            <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300"><FiX /></button>
                        </div>

                        <div className="flex-1 overflow-auto flex">
                            {/* List */}
                            <div className={`${selectedHistorySale ? 'w-1/3 border-r hidden md:block' : 'w-full'} overflow-y-auto`}>
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 sticky top-0">
                                        <tr>
                                            <th className="p-3">Date</th>
                                            <th className="p-3">Customer</th>
                                            <th className="p-3">Sale By</th>
                                            <th className="p-3 text-right">Discount</th>
                                            <th className="p-3 text-right">Tax</th>
                                            <th className="p-3 text-right">Advance Used</th>
                                            <th className="p-3 text-right">Total</th>
                                            <th className="p-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {salesHistory.map(sale => (
                                            <tr key={sale.id} className={`border-b hover:bg-slate-50 cursor-pointer ${selectedHistorySale?.id === sale.id ? 'bg-primary-light/10' : ''}`} onClick={() => setSelectedHistorySale(sale)}>
                                                <td className="p-3">
                                                    <p className="font-medium text-slate-700">{new Date(sale.saleDate).toLocaleDateString('en-GB')}</p>
                                                    <p className="text-xs text-slate-400 font-mono">#{sale.invoiceNumber}</p>
                                                </td>
                                                <td className="p-3 text-slate-600 truncate max-w-[100px]">{sale.customer?.name || 'Walk-in'}</td>
                                                <td className="p-3 text-slate-500">{sale.salesman?.name || '-'}</td>
                                                <td className="p-3 text-right text-slate-500">{sale.discount > 0 ? sale.discount : '-'}</td>
                                                <td className="p-3 text-right text-slate-500">{sale.taxAmount > 0 ? sale.taxAmount : '-'}</td>
                                                <td className="p-3 text-right text-orange-500">{sale.advanceUsed > 0 ? sale.advanceUsed : '-'}</td>
                                                 <td className="p-3 text-right font-medium text-slate-800">
                                                    {(() => {
                                                        const sym = getCurrencySymbol(sale.currencyCode);
                                                        const val = parseFloat(sale.totalAmount).toFixed(2);
                                                        return sale.currencyCode === 'AED' ? `${val} ${sym}` : `${sym}${val}`;
                                                    })()}
                                                 </td>
                                                <td className="p-3 text-primary"><FiMonitor /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Preview Detail */}
                            {selectedHistorySale && (
                                <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto">
                                    <div className="bg-white p-6 rounded-xl shadow-sm border">
                                        <div className="flex justify-between items-start mb-6 border-b pb-4">
                                            <div>
                                                <h3 className="text-xl font-semibold text-slate-800">Invoice #{selectedHistorySale.invoiceNumber}</h3>
                                                <p className="text-sm text-slate-500">
                                                    {new Date(selectedHistorySale.saleDate).toLocaleDateString('en-GB')} {new Date(selectedHistorySale.saleDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${selectedHistorySale.isReturn ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {selectedHistorySale.isReturn ? 'Return' : selectedHistorySale.status}
                                                </span>
                                                <button
                                                    onClick={async () => {
                                                        const wsSettings = await api.get('/whatsapp/settings').then(r => r.data).catch(() => null);
                                                        if (!wsSettings?.apiKey) return toast.error('WhatsApp not configured');
                                                        const phone = selectedHistorySale.customer?.phone;
                                                        if (!phone) return toast.error('Customer phone missing');

                                                        let msg = wsSettings.salesTemplate || '';
                                                        msg = msg.replace(/\[\[customer_name\]\]/g, selectedHistorySale.customer?.name || 'Customer')
                                                            .replace(/\[\[bill_no\]\]/g, selectedHistorySale.invoiceNumber)
                                                            .replace(/\[\[total_amount\]\]/g, (() => {
                                                                const sym = getCurrencySymbol(selectedHistorySale.currencyCode);
                                                                const val = parseFloat(selectedHistorySale.totalAmount).toFixed(2);
                                                                return selectedHistorySale.currencyCode === 'AED' ? `${val} ${sym}` : `${sym}${val}`;
                                                            })())
                                                            .replace(/\[\[company_name\]\]/g, companyProfile?.companyName || 'Our Store');

                                                        try {
                                                            await api.post('/whatsapp/send', { mobile: phone, message: msg });
                                                            toast.success('WhatsApp Sent!');
                                                        } catch (err) {
                                                            toast.error('WhatsApp failed');
                                                        }
                                                    }}
                                                    className="ml-2 p-2 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                                    title="Send WhatsApp"
                                                >
                                                    <FiMessageSquare />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Customer</p>
                                            <p className="font-medium text-slate-700">{selectedHistorySale.customer?.name || 'Walk-in Customer'}</p>
                                        </div>

                                        <table className="w-full text-sm mb-6">
                                            <thead className="bg-slate-50 text-slate-500">
                                                <tr>
                                                    <th className="p-2 text-left">Item</th>
                                                    <th className="p-2 text-center">Qty</th>
                                                    <th className="p-2 text-right">Price</th>
                                                    <th className="p-2 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedHistorySale.items.map(item => (
                                                    <tr key={item.id} className="border-b border-slate-50 last:border-0">
                                                        <td className="p-2 text-slate-700">{item.product?.name}</td>
                                                        <td className="p-2 text-center">{item.quantity}</td>
                                                        <td className="p-2 text-right">
                                                            {(() => {
                                                                const sym = CURRENCY_SYMBOLS[selectedHistorySale.currencyCode] || '₹';
                                                                const val = parseFloat(item.unitPrice || 0).toFixed(2);
                                                                return selectedHistorySale.currencyCode === 'AED' ? `${val} ${sym}` : `${sym}${val}`;
                                                            })()}
                                                        </td>
                                                        <td className="p-2 text-right font-medium">
                                                            {(() => {
                                                                const sym = CURRENCY_SYMBOLS[selectedHistorySale.currencyCode] || '₹';
                                                                const val = parseFloat(item.total || 0).toFixed(2);
                                                                return selectedHistorySale.currencyCode === 'AED' ? `${val} ${sym}` : `${sym}${val}`;
                                                            })()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {(parseFloat(selectedHistorySale.deliveryCharge || 0) > 0 || selectedHistorySale.hasDeliveryCharge) && (
                                            <div className="flex justify-between items-center text-sm font-semibold text-slate-700 border-t pt-2">
                                                <span>Delivery Charge</span>
                                                <span>
                                                    {(() => {
                                                        const sym = CURRENCY_SYMBOLS[selectedHistorySale.currencyCode] || '₹';
                                                        const val = parseFloat(selectedHistorySale.deliveryCharge || 0).toFixed(2);
                                                        return selectedHistorySale.currencyCode === 'AED' ? `${val} ${sym}` : `${sym}${val}`;
                                                    })()}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center text-xl font-bold text-slate-900 border-t pt-4">
                                            <span>Total Amount</span>
                                            <span>
                                                {(() => {
                                                    const sym = getCurrencySymbol(selectedHistorySale.currencyCode);
                                                    const val = parseFloat(selectedHistorySale.totalAmount).toFixed(2);
                                                    return selectedHistorySale.currencyCode === 'AED' ? `${val} ${sym}` : `${sym}${val}`;
                                                })()}
                                            </span>
                                        </div>

                                        <div className="mt-6 flex gap-3">
                                            <button
                                                onClick={() => { setLastSale(selectedHistorySale); setTimeout(() => handlePrint(), 300); }}
                                                className="flex-1 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 flex items-center justify-center gap-2"
                                            >
                                                <FiMonitor /> Reprint Invoice
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Customer Modal */}
            {showCustomerModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-slate-800">Add New Customer</h2>
                            <button onClick={() => setShowCustomerModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                        </div>
                        <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                                <input required className="input" placeholder="e.g. Jane Doe" value={newCustomerData.name} onChange={e => setNewCustomerData({ ...newCustomerData, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                <input className="input" placeholder="e.g. 9876543210" value={newCustomerData.phone} onChange={e => setNewCustomerData({ ...newCustomerData, phone: e.target.value })} />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCustomerModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Size Selection Modal */}
            {sizeModalProduct && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                            <div>
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Select Size</span>
                                <h2 className="text-lg font-bold text-slate-800 leading-tight mt-0.5">{sizeModalProduct.name}</h2>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    {sizeModalProduct.productTypeName && (
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            {sizeModalProduct.productTypeName}
                                        </span>
                                    )}
                                    {sizeModalProduct.gender && (
                                        <span className="text-xs text-slate-500 font-medium">
                                            • {sizeModalProduct.gender}
                                        </span>
                                    )}
                                    <span className="text-xs font-bold text-primary">
                                        • {currencyCode === 'AED' ? `${parseFloat(sizeModalProduct.price || 0).toFixed(2)} ${currencySymbol}` : `${currencySymbol}${parseFloat(sizeModalProduct.price || 0).toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSizeModalProduct(null)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition-colors"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Select Size</p>
                            <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                                {sizeModalProduct.variants?.map(v => {
                                    const stockVal = parseInt(v.stock, 10) || 0;
                                    const isZeroStock = stockVal <= 0;

                                    return (
                                        <button
                                            key={v.size}
                                            type="button"
                                            disabled={isZeroStock}
                                            onClick={() => {
                                                if (isZeroStock) return;
                                                addToCart(sizeModalProduct, v.size);
                                                setSizeModalProduct(null);
                                            }}
                                            className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all select-none ${
                                                isZeroStock
                                                    ? 'bg-slate-100/80 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed shadow-none'
                                                    : 'bg-white hover:bg-primary/5 hover:border-primary/40 border-slate-200 text-slate-800 active:scale-98 shadow-xs cursor-pointer'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 font-bold text-base">
                                                <span>{v.size} — {stockVal}</span>
                                            </div>
                                            {isZeroStock ? (
                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">
                                                    Disabled
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    Enabled
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                type="button"
                                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
                                onClick={() => setSizeModalProduct(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
