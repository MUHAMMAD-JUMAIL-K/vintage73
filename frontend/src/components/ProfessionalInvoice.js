
import React, { useMemo } from 'react';

// Indian Number to Words conversion
const numberToWords = (num) => {
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

    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    let result = convert(rupees) + ' Rupees';
    if (paise > 0) {
        result += ' and ' + convert(paise) + ' Paise';
    }
    return result + ' Only';
};

const ProfessionalInvoice = React.forwardRef(({ printData, companyProfile, previewMode = 'Desktop' }, ref) => {
    if (!printData) return null;

    const {
        invoiceNumber, quotationNumber, saleDate, quotationDate, createdAt, items, subTotal, taxAmount, totalAmount, roundOffAmount,
        customer, customerName, previousBalance, currentBalance, placeOfSupply,
        currencyCode, currencySymbol, exchangeRate, discount, advanceUsed, description, notes, terms, paidAmount, paymentMethod,
        deliveryCharge, hasDeliveryCharge
    } = printData;

    const isQuotation = !!quotationNumber;

    // Bank details come from Company Profile → default selected bank
    const companyBank = companyProfile?.bank || null;
    const companyBankHolder = companyProfile?.companyName || '';

    // Use createdAt (server timestamp, always accurate) as primary;
    // fallback to saleDate if createdAt is missing
    const invoiceDate = quotationDate || createdAt || saleDate || null;

    const getCurrencySymbol = (code) => {
        if (!code) return null;
        const symbols = {
            'INR': '₹', 'USD': '$', 'AED': 'د.إ', 'EUR': '€', 'GBP': '£',
            'OMR': 'ر.ع.', 'KWD': 'د.ك', 'BHD': 'د.ب', 'QAR': 'ر.ق'
        };
        return symbols[code.toUpperCase()] || null;
    };

    const currentSymbol = currencySymbol || getCurrencySymbol(currencyCode) || companyProfile?.currencySymbol || '₹';
    const settings = printData.settings || {};
    const tpl = (settings.template || 'modern').toLowerCase();
    const pageSize = settings.pageSize || 'A5';
    const accent = settings.accentColor || '#10b981';

    const isThermal = pageSize === 'Thermal';
    const isA5 = pageSize === 'A5';
    const isA4 = pageSize === 'A4';
    const isMobile = previewMode === 'Mobile';

    const isModern = tpl === 'modern' || tpl === 'boutique';
    const isClassic = tpl === 'classic';
    const isBold = tpl === 'bold';
    const isMinimal = tpl === 'minimal' || tpl === 'simple';
    const isBoutiqueA5 = tpl === 'boutique_a5';
    const exRate = parseFloat(exchangeRate) || 1;
    const formatAmt = (amt) => (parseFloat(amt || 0) * exRate).toFixed(2);

    // Use stored discount from DB — single source of truth, do NOT recalculate
    const invoiceDiscount = parseFloat(printData.discount || 0);

    const taxBreakdown = useMemo(() => {
        const breakdown = {};
        items?.forEach(item => {
            const rate = parseFloat(item.taxRate || 0);
            const lineTax = parseFloat(item.taxAmount || 0);
            const taxable = (parseFloat(item.total) || 0) - lineTax;
            if (!breakdown[rate]) {
                breakdown[rate] = { taxableAmount: 0, taxAmount: 0 };
            }
            breakdown[rate].taxableAmount += taxable;
            breakdown[rate].taxAmount += lineTax;
        });
        return breakdown;
    }, [items]);

    const getContainerStyle = () => {
        const base = {
            width: isThermal ? '80mm' : (isA5 || isBoutiqueA5 ? '148mm' : '210mm'),
            minHeight: isThermal ? 'auto' : (isA5 || isBoutiqueA5 ? '208mm' : '295mm'),
            padding: isThermal ? '4mm' : (isBoutiqueA5 ? '6mm 10mm 8mm 10mm' : isA5 ? '6mm 10mm 8mm 10mm' : '8mm 15mm 10mm 15mm'),
            fontSize: isThermal ? '10px' : (isA5 || isBoutiqueA5 ? '11px' : '13px'),
            backgroundColor: 'white',
            color: isThermal ? '#000000' : '#111827',
            margin: isMobile ? '0' : '0 auto',
            boxSizing: 'border-box',
            position: 'relative',
            display: isThermal ? 'block' : 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
            fontFamily: 'Arial, Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        };

        if (isMobile) {
            base.width = '100%';
            base.minWidth = 'unset';
            base.minHeight = 'auto';
            base.padding = '12px';
            base.fontSize = '11px';
        }

        if (isClassic && !isThermal) {
            base.border = '2px solid black';
        }

        return base;
    };

    // Shared Typography Scale (Compact & Clean for 1-page fit)
    const s_Title = "text-[18px] font-bold tracking-[0.5px] uppercase";
    const s_Company = "text-[15px] font-bold leading-tight mb-1 text-black";
    const s_AddressLabel = "text-[11.5px] text-slate-700 leading-[1.5] print:text-black";
    const s_SecHead = "text-[11.5px] font-bold uppercase tracking-wider mb-1.5";
    const s_Label = "text-[11.5px] font-semibold text-slate-700 print:text-black";
    const s_Value = "text-[12.5px] font-semibold text-slate-900 leading-[1.5] print:text-black";
    const s_TableTh = "px-2 text-[10.5px] font-bold uppercase tracking-wider";
    const s_TableTd = "py-1.5 px-2 text-[11.5px] font-medium border-b border-slate-200 print:border-slate-300";
    const s_TotalBox = "text-[13px] font-semibold";
    const s_GrandTotal = "text-[17px] font-bold";

    if (isThermal) {
        return (
            <div ref={ref} style={getContainerStyle()} className="thermal-invoice">
                <style>{`
                    @media print { 
                        @page { size: 80mm auto; margin: 0; } 
                        html, body { 
                            margin: 0 !important; 
                            padding: 0 !important; 
                            background: #ffffff !important;
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important;
                            color-adjust: exact !important;
                        } 
                        .thermal-invoice { 
                            width: 80mm !important; 
                            margin: 0 !important; 
                            padding: 4mm !important; 
                            background: #ffffff !important;
                            color: #000000 !important;
                            font-family: Arial, Helvetica, sans-serif !important;
                            text-rendering: geometricPrecision !important;
                            -webkit-font-smoothing: antialiased !important;
                            -moz-osx-font-smoothing: grayscale !important;
                        } 
                        .thermal-invoice * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            text-rendering: geometricPrecision !important;
                        }
                    }
                    .thermal-invoice {
                        font-family: Arial, Helvetica, sans-serif !important;
                        color: #000000;
                    }
                    .thermal-invoice img {
                        image-rendering: -webkit-optimize-contrast;
                        image-rendering: crisp-edges;
                    }
                `}</style>
                <div className="text-center border-b border-dashed border-black pb-2 mb-4">
                    {settings.showLogo !== false && (
                        companyProfile?.logoUrl ? (
                            <img src={companyProfile.logoUrl} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-1" />
                        ) : (
                            <div className="w-8 h-8 border border-black rounded flex items-center justify-center text-[8px] font-bold mx-auto mb-1 uppercase tracking-tighter">Logo</div>
                        )
                    )}
                    {settings.showCompanyName !== false && <h2 className="text-[14px] font-bold uppercase text-black">{companyProfile?.companyName || 'OUR STORE'}</h2>}
                    <p className="text-[10px] font-medium text-black">{companyProfile?.address}</p>
                    <p className="text-[10px] font-medium text-black">Ph: {companyProfile?.phone}</p>
                    <div className="border-t border-b border-black py-1 mt-1 font-bold text-black">{settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}</div>
                </div>
                <div className="text-[10px] mb-4 text-black">
                    <div className="flex justify-between font-medium"><span>{isQuotation ? 'Quote' : 'Inv'}: <strong className="font-bold">{quotationNumber || invoiceNumber || ''}</strong></span><span>{invoiceDate ? new Date(invoiceDate).toLocaleDateString() : ''}</span></div>
                    <div className="font-bold mt-1">Bill To: {customer?.name || customerName || 'Walk-in'}</div>
                </div>
                <table className="w-full text-[10px] border-b border-dashed border-black mb-4 text-black">
                    <thead><tr><th className="text-left font-bold py-1">Item</th><th className="text-right font-bold w-12 py-1">Qty</th><th className="text-right font-bold w-16 py-1">Amt</th></tr></thead>
                    <tbody>{items?.map((item, i) => (<tr key={i}><td className="py-1 font-medium">{item.product?.name || item.name || 'Item'}</td><td className="text-right py-1 font-semibold">{item.quantity || 0}</td><td className="text-right py-1 font-bold">{currentSymbol}{formatAmt(item.total)}</td></tr>))}</tbody>
                </table>
                <div className="space-y-1 text-[11px] font-medium flex flex-col items-end text-black">
                    <div className="flex justify-between w-full"><span>Subtotal:</span><span className="font-bold">{currentSymbol}{formatAmt(parseFloat(subTotal) + parseFloat(invoiceDiscount))}</span></div>
                    {invoiceDiscount > 0 && (
                        <div className="flex justify-between w-full text-black"><span>Discount:</span><span className="font-bold">- {currentSymbol}{formatAmt(invoiceDiscount)}</span></div>
                    )}
                    {parseFloat(taxAmount || 0) > 0 && (
                        <div className="flex justify-between w-full"><span>Tax:</span><span className="font-bold">{currentSymbol}{formatAmt(taxAmount)}</span></div>
                    )}
                    {(parseFloat(deliveryCharge || 0) > 0 || hasDeliveryCharge) && (
                        <div className="flex justify-between w-full"><span>Delivery Charge:</span><span className="font-bold">+{currentSymbol}{formatAmt(deliveryCharge)}</span></div>
                    )}
                    <div className="flex justify-between w-full text-[13px] border-t-2 border-black pt-1 mt-1 font-black"><span>TOTAL:</span><span>{currentSymbol}{formatAmt(totalAmount)}</span></div>
                    {paymentMethod && (
                        <div className="flex justify-between w-full text-[10.5px] pt-1"><span>Payment Method:</span><span className="font-bold">{paymentMethod}</span></div>
                    )}
                    {(() => {
                        const paid = printData.paidAmount !== undefined ? parseFloat(printData.paidAmount) : parseFloat(paidAmount || 0);
                        const bal = printData.balanceAmount !== undefined ? parseFloat(printData.balanceAmount) : Math.max(0, parseFloat(totalAmount || 0) - paid - parseFloat(advanceUsed || 0));
                        const paymentsList = printData.payments || [];
                        return (
                            <>
                                {paymentsList.length > 1 && (
                                    <div className="w-full text-[10px] text-black pl-2 border-l border-black my-0.5 space-y-0.5 font-medium">
                                        {paymentsList.map((p, idx) => (
                                            <div key={idx} className="flex justify-between">
                                                <span>{p.method}:</span>
                                                <span className="font-bold">{currentSymbol}{formatAmt(p.amount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex justify-between w-full text-[10.5px] text-black"><span>Amount Paid:</span><span className="font-bold">{currentSymbol}{formatAmt(paid)}</span></div>
                                {bal > 0.01 && (
                                    <div className="flex justify-between w-full text-[10.5px] text-black font-extrabold"><span>Balance Due:</span><span>{currentSymbol}{formatAmt(bal)}</span></div>
                                )}
                            </>
                        );
                    })()}
                </div>
                <div className="text-center mt-4 pt-2 border-t border-dashed border-black text-[9.5px] font-bold tracking-wider text-black"><p>{settings.footerText || settings.footerNote || 'THANK YOU!'}</p></div>
            </div>
        );
    }

    if (isBoutiqueA5) {
        const rawItems = items || [];
        const tableRowsCount = Math.max(rawItems.length <= 4 ? 6 : rawItems.length, rawItems.length);
        const displayRows = Array.from({ length: tableRowsCount }, (_, i) => rawItems[i] || null);
        const currCodeStr = (currencyCode || companyProfile?.currencyCode || 'AED').toUpperCase();

        let dateStr = '___ / ___ / 2026';
        if (invoiceDate) {
            const d = new Date(invoiceDate);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                dateStr = `${day} / ${month} / ${year}`;
            }
        }

        const totalDiscountAmt = parseFloat(invoiceDiscount || 0);
        const subTotalAmt = parseFloat(subTotal || 0) + totalDiscountAmt;
        const grandTotalAmt = parseFloat(totalAmount || 0);
        const paidAmt = printData.paidAmount !== undefined ? parseFloat(printData.paidAmount) : parseFloat(paidAmount || 0);
        const balanceAmt = printData.balanceAmount !== undefined ? parseFloat(printData.balanceAmount) : Math.max(0, grandTotalAmt - paidAmt - parseFloat(advanceUsed || 0));
        const paymentsList = printData.payments || [];

        return (
            <div ref={ref} style={getContainerStyle()} className="boutique-a5-invoice bg-white text-black text-[11px] leading-snug">
                <style>{`
                    @media print {
                        @page {
                            size: 148mm 210mm;
                            margin: 0;
                        }
                        html, body { 
                            margin: 0 !important; 
                            padding: 0 !important; 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important;
                            color-adjust: exact !important;
                            background: #fff !important; 
                        }
                        .boutique-a5-invoice {
                            width: 148mm !important;
                            height: auto !important;
                            min-height: auto !important;
                            max-height: 208mm !important;
                            box-shadow: none !important;
                            margin: 0 !important;
                            border: none !important;
                            padding: 6mm 10mm !important;
                            page-break-inside: avoid !important;
                            break-inside: avoid !important;
                            page-break-after: avoid !important;
                            break-after: avoid !important;
                            box-sizing: border-box !important;
                            color: #000000 !important;
                            font-family: Arial, Helvetica, sans-serif !important;
                            text-rendering: geometricPrecision !important;
                            -webkit-font-smoothing: antialiased !important;
                            -moz-osx-font-smoothing: grayscale !important;
                        }
                        .boutique-a5-invoice * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            text-rendering: geometricPrecision !important;
                        }
                        .boutique-a5-invoice thead tr {
                            background-color: #000000 !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .boutique-a5-invoice thead th {
                            color: #ffffff !important;
                        }
                        .boutique-a5-invoice table, .boutique-a5-invoice th, .boutique-a5-invoice td {
                            border: 1px solid #000000 !important;
                        }
                        .boutique-a5-invoice tr.bg-gray-200,
                        .boutique-a5-invoice td.bg-gray-200 {
                            background-color: #e5e7eb !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                    }
                    .boutique-a5-invoice {
                        font-family: Arial, Helvetica, sans-serif !important;
                        color: #000000;
                    }
                    .boutique-a5-invoice img {
                        image-rendering: -webkit-optimize-contrast;
                        image-rendering: crisp-edges;
                    }
                    .boutique-a5-invoice table, .boutique-a5-invoice th, .boutique-a5-invoice td {
                        border: 1px solid #000000;
                    }
                `}</style>

                {/* LOGO (IF ENABLED & AVAILABLE) */}
                {settings.showLogo !== false && companyProfile?.logoUrl && (
                    <div className="text-center mb-1">
                        <img src={companyProfile.logoUrl} alt="Logo" className="max-h-10 mx-auto object-contain mb-1" />
                    </div>
                )}

                {/* BOUTIQUE NAME HEADER */}
                {settings.showCompanyName !== false && (
                    <div className="text-center mb-1.5">
                        <h1 className="text-[20px] font-extrabold uppercase tracking-wide text-black mb-0.5">
                            {companyProfile?.companyName || 'BOUTIQUE NAME'}
                        </h1>
                    </div>
                )}

                {/* SUB HEADER: CATEGORY & ADDRESS / CONTACT */}
                {settings.showAddress !== false && (
                    <div className="text-left text-[11px] mb-2 space-y-0.5">
                        <p className="font-bold text-black uppercase tracking-wider">
                            {companyProfile?.tagline || companyProfile?.businessType || 'FASHION • BOUTIQUE'}
                        </p>
                        <p className="text-black font-normal">
                            {companyProfile?.address || companyProfile?.city ? `${companyProfile.address || ''}${companyProfile.city ? `, ${companyProfile.city}` : ''}` : 'Dubai / Sharjah, UAE'} | Tel: <span className="font-semibold text-black">{companyProfile?.phone || '___________'}</span> | WhatsApp: <span className="font-semibold text-black">{companyProfile?.whatsapp || companyProfile?.phone || '___________'}</span>
                        </p>
                    </div>
                )}

                {/* INVOICE & CUSTOMER INFO BLOCK */}
                {(settings.showInvoiceMeta !== false || settings.showCustomer !== false) && (
                    <div className="mb-2">
                        {settings.showInvoiceMeta !== false && (
                            <h2 className="text-[16px] font-bold uppercase tracking-wider mb-1 text-black">
                                {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'INVOICE')}
                            </h2>
                        )}
                        <div className="space-y-0.5 text-[11px] text-black">
                            {settings.showInvoiceMeta !== false && (
                                <div className="flex justify-between items-center pr-2">
                                    <div>
                                        <span className="font-bold text-black">{isQuotation ? 'Quotation No.:' : 'Invoice No.:'}</span> <span className="font-semibold text-black">{quotationNumber || invoiceNumber || 'INV-0001'}</span>
                                    </div>
                                    <div>
                                        <span className="font-bold text-black">Date:</span> <span className="font-semibold text-black">{dateStr}</span>
                                    </div>
                                </div>
                            )}
                            {settings.showCustomer !== false && (
                                <div className="flex justify-between items-center pr-2">
                                    <div>
                                        <span className="font-bold text-black">Customer Name:</span> <span className="font-semibold text-black">{customer?.name || customerName || '_______________'}</span>
                                    </div>
                                    <div>
                                        <span className="font-bold text-black">Mobile:</span> <span className="font-semibold text-black">{customer?.phone || '___________________'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ITEM TABLE */}
                <table className="w-full border-collapse my-1.5 text-[11px]">
                    <thead>
                        <tr className="bg-black text-white text-[10.5px] font-bold">
                            <th className="py-1 px-1 text-center w-8 border-r border-gray-700 print:border-black">No.</th>
                            <th className="py-1 px-2 text-center border-r border-gray-700 print:border-black">Item Description</th>
                            {settings.showColHsn === true && <th className="py-1 px-1 text-center w-14 border-r border-gray-700 print:border-black">HSN</th>}
                            {settings.showColQty !== false && <th className="py-1 px-1 text-center w-10 border-r border-gray-700 print:border-black">Qty</th>}
                            <th className="py-1 px-1 text-center w-12 border-r border-gray-700 print:border-black">Size</th>
                            {settings.showColPrice !== false && <th className="py-1 px-1.5 text-center w-28 border-r border-gray-700 print:border-black">Unit Price ({currCodeStr})</th>}
                            {settings.showColTotal !== false && <th className="py-1 px-1.5 text-center w-28">Amount ({currCodeStr})</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((item, idx) => (
                            <tr key={idx} className="h-5">
                                <td className="py-0.5 px-1 text-center font-semibold text-black">{idx + 1}</td>
                                <td className="py-0.5 px-2 text-left font-medium text-black">
                                    {item ? (item.product?.name || item.name || '') : ''}
                                </td>
                                {settings.showColHsn === true && <td className="py-0.5 px-1 text-center font-medium text-black">{item ? (item.product?.hsnCode || item.hsnCode || '-') : ''}</td>}
                                {settings.showColQty !== false && <td className="py-0.5 px-1 text-center font-bold text-black">{item ? (item.quantity || '') : ''}</td>}
                                <td className="py-0.5 px-1 text-center font-medium text-black">{item ? (item.size || '-') : ''}</td>
                                {settings.showColPrice !== false && <td className="py-0.5 px-1.5 text-right font-semibold text-black">{item ? formatAmt(item.unitPrice) : ''}</td>}
                                {settings.showColTotal !== false && <td className="py-0.5 px-1.5 text-right font-bold text-black">{item ? formatAmt(item.total) : ''}</td>}
                            </tr>
                        ))}

                        {/* SUBTOTAL ROW */}
                        {(() => {
                            const leadCols = 2 + (settings.showColHsn === true ? 1 : 0) + (settings.showColQty !== false ? 1 : 0) + 1;
                            return (
                                <>
                                    <tr className="h-5.5">
                                        <td colSpan={leadCols} className="border-r border-black"></td>
                                        {settings.showColPrice !== false && <td className="py-0.5 px-3 text-right font-bold text-black border-r border-black">Subtotal</td>}
                                        {settings.showColTotal !== false && <td className="py-0.5 px-1.5 text-right font-bold text-black">{formatAmt(subTotalAmt)}</td>}
                                    </tr>

                                    {/* DISCOUNT ROW */}
                                    <tr className="h-5.5">
                                        <td colSpan={leadCols} className="border-r border-black"></td>
                                        {settings.showColPrice !== false && <td className="py-0.5 px-3 text-right font-bold text-black border-r border-black">Discount</td>}
                                        {settings.showColTotal !== false && <td className="py-0.5 px-1.5 text-right font-bold text-black">{totalDiscountAmt > 0 ? formatAmt(totalDiscountAmt) : ''}</td>}
                                    </tr>

                                    {/* DELIVERY CHARGE ROW */}
                                    {(parseFloat(deliveryCharge || 0) > 0 || hasDeliveryCharge) && (
                                        <tr className="h-5.5">
                                            <td colSpan={leadCols} className="border-r border-black"></td>
                                            {settings.showColPrice !== false && <td className="py-0.5 px-3 text-right font-bold text-black border-r border-black">Delivery Charge</td>}
                                            {settings.showColTotal !== false && <td className="py-0.5 px-1.5 text-right font-bold text-black">+{formatAmt(deliveryCharge)}</td>}
                                        </tr>
                                    )}

                                    {/* GRAND TOTAL ROW */}
                                    <tr className="h-6 bg-gray-200">
                                        <td colSpan={leadCols} className="border-r border-black bg-white"></td>
                                        {settings.showColPrice !== false && <td className="py-0.5 px-3 text-right font-black text-black uppercase border-r border-black">GRAND TOTAL</td>}
                                        {settings.showColTotal !== false && <td className="py-0.5 px-1.5 text-right font-black text-black bg-gray-200">{formatAmt(grandTotalAmt)}</td>}
                                    </tr>
                                </>
                            );
                        })()}
                    </tbody>
                </table>

                {/* PAYMENT & AMOUNT PAID / BALANCE */}
                <div className="mt-1.5 mb-2 space-y-0.5 text-[11px] text-black">
                    <p>
                        <span className="font-bold">Payment Method:</span> <span className="font-semibold text-black">{paymentMethod || 'Cash'}</span>
                    </p>
                    {paymentsList.length > 1 && (
                        <div className="text-[10px] text-black pl-2 border-l-2 border-black space-y-0.5 my-0.5 font-medium">
                            {paymentsList.map((p, idx) => (
                                <div key={idx} className="flex justify-between max-w-[200px]">
                                    <span>{p.method}:</span>
                                    <span className="font-semibold text-black">{currCodeStr} {formatAmt(p.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="flex justify-between pr-4">
                        <span>
                            <span className="font-bold">Amount Paid:</span> {currCodeStr} <span className="font-bold text-black">{formatAmt(paidAmt)}</span>
                        </span>
                        <span>
                            <span className="font-bold">Balance:</span> {currCodeStr} <span className="font-bold text-black">{formatAmt(balanceAmt)}</span>
                        </span>
                    </p>
                </div>

                {/* RETURN / EXCHANGE POLICY */}
                <div className="mt-2 mb-2 text-[10px]">
                    <h3 className="font-bold text-black uppercase tracking-wider mb-0.5">
                        RETURN / EXCHANGE POLICY
                    </h3>
                    <p className="text-black font-medium leading-tight">
                        {terms || settings.termsConditions || 'Returns/exchanges are subject to boutique policy. Original invoice is required. Sale/discounted items may be non-refundable/non-exchangeable.'}
                    </p>
                </div>

                {/* FOOTER THANK YOU */}
                <div className="mt-3 text-left italic font-bold text-[12px] text-black">
                    <p>{settings.footerText || settings.footerNote || 'Thank you for shopping with us!'}</p>
                </div>
            </div>
        );
    }

    return (
        <div ref={ref} style={getContainerStyle()} className={`professional-invoice leading-normal`}>
            <style>{`
                @media print {
                    @page { 
                        size: ${pageSize === 'A4' ? '210mm 297mm' : '148mm 210mm'}; 
                        margin: 0; 
                    }
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        color-adjust: exact !important;
                        background: #fff !important; 
                    }
                    .professional-invoice {
                        width: ${isA4 ? '210mm' : '148mm'} !important;
                        height: auto !important;
                        min-height: auto !important;
                        max-height: ${isA4 ? '296mm' : '208mm'} !important;
                        box-shadow: none !important; 
                        margin: 0 !important;
                        border: ${isClassic ? '2px solid black' : 'none'} !important;
                        padding: ${isA5 || isBoutiqueA5 ? '6mm 10mm 8mm 10mm' : isA4 ? '8mm 15mm 10mm 15mm' : '4mm'} !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                        box-sizing: border-box !important;
                        color: #000000 !important;
                        font-family: Arial, Helvetica, sans-serif !important;
                        text-rendering: geometricPrecision !important;
                        -webkit-font-smoothing: antialiased !important;
                        -moz-osx-font-smoothing: grayscale !important;
                    }
                    .professional-invoice * {
                        text-rendering: geometricPrecision !important;
                    }
                    .professional-invoice p,
                    .professional-invoice span,
                    .professional-invoice td,
                    .professional-invoice th,
                    .professional-invoice div {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
                .professional-invoice { 
                    font-family: Arial, Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; 
                    color: #111827;
                }
                .professional-invoice img {
                    image-rendering: -webkit-optimize-contrast;
                    image-rendering: crisp-edges;
                }
            `}</style>

            {/* HEADER AREA */}
            <div className={`flex flex-wrap ${isMobile ? 'flex-col items-center text-center' : 'justify-between items-start'} gap-4 mb-3`}>
                <div className="flex-1">
                    {settings.showLogo !== false && (
                        companyProfile?.logoUrl ? (
                            <img src={companyProfile.logoUrl} alt="Logo" style={{ maxWidth: isMobile ? '120px' : (isA5 || isBoutiqueA5 ? '120px' : '160px'), maxHeight: isMobile ? '45px' : (isA5 || isBoutiqueA5 ? '45px' : '55px'), objectFit: 'contain' }} />
                        ) : (
                            <div style={{ width: isMobile ? '100px' : '110px', height: isMobile ? '40px' : '44px' }} className="bg-white rounded-xl flex items-center justify-center font-bold text-slate-400 border border-slate-200 shadow-sm uppercase text-[9px] tracking-widest">Logo</div>
                        )
                    )}
                </div>
                <div className={`${isMobile ? 'text-center' : 'text-right'} flex-1`}>
                    <h1 className={`${s_Title} mb-1`} style={{ color: (isBold || isModern) ? accent : '#111827' }}>
                        {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                    </h1>
                    {settings.showCompanyName !== false && (
                        <p className={s_Company}>{companyProfile?.companyName || 'Your Company Name'}</p>
                    )}
                    {settings.showAddress !== false && (
                        <div className={s_AddressLabel}>
                            <p>{companyProfile?.address || ''}</p>
                            <p>{companyProfile?.phone ? `+91 ${companyProfile.phone}` : ''}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* BILL TO & INVOICE DETAILS */}
            <div className={`flex flex-wrap ${isMobile ? 'flex-col' : ''} gap-x-8 gap-y-3 mb-4 ${isMinimal ? '' : 'border-t border-slate-200 pt-3'}`}>
                {settings.showCustomer !== false && (
                    <div className={`flex-1 ${isMinimal || isMobile ? '' : 'border-r border-slate-200 pr-6'}`}>
                        <p className={`${s_SecHead}`} style={(isBold || isModern) ? { color: accent } : { color: '#334155' }}>Bill To</p>
                        <div className="space-y-0.5">
                            <p className={s_Value}>{customer?.name || customerName || 'Walk-in'}</p>
                            {customer?.phone && <p className={s_AddressLabel}>📞 {customer.phone}</p>}
                            {customer?.address && <p className={s_AddressLabel}>{customer.address}{customer.city ? `, ${customer.city}` : ''}{customer.state ? `, ${customer.state}` : ''}{customer.pincode ? ` - ${customer.pincode}` : ''}</p>}
                            {customer?.gstin && <p className={`${s_Label} font-bold text-black`}>GSTIN: {customer.gstin}</p>}
                            {customer?.email && <p className={s_AddressLabel}>{customer.email}</p>}
                        </div>
                    </div>
                )}
                {settings.showInvoiceMeta !== false && (
                    <div className={`flex-1 ${isMobile ? 'pl-0' : 'pl-4'}`}>
                        <p className={`${s_SecHead}`} style={(isBold || isModern) ? { color: accent } : { color: '#334155' }}>Invoice Details</p>
                        <div className="space-y-1.5">
                            <div className={`flex items-center gap-6 ${isMobile ? 'justify-between' : ''}`}>
                                <span className={`${s_Label} whitespace-nowrap`}>{isQuotation ? 'Quotation No:' : 'Invoice No:'}</span>
                                <span className={`${s_Value} text-right`}>{quotationNumber || invoiceNumber || ''}</span>
                            </div>
                            <div className={`flex items-center gap-6 ${isMobile ? 'justify-between' : ''}`}>
                                <span className={`${s_Label} whitespace-nowrap`}>Date:</span>
                                <span className={`${s_Value} text-right`} style={{ letterSpacing: '0.2px' }}>{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ITEMS TABLE */}
            <div className={`mb-3 ${isMobile ? 'overflow-x-auto lg:no-scrollbar' : ''}`}>
                <table className={`w-full ${isMobile ? 'min-w-[600px]' : ''} ${(isBold || isModern) ? 'border-separate border-spacing-0' : 'border-collapse'}`}>
                    <thead>
                        <tr className={(isBold || isModern) ? 'text-white' : 'text-slate-900'} style={(isBold || isModern) ? { backgroundColor: accent, height: (isBold || isModern) ? '32px' : 'auto' } : { backgroundColor: isMinimal ? 'white' : '#f1f5f9' }}>
                            <th className={`${s_TableTh} text-left ${isMinimal ? 'border-b border-slate-200' : isBold ? 'rounded-l-lg' : 'rounded-l-lg'}`}>{isBold ? 'DESCRIPTION' : 'Description'}</th>
                            {settings.showColHsn !== false && <th className={`${s_TableTh} text-center w-20 ${isMinimal ? 'border-b border-slate-200' : ''}`}>{isBold ? 'HSN/SAC' : 'HSN/SAC'}</th>}
                            {settings.showColQty !== false && <th className={`${s_TableTh} text-center w-14 ${isMinimal ? 'border-b border-slate-200' : ''}`}>{isBold ? 'QTY' : 'Qty'}</th>}
                            {settings.showColPrice !== false && <th className={`${s_TableTh} text-center w-24 ${isMinimal ? 'border-b border-slate-200' : ''}`}>{isBold ? 'PRICE' : 'Price'}</th>}
                            {settings.showColTax !== false && parseFloat(taxAmount || 0) > 0 && <th className={`${s_TableTh} text-center w-16 ${isMinimal ? 'border-b border-slate-200' : ''}`}>{isBold ? 'GST%' : 'Gst %'}</th>}
                            {parseFloat(invoiceDiscount || 0) > 0 && <th className={`${s_TableTh} text-center w-16 ${isMinimal ? 'border-b border-slate-200' : ''}`}>{isBold ? 'DISC' : 'Disc'}</th>}
                            {settings.showColTotal !== false && <th className={`${s_TableTh} text-right w-28 ${isMinimal ? 'border-b border-slate-200' : isBold ? 'rounded-r-lg' : 'rounded-r-lg'}`}>{isBold ? 'TOTAL' : 'Total'}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {items?.map((item, idx) => (
                            <tr key={idx} className="border-b border-transparent">
                                <td className={`${s_TableTd} text-left font-semibold text-slate-900 print:text-black`}>
                                    <div>{item.product?.name || item.name || 'Item'}</div>
                                    {item.size && (
                                        <span className="inline-block mt-0.5 text-[10.5px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded print:text-black">
                                            Size: {item.size}
                                        </span>
                                    )}
                                </td>
                                {settings.showColHsn !== false && <td className={`${s_TableTd} text-center font-medium text-slate-700 print:text-black`}>{item.product?.hsnCode || '-'}</td>}
                                {settings.showColQty !== false && <td className={`${s_TableTd} text-center font-bold text-slate-900 print:text-black`}>{item.quantity || 0}</td>}
                                {settings.showColPrice !== false && <td className={`${s_TableTd} text-center text-slate-900 font-semibold print:text-black`}>{currentSymbol}{formatAmt(item.unitPrice)}</td>}
                                {settings.showColTax !== false && parseFloat(taxAmount || 0) > 0 && <td className={`${s_TableTd} text-center text-slate-700 font-semibold print:text-black`}>{parseFloat(item.taxRate || 0)}%</td>}
                                {parseFloat(invoiceDiscount || 0) > 0 && <td className={`${s_TableTd} text-center text-slate-700 font-semibold print:text-black`}>{parseFloat(item.discountAmount || 0) > 0 ? `${currentSymbol}${formatAmt(item.discountAmount)}` : '-'}</td>}
                                {settings.showColTotal !== false && <td className={`${s_TableTd} text-right font-bold text-slate-950 print:text-black`}>{currentSymbol}{formatAmt((parseFloat(item.unitPrice) - parseFloat(item.discountAmount || 0)) * (parseFloat(item.quantity) || 0))}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* DESCRIPTION / NOTES */}
            {(description || notes) && (
                <div className="mb-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-0.5">Description / Notes:</p>
                    <p className="text-[11.5px] text-slate-800 leading-relaxed italic">{description || notes}</p>
                </div>
            )}

            {/* TAX & TOTALS */}
            <div className={`flex ${isMobile ? 'flex-col gap-4' : 'justify-between items-start gap-4'} mb-4 w-full`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className={isMobile ? 'w-full' : 'w-fit'}>
                    {settings.showTaxSummary !== false && parseFloat(taxAmount || 0) > 0 && Object.entries(taxBreakdown).filter(([rate]) => parseFloat(rate) > 0).length > 0 && (
                        <div className={`bg-[#f8fafc] p-3 rounded-xl border border-slate-200 shadow-sm min-w-[200px]`}>
                            <p className={`${s_SecHead} mb-2 font-bold text-[10px] tracking-[1.2px]`} style={{ color: '#009262' }}>TAX SUMMARY</p>
                            <div className={`space-y-1 text-[11px]`}>
                                {Object.entries(taxBreakdown)
                                    .filter(([rate]) => parseFloat(rate) > 0)
                                    .map(([rate, data]) => (
                                        <React.Fragment key={rate}>
                                            <div className="flex justify-between items-center text-slate-700 font-medium">
                                                <span>CGST ({parseFloat(rate) / 2}%)</span>
                                                <span className="font-bold text-slate-900 print:text-black">{currentSymbol}{formatAmt(data.taxAmount / 2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-slate-700 font-medium">
                                                <span>SGST ({parseFloat(rate) / 2}%)</span>
                                                <span className="font-bold text-slate-900 print:text-black">{currentSymbol}{formatAmt(data.taxAmount / 2)}</span>
                                            </div>
                                        </React.Fragment>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className={`${isMobile ? 'w-full' : 'w-[250px] ml-auto'} p-3 rounded-xl bg-[#f8fafc] border border-slate-200 shadow-sm ${isBold ? 'border-l-[4px]' : isModern ? 'border-t-4' : isClassic ? 'border-2 border-black' : ''}`} style={isBold ? { borderLeftColor: accent } : isModern ? { borderTopColor: accent } : {}}>
                    <div className="space-y-1.5 mb-1.5">
                        {/* 1. Sub Total (Base amount before discount) */}
                        <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                            <span className="whitespace-nowrap mr-2">Sub Total</span>
                            <span className="font-bold text-slate-900 whitespace-nowrap print:text-black">{currentSymbol}{formatAmt(parseFloat(subTotal) + parseFloat(invoiceDiscount))}</span>
                        </div>

                        {/* 2. Discount */}
                        {parseFloat(invoiceDiscount) > 0 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                                <span className="whitespace-nowrap mr-2">Discount</span>
                                <span className="font-bold text-red-600 whitespace-nowrap print:text-black">- {currentSymbol}{formatAmt(invoiceDiscount)}</span>
                            </div>
                        )}

                        {/* 3. Tax */}
                        {parseFloat(taxAmount || 0) > 0 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                                <span className="whitespace-nowrap mr-2">Tax</span>
                                <span className="font-bold text-slate-900 whitespace-nowrap print:text-black">{currentSymbol}{formatAmt(taxAmount)}</span>
                            </div>
                        )}

                        {/* Delivery Charge */}
                        {(parseFloat(deliveryCharge || 0) > 0 || hasDeliveryCharge) && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                                <span className="whitespace-nowrap mr-2">Delivery Charge</span>
                                <span className="font-bold text-slate-900 whitespace-nowrap print:text-black">+{currentSymbol}{formatAmt(deliveryCharge)}</span>
                            </div>
                        )}

                        {/* 4. Round Off */}
                        {parseFloat(roundOffAmount || 0) !== 0 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                                <span className="whitespace-nowrap mr-2">Round Off</span>
                                <span className="font-bold text-slate-900 whitespace-nowrap print:text-black">{parseFloat(roundOffAmount) > 0 ? '+' : ''}{currentSymbol}{formatAmt(roundOffAmount)}</span>
                            </div>
                        )}

                        {/* 5. Advance Amount */}
                        {(parseFloat(advanceUsed) || 0) > 0 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                                <span className="whitespace-nowrap mr-2">Advance Amount</span>
                                <span className="font-bold text-emerald-700 whitespace-nowrap print:text-black">- {currentSymbol}{formatAmt(advanceUsed)}</span>
                            </div>
                        )}

                        {/* Payment Method (if provided) */}
                        {paymentMethod && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                                <span className="whitespace-nowrap mr-2">Payment Method</span>
                                <span className="font-bold text-slate-900 whitespace-nowrap print:text-black">{paymentMethod}</span>
                            </div>
                        )}

                        {/* Split Payment Breakdown */}
                        {(() => {
                            const paymentsList = printData.payments || [];
                            if (paymentsList.length <= 1) return null;
                            return (
                                <div className="pl-2 border-l-2 border-slate-300 my-1 space-y-0.5">
                                    {paymentsList.map((p, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-slate-700 text-[10px]">
                                            <span>{p.method}:</span>
                                            <span className="font-bold text-slate-900 print:text-black">{currentSymbol}{formatAmt(p.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Amount Paid */}
                        <div className="flex justify-between items-center text-slate-700 text-[11px] font-semibold tracking-tight">
                            <span className="whitespace-nowrap mr-2">Amount Paid</span>
                            <span className="font-bold text-emerald-700 whitespace-nowrap print:text-black">{currentSymbol}{formatAmt(printData.paidAmount !== undefined ? parseFloat(printData.paidAmount) : parseFloat(paidAmount || 0))}</span>
                        </div>
                    </div>

                    {/* 6. Grand Total */}
                    <div className={`pt-2 border-t-2 border-slate-300 flex justify-between items-center mt-2`}>
                        <span className="font-bold uppercase tracking-[0.5px] text-[11.5px] text-[#009262] print:text-black">
                            GRAND TOTAL
                        </span>
                        <span className="font-black text-[18px] tracking-tighter text-[#009262] print:text-black">
                            {currentSymbol}{formatAmt(totalAmount)}
                        </span>
                    </div>

                    {/* 7. Balance Due */}
                    {(() => {
                        const paid = printData.paidAmount !== undefined ? parseFloat(printData.paidAmount) : parseFloat(paidAmount || 0);
                        const balance = printData.balanceAmount !== undefined ? parseFloat(printData.balanceAmount) : Math.max(0, parseFloat(totalAmount || 0) - paid - parseFloat(advanceUsed || 0));
                        if (balance > 0.01) {
                            return (
                                <div className={`pt-1.5 mt-1.5 border-t border-dashed border-slate-300 flex justify-between items-center`}>
                                    <span className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wide print:text-black">BALANCE / OUTSTANDING</span>
                                    <span className="text-[15px] font-black text-red-600 tracking-tight print:text-black">
                                        {currentSymbol}{formatAmt(balance)}
                                    </span>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            </div>

            {/* BANK DETAILS (Separate Section) */}
            {settings.showBankDetails !== false && companyBank && (companyBank.name || companyBank.accountNumber) && (
                <div className={`mb-3 p-3 bg-[#f8fafc] border border-slate-200 rounded-lg max-w-sm ${isBold || isModern ? 'border-t-[3px]' : ''}`} style={{ ...(isBold || isModern ? { borderTopColor: accent } : {}), pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <p className={`${s_SecHead} mb-2 font-bold tracking-wide`} style={(isBold || isModern) ? { color: accent } : { color: '#334155' }}>BANK DETAILS</p>
                    <div className="space-y-1.5 text-[10.5px]">
                        {companyBank.name && (
                            <div className="flex">
                                <span className="w-24 font-semibold text-slate-700 print:text-black">Bank Name</span>
                                <span className="w-3 text-slate-600 print:text-black">:</span>
                                <span className="font-bold text-slate-900 flex-1 print:text-black">{companyBank.name}</span>
                            </div>
                        )}
                        {companyBankHolder && (
                            <div className="flex">
                                <span className="w-24 font-semibold text-slate-700 print:text-black">Account Holder</span>
                                <span className="w-3 text-slate-600 print:text-black">:</span>
                                <span className="font-bold text-slate-900 flex-1 print:text-black">{companyBankHolder}</span>
                            </div>
                        )}
                        {companyBank.accountNumber && (
                            <div className="flex">
                                <span className="w-24 font-semibold text-slate-700 print:text-black">Account Number</span>
                                <span className="w-3 text-slate-600 print:text-black">:</span>
                                <span className="font-bold text-slate-900 flex-1 print:text-black">{companyBank.accountNumber}</span>
                            </div>
                        )}
                        {companyBank.ifscCode && (
                            <div className="flex">
                                <span className="w-24 font-semibold text-slate-700 print:text-black">IFSC Code</span>
                                <span className="w-3 text-slate-600 print:text-black">:</span>
                                <span className="font-bold text-slate-900 flex-1 print:text-black">{companyBank.ifscCode}</span>
                            </div>
                        )}
                        {companyBank.branchName && (
                            <div className="flex">
                                <span className="w-24 font-semibold text-slate-700 print:text-black">Branch</span>
                                <span className="w-3 text-slate-600 print:text-black">:</span>
                                <span className="font-bold text-slate-900 flex-1 print:text-black">{companyBank.branchName}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* FOOTER */}
            <div className={`mt-auto pt-3 border-t border-slate-200 flex flex-wrap ${isMobile ? 'flex-col items-start' : 'justify-between items-end'} gap-4`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className="flex-1">
                    <p className={`${s_SecHead} mb-1`} style={isBold ? { color: accent } : { color: '#334155' }}>Terms</p>
                    <p className="text-[11px] text-slate-700 leading-relaxed max-w-[380px] font-medium print:text-black">{terms || settings.termsConditions || 'Goods once sold will not be taken back.'}</p>
                </div>
                <div className={`${isMobile ? 'text-left' : 'text-right'} text-slate-800 font-bold italic text-[13px] print:text-black`}>
                    {settings.footerText || settings.footerNote || 'Thank you for your business!'}
                </div>
            </div>
        </div>
    );
});

ProfessionalInvoice.displayName = 'ProfessionalInvoice';
export default ProfessionalInvoice;
