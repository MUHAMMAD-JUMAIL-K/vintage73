import { useMemo } from 'react';
import { formatAmountWithCurrency, normalizeCurrencySymbol, DEFAULT_CURRENCY } from '@/lib/currency';

// Convert number to words
const numberToWords = (num, currencyCode = DEFAULT_CURRENCY) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';

  const convertLessThanThousand = (n) => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertLessThanThousand(n % 100) : '');
  };

  const convert = (n) => {
    if (n < 1000) return convertLessThanThousand(n);
    if (n < 100000) return convertLessThanThousand(Math.floor(n / 1000)) + ' Thousand ' + convertLessThanThousand(n % 1000);
    if (n < 10000000) return convertLessThanThousand(Math.floor(n / 100000)) + ' Lakh ' + convert(n % 100000);
    return convertLessThanThousand(Math.floor(n / 10000000)) + ' Crore ' + convert(n % 10000000);
  };

  const mainUnits = Math.floor(num);
  const subUnits = Math.round((num - mainUnits) * 100);
  
  const code = (currencyCode || DEFAULT_CURRENCY).toUpperCase();
  const mainLabel = code === 'AED' ? 'UAE Dirhams ' : (code === 'INR' ? 'Rupees ' : `${code} `);
  const subLabel = code === 'AED' ? ' Fils' : (code === 'INR' ? ' Paise' : ' Cents');

  let result = mainLabel + convert(mainUnits);
  if (subUnits > 0) {
    result += ' and ' + convert(subUnits) + subLabel;
  }
  return result + ' Only';
};

