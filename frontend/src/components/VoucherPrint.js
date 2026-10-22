import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/currency';

const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return;
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only ' : 'Only ';
    return str;
};

export default function VoucherPrint({ voucher, onClose }) {
    const [company, setCompany] = useState(null);
    const [readyToPrint, setReadyToPrint] = useState(false);

    // Step 1: Fetch company data — mark ready when done (success or failure)
    useEffect(() => {
        const fetchCompany = async () => {
            try {
                const res = await api.get('/company');
                setCompany(res.data);
            } catch (err) {
                console.error('Failed to fetch company info', err);
            } finally {
                setReadyToPrint(true);
            }
        };
        fetchCompany();
    }, []);

    // Step 2: Once data is ready, auto-trigger print and dismiss after dialog closes
    useEffect(() => {
        if (!readyToPrint) return;

        // afterprint fires when the user closes the browser print dialog (Print or Cancel)
        const handleAfterPrint = () => onClose();
        window.addEventListener('afterprint', handleAfterPrint);

        // rAF inside a short timeout ensures React has painted the DOM with company data
        let raf;
        const timer = setTimeout(() => {
            raf = requestAnimationFrame(() => {
                window.print();
            });
        }, 80);

        return () => {
            clearTimeout(timer);
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [readyToPrint]);

    if (!voucher) return null;

    const debitEntries = voucher.entries.filter(e => e.debitLedgerId);
    const creditEntries = voucher.entries.filter(e => e.creditLedgerId);

    const isPayment = voucher.voucherType === 'PAYMENT';
    const isReceipt = voucher.voucherType === 'RECEIPT';
    const isContra = voucher.voucherType === 'CONTRA';
    const isJournal = voucher.voucherType === 'JOURNAL';

    const voucherTitle = isPayment ? 'PAYMENT VOUCHER' :
                         isReceipt ? 'RECEIPT VOUCHER' :
                         isContra  ? 'CONTRA VOUCHER'  :
                         isJournal ? 'JOURNAL VOUCHER' : 'ACCOUNT VOUCHER';

    return (
        // voucher-print-root is completely hidden on screen via @media screen CSS below.
        // It only renders (display:block) inside @media print — user never sees an overlay.
        <div className="voucher-print-root">
            <div className="max-w-[1000px] mx-auto border border-slate-900 p-6 min-h-[400px] flex flex-col font-sans text-slate-900">

                {/* Header Section */}
                <div className="flex justify-between items-start mb-4 border-b border-slate-300 pb-4">
                    <div className="flex gap-4 items-start">
                        {company?.logoUrl && (
                            <img src={`${process.env.NEXT_PUBLIC_API_URL}${company.logoUrl}`} alt="Logo" className="h-20 object-contain" />
                        )}
                        <div>
                            <h1 className="text-lg font-bold uppercase leading-tight tracking-tight">{company?.companyName || 'PILLOW SPOT'}</h1>
                            <p className="text-[10px] text-slate-600 leading-tight max-w-sm">
                                {company?.address}, {company?.city}, {company?.state} - {company?.pincode}
                            </p>
                            <p className="text-[10px] text-slate-600">Phone: {company?.phone} | Email: {company?.email}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="inline-block px-4 py-1 border border-slate-900 font-medium text-sm mb-2 bg-slate-50 tracking-widest">
                            {voucherTitle}
                        </div>
                        <div className="space-y-0.5 mt-1">
                            <p className="text-[11px] font-medium">Voucher No: <span className="text-xs font-medium">{voucher.voucherNumber}</span></p>
                            <p className="text-[11px] font-medium">Date: <span className="text-xs font-medium">{new Date(voucher.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                        </div>
                    </div>
                </div>

                {/* Details Section */}
                <div className="flex-grow space-y-3">
                    <div className="grid grid-cols-12 gap-x-2 items-center">
                        <div className="col-span-2 text-[10px] font-medium uppercase text-slate-400">
                            {isPayment ? 'Paid To' : isReceipt ? 'Received From' : 'Account (Dr)'}:
                        </div>
                        <div className="col-span-10 text-xs font-medium border-b border-slate-200 pb-0.5">
                            {isPayment ? (debitEntries[0]?.debitLedger?.name) :
                             isReceipt ? (creditEntries[0]?.creditLedger?.name) :
                             isContra  ? (debitEntries[0]?.debitLedger?.name) :
                             (debitEntries.map(e => e.debitLedger?.name).join(', '))}
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-x-2 items-center">
                        <div className="col-span-2 text-[10px] font-medium uppercase text-slate-400">
                            {isPayment ? 'By Account' : isReceipt ? 'By Account' : 'Account (Cr)'}:
                        </div>
                        <div className="col-span-10 text-xs font-medium text-slate-700 border-b border-slate-200 pb-0.5">
                            {isPayment ? (creditEntries[0]?.creditLedger?.name) :
                             isReceipt ? (debitEntries[0]?.debitLedger?.name) :
                             isContra  ? (creditEntries[0]?.creditLedger?.name) :
                             (creditEntries.map(e => e.creditLedger?.name).join(', '))}
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-x-2 items-start">
                        <div className="col-span-2 text-[10px] font-medium uppercase text-slate-400 mt-1">
                            Narration:
                        </div>
                        <div className="col-span-10 text-[11px] italic text-slate-600 leading-relaxed min-h-[40px] border-b border-slate-200">
                            {voucher.narration || '____________________________________________________________________________________'}
                        </div>
                    </div>

                    {voucher.reference && (
                        <div className="grid grid-cols-12 gap-x-2 items-center">
                            <div className="col-span-2 text-[10px] font-medium uppercase text-slate-400">
                                Reference:
                            </div>
                            <div className="col-span-10 text-[11px] font-medium">
                                {voucher.reference}
                            </div>
                        </div>
                    )}

                    {/* Amount Box */}
                    <div className="mt-6 flex border border-slate-900 overflow-hidden">
                        <div className="flex-grow p-3 bg-slate-50 flex flex-col justify-center">
                            <span className="text-[8px] font-medium uppercase text-slate-400 block mb-1">Amount in words ({voucher.branch?.currencyCode || 'INR'})</span>
                            <p className="text-[11px] font-medium italic leading-tight uppercase">{voucher.branch?.currencyCode || 'Rupees'} {numberToWords(Math.round(voucher.totalAmount))}</p>
                        </div>
                        <div className="w-1/4 p-3 border-l border-slate-900 flex flex-col justify-center items-end bg-white">
                            <span className="text-[8px] font-extrabold uppercase text-slate-400 block mb-1">Total Amount</span>
                            <p className="text-xl font-extrabold tabular-nums tracking-tight">{formatCurrency(voucher.totalAmount, voucher.branch || 'INR')}</p>
                        </div>
                    </div>
                </div>

                {/* Footer / Signatures Section */}
                <div className="mt-12 grid grid-cols-3 gap-8 text-center px-4">
                    <div>
                        <div className="h-10"></div>
                        <div className="border-t border-slate-900 pt-1.5 text-[9px] font-medium uppercase tracking-wider">Receiver's Signature</div>
                    </div>
                    <div>
                        <div className="h-10"></div>
                        <div className="border-t border-slate-900 pt-1.5 text-[9px] font-medium uppercase tracking-wider">Prepared By</div>
                    </div>
                    <div>
                        <div className="h-10 text-[9px] font-medium text-slate-400 flex items-end justify-center pb-1">For {company?.companyName}</div>
                        <div className="border-t border-slate-900 pt-1.5 text-[9px] font-medium uppercase tracking-wider">Authorised Signatory</div>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center text-[7px] text-slate-400 uppercase tracking-[0.2em]">
                    <span>Printed on: {new Date().toLocaleString()}</span>
                    <span>This is a computer generated voucher for {company?.companyName}</span>
                </div>
            </div>

            <style jsx global>{`
                /* On screen: completely hidden — no white overlay, no blank page */
                @media screen {
                    .voucher-print-root {
                        display: none !important;
                    }
                }
                /* Print: full-page render of the voucher only */
                @page {
                    size: A4 portrait;
                    margin: 0;
                }
                @media print {
                    html, body {
                        height: 100%;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .voucher-print-root {
                        display: block !important;
                        visibility: visible !important;
                        position: absolute !important;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: 100%;
                        padding: 0;
                        margin: 0;
                        background: white;
                        page-break-after: avoid;
                        page-break-before: avoid;
                        break-inside: avoid;
                    }
                    .voucher-print-root * {
                        visibility: visible !important;
                    }
                    .voucher-print-root > div {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 1.5cm !important;
                        box-sizing: border-box !important;
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                        min-height: unset !important;
                    }
                    button {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
