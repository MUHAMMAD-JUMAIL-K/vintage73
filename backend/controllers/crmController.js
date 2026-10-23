const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

// Leads
exports.createLead = asyncHandler(async (req, res) => {
    const { 
        name, email, phone, address, source, productId, quantity, budget, assignedTo, notes, priority, followUpDate,
        branchId, negotiationAmount, referredById, commissionPercentage
    } = req.body;

    // Normalize data (Convert empty strings from form to null for unique fields)
    const normalizedPhone = phone && phone.trim() !== '' ? phone.trim() : null;
    const normalizedEmail = email && email.trim() !== '' ? email.trim() : null;

    // Duplicate phone check removed to allow multiple leads per customer


    const parsedProductId = productId ? parseInt(productId) : null;
    const parsedQuantity = quantity ? parseInt(quantity) : null;
    const parsedBudget = budget ? parseFloat(budget) : null;
    const parsedAssignedTo = assignedTo ? parseInt(assignedTo) : null;
    const parsedBranchId = branchId ? parseInt(branchId) : null;
    const parsedNegotiationAmount = negotiationAmount ? parseFloat(negotiationAmount) : null;
    const parsedReferredById = referredById ? parseInt(referredById) : null;
    const parsedCommissionPercentage = commissionPercentage ? parseFloat(commissionPercentage) : 0;

    // Auto-calculate commission if referral
    let commissionAmount = 0;
    if (source === 'Referral' && parsedNegotiationAmount && parsedCommissionPercentage) {
        commissionAmount = (parsedNegotiationAmount * parsedCommissionPercentage) / 100;
    }

    try {
        const lead = await prisma.lead.create({
            data: {
                name: name ? name.trim() : '',
                email: normalizedEmail,
                phone: normalizedPhone,
                address,
                source,
                productId: isNaN(parsedProductId) ? null : parsedProductId,
                quantity: isNaN(parsedQuantity) ? null : parsedQuantity,
                budget: isNaN(parsedBudget) ? null : parsedBudget,
                assignedTo: isNaN(parsedAssignedTo) ? null : parsedAssignedTo,
                branchId: isNaN(parsedBranchId) ? null : parsedBranchId,
                negotiationAmount: isNaN(parsedNegotiationAmount) ? null : parsedNegotiationAmount,
                referredById: isNaN(parsedReferredById) ? null : parsedReferredById,
                commissionPercentage: isNaN(parsedCommissionPercentage) ? 0 : parsedCommissionPercentage,
                commissionAmount: isNaN(commissionAmount) ? 0 : commissionAmount,
                notes,
                priority: priority || 'MEDIUM',
                status: 'NEW',
                followUpDate: followUpDate ? new Date(followUpDate) : null,
                nextFollowUpDate: followUpDate ? new Date(followUpDate) : null
            }
        });

        // Create initial FollowUp record if date is provided
        if (followUpDate) {
            await prisma.followUp.create({
                data: {
                    leadId: lead.id,
                    date: new Date(followUpDate),
                    status: 'PENDING',
                    notes: 'Initial follow-up'
                }
            });
        }

        // Log Activity
        await prisma.leadActivity.create({
            data: {
                leadId: lead.id,
                type: 'NOTE',
                description: 'Lead created'
            }
        });

        res.status(201).json(lead);
    } catch (error) {
        console.error('❌ PRISMA CREATE LEAD ERROR:', error);
        throw error; // Let the global handler send the response
    }
});


