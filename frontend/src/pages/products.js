import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { FiPlus, FiPrinter, FiSearch, FiEdit, FiTrash2, FiBox, FiToggleLeft, FiToggleRight, FiLayers, FiTag, FiCheck, FiInfo, FiEye, FiX } from 'react-icons/fi';
import Barcode from 'react-barcode';
import { toast } from 'react-toastify';
import SearchableSelect from '@/components/SearchableSelect';
import { printZplViaQz, printImageViaQz, connectQZ, isQzConnected, getAvailablePrinters } from '@/lib/qzTray';
import { getCurrencySymbol } from '@/lib/currency';

const DEFAULT_GENDERS = ['Men', 'Women', 'Boy', 'Girl', 'Unisex'];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [brands, setBrands] = useState([]);
  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [addingBrand, setAddingBrand] = useState(false);

  const initialFormState = {
    id: null,
    name: '',
    selectedBrandIds: [],
    brandId: '',
    brandName: '',
    categoryId: '',
    categoryName: '',
    productTypeId: '',
    productTypeName: '',
    gender: '',
    attributes: {},
    sizeMode: 'single', // 'single' or 'multi'
    size: '',
    sizeStocks: [],
    stock: '0',
    price: '',
    costPrice: '',
    taxRate: '0',
    taxType: 'none',
    taxPercent: '0',
    hsnCode: '',
    warranty: '0',
    description: '',
    barcode: '',
    hasBarcode: true,
    minDiscount: '',
    maxDiscount: '',
    isTaxInclusive: false,
    isActive: true,
    brandPrices: {}
  };

  const [formData, setFormData] = useState(initialFormState);
  const [file, setFile] = useState(null); // For Image Upload
  const [imagePreview, setImagePreview] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [customSizeInput, setCustomSizeInput] = useState('');

  const DEFAULT_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '28', '30', '32', '34', '36', '38', '40', '42', '44', 'Free Size'];

  // Barcode Label Resolution, Preview & Print State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewDimensions, setPreviewDimensions] = useState(null);
  const [resolvedLabelTemplate, setResolvedLabelTemplate] = useState(null);
  const [resolvedZpl, setResolvedZpl] = useState('');
  const [printTargetProduct, setPrintTargetProduct] = useState(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [selectedPrintBranchId, setSelectedPrintBranchId] = useState('');
  const [selectedPrintBrandId, setSelectedPrintBrandId] = useState('');
  const [selectedPrintSize, setSelectedPrintSize] = useState('');
  const [availablePrintSizes, setAvailablePrintSizes] = useState([]);
  const [printExecuting, setPrintExecuting] = useState(false);

  // QZ Tray Setup & Live Printer Selection State
  const [qzConnected, setQzConnected] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [printerList, setPrinterList] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');

  const checkAndLoadQzPrinters = async () => {
    const connected = isQzConnected();
    setQzConnected(connected);
    if (connected) {
      try {
        const printers = await getAvailablePrinters();
        setPrinterList(printers);
        if (printers.length > 0 && !selectedPrinter) {
          const zebra = printers.find(p => p.toLowerCase().includes('zebra'));
          setSelectedPrinter(zebra || printers[0]);
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const handleConnectQzTray = async () => {
    setQzConnecting(true);
    try {
      await connectQZ();
      setQzConnected(true);
      toast.success('Connected to QZ Tray!');
      const printers = await getAvailablePrinters();
      setPrinterList(printers);
      if (printers.length > 0 && !selectedPrinter) {
        const zebra = printers.find(p => p.toLowerCase().includes('zebra'));
        setSelectedPrinter(zebra || printers[0]);
      }
    } catch (err) {
      toast.error('Could not connect to QZ Tray. Make sure QZ Tray is running on your computer.');
      setQzConnected(false);
    } finally {
      setQzConnecting(false);
    }
  };

  const [barcodeSettings, setBarcodeSettings] = useState({
    nameFontSize: 20,
    priceFontSize: 16,
    barcodeWidth: 2,
    barcodeHeight: 100,
    barcodeFontSize: 18,
    alignment: 'center',
    showName: true,
    showPrice: true,
    showBarcodeValue: true,
    paperSize: 'Single',
    columns: 1,
    margin: 10,
    labelWidth: 40,
    labelHeight: 20,
    paperWidth: 210,
    columnGap: 5,
    rowGap: 5
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProductType, setFilterProductType] = useState('');
  const [filterStock, setFilterStock] = useState('all'); // all, low, out
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('all');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      if (u.branchId) {
        setSelectedBranch(u.branchId.toString());
      }
    }
  }, []);

  const activeBranchObj = useMemo(() => {
    if (selectedBranch && selectedBranch !== 'all') {
      const found = branches.find(b => b.id.toString() === selectedBranch.toString());
      if (found) return found;
    }
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        if (u.branchId) {
          const userBranch = branches.find(b => b.id.toString() === u.branchId.toString());
          if (userBranch) return userBranch;
        }
      } catch (e) {}
    }
    return branches[0] || null;
  }, [selectedBranch, branches]);

  const activeCurrencySymbol = useMemo(() => {
    if (activeBranchObj?.currencySymbol) {
      return activeBranchObj.currencySymbol;
    }
    if (activeBranchObj?.currencyCode) {
      return getCurrencySymbol(activeBranchObj.currencyCode);
    }
    return companyProfile?.currencySymbol || getCurrencySymbol(companyProfile?.currencyCode) || '₹';
  }, [activeBranchObj, companyProfile]);

  const fetchProducts = async (targetBranch) => {
    try {
      const storedUser = localStorage.getItem('user');
      const userObj = storedUser ? JSON.parse(storedUser) : null;
      
      const activeBranchFilter = targetBranch !== undefined ? targetBranch : selectedBranch;
      const branchIdParam = activeBranchFilter === 'all' ? undefined : activeBranchFilter;

      const [prodRes, compRes, catRes, ptRes, brandRes, branchRes] = await Promise.all([
        api.get('/products', { params: { branchId: branchIdParam } }),
        api.get('/company'),
        api.get('/categories'),
        api.get('/product-types'),
        api.get('/brands'),
        api.get('/branches').catch(() => ({ data: [] }))
      ]);
      setProducts(prodRes.data);
      setCompanyProfile(compRes.data);
      setCategories(catRes.data);
      setProductTypes(ptRes.data);
      setBrands(brandRes.data || []);
      setBranches(branchRes.data || []);

      if (branchIdParam) {
        try {
          const { data: bSetting } = await api.get(`/barcode-settings/${branchIdParam}`);
          if (bSetting) {
            setBarcodeSettings(prev => ({
              ...prev,
              ...bSetting,
              labelWidth: bSetting.labelWidth ?? 40,
              labelHeight: bSetting.labelHeight ?? 20,
              paperWidth: bSetting.paperWidth ?? 210,
              columnGap: bSetting.columnGap ?? 5,
              rowGap: bSetting.rowGap ?? 5
            }));
          }
        } catch (e) {
          // ignore error fetching branch barcode settings
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableBrandsForProduct = (product, brandsList) => {
    if (!product) return [];

    let parsedBrandPrices = product.brandPrices;
    if (typeof parsedBrandPrices === 'string') {
      try { parsedBrandPrices = JSON.parse(parsedBrandPrices); } catch (e) { parsedBrandPrices = {}; }
    }

    const bMap = new Map();

    if (parsedBrandPrices && typeof parsedBrandPrices === 'object') {
      Object.keys(parsedBrandPrices).forEach(bIdStr => {
        const bId = parseInt(bIdStr, 10);
        if (!isNaN(bId)) {
          const matchedBrand = (brandsList || []).find(b => b.id === bId);
          bMap.set(bId, {
            id: bId,
            name: matchedBrand ? matchedBrand.name : (product.brandName || `Brand #${bId}`)
          });
        }
      });
    }

    const primaryId = product.brandId || product.brand?.id;
    const primaryName = product.brandName || product.brand?.name;
    if (primaryId && !bMap.has(primaryId)) {
      const matchedBrand = (brandsList || []).find(b => b.id === primaryId);
      bMap.set(primaryId, { id: primaryId, name: matchedBrand ? matchedBrand.name : (primaryName || `Brand #${primaryId}`) });
    }

    const list = Array.from(bMap.values());
    if (list.length === 0 && primaryName) {
      list.push({ id: primaryId || null, name: primaryName });
    }

    return list;
  };

  const getSizesForBrand = (product, brandId) => {
    if (!product) return [];

    let parsedBrandPrices = product.brandPrices;
    if (typeof parsedBrandPrices === 'string') {
      try { parsedBrandPrices = JSON.parse(parsedBrandPrices); } catch (e) { parsedBrandPrices = null; }
    }

    if (parsedBrandPrices && brandId && parsedBrandPrices[brandId]) {
      const bEntry = parsedBrandPrices[brandId];
      let bSizeStocks = bEntry.sizeStocks;
      if (typeof bSizeStocks === 'string') {
        try { bSizeStocks = JSON.parse(bSizeStocks); } catch (e) { bSizeStocks = []; }
      }

      if (Array.isArray(bSizeStocks) && bSizeStocks.length > 0) {
        return bSizeStocks.map(s => ({
          size: s.size,
          currentStock: parseInt(s.stock, 10) || 0,
          quantity: 0
        }));
      }

      if (Array.isArray(bEntry.sizes) && bEntry.sizes.length > 0) {
        return bEntry.sizes.map(sz => ({
          size: sz,
          currentStock: 0,
          quantity: 0
        }));
      }
    }

    // Fallback to product root sizeStocks
    let rootSizeStocks = product.sizeStocks;
    if (typeof rootSizeStocks === 'string') {
      try { rootSizeStocks = JSON.parse(rootSizeStocks); } catch (e) { rootSizeStocks = []; }
    }

    if (Array.isArray(rootSizeStocks) && rootSizeStocks.length > 0) {
      return rootSizeStocks.map(s => ({
        size: s.size,
        currentStock: parseInt(s.stock, 10) || 0,
        quantity: 0
      }));
    }

    if (product.size) {
      const rawSizes = product.size.includes(',')
        ? product.size.split(',').map(s => s.trim()).filter(Boolean)
        : [product.size.trim()];
      return rawSizes.map(sz => ({
        size: sz,
        currentStock: parseInt(product.stock, 10) || 0,
        quantity: 0
      }));
    }

    return [{
      size: 'Free Size',
      currentStock: parseInt(product.stock, 10) || 0,
      quantity: 0
    }];
  };

  const generateZplAndPreview = async (product, brandId, branchId, selectedSize, labelTemplate) => {
    // 1. Resolve Brand, Barcode & Price
    let activeBarcode = product.barcode || '';
    let activePrice = product.price !== undefined && product.price !== null ? String(product.price) : '0';

    let parsedBrandPrices = product.brandPrices;
    if (typeof parsedBrandPrices === 'string') {
      try { parsedBrandPrices = JSON.parse(parsedBrandPrices); } catch (e) { parsedBrandPrices = null; }
    }

    if (brandId) {
      if (parsedBrandPrices && parsedBrandPrices[brandId]) {
        const bData = parsedBrandPrices[brandId];
        if (bData.barcode) activeBarcode = bData.barcode;
        if (bData.price) activePrice = String(bData.price);
      } else {
        const bObj = brands.find(b => String(b.id) === String(brandId));
        if (bObj && bObj.barcode) {
          activeBarcode = bObj.barcode;
        }
      }
    }

    if (!activeBarcode) {
      activeBarcode = 'BC' + Date.now().toString().slice(-10);
    }

    // 2. Resolve Branch Name
    let selectedBranchObj = null;
    if (branchId) {
      selectedBranchObj = branches.find(b => String(b.id) === String(branchId));
    }
    const branchNameStr = selectedBranchObj ? selectedBranchObj.name : '';

    // 3. Resolve Size
    const sizeStr = selectedSize || product.size || '';

    // 4. Base ZPL template for 38mm x 25mm dimensions (304 x 200 dots at 203 DPI)
    let zpl = labelTemplate?.rawZpl;
    if (!zpl || !zpl.trim()) {
      zpl = `^XA
^PW304
^LL200
^CI28
^FO15,25^A0N,16,16^FD{{productName}}^FS
^BY1.5,2.5,30^FO15,45^BCN,30,N,N,N^FD{{barcode}}^FS
^FO15,80^A0N,14,14^FD{{barcode}}^FS
^FO15,100^A0N,16,16^FDPRICE: ${activeCurrencySymbol} {{price}}^FS
^FO15,120^A0N,16,16^FDSIZE: {{size}}^FS
^FO15,140^A0N,14,14^FD{{branchName}}^FS
^PQ1,0,0,N
^XZ`;
    }

    const pName = product.name || '';

    const replacements = {
      productName: pName,
      name: pName,
      product_name: pName,
      'product name': pName,
      barcode: activeBarcode,
      barcodeNumber: activeBarcode,
      barcode_number: activeBarcode,
      'barcode number': activeBarcode,
      sku: activeBarcode,
      price: activePrice,
      mrp: activePrice,
      'price/mrp': activePrice,
      price_mrp: activePrice,
      sellingPrice: activePrice,
      selling_price: activePrice,
      size: sizeStr,
      branchName: branchNameStr,
      branch_name: branchNameStr,
      branch: branchNameStr,
      category: product.categoryName || '',
      company: companyProfile?.companyName || ''
    };

    Object.entries(replacements).forEach(([key, val]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexDouble = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'gi');
      const regexSingle = new RegExp(`\\{\\s*${escapedKey}\\s*\\}`, 'gi');
      zpl = zpl.replace(regexDouble, val).replace(regexSingle, val);
    });

    // Fallback replacement for legacy samples
    if (zpl.includes('SK1252612334') || zpl.includes('SK1252612335')) {
      zpl = zpl.replace(/SK1252612334/g, activeBarcode).replace(/SK1252612335/g, activeBarcode);
    }
    if (zpl.includes('PENDANT')) {
      zpl = zpl.replace(/PENDANT/g, pName);
    }
    if (product.price && zpl.includes('^FD1500^FS')) {
      zpl = zpl.replace(/\^FD1500\^FS/g, `^FD${activePrice}^FS`);
    }

    setResolvedZpl(zpl);
    setPreviewLoading(true);

    try {
      const { data } = await api.post('/barcode-templates/render-preview', {
        zpl,
        labelWidth: 38,
        labelHeight: 25,
        dpi: 203,
        sampleProduct: {
          name: pName,
          barcode: activeBarcode,
          price: activePrice,
          size: sizeStr,
          branchName: branchNameStr
        }
      });

      if (data.success && data.image) {
        setPreviewImage(data.image);
        setPreviewDimensions(data.dimensions);
      }
    } catch (err) {
      console.error('Failed to render barcode preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenPrintModal = async (product) => {
    // 1. Resolve Category & Default Label Design
    let productCat = null;
    const catId = product.categoryId || product.category?.id;
    if (catId) {
      productCat = categories.find(c => String(c.id) === String(catId));
    }
    if (!productCat && product.category && typeof product.category === 'object') {
      productCat = product.category;
    }
    if (!productCat && product.categoryName) {
      productCat = categories.find(c => c.name?.toLowerCase() === product.categoryName.toLowerCase());
    }

    let labelTemplate = productCat?.defaultLabelDesign;
    let templateId = productCat?.defaultLabelDesignId || labelTemplate?.id;

    if (!templateId && productCat?.id) {
      try {
        const { data: catDetails } = await api.get(`/categories/${productCat.id}/attributes`);
        if (catDetails?.defaultLabelDesignId) {
          templateId = catDetails.defaultLabelDesignId;
          labelTemplate = catDetails.defaultLabelDesign;
        }
      } catch (e) {
        console.warn('Could not fetch category details:', e);
      }
    }

    if ((!labelTemplate || !labelTemplate.rawZpl) && templateId) {
      try {
        const { data: tpl } = await api.get(`/barcode-templates/${templateId}`);
        labelTemplate = tpl;
      } catch (e) {
        console.warn('Could not fetch template by ID:', e);
      }
    }

    // 2. Resolve initial Branch
    const storedUser = localStorage.getItem('user');
    const uBranchId = storedUser ? JSON.parse(storedUser).branchId : null;
    const initialBranchId = uBranchId ? String(uBranchId) : (selectedBranch !== 'all' ? selectedBranch : (branches[0]?.id ? String(branches[0].id) : ''));

    // 3. Resolve initial Brand
    const availableBrands = getAvailableBrandsForProduct(product, brands);
    const initialBrandId = availableBrands[0]?.id ? String(availableBrands[0].id) : (product.brandId ? String(product.brandId) : '');

    // 4. Resolve initial Sizes for the selected Brand
    const sizes = getSizesForBrand(product, initialBrandId);
    const firstSizeStr = sizes.length > 0 ? (typeof sizes[0] === 'object' ? sizes[0].size : sizes[0]) : (product.size || '');

    setPrintTargetProduct(product);
    setSelectedPrintBranchId(initialBranchId);
    setSelectedPrintBrandId(initialBrandId);
    setAvailablePrintSizes(sizes);
    setSelectedPrintSize(firstSizeStr);
    setResolvedLabelTemplate(labelTemplate);
    setPrintQuantity(1);
    setPreviewImage(null);
    setPreviewDimensions(null);
    setShowPreviewModal(true);

    checkAndLoadQzPrinters();

    await generateZplAndPreview(product, initialBrandId, initialBranchId, firstSizeStr, labelTemplate);
  };

  const handlePrintBranchChange = async (newBranchId) => {
    setSelectedPrintBranchId(newBranchId);
    if (printTargetProduct) {
      await generateZplAndPreview(printTargetProduct, selectedPrintBrandId, newBranchId, selectedPrintSize, resolvedLabelTemplate);
    }
  };

  const handlePrintBrandChange = async (newBrandId) => {
    setSelectedPrintBrandId(newBrandId);
    if (printTargetProduct) {
      const sizes = getSizesForBrand(printTargetProduct, newBrandId);
      setAvailablePrintSizes(sizes);
      const newFirstSize = sizes.length > 0 ? (typeof sizes[0] === 'object' ? sizes[0].size : sizes[0]) : '';
      setSelectedPrintSize(newFirstSize);
      await generateZplAndPreview(printTargetProduct, newBrandId, selectedPrintBranchId, newFirstSize, resolvedLabelTemplate);
    }
  };

  const handlePrintSizeChange = async (newSize) => {
    setSelectedPrintSize(newSize);
    if (printTargetProduct) {
      await generateZplAndPreview(printTargetProduct, selectedPrintBrandId, selectedPrintBranchId, newSize, resolvedLabelTemplate);
    }
  };

  const handleExecutePrint = async () => {
    const rawVal = String(printQuantity).trim();
    if (!rawVal) {
      toast.error('Please enter the number of labels to print');
      return;
    }
    if (!/^\d+$/.test(rawVal)) {
      toast.error('Please enter a valid positive whole number (no decimals or symbols)');
      return;
    }
    const qty = parseInt(rawVal, 10);
    if (qty <= 0) {
      toast.error('Number of labels must be at least 1');
      return;
    }

    const product = printTargetProduct;
    if (!product || !resolvedZpl) return;

    setPrintExecuting(true);
    try {
      let result;
      const targetPrinterLower = selectedPrinter ? selectedPrinter.toLowerCase() : '';
      const dims = previewDimensions || { width: 38, height: 25 };
      // If the target printer is TSC or a non-Zebra thermal printer, print raster image rendered from preview
      if (previewImage && (targetPrinterLower.includes('tsc') || (!targetPrinterLower.includes('zebra') && targetPrinterLower.length > 0))) {
        result = await printImageViaQz(previewImage, qty, selectedPrinter || null, dims);
      } else {
        try {
          result = await printZplViaQz(resolvedZpl, qty, selectedPrinter || null);
        } catch (zplErr) {
          // If ZPL raw mode fails or prints blank on non-Zebra hardware, fallback to image printing if preview image exists
          if (previewImage) {
            result = await printImageViaQz(previewImage, qty, selectedPrinter || null, dims);
          } else {
            throw zplErr;
          }
        }
      }
      toast.success(result.message || `Sent ${qty} label(s) for "${product.name}" to printer via QZ Tray.`);
      setShowPreviewModal(false);
    } catch (err) {
      console.error('Print request failed:', err);
      if (err.message === 'QZ_NOT_CONNECTED' || err.message?.includes('QZ')) {
        toast.error('QZ Tray is not connected. Please make sure QZ Tray is running on your computer to print labels.');
      } else if (err.message === 'NO_PRINTER_FOUND') {
        toast.error('No printer found in QZ Tray. Please check your printer connection.');
      } else {
        toast.error('Print request failed: ' + (err.message || 'Unknown printer error'));
      }
    } finally {
      setPrintExecuting(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (showModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showModal]);

  // Filtered product types based on selected Category in modal
  const categoryProductTypes = useMemo(() => {
    if (!formData.categoryId) return [];
    return productTypes.filter(
      pt => pt.categoryId?.toString() === formData.categoryId?.toString() && pt.isActive !== false
    );
  }, [formData.categoryId, productTypes]);

  // Filtered Brands based on selected Category in modal
  const categoryBrands = useMemo(() => {
    if (!formData.categoryId) return brands;
    return brands.filter(
      b => !b.categoryId || String(b.categoryId) === String(formData.categoryId)
    );
  }, [formData.categoryId, brands]);

  // Active and selected brands to display cards for in Product Create/Edit modal
  const activeSelectedBrands = useMemo(() => {
    const selectedSet = new Set((formData.selectedBrandIds || []).map(String));
    return categoryBrands.filter(b => {
      const bIdStr = String(b.id);
      const entry = formData.brandPrices?.[bIdStr];
      const isDeleted = entry && typeof entry === 'object' && entry.isDeleted === true;
      return selectedSet.has(bIdStr) && !isDeleted;
    });
  }, [categoryBrands, formData.selectedBrandIds, formData.brandPrices]);

  // Selected Product Type object
  const selectedProductTypeObj = useMemo(() => {
    if (!formData.productTypeId) return null;
    return productTypes.find(pt => pt.id?.toString() === formData.productTypeId?.toString()) || null;
  }, [formData.productTypeId, productTypes]);

  // Available Genders from selected product type
  const availableGenders = useMemo(() => {
    if (selectedProductTypeObj && Array.isArray(selectedProductTypeObj.genders) && selectedProductTypeObj.genders.length > 0) {
      return selectedProductTypeObj.genders;
    }
    return DEFAULT_GENDERS;
  }, [selectedProductTypeObj]);

  // Configured Attributes from selected product type
  const configuredAttributes = useMemo(() => {
    if (selectedProductTypeObj && Array.isArray(selectedProductTypeObj.attributes)) {
      return selectedProductTypeObj.attributes;
    }
    return [];
  }, [selectedProductTypeObj]);

  // Configured Sizes from selected product type or default
  const configuredSizes = useMemo(() => {
    if (selectedProductTypeObj && Array.isArray(selectedProductTypeObj.sizes) && selectedProductTypeObj.sizes.length > 0) {
      return selectedProductTypeObj.sizes;
    }
    return [];
  }, [selectedProductTypeObj]);

  const availableSizeOptions = useMemo(() => {
    if (configuredSizes && configuredSizes.length > 0) {
      return configuredSizes;
    }
    return [];
  }, [configuredSizes]);

  // Calculate total aggregated stock for a size across all brand-specific size stocks
  const getAggregatedSizeStock = (sizeName, fallbackStock = 0) => {
    let sum = 0;
    let hasBrandStock = false;
    if (formData.brandPrices && Object.keys(formData.brandPrices).length > 0) {
      Object.values(formData.brandPrices).forEach(entry => {
        if (entry && Array.isArray(entry.sizeStocks)) {
          const sizeItem = entry.sizeStocks.find(s => s.size === sizeName);
          if (sizeItem) {
            sum += (parseInt(sizeItem.stock, 10) || 0);
            hasBrandStock = true;
          }
        }
      });
    }
    return hasBrandStock ? sum : (parseInt(fallbackStock, 10) || 0);
  };

  const handleToggleSize = (sizeName) => {
    setFormData(prev => {
      const existingIdx = (prev.sizeStocks || []).findIndex(item => item.size === sizeName);
      let updatedList = [...(prev.sizeStocks || [])];

      if (existingIdx >= 0) {
        updatedList.splice(existingIdx, 1);
      } else {
        updatedList.push({ size: sizeName, stock: 0 });
      }

      const totalCalculatedStock = updatedList.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);
      const sizeStr = updatedList.map(item => item.size).join(', ');

      return {
        ...prev,
        sizeStocks: updatedList,
        stock: totalCalculatedStock.toString(),
        size: sizeStr
      };
    });
  };

  const handleAddCustomSize = (e) => {
    if (e) e.preventDefault();
    const trimmed = customSizeInput.trim();
    if (!trimmed) return;

    const isSelected = (formData.sizeStocks || []).some(s => s.size.toLowerCase() === trimmed.toLowerCase());
    if (!isSelected) {
      handleToggleSize(trimmed);
    }
    setCustomSizeInput('');
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImagePreview(URL.createObjectURL(selectedFile));
    }
  };

  // Helper to generate a unique barcode string guaranteed not to exist in DB or current form
  const getGuaranteedUniqueBarcode = (existingFormBarcodes = [], excludeProductId = null) => {
    const activeSet = new Set();

    (products || []).forEach(p => {
      if (excludeProductId && String(p.id) === String(excludeProductId)) return;
      if (p.barcode && typeof p.barcode === 'string' && p.barcode.trim()) {
        activeSet.add(p.barcode.trim().toLowerCase());
      }
      let bp = p.brandPrices;
      if (typeof bp === 'string') {
        try { bp = JSON.parse(bp); } catch (e) { bp = null; }
      }
      if (bp && typeof bp === 'object') {
        Object.values(bp).forEach(bEntry => {
          if (bEntry && !bEntry.isDeleted && bEntry.barcode && typeof bEntry.barcode === 'string' && bEntry.barcode.trim()) {
            activeSet.add(bEntry.barcode.trim().toLowerCase());
          }
        });
      }
    });

    (existingFormBarcodes || []).forEach(bc => {
      if (bc && typeof bc === 'string' && bc.trim()) {
        activeSet.add(bc.trim().toLowerCase());
      }
    });

    let attempts = 0;
    while (attempts < 1000) {
      attempts++;
      const ts = Date.now().toString().slice(-8);
      const rand = Math.floor(1000 + Math.random() * 9000).toString();
      const candidate = `BC${ts}${rand}`;
      if (!activeSet.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `BC${Date.now()}${Math.floor(Math.random() * 100000)}`;
  };

  // Pre-submit validation: auto-repair auto-generated duplicates, block manual duplicates with error
  const ensureUniqueBarcodesBeforeSubmit = (currentFormData) => {
    if (currentFormData.id) {
      return {
        updatedBarcode: currentFormData.barcode || '',
        updatedBrandPrices: currentFormData.brandPrices || {}
      };
    }

    const activeSet = new Set();
    const currentId = currentFormData.id ? String(currentFormData.id) : null;

    (products || []).forEach(p => {
      if (currentId && String(p.id) === currentId) return;
      if (p.barcode && typeof p.barcode === 'string' && p.barcode.trim()) {
        activeSet.add(p.barcode.trim().toLowerCase());
      }
      let bp = p.brandPrices;
      if (typeof bp === 'string') {
        try { bp = JSON.parse(bp); } catch (e) { bp = null; }
      }
      if (bp && typeof bp === 'object') {
        Object.values(bp).forEach(bEntry => {
          if (bEntry && !bEntry.isDeleted && bEntry.barcode && typeof bEntry.barcode === 'string' && bEntry.barcode.trim()) {
            activeSet.add(bEntry.barcode.trim().toLowerCase());
          }
        });
      }
    });

    const payloadSeen = new Set();
    let updatedBarcode = currentFormData.barcode || '';
    let updatedBrandPrices = { ...(currentFormData.brandPrices || {}) };

    if (currentFormData.hasBarcode && updatedBarcode.trim()) {
      const lower = updatedBarcode.trim().toLowerCase();
      const isAuto = currentFormData.barcodeIsAutoGenerated === true;

      if (activeSet.has(lower)) {
        if (isAuto) {
          updatedBarcode = getGuaranteedUniqueBarcode([...activeSet, ...payloadSeen], currentId);
          payloadSeen.add(updatedBarcode.toLowerCase());
        } else {
          toast.error('This barcode already exists. Please enter a unique barcode.');
          return null;
        }
      } else {
        payloadSeen.add(lower);
      }
    }

    if (updatedBrandPrices && typeof updatedBrandPrices === 'object') {
      const selectedBrandIds = (currentFormData.selectedBrandIds || []).map(String);
      const primaryBrandIdStr = currentFormData.brandId ? String(currentFormData.brandId) : (selectedBrandIds[0] || '');

      if (primaryBrandIdStr && updatedBrandPrices[primaryBrandIdStr] && (selectedBrandIds.length <= 1 || updatedBrandPrices[primaryBrandIdStr].isAutoGenerated)) {
        updatedBrandPrices[primaryBrandIdStr] = {
          ...updatedBrandPrices[primaryBrandIdStr],
          barcode: updatedBarcode
        };
      }

      const mainLower = updatedBarcode ? updatedBarcode.trim().toLowerCase() : '';

      for (const bIdStr of selectedBrandIds) {
        const entry = updatedBrandPrices[bIdStr];
        if (entry && !entry.isDeleted && entry.barcode && entry.barcode.trim()) {
          let bCode = entry.barcode.trim();
          const bLower = bCode.toLowerCase();
          const bIsAuto = entry.isAutoGenerated === true;

          // If the brand barcode matches the main product barcode of this new product, allow it
          if (mainLower && bLower === mainLower) {
            continue;
          }

          if (activeSet.has(bLower) || payloadSeen.has(bLower)) {
            if (bIsAuto) {
              bCode = getGuaranteedUniqueBarcode([...activeSet, ...payloadSeen], currentId);
              updatedBrandPrices[bIdStr] = {
                ...entry,
                barcode: bCode,
                isAutoGenerated: true
              };
              payloadSeen.add(bCode.toLowerCase());
            } else {
              toast.error('This barcode already exists. Please enter a unique barcode.');
              return null;
            }
          } else {
            payloadSeen.add(bLower);
          }
        }
      }
    }

    return {
      updatedBarcode,
      updatedBrandPrices
    };
  };

  // Open modal for new product
  const handleAddNew = () => {
    setFormData(initialFormState);
    setFile(null);
    setImagePreview(null);
    setShowModal(true);
  };

  // Handle Multi-Brand selection change
  const handleMultiBrandChange = (selectedValArray) => {
    const arr = (selectedValArray || []).map(String);
    setFormData(prev => {
      const updatedBrandPrices = { ...(prev.brandPrices || {}) };

      const currentFormBarcodes = [];
      if (prev.barcode) currentFormBarcodes.push(prev.barcode);
      Object.values(updatedBrandPrices).forEach(e => {
        if (e && !e.isDeleted && e.barcode) currentFormBarcodes.push(e.barcode);
      });

      // Initialize any newly selected brand
      arr.forEach(bIdStr => {
        const existing = updatedBrandPrices[bIdStr];
        const matchedBrand = brands.find(b => String(b.id) === bIdStr);
        if (!existing || typeof existing !== 'object' || existing.isDeleted) {
          let assignedBarcode = matchedBrand && matchedBrand.barcode ? matchedBrand.barcode : '';
          let isAuto = false;

          if (!assignedBarcode) {
            assignedBarcode = getGuaranteedUniqueBarcode(currentFormBarcodes, prev.id);
            currentFormBarcodes.push(assignedBarcode);
            isAuto = true;
          }

          updatedBrandPrices[bIdStr] = {
            price: prev.price || '',
            barcode: assignedBarcode,
            isAutoGenerated: isAuto,
            sizeStocks: [],
            isDeleted: false
          };
        } else {
          updatedBrandPrices[bIdStr] = {
            ...existing,
            isDeleted: false
          };
        }
      });

      const firstSelectedId = arr[0] || '';
      const firstSelectedBrand = brands.find(b => String(b.id) === firstSelectedId);

      let mainBarcode = prev.barcode;
      let mainBarcodeIsAuto = prev.barcodeIsAutoGenerated;
      if (!prev.id && (!prev.barcode || prev.barcodeIsAutoGenerated)) {
        if (firstSelectedId && updatedBrandPrices[firstSelectedId]?.barcode) {
          mainBarcode = updatedBrandPrices[firstSelectedId].barcode;
          mainBarcodeIsAuto = updatedBrandPrices[firstSelectedId].isAutoGenerated !== false;
        }
      }

      return {
        ...prev,
        selectedBrandIds: arr,
        brandId: firstSelectedId,
        brandName: firstSelectedBrand ? firstSelectedBrand.name : (firstSelectedId ? prev.brandName : ''),
        barcode: mainBarcode,
        barcodeIsAutoGenerated: mainBarcodeIsAuto,
        brandPrices: updatedBrandPrices
      };
    });
  };

  // Remove / Soft-Delete a Brand Card (Stock Check)
  const handleRemoveBrandCard = (brandIdVal) => {
    const bIdStr = String(brandIdVal);
    const entry = formData.brandPrices?.[bIdStr];
    let brandSizeStocks = [];

    if (typeof entry === 'object' && entry !== null) {
      brandSizeStocks = Array.isArray(entry.sizeStocks) ? entry.sizeStocks : [];
    }

    // Calculate stock for this brand (sum of non-deleted size stocks)
    const brandStock = brandSizeStocks
      .filter(s => !s.isDeleted)
      .reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);

    if (brandStock > 0) {
      toast.error('This brand cannot be deleted because stock exists.');
      return;
    }

    // Perform Soft Delete
    setFormData(prev => {
      const updatedBrandPrices = { ...(prev.brandPrices || {}) };
      if (updatedBrandPrices[bIdStr]) {
        updatedBrandPrices[bIdStr] = {
          ...updatedBrandPrices[bIdStr],
          isDeleted: true,
          deletedAt: new Date().toISOString()
        };
      }

      const updatedSelectedBrandIds = (prev.selectedBrandIds || []).filter(id => String(id) !== bIdStr);
      const firstRemainingId = updatedSelectedBrandIds[0] || '';
      const firstRemainingBrand = brands.find(b => String(b.id) === firstRemainingId);

      return {
        ...prev,
        selectedBrandIds: updatedSelectedBrandIds,
        brandId: firstRemainingId,
        brandName: firstRemainingBrand ? firstRemainingBrand.name : '',
        brandPrices: updatedBrandPrices
      };
    });

    toast.success('Brand removed');
  };

  // Remove / Soft-Delete a Size from a Brand Card (Stock Check)
  const handleRemoveBrandSize = (brandIdVal, sizeName) => {
    const bIdStr = String(brandIdVal);
    const entry = formData.brandPrices?.[bIdStr];
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.sizeStocks)) return;

    const existingIdx = entry.sizeStocks.findIndex(item => item.size === sizeName && !item.isDeleted);
    if (existingIdx < 0) return;

    const sizeItem = entry.sizeStocks[existingIdx];
    const sizeStock = parseInt(sizeItem.stock, 10) || 0;

    if (sizeStock > 0) {
      toast.error('This size cannot be deleted because stock exists.');
      return;
    }

    // Soft delete size
    setFormData(prev => {
      const currentEntry = prev.brandPrices?.[bIdStr];
      if (!currentEntry || typeof currentEntry !== 'object') return prev;

      const sizeStocksCopy = Array.isArray(currentEntry.sizeStocks) ? [...currentEntry.sizeStocks] : [];
      const targetIdx = sizeStocksCopy.findIndex(item => item.size === sizeName && !item.isDeleted);

      if (targetIdx >= 0) {
        sizeStocksCopy[targetIdx] = {
          ...sizeStocksCopy[targetIdx],
          isDeleted: true,
          deletedAt: new Date().toISOString()
        };
      }

      const updatedBrandPrices = {
        ...(prev.brandPrices || {}),
        [bIdStr]: {
          ...currentEntry,
          sizeStocks: sizeStocksCopy
        }
      };

      return {
        ...prev,
        brandPrices: updatedBrandPrices
      };
    });

    toast.success(`Size ${sizeName} removed`);
  };

  // Handle Brand Price / Barcode change
  const handleBrandFieldChange = (brandIdVal, fieldKey, fieldValue) => {
    const bIdStr = String(brandIdVal);
    setFormData(prev => {
      const currentEntry = prev.brandPrices?.[bIdStr];
      let brandObj = { price: '', barcode: '', sizeStocks: [], isAutoGenerated: false };
      if (typeof currentEntry === 'object' && currentEntry !== null) {
        brandObj = { ...currentEntry };
      } else if (currentEntry !== undefined && currentEntry !== '') {
        brandObj.price = currentEntry.toString();
      }

      brandObj[fieldKey] = fieldValue;

      if (fieldKey === 'barcode') {
        brandObj.isAutoGenerated = false;
      }

      if (fieldKey === 'price' && fieldValue && !brandObj.barcode) {
        const currentFormBarcodes = [prev.barcode];
        Object.values(prev.brandPrices || {}).forEach(e => {
          if (e && !e.isDeleted && e.barcode) currentFormBarcodes.push(e.barcode);
        });
        brandObj.barcode = getGuaranteedUniqueBarcode(currentFormBarcodes, prev.id);
        brandObj.isAutoGenerated = true;
      }

      const updatedBrandPrices = {
        ...(prev.brandPrices || {}),
        [bIdStr]: brandObj
      };

      const isSelectedBrand = String(prev.brandId) === bIdStr;
      return {
        ...prev,
        brandPrices: updatedBrandPrices,
        price: isSelectedBrand && fieldKey === 'price' ? fieldValue : prev.price,
        barcode: isSelectedBrand && fieldKey === 'barcode' ? fieldValue : (isSelectedBrand && brandObj.barcode ? brandObj.barcode : prev.barcode),
        barcodeIsAutoGenerated: isSelectedBrand && fieldKey === 'barcode' ? false : prev.barcodeIsAutoGenerated
      };
    });
  };

  // Toggle Size for a specific Brand
  const handleToggleBrandSize = (brandIdVal, sizeName) => {
    const bIdStr = String(brandIdVal);
    const entry = formData.brandPrices?.[bIdStr];
    let brandSizeStocks = [];
    if (typeof entry === 'object' && entry !== null && Array.isArray(entry.sizeStocks)) {
      brandSizeStocks = entry.sizeStocks;
    }

    const activeItem = brandSizeStocks.find(item => item.size === sizeName && !item.isDeleted);
    if (activeItem) {
      handleRemoveBrandSize(brandIdVal, sizeName);
      return;
    }

    setFormData(prev => {
      const currentEntry = prev.brandPrices?.[bIdStr];
      let brandObj = { price: '', barcode: '', sizeStocks: [] };
      if (typeof currentEntry === 'object' && currentEntry !== null) {
        brandObj = { ...currentEntry, sizeStocks: Array.isArray(currentEntry.sizeStocks) ? [...currentEntry.sizeStocks] : [] };
      } else if (currentEntry !== undefined && currentEntry !== '') {
        brandObj.price = currentEntry.toString();
      }

      const softDeletedIdx = brandObj.sizeStocks.findIndex(item => item.size === sizeName && item.isDeleted);
      if (softDeletedIdx >= 0) {
        brandObj.sizeStocks[softDeletedIdx] = {
          ...brandObj.sizeStocks[softDeletedIdx],
          isDeleted: false,
          deletedAt: null
        };
      } else {
        brandObj.sizeStocks.push({ size: sizeName, stock: 0 });
      }

      const updatedBrandPrices = {
        ...(prev.brandPrices || {}),
        [bIdStr]: brandObj
      };

      const isSelectedBrand = String(prev.brandId) === bIdStr;
      const activeSizeStocks = brandObj.sizeStocks.filter(s => !s.isDeleted);
      const totalBrandStock = activeSizeStocks.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);
      const brandSizeStr = activeSizeStocks.map(s => s.size).join(', ');

      let totalAllBrandsStock = 0;
      Object.values(updatedBrandPrices).forEach(bEntry => {
        if (bEntry && Array.isArray(bEntry.sizeStocks)) {
          totalAllBrandsStock += bEntry.sizeStocks
            .filter(s => !s.isDeleted)
            .reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);
        }
      });

      return {
        ...prev,
        brandPrices: updatedBrandPrices,
        sizeStocks: isSelectedBrand ? activeSizeStocks : prev.sizeStocks,
        size: isSelectedBrand ? brandSizeStr : prev.size,
        stock: totalAllBrandsStock > 0 ? totalAllBrandsStock.toString() : (isSelectedBrand ? totalBrandStock.toString() : prev.stock)
      };
    });
  };

  // Change individual size stock for a specific Brand
  const handleBrandSizeStockChange = (brandIdVal, sizeName, qty) => {
    const bIdStr = String(brandIdVal);
    const parsedQty = Math.max(0, parseInt(qty, 10) || 0);

    setFormData(prev => {
      const currentEntry = prev.brandPrices?.[bIdStr];
      let brandObj = { price: '', barcode: '', sizeStocks: [] };
      if (typeof currentEntry === 'object' && currentEntry !== null) {
        brandObj = { ...currentEntry, sizeStocks: Array.isArray(currentEntry.sizeStocks) ? [...currentEntry.sizeStocks] : [] };
      } else if (currentEntry !== undefined && currentEntry !== '') {
        brandObj.price = currentEntry.toString();
      }

      const existingIdx = brandObj.sizeStocks.findIndex(item => item.size === sizeName);
      if (existingIdx >= 0) {
        brandObj.sizeStocks[existingIdx] = { size: sizeName, stock: parsedQty };
      } else {
        brandObj.sizeStocks.push({ size: sizeName, stock: parsedQty });
      }

      const updatedBrandPrices = {
        ...(prev.brandPrices || {}),
        [bIdStr]: brandObj
      };

      const isSelectedBrand = String(prev.brandId) === bIdStr;
      const totalBrandStock = brandObj.sizeStocks.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);
      const brandSizeStr = brandObj.sizeStocks.map(s => s.size).join(', ');

      let totalAllBrandsStock = 0;
      Object.values(updatedBrandPrices).forEach(bEntry => {
        if (bEntry && Array.isArray(bEntry.sizeStocks)) {
          totalAllBrandsStock += bEntry.sizeStocks.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);
        }
      });

      return {
        ...prev,
        brandPrices: updatedBrandPrices,
        sizeStocks: isSelectedBrand ? brandObj.sizeStocks : prev.sizeStocks,
        size: isSelectedBrand ? brandSizeStr : prev.size,
        stock: totalAllBrandsStock > 0 ? totalAllBrandsStock.toString() : (isSelectedBrand ? totalBrandStock.toString() : prev.stock)
      };
    });
  };

  const handleGenerateBrandBarcode = (brandIdVal) => {
    const bIdStr = String(brandIdVal);
    const currentFormBarcodes = [];
    if (formData.barcode) currentFormBarcodes.push(formData.barcode);
    if (formData.brandPrices && typeof formData.brandPrices === 'object') {
      Object.keys(formData.brandPrices).forEach(k => {
        if (k !== bIdStr) {
          const entry = formData.brandPrices[k];
          if (entry && !entry.isDeleted && entry.barcode) currentFormBarcodes.push(entry.barcode);
        }
      });
    }

    const uniqueCode = getGuaranteedUniqueBarcode(currentFormBarcodes, formData.id);

    setFormData(prev => {
      const currentEntry = prev.brandPrices?.[bIdStr] || {};
      const updatedEntry = {
        ...currentEntry,
        barcode: uniqueCode,
        isAutoGenerated: true
      };
      const isSelectedBrand = String(prev.brandId) === bIdStr;

      return {
        ...prev,
        brandPrices: {
          ...(prev.brandPrices || {}),
          [bIdStr]: updatedEntry
        },
        barcode: isSelectedBrand ? uniqueCode : prev.barcode,
        barcodeIsAutoGenerated: isSelectedBrand ? true : prev.barcodeIsAutoGenerated
      };
    });
  };

  // Handle Add Brand modal submission with duplicate validation
  const handleCreateBrand = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newBrandName.trim();
    if (!trimmed) {
      toast.error('Brand name is required');
      return;
    }

    // Frontend duplicate check (trimmed & case-insensitive)
    const duplicate = brands.some(
      b => b.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      toast.error('Brand already exists');
      return;
    }

    try {
      setAddingBrand(true);
      const res = await api.post('/brands', { name: trimmed });
      const createdBrand = res.data;
      // Immediately make newly created Brand available in dropdown without page reload
      setBrands(prev => [...prev, createdBrand].sort((a, b) => a.name.localeCompare(b.name)));
      // Auto-select in Product form
      setFormData(prev => ({
        ...prev,
        brandId: createdBrand.id.toString(),
        brandName: createdBrand.name
      }));
      setNewBrandName('');
      setShowAddBrandModal(false);
      toast.success('Brand added successfully');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to add brand';
      toast.error(msg);
    } finally {
      setAddingBrand(false);
    }
  };

  // Open modal to edit existing product
  const handleEdit = (product) => {
    let parsedAttributes = {};
    if (product.attributes) {
      parsedAttributes = typeof product.attributes === 'string' ? JSON.parse(product.attributes) : product.attributes;
    }

    let parsedSizeStocks = [];
    if (product.sizeStocks) {
      parsedSizeStocks = typeof product.sizeStocks === 'string' ? JSON.parse(product.sizeStocks) : product.sizeStocks;
    }    let parsedBrandPrices = {};
    if (product.brandPrices) {
      parsedBrandPrices = typeof product.brandPrices === 'string' ? JSON.parse(product.brandPrices) : product.brandPrices;
    }

    if (parsedBrandPrices && typeof parsedBrandPrices === 'object') {
      Object.keys(parsedBrandPrices).forEach(bIdStr => {
        if (parsedBrandPrices[bIdStr] && typeof parsedBrandPrices[bIdStr] === 'object') {
          parsedBrandPrices[bIdStr].isAutoGenerated = false;
        }
      });
    }

    const activeBrandIds = [];
    if (parsedBrandPrices && typeof parsedBrandPrices === 'object') {
      Object.keys(parsedBrandPrices).forEach(bIdStr => {
        const entry = parsedBrandPrices[bIdStr];
        if (entry && !entry.isDeleted) {
          activeBrandIds.push(bIdStr);
        }
      });
    }

    const primaryBId = product.brandId ? product.brandId.toString() : (product.brand?.id ? product.brand.id.toString() : '');
    if (primaryBId && !activeBrandIds.includes(primaryBId)) {
      activeBrandIds.push(primaryBId);
    }

    const hasMultiSizes = Array.isArray(parsedSizeStocks) && parsedSizeStocks.length > 1;

    setFormData({
      ...product,
      id: product.id,
      name: product.name || '',
      selectedBrandIds: activeBrandIds,
      brandId: primaryBId,
      brandName: product.brandName || product.brand?.name || '',
      categoryId: product.categoryId ? product.categoryId.toString() : '',
      categoryName: product.categoryName || product.category?.name || '',
      productTypeId: product.productTypeId ? product.productTypeId.toString() : '',
      productTypeName: product.productTypeName || product.productType?.name || '',
      gender: product.gender || '',
      attributes: parsedAttributes || {},
      sizeMode: hasMultiSizes ? 'multi' : 'single',
      size: product.size || '',
      sizeStocks: parsedSizeStocks || [],
      stock: product.stock !== undefined ? product.stock.toString() : '0',
      price: (product.price !== null && product.price !== undefined) ? product.price.toString() : '',
      brandPrices: parsedBrandPrices || {},
      costPrice: product.costPrice ? product.costPrice.toString() : '',
      taxRate: product.taxRate !== undefined ? product.taxRate.toString() : '0',
      taxPercent: product.taxPercent !== undefined ? product.taxPercent.toString() : '0',
      taxType: product.taxType || 'none',
      hsnCode: product.hsnCode || '',
      warranty: product.warranty !== null && product.warranty !== undefined ? product.warranty.toString() : '0',
      description: product.description || '',
      barcode: product.barcode || '',
      barcodeIsAutoGenerated: false,
      hasBarcode: product.hasBarcode !== undefined ? product.hasBarcode : true,
      minDiscount: product.minDiscount !== null && product.minDiscount !== undefined ? product.minDiscount.toString() : '',
      maxDiscount: product.maxDiscount !== null && product.maxDiscount !== undefined ? product.maxDiscount.toString() : '',
      isTaxInclusive: product.isTaxInclusive || false,
      isActive: product.isActive !== undefined ? product.isActive : true
    });
    setFile(null);
    setImagePreview(product.imageUrl || null);
    setShowModal(true);
  };

  // Handle Category change (resets dependent fields)
  const handleCategoryChange = (val) => {
    const selectedCat = categories.find(c => c.id.toString() === val.toString());
    setFormData(prev => ({
      ...prev,
      categoryId: val,
      categoryName: selectedCat ? selectedCat.name : '',
      brandId: '',
      brandName: '',
      productTypeId: '',
      productTypeName: '',
      gender: '',
      attributes: {},
      size: '',
      sizeStocks: [],
      stock: '0'
    }));
  };

  // Handle Product Type change (initializes attributes, genders, sizes)
  const handleProductTypeChange = (val) => {
    const selectedPt = productTypes.find(pt => pt.id.toString() === val.toString());
    let initialSizeStocks = [];

    if (selectedPt && Array.isArray(selectedPt.sizes) && selectedPt.sizes.length > 0) {
      initialSizeStocks = selectedPt.sizes.map(s => ({ size: s, stock: 0 }));
    }

    setFormData(prev => ({
      ...prev,
      productTypeId: val,
      productTypeName: selectedPt ? selectedPt.name : '',
      gender: selectedPt && selectedPt.genders?.length > 0 ? selectedPt.genders[0] : '',
      attributes: {},
      size: selectedPt && selectedPt.sizes?.length > 0 ? selectedPt.sizes[0] : '',
      sizeStocks: initialSizeStocks,
      stock: '0'
    }));
  };

  // Handle attribute selection
  const handleAttributeChange = (attrName, optionVal) => {
    setFormData(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [attrName]: optionVal
      }
    }));
  };

  // Handle size stock change in multi-size mode
  const handleSizeStockChange = (sizeName, qty) => {
    const parsedQty = Math.max(0, parseInt(qty, 10) || 0);
    setFormData(prev => {
      const existingIdx = prev.sizeStocks.findIndex(item => item.size === sizeName);
      let updatedList = [...prev.sizeStocks];

      if (existingIdx >= 0) {
        updatedList[existingIdx] = { size: sizeName, stock: parsedQty };
      } else {
        updatedList.push({ size: sizeName, stock: parsedQty });
      }

      const totalCalculatedStock = updatedList.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);

      return {
        ...prev,
        sizeStocks: updatedList,
        stock: totalCalculatedStock.toString(),
        size: updatedList.filter(item => item.stock > 0).map(item => item.size).join(', ') || prev.size
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Product Name is required');
      return;
    }
    if (!formData.categoryId) {
      toast.error('Category is required');
      return;
    }
    const parsedPrice = parseFloat(formData.price);
    if (formData.price === '' || isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error('Selling price must be a valid non-negative number');
      return;
    }

    // Validate and auto-repair barcodes before submission
    const barcodeCheckResult = ensureUniqueBarcodesBeforeSubmit(formData);
    if (!barcodeCheckResult) {
      return; // manual barcode collision error displayed via toast
    }

    const finalBarcode = barcodeCheckResult.updatedBarcode;
    const finalBrandPrices = barcodeCheckResult.updatedBrandPrices;

    if (finalBrandPrices && typeof finalBrandPrices === 'object') {
      for (const [bKey, bVal] of Object.entries(finalBrandPrices)) {
        if (bVal && bVal.price !== undefined && bVal.price !== null && bVal.price !== '') {
          const bpNum = parseFloat(bVal.price);
          if (isNaN(bpNum) || bpNum < 0) {
            toast.error(`Selling price for brand "${bVal.brandName || bKey}" must be a valid non-negative number`);
            return;
          }
        }
      }
    }

    // Create FormData for file upload
    const data = new FormData();

    // Append basic fields
    data.append('name', formData.name.trim());
    if (formData.brandId) {
      data.append('brandId', formData.brandId);
      data.append('brandName', formData.brandName || '');
    } else if (formData.brandName) {
      data.append('brandName', formData.brandName);
    }
    data.append('categoryId', formData.categoryId);
    data.append('categoryName', formData.categoryName || '');
    data.append('price', formData.price || '0');

    if (finalBrandPrices && Object.keys(finalBrandPrices).length > 0) {
      data.append('brandPrices', JSON.stringify(finalBrandPrices));
    }
    data.append('costPrice', formData.costPrice || '');
    data.append('taxRate', formData.taxRate || '0');
    data.append('taxPercent', formData.taxRate || '0');
    data.append('taxType', formData.taxType || 'none');
    data.append('isTaxInclusive', formData.isTaxInclusive);
    data.append('hsnCode', formData.hsnCode || '');
    data.append('warranty', formData.warranty || '0');
    data.append('minDiscount', formData.minDiscount || '');
    data.append('maxDiscount', formData.maxDiscount || '');
    data.append('barcode', finalBarcode || '');
    data.append('barcodeIsAutoGenerated', formData.barcodeIsAutoGenerated !== false);
    data.append('hasBarcode', formData.hasBarcode);
    data.append('description', formData.description || '');
    data.append('isActive', formData.isActive);

    // Append hierarchy fields
    if (formData.productTypeId) {
      data.append('productTypeId', formData.productTypeId);
      data.append('productTypeName', formData.productTypeName || '');
    }
    if (formData.gender) {
      data.append('gender', formData.gender);
    }
    if (formData.attributes && Object.keys(formData.attributes).length > 0) {
      data.append('attributes', JSON.stringify(formData.attributes));
    }
    if (formData.size) {
      data.append('size', formData.size);
    }
    if (formData.sizeStocks && formData.sizeStocks.length > 0) {
      data.append('sizeStocks', JSON.stringify(formData.sizeStocks));
    }
    data.append('stock', formData.stock || '0');

    if (file) {
      data.append('image', file);
    }

    try {
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };

      if (formData.id) {
        await api.put(`/products/${formData.id}`, data, config);
        toast.success('Product updated successfully!');
      } else {
        await api.post('/products', data, config);
        toast.success('Product created successfully!');
      }

      setShowModal(false);
      fetchProducts();
      setFile(null);
      setImagePreview(null);
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to save product');
    }
  };

  // Filter Logic
  const filteredProducts = products.filter(product => {
    const matchesCategory = filterCategory === '' ||
      (typeof product.category === 'string'
        ? product.category.toLowerCase().includes(filterCategory.toLowerCase())
        : (product.category?.name?.toLowerCase() || '').includes(filterCategory.toLowerCase()) ||
        product.categoryName?.toLowerCase().includes(filterCategory.toLowerCase()));

    const matchesProductType = filterProductType === '' ||
      (product.productType?.name?.toLowerCase() || '').includes(filterProductType.toLowerCase()) ||
      (product.productTypeName?.toLowerCase() || '').includes(filterProductType.toLowerCase());

    let matchesStock = true;
    if (filterStock === 'low') matchesStock = product.stock > 0 && product.stock <= product.minStockLevel;
    if (filterStock === 'out') matchesStock = product.stock === 0;

    const matchesSearch = searchTerm === '' ||
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.productTypeName || product.productType?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    return matchesCategory && matchesProductType && matchesStock && matchesSearch;
  });

  const uniqueCategories = [...new Set(products.map(p => p.category?.name || p.categoryName).filter(Boolean))];
  const uniqueProductTypes = [...new Set(products.map(p => p.productType?.name || p.productTypeName).filter(Boolean))];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your inventory, category hierarchy, size variants and stock levels</p>
        </div>
        <button className="btn btn-primary w-full md:w-auto shadow-lg shadow-primary/20" onClick={handleAddNew}>
          <FiPlus className="text-lg" /> Add New Product
        </button>
      </div>

      {/* Search & Filters */}
      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
            <FiSearch className="text-slate-400" />
            <input
              type="text"
              placeholder="Search product, barcode..."
              className="bg-transparent text-sm focus:outline-none text-slate-700 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <SearchableSelect
              options={[{ label: 'All Categories', value: '' }, ...uniqueCategories.map(cat => ({ label: cat, value: cat }))]}
              value={filterCategory}
              onChange={setFilterCategory}
              placeholder="Filter by Category..."
            />
          </div>

          <div>
            <SearchableSelect
              options={[{ label: 'All Product Types', value: '' }, ...uniqueProductTypes.map(pt => ({ label: pt, value: pt }))]}
              value={filterProductType}
              onChange={setFilterProductType}
              placeholder="Filter by Product Type..."
            />
          </div>

          <div>
            <SearchableSelect
              options={[
                { label: 'All Branches (Total Stock)', value: 'all' },
                ...branches.map(b => ({ label: `${b.name} ${b.code ? `[${b.code}]` : ''}`, value: b.id.toString() }))
              ]}
              value={selectedBranch}
              onChange={val => {
                setSelectedBranch(val);
                fetchProducts(val);
              }}
              placeholder="Filter by Branch..."
            />
          </div>

          <div>
            <SearchableSelect
              options={[
                { label: 'All Stock Status', value: 'all' },
                { label: 'Low Stock', value: 'low' },
                { label: 'Out of Stock', value: 'out' }
              ]}
              value={filterStock}
              onChange={setFilterStock}
              placeholder="Stock Status..."
            />
          </div>
        </div>
      </div>

      {/* Product List Table */}
      <div className="card border-0 shadow-lg overflow-hidden">
        <div className="table-container lg:no-scrollbar overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr className="whitespace-nowrap">
                <th>Product Name</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Product Type</th>
                <th>Gender</th>
                <th>Size</th>
                <th>Selling Price</th>
                <th>Stock</th>
                <th>Stock Status</th>
                <th>Barcode</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="12" className="text-center py-8 text-slate-400">Loading products...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="12" className="text-center py-8 text-slate-400">No products found.</td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  let parsedSizeStocks = [];
                  if (product.sizeStocks) {
                    parsedSizeStocks = typeof product.sizeStocks === 'string' ? JSON.parse(product.sizeStocks) : product.sizeStocks;
                  }
                  const hasMultiSizes = Array.isArray(parsedSizeStocks) && parsedSizeStocks.length > 0;

                  return (
                    <tr key={product.id} className="whitespace-nowrap hover:bg-slate-50/80 transition-colors">
                      {/* Product Name & Image */}
                      <td className="font-semibold text-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden border border-slate-200 shrink-0">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <FiBox className="text-lg" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{product.name}</div>
                            {product.attributes && typeof product.attributes === 'object' && Object.keys(product.attributes).length > 0 && (
                              <div className="text-[10px] text-slate-400 font-normal">
                                {Object.entries(product.attributes).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Brand */}
                      <td>
                        {(() => {
                          let parsedBp = product.brandPrices;
                          if (typeof parsedBp === 'string') {
                            try { parsedBp = JSON.parse(parsedBp); } catch (e) { parsedBp = null; }
                          }
                          const brandNamesSet = new Set();
                          if (parsedBp && typeof parsedBp === 'object') {
                            Object.keys(parsedBp).forEach(bIdStr => {
                              const entry = parsedBp[bIdStr];
                              if (entry && !entry.isDeleted) {
                                const bId = parseInt(bIdStr, 10);
                                const matchedBrand = brands.find(b => b.id === bId);
                                if (matchedBrand && matchedBrand.name) {
                                  brandNamesSet.add(matchedBrand.name);
                                } else if (entry.name) {
                                  brandNamesSet.add(entry.name);
                                }
                              }
                            });
                          }
                          if (brandNamesSet.size === 0 && (product.brand?.name || product.brandName)) {
                            brandNamesSet.add(product.brand?.name || product.brandName);
                          }
                          const brandList = Array.from(brandNamesSet);

                          if (brandList.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {brandList.map((bName, bIdx) => (
                                  <span key={bIdx} className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md text-[11px] font-semibold border border-amber-200">
                                    {bName}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return <span className="text-slate-400 text-xs">-</span>;
                        })()}
                      </td>

                      {/* Category */}
                      <td>
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium border border-slate-200">
                          {product.category?.name || product.categoryName || 'Uncategorized'}
                        </span>
                      </td>

                      {/* Product Type */}
                      <td>
                        {product.productType?.name || product.productTypeName ? (
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-semibold border border-indigo-100">
                            {product.productType?.name || product.productTypeName}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Gender / Group */}
                      <td>
                        {product.gender ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[11px] font-medium border border-blue-100">
                            {product.gender}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Size */}
                      <td>
                        {hasMultiSizes ? (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {parsedSizeStocks.filter(s => s.stock > 0).map((s, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-semibold border border-emerald-100" title={`${s.size}: ${s.stock} units`}>
                                {s.size}
                              </span>
                            ))}
                            {parsedSizeStocks.filter(s => s.stock > 0).length === 0 && (
                              <span className="text-xs text-slate-400">{product.size || '-'}</span>
                            )}
                          </div>
                        ) : product.size ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-bold border border-emerald-100">
                            {product.size}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Selling Price */}
                      <td className="p-4 text-slate-900 font-semibold">
                        {activeCurrencySymbol}{Number(product.price).toFixed(2)}
                      </td>

                      {/* Stock */}
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-xs text-slate-800">
                            {product.stock} units
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {selectedBranch !== 'all'
                              ? (branches.find(b => b.id.toString() === selectedBranch)?.name || 'Branch Stock')
                              : 'Total Stock'}
                          </span>
                          {hasMultiSizes && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {parsedSizeStocks.map(s => `${s.size}:${s.stock}`).join(' | ')}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Stock Status */}
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${product.stock === 0 ? 'bg-red-50 text-red-600 border border-red-200' : product.stock <= product.minStockLevel ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                          {product.stock === 0 ? 'Out of Stock' : product.stock <= product.minStockLevel ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>

                      {/* Barcode */}
                      <td className="font-mono text-xs text-slate-500">{product.barcode}</td>

                      {/* Status */}
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${product.isActive ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => handleOpenPrintModal(product)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-primary transition-colors"
                            title="Print Barcode"
                          >
                            <FiPrinter />
                          </button>
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                            title="Edit Product"
                          >
                            <FiEdit />
                          </button>
                          {(localStorage.getItem('user') && JSON.parse(localStorage.getItem('user')).role === 'admin') && (
                            <button
                              onClick={() => {
                                setStatusTarget(product);
                                setShowStatusModal(true);
                              }}
                              className="relative flex items-center cursor-pointer focus:outline-none group"
                              title={product.isActive ? 'Deactivate Product' : 'Activate Product'}
                            >
                              <div className={`w-9 h-5 rounded-full transition-colors duration-300 ${product.isActive ? 'bg-primary shadow-inner' : 'bg-slate-200'}`}></div>
                              <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-300 transform ${product.isActive ? 'translate-x-4' : 'translate-x-0'} shadow-md`}></div>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 overflow-hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-48px)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{formData.id ? 'Edit Product' : 'Add New Product'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Define product hierarchy: Category &rarr; Product Type &rarr; Gender &rarr; Attributes &rarr; Size & Stock</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none p-1 rounded-lg hover:bg-slate-100 transition-colors"
                title="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Form Content */}
              <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-6">
                {/* Product Image & Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center text-slate-400 mb-2 overflow-hidden border-2 border-slate-200 shadow-sm">
                      {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <FiBox className="text-3xl" />
                      )}
                    </div>
                    <label className="btn btn-secondary text-xs cursor-pointer px-3 py-1.5">
                      Upload Image
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        className="input w-full"
                        placeholder="e.g. Cotton Slim Fit T-Shirt"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <SearchableSelect
                        options={(categories || []).map(cat => ({ label: cat.name, value: cat.id }))}
                        value={formData.categoryId}
                        onChange={handleCategoryChange}
                        placeholder="Select Category..."
                        zIndex={100005}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-slate-700">
                          Brand {formData.categoryId && <span className="text-xs text-primary font-normal">(Filtered for Category)</span>}
                          {Boolean(formData.id) && <span className="text-xs text-slate-400 font-normal ml-1">(Fixed — cannot be changed)</span>}
                        </label>
                      </div>
                      <SearchableSelect
                        options={(categoryBrands || []).map(b => ({ label: b.name, value: b.id }))}
                        value={formData.selectedBrandIds || []}
                        onChange={handleMultiBrandChange}
                        placeholder={formData.categoryId ? "Select Brand(s) for Category..." : "Select Brand(s)..."}
                        zIndex={100005}
                        isMulti={true}
                        disabled={Boolean(formData.id)}
                      />
                    </div>
                  </div>
                </div>

                {/* HIERARCHY SECTION */}
                <div className="border border-indigo-100 bg-indigo-50/30 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                    <FiLayers className="text-primary" /> Product Hierarchy & Classification
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Step 2: Product Type (Category Dependent) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Product Type {formData.categoryId && <span className="text-primary font-normal">(Filtered for Category)</span>}
                      </label>
                      {formData.categoryId ? (
                        (categoryProductTypes || []).length > 0 ? (
                          <SearchableSelect
                            options={(categoryProductTypes || []).map(pt => ({ label: pt.name, value: pt.id }))}
                            value={formData.productTypeId}
                            onChange={handleProductTypeChange}
                            placeholder="Select Product Type..."
                            zIndex={100005}
                          />
                        ) : (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                            <FiInfo className="shrink-0" />
                            <span>No product types configured for this category. (Configure in Product Type Master)</span>
                          </div>
                        )
                      ) : (
                        <div className="input text-xs text-slate-400 bg-slate-100 flex items-center">
                          Select Category first
                        </div>
                      )}
                    </div>

                    {/* Step 3: Gender / Group */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Gender / Group</label>
                      <select
                        className="input w-full text-xs"
                        value={formData.gender}
                        onChange={e => setFormData({ ...formData, gender: e.target.value })}
                        disabled={!formData.productTypeId}
                      >
                        <option value="">Select Gender / Group</option>
                        {availableGenders.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Step 4: Dynamic Product Attributes */}
                  {configuredAttributes.length > 0 && (
                    <div className="pt-2 border-t border-indigo-100/80">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Product Attributes ({configuredAttributes.length} configured)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {configuredAttributes.map((attr, idx) => (
                          <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {attr.name}
                            </label>
                            <select
                              className="input w-full !py-1 text-xs"
                              value={formData.attributes[attr.name] || ''}
                              onChange={e => handleAttributeChange(attr.name, e.target.value)}
                            >
                              <option value="">Select {attr.name}...</option>
                              {(attr.options || []).map((opt, oIdx) => (
                                <option key={oIdx} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SIZE & INDIVIDUAL STOCK MANAGEMENT SECTION */}
                <div className="border border-emerald-100 bg-emerald-50/40 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                      <FiTag className="text-emerald-600" /> Size & Individual Stock Configuration
                    </div>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                      Total Opening Stock: {formData.stock || 0} units
                    </span>
                  </div>

                  {/* Selectable Size Badges */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Select Sizes for this Product (Click badges to add/remove size)
                    </label>
                    {availableSizeOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        {availableSizeOptions.map(sizeOpt => {
                          const isSelected = (formData.sizeStocks || []).some(item => item.size === sizeOpt);
                          return (
                            <button
                              key={sizeOpt}
                              type="button"
                              onClick={() => handleToggleSize(sizeOpt)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm scale-105'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                              }`}
                            >
                              {sizeOpt} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                        No sizes configured for the selected Product Type. Please configure sizes under Product Type master settings.
                      </div>
                    )}
                  </div>

                  {/* Individual Stock Quantity for Selected Sizes (Read-Only Total Stock Across Brands) */}
                  {(formData.sizeStocks || []).length > 0 ? (
                    <div className="pt-3 border-t border-emerald-200/60">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Individual Size Stock Quantities ({(formData.sizeStocks || []).length} sizes selected)
                        </label>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                          Read-Only (Complete stock across all brands)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {(formData.sizeStocks || []).map((item, idx) => {
                          const totalBrandStockForSize = getAggregatedSizeStock(item.size, item.stock);
                          return (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Size: {item.size}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSize(item.size)}
                                  className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                                  title="Remove size"
                                >
                                  Remove
                                </button>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-0.5">
                                  <label className="block text-[10px] font-semibold text-slate-500">Stock Quantity</label>
                                  <span className="text-[9px] font-bold text-slate-400">All Brands</span>
                                </div>
                                <input
                                  type="number"
                                  readOnly
                                  className="input w-full !py-1 text-xs font-bold text-slate-700 bg-slate-100 border-slate-200 cursor-not-allowed select-none"
                                  placeholder="0"
                                  value={totalBrandStockForSize}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-white/80 rounded-xl border border-dashed border-emerald-300 text-xs text-slate-500 text-center">
                      Click size badges above to select sizes for this product type.
                    </div>
                  )}
                </div>

                {/* BRAND SPECIFIC CONFIGURATION (PRICES, BARCODES, SIZES & STOCKS) */}
                {activeSelectedBrands.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50/40 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                        <FiTag className="text-amber-600" /> Brand Specific Prices, Barcodes & Sizes
                      </div>
                      <span className="text-[11px] text-amber-800 font-medium">Configure individual price, barcode, sizes & stock for each brand</span>
                    </div>

                    <div className="space-y-4">
                      {activeSelectedBrands.map(b => {
                        const bIdStr = String(b.id);
                        const entry = formData.brandPrices?.[bIdStr];
                        let priceVal = '';
                        let barcodeVal = '';
                        let brandSizeStocks = [];

                        if (typeof entry === 'object' && entry !== null) {
                          priceVal = entry.price || '';
                          barcodeVal = entry.barcode || '';
                          brandSizeStocks = Array.isArray(entry.sizeStocks) ? entry.sizeStocks : [];
                        } else if (entry !== undefined && entry !== '') {
                          priceVal = entry.toString();
                        }

                        if (!priceVal && String(formData.brandId) === bIdStr) priceVal = formData.price;
                        if (!barcodeVal && String(formData.brandId) === bIdStr) barcodeVal = formData.barcode;
                        if (brandSizeStocks.length === 0 && String(formData.brandId) === bIdStr && Array.isArray(formData.sizeStocks)) {
                          brandSizeStocks = formData.sizeStocks;
                        }

                        const isSelected = String(formData.brandId) === bIdStr;
                        const activeBrandSizeStocks = brandSizeStocks.filter(item => !item.isDeleted);
                        const brandTotalStock = activeBrandSizeStocks.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0);

                        return (
                          <div key={b.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">{b.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                  Total Stock: {brandTotalStock} units
                                </span>
                                {!formData.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBrandCard(b.id)}
                                    className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-0.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                                    title="Remove Brand"
                                  >
                                    <FiTrash2 className="text-xs" /> Delete Brand
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Selling Price */}
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Selling Price ({activeCurrencySymbol})</label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{activeCurrencySymbol}</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="input w-full !pl-6 !py-1 text-xs font-bold text-slate-800"
                                    value={priceVal}
                                    onChange={e => handleBrandFieldChange(b.id, 'price', e.target.value)}
                                  />
                                </div>
                              </div>

                              {/* Barcode */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="block text-xs font-semibold text-slate-600">Brand Barcode</label>
                                  {!formData.id && (
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateBrandBarcode(b.id)}
                                      className="text-[10px] text-amber-700 hover:text-amber-900 font-semibold underline"
                                    >
                                      Generate Barcode
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  placeholder="Barcode..."
                                  readOnly={Boolean(formData.id)}
                                  className={`input w-full !py-1 text-xs font-mono text-slate-800 ${formData.id ? 'bg-slate-100 cursor-not-allowed select-none text-slate-500' : ''}`}
                                  value={barcodeVal}
                                  onChange={formData.id ? undefined : (e => handleBrandFieldChange(b.id, 'barcode', e.target.value))}
                                />
                              </div>
                            </div>

                            {/* Brand Specific Sizes Selection */}
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Select Sizes for {b.name} (Click badges to toggle size)
                              </label>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {availableSizeOptions.map(sizeOpt => {
                                  const isSizeSelected = activeBrandSizeStocks.some(item => item.size === sizeOpt);
                                  return (
                                    <button
                                      key={sizeOpt}
                                      type="button"
                                      onClick={() => handleToggleBrandSize(b.id, sizeOpt)}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                                        isSizeSelected
                                          ? 'bg-amber-500 text-white border-amber-500 shadow-2xs scale-105'
                                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50'
                                      }`}
                                    >
                                      {sizeOpt} {isSizeSelected && '✓'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Brand Specific Individual Size Stock Quantities (Read-Only Auto Stock) */}
                            {activeBrandSizeStocks.length > 0 && (
                              <div className="pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                                  <label className="block text-[11px] font-bold text-slate-700">
                                    Individual Size Stock Quantities for {b.name}
                                  </label>
                                  <span className="text-[9px] font-semibold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded border border-amber-200">
                                    Read-Only (Auto-updated via Purchases & Sales)
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                  {activeBrandSizeStocks.map((item, sIdx) => (
                                    <div key={sIdx} className="bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                        <span>Size {item.size}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveBrandSize(b.id, item.size)}
                                          className="text-red-500 hover:text-red-700 text-[11px] font-bold px-1 hover:bg-red-50 rounded"
                                          title="Delete size"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      <input
                                        type="number"
                                        readOnly
                                        className="input w-full !py-0.5 text-xs font-bold text-slate-700 bg-slate-100 border-slate-200 text-center cursor-not-allowed select-none"
                                        value={item.stock}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PRICING & TAX SECTION */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Selling Price ({activeCurrencySymbol}) <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      className="input w-full font-bold text-slate-900"
                      placeholder="0.00"
                      value={formData.price}
                      onChange={e => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tax Rate (%)</label>
                    <input
                      type="number"
                      className="input w-full"
                      value={formData.taxRate}
                      onChange={e => {
                        const val = e.target.value;
                        setFormData({ ...formData, taxRate: val, taxPercent: val });
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tax Type</label>
                    <select
                      className="input w-full"
                      value={formData.taxType}
                      onChange={e => setFormData({ ...formData, taxType: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="igst">IGST (Inter-state)</option>
                      <option value="cgst_sgst">CGST + SGST (Intra-state)</option>
                    </select>
                  </div>
                </div>

                {/* TAX INCLUSIVE TOGGLE */}
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={formData.isTaxInclusive}
                      onChange={e => setFormData({ ...formData, isTaxInclusive: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                    <span className="ml-3 text-sm font-medium text-slate-700">Selling Price Includes Tax</span>
                  </label>
                </div>

                {/* HSN, WARRANTY, DISCOUNTS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">HSN Code</label>
                    <input
                      className="input w-full text-xs"
                      placeholder="XXXX"
                      value={formData.hsnCode}
                      onChange={e => setFormData({ ...formData, hsnCode: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Warranty (Months)</label>
                    <input
                      type="number"
                      className="input w-full text-xs"
                      placeholder="0"
                      value={formData.warranty}
                      onChange={e => setFormData({ ...formData, warranty: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Min Discount (%)</label>
                    <input
                      type="number"
                      className="input w-full text-xs"
                      placeholder="0"
                      value={formData.minDiscount}
                      onChange={e => setFormData({ ...formData, minDiscount: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Max Discount (%)</label>
                    <input
                      type="number"
                      className="input w-full text-xs"
                      placeholder="0"
                      value={formData.maxDiscount}
                      onChange={e => setFormData({ ...formData, maxDiscount: e.target.value })}
                    />
                  </div>
                </div>

                {/* BARCODE & DESCRIPTION */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {formData.id ? 'Barcode (fixed — cannot be changed after creation)' : 'Barcode (Auto-generated if left empty)'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        className={`input flex-1 font-mono ${formData.id ? 'bg-slate-100 cursor-not-allowed select-none text-slate-500' : ''}`}
                        placeholder="Scan or enter code"
                        readOnly={Boolean(formData.id)}
                        value={formData.barcode}
                        onChange={formData.id ? undefined : (e => {
                          const val = e.target.value;
                          setFormData(prev => {
                            const updatedBp = { ...(prev.brandPrices || {}) };
                            if (prev.brandId && updatedBp[String(prev.brandId)]) {
                              updatedBp[String(prev.brandId)] = {
                                ...updatedBp[String(prev.brandId)],
                                barcode: val,
                                isAutoGenerated: false
                              };
                            }
                            return {
                              ...prev,
                              barcode: val,
                              barcodeIsAutoGenerated: false,
                              brandPrices: updatedBp
                            };
                          });
                        })}
                      />
                      {!formData.id && (
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          onClick={() => {
                            const currentFormBarcodes = [];
                            const uniqueCode = getGuaranteedUniqueBarcode(currentFormBarcodes, formData.id);
                            setFormData(prev => {
                              const updatedBp = { ...(prev.brandPrices || {}) };
                              if (prev.brandId && updatedBp[String(prev.brandId)]) {
                                updatedBp[String(prev.brandId)] = {
                                  ...updatedBp[String(prev.brandId)],
                                  barcode: uniqueCode,
                                  isAutoGenerated: true
                                };
                              }
                              return {
                                ...prev,
                                barcode: uniqueCode,
                                barcodeIsAutoGenerated: true,
                                brandPrices: updatedBp
                              };
                            });
                          }}
                        >
                          Generate
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <textarea
                      className="input w-full"
                      rows="2"
                      placeholder="Product details, fabric specifications, washing instructions..."
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>

                {/* Barcode Preview */}
                {formData.barcode && (
                  <div className="flex justify-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Barcode value={formData.barcode} height={35} background="#f8fafc" />
                  </div>
                )}

                {/* Status Toggle */}
                <div className="pt-2 border-t border-slate-100">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={formData.isActive}
                      onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                    <span className="ml-3 text-sm font-medium text-slate-700">Product is Active</span>
                  </label>
                </div>

              </div>

              {/* Modal Footer (Sticky / Fixed at Bottom) */}
              <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl shrink-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary shadow-lg shadow-primary/20"
                >
                  {formData.id ? 'Update Product' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Status Confirmation Modal */}
      {showStatusModal && statusTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
            <div className={`p-6 ${statusTarget.isActive ? 'bg-amber-50' : 'bg-green-50'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${statusTarget.isActive ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                  {statusTarget.isActive ? <FiToggleRight className="w-6 h-6" /> : <FiToggleLeft className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-900">
                    {statusTarget.isActive ? 'Deactivate Product?' : 'Activate Product?'}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {statusTarget.name}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-slate-600 text-sm leading-relaxed">
                {statusTarget.isActive
                  ? 'This product will be hidden from the POS and Sales pages. You can reactivate it anytime from the Products or Master section.'
                  : 'This product will be visible again on the POS and Sales pages.'}
              </p>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.put(`/products/${statusTarget.id}`, { isActive: !statusTarget.isActive });
                      toast.success(`Product ${statusTarget.isActive ? 'deactivated' : 'activated'} successfully`);
                      setShowStatusModal(false);
                      fetchProducts();
                    } catch (err) {
                      toast.error('Failed to update status');
                    }
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm text-white shadow-lg transition-all active:scale-95 ${statusTarget.isActive ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-green-500 hover:bg-green-600 shadow-green-200'}`}
                >
                  Yes, {statusTarget.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Barcode Modal */}
      {showPreviewModal && printTargetProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 border border-slate-100 flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Print Barcode</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {printTargetProduct.name} • {resolvedLabelTemplate?.name || '38×25mm Design'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Branch, Brand, and Size Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                  <select
                    className="input w-full text-xs font-medium bg-white border rounded p-2"
                    value={selectedPrintBranchId}
                    onChange={e => handlePrintBranchChange(e.target.value)}
                  >
                    <option value="">-- Select Branch --</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
                  <select
                    className="input w-full text-xs font-medium bg-white border rounded p-2"
                    value={selectedPrintBrandId}
                    onChange={e => handlePrintBrandChange(e.target.value)}
                  >
                    <option value="">-- Select Brand --</option>
                    {getAvailableBrandsForProduct(printTargetProduct, brands).map(b => (
                      <option key={b.id || b.name} value={b.id || ''}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Size</label>
                  <select
                    className="input w-full text-xs font-medium bg-white border rounded p-2"
                    value={selectedPrintSize}
                    onChange={e => handlePrintSizeChange(e.target.value)}
                  >
                    <option value="">-- Select Size --</option>
                    {availablePrintSizes.map((sObj, idx) => {
                      const sz = typeof sObj === 'object' ? sObj.size : sObj;
                      const stk = typeof sObj === 'object' ? sObj.currentStock : null;
                      return (
                        <option key={idx} value={sz}>
                          {sz} {stk !== null && stk !== undefined ? `(${stk})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* QZ Tray Printer Setup & Select Box */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block uppercase tracking-wider">QZ Tray Setup</span>
                    <span className="text-[11px]">
                      {qzConnected ? (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span> Connected to QZ Tray
                        </span>
                      ) : (
                        <span className="text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Not connected to QZ Tray
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectQzTray}
                    disabled={qzConnecting}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      qzConnected
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                    }`}
                  >
                    {qzConnecting ? 'Connecting...' : qzConnected ? 'Re-Connect' : 'Connect QZ Tray'}
                  </button>
                </div>

                {qzConnected && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Select Printer ({printerList.length} Available)
                    </label>
                    <select
                      className="input w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2"
                      value={selectedPrinter}
                      onChange={e => setSelectedPrinter(e.target.value)}
                    >
                      <option value="">-- Automatic (Default Zebra Printer) --</option>
                      {printerList.map((pName, pIdx) => (
                        <option key={pIdx} value={pName}>
                          {pName} {pName.toLowerCase().includes('zebra') ? '★ (Zebra Thermal)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Number of Labels */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Number of Labels
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  className="input w-full text-sm font-bold text-slate-800 text-center"
                  value={printQuantity}
                  onChange={e => setPrintQuantity(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecutePrint();
                    }
                  }}
                />
              </div>

              {/* Rendered 38mm x 25mm Preview */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center min-h-[170px]">
                {previewLoading ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-slate-400 text-xs">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                    <span>Rendering 38×25mm Preview...</span>
                  </div>
                ) : previewImage ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-white p-2 rounded-lg shadow-xs border border-slate-200 flex items-center justify-center overflow-hidden">
                      <img
                        src={previewImage}
                        alt="ZPL Label Preview"
                        className="max-h-[140px] max-w-full object-contain filter drop-shadow-xs"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 font-medium">
                      <span>38×25mm • 203 DPI</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Preview not available</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePrint}
                disabled={previewLoading || printExecuting}
                className="px-5 py-2 rounded-xl bg-primary text-white font-semibold text-xs hover:bg-primary-dark shadow-md shadow-primary/20 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <FiPrinter size={14} /> {printExecuting ? 'Printing...' : 'Print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Brand Modal */}
      {showAddBrandModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
              <h3 className="text-base font-bold text-slate-800">Add Brand</h3>
              <button
                type="button"
                onClick={() => setShowAddBrandModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none p-1 rounded-lg hover:bg-slate-100"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateBrand} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Brand Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="input w-full"
                  placeholder="e.g. Nike"
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddBrandModal(false)}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBrand}
                  className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1"
                >
                  {addingBrand ? 'Adding...' : 'Add Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