export default function GSTInvoicePrint({ data }) {
  const { sale, company, settings, taxType, hsnSummary } = data || {};

  const curCode = sale?.currencyCode || sale?.branch?.currencyCode || company?.currencyCode || DEFAULT_CURRENCY;
  const curSymbol = normalizeCurrencySymbol(sale?.currencySymbol || sale?.branch?.currencySymbol || company?.currencySymbol, curCode);
  const fmt = (val) => formatAmountWithCurrency(val, curCode, curSymbol);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const amountInWords = useMemo(() => {
    if (!sale?.totalAmount) return '';
    return numberToWords(parseFloat(sale.totalAmount), curCode);
  }, [sale?.totalAmount, curCode]);

  if (!sale || !company) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-8 bg-white text-black text-sm" style={{ fontFamily: 'Arial, sans-serif', width: '210mm', minHeight: '297mm' }}>
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-4 mb-4">
        <h1 className="text-2xl font-semibold uppercase">{company.companyName}</h1>
        <p className="text-sm">{company.address}, {company.city}, {company.state} - {company.pincode}</p>
        <p className="text-sm">Phone: {company.phone} | Email: {company.email}</p>
        <p className="text-sm font-semibold">GSTIN: {company.registrationNumber}</p>
      </div>

      {/* Invoice Title */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold border border-black inline-block px-6 py-1">TAX INVOICE</h2>
      </div>

      {/* Invoice Details */}
      <div className="grid grid-cols-2 gap-4 mb-4 border border-black p-3">
        <div>
          <p><strong>Invoice No:</strong> {sale.invoiceNumber}</p>
          <p><strong>Invoice Date:</strong> {formatDate(sale.saleDate)}</p>
          <p><strong>Place of Supply:</strong> {sale.placeOfSupply}</p>
        </div>
        <div className="text-right">
          {sale.ewayBillNumber && (
            <>
              <p><strong>E-Way Bill No:</strong> {sale.ewayBillNumber}</p>
              <p><strong>E-Way Bill Date:</strong> {formatDate(sale.ewayBillDate)}</p>
            </>
          )}
          {sale.vehicleNumber && <p><strong>Vehicle No:</strong> {sale.vehicleNumber}</p>}
        </div>
      </div>

      {/* Party Details */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-black p-3">
          <h3 className="font-medium border-b border-black mb-2 pb-1">Bill To:</h3>
          <p className="font-semibold">{sale.customer?.name}</p>
          <p>{sale.customer?.address}</p>
          <p>{sale.customer?.city}, {sale.customer?.state} - {sale.customer?.pincode}</p>
          <p><strong>GSTIN:</strong> {sale.customer?.gstin}</p>
        </div>
        <div className="border border-black p-3">
          <h3 className="font-medium border-b border-black mb-2 pb-1">Ship To:</h3>
          <p className="font-semibold">{sale.customer?.name}</p>
          <p>{sale.customer?.address}</p>
          <p>{sale.customer?.city}, {sale.customer?.state} - {sale.customer?.pincode}</p>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2 text-left">SN</th>
            <th className="border border-black p-2 text-left">Description</th>
            <th className="border border-black p-2 text-center">HSN</th>
            <th className="border border-black p-2 text-center">Qty</th>
            <th className="border border-black p-2 text-right">Rate</th>
            <th className="border border-black p-2 text-right">Taxable</th>
            {taxType === 'INTRA' ? (
              <>
                <th className="border border-black p-2 text-right">CGST</th>
                <th className="border border-black p-2 text-right">SGST</th>
              </>
            ) : (
              <th className="border border-black p-2 text-right">IGST</th>
            )}
            <th className="border border-black p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((item, idx) => {
            const taxable = parseFloat(item.total) - parseFloat(item.taxAmount);
            const tax = parseFloat(item.taxAmount);
            return (
              <tr key={item.id}>
                <td className="border border-black p-2">{idx + 1}</td>
                <td className="border border-black p-2">{item.product?.name}</td>
                <td className="border border-black p-2 text-center">{item.product?.hsnCode || '-'}</td>
                <td className="border border-black p-2 text-center">{item.quantity}</td>
                <td className="border border-black p-2 text-right">{fmt(item.unitPrice)}</td>
                <td className="border border-black p-2 text-right">{fmt(taxable)}</td>
                {taxType === 'INTRA' ? (
                  <>
                    <td className="border border-black p-2 text-right">{fmt(tax / 2)}</td>
                    <td className="border border-black p-2 text-right">{fmt(tax / 2)}</td>
                  </>
                ) : (
                  <td className="border border-black p-2 text-right">{fmt(tax)}</td>
                )}
                <td className="border border-black p-2 text-right font-semibold">{fmt(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* HSN Summary */}
      {hsnSummary && hsnSummary.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">HSN Summary:</h4>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-1 text-left">HSN Code</th>
                <th className="border border-black p-1 text-right">Taxable Value</th>
                {taxType === 'INTRA' ? (
                  <>
                    <th className="border border-black p-1 text-right">CGST</th>
                    <th className="border border-black p-1 text-right">SGST</th>
                  </>
                ) : (
                  <th className="border border-black p-1 text-right">IGST</th>
                )}
                <th className="border border-black p-1 text-right">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {hsnSummary.map((h, idx) => (
                <tr key={idx}>
                  <td className="border border-black p-1">{h.hsn}</td>
                  <td className="border border-black p-1 text-right">{fmt(h.taxableValue)}</td>
                  {taxType === 'INTRA' ? (
                    <>
                      <td className="border border-black p-1 text-right">{fmt(h.cgst)}</td>
                      <td className="border border-black p-1 text-right">{fmt(h.sgst)}</td>
                    </>
                  ) : (
                    <td className="border border-black p-1 text-right">{fmt(h.igst)}</td>
                  )}
                  <td className="border border-black p-1 text-right">{fmt(h.cgst + h.sgst + h.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end mb-4">
        <div className="w-72 border border-black">
          <div className="flex justify-between p-2 border-b border-black">
            <span>Subtotal:</span>
            <span>{fmt(sale.subTotal)}</span>
          </div>
          {taxType === 'INTRA' ? (
            <>
              <div className="flex justify-between p-2 border-b border-black">
                <span>CGST:</span>
                <span>{fmt(parseFloat(sale.taxAmount) / 2)}</span>
              </div>
              <div className="flex justify-between p-2 border-b border-black">
                <span>SGST:</span>
                <span>{fmt(parseFloat(sale.taxAmount) / 2)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between p-2 border-b border-black">
              <span>IGST:</span>
              <span>{fmt(sale.taxAmount)}</span>
            </div>
          )}
          {(parseFloat(sale.deliveryCharge || 0) > 0 || sale.hasDeliveryCharge) && (
            <div className="flex justify-between p-2 border-b border-black">
              <span>Delivery Charge:</span>
              <span>{fmt(parseFloat(sale.deliveryCharge || 0))}</span>
            </div>
          )}
          {parseFloat(sale.roundOffAmount) !== 0 && (
            <div className="flex justify-between p-2 border-b border-black">
              <span>Round Off:</span>
              <span>{fmt(sale.roundOffAmount)}</span>
            </div>
          )}
          <div className="flex justify-between p-2 font-medium bg-gray-100">
            <span>Grand Total:</span>
            <span>{fmt(sale.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Amount in Words */}
      <div className="border border-black p-3 mb-4">
        <p><strong>Amount in Words:</strong> {amountInWords}</p>
      </div>

      {/* Bank Details & Terms */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {((company?.bank) || settings?.bankDetails) && (
          <div className="border border-black p-3">
            <h4 className="font-bold border-b border-black mb-2 pb-1 text-sm uppercase">Bank Details:</h4>
            {company?.bank ? (
              <div className="grid grid-cols-2 gap-y-1 text-xs">
                <div className="font-semibold uppercase">Bank Name:</div>
                <div>{company.bank.name}</div>
                
                <div className="font-semibold uppercase">Account Holder:</div>
                <div>{company.companyName}</div>
                
                <div className="font-semibold uppercase">Account Number:</div>
                <div className="font-bold">{company.bank.accountNumber}</div>
                
                <div className="font-semibold uppercase">IFSC Code:</div>
                <div className="font-bold">{company.bank.ifscCode}</div>
                
                <div className="font-semibold uppercase">Branch:</div>
                <div>{company.bank.branchName}</div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-xs">{settings.bankDetails}</p>
            )}
          </div>
        )}
        {settings?.termsAndConditions && (
          <div className="border border-black p-3">
            <h4 className="font-medium border-b border-black mb-2 pb-1">Terms & Conditions:</h4>
            <p className="whitespace-pre-wrap text-xs">{settings.termsAndConditions}</p>
          </div>
        )}
      </div>

      {/* Signature */}
      <div className="flex justify-between mt-8">
        <div className="text-center">
          <div className="border-t border-black pt-2 w-40">Customer Signature</div>
        </div>
        <div className="text-center">
          <p className="font-semibold mb-8">For {company.companyName}</p>
          <div className="border-t border-black pt-2 w-40">Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
}