exports.getLeads = asyncHandler(async (req, res) => {
    const { search, status, assignedTo, fromDate, toDate } = req.query;

    const where = {};
    if (search && search.trim() !== '') {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { referredBy: { name: { contains: search, mode: 'insensitive' } } }
        ];
    }
    
    if (req.query.source && req.query.source !== '') where.source = req.query.source;
    if (status && status !== '') where.status = status;
    
    const assignedId = parseInt(assignedTo);
    if (!isNaN(assignedId)) where.assignedTo = assignedId;

    const referrerId = parseInt(req.query.referredById);
    if (!isNaN(referrerId)) where.referredById = referrerId;

    if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate && !isNaN(new Date(fromDate).getTime())) {
            where.createdAt.gte = new Date(fromDate);
        }
        if (toDate && !isNaN(new Date(toDate).getTime())) {
            where.createdAt.lte = new Date(toDate);
        }
        // Cleanup if no valid dates were added
        if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }



    try {
        const leads = await prisma.lead.findMany({
            where,
            include: { 
                assignedUser: { select: { name: true, username: true } },
                product: { select: { name: true, price: true } },
                referralPayments: true,
                referredBy: { select: { name: true, username: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const mappedLeads = leads.map(l => {
            const totalPaid = l.referralPayments ? l.referralPayments.reduce((sum, p) => sum + Number(p.amountPaid), 0) : 0;
            const balance = Number(l.commissionAmount || 0) - totalPaid;
            return {
                ...l,
                totalPaid,
                balance: balance > 0 ? balance : 0
            };
        });

        res.json(mappedLeads);
    } catch (error) {
        console.error('❌ CRM GET LEADS ERROR:', error.message);
        throw error;
    }
});

exports.getLeadById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const leadId = parseInt(id);

    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }

    const lead = await prisma.lead.findUnique({
        where: { id: leadId },

        include: {
            assignedUser: { select: { name: true, username: true } },
            product: true,
            activities: { orderBy: { createdAt: 'desc' } },
            followUps: { orderBy: { date: 'asc' } },
            quotation: true,
            sale: true
        }
    });
    if (!lead) {
        res.status(404);
        throw new Error('Lead not found');
    }
    res.json(lead);
});
exports.updateLead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }
    const { 
        id: bodyId, 
        createdAt, 
        updatedAt, 
        product, 
        assignedUser, 
        activities, 
        followUps, 
        quotation, 
        sale, 
        ...data 
    } = req.body;
    
    // Auto-recalculate commission if fields changed
    if (data.negotiationAmount !== undefined || data.commissionPercentage !== undefined || data.source !== undefined) {
        const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
        const negAmt = data.negotiationAmount !== undefined ? parseFloat(data.negotiationAmount) : (currentLead.negotiationAmount ? parseFloat(currentLead.negotiationAmount) : 0);
        const commPerc = data.commissionPercentage !== undefined ? parseFloat(data.commissionPercentage) : (currentLead.commissionPercentage ? parseFloat(currentLead.commissionPercentage) : 0);
        const src = data.source !== undefined ? data.source : currentLead.source;

        if (src === 'Referral' && negAmt && commPerc) {
            data.commissionAmount = (negAmt * commPerc) / 100;
        } else if (src !== 'Referral' && data.source !== undefined) {
            data.commissionAmount = 0;
            data.commissionPercentage = 0;
            data.referredById = null;
        } else if (src === 'Referral' && (!negAmt || !commPerc)) {
            data.commissionAmount = 0;
        }
    }

    const lead = await prisma.lead.update({
        where: { id: leadId },
        data: {
            ...data,
            assignedTo: data.assignedTo && !isNaN(parseInt(data.assignedTo)) ? parseInt(data.assignedTo) : undefined,
            productId: data.productId && !isNaN(parseInt(data.productId)) ? parseInt(data.productId) : undefined,
            branchId: data.branchId && !isNaN(parseInt(data.branchId)) ? parseInt(data.branchId) : undefined,
            referredById: data.referredById !== undefined ? (data.referredById && !isNaN(parseInt(data.referredById)) ? parseInt(data.referredById) : null) : undefined,
            quantity: data.quantity !== undefined ? (parseInt(data.quantity) || 1) : undefined,
            budget: data.budget !== undefined ? (parseFloat(data.budget) || 0) : undefined,
            negotiationAmount: data.negotiationAmount !== undefined ? (parseFloat(data.negotiationAmount) || 0) : undefined,
            commissionAmount: data.commissionAmount !== undefined ? parseFloat(data.commissionAmount) : undefined,
            commissionPercentage: data.commissionPercentage !== undefined ? parseFloat(data.commissionPercentage) : undefined,
            followUpDate: data.followUpDate ? new Date(data.followUpDate) : (data.followUpDate === "" ? null : undefined),
            lastFollowUpDate: data.lastFollowUpDate ? new Date(data.lastFollowUpDate) : (data.lastFollowUpDate === "" ? null : undefined),
            nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : (data.nextFollowUpDate === "" ? null : undefined)
        }
    });


    res.json(lead);
});

exports.updateLeadStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }

    const { status, notes } = req.body;

    const oldLead = await prisma.lead.findUnique({ where: { id: leadId } });

    const lead = await prisma.lead.update({
        where: { id: leadId },
        data: { status }
    });



    // Log Activity
    await prisma.leadActivity.create({
        data: {
            leadId: lead.id,
            type: 'STATUS_CHANGE',
            description: `Status changed from ${oldLead.status} to ${status}. ${notes || ''}`
        }
    });

    res.json(lead);
});

