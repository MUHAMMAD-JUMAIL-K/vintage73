
import React, { useMemo } from 'react';
import { getCurrencySymbol as getAppCurrencySymbol, normalizeCurrencySymbol } from '@/lib/currency';
import { normalizeTemplateId } from '@/lib/invoiceTemplates';

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
        deliveryCharge, hasDeliveryCharge,
        voucherCode, voucherDiscount, issuedRewardVoucher, issuedVoucher
    } = printData;

    const isQuotation = !!quotationNumber;

    // Bank details come from Company Profile → default selected bank
    const companyBank = companyProfile?.bank || null;
    const companyBankHolder = companyProfile?.companyName || '';

    // Use createdAt (server timestamp, always accurate) as primary;
    // fallback to saleDate if createdAt is missing
    const invoiceDate = quotationDate || createdAt || saleDate || null;

    const activeCurrencyCode = currencyCode || companyProfile?.currencyCode || 'INR';
    const rawSym = (currencyCode && currencyCode !== 'INR' && currencySymbol === '₹')
        ? getAppCurrencySymbol(activeCurrencyCode)
        : (currencySymbol || getAppCurrencySymbol(activeCurrencyCode) || companyProfile?.currencySymbol || '₹');
    const currentSymbol = normalizeCurrencySymbol(rawSym, activeCurrencyCode);
    const settings = printData.settings || {};
    const tpl = (settings.template || 'modern').toLowerCase();
    const pageSize = settings.pageSize || 'A5';
    const accent = settings.accentColor || '#10b981';

    const isThermal = pageSize === 'Thermal';
    const isA5 = pageSize === 'A5';
    const isA4 = pageSize === 'A4';
    const isMobile = previewMode === 'Mobile';

    const activeTemplate = normalizeTemplateId(tpl);
    const isModern = activeTemplate === 'modern';
    const isMinimal = activeTemplate === 'minimal';
    const isClassic = activeTemplate === 'classic';
    const isBold = activeTemplate === 'bold';
    const isBoutiqueA5 = activeTemplate === 'boutique_a5';
    const exRate = parseFloat(exchangeRate) || 1;
    const formatAmt = (amt) => (parseFloat(amt || 0) * exRate).toFixed(2);

    // Use stored discount from DB — single source of truth, do NOT recalculate
    const invoiceDiscount = parseFloat(printData.discount || 0);
    const vDiscount = parseFloat(voucherDiscount || printData.voucherDiscount || 0);
    const vCode = voucherCode || printData.voucherCode || null;
    const itemDiscountAmt = Math.max(0, invoiceDiscount - vDiscount);
    const rewardVoucher = issuedRewardVoucher || issuedVoucher || printData.issuedRewardVoucher || printData.issuedVoucher || null;

    // Helper to extract line item pricing consistently across all templates
    const getItemValues = (item) => {
        if (!item) return { mrp: 0, origPrice: 0, posPrice: 0, afterProdPrice: 0, vAlloc: 0, lineTotal: 0, taxRate: 0, qty: 0 };
        const posPrice = parseFloat(item.unitPrice || item.price || 0);
        const discAmt = parseFloat(item.discountAmount || 0);
        const afterProdPrice = Math.max(0, posPrice - discAmt);
        const origPrice = (item.originalUnitPrice !== undefined && item.originalUnitPrice !== null)
            ? parseFloat(item.originalUnitPrice)
            : (item.product?.price !== undefined && item.product?.price !== null
                ? parseFloat(item.product.price)
                : posPrice);
        const mrp = (item.mrp !== undefined && item.mrp !== null)
            ? parseFloat(item.mrp)
            : origPrice;
        const vAlloc = parseFloat(item.voucherDiscountAmount || 0);
        const qty = parseFloat(item.quantity) || 1;
        const taxRate = parseFloat(item.taxRate || item.taxPercent || item.product?.taxRate || 0);
        const lineTax = parseFloat(item.taxAmount || 0);
        const lineTotal = item.total !== undefined
            ? parseFloat(item.total)
            : Math.max(0, (qty * afterProdPrice) - vAlloc + lineTax);
        return { mrp, origPrice, posPrice, afterProdPrice, vAlloc, lineTotal, taxRate, qty };
    };

    const { totalMrpSum, totalAfterProductDiscount, totalLineTotalSum } = useMemo(() => {
        let mrpSum = 0;
        let afterProdSum = 0;
        let lineSum = 0;
        (items || []).forEach(item => {
            const vals = getItemValues(item);
            mrpSum += vals.mrp * vals.qty;
            afterProdSum += vals.afterProdPrice * vals.qty;
            lineSum += vals.lineTotal;
        });
        return { totalMrpSum: mrpSum, totalAfterProductDiscount: afterProdSum, totalLineTotalSum: lineSum };
    }, [items]);

    const grandTotalAmt = parseFloat(totalAmount || 0);
    const taxableSubtotal = parseFloat(subTotal || 0);
    const gstTaxAmt = parseFloat(taxAmount || 0);
    const deliveryAmt = parseFloat(deliveryCharge || 0);
    const isDeliveryActive = deliveryAmt > 0 || (hasDeliveryCharge === true || hasDeliveryCharge === 'true');
    const roundOffAmt = parseFloat(roundOffAmount || 0);
    const advanceAmt = parseFloat(advanceUsed || 0);
    const paidAmt = printData.paidAmount !== undefined ? parseFloat(printData.paidAmount) : parseFloat(paidAmount || 0);
    const balanceAmt = printData.balanceAmount !== undefined ? parseFloat(printData.balanceAmount) : Math.max(0, grandTotalAmt - paidAmt - advanceAmt);
    const paymentsList = printData.payments || [];

    // Authoritative single discount calculation:
    const productLevelDiscount = Math.max(0, totalMrpSum - totalAfterProductDiscount);
    const effectiveTotalDiscount = Math.max(invoiceDiscount, productLevelDiscount + vDiscount);

    // Total Amount: Original applicable total before discount
    const applicableSubtotal = (taxableSubtotal > 0 && gstTaxAmt > 0.005)
        ? (taxableSubtotal + effectiveTotalDiscount)
        : (grandTotalAmt + effectiveTotalDiscount - (isDeliveryActive ? deliveryAmt : 0) - roundOffAmt);
    const originalApplicableTotal = effectiveTotalDiscount > 0.005
        ? Math.max(totalMrpSum, applicableSubtotal)
        : (totalMrpSum > 0 ? totalMrpSum : (taxableSubtotal > 0 ? taxableSubtotal : grandTotalAmt));
    const effectiveTotalBeforeDiscount = originalApplicableTotal;
    const prodDiscountAmt = productLevelDiscount;

    const taxBreakdown = useMemo(() => {
        const breakdown = {};
        items?.forEach(item => {
            const rate = parseFloat(item.taxRate || item.taxPercent || item.product?.taxRate || 0);
            const lineTax = parseFloat(item.taxAmount || 0);
            const taxable = (parseFloat(item.total) || 0) - lineTax;
            const tType = item.taxType || item.product?.taxType || printData?.taxType || 'cgst_sgst';
            const key = `${rate}_${tType}`;
            if (!breakdown[key]) {
                breakdown[key] = { rate, taxType: tType, taxableAmount: 0, taxAmount: 0 };
            }
            breakdown[key].taxableAmount += taxable;
            breakdown[key].taxAmount += lineTax;
        });
        return breakdown;
    }, [items, printData?.taxType]);

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
                        @page { size: auto; margin: 0; } 
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
                        } 
                        .thermal-invoice, .thermal-invoice * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            font-family: Arial, Helvetica, sans-serif !important;
                            -webkit-text-stroke: 0 !important;
                            text-stroke: 0 !important;
                        }
                    }
                    .thermal-invoice {
                        font-family: Arial, Helvetica, sans-serif !important;
                        color: #000000;
                    }
                    .thermal-invoice, .thermal-invoice * {
                        -webkit-text-stroke: 0 !important;
                        text-stroke: 0 !important;
                    }
                    .thermal-invoice img {
                        image-rendering: -webkit-optimize-contrast;
                        image-rendering: crisp-edges;
                    }
                `}</style>
                {/* TEMPLATE-SPECIFIC OUTER CONTAINER FOR CLASSIC */}
                <div className={isClassic ? "border-2 border-black p-2 my-0.5" : ""}>

                    {/* HEADER AREA */}
                    {isBold ? (
                        <div className="mb-2">
                            {settings.showLogo !== false && companyProfile?.logoUrl && (
                                <img src={companyProfile.logoUrl} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-1" />
                            )}
                            <div className="bg-black text-white p-2 text-center rounded-sm mb-1.5 print:bg-black print:text-white">
                                {settings.showCompanyName !== false && (
                                    <h2 className="text-[14px] font-black uppercase text-white tracking-wide">
                                        {companyProfile?.companyName || 'OUR STORE'}
                                    </h2>
                                )}
                                <div className="text-[10px] font-bold text-white uppercase tracking-wider mt-0.5">
                                    {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                                </div>
                            </div>
                            {settings.showAddress !== false && (
                                <div className="text-center text-[9.5px] font-normal text-black leading-tight">
                                    <p>{companyProfile?.address}</p>
                                    <p>Ph: {companyProfile?.phone}</p>
                                </div>
                            )}
                        </div>
                    ) : isBoutiqueA5 ? (
                        <div className="text-center pb-2 mb-2 border-b border-dashed border-black">
                            <div className="text-[10px] tracking-widest text-black mb-0.5 font-normal">❖ ❖ ❖</div>
                            {settings.showLogo !== false && companyProfile?.logoUrl && (
                                <img src={companyProfile.logoUrl} alt="Logo" className="w-10 h-10 object-contain mx-auto mb-1" />
                            )}
                            {settings.showCompanyName !== false && (
                                <h2 className="text-[14px] font-bold uppercase tracking-widest text-black">
                                    {companyProfile?.companyName || 'BOUTIQUE'}
                                </h2>
                            )}
                            <div className="text-[8.5px] italic text-black font-normal">Boutique & Retail Collection</div>
                            {settings.showAddress !== false && (
                                <div className="text-[9.5px] font-normal text-black leading-snug mt-1">
                                    <p>{companyProfile?.address}</p>
                                    <p>Ph: {companyProfile?.phone}</p>
                                </div>
                            )}
                            <div className="border-t border-b border-dashed border-black py-1 mt-1 font-semibold text-[10.5px] tracking-[2px] uppercase text-black">
                                ~ {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')} ~
                            </div>
                        </div>
                    ) : isClassic ? (
                        <div className="text-center pb-2 mb-2">
                            {settings.showLogo !== false && companyProfile?.logoUrl && (
                                <img src={companyProfile.logoUrl} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-1" />
                            )}
                            {settings.showCompanyName !== false && (
                                <h2 className="text-[14px] font-bold uppercase text-black tracking-wide">
                                    {companyProfile?.companyName || 'OUR STORE'}
                                </h2>
                            )}
                            {settings.showAddress !== false && (
                                <div className="text-[9.5px] font-normal text-black leading-snug">
                                    <p>{companyProfile?.address}</p>
                                    <p>Ph: {companyProfile?.phone}</p>
                                </div>
                            )}
                            <div className="border-t-2 border-b-2 border-black py-1 my-1.5 text-center font-bold text-[11px] uppercase tracking-wider text-black">
                                {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                            </div>
                        </div>
                    ) : isMinimal ? (
                        <div className="text-center pb-1.5 mb-2 border-b border-gray-300">
                            {settings.showLogo !== false && companyProfile?.logoUrl && (
                                <img src={companyProfile.logoUrl} alt="Logo" className="w-10 h-10 object-contain mx-auto mb-1" />
                            )}
                            {settings.showCompanyName !== false && (
                                <h2 className="text-[13px] font-bold uppercase text-black tracking-normal">
                                    {companyProfile?.companyName || 'STORE'}
                                </h2>
                            )}
                            {settings.showAddress !== false && (
                                <div className="text-[9px] font-normal text-black leading-tight mt-0.5">
                                    <p>{companyProfile?.address}</p>
                                    <p>Ph: {companyProfile?.phone}</p>
                                </div>
                            )}
                            <div className="text-[10px] font-medium tracking-widest uppercase text-black mt-1 pt-0.5">
                                {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                            </div>
                        </div>
                    ) : (
                        /* Default Modern Template */
                        <div className="text-center pb-2 mb-2 border-b border-dashed border-black">
                            {settings.showLogo !== false && companyProfile?.logoUrl && (
                                <img src={companyProfile.logoUrl} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-1" />
                            )}
                            {settings.showCompanyName !== false && (
                                <h2 className="text-[14px] font-bold uppercase text-black tracking-wide">
                                    {companyProfile?.companyName || 'OUR STORE'}
                                </h2>
                            )}
                            {settings.showAddress !== false && (
                                <div className="text-[9.5px] font-normal text-black leading-snug">
                                    <p>{companyProfile?.address}</p>
                                    <p>Ph: {companyProfile?.phone}</p>
                                </div>
                            )}
                            <div className="my-1.5 text-center">
                                <span className="border border-black px-3 py-0.5 rounded-full inline-block font-semibold text-[10.5px] uppercase tracking-wider text-black">
                                    {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* METADATA & CUSTOMER DETAILS */}
                    {isBold ? (
                        <div className="mb-2">
                            <div className="bg-black text-white px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider mb-1 print:bg-black print:text-white">
                                INVOICE & CUSTOMER
                            </div>
                            <div className="text-[9.5px] font-normal text-black space-y-0.5 pl-0.5">
                                <div className="flex justify-between">
                                    <span>{isQuotation ? 'Quote #:' : 'Invoice #:'} <strong className="font-medium">{quotationNumber || invoiceNumber || ''}</strong></span>
                                    <span>{invoiceDate ? new Date(invoiceDate).toLocaleDateString() : ''}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Bill To: <span className="font-medium">{customer?.name || customerName || 'Walk-in'}</span></span>
                                    {customer?.phone && <span>Ph: {customer.phone}</span>}
                                </div>
                            </div>
                        </div>
                    ) : isBoutiqueA5 ? (
                        <div className="border border-dashed border-black p-1.5 my-2 text-[9.5px] font-normal text-black space-y-0.5">
                            <div className="flex justify-between">
                                <span>{isQuotation ? 'Quote:' : 'Inv:'} <strong className="font-medium">{quotationNumber || invoiceNumber || ''}</strong></span>
                                <span>{invoiceDate ? new Date(invoiceDate).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Customer: <span className="font-medium">{customer?.name || customerName || 'Walk-in'}</span></span>
                                {customer?.phone && <span>Ph: {customer.phone}</span>}
                            </div>
                        </div>
                    ) : isClassic ? (
                        <div className="border-b border-black pb-1.5 mb-2 text-[9.5px] font-normal text-black space-y-0.5">
                            <div className="flex justify-between">
                                <span>{isQuotation ? 'Quote No.:' : 'Invoice No.:'} <strong className="font-medium">{quotationNumber || invoiceNumber || ''}</strong></span>
                                <span>Date: {invoiceDate ? new Date(invoiceDate).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Customer: <span className="font-medium">{customer?.name || customerName || 'Walk-in'}</span></span>
                                {customer?.phone && <span>Ph: {customer.phone}</span>}
                            </div>
                        </div>
                    ) : isMinimal ? (
                        <div className="py-1 mb-2 border-b border-gray-200 text-[9.5px] font-normal text-black space-y-0.5">
                            <div className="flex justify-between">
                                <span>{isQuotation ? 'Quote' : 'Inv'}: {quotationNumber || invoiceNumber || ''}</span>
                                <span>{invoiceDate ? new Date(invoiceDate).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Customer: {customer?.name || customerName || 'Walk-in'}</span>
                                {customer?.phone && <span>{customer.phone}</span>}
                            </div>
                        </div>
                    ) : (
                        /* Default Modern */
                        <div className="border-t border-b border-dotted border-black py-1.5 my-2 text-[9.5px] font-normal text-black space-y-0.5">
                            <div className="flex justify-between">
                                <span>{isQuotation ? 'Quote' : 'Inv'}: <strong className="font-medium">{quotationNumber || invoiceNumber || ''}</strong></span>
                                <span>{invoiceDate ? new Date(invoiceDate).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Bill To: <span className="font-medium">{customer?.name || customerName || 'Walk-in'}</span></span>
                                {customer?.phone && <span>Ph: {customer.phone}</span>}
                            </div>
                        </div>
                    )}

                    {/* ITEMS TABLE (EXACT 4 COLUMNS) */}
                    <div className="mb-2">
                        <table className="w-full table-fixed text-[9.5px] border-collapse">
                            <thead>
                                <tr className={
                                    isClassic
                                        ? 'border-y border-black bg-gray-100 font-bold text-black'
                                        : isBold
                                            ? 'bg-black text-white font-bold print:bg-black print:text-white'
                                            : isBoutiqueA5
                                                ? 'border-y border-dashed border-black font-semibold text-black'
                                                : isMinimal
                                                    ? 'border-b border-gray-400 font-semibold text-black'
                                                    : 'border-b border-black font-semibold text-black'
                                }>
                                    <th className="py-1 text-left w-[44%] pr-1">Item Description</th>
                                    <th className="py-1 text-right w-[20%] pr-1">Rate</th>
                                    <th className="py-1 text-center w-[12%]">Qty</th>
                                    <th className="py-1 text-right w-[24%]">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items?.map((item, idx) => {
                                    const { posPrice, lineTotal, qty } = getItemValues(item);
                                    const rowBorder = isClassic
                                        ? 'border-b border-black'
                                        : isBold
                                            ? 'border-b border-dashed border-black'
                                            : isBoutiqueA5
                                                ? 'border-b border-dashed border-gray-400'
                                                : isMinimal
                                                    ? 'border-b border-gray-200'
                                                    : 'border-b border-dotted border-gray-400';
                                    return (
                                        <tr key={idx} className={`${rowBorder} align-top`}>
                                            <td className="py-1 pr-1 text-left whitespace-normal break-words leading-tight font-normal text-black">
                                                <div>
                                                    {isBoutiqueA5 && <span className="mr-0.5">❖</span>}
                                                    {item.product?.name || item.name || 'Item'}
                                                </div>
                                                {item.size && (
                                                    <div className="text-[8px] text-gray-700 font-normal mt-0.5">
                                                        Size: {item.size}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-1 pr-1 text-right font-normal text-black whitespace-nowrap">
                                                {currentSymbol}{formatAmt(posPrice)}
                                            </td>
                                            <td className="py-1 text-center font-normal text-black whitespace-nowrap">
                                                {qty}
                                            </td>
                                            <td className="py-1 text-right font-normal text-black whitespace-nowrap">
                                                {currentSymbol}{formatAmt(lineTotal)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* FINANCIAL SUMMARY (CONCISE PRIMARY SUMMARY) */}
                    <div className="space-y-1 text-[10px] font-normal text-black mt-2">
                        {/* 1. Subtotal */}
                        <div className="flex justify-between w-full">
                            <span>Subtotal:</span>
                            <span>{currentSymbol}{formatAmt(effectiveTotalBeforeDiscount)}</span>
                        </div>

                        {/* 2. Discount */}
                        {effectiveTotalDiscount > 0.005 && (
                            <div className="flex justify-between w-full">
                                <span>Discount:</span>
                                <span>- {currentSymbol}{formatAmt(effectiveTotalDiscount)}</span>
                            </div>
                        )}

                        {/* 3. Taxable Amount */}
                        {gstTaxAmt > 0.005 && (
                            <div className="flex justify-between w-full">
                                <span>Taxable Amount:</span>
                                <span>{currentSymbol}{formatAmt(taxableSubtotal)}</span>
                            </div>
                        )}

                        {/* 4. GST Breakdown */}
                        {gstTaxAmt > 0.005 && (
                            <>
                                {Object.entries(taxBreakdown).filter(([_, data]) => parseFloat(data.rate) > 0).length > 0 ? (
                                    Object.entries(taxBreakdown)
                                        .filter(([_, data]) => parseFloat(data.rate) > 0)
                                        .map(([key, data]) => {
                                            const rate = parseFloat(data.rate);
                                            const isIgst = data.taxType === 'igst';
                                            return isIgst ? (
                                                <div key={key} className="flex justify-between w-full">
                                                    <span>IGST ({rate}%):</span>
                                                    <span>+{currentSymbol}{formatAmt(data.taxAmount)}</span>
                                                </div>
                                            ) : (
                                                <React.Fragment key={key}>
                                                    <div className="flex justify-between w-full">
                                                        <span>CGST ({rate / 2}%):</span>
                                                        <span>+{currentSymbol}{formatAmt(data.taxAmount / 2)}</span>
                                                    </div>
                                                    <div className="flex justify-between w-full">
                                                        <span>SGST ({rate / 2}%):</span>
                                                        <span>+{currentSymbol}{formatAmt(data.taxAmount / 2)}</span>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })
                                ) : (
                                    <div className="flex justify-between w-full">
                                        <span>GST / Tax:</span>
                                        <span>+{currentSymbol}{formatAmt(gstTaxAmt)}</span>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 5. Delivery Charge */}
                        {isDeliveryActive && (
                            <div className="flex justify-between w-full">
                                <span>Delivery Charge:</span>
                                <span>+{currentSymbol}{formatAmt(deliveryAmt)}</span>
                            </div>
                        )}

                        {/* 6. Round Off */}
                        {Math.abs(roundOffAmt) > 0.005 && (
                            <div className="flex justify-between w-full">
                                <span>Round-off:</span>
                                <span>{roundOffAmt > 0 ? '+' : ''}{currentSymbol}{formatAmt(roundOffAmt)}</span>
                            </div>
                        )}

                        {/* 7. Customer Advance */}
                        {advanceAmt > 0.005 && (
                            <div className="flex justify-between w-full">
                                <span>Customer Advance:</span>
                                <span>- {currentSymbol}{formatAmt(advanceAmt)}</span>
                            </div>
                        )}

                        {/* 8. TOTAL */}
                        {isBold ? (
                            <div className="bg-black text-white p-2 flex justify-between items-center font-bold text-[13px] my-1.5 print:bg-black print:text-white">
                                <span className="text-white uppercase">TOTAL:</span>
                                <span className="text-white text-[14px]">{currentSymbol}{formatAmt(grandTotalAmt)}</span>
                            </div>
                        ) : isClassic ? (
                            <div className="border-t-2 border-b-4 border-double border-black py-1 my-1 flex justify-between items-center font-bold text-[13px]">
                                <span>TOTAL PAYABLE:</span>
                                <span>{currentSymbol}{formatAmt(grandTotalAmt)}</span>
                            </div>
                        ) : isBoutiqueA5 ? (
                            <div className="border border-dashed border-black p-1.5 my-1.5 text-center font-bold text-[12.5px]">
                                <div className="text-[9px] uppercase tracking-widest font-normal">Total Amount Payable</div>
                                <div>{currentSymbol}{formatAmt(grandTotalAmt)}</div>
                            </div>
                        ) : isMinimal ? (
                            <div className="border-t border-black pt-1 mt-1.5 flex justify-between items-center font-bold text-[12.5px]">
                                <span>TOTAL:</span>
                                <span>{currentSymbol}{formatAmt(grandTotalAmt)}</span>
                            </div>
                        ) : (
                            /* Modern Template */
                            <div className="border border-black rounded p-1.5 my-1 flex justify-between items-center font-bold text-[13px]">
                                <span>TOTAL:</span>
                                <span>{currentSymbol}{formatAmt(grandTotalAmt)}</span>
                            </div>
                        )}

                        {/* Payment Method */}
                        {paymentMethod && (
                            <div className="flex justify-between w-full text-[9.5px] pt-0.5">
                                <span>Payment Method:</span>
                                <span className="font-medium">{paymentMethod}</span>
                            </div>
                        )}

                        {/* Split Payments */}
                        {paymentsList.length > 1 && (
                            <div className="w-full text-[9px] pl-2 border-l border-black my-0.5 space-y-0.5">
                                {paymentsList.map((p, idx) => (
                                    <div key={idx} className="flex justify-between">
                                        <span>{p.method}:</span>
                                        <span>{currentSymbol}{formatAmt(p.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Amount Paid */}
                        <div className="flex justify-between w-full text-[10px]">
                            <span>Amount Paid:</span>
                            <span className="font-medium">{currentSymbol}{formatAmt(paidAmt)}</span>
                        </div>

                        {/* Balance Due */}
                        {balanceAmt > 0.005 && (
                            <div className="flex justify-between w-full text-[10.5px] font-semibold text-black">
                                <span>Balance Due:</span>
                                <span>{currentSymbol}{formatAmt(balanceAmt)}</span>
                            </div>
                        )}
                    </div>

                    {/* REWARD VOUCHER CARD */}
                    {rewardVoucher && (
                        <div className="mt-2.5 p-2 border border-dashed border-black text-center text-black">
                            <p className="font-semibold text-[10px] uppercase tracking-wider">🎉 REWARD COUPON</p>
                            <p className="text-[12px] font-mono font-bold mt-0.5">{rewardVoucher.code}</p>
                            <p className="text-[9.5px] mt-0.5 font-normal">
                                Get {rewardVoucher.type === 'PERCENTAGE' ? `${rewardVoucher.value}% OFF` : `${currentSymbol}${formatAmt(rewardVoucher.value)} OFF`} on next purchase
                            </p>
                            {parseFloat(rewardVoucher.minimumPurchaseAmount || 0) > 0 && (
                                <p className="text-[9px] font-normal">Min spend: {currentSymbol}{formatAmt(rewardVoucher.minimumPurchaseAmount)}</p>
                            )}
                            {rewardVoucher.expiryDate && (
                                <p className="text-[9px] font-normal">Valid until: {new Date(rewardVoucher.expiryDate).toLocaleDateString()}</p>
                            )}
                        </div>
                    )}

                    {/* FOOTER NOTE */}
                    <div className="text-center mt-3 pt-1.5 border-t border-dashed border-black text-[9px] font-normal tracking-wider text-black">
                        <p>{settings.footerText || settings.footerNote || (isBoutiqueA5 ? 'Thank you for shopping with us! ❖ Visit Again' : 'THANK YOU FOR YOUR BUSINESS!')}</p>
                    </div>

                </div>
            </div>
        );
    }

    return (
        <div ref={ref} style={getContainerStyle()} className={`professional-invoice leading-normal`}>
            <style>{`
                @media print {
                    @page { 
                        size: ${isThermal ? 'auto' : isA4 ? '210mm 297mm' : '148mm 210mm'}; 
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
                        width: ${isThermal ? '80mm' : isA4 ? '210mm' : '148mm'} !important;
                        height: auto !important;
                        min-height: auto !important;
                        max-height: ${isThermal ? 'none' : isA4 ? '296mm' : '208mm'} !important;
                        box-shadow: none !important; 
                        margin: 0 !important;
                        border: ${isClassic && !isThermal ? '2px solid black' : 'none'} !important;
                        padding: ${isThermal ? '4mm' : (isA5 || isBoutiqueA5 ? '6mm 10mm 8mm 10mm' : isA4 ? '8mm 15mm 10mm 15mm' : '6mm 10mm')} !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                        box-sizing: border-box !important;
                        color: #000000 !important;
                        font-family: ${isBoutiqueA5 ? 'Georgia, Cambria, "Times New Roman", serif' : 'Arial, Helvetica, sans-serif'} !important;
                        text-rendering: geometricPrecision !important;
                        -webkit-font-smoothing: antialiased !important;
                        -moz-osx-font-smoothing: grayscale !important;
                    }
                    .professional-invoice * {
                        text-rendering: geometricPrecision !important;
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                    }
                }
                .professional-invoice { 
                    font-family: ${isBoutiqueA5 ? 'Georgia, Cambria, "Times New Roman", serif' : 'Arial, Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'} !important; 
                    color: #111827;
                }
                .professional-invoice img {
                    image-rendering: -webkit-optimize-contrast;
                    image-rendering: crisp-edges;
                }
            `}</style>

            {/* HEADER AREA */}
            {isBoutiqueA5 ? (
                /* 1. NEW BOUTIQUE TEMPLATE HEADER */
                <div className="mb-3 text-center">
                    <div className="text-xs tracking-widest text-slate-800 mb-0.5">❖ ❖ ❖</div>
                    {settings.showLogo !== false && companyProfile?.logoUrl && (
                        <img src={companyProfile.logoUrl} alt="Logo" className="max-h-12 mx-auto object-contain mb-1" />
                    )}
                    {settings.showCompanyName !== false && (
                        <h1 className="text-2xl font-serif font-bold uppercase tracking-[2px] text-black mb-0.5">
                            {companyProfile?.companyName || 'BOUTIQUE NAME'}
                        </h1>
                    )}
                    <p className="italic text-xs text-slate-600 tracking-wider mb-1">
                        {companyProfile?.tagline || companyProfile?.businessType || 'Luxury & Retail Collection'}
                    </p>
                    {settings.showAddress !== false && (
                        <p className="text-[11px] text-slate-700">
                            {companyProfile?.address ? `${companyProfile.address}, ` : ''}{companyProfile?.city || ''}
                            {companyProfile?.phone ? ` | Tel: ${companyProfile.phone}` : ''}
                            {companyProfile?.gstNumber ? ` | GSTIN: ${companyProfile.gstNumber}` : ''}
                        </p>
                    )}
                    <div className="border-t border-b border-dashed border-black py-1 my-2 text-center font-serif text-sm tracking-[3px] uppercase font-semibold text-black">
                        ~ {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')} ~
                    </div>
                </div>
            ) : isClassic ? (
                /* 2. CLASSIC TEMPLATE HEADER */
                <div className="mb-3 text-center">
                    {settings.showLogo !== false && companyProfile?.logoUrl && (
                        <img src={companyProfile.logoUrl} alt="Logo" className="max-h-12 mx-auto object-contain mb-1" />
                    )}
                    {settings.showCompanyName !== false && (
                        <h1 className="text-2xl font-black uppercase text-black tracking-wide mb-0.5">
                            {companyProfile?.companyName || 'YOUR COMPANY NAME'}
                        </h1>
                    )}
                    {settings.showAddress !== false && (
                        <p className="text-[11px] text-black">
                            {companyProfile?.address ? `${companyProfile.address}, ` : ''}{companyProfile?.city || ''}
                            {companyProfile?.phone ? ` | Phone: +91 ${companyProfile.phone}` : ''}
                            {companyProfile?.gstNumber ? ` | GSTIN: ${companyProfile.gstNumber}` : ''}
                        </p>
                    )}
                    <div className="border-t-2 border-b-2 border-black py-1 my-2 text-center font-bold tracking-[2px] uppercase text-sm bg-gray-100 text-black">
                        {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                    </div>
                </div>
            ) : isBold ? (
                /* 3. BOLD TEMPLATE HEADER */
                <div className="bg-black text-white p-4 rounded-xl flex flex-wrap justify-between items-center gap-4 mb-3 print:bg-black print:text-white">
                    <div className="flex items-center gap-3">
                        {settings.showLogo !== false && companyProfile?.logoUrl && (
                            <img src={companyProfile.logoUrl} alt="Logo" className="max-h-12 object-contain bg-white rounded p-1" />
                        )}
                        <div>
                            {settings.showCompanyName !== false && (
                                <h1 className="text-xl font-black uppercase tracking-wide text-white">
                                    {companyProfile?.companyName || 'YOUR COMPANY NAME'}
                                </h1>
                            )}
                            {settings.showAddress !== false && (
                                <p className="text-[11px] text-slate-300">
                                    {companyProfile?.address ? `${companyProfile.address}` : ''}
                                    {companyProfile?.phone ? ` • Ph: ${companyProfile.phone}` : ''}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-xl font-black uppercase tracking-widest text-white block">
                            {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                        </span>
                        <span className="text-xs text-slate-300 font-mono">
                            #{quotationNumber || invoiceNumber || ''} • {invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}
                        </span>
                    </div>
                </div>
            ) : isMinimal ? (
                /* 4. MINIMAL TEMPLATE HEADER */
                <div className="flex flex-wrap justify-between items-start gap-4 mb-3 border-b border-slate-200 pb-3">
                    <div>
                        {settings.showLogo !== false && companyProfile?.logoUrl && (
                            <img src={companyProfile.logoUrl} alt="Logo" className="max-h-10 object-contain mb-1" />
                        )}
                        {settings.showCompanyName !== false && (
                            <h1 className="text-2xl font-light uppercase tracking-widest text-slate-900">
                                {companyProfile?.companyName || 'Company Name'}
                            </h1>
                        )}
                        {settings.showAddress !== false && (
                            <p className="text-[11px] text-slate-500">
                                {companyProfile?.address || ''} {companyProfile?.phone ? `• ${companyProfile.phone}` : ''}
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 border-b border-slate-300 pb-0.5">
                            {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                        </h2>
                    </div>
                </div>
            ) : (
                /* 5. MODERN TEMPLATE HEADER */
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
                        <div className="mb-1">
                            <span className="inline-block px-3.5 py-1 rounded-full text-white font-bold text-xs uppercase tracking-wider shadow-sm" style={{ backgroundColor: accent }}>
                                {settings.headerTitle || (isQuotation ? 'QUOTATION' : 'TAX INVOICE')}
                            </span>
                        </div>
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
            )}

            {/* BILL TO & INVOICE DETAILS */}
            {isBoutiqueA5 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-[11px]">
                    <div className="border border-dashed border-slate-400 p-2.5 rounded-lg bg-slate-50/40">
                        <p className="font-serif font-bold uppercase tracking-wider text-black mb-1">Customer Details</p>
                        <p className="font-semibold text-black">{customer?.name || customerName || 'Walk-in Customer'}</p>
                        {customer?.phone && <p className="text-slate-600">Ph: {customer.phone}</p>}
                        {customer?.address && <p className="text-slate-600">{customer.address}</p>}
                    </div>
                    <div className="border border-dashed border-slate-400 p-2.5 rounded-lg bg-slate-50/40 text-right">
                        <p className="font-serif font-bold uppercase tracking-wider text-black mb-1">Invoice Info</p>
                        <p><span className="text-slate-600">Invoice No:</span> <strong className="text-black font-semibold">{quotationNumber || invoiceNumber || ''}</strong></p>
                        <p><span className="text-slate-600">Date:</span> <strong className="text-black font-semibold">{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}</strong></p>
                    </div>
                </div>
            ) : isClassic ? (
                <div className="border border-black grid grid-cols-1 md:grid-cols-2 mb-3 text-[11px]">
                    <div className="p-2.5 border-r border-black">
                        <p className="font-bold uppercase tracking-wider text-black underline mb-1">Bill To</p>
                        <p className="font-bold text-black">{customer?.name || customerName || 'Walk-in Customer'}</p>
                        {customer?.phone && <p className="text-black">Ph: {customer.phone}</p>}
                        {customer?.address && <p className="text-black">{customer.address}</p>}
                        {customer?.gstin && <p className="text-black font-semibold">GSTIN: {customer.gstin}</p>}
                    </div>
                    <div className="p-2.5">
                        <p className="font-bold uppercase tracking-wider text-black underline mb-1">Invoice Details</p>
                        <div className="grid grid-cols-[100px_1fr] gap-0.5">
                            <span className="font-semibold text-black">{isQuotation ? 'Quotation No:' : 'Invoice No:'}</span>
                            <span className="font-bold text-black">{quotationNumber || invoiceNumber || ''}</span>
                            <span className="font-semibold text-black">Date:</span>
                            <span className="font-bold text-black">{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}</span>
                        </div>
                    </div>
                </div>
            ) : isBold ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-[11.5px]">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="bg-black text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block mb-1.5 print:bg-black print:text-white">
                            BILL TO
                        </span>
                        <p className="font-bold text-slate-900">{customer?.name || customerName || 'Walk-in Customer'}</p>
                        {customer?.phone && <p className="text-slate-600">📞 {customer.phone}</p>}
                        {customer?.address && <p className="text-slate-600">{customer.address}</p>}
                        {customer?.gstin && <p className="font-bold text-black">GSTIN: {customer.gstin}</p>}
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-right">
                        <span className="bg-black text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block mb-1.5 print:bg-black print:text-white">
                            INVOICE DETAILS
                        </span>
                        <p><span className="text-slate-500">{isQuotation ? 'Quote #:' : 'Invoice #:'}</span> <strong className="font-bold text-slate-900">{quotationNumber || invoiceNumber || ''}</strong></p>
                        <p><span className="text-slate-500">Date:</span> <strong className="font-bold text-slate-900">{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}</strong></p>
                    </div>
                </div>
            ) : isMinimal ? (
                <div className="flex flex-wrap justify-between gap-6 mb-3 text-[11.5px] text-slate-600">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Billed To</p>
                        <p className="font-medium text-slate-900">{customer?.name || customerName || 'Walk-in'}</p>
                        {customer?.phone && <p>{customer.phone}</p>}
                        {customer?.address && <p>{customer.address}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Details</p>
                        <p><span className="text-slate-400">{isQuotation ? 'Quote' : 'Invoice'}:</span> <span className="font-medium text-slate-900">{quotationNumber || invoiceNumber || ''}</span></p>
                        <p><span className="text-slate-400">Date:</span> <span className="font-medium text-slate-900">{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}</span></p>
                    </div>
                </div>
            ) : (
                /* Modern Bill To & Details */
                <div className={`flex flex-wrap ${isMobile ? 'flex-col' : ''} gap-x-8 gap-y-3 mb-4 border-t border-slate-200 pt-3`}>
                    {settings.showCustomer !== false && (
                        <div className={`flex-1 ${isMobile ? '' : 'border-r border-slate-200 pr-6'}`}>
                            <p className={`${s_SecHead}`} style={{ color: accent }}>Bill To</p>
                            <div className="space-y-0.5">
                                <p className={s_Value}>{customer?.name || customerName || 'Walk-in'}</p>
                                {customer?.phone && <p className={s_AddressLabel}>📞 {customer.phone}</p>}
                                {customer?.address && <p className={s_AddressLabel}>{customer.address}{customer.city ? `, ${customer.city}` : ''}</p>}
                                {customer?.gstin && <p className={`${s_Label} font-bold text-black`}>GSTIN: {customer.gstin}</p>}
                            </div>
                        </div>
                    )}
                    {settings.showInvoiceMeta !== false && (
                        <div className={`flex-1 ${isMobile ? 'pl-0' : 'pl-4'}`}>
                            <p className={`${s_SecHead}`} style={{ color: accent }}>Invoice Details</p>
                            <div className="space-y-1.5">
                                <div className={`flex items-center gap-6 ${isMobile ? 'justify-between' : ''}`}>
                                    <span className={`${s_Label} whitespace-nowrap`}>{isQuotation ? 'Quotation No:' : 'Invoice No:'}</span>
                                    <span className={`${s_Value} text-right`}>{quotationNumber || invoiceNumber || ''}</span>
                                </div>
                                <div className={`flex items-center gap-6 ${isMobile ? 'justify-between' : ''}`}>
                                    <span className={`${s_Label} whitespace-nowrap`}>Date:</span>
                                    <span className={`${s_Value} text-right`}>{invoiceDate ? new Date(invoiceDate).toLocaleDateString('en-GB') : ''}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PRODUCT TABLE (EXACT 4 COLUMNS: Item Description | Rate | Qty | Amount) */}
            <div className={`mb-3 ${isMobile ? 'overflow-x-auto lg:no-scrollbar' : ''}`}>
                <table className={`w-full table-fixed ${isClassic ? 'border border-black' : isBoutiqueA5 ? 'border-collapse' : isMinimal ? 'border-collapse' : isBold ? 'border-separate border-spacing-0' : 'border-separate border-spacing-0'}`}>
                    <thead>
                        <tr 
                            className={
                                isClassic 
                                    ? 'bg-gray-100 text-black border-b-2 border-black' 
                                    : isBold 
                                        ? 'bg-black text-white' 
                                        : isBoutiqueA5
                                            ? 'bg-slate-50 text-black border-y border-dashed border-black font-serif'
                                            : isMinimal 
                                                ? 'bg-white text-slate-800 border-b-2 border-slate-300' 
                                                : 'text-white'
                            } 
                            style={
                                isClassic || isMinimal || isBoutiqueA5 
                                    ? {} 
                                    : isBold 
                                        ? { backgroundColor: '#000000', height: '34px' } 
                                        : { backgroundColor: accent, height: '34px' }
                            }
                        >
                            <th className={`${s_TableTh} text-left w-auto py-2 ${isClassic ? 'border-r border-black' : isBoutiqueA5 ? 'font-serif tracking-wider' : isMinimal ? 'border-b-2 border-slate-300' : 'rounded-l-lg'}`}>
                                {isBold ? 'ITEM DESCRIPTION' : 'Item Description'}
                            </th>
                            <th className={`${s_TableTh} text-right w-28 py-2 ${isClassic ? 'border-r border-black' : isMinimal ? 'border-b-2 border-slate-300' : ''}`}>
                                {isBold ? 'RATE' : 'Rate'}
                            </th>
                            <th className={`${s_TableTh} text-center w-16 py-2 ${isClassic ? 'border-r border-black' : isMinimal ? 'border-b-2 border-slate-300' : ''}`}>
                                {isBold ? 'QTY' : 'Qty'}
                            </th>
                            <th className={`${s_TableTh} text-right w-32 py-2 ${isClassic ? '' : isMinimal ? 'border-b-2 border-slate-300' : 'rounded-r-lg'}`}>
                                {isBold ? 'AMOUNT' : 'Amount'}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {items?.map((item, idx) => {
                            const { posPrice, lineTotal, qty } = getItemValues(item);
                            const rowBorderClass = isClassic
                                ? 'border-b border-black'
                                : isBoutiqueA5
                                    ? 'border-b border-dashed border-slate-300'
                                    : isBold
                                        ? 'border-b-2 border-slate-200'
                                        : isMinimal
                                            ? 'border-b border-slate-100'
                                            : 'border-b border-slate-100';

                            return (
                                <tr key={idx} className={`${rowBorderClass} align-top`}>
                                    <td className={`${s_TableTd} text-left font-normal text-slate-900 print:text-black whitespace-normal break-words leading-tight ${isClassic ? 'border-r border-black' : ''}`}>
                                        <div>
                                            {isBoutiqueA5 && <span className="mr-1 text-[10px]">❖</span>}
                                            <span className="font-semibold text-slate-900 print:text-black">
                                                {item.product?.name || item.name || 'Item'}
                                            </span>
                                        </div>
                                        {item.size && (
                                            <div className="mt-0.5">
                                                <span className="text-[10px] font-normal text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded print:text-black">
                                                    Size: {item.size}
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                    <td className={`${s_TableTd} text-right font-normal text-slate-900 print:text-black whitespace-nowrap ${isClassic ? 'border-r border-black' : ''}`}>
                                        {currentSymbol}{formatAmt(posPrice)}
                                    </td>
                                    <td className={`${s_TableTd} text-center font-normal text-slate-900 print:text-black whitespace-nowrap ${isClassic ? 'border-r border-black' : ''}`}>
                                        {qty}
                                    </td>
                                    <td className={`${s_TableTd} text-right font-semibold text-slate-950 print:text-black whitespace-nowrap`}>
                                        {currentSymbol}{formatAmt(lineTotal)}
                                    </td>
                                </tr>
                            );
                        })}
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
                    {settings.showTaxSummary !== false && parseFloat(taxAmount || 0) > 0 && Object.entries(taxBreakdown).filter(([_, data]) => parseFloat(data.rate) > 0).length > 0 && (
                        <div className={`bg-[#f8fafc] p-3 rounded-xl border border-slate-200 shadow-sm min-w-[200px]`}>
                            <p className={`${s_SecHead} mb-2 font-bold text-[10px] tracking-[1.2px]`} style={{ color: '#009262' }}>TAX SUMMARY</p>
                            <div className={`space-y-1 text-[11px]`}>
                                {Object.entries(taxBreakdown)
                                    .filter(([_, data]) => parseFloat(data.rate) > 0)
                                    .map(([key, data]) => {
                                        const rate = parseFloat(data.rate);
                                        const isIgst = data.taxType === 'igst';
                                        return (
                                            <React.Fragment key={key}>
                                                {isIgst ? (
                                                    <div className="flex justify-between items-center text-slate-700 font-medium">
                                                        <span>IGST ({rate}%)</span>
                                                        <span className="font-bold text-slate-900 print:text-black">{currentSymbol}{formatAmt(data.taxAmount)}</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex justify-between items-center text-slate-700 font-medium">
                                                            <span>CGST ({rate / 2}%)</span>
                                                            <span className="font-bold text-slate-900 print:text-black">{currentSymbol}{formatAmt(data.taxAmount / 2)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-slate-700 font-medium">
                                                            <span>SGST ({rate / 2}%)</span>
                                                            <span className="font-bold text-slate-900 print:text-black">{currentSymbol}{formatAmt(data.taxAmount / 2)}</span>
                                                        </div>
                                                    </>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>

                <div 
                    className={`${isMobile ? 'w-full' : 'w-[280px] ml-auto'} p-3.5 ${
                        isClassic 
                            ? 'border-2 border-black rounded-none bg-white' 
                            : isBoutiqueA5
                                ? 'border border-dashed border-black rounded-xl bg-slate-50/40'
                                : isMinimal 
                                    ? 'border border-slate-200 rounded-lg bg-white' 
                                    : isBold 
                                        ? 'border-l-[6px] border border-slate-200 rounded-r-xl bg-[#f8fafc]' 
                                        : 'border-t-4 border border-slate-200 rounded-xl bg-[#f8fafc]'
                    }`} 
                    style={isBold ? { borderLeftColor: '#000000' } : isModern ? { borderTopColor: accent } : {}}
                >
                    <div className="space-y-1.5 mb-1.5">
                        {/* 1. Subtotal */}
                        <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                            <span className="whitespace-nowrap mr-2">Subtotal:</span>
                            <span className="font-semibold text-slate-900 whitespace-nowrap print:text-black">{currentSymbol}{formatAmt(effectiveTotalBeforeDiscount)}</span>
                        </div>

                        {/* 2. Discount */}
                        {effectiveTotalDiscount > 0.005 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                                <span className="whitespace-nowrap mr-2">Discount:</span>
                                <span className="font-semibold text-red-600 whitespace-nowrap print:text-black">- {currentSymbol}{formatAmt(effectiveTotalDiscount)}</span>
                            </div>
                        )}

                        {/* 3. Taxable Amount */}
                        {gstTaxAmt > 0.005 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                                <span className="whitespace-nowrap mr-2">Taxable Amount:</span>
                                <span className="font-semibold text-slate-900 whitespace-nowrap print:text-black">{currentSymbol}{formatAmt(taxableSubtotal)}</span>
                            </div>
                        )}

                        {/* 4. GST / Tax */}
                        {gstTaxAmt > 0.005 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                                <span className="whitespace-nowrap mr-2">GST / Tax:</span>
                                <span className="font-semibold text-slate-900 whitespace-nowrap print:text-black">+{currentSymbol}{formatAmt(gstTaxAmt)}</span>
                            </div>
                        )}

                        {/* 5. Delivery Charge */}
                        {isDeliveryActive && (
                            <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                                <span className="whitespace-nowrap mr-2">Delivery Charge:</span>
                                <span className="font-semibold text-slate-900 whitespace-nowrap print:text-black">+{currentSymbol}{formatAmt(deliveryAmt)}</span>
                            </div>
                        )}

                        {/* 6. Round Off */}
                        {Math.abs(roundOffAmt) > 0.005 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                                <span className="whitespace-nowrap mr-2">Round-off:</span>
                                <span className="font-semibold text-slate-900 whitespace-nowrap print:text-black">{roundOffAmt > 0 ? '+' : ''}{currentSymbol}{formatAmt(roundOffAmt)}</span>
                            </div>
                        )}

                        {/* 7. Customer Advance */}
                        {advanceAmt > 0.005 && (
                            <div className="flex justify-between items-center text-slate-700 text-[11.5px] font-normal tracking-tight">
                                <span className="whitespace-nowrap mr-2">Customer Advance:</span>
                                <span className="font-semibold text-emerald-700 whitespace-nowrap print:text-black">- {currentSymbol}{formatAmt(advanceAmt)}</span>
                            </div>
                        )}

                        {/* Payment Method */}
                        {paymentMethod && (
                            <div className="flex justify-between items-center text-slate-700 text-[11px] font-normal tracking-tight pt-0.5 border-t border-slate-200">
                                <span className="whitespace-nowrap mr-2">Payment Method:</span>
                                <span className="font-medium text-slate-900 whitespace-nowrap print:text-black">{paymentMethod}</span>
                            </div>
                        )}

                        {/* Split Payment Breakdown */}
                        {paymentsList.length > 1 && (
                            <div className="pl-2 border-l-2 border-slate-300 my-1 space-y-0.5">
                                {paymentsList.map((p, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-slate-700 text-[10px]">
                                        <span>{p.method}:</span>
                                        <span className="font-medium text-slate-900 print:text-black">{currentSymbol}{formatAmt(p.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Amount Paid */}
                        <div className="flex justify-between items-center text-slate-700 text-[11px] font-normal tracking-tight">
                            <span className="whitespace-nowrap mr-2">Amount Paid:</span>
                            <span className="font-medium text-emerald-700 whitespace-nowrap print:text-black">{currentSymbol}{formatAmt(paidAmt)}</span>
                        </div>
                    </div>

                    {/* TOTAL */}
                    {isClassic ? (
                        <div className="pt-2 border-t-2 border-b-4 border-double border-black flex justify-between items-center mt-2 py-1">
                            <span className="font-bold uppercase tracking-[0.5px] text-[12px] text-black print:text-black">
                                TOTAL PAYABLE
                            </span>
                            <span className="font-black text-[18px] tracking-tight text-black print:text-black">
                                {currentSymbol}{formatAmt(grandTotalAmt)}
                            </span>
                        </div>
                    ) : isBold ? (
                        <div className="pt-2 border-t-2 border-black flex justify-between items-center mt-2 bg-black text-white p-2.5 rounded-lg print:bg-black print:text-white">
                            <span className="font-black uppercase tracking-wider text-[12px] text-white">
                                TOTAL
                            </span>
                            <span className="font-black text-[18px] text-white">
                                {currentSymbol}{formatAmt(grandTotalAmt)}
                            </span>
                        </div>
                    ) : isBoutiqueA5 ? (
                        <div className="pt-2 border-t border-dashed border-black mt-2 text-center p-2 rounded bg-white">
                            <span className="text-[10px] uppercase font-serif tracking-[2px] text-slate-700 block">
                                Total Payable
                            </span>
                            <span className="font-serif font-black text-[18px] text-black print:text-black">
                                {currentSymbol}{formatAmt(grandTotalAmt)}
                            </span>
                        </div>
                    ) : isMinimal ? (
                        <div className="pt-2 border-t border-slate-300 flex justify-between items-center mt-2">
                            <span className="font-bold uppercase tracking-wide text-[12px] text-slate-900 print:text-black">
                                TOTAL
                            </span>
                            <span className="font-bold text-[18px] text-slate-900 print:text-black">
                                {currentSymbol}{formatAmt(grandTotalAmt)}
                            </span>
                        </div>
                    ) : (
                        <div className="pt-2 border-t-2 border-slate-300 flex justify-between items-center mt-2">
                            <span className="font-bold uppercase tracking-[0.5px] text-[11.5px] text-[#009262] print:text-black">
                                TOTAL
                            </span>
                            <span className="font-black text-[18px] tracking-tighter text-[#009262] print:text-black">
                                {currentSymbol}{formatAmt(grandTotalAmt)}
                            </span>
                        </div>
                    )}

                    {/* Balance Due */}
                    {balanceAmt > 0.005 && (
                        <div className={`pt-1.5 mt-1.5 border-t border-dashed border-slate-300 flex justify-between items-center`}>
                            <span className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wide print:text-black">BALANCE DUE</span>
                            <span className="text-[15px] font-black text-red-600 tracking-tight print:text-black">
                                {currentSymbol}{formatAmt(balanceAmt)}
                            </span>
                        </div>
                    )}
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

            {/* REWARD VOUCHER COUPON CARD */}
            {rewardVoucher && (
                <div className="my-3 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-dashed border-emerald-400 rounded-xl flex items-center justify-between text-slate-800 print:border-black print:bg-white" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[14px]">🎁</span>
                            <span className="font-bold text-[12px] text-emerald-900 uppercase tracking-wide print:text-black">
                                Next Purchase Reward Voucher
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-600 print:text-black">
                            Enjoy <strong className="text-emerald-700 print:text-black">{rewardVoucher.type === 'PERCENTAGE' ? `${rewardVoucher.value}% OFF` : `${currentSymbol}${formatAmt(rewardVoucher.value)} OFF`}</strong> on your next store visit!
                        </p>
                        {parseFloat(rewardVoucher.minimumPurchaseAmount || 0) > 0 && (
                            <p className="text-[10px] text-slate-500 print:text-black">
                                Valid on minimum purchase of {currentSymbol}{formatAmt(rewardVoucher.minimumPurchaseAmount)}
                            </p>
                        )}
                    </div>
                    <div className="text-right pl-3 border-l border-emerald-200 print:border-black">
                        <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 print:text-black">COUPON CODE</span>
                        <span className="inline-block px-2.5 py-1 bg-white border border-emerald-300 rounded font-mono font-black text-sm text-emerald-800 tracking-wider shadow-sm mt-0.5 print:border-black print:text-black">
                            {rewardVoucher.code}
                        </span>
                        {rewardVoucher.expiryDate && (
                            <span className="block text-[9px] text-slate-400 mt-1 print:text-black">
                                Expires: {new Date(rewardVoucher.expiryDate).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* FOOTER */}
            <div className={`mt-auto pt-3 border-t border-slate-200 flex flex-wrap ${isMobile ? 'flex-col items-start' : 'justify-between items-end'} gap-4`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className="flex-1">
                    <p className={`${s_SecHead}`} style={isBold ? { color: accent } : { color: '#334155' }}>Terms</p>
                    <p className="text-[11px] text-slate-700 leading-relaxed max-w-[380px] font-medium print:text-black">{terms || settings.termsConditions || 'Goods once sold will not be taken back.'}</p>
                </div>
                <div className={`${isMobile ? 'text-left' : 'text-right'} text-slate-800 font-bold italic text-[13px] print:text-black`}>
                    {settings.footerText || settings.footerNote || (isBoutiqueA5 ? 'Thank you for shopping with us! ❖ Visit Again' : 'Thank you for your business!')}
                </div>
            </div>
        </div>
    );
});

ProfessionalInvoice.displayName = 'ProfessionalInvoice';
export default ProfessionalInvoice;
