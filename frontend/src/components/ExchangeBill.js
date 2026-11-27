import React, { forwardRef } from 'react';
import { formatAmountWithCurrency, normalizeCurrencySymbol, DEFAULT_CURRENCY } from '@/lib/currency';

const ExchangeBill = forwardRef(({ printData, companyProfile }, ref) => {
  if (!printData) return null;

  const {
    exchange,
    returnSale,
    newSale,
    customer,
    branch,
    financials,
    companyProfile: profileOverride,
    settings = {}
  } = printData;

  const comp = profileOverride || companyProfile || {};
  const isExchange = Boolean(newSale && newSale.items && newSale.items.length > 0);
  const curCode = returnSale?.currencyCode || newSale?.currencyCode || branch?.currencyCode || comp?.currencyCode || DEFAULT_CURRENCY;
  const curSymbol = normalizeCurrencySymbol(returnSale?.currencySymbol || newSale?.currencySymbol || branch?.currencySymbol || comp?.currencySymbol, curCode);

  const fmt = (val) => formatAmountWithCurrency(val || 0, curCode, curSymbol);

  const exchangeNumber = exchange?.exchangeNumber || returnSale?.exchangeReference || (isExchange ? 'EXC-' + returnSale?.id : returnSale?.invoiceNumber);
  const originalInvoice = exchange?.originalInvoice || returnSale?.originalInvoice || '-';
  const returnInvoiceNumber = returnSale?.invoiceNumber || '-';
  const newInvoiceNumber = newSale?.invoiceNumber || null;
  const custName = customer?.name || returnSale?.customer?.name || returnSale?.customerName || 'Walk-in Customer';
  const custPhone = customer?.phone || returnSale?.customer?.phone || '-';
  const branchName = branch?.name || returnSale?.branch?.name || comp?.companyName || 'Main Store';
  const branchAddress = branch?.address || returnSale?.branch?.address || comp?.address || '';
  const branchPhone = branch?.phone || returnSale?.branch?.phone || comp?.phone || '';

  const dateStr = (returnSale?.saleDate || exchange?.createdAt || new Date()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const returnItems = returnSale?.items || [];
  const newItems = newSale?.items || [];

  const returnTotal = financials?.returnTotal ?? Number(returnSale?.totalAmount || 0);
  const newPurchaseTotal = financials?.newPurchaseTotal ?? (isExchange ? Number(newSale?.totalAmount || 0) : 0);
  const creditApplied = financials?.creditApplied ?? (isExchange ? Math.min(returnTotal, newPurchaseTotal) : 0);
  const remainingPayable = financials?.remainingPayable ?? Math.max(0, newPurchaseTotal - returnTotal);
  const remainingCredit = financials?.remainingCredit ?? Math.max(0, returnTotal - newPurchaseTotal);
  const refundAmount = financials?.refundAmount ?? Number(returnSale?.refundAmount || 0);
  const actualRefundAmount = refundAmount;
  const settlementType = financials?.settlementType || exchange?.settlementType || (isExchange ? (remainingPayable > 0 ? 'DIFFERENCE_PAID' : 'EXACT_EXCHANGE') : (refundAmount > 0 ? 'REFUNDED' : 'STORE_CREDIT'));

  return (
    <div
      ref={ref}
      className="p-8 max-w-[210mm] mx-auto bg-white text-slate-900 font-sans leading-normal text-xs"
      style={{ minHeight: '100%', boxSizing: 'border-box' }}
    >
      {/* HEADER SECTION */}
      <div className="border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            {comp.logoUrl && (
              <img src={comp.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">
                {comp.companyName || 'VINTAGE 73'}
              </h1>
              <p className="text-[11px] text-slate-600 font-medium">{branchName}</p>
              {branchAddress && <p className="text-[10px] text-slate-500">{branchAddress}</p>}
              {branchPhone && <p className="text-[10px] text-slate-500">Ph: {branchPhone}</p>}
              {comp.gstin && <p className="text-[10px] text-slate-500 font-mono">GSTIN: {comp.gstin}</p>}
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-sm mb-2">
              {isExchange ? 'EXCHANGE BILL & CREDIT NOTE' : 'SALES RETURN CREDIT NOTE'}
            </span>
            <div className="text-[11px] space-y-0.5">
              <p><span className="text-slate-500">Ref:</span> <strong className="font-mono text-slate-900">{exchangeNumber}</strong></p>
              <p><span className="text-slate-500">Date:</span> <strong>{dateStr}</strong></p>
              <p><span className="text-slate-500">Orig Invoice:</span> <strong className="font-mono">{originalInvoice}</strong></p>
            </div>
          </div>
        </div>

        {/* METADATA BAR */}
        <div className="mt-4 pt-3 border-t border-dashed border-slate-200 grid grid-cols-2 gap-4 text-[11px]">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Customer Details</p>
            <p className="font-semibold text-slate-800">{custName}</p>
            {custPhone && custPhone !== '-' && <p className="text-slate-600">Mob: {custPhone}</p>}
          </div>
          <div className="text-right space-y-0.5">
            <p><span className="text-slate-500">Credit Note No:</span> <strong className="font-mono text-amber-700">{returnInvoiceNumber}</strong></p>
            {isExchange && newInvoiceNumber && (
              <p><span className="text-slate-500">Exchange Invoice No:</span> <strong className="font-mono text-emerald-700">{newInvoiceNumber}</strong></p>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: RETURNED PRODUCTS */}
      <div className="mb-6">
        <div className="bg-amber-50 border-l-4 border-amber-500 px-3 py-1.5 mb-2 flex justify-between items-center">
          <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
            Section 1: Returned Products (Credit Note #{returnInvoiceNumber})
          </h2>
          <span className="text-[11px] font-semibold text-amber-800">
            Total Return Value: {fmt(returnTotal)}
          </span>
        </div>

        <table className="w-full text-left border-collapse border border-slate-200 text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px]">
              <th className="p-2 border border-slate-200 w-8 text-center">#</th>
              <th className="p-2 border border-slate-200">Product & Details</th>
              <th className="p-2 border border-slate-200">Reason</th>
              <th className="p-2 border border-slate-200 text-center w-12">Qty</th>
              <th className="p-2 border border-slate-200 text-right w-20">Unit Price</th>
              <th className="p-2 border border-slate-200 text-right w-16">Disc</th>
              <th className="p-2 border border-slate-200 text-right w-24">Return Value</th>
            </tr>
          </thead>
          <tbody>
            {returnItems.map((item, idx) => {
              const pName = item.product?.name || item.name || 'Returned Product';
              const pBarcode = item.product?.barcode || item.barcode || '';
              const sizeStr = item.size ? `Size: ${item.size}` : '';
              return (
                <tr key={item.id || idx} className="hover:bg-amber-50/20">
                  <td className="p-2 border border-slate-200 text-center font-mono">{idx + 1}</td>
                  <td className="p-2 border border-slate-200">
                    <div className="font-semibold text-slate-800">{pName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{[pBarcode, sizeStr].filter(Boolean).join(' • ')}</div>
                  </td>
                  <td className="p-2 border border-slate-200 text-slate-600 italic text-[10px]">
                    {item.returnReason || returnSale?.returnReason || 'Product Return'}
                  </td>
                  <td className="p-2 border border-slate-200 text-center font-bold text-amber-700">{item.quantity}</td>
                  <td className="p-2 border border-slate-200 text-right">{fmt(item.unitPrice)}</td>
                  <td className="p-2 border border-slate-200 text-right text-slate-500">
                    {item.discountAmount > 0 ? fmt(item.discountAmount) : '-'}
                  </td>
                  <td className="p-2 border border-slate-200 text-right font-bold text-slate-800">
                    {fmt(item.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-amber-50/50 font-bold">
              <td colSpan={6} className="p-2 border border-slate-200 text-right uppercase text-[10px] text-amber-900">
                Total Return Credit:
              </td>
              <td className="p-2 border border-slate-200 text-right text-amber-800 font-mono">
                {fmt(returnTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SECTION 2: NEWLY PURCHASED / REPLACEMENT PRODUCTS (IF APPLICABLE) */}
      {isExchange && (
        <div className="mb-6">
          <div className="bg-emerald-50 border-l-4 border-emerald-500 px-3 py-1.5 mb-2 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Section 2: Newly Purchased Products (Exchange Bill #{newInvoiceNumber})
            </h2>
            <span className="text-[11px] font-semibold text-emerald-800">
              New Purchase Total: {fmt(newPurchaseTotal)}
            </span>
          </div>

          <table className="w-full text-left border-collapse border border-slate-200 text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px]">
                <th className="p-2 border border-slate-200 w-8 text-center">#</th>
                <th className="p-2 border border-slate-200">Product & Details</th>
                <th className="p-2 border border-slate-200 text-center w-16">Size/Var</th>
                <th className="p-2 border border-slate-200 text-center w-12">Qty</th>
                <th className="p-2 border border-slate-200 text-right w-20">Price</th>
                <th className="p-2 border border-slate-200 text-right w-16">Disc</th>
                <th className="p-2 border border-slate-200 text-right w-24">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {newItems.map((item, idx) => {
                const pName = item.product?.name || item.name || 'New Product';
                const pBarcode = item.product?.barcode || item.barcode || '';
                return (
                  <tr key={item.id || idx} className="hover:bg-emerald-50/20">
                    <td className="p-2 border border-slate-200 text-center font-mono">{idx + 1}</td>
                    <td className="p-2 border border-slate-200">
                      <div className="font-semibold text-slate-800">{pName}</div>
                      {pBarcode && <div className="text-[10px] text-slate-400 font-mono">{pBarcode}</div>}
                    </td>
                    <td className="p-2 border border-slate-200 text-center text-slate-600 font-medium">
                      {item.size || '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-center font-bold text-emerald-700">{item.quantity}</td>
                    <td className="p-2 border border-slate-200 text-right">{fmt(item.unitPrice)}</td>
                    <td className="p-2 border border-slate-200 text-right text-slate-500">
                      {item.discountAmount > 0 ? fmt(item.discountAmount) : '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-bold text-slate-800">
                      {fmt(item.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50/50 font-bold">
                <td colSpan={6} className="p-2 border border-slate-200 text-right uppercase text-[10px] text-emerald-900">
                  New Purchase Grand Total:
                </td>
                <td className="p-2 border border-slate-200 text-right text-emerald-800 font-mono">
                  {fmt(newPurchaseTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* FINANCIAL SETTLEMENT SUMMARY */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-3">
          Final Financial Settlement & Credit Adjustment
        </h3>

        <div className="grid grid-cols-2 gap-8 text-[11px]">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Return Value:</span>
              <span className="font-medium font-mono text-amber-700">{fmt(returnTotal)}</span>
            </div>
            {isExchange && (
              <div className="flex justify-between">
                <span className="text-slate-600">New Purchase Total:</span>
                <span className="font-medium font-mono text-emerald-700">{fmt(newPurchaseTotal)}</span>
              </div>
            )}
            {isExchange && (
              <div className="flex justify-between border-t border-dashed pt-1 font-semibold">
                <span className="text-slate-800">Return Credit Applied:</span>
                <span className="font-mono text-primary">- {fmt(creditApplied)}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Settlement Classification:</span>
              <span className="font-mono uppercase font-bold text-slate-700">{settlementType.replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="space-y-1.5 border-l border-slate-200 pl-6">
            {remainingPayable > 0 && (
              <div className="flex justify-between items-center py-1 bg-amber-100/50 px-2 rounded font-bold text-amber-900">
                <span>Customer Amount Paid:</span>
                <span className="font-mono text-sm">{fmt(remainingPayable)}</span>
              </div>
            )}

            {remainingPayable === 0 && isExchange && (
              <div className="flex justify-between items-center py-1 bg-emerald-100/50 px-2 rounded font-bold text-emerald-900">
                <span>Additional Payment:</span>
                <span className="font-mono">₹0.00 (Exact Exchange)</span>
              </div>
            )}

            {remainingCredit > 0 && settlementType === 'STORE_CREDIT' && (
              <div className="flex justify-between items-center py-1 bg-blue-100/50 px-2 rounded font-bold text-blue-900">
                <span>Retained Customer Credit:</span>
                <span className="font-mono">{fmt(remainingCredit)}</span>
              </div>
            )}

            {actualRefundAmount > 0 && (
              <div className="flex justify-between items-center py-1 bg-purple-100/50 px-2 rounded font-bold text-purple-900">
                <span>Cash/Bank Refund Issued:</span>
                <span className="font-mono">{fmt(actualRefundAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-[11px] pt-1 border-t">
              <span className="text-slate-600">Payment Method:</span>
              <span className="font-semibold text-slate-800">
                {newSale?.paymentMethod || returnSale?.paymentMethod || exchange?.paymentMethod || 'Cash'}
              </span>
            </div>

            {/* Split Payments Breakdown if multiple payments */}
            {(() => {
              const paymentList = (newSale?.payments && newSale.payments.length > 0)
                ? newSale.payments
                : (returnSale?.payments && returnSale.payments.length > 0)
                ? returnSale.payments
                : (financials?.payments && financials.payments.length > 0)
                ? financials.payments
                : [];
              if (paymentList.length > 1) {
                return (
                  <div className="pt-1 border-t border-dashed space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Split Payments:</span>
                    {paymentList.map((p, idx) => (
                      <div key={idx} className="flex justify-between text-[10px] text-slate-700 pl-1">
                        <span>• {p.method}:</span>
                        <span className="font-mono font-medium">{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })()}

            <div className="flex justify-between text-xs font-bold pt-1 border-t text-slate-900">
              <span>Transaction Net Balance:</span>
              <span className="font-mono text-emerald-700">₹0.00 (Fully Settled)</span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER & TERMS */}
      <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between items-end">
        <div className="max-w-[65%] space-y-1">
          <p className="font-semibold text-slate-700">Terms & Conditions:</p>
          <p>1. Exchanged and returned products must be in original condition with tags intact.</p>
          <p>2. Customer store credit can be redeemed against future purchases at any branch.</p>
          <p>3. This is a computer-generated Credit Note and Exchange Tax Invoice.</p>
        </div>
        <div className="text-center w-36">
          <div className="border-b border-slate-400 h-10 mb-1"></div>
          <p className="font-semibold text-slate-700">Authorized Signature</p>
        </div>
      </div>
    </div>
  );
});

ExchangeBill.displayName = 'ExchangeBill';

export default ExchangeBill;