exports.deleteLead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }
    await prisma.lead.delete({ where: { id: leadId } });

    res.json({ message: 'Lead deleted' });
});

exports.addLeadActivity = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, description } = req.body;

    const leadId = parseInt(id);
    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }

    const activity = await prisma.leadActivity.create({
        data: {
            leadId: leadId,

            type: type || 'NOTE',
            description
        }
    });
    res.status(201).json(activity);
});

exports.scheduleFollowUp = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date, notes } = req.body;

    const leadId = parseInt(id);
    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }

    const followUp = await prisma.followUp.create({
        data: {
            leadId: leadId,

            date: new Date(date),
            notes
        }
    });

    // Update lead followUpDate
    await prisma.lead.update({
        where: { id: parseInt(id) },
        data: { followUpDate: new Date(date) }
    });

    // Log Activity
    await prisma.leadActivity.create({
        data: {
            leadId: parseInt(id),
            type: 'FOLLOW_UP_SCHEDULED',
            description: `Follow-up scheduled for ${new Date(date).toLocaleDateString()}`
        }
    });

    res.status(201).json(followUp);
});

exports.getFollowUps = asyncHandler(async (req, res) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    try {
        const followUps = await prisma.followUp.findMany({
            where: {
                status: 'PENDING'
            },
            include: {
                lead: {
                    include: {
                        product: { select: { name: true } },
                        assignedUser: { select: { name: true } }
                    }
                }
            },
            orderBy: { date: 'asc' }
        });

        // Segment follow-ups
        const result = {
            overdue: followUps.filter(f => new Date(f.date) < todayStart),
            today: followUps.filter(f => {
                const d = new Date(f.date);
                return d >= todayStart && d <= todayEnd;
            }),
            upcoming: followUps.filter(f => new Date(f.date) > todayEnd)
        };

        res.json(result);
    } catch (error) {
        console.error('❌ CRM GET FOLLOWUPS ERROR:', error.message);
        throw error;
    }
});

exports.completeFollowUp = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { outcome, notes, nextFollowUpDate } = req.body;

    const followUpId = parseInt(id);
    if (isNaN(followUpId)) {
        res.status(400);
        throw new Error('Invalid Follow-up ID');
    }

    const currentFollowUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: { lead: true }
    });

    if (!currentFollowUp) {
        res.status(404);
        throw new Error('Follow-up not found');
    }

    // Update current follow-up
    await prisma.followUp.update({
        where: { id: followUpId },
        data: {
            status: 'COMPLETED',
            outcome,
            notes: notes || currentFollowUp.notes,
            completedAt: new Date()
        }
    });

    // Determine new status based on outcome
    let nextStatus = currentFollowUp.lead.status;
    if (outcome === 'Interested') nextStatus = 'QUALIFIED';
    else if (outcome === 'Not Interested') nextStatus = 'LOST';
    else if (outcome === 'Quotation Sent') nextStatus = 'QUOTATION_SENT';
    else if (outcome === 'No Response' || outcome === 'Call Later') {
        if (nextStatus === 'NEW') nextStatus = 'CONTACTED';
    }

    // Update Lead
    const leadUpdateData = {
        status: nextStatus,
        lastFollowUpDate: new Date(),
        outcome,
        followUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null
    };

    await prisma.lead.update({
        where: { id: currentFollowUp.leadId },
        data: leadUpdateData
    });

    // Create next follow-up if not terminal outcome and next date provided
    if (nextStatus !== 'WON' && nextStatus !== 'LOST' && nextFollowUpDate) {
        await prisma.followUp.create({
            data: {
                leadId: currentFollowUp.leadId,
                date: new Date(nextFollowUpDate),
                status: 'PENDING'
            }
        });
    }

    // Log Activity
    await prisma.leadActivity.create({
        data: {
            leadId: currentFollowUp.leadId,
            type: 'FOLLOW_UP_SCHEDULED',
            description: `Follow-up completed. Outcome: ${outcome}. Notes: ${notes || 'None'}. ${nextFollowUpDate ? 'Next follow-up scheduled for ' + new Date(nextFollowUpDate).toLocaleDateString() : ''}`
        }
    });

    res.json({ message: 'Follow-up completed and next step processed' });
});


