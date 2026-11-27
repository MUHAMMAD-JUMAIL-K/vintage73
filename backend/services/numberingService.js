const prisma = require('../config/prisma');

/**
 * Get the active financial year for a given branch and date.
 * @param {Object} tx - Prisma transaction client
 * @param {number} branchId - Branch ID
 * @param {Date} date - Date of the document
 */
async function getActiveFinancialYear(tx, branchId, date) {
    const d = date ? new Date(date) : new Date();
    
    // 1. Try to find branch-specific FY for the specific date
    let fy = await tx.financialYear.findFirst({
        where: {
            branchId: branchId,
            startDate: { lte: d },
            endDate: { gte: d },
            isClosed: false
        }
    });

    // 2. Fallback to global FY for the specific date
    if (!fy) {
        fy = await tx.financialYear.findFirst({
            where: {
                branchId: null,
                startDate: { lte: d },
                endDate: { gte: d },
                isClosed: false
            }
        });
    }

    // 3. Fallback to the most recent open branch-specific FY
    if (!fy) {
        fy = await tx.financialYear.findFirst({
            where: {
                branchId: branchId,
                isClosed: false
            },
            orderBy: { startDate: 'desc' }
        });
        if (fy) {
            console.log(`[NUMBERING] Warning: Date ${d.toISOString()} is not within any FY. Falling back to latest branch FY: ${fy.name}`);
        }
    }

    // 4. Fallback to the most recent open global FY
    if (!fy) {
        fy = await tx.financialYear.findFirst({
            where: {
                branchId: null,
                isClosed: false
            },
            orderBy: { startDate: 'desc' }
        });
        if (fy) {
            console.log(`[NUMBERING] Warning: Date ${d.toISOString()} is not within any FY. Falling back to latest global FY: ${fy.name}`);
        }
    }

    return fy;
}

/**
 * Generate the next document number for a given module and branch.
 * @param {Object} tx - Prisma transaction client
 * @param {string} module - 'invoice', 'quotation', 'purchase', 'challan'
 * @param {number} branchId - Branch ID
 * @param {Date} date - Date of the document
 * @returns {Promise<{number: string, financialYearId: number|null}>}
 */
async function generateNextNumber(tx, module, branchId, date) {
    const fy = await getActiveFinancialYear(tx, branchId, date);
    
    if (!fy) {
        // Fallback if no FY is found (though it should ideally always exist)
        const timestamp = Date.now();
        const prefix = module === 'invoice' ? 'INV' : module === 'quotation' ? 'QT' : module === 'purchase' ? 'PUR' : 'DC';
        return {
            number: `${prefix}-${timestamp}`,
            financialYearId: null
        };
    }

    let prefixField, sequenceField;
    switch (module) {
        case 'invoice':
            prefixField = 'invoicePrefix';
            sequenceField = 'invoiceSequence';
            break;
        case 'quotation':
            prefixField = 'quotationPrefix';
            sequenceField = 'quotationSequence';
            break;
        case 'purchase':
            prefixField = 'purchasePrefix';
            sequenceField = 'purchaseSequence';
            break;
        case 'challan':
            prefixField = 'challanPrefix';
            sequenceField = 'challanSequence';
            break;
        default:
            throw new Error(`Invalid module: ${module}`);
    }

    const prefix = fy[prefixField] || 'DOC';
    const currentSeq = fy[sequenceField] || '001';

    // To ensure consistency across modules, we look for the highest number ALREADY used in the DB
    // This prevents collisions if the FY sequence was manually edited or out of sync.
    let lastNumber;
    if (module === 'invoice') {
        const last = await tx.sale.findFirst({
            where: {
                branchId: branchId,
                OR: [
                    { financialYearId: fy.id },
                    { financialYearId: null }
                ],
                invoiceNumber: { startsWith: prefix }
            },
            orderBy: { id: 'desc' }
        });
        lastNumber = last?.invoiceNumber;
    } else if (module === 'quotation') {
        const last = await tx.quotation.findFirst({
            where: {
                branchId: branchId,
                OR: [
                    { financialYearId: fy.id },
                    { financialYearId: null }
                ],
                quotationNumber: { startsWith: prefix }
            },
            orderBy: { id: 'desc' }
        });
        lastNumber = last?.quotationNumber;
    } else if (module === 'purchase') {
        const last = await tx.purchase.findFirst({
            where: {
                branchId: branchId,
                OR: [
                    { financialYearId: fy.id },
                    { financialYearId: null }
                ],
                invoiceNumber: { startsWith: prefix }
            },
            orderBy: { id: 'desc' }
        });
        lastNumber = last?.invoiceNumber;
    } else if (module === 'challan') {
        const last = await tx.deliveryChallan.findFirst({
            where: {
                branchId: branchId,
                OR: [
                    { financialYearId: fy.id },
                    { financialYearId: null }
                ],
                challanNumber: { startsWith: prefix }
            },
            orderBy: { id: 'desc' }
        });
        lastNumber = last?.challanNumber;
    }

    const fySeqNum = parseInt(currentSeq, 10);
    let nextNum = !isNaN(fySeqNum) ? fySeqNum : 1;
    if (lastNumber && lastNumber.startsWith(prefix)) {
        const seqPart = lastNumber.slice(prefix.length);
        const lastNum = parseInt(seqPart, 10);
        if (!isNaN(lastNum)) {
            nextNum = Math.max(nextNum, lastNum + 1);
        }
    }
    const padLength = Math.max(currentSeq.length, String(nextNum).length);
    const nextSeq = nextNum.toString().padStart(padLength, '0');

    // Update the Financial Year record with the NEW sequence (optional, but good for tracking)
    // Actually, we should only update it after the record is successfully created.
    // But since the requirement says "Preserve leading zeros" and "increment", we'll return it.
    
    return {
        number: `${prefix}${nextSeq}`,
        nextSeq: nextSeq,
        financialYearId: fy.id
    };
}

module.exports = {
    getActiveFinancialYear,
    generateNextNumber
};
