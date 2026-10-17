import { useState, useEffect, useRef } from 'react';

import api from '@/lib/api';
import { toast } from 'react-toastify';
import { useReactToPrint } from 'react-to-print';
import { FiX, FiPrinter, FiSearch, FiSave, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';

export default function SalesReturn() {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceData, setInvoiceData] = useState(null);
  const [returnItems, setReturnItems] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerBalance, setCustomerBalance] = useState(0);
  const [lastReturn, setLastReturn] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [invoiceSettings, setInvoiceSettings] = useState(null);

  const componentRef = useRef();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
      // Fetch Company Profile and Dedicated Invoice Settings (Return Type)
      try {
        const [compRes, settingsRes] = await Promise.all([
          api.get('/company'),
          api.get('/invoice-settings', { params: { type: 'return' } })
        ]);

        if (compRes.data) {
          setCompanyProfile(compRes.data);
        }

        if (settingsRes.data?.settings) {
          setInvoiceSettings(settingsRes.data.settings);
        }
      } catch (err) {
        console.error('Failed to load professional invoice settings', err);
      }
  };

  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
  });

  const handleSearch = async () => {
    if (!invoiceNo) return;
    try {
      setLoading(true);
      const res = await api.get(`/sales?invoice=${invoiceNo}`);
      const invoice = res.data[0]; // Backend now returns a single-item array for invoice searches

      if (invoice && invoice.invoiceNumber === invoiceNo) {
        setInvoiceData(invoice);
        setReturnItems(invoice.items.map(item => ({
          ...item,
          returnQty: 0,
          alreadyReturnedQty: item.alreadyReturnedQty || 0
        })));

        // Fetch customer balance if customerId exists
        if (invoice.customerId) {
          const balRes = await api.get(`/customers/${invoice.customerId}/balance`);
          setCustomerBalance(parseFloat(balRes.data.balance || 0));
        } else {
          setCustomerBalance(0);
        }
      } else {
        toast.error('Invoice not found');
        setInvoiceData(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error fetching invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (itemId, qty) => {
    setReturnItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const alreadyReturned = item.alreadyReturnedQty || 0;
        const maxReturnable = item.quantity - alreadyReturned;
        const newQty = Math.min(Math.max(0, parseInt(qty) || 0), maxReturnable);
        return { ...item, returnQty: newQty };
      }
      return item;
    }));
  };

  const calculateReturnTotal = () => {
    return returnItems.reduce((sum, item) => {
      const netPrice = parseFloat(item.unitPrice) - parseFloat(item.discountAmount || 0);
      return sum + (item.returnQty * netPrice);
    }, 0);
  };

  const submitReturn = async () => {
    const itemsToReturn = returnItems.filter(i => i.returnQty > 0);
    if (itemsToReturn.length === 0) {
      toast.error('No items selected for return');
      return;
    }
    if (!reason) {
      toast.error('Please provide a reason');
      return;
    }

    try {
      const payload = {
        customerId: invoiceData.customerId,
        isReturn: true,
        returnReason: reason,
        originalInvoice: invoiceData.invoiceNumber,
        paymentMethod: 'Cash',
        items: itemsToReturn.map(i => ({
          productId: i.productId,
          quantity: i.returnQty,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount || 0,
          taxPercent: i.taxPercent || 0
        }))
      };

      const { data } = await api.post('/sales', payload);
      setLastReturn(data);
      toast.success('Return Processed Successfully');

      // Clear form
      setInvoiceData(null);
      setInvoiceNo('');
      setReturnItems([]);
      setReason('');

      // Auto print
      setTimeout(() => {
        handlePrint();
      }, 500);

    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to process return');
    }
  };

  const returnTotal = calculateReturnTotal();

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Sales Return</h1>
          <p className="text-slate-500 text-sm">Create credit notes and manage stock returns</p>
        </div>
      </div>

      <div className="card border-0 shadow-sm w-full mb-8 p-6 bg-white rounded-2xl">
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Original Invoice Number</label>
        <div className="flex gap-4">
          <input
            className="input flex-1 py-3 text-lg font-mono"
            placeholder="INV-XXXXXX"
            value={invoiceNo}
            onChange={e => setInvoiceNo(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary px-8" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : <FiSearch />}
          </button>
        </div>
      </div>

      {invoiceData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          <div className="lg:col-span-2 space-y-6">
            <div className="card border-0 shadow-sm p-0 overflow-hidden bg-white rounded-2xl">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-medium text-slate-700">Invoice Items</h3>
                <span className="text-xs bg-primary-light/10 text-primary font-medium px-2 py-1 rounded">ORIGINAL: {invoiceData.invoiceNumber}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="table-modern w-full">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-center">Sold</th>
                      <th className="text-center">Returned</th>
                      <th className="text-center">Remaining</th>
                      <th className="text-right">Price</th>
                      <th className="text-center w-32">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {returnItems.map(item => {
                      const remaining = item.quantity - (item.alreadyReturnedQty || 0);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="py-4">
                            <div className="font-medium text-slate-800">{item.product?.name || item.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono italic">{item.product?.barcode}</div>
                          </td>
                          <td className="text-center font-medium text-slate-600">{item.quantity}</td>
                          <td className="text-center font-medium text-amber-600">{item.alreadyReturnedQty || 0}</td>
                          <td className="text-center font-medium text-slate-900">{remaining}</td>
                          <td className="text-right font-medium text-slate-700">₹ {parseFloat(item.unitPrice).toFixed(2)}</td>
                          <td className="text-center">
                            <input
                              type="number"
                              className={`w-20 py-1 px-2 border border-slate-200 rounded-lg text-center font-medium focus:ring-primary focus:border-primary ${remaining === 0 ? 'bg-slate-100 text-slate-400' : ''}`}
                              value={item.returnQty}
                              onChange={(e) => handleQtyChange(item.id, e.target.value)}
                              min="0"
                              max={remaining}
                              disabled={remaining === 0}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card border-0 shadow-sm p-6 bg-white rounded-2xl">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Reason for Return</label>
              <textarea
                className="input min-h-[100px]"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Describe the reason for return (e.g., Defective, Wrong Size, Customer Choice)"
              ></textarea>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card border-0 shadow-sm p-6 bg-white rounded-2xl">
              <h3 className="font-medium text-slate-800 mb-4 border-b pb-2">Account Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium text-slate-700">{invoiceData.customer?.name || invoiceData.customerName || 'Walk-in'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Current Balance</span>
                  <span className="font-medium text-red-500">₹ {customerBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-t border-dashed">
                  <span className="text-slate-800 font-medium">Return Value</span>
                  <span className="font-medium text-primary">- ₹ {returnTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t font-medium">
                  <span className="text-slate-900">New Balance</span>
                  <span className="text-primary font-medium">₹ {Math.max(0, customerBalance - returnTotal).toFixed(2)}</span>
                </div>
              </div>

              <button
                className="w-full btn btn-primary mt-8 py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                onClick={submitReturn}
              >
                <FiSave size={20} /> Process & Print Note
              </button>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
              <div className="text-amber-500 mt-1">⚠️</div>
              <div className="text-xs text-amber-800 leading-relaxed">
                <strong>Stock Update:</strong> Processing a return will automatically increment the physical stock for the selected items in your inventory.
              </div>
            </div>
          </div>
        </div>
      )}

      {!invoiceData && !loading && (
        <div className="flex flex-col items-center justify-center py-20 opacity-40">
          <FiSearch size={64} className="text-slate-300 mb-4" />
          <p className="text-slate-500">Search an invoice to start the return process</p>
        </div>
      )}

      {/* Hidden Print Component (Credit Note) */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <ProfessionalInvoice
          ref={componentRef}
          printData={{
            ...lastReturn,
            customer: lastReturn?.customer || invoiceData?.customer,
            customerName: lastReturn?.customerName || invoiceData?.customerName || 'Walk-in Customer',
            previousBalance: lastReturn?.previousBalance || 0,
            currentBalance: lastReturn?.currentBalance || 0,
            settings: {
              ...(invoiceSettings || {}),
              template: invoiceSettings?.template || 'modern'
            }
          }}
          companyProfile={companyProfile}
        />
      </div>
    </div>
  );
}