// Deals
exports.createDeal = asyncHandler(async (req, res) => {
    const { leadId, title, value, stage, assignedTo, expectedCloseDate } = req.body;
    const lId = parseInt(leadId);
    const aTo = parseInt(assignedTo);

    const deal = await prisma.deal.create({
        data: {
            title,
            value: parseFloat(value),
            stage: stage || 'QUALIFICATION',
            expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
            lead: lId && !isNaN(lId) ? { connect: { id: lId } } : undefined,
            assignedUser: aTo && !isNaN(aTo) ? { connect: { id: aTo } } : undefined
        }
    });
    res.status(201).json(deal);
});

exports.getDeals = asyncHandler(async (req, res) => {
    const deals = await prisma.deal.findMany({
        include: { lead: true, assignedUser: { select: { name: true } } }
    });
    res.json(deals);
});

exports.updateDeal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const dId = parseInt(id);
    if (isNaN(dId)) {
        res.status(400);
        throw new Error('Invalid Deal ID');
    }

    const deal = await prisma.deal.update({
        where: { id: dId },
        data: {
            ...data,
            leadId: data.leadId && !isNaN(parseInt(data.leadId)) ? parseInt(data.leadId) : undefined,
            assignedTo: data.assignedTo && !isNaN(parseInt(data.assignedTo)) ? parseInt(data.assignedTo) : undefined,
            probability: data.probability && !isNaN(parseInt(data.probability)) ? parseInt(data.probability) : undefined
        }
    });
    res.json(deal);
});

exports.deleteDeal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const dId = parseInt(id);
    if (isNaN(dId)) {
        res.status(400);
        throw new Error('Invalid Deal ID');
    }
    await prisma.deal.delete({ where: { id: dId } });
    res.json({ message: 'Deal deleted' });
});


// Tasks
exports.createTask = asyncHandler(async (req, res) => {
    const { title, dueDate, priority, description, leadId, dealId, assignedTo } = req.body;
    const task = await prisma.cRMTask.create({
        data: {
            title,
            dueDate: dueDate ? new Date(dueDate) : null,
            priority: priority || 'MEDIUM',
            description,
            leadId: leadId ? parseInt(leadId) : null,
            dealId: dealId ? parseInt(dealId) : null,
            assignedTo: assignedTo ? parseInt(assignedTo) : null
        }
    });
    res.status(201).json(task);
});

exports.getTasks = asyncHandler(async (req, res) => {
    const tasks = await prisma.cRMTask.findMany({
        include: {
            lead: { select: { name: true } },
            deal: { select: { title: true } },
            assignedUser: { select: { name: true, username: true } }
        },
        orderBy: { dueDate: 'asc' }
    });
    res.json(tasks);
});

exports.updateTask = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const tId = parseInt(id);
    if (isNaN(tId)) {
        res.status(400);
        throw new Error('Invalid Task ID');
    }

    const task = await prisma.cRMTask.update({
        where: { id: tId },
        data: {
            ...data,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined
        }
    });
    res.json(task);
});


exports.getMyReferralLeads = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const leads = await prisma.lead.findMany({
        where: { referredById: userId },
        include: {
            product: { select: { name: true } },
            referralPayments: true
        },
        orderBy: { createdAt: 'desc' }
    });

    const mappedLeads = leads.map(l => {
        const totalPaid = l.referralPayments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
        const balance = Number(l.commissionAmount || 0) - totalPaid;
        return {
            ...l,
            totalPaid,
            balance: balance > 0 ? balance : 0
        };
    });

    res.json(mappedLeads);
});

exports.recordReferralPayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { paymentDate, amountPaid, paymentMethod, bankName, transactionNumber, notes } = req.body;
    
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
        res.status(400);
        throw new Error('Invalid Lead ID');
    }

    const payment = await prisma.referralPayment.create({
        data: {
            leadId,
            paymentDate: new Date(paymentDate),
            amountPaid: parseFloat(amountPaid),
            paymentMethod,
            bankName,
            transactionNumber,
            notes
        }
    });

    // Check if fully paid
    const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { referralPayments: true, branch: true }
    });

    const totalPaid = lead.referralPayments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
    if (totalPaid >= Number(lead.commissionAmount)) {
        await prisma.lead.update({
            where: { id: leadId },
            data: { commissionPaid: true }
        });
    }

    const leadCurrSym = lead.branch?.currencySymbol || (lead.branch?.currencyCode === 'INR' ? '₹' : 'AED ');

    // Log Activity
    await prisma.leadActivity.create({
        data: {
            leadId,
            type: 'NOTE',
            description: `Referral payment of ${leadCurrSym}${amountPaid} recorded via ${paymentMethod}. Reference: ${transactionNumber || 'N/A'}`
        }
    });

    res.status(201).json(payment);
});

