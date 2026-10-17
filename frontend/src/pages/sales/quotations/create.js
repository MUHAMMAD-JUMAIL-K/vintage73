import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { FiPlus, FiTrash2, FiSave, FiUser, FiCalendar } from 'react-icons/fi';
import SearchableSelect from '@/components/SearchableSelect';
import { getCurrencySymbol, normalizeCurrencySymbol, formatAmountWithCurrency } from '@/lib/currency';

export default function CreateQuotation() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [currencyCode, setCurrencyCode] = useState('INR');
    const [currencySymbol, setCurrencySymbol] = useState('₹');

    // Form State
    const [formData, setFormData] = useState({
        customerId: '',
        quotationDate: new Date().toISOString().split('T')[0],
        validUntil: '',
        notes: '',
        terms: '',
        isTaxInclusive: false,
        items: []
    });
    const customerOptions = [
        { value: '', label: 'Select Customer' },
        ...(customers || []).map(c => ({
            value: c?.id || '',
            label: `${c?.name || ''}${c?.phone ? ` (${c.phone})` : ''}`
        }))
    ];

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [custRes, prodRes, compRes] = await Promise.all([
                api.get('/customers'),
                api.get('/products'),
                api.get('/company').catch(() => null)
            ]);
            setCustomers(custRes.data);
            setProducts(prodRes.data);

            let code = compRes?.data?.currencyCode || 'INR';
            let symbol = compRes?.data?.currencySymbol;

            const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
            const currentUser = stored ? JSON.parse(stored) : null;
            if (currentUser?.branchId) {
                try {
                    const branchRes = await api.get(`/branches/${currentUser.branchId}`);
                    if (branchRes?.data?.currencyCode) {
                        code = branchRes.data.currencyCode;
                        symbol = branchRes.data.currencySymbol;
                    }
                } catch (e) {}
            }

            setCurrencyCode(code);
            setCurrencySymbol(normalizeCurrencySymbol(symbol, code));
        } catch (error) {
            console.error(error);
            toast.error('Failed to load customers/products');
        }
    };


    const addItem = (product) => {
        const existingItem = formData.items.find(i => i.productId === product.id);
        if (existingItem) {
            toast.info('Item already added');
            return;
        }

        const basePrice = Number(product.price);
        const taxRate = Number(product.taxRate || 0);
        const isTaxInclusive = product.isTaxInclusive === true || product.isTaxInclusive === 'true';

        let taxAmount = 0;
        let total = 0;

        if (isTaxInclusive) {
            // Case 1: Inclusive
            // Total is the price itself (approx, assuming 1 qty)
            // subtotal = price / (1 + rate)
            // tax = price - subtotal
            total = basePrice;
            const subTotal = basePrice / (1 + (taxRate / 100));
            taxAmount = basePrice - subTotal;
        } else {
            // Case 2: Exclusive
            // tax = price * rate
            // total = price + tax
            taxAmount = basePrice * (taxRate / 100);
            total = basePrice + taxAmount;
        }

        const newItem = {
            productId: product.id,
            name: product.name,
            hsnCode: product.hsnCode || '',
            quantity: 1,
            unitPrice: basePrice, // Store the List Price (whether inclusive or exclusive)
            taxRate: taxRate,
            taxAmount: taxAmount,
            discountAmount: 0,
            discountPercent: 0,
            total: total,
            isTaxInclusive: isTaxInclusive // Store this for updates
        };

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));
    };

    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        const item = { ...newItems[index] };

        if (field === 'discountPercent') {
            item.discountPercent = parseFloat(value) || 0;
            item.discountAmount = (item.unitPrice * item.discountPercent) / 100;
        } else if (field === 'discountAmount') {
            item.discountAmount = parseFloat(value) || 0;
            item.discountPercent = (item.discountAmount / item.unitPrice) * 100;
        } else {
            item[field] = Number(value);
        }

        // Recalculate Logic
        const quantity = item.quantity || 0;
        const unitPrice = item.unitPrice || 0;
        const discountAmount = item.discountAmount || 0;
        const taxRate = item.taxRate || 0;

        // Effective Price after discount (Discount applies to the Unit Price)
        const totalDiscount = discountAmount * quantity;

        if (item.isTaxInclusive) {
            // Inclusive Logic
            // The Price implies it ALREADY has tax.
            // Discount reduces the Total Price.
            // Net Total = (Qty * Price) - (Qty * Discount)
            // Then back-calculate Tax from that Net Total.

            const netTotal = (quantity * unitPrice) - totalDiscount;
            const subTotal = netTotal / (1 + (taxRate / 100));
            item.taxAmount = netTotal - subTotal;
            item.total = netTotal;
        } else {
            // Exclusive Logic
            // The Price is before Tax.
            // Tax is added on top.
            // Standard: Tax is usually on (Price - Discount).
            // But preserving "Add tax on top of selling price" and existing logic style:
            // Existing logic was: BaseTotal + Tax - Discount.  (Tax on Gross).
            // Let's use standard: Tax on (Price - Discount) to be safe/correct, 
            // OR stick to User's "tax = subtotal * rate" where subtotal = price.
            // User said: "subtotal = price; tax = subtotal * rate; total = subtotal + tax".
            // This implies Tax is on Gross Price.
            // And usually Discount is subtracted from Total.

            const grossAmount = quantity * unitPrice;
            const tax = grossAmount * (taxRate / 100);
            item.taxAmount = tax;
            item.total = grossAmount + tax - totalDiscount;
        }

        newItems[index] = item;
        setFormData({ ...formData, items: newItems });
    };

    const removeItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const calculateGrandTotal = () => {
        return formData.items.reduce((sum, item) => sum + item.total, 0);
    };

    const handleSubmit = async () => {
        if (!formData.customerId || formData.items.length === 0) {
            toast.error('Please select customer and add items');
            return;
        }

        setLoading(true);
        try {
            const storedUser = localStorage.getItem('user');
            const branchId = storedUser ? JSON.parse(storedUser).branchId : null;

            if (!branchId) {
                toast.error('Branch not found. Please relogin.');
                return;
            }

            // Clean data before sending (remove hsnCode if not in schema, though extra fields are usually ignored or we can keep it if backend handles it)
            // Backend Prisma create will fail if we send extra fields not in schema? 
            // Prisma usually complains about unknown fields. We should sanitize `items` before sending.

            const payloadItems = formData.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                discountAmount: item.discountAmount,
                discountPercent: item.discountPercent,
                total: item.total
            }));

            await api.post('/quotations', {
                ...formData,
                customerId: parseInt(formData.customerId),
                items: payloadItems,
                taxType: 'INTRA', // Default for new quotations, can be refined later if needed
                branchId
            });
            toast.success('Quotation created!');
            router.push('/sales/quotations');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to create');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="p-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-semibold">New Quotation</h1>
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                    <FiSave /> Save Quotation
                </button>
            </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                        <div className="flex gap-2 w-full">
                            <SearchableSelect
                                options={customerOptions}
                                value={formData.customerId}
                                onChange={(val) => setFormData({ ...formData, customerId: val })}
                                placeholder="Select Customer"
                                direction="down"
                                triggerClassName="min-h-0 h-[38px] py-1.5 px-3 text-sm w-full"
                                className="flex-1"
                            />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quotation Date</label>
                        <input
                            type="date"
                            className="input w-full"
                            value={formData.quotationDate}
                            onChange={e => setFormData({ ...formData, quotationDate: e.target.value })}
                        />
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                        <input
                            type="date"
                            className="input w-full"
                            value={formData.validUntil}
                            onChange={e => setFormData({ ...formData, validUntil: e.target.value })}
                        />
                    </div>
                </div>

                {/* Product Select Dropdown */}
                <div className="bg-white p-6 rounded-lg shadow-sm mb-6 relative">
                    <h2 className="text-lg font-semibold mb-4">Add Items</h2>
                    <div className="mb-4">
                        <SearchableSelect
                            options={products.map(p => ({
                                value: p.id,
                                label: p.name
                            }))}
                            value={null} // Always reset after selection
                            onChange={(val) => {
                                const product = products.find(p => p.id == val);
                                if (product) addItem(product);
                            }}
                            placeholder="Select Product to add..."
                            className="w-full"
                        />
                    </div>

                    {/* Items Table */}
                    <div className="mt-6 table-container scroll-line lg:no-scrollbar overflow-x-auto">
                        <table className="w-full text-left min-w-[850px]">
                            <thead>
                                <tr className="border-b border-gray-200 text-sm font-medium text-gray-500 whitespace-nowrap">
                                    <th className="pb-3">Product</th>
                                    <th className="pb-3 w-20">HSN</th>
                                    <th className="pb-3 w-24">Qty</th>
                                    <th className="pb-3 w-32">Price</th>
                                    <th className="pb-3 w-32">Discount</th>
                                    <th className="pb-3 w-20">Tax %</th>
                                    <th className="pb-3 w-32">Total</th>
                                    <th className="pb-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {formData.items.map((item, index) => (
                                    <tr key={index}>
                                        <td className="py-3 pr-4">
                                            {item.name}
                                            {item.isTaxInclusive && (
                                                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1 rounded">Inc. Tax</span>
                                            )}
                                        </td>
                                        <td className="py-3 text-sm text-gray-500">{item.hsnCode}</td>
                                        <td className="py-3">
                                            <input
                                                type="number"
                                                className="input w-20 px-2 py-1 text-sm"
                                                min="1"
                                                value={item.quantity}
                                                onChange={e => updateItem(index, 'quantity', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3">
                                            <input
                                                type="number"
                                                className="input w-24 px-2 py-1 text-sm"
                                                value={item.unitPrice}
                                                onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                                            />
                                        </td>
                                        <td className="py-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        className="input w-16 px-1 py-1 text-xs"
                                                        placeholder="%"
                                                        value={item.discountPercent}
                                                        onChange={e => updateItem(index, 'discountPercent', e.target.value)}
                                                    />
                                                    <span className="text-[10px] text-gray-400">%</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        className="input w-16 px-1 py-1 text-xs"
                                                        placeholder="Amt"
                                                        value={item.discountAmount}
                                                        onChange={e => updateItem(index, 'discountAmount', e.target.value)}
                                                    />
                                                    <span className="text-[10px] text-gray-400">{currencySymbol}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 text-sm text-gray-600">
                                            {item.taxRate}%
                                            <div className="text-[10px] text-gray-400">{formatAmountWithCurrency(item.taxAmount || 0, currencyCode, currencySymbol)}</div>
                                        </td>
                                        <td className="py-3 font-medium">{formatAmountWithCurrency(item.total, currencyCode, currencySymbol)}</td>
                                        <td className="py-3 text-right">
                                            <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700">
                                                <FiTrash2 />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-100">
                                    <td colSpan="5" className="text-right py-2 text-sm text-gray-600">Subtotal (Excl. Tax):</td>
                                    <td colSpan="2" className="py-2 text-right font-medium text-gray-800">
                                        {formatAmountWithCurrency(formData.items.reduce((sum, item) => sum + (item.total - (item.taxAmount || 0)), 0), currencyCode, currencySymbol)}
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan="5" className="text-right py-2 text-sm text-gray-600">Total Tax:</td>
                                    <td colSpan="2" className="py-2 text-right font-medium text-gray-800">
                                        {formatAmountWithCurrency(formData.items.reduce((sum, item) => sum + (item.taxAmount || 0), 0), currencyCode, currencySymbol)}
                                    </td>
                                </tr>
                                <tr className="border-t-2 border-gray-100">
                                    <td colSpan="5" className="text-right py-4 font-medium text-gray-600">Grand Total:</td>
                                    <td colSpan="2" className="py-4 text-xl font-semibold text-blue-600 text-right">
                                        {formatAmountWithCurrency(calculateGrandTotal(), currencyCode, currencySymbol)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Terms</label>
                    <textarea
                        className="input w-full"
                        rows="3"
                        placeholder="Additional notes for the customer..."
                        value={formData.notes}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    />
                </div>
            </div >
        </>
    );
}

