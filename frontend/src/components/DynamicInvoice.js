import React, { forwardRef } from 'react';
import { formatAmountWithCurrency, normalizeCurrencySymbol, DEFAULT_CURRENCY } from '@/lib/currency';

const DynamicInvoice = forwardRef(({ printData, companyProfile, invoiceSettings }, ref) => {
  if (!printData) return null;

  const curCode = printData.currencyCode || printData.branch?.currencyCode || companyProfile?.currencyCode || DEFAULT_CURRENCY;
  const curSymbol = normalizeCurrencySymbol(printData.currencySymbol || printData.branch?.currencySymbol || companyProfile?.currencySymbol, curCode);
  const fmt = (val) => formatAmountWithCurrency(val, curCode, curSymbol);

  const activeTab = printData.isReturn ? 'return' : 'sales';
  const config = invoiceSettings?.[activeTab] || {};
  const layout = config.layout || {
    header: ['logo', 'company_name', 'address', 'contact', 'invoice_meta', 'customer'],
    body: ['details_table'],
    footer: ['terms', 'signature']
  };
  const styles = config.styles || {};

  const pSize = config.pageSize || 'A5';
  const width = pSize === 'A4' ? '210mm' : pSize === 'Thermal' ? '80mm' : '148mm';
  const padding = pSize === 'Thermal' ? '10px' : '32px';

  const getStyle = (id) => {
    const s = styles[id] || {};
    return {
      fontSize: s.fontSize ? `${s.fontSize}px` : (id === 'company_name' ? '20px' : '12px'),
      fontWeight: s.fontWeight || 'normal',
      fontFamily: s.fontFamily || 'sans-serif',
      textAlign: s.align || 'center',
      paddingTop: s.paddingTop ? `${s.paddingTop}px` : '4px',
      paddingBottom: s.paddingBottom ? `${s.paddingBottom}px` : '4px',
      color: s.color || '#000000',
      lineHeight: '1.2'
    };
  };

  const renderComponent = (id) => {
    const componentStyle = getStyle(id);

    switch (id) {
      case 'details_table':
        return (
          <div key={id} style={{ ...componentStyle, textAlign: 'left' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #000', borderTop: '2px solid #000', fontSize: '10px', textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>Item</th>
                  {componentStyle.showHSN && <th style={{ textAlign: 'left', padding: '8px 4px' }}>HSN</th>}
                  <th style={{ textAlign: 'center', padding: '8px 4px' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Price</th>
                  {componentStyle.showDiscount && <th style={{ textAlign: 'right', padding: '8px 4px' }}>Disc %</th>}
                  {componentStyle.showTax && <th style={{ textAlign: 'right', padding: '8px 4px' }}>{companyProfile?.taxSystem || 'Tax'}</th>}
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Total</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '10px' }}>
                {printData.items?.map(item => {
                  const taxInfo = item.product?.taxPercent || item.taxPercent || 0;
                  const discPercent = item.discountPercent || 0;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 4px' }}>
                        <b style={{ fontSize: '11px' }}>{item.product?.name || item.name}</b>
                        {item.product?.isTaxInclusive && <span style={{ fontSize: '8px', color: '#666', display: 'block' }}>(Inc. Tax)</span>}
                      </td>
                      {componentStyle.showHSN && (
                        <td style={{ padding: '8px 4px' }}>
                          {item.product?.hsnCode || item.hsnCode || '-'}
                        </td>
                      )}
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '8px 4px' }}>{parseFloat(item.unitPrice || item.price).toFixed(2)}</td>
                      {componentStyle.showDiscount && <td style={{ textAlign: 'right', padding: '8px 4px' }}>{discPercent}%</td>}
                      {componentStyle.showTax && <td style={{ textAlign: 'right', padding: '8px 4px' }}>{(item.product?.taxRate || item.taxRate || 0)}%</td>}
                      <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 'bold' }}>{parseFloat(item.total).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );

      case 'tax_summary': {
        const items = printData.items || [];
        const taxSystem = companyProfile?.taxSystem || 'GST';
        const taxBreakdown = {};

        items.forEach(item => {
          const taxRate = parseFloat(item.product?.taxRate || item.taxRate || 0);
          const lineTax = parseFloat(item.taxAmount || 0);

          if (taxRate > 0) {
            if (!taxBreakdown[taxRate]) {
              taxBreakdown[taxRate] = { tax: 0, taxableValue: 0 };
            }
            taxBreakdown[taxRate].tax += lineTax;
            // Taxable value is item total minus tax if inclusive, or item total if exclusive
            const itemTotal = parseFloat(item.total || 0);
            const isInc = item.product?.isTaxInclusive || item.isTaxInclusive || false;
            taxBreakdown[taxRate].taxableValue += isInc ? (itemTotal - lineTax) : (itemTotal - lineTax);
            // Wait, if it's exclusive, itemTotal (from saleItem) usually includes tax? 
            // Let's rely on backend: total = lineTotal + lineTax
            // So Taxable Value = Total - Tax
          }
        });

        return (
          <div key={id} style={componentStyle}>
            <div style={{ marginTop: '16px', border: '1px solid #000', borderRadius: '4px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #000' }}>
                    <th style={{ padding: '4px', textAlign: 'left', borderRight: '1px solid #000' }}>{taxSystem} Rate</th>
                    <th style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>Taxable Val</th>
                    {taxSystem === 'GST' ? (
                      <>
                        <th style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>CGST</th>
                        <th style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>SGST</th>
                      </>
                    ) : (
                      <th style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>Tax Amount</th>
                    )}
                    <th style={{ padding: '4px', textAlign: 'right' }}>Total {taxSystem}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(taxBreakdown).map(([rate, data]) => (
                    <tr key={rate} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px', borderRight: '1px solid #000' }}>{rate}% {taxSystem}</td>
                      <td style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>{data.taxableValue.toFixed(2)}</td>
                      {taxSystem === 'GST' ? (
                        <>
                          <td style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>{(data.tax / 2).toFixed(2)}</td>
                          <td style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>{(data.tax / 2).toFixed(2)}</td>
                        </>
                      ) : (
                        <td style={{ padding: '4px', textAlign: 'right', borderRight: '1px solid #000' }}>{data.tax.toFixed(2)}</td>
                      )}
                      <td style={{ padding: '4px', textAlign: 'right' }}>{data.tax.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'udf_fields':
        return (
          <div key={id} style={componentStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '12px' }}>
              {(componentStyle.fields || []).map((f, i) => (
                <div key={i} style={{ borderBottom: '1px dashed #ccc', paddingBottom: '2px' }}>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#666', fontWeight: 'bold' }}>{f.label}: </span>
                  <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'total_summary': {
        // Calculate Total Discount and GST Breakdown for the summary
        const totalItems = printData.items || [];
        const totalDiscount = totalItems.reduce((acc, item) => acc + (parseFloat(item.discountAmount || 0) * item.quantity), 0);

        const taxSystem = companyProfile?.taxSystem || 'GST';
        const taxSummary = {};
        totalItems.forEach(item => {
          const taxAmount = parseFloat(item.taxAmount || 0);
          if (taxAmount > 0) {
            if (taxSystem === 'GST') {
              const halfTax = taxAmount / 2;
              if (!taxSummary['SGST']) taxSummary['SGST'] = 0;
              if (!taxSummary['CGST']) taxSummary['CGST'] = 0;
              taxSummary['SGST'] += halfTax;
              taxSummary['CGST'] += halfTax;
            } else {
              if (!taxSummary[taxSystem]) taxSummary[taxSystem] = 0;
              taxSummary[taxSystem] += taxAmount;
            }
          }
        });

        const alignment = componentStyle.textAlign === 'left' ? 'flex-start' : componentStyle.textAlign === 'center' ? 'center' : 'flex-end';

        return (
          <div key={id} style={componentStyle}>
            <div style={{ marginTop: '8px', borderTop: '2px solid #000', paddingTop: '8px', display: 'flex', flexDirection: 'column', alignItems: alignment }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '10px' }}>
                <span>Subtotal:</span>
                <span>{fmt(printData.subTotal || printData.totalAmount)}</span>
              </div>

              {totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '10px', color: '#dc2626' }}>
                  <span>Total Discount:</span>
                  <span>- {fmt(totalDiscount)}</span>
                </div>
              )}

              {Object.entries(taxSummary).map(([type, amount]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '10px' }}>
                  <span>{type}:</span>
                  <span>{fmt(amount)}</span>
                </div>
              ))}

              {(parseFloat(printData.deliveryCharge || 0) > 0 || printData.hasDeliveryCharge) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '10px' }}>
                  <span>Delivery Charge:</span>
                  <span>+{fmt(parseFloat(printData.deliveryCharge || 0))}</span>
                </div>
              )}

              {(parseFloat(printData.roundOffAmount || 0) !== 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '10px', fontStyle: 'italic' }}>
                  <span>Round Off:</span>
                  <span>{fmt(parseFloat(printData.roundOffAmount))}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '14px', fontWeight: 'bold', borderTop: '1px solid #000', marginTop: '4px', paddingTop: '4px' }}>
                <span>Grand Total:</span>
                <span>{fmt(printData.totalAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '11px', color: '#16a34a', marginTop: '2px' }}>
                <span>Amount Paid:</span>
                <span>{fmt(printData.paidAmount !== undefined ? printData.paidAmount : (printData.totalAmount || 0))}</span>
              </div>
              {parseFloat(printData.balanceAmount || 0) > 0.01 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '200px', fontSize: '11px', color: '#dc2626', fontWeight: 'bold', marginTop: '2px' }}>
                  <span>Balance Due:</span>
                  <span>{fmt(printData.balanceAmount)}</span>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'payment_info': {
        const paidAmt = parseFloat(printData.paidAmount !== undefined ? printData.paidAmount : (printData.totalAmount || 0));
        const balAmt = parseFloat(printData.balanceAmount !== undefined ? printData.balanceAmount : Math.max(0, parseFloat(printData.totalAmount || 0) - paidAmt));
        const statusText = balAmt > 0.01 ? (paidAmt > 0 ? 'Partial' : 'Credit / Unpaid') : 'Paid';
        const statusColor = balAmt > 0.01 ? (paidAmt > 0 ? '#d97706' : '#dc2626') : '#16a34a';

        return (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0 }}>Payment Method: <b>{printData.paymentMethod || 'Cash'}</b> | Status: <b style={{ color: statusColor }}>{statusText}</b></p>
            {printData.payments && printData.payments.length > 1 && (
              <div style={{ fontSize: '10px', marginTop: '4px', color: '#4b5563' }}>
                {printData.payments.map((p, idx) => (
                  <span key={idx} style={{ marginRight: '8px' }}>{p.method}: <b>{fmt(p.amount)}</b></span>
                ))}
              </div>
            )}
            <p style={{ margin: '2px 0 0 0', fontSize: '11px' }}>
              Amount Paid: <b>{fmt(paidAmt)}</b> | Balance: <b>{fmt(balAmt)}</b>
            </p>
          </div>
        );
      }

      case 'salesman':
        return printData.salesman ? (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0 }}>Sales Person: <b>{printData.salesman.name || printData.salesman}</b></p>
          </div>
        ) : null;

      case 'bank_details':
        return (companyProfile?.bankName || companyProfile?.accountNumber) ? (
          <div key={id} style={{ ...componentStyle, background: '#f9fafb', padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>Bank Details:</p>
            <p style={{ margin: 0, fontSize: '11px' }}><b>{companyProfile.bankName}</b></p>
            <p style={{ margin: 0, fontSize: '11px' }}>A/C: {companyProfile.accountNumber} | IFSC: {companyProfile.ifscCode}</p>
          </div>
        ) : null;

      case 'return_info':
        return printData.isReturn ? (
          <div key={id} style={{ ...componentStyle, background: '#fef2f2', padding: '8px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
            <p style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>Credit Note Info:</p>
            <p style={{ margin: 0 }}>Original Invoice: <b>{printData.originalInvoice || '-'}</b></p>
            <p style={{ margin: 0 }}>Reason: {printData.returnReason || 'Not specified'}</p>
          </div>
        ) : null;

      case 'logo':
        return config.showLogo !== false && companyProfile?.logoUrl ? (
          <div key={id} style={componentStyle}>
            <img src={companyProfile.logoUrl} alt="Logo" style={{ maxHeight: '120px', margin: '0 auto', display: 'block' }} />
          </div>
        ) : null;

      case 'company_name':
        return (
          <div key={id} style={componentStyle}>
            <h2 style={{ fontSize: 'inherit', fontWeight: 'inherit', margin: 0 }}>{companyProfile?.companyName || companyProfile?.name || 'BILLING PRO'}</h2>
          </div>
        );

      case 'address':
        return companyProfile?.address ? (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0 }}>{companyProfile.address}, {companyProfile.city}</p>
          </div>
        ) : null;

      case 'contact':
        return (companyProfile?.phone || companyProfile?.email) ? (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0 }}>Ph: {companyProfile.phone} {companyProfile.email ? `| ${companyProfile.email}` : ''}</p>
          </div>
        ) : null;

      case 'tax_info':
        return companyProfile?.gstNumber ? (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>GSTIN: {companyProfile.gstNumber}</p>
          </div>
        ) : null;

      case 'invoice_meta':
        return (
          <div key={id} style={componentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '8px 0', marginTop: '8px' }}>
              <div style={{ textAlign: 'left' }}>
                <p style={{ margin: 0 }}>{printData.quotationNumber ? 'Quote No:' : 'Inv No:'} <b>{printData.quotationNumber || printData.invoiceNumber || 'NEW'}</b></p>
                <p style={{ margin: 0 }}>Date: {new Date(printData.quotationDate || printData.saleDate || printData.createdAt).toLocaleDateString()}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0 }}>Mode: {printData.paymentMethod || 'Cash'}</p>
                <p style={{ margin: 0 }}>Time: {new Date(printData.saleDate || printData.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          </div>
        );

      case 'customer':
        return (
          <div key={id} style={componentStyle}>
            <div style={{ textAlign: 'left', background: '#f9fafb', padding: '8px', borderRadius: '4px', marginTop: '8px' }}>
              <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>Bill To:</p>
              <p style={{ fontWeight: 'bold', margin: '0' }}>{printData.customer?.name || printData.customerName || 'Walk-in Customer'}</p>
            </div>
          </div>
        );

      case 'terms':
        return (config.termsConditions || config.terms) ? (
          <div key={id} style={componentStyle}>
            <p style={{ fontWeight: 'bold', margin: '0 0 4px 0', textAlign: 'left' }}>Terms & Conditions:</p>
            <p style={{ margin: 0, textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: '10px', color: '#6b7280' }}>{config.termsConditions || config.terms}</p>
          </div>
        ) : null;

      case 'signature':
        return (
          <div key={id} style={componentStyle}>
            <div style={{ marginTop: '32px', borderTop: '1px solid #000', width: '200px', display: 'inline-block', paddingTop: '4px' }}>
              <p style={{ fontSize: '10px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>Authorized Signature</p>
            </div>
          </div>
        );

      case 'footer_note':
        return (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0 }}>{config.footerText || 'Thank you for your business!'}</p>
          </div>
        );

      case 'disclaimer':
        return (
          <div key={id} style={componentStyle}>
            <p style={{ fontSize: '9px', color: '#9ca3af', margin: 0, fontStyle: 'italic' }}>
              This is a computer generated invoice.
            </p>
          </div>
        );

      case 'custom_note':
        return (
          <div key={id} style={componentStyle}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{componentStyle.content || ''}</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div ref={ref} className="bg-white text-black" style={{ width, minHeight: pSize === 'Thermal' ? 'auto' : '210mm', padding, fontFamily: 'sans-serif' }}>
      <div className={pSize === 'Thermal' ? 'text-[10px]' : ''}>

        {/* Render Header Section */}
        <div className="mb-6 space-y-1">
          {layout.header?.map(renderComponent)}
        </div>

        {/* Render Body Section (Usually contains Items Table) */}
        <div className="mb-6 space-y-1">
          {layout.body?.map(renderComponent)}
        </div>

        {/* Render Footer Section */}
        <div className="mt-8 space-y-4">
          {layout.footer?.map(renderComponent)}
        </div>

        {/* Default Footer Text */}
        <div className="mt-8 text-center text-[10px] text-gray-400">
          <p>{config.footerText || 'Thank you for your business!'}</p>
        </div>
      </div>
    </div>
  );
});

DynamicInvoice.displayName = 'DynamicInvoice';
export default DynamicInvoice;