exports.getReferralPaymentHistory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const leadId = parseInt(id);

    const payments = await prisma.referralPayment.findMany({
        where: { leadId },
        orderBy: { paymentDate: 'desc' }
    });

    res.json(payments);
});

exports.updateCommissionStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { commissionPaid } = req.body;
    const leadId = parseInt(id);

    const lead = await prisma.lead.update({
        where: { id: leadId },
        data: { commissionPaid: !!commissionPaid }
    });

    res.json(lead);
});

exports.getDashboardStats = asyncHandler(async (req, res) => {
    const [totalLeads, newLeads, pipelines] = await Promise.all([
        prisma.lead.count(),
        prisma.lead.count({ where: { status: 'NEW' } }),
        prisma.deal.findMany()
    ]);

    const totalPipelineValue = pipelines.reduce((sum, deal) => sum + Number(deal.value), 0);
    
    // Group deals by stage
    const dealStages = pipelines.reduce((acc, deal) => {
        acc[deal.stage] = (acc[deal.stage] || 0) + 1;
        return acc;
    }, {});

    res.json({
        totalLeads,
        newLeads,
        totalPipelineValue,
        dealStages
    });
});

exports.convertToQuotation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { branchId, quotationNumber, financialYearId } = req.body;

    const leadId = parseInt(id);
    const bId = parseInt(branchId);
    if (isNaN(leadId) || isNaN(bId)) {
        res.status(400);
        throw new Error('Invalid Lead or Branch ID');
    }

    const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { product: true }
    });

    if (!lead) {
        res.status(404);
        throw new Error('Lead not found');
    }

    // Create Quotation
    const amountToUse = lead.negotiationAmount ? lead.negotiationAmount : (lead.budget || 0);

    const quotation = await prisma.quotation.create({
        data: {
            quotationNumber,
            branchId: bId,
            financialYearId: financialYearId && !isNaN(parseInt(financialYearId)) ? parseInt(financialYearId) : null,
            subTotal: amountToUse,
            taxAmount: 0,
            totalAmount: amountToUse,
            status: 'SENT',
            notes: lead.notes,
            lead: { connect: { id: lead.id } }
        }
    });


    // Add Quotation Item if product exists
    if (lead.productId) {
        await prisma.quotationItem.create({
            data: {
                quotationId: quotation.id,
                productId: lead.productId,
                quantity: lead.quantity || 1,
                unitPrice: lead.product.price,
                total: (lead.product.price * (lead.quantity || 1))
            }
        });
    }

    // Update Lead status
    await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'QUOTATION_SENT', quotationId: quotation.id }
    });

    // Log Activity
    await prisma.leadActivity.create({
        data: {
            leadId: lead.id,
            type: 'QUOTATION_SENT',
            description: `Lead converted to Quotation #${quotationNumber}`
        }
    });

    res.status(201).json(quotation);
});

exports.convertToOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { branchId, invoiceNumber, financialYearId, paymentMethod } = req.body;

    const leadId = parseInt(id);
    const bId = parseInt(branchId);

    if (isNaN(leadId) || isNaN(bId)) {
        res.status(400);
        throw new Error('Invalid Lead or Branch ID');
    }

    const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { product: true }
    });

    if (!lead) {
        res.status(404);
        throw new Error('Lead not found');
    }

    // Create Sale (Order)
    const amountToUse = lead.negotiationAmount ? lead.negotiationAmount : (lead.budget || 0);

    const sale = await prisma.sale.create({
        data: {
            invoiceNumber,
            branchId: bId,
            financialYearId: financialYearId && !isNaN(parseInt(financialYearId)) ? parseInt(financialYearId) : null,

            subTotal: amountToUse,
            taxAmount: 0,
            totalAmount: amountToUse,
            paymentMethod,
            status: 'completed',
            lead: { connect: { id: lead.id } }
        }
    });

    // Add Sale Item
    if (lead.productId) {
        await prisma.saleItem.create({
            data: {
                saleId: sale.id,
                productId: lead.productId,
                quantity: lead.quantity || 1,
                unitPrice: lead.product.price,
                total: (lead.product.price * (lead.quantity || 1))
            }
        });
    }

    // Update Lead status
    await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'WON', saleId: sale.id }
    });

    // Log Activity
    await prisma.leadActivity.create({
        data: {
            leadId: lead.id,
            type: 'ORDER_CONVERTED',
            description: `Lead converted to Sales Order #${invoiceNumber}`
        }
    });

    res.status(201).json(sale);
});

