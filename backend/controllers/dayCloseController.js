const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const {
  getBranchActiveBusinessDate,
  getLocalDateString,
  getUtcDateObj,
  formatDisplayDate
} = require('../utils/businessDateHelper');
const {
  findPreviousClosedSession,
  calculateSessionCashDrawer,
  parseBusinessDateStart,
  parseBusinessDateEnd
} = require('../utils/cashDrawerHelper');
const { formatCurrency, getCurrencySymbol } = require('../utils/currencyHelper');
const { ensureLedger, postVoucher } = require('../utils/accountingHelper');

// Resolves effective branch id respecting user permissions
const resolveEffectiveBranchId = async (req) => {
  const user = req.user;
  const isAdmin = user?.role === 'admin';

  if (isAdmin) {
    if (req.query?.branchId && req.query.branchId !== 'all') {
      const qVal = typeof req.query.branchId === 'object' ? req.query.branchId.id : req.query.branchId;
      const parsed = parseInt(qVal);
      if (!isNaN(parsed)) return parsed;
    }
    if (req.body?.branchId && req.body.branchId !== 'all') {
      const bVal = typeof req.body.branchId === 'object' ? req.body.branchId.id : req.body.branchId;
      const parsed = parseInt(bVal);
      if (!isNaN(parsed)) return parsed;
    }
    if (req.headers && req.headers['x-branch-id'] && req.headers['x-branch-id'] !== 'all') {
      const hVal = parseInt(req.headers['x-branch-id']);
      if (!isNaN(hVal)) return hVal;
    }
    if (user?.branchId) {
      return user.branchId;
    }
    const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
    return firstBranch ? firstBranch.id : 1;
  }

  // Non-admin user (cashier, staff)
  if (user?.branchId) {
    return user.branchId;
  }

  // Fallback for users without branchId
  if (req.headers && req.headers['x-branch-id'] && req.headers['x-branch-id'] !== 'all') {
    const hVal = parseInt(req.headers['x-branch-id']);
    if (!isNaN(hVal)) return hVal;
  }
  const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
  return firstBranch ? firstBranch.id : 1;
};

/**
 * @desc Get current Day Close status, active business date, opening details, and pending warning
 * @route GET /api/day-close/status
 * @access Private
 */
const getDayCloseStatus = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const branch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
    select: { id: true, name: true, currencyCode: true, currencySymbol: true }
  });

  // Determine authoritative active business date
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const selectedDateStr = req.query.date || activeDateInfo.dateStr;

  // Calculate comprehensive cash drawer and session status
  const drawer = await calculateSessionCashDrawer(targetBranchId, selectedDateStr);

  const dayCloseRecord = drawer.dayCloseRecord;

  res.json({
    success: true,
    branchId: targetBranchId,
    branchName: branch?.name || 'Branch',
    currencySymbol: branch?.currencySymbol || getCurrencySymbol(branch?.currencyCode),
    currencyCode: branch?.currencyCode || 'AED',
    businessDate: selectedDateStr,
    businessDateDisplay: formatDisplayDate(selectedDateStr),
    activeDate: activeDateInfo.dateStr,
    activeDateDisplay: formatDisplayDate(activeDateInfo.dateStr),
    hasPendingPrevious: activeDateInfo.isPendingPrevious,
    pendingDate: activeDateInfo.isPendingPrevious ? activeDateInfo.dateStr : null,
    pendingDateDisplay: activeDateInfo.isPendingPrevious ? formatDisplayDate(activeDateInfo.dateStr) : null,
    status: drawer.status,
    branch: branch ? {
      id: branch.id,
      name: branch.name,
      currencyCode: branch.currencyCode,
      currencySymbol: branch.currencySymbol
    } : null,
    dayCloseId: drawer.dayCloseId,
    terminalId: drawer.terminalId,
    terminalName: drawer.terminalName,

    // Day Opening Details
    openedBy: drawer.openedBy,
    openedById: dayCloseRecord?.openedById || null,
    openedAt: drawer.openedAt,
    openingCash: drawer.openingCash,
    previousClosingCash: drawer.previousClosingCash,
    previousClosingDate: drawer.previousClosingDate,
    previousClosingDateDisplay: drawer.previousClosingDateDisplay,
    previousClosingId: drawer.previousClosingId,
    hasPreviousClosedDay: drawer.hasPreviousClosedDay,
    additionalCashAdded: drawer.additionalCashAdded,
    cashRemovedBeforeOpening: drawer.cashRemovedBeforeOpening,
    expectedOpeningCash: drawer.expectedOpeningCash,
    actualOpeningCash: drawer.actualOpeningCash,
    openingDifference: drawer.openingDifference,
    openingDiscrepancyReason: drawer.openingDiscrepancyReason,
    openingApprovedBy: drawer.openingApprovedBy,
    openingDenominations: drawer.openingDenominations,
    openingRemarks: drawer.openingRemarks,

    // Prior-Day Discrepancy flags (if Day 1 was corrected after Day 2 opened)
    hasPriorDayDiscrepancy: drawer.hasPriorDayDiscrepancy,
    priorDayDiscrepancyAmount: drawer.priorDayDiscrepancyAmount,
    priorDayCurrentClosingCash: drawer.priorDayCurrentClosingCash,
    priorDayRecordedClosingCash: drawer.priorDayRecordedClosingCash,

    // Real-Time Cash Movements
    cashSalesCollections: drawer.cashSalesCollections,
    otherCashReceipts: drawer.otherCashReceipts,
    totalCashReceived: drawer.totalCashReceived,
    cashExpenses: drawer.cashExpenses,
    cashRefunds: drawer.cashRefunds,
    supplierCashPayments: drawer.supplierCashPayments,
    totalCashPaid: drawer.totalCashPaid,
    transfersIn: drawer.transfersIn,
    transfersOut: drawer.transfersOut,
    netTransfers: drawer.netTransfers,

    // Verification & Closing Details
    verificationChecks: dayCloseRecord?.verificationChecks || null,
    verificationExceptions: dayCloseRecord?.verificationExceptions || null,
    exceptionApprovedBy: dayCloseRecord?.exceptionApprovedBy ? (dayCloseRecord.exceptionApprovedBy.name || dayCloseRecord.exceptionApprovedBy.username) : null,
    exceptionApprovalReason: dayCloseRecord?.exceptionApprovalReason || null,
    closingExpectedCash: drawer.expectedClosingCash,
    physicalCash: drawer.physicalCash,
    cashDifference: drawer.cashDifference,
    closingDenominations: drawer.closingDenominations,
    notes: drawer.notes,
    closedAt: drawer.finalizedAt,
    closedBy: drawer.finalizedBy,

    // Audit Trail
    adjustments: drawer.adjustments
  });
});

/**
 * @desc Open Business Day with opening cash count, previous balance and discrepancy explanation
 * @route POST /api/day-close/open
 * @access Private
 */
const openDay = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    businessDate: inputDateStr,
    terminalId,
    previousClosingCash: inputPrevCash,
    additionalCashAdded: inputAddCash,
    cashRemovedBeforeOpening: inputRemCash,
    actualOpeningCash: inputActualCash,
    openingDiscrepancyReason,
    openingRemarks,
    openingDenominations
  } = req.body;

  const todayStr = getLocalDateString();
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;

  if (dateStr > todayStr) {
    res.status(400);
    throw new Error(`Cannot open a future business date (${formatDisplayDate(dateStr)}).`);
  }

  const dateUtc = getUtcDateObj(dateStr);

  // Check if this date is already closed
  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (existing && (existing.status === 'CLOSED' || existing.status === 'ADMIN_CLOSED')) {
    res.status(400);
    throw new Error(`Business date ${formatDisplayDate(dateStr)} is already closed.`);
  }

  if (existing && (existing.status === 'OPEN' || existing.status === 'CLOSING_PENDING')) {
    res.status(400);
    throw new Error(`Business date ${formatDisplayDate(dateStr)} is already open. Use Edit Opening Amount if an adjustment is needed.`);
  }

  // Rule: Chronological Check: Verify no earlier date before dateStr is unclosed
  const sixtyDaysAgo = new Date(dateUtc);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [pastSales, pastOpenedSessions] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId: targetBranchId,
        saleDate: { gte: sixtyDaysAgo, lt: dateUtc },
        status: { not: 'cancelled' }
      },
      select: { saleDate: true },
      orderBy: { saleDate: 'asc' }
    }),
    prisma.dayClose.findMany({
      where: {
        branchId: targetBranchId,
        businessDate: { gte: sixtyDaysAgo, lt: dateUtc },
        status: { notIn: ['CLOSED', 'ADMIN_CLOSED'] }
      },
      select: { businessDate: true },
      orderBy: { businessDate: 'asc' }
    })
  ]);

  const distinctPastDates = Array.from(new Set([
    ...pastSales.map(s => getLocalDateString(s.saleDate)),
    ...pastOpenedSessions.map(o => getLocalDateString(o.businessDate))
  ])).sort((a, b) => a.localeCompare(b));

  for (const pDateStr of distinctPastDates) {
    const pUtc = getUtcDateObj(pDateStr);
    const prevDayRecord = await prisma.dayClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: pUtc
        }
      }
    });

    if (!prevDayRecord || (prevDayRecord.status !== 'CLOSED' && prevDayRecord.status !== 'ADMIN_CLOSED')) {
      res.status(400);
      throw new Error(`Day Close Pending! You have not closed the business date ${formatDisplayDate(pDateStr)}. Please complete the pending Day Close before proceeding to a later date.`);
    }
  }

  // Automatic Opening Balance Carry-Forward:
  // Retrieve the immediately preceding valid closed business session
  const prevSession = await findPreviousClosedSession(targetBranchId, dateUtc, terminalId);

  let prevCash = 0;
  if (prevSession.exists && prevSession.closingCash !== null) {
    // Automatically carry forward previous closing balance
    prevCash = Number(prevSession.closingCash);
  } else if (inputPrevCash !== undefined && inputPrevCash !== null && inputPrevCash !== '') {
    // First business day or fresh terminal: allow authorized user to establish initial opening balance
    prevCash = parseFloat(inputPrevCash) || 0;
  } else {
    prevCash = 0;
  }

  const addCash = parseFloat(inputAddCash) || 0;
  const remCash = parseFloat(inputRemCash) || 0;
  const expectedOpeningCash = Number((prevCash + addCash - remCash).toFixed(2));

  // If actualOpeningCash is not provided, default to expectedOpeningCash
  const actualCash = (inputActualCash !== undefined && inputActualCash !== null && inputActualCash !== '')
    ? parseFloat(inputActualCash)
    : expectedOpeningCash;

  const openingDifference = Number((actualCash - expectedOpeningCash).toFixed(2));

  // If opening difference is not zero, require an explanation
  if (Math.abs(openingDifference) > 0.01 && !openingDiscrepancyReason?.trim()) {
    const branchForDiff = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { currencyCode: true, currencySymbol: true } });
    res.status(400);
    throw new Error(`Opening difference of ${formatCurrency(openingDifference, branchForDiff?.currencyCode || 'AED', branchForDiff?.currencySymbol)} requires an explanation before opening.`);
  }

  // Perform database upsert in a safe transaction
  const dayCloseRecord = await prisma.$transaction(async (tx) => {
    return await tx.dayClose.upsert({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: dateUtc
        }
      },
      update: {
        status: 'OPEN',
        terminalId: terminalId ? parseInt(terminalId) : undefined,
        openedById: req.user.id,
        openedAt: existing?.openedAt || new Date(),
        openingCash: actualCash,
        previousClosingCash: prevCash,
        additionalCashAdded: addCash,
        cashRemovedBeforeOpening: remCash,
        expectedOpeningCash,
        actualOpeningCash: actualCash,
        openingDifference,
        openingDiscrepancyReason: openingDiscrepancyReason || null,
        openingRemarks: openingRemarks || null,
        openingDenominations: openingDenominations || null
      },
      create: {
        branchId: targetBranchId,
        businessDate: dateUtc,
        status: 'OPEN',
        terminalId: terminalId ? parseInt(terminalId) : null,
        openedById: req.user.id,
        openedAt: new Date(),
        openingCash: actualCash,
        previousClosingCash: prevCash,
        additionalCashAdded: addCash,
        cashRemovedBeforeOpening: remCash,
        expectedOpeningCash,
        actualOpeningCash: actualCash,
        openingDifference,
        openingDiscrepancyReason: openingDiscrepancyReason || null,
        openingRemarks: openingRemarks || null,
        openingDenominations: openingDenominations || null,
        adjustments: []
      },
      include: {
        openedBy: { select: { id: true, name: true, username: true } },
        branch: { select: { id: true, name: true } }
      }
    });
  });

  // Calculate and store initial expected closing cash
  const updatedDrawer = await calculateSessionCashDrawer(targetBranchId, dateStr);
  await prisma.dayClose.update({
    where: { id: dayCloseRecord.id },
    data: { closingExpectedCash: updatedDrawer.expectedClosingCash }
  });

  const branchForMsg = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { currencyCode: true, currencySymbol: true } });
  res.json({
    success: true,
    message: `Business Day ${formatDisplayDate(dateStr)} opened successfully with balance ${formatCurrency(actualCash, branchForMsg?.currencyCode || 'AED', branchForMsg?.currencySymbol)}.`,
    dayClose: {
      ...dayCloseRecord,
      closingExpectedCash: updatedDrawer.expectedClosingCash
    }
  });
});

/**
 * @desc Edit opening amount while session is OPEN with mandatory reason and audit trail
 * @route POST /api/day-close/edit-opening
 * @access Private (Authorized users)
 */
const editOpeningAmount = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    businessDate: inputDateStr,
    actualOpeningCash: inputCorrectedCash,
    reason
  } = req.body;

  if (inputCorrectedCash === undefined || inputCorrectedCash === null || isNaN(inputCorrectedCash)) {
    res.status(400);
    throw new Error('A valid numeric opening cash amount is required.');
  }

  const correctedCash = parseFloat(inputCorrectedCash);
  if (correctedCash < 0) {
    res.status(400);
    throw new Error('Opening cash amount cannot be negative.');
  }

  if (!reason || !reason.trim()) {
    res.status(400);
    throw new Error('A mandatory reason is required to edit the opening amount.');
  }

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (!existing) {
    res.status(404);
    throw new Error(`Business date ${formatDisplayDate(dateStr)} has not been opened yet.`);
  }

  if (existing.status === 'CLOSED' || existing.status === 'ADMIN_CLOSED') {
    res.status(400);
    throw new Error('This business day is already closed. Please use the post-closing adjustment workflow.');
  }

  const prevCash = Number(existing.previousClosingCash || 0);
  const addCash = Number(existing.additionalCashAdded || 0);
  const remCash = Number(existing.cashRemovedBeforeOpening || 0);
  const expectedOpeningCash = Number((prevCash + addCash - remCash).toFixed(2));
  const newOpeningDifference = Number((correctedCash - expectedOpeningCash).toFixed(2));
  const oldActualOpeningCash = Number(existing.actualOpeningCash ?? existing.openingCash ?? 0);

  // Build audit trail entry
  const auditEntry = {
    id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    type: 'OPENING_AMOUNT_EDIT',
    field: 'actualOpeningCash',
    oldValue: oldActualOpeningCash,
    newValue: correctedCash,
    expectedValue: expectedOpeningCash,
    difference: newOpeningDifference,
    reason: reason.trim(),
    userId: req.user.id,
    userName: req.user.name || req.user.username,
    userRole: req.user.role,
    timestamp: new Date().toISOString()
  };

  const existingAdjustments = Array.isArray(existing.adjustments) ? existing.adjustments : [];
  existingAdjustments.push(auditEntry);

  const updatedRecord = await prisma.$transaction(async (tx) => {
    return await tx.dayClose.update({
      where: { id: existing.id },
      data: {
        openingCash: correctedCash,
        actualOpeningCash: correctedCash,
        openingDifference: newOpeningDifference,
        openingDiscrepancyReason: newOpeningDifference !== 0 ? reason.trim() : existing.openingDiscrepancyReason,
        adjustments: existingAdjustments
      },
      include: {
        openedBy: { select: { id: true, name: true, username: true } },
        branch: { select: { id: true, name: true } }
      }
    });
  });

  // Recalculate cash drawer and update dependent expected closing cash
  const updatedDrawer = await calculateSessionCashDrawer(targetBranchId, dateStr);
  await prisma.dayClose.update({
    where: { id: updatedRecord.id },
    data: {
      closingExpectedCash: updatedDrawer.expectedClosingCash,
      cashDifference: updatedRecord.physicalCash !== null
        ? Number((Number(updatedRecord.physicalCash) - updatedDrawer.expectedClosingCash).toFixed(2))
        : null
    }
  });

  const branchForMsg = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { currencyCode: true, currencySymbol: true } });
  res.json({
    success: true,
    message: `Opening amount successfully updated to ${formatCurrency(correctedCash, branchForMsg?.currencyCode || 'AED', branchForMsg?.currencySymbol)}.`,
    dayClose: {
      ...updatedRecord,
      closingExpectedCash: updatedDrawer.expectedClosingCash,
      cashDifference: updatedRecord.physicalCash !== null
        ? Number((Number(updatedRecord.physicalCash) - updatedDrawer.expectedClosingCash).toFixed(2))
        : null
    },
    auditEntry
  });
});

/**
 * @desc Edit physical closing cash count before final closure with mandatory reason
 * @route POST /api/day-close/edit-closing-cash
 * @access Private (Authorized users)
 */
const editClosingCash = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    businessDate: inputDateStr,
    physicalCash: inputPhysicalCash,
    closingDenominations,
    notes,
    reason
  } = req.body;

  if (inputPhysicalCash === undefined || inputPhysicalCash === null || isNaN(inputPhysicalCash)) {
    res.status(400);
    throw new Error('A valid numeric physical cash amount is required.');
  }

  const physicalCash = parseFloat(inputPhysicalCash);
  if (physicalCash < 0) {
    res.status(400);
    throw new Error('Physical cash count cannot be negative.');
  }

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (!existing) {
    res.status(404);
    throw new Error(`Business date ${formatDisplayDate(dateStr)} has not been opened yet.`);
  }

  if (existing.status === 'CLOSED' || existing.status === 'ADMIN_CLOSED') {
    res.status(400);
    throw new Error('This business day is already closed. Please use the post-closing adjustment workflow.');
  }

  // Recalculate authoritative expected closing cash from transactions
  const drawer = await calculateSessionCashDrawer(targetBranchId, dateStr);
  const expectedClosingCash = drawer.expectedClosingCash;
  const cashDifference = Number((physicalCash - expectedClosingCash).toFixed(2));

  const oldPhysicalCash = existing.physicalCash !== null ? Number(existing.physicalCash) : null;

  // Build audit trail entry if changing an existing count
  const existingAdjustments = Array.isArray(existing.adjustments) ? existing.adjustments : [];
  let auditEntry = null;

  if (oldPhysicalCash !== null && Math.abs(oldPhysicalCash - physicalCash) > 0.01) {
    if (!reason || !reason.trim()) {
      res.status(400);
      throw new Error('A mandatory reason is required to correct an existing physical cash count.');
    }
    auditEntry = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'CLOSING_CASH_EDIT',
      field: 'physicalCash',
      oldValue: oldPhysicalCash,
      newValue: physicalCash,
      expectedClosingCash,
      cashDifference,
      reason: reason.trim(),
      userId: req.user.id,
      userName: req.user.name || req.user.username,
      userRole: req.user.role,
      timestamp: new Date().toISOString()
    };
    existingAdjustments.push(auditEntry);
  }

  const updatedRecord = await prisma.$transaction(async (tx) => {
    return await tx.dayClose.update({
      where: { id: existing.id },
      data: {
        closingExpectedCash: expectedClosingCash,
        physicalCash,
        cashDifference,
        closingDenominations: closingDenominations !== undefined ? closingDenominations : existing.closingDenominations,
        notes: notes !== undefined ? notes : existing.notes,
        adjustments: existingAdjustments
      },
      include: {
        openedBy: { select: { id: true, name: true, username: true } },
        branch: { select: { id: true, name: true } }
      }
    });
  });

  const branchForMsg = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { currencyCode: true, currencySymbol: true } });
  res.json({
    success: true,
    message: `Physical cash count updated to ${formatCurrency(physicalCash, branchForMsg?.currencyCode || 'AED', branchForMsg?.currencySymbol)}. Difference: ${formatCurrency(cashDifference, branchForMsg?.currencyCode || 'AED', branchForMsg?.currencySymbol)}.`,
    dayClose: updatedRecord,
    auditEntry
  });
});

/**
 * @desc Post-Closing Adjustment or Reopening workflow for closed days (Admin only)
 * @route POST /api/day-close/post-close-adjust
 * @access Private (Admin only)
 */
const postCloseAdjust = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only administrators can perform post-closing adjustments or reopen a closed day.');
  }

  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    businessDate: inputDateStr,
    action, // 'REOPEN', 'ADJUST_AMOUNTS', 'RECONCILE_PRIOR_DAY'
    reason,
    correctedOpeningCash,
    correctedClosingCash
  } = req.body;

  if (!reason || !reason.trim()) {
    res.status(400);
    throw new Error('A detailed reason is required for any post-closing adjustment or reopening.');
  }

  const dateStr = inputDateStr;
  if (!dateStr) {
    res.status(400);
    throw new Error('Business date is required.');
  }

  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (!existing) {
    res.status(404);
    throw new Error(`Business session for date ${formatDisplayDate(dateStr)} does not exist.`);
  }

  const existingAdjustments = Array.isArray(existing.adjustments) ? existing.adjustments : [];

  if (action === 'REOPEN') {
    // Reopen business day
    const auditEntry = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'DAY_REOPENED',
      previousStatus: existing.status,
      closedAt: existing.finalizedAt,
      closedById: existing.finalizedById,
      reason: reason.trim(),
      userId: req.user.id,
      userName: req.user.name || req.user.username,
      userRole: req.user.role,
      timestamp: new Date().toISOString()
    };
    existingAdjustments.push(auditEntry);

    const updated = await prisma.dayClose.update({
      where: { id: existing.id },
      data: {
        status: 'OPEN',
        finalizedAt: null,
        finalizedById: null,
        adjustments: existingAdjustments
      }
    });

    return res.json({
      success: true,
      message: `Business day ${formatDisplayDate(dateStr)} has been reopened.`,
      dayClose: updated,
      auditEntry
    });
  }

  if (action === 'ADJUST_AMOUNTS') {
    const oldOpening = Number(existing.actualOpeningCash ?? existing.openingCash ?? 0);
    const oldClosing = existing.physicalCash !== null ? Number(existing.physicalCash) : null;

    const newOpening = correctedOpeningCash !== undefined && correctedOpeningCash !== null
      ? parseFloat(correctedOpeningCash)
      : oldOpening;

    const newClosing = correctedClosingCash !== undefined && correctedClosingCash !== null
      ? parseFloat(correctedClosingCash)
      : oldClosing;

    // Recalculate expected closing balance
    const drawer = await calculateSessionCashDrawer(targetBranchId, dateStr);
    const expectedClosingCash = Number((newOpening + drawer.totalCashReceived - drawer.totalCashPaid + drawer.transfersIn - drawer.transfersOut).toFixed(2));
    const cashDifference = newClosing !== null ? Number((newClosing - expectedClosingCash).toFixed(2)) : null;

    const auditEntry = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'POST_CLOSE_ADJUSTMENT',
      oldOpeningCash: oldOpening,
      newOpeningCash: newOpening,
      oldPhysicalCash: oldClosing,
      newPhysicalCash: newClosing,
      expectedClosingCash,
      cashDifference,
      reason: reason.trim(),
      userId: req.user.id,
      userName: req.user.name || req.user.username,
      userRole: req.user.role,
      timestamp: new Date().toISOString()
    };
    existingAdjustments.push(auditEntry);

    const updated = await prisma.dayClose.update({
      where: { id: existing.id },
      data: {
        openingCash: newOpening,
        actualOpeningCash: newOpening,
        physicalCash: newClosing,
        closingExpectedCash: expectedClosingCash,
        cashDifference,
        adjustments: existingAdjustments
      }
    });

    return res.json({
      success: true,
      message: `Post-closing adjustments applied for ${formatDisplayDate(dateStr)}.`,
      dayClose: updated,
      auditEntry
    });
  }

  if (action === 'RECONCILE_PRIOR_DAY') {
    // Controlled reconciliation when prior day closing was adjusted after this day opened
    const prevSession = await findPreviousClosedSession(targetBranchId, dateUtc, existing.terminalId);
    if (!prevSession.exists || prevSession.closingCash === null) {
      res.status(400);
      throw new Error('No prior closed session found to reconcile against.');
    }

    const currentPriorClose = prevSession.closingCash;
    const oldRecordedPriorClose = Number(existing.previousClosingCash || 0);

    const auditEntry = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'PRIOR_DAY_RECONCILIATION',
      priorBusinessDate: prevSession.businessDateStr,
      oldRecordedPreviousClose: oldRecordedPriorClose,
      currentActualPreviousClose: currentPriorClose,
      variance: Number((currentPriorClose - oldRecordedPriorClose).toFixed(2)),
      reason: reason.trim(),
      userId: req.user.id,
      userName: req.user.name || req.user.username,
      userRole: req.user.role,
      timestamp: new Date().toISOString()
    };
    existingAdjustments.push(auditEntry);

    const updated = await prisma.dayClose.update({
      where: { id: existing.id },
      data: {
        previousClosingCash: currentPriorClose,
        adjustments: existingAdjustments
      }
    });

    return res.json({
      success: true,
      message: `Prior day adjustment reconciled for ${formatDisplayDate(dateStr)}.`,
      dayClose: updated,
      auditEntry
    });
  }

  res.status(400);
  throw new Error(`Invalid action "${action}". Allowed: REOPEN, ADJUST_AMOUNTS, RECONCILE_PRIOR_DAY.`);
});

/**
 * @desc Historical Opening and Closing Report for a specific business date
 * @route GET /api/day-close/session-report
 * @access Private
 */
const getSessionReport = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = req.query.date || activeDateInfo.dateStr;

  const branch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
    select: { id: true, name: true, currencyCode: true, currencySymbol: true }
  });

  const drawer = await calculateSessionCashDrawer(targetBranchId, dateStr);

  res.json({
    success: true,
    branchId: targetBranchId,
    branchName: branch?.name || 'Branch',
    currencySymbol: branch?.currencySymbol || getCurrencySymbol(branch?.currencyCode),
    currencyCode: branch?.currencyCode || 'AED',
    businessDate: dateStr,
    businessDateDisplay: formatDisplayDate(dateStr),
    report: drawer
  });
});

/**
 * @desc Get real-time daily activity verification data across all 8 required domains
 * @route GET /api/day-close/verification-data
 * @access Private
 */
const getVerificationData = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const branch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
    select: { id: true, name: true, currencyCode: true, currencySymbol: true }
  });

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = req.query.date || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const startUtc = parseBusinessDateStart(dateStr);
  const endUtc = parseBusinessDateEnd(dateStr);

  // 1. Fetch DayClose record
  const dayCloseRecord = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    include: {
      openedBy: { select: { id: true, name: true, username: true } },
      openingApprovedBy: { select: { id: true, name: true, username: true } },
      finalizedBy: { select: { id: true, name: true, username: true } }
    }
  });

  // 2. Compute authoritative Cash Drawer movements
  const drawer = await calculateSessionCashDrawer(targetBranchId, dateStr);

  // 3. Fetch all sales for this branch and date
  const sales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: {
        gte: startUtc,
        lte: endUtc
      }
    },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, barcode: true } }
        }
      },
      customer: { select: { id: true, name: true, phone: true } },
      payments: true,
      salesman: { select: { id: true, name: true, username: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Separate valid sales, cancelled sales, returns
  const completedSales = sales.filter(s => s.status !== 'cancelled' && !s.isReturn);
  const cancelledSales = sales.filter(s => s.status === 'cancelled');
  const returnSales = sales.filter(s => s.isReturn && s.status !== 'cancelled');

  // Section A: Sales & Invoices
  const totalInvoicesCreated = sales.length;
  const postedInvoices = completedSales.length;
  const paidInvoices = completedSales.filter(s => Number(s.balanceAmount) <= 0.01).length;
  const partiallyPaidInvoices = completedSales.filter(s => Number(s.balanceAmount) > 0.01 && Number(s.paidAmount) > 0).length;
  const unpaidInvoices = completedSales.filter(s => Number(s.paidAmount) <= 0.01).length;
  const cancelledInvoicesCount = cancelledSales.length;

  const grossSalesTotal = completedSales.reduce((sum, s) => sum + Number(s.subTotal || 0), 0);
  const invoiceDiscountTotal = completedSales.reduce((sum, s) => sum + (Number(s.discount || 0) + Number(s.voucherDiscount || 0)), 0);
  const taxTotal = completedSales.reduce((sum, s) => sum + Number(s.taxAmount || 0), 0);
  const netSalesTotal = completedSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

  const salesReturnTotal = returnSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
  const salesReturnQty = returnSales.reduce((sum, s) => sum + s.items.reduce((iSum, it) => iSum + it.quantity, 0), 0);

  // Section B: Payments
  const paymentBreakdown = {
    Cash: 0,
    UPI: 0,
    Card: 0,
    'Bank Transfer': 0,
    Other: 0
  };

  let totalCreditSales = 0;
  let totalOutstanding = 0;

  completedSales.forEach(s => {
    totalCreditSales += Number(s.balanceAmount || 0);
    totalOutstanding += Number(s.balanceAmount || 0);

    if (s.payments && s.payments.length > 0) {
      s.payments.forEach(p => {
        const method = p.method || 'Cash';
        if (paymentBreakdown[method] !== undefined) {
          paymentBreakdown[method] += Number(p.amount || 0);
        } else {
          paymentBreakdown.Other += Number(p.amount || 0);
        }
      });
    } else {
      const method = s.paymentMethod || 'Cash';
      const paid = Number(s.paidAmount || s.totalAmount || 0);
      if (paymentBreakdown[method] !== undefined) {
        paymentBreakdown[method] += paid;
      } else {
        paymentBreakdown.Other += paid;
      }
    }
  });

  // Section D: Inventory & Stock Balance
  let totalUnitsSold = 0;
  completedSales.forEach(s => {
    s.items.forEach(it => {
      totalUnitsSold += it.quantity;
    });
  });

  // Check for negative stock warnings in this branch
  const negativeStockItems = await prisma.productStock.findMany({
    where: {
      branchId: targetBranchId,
      quantity: { lt: 0 }
    },
    include: {
      product: { select: { id: true, name: true, barcode: true } }
    }
  });

  const hasNegativeStock = negativeStockItems.length > 0;

  // Section E: Returns & Refunds
  const returnsList = returnSales.map(r => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    originalInvoice: r.originalInvoice,
    amount: Number(r.totalAmount),
    reason: r.returnReason || 'Product Return',
    paymentMethod: r.paymentMethod || 'Cash',
    customer: r.customer?.name || 'Walk-in',
    itemsCount: r.items.length,
    createdAt: r.createdAt
  }));

  const cancelledList = cancelledSales.map(c => ({
    id: c.id,
    invoiceNumber: c.invoiceNumber,
    amount: Number(c.totalAmount),
    cancelledAt: c.cancelledAt || c.updatedAt,
    cancelledBy: c.cancelledBy || 'User',
    cancelReason: c.cancelReason || 'Cancelled by staff'
  }));

  // Section F: GST & Tax Verification
  const gstBreakdown = {
    taxableSales: Number((netSalesTotal - taxTotal).toFixed(2)),
    cgst: Number((taxTotal / 2).toFixed(2)),
    sgst: Number((taxTotal / 2).toFixed(2)),
    igst: 0,
    totalTax: Number(taxTotal.toFixed(2))
  };

  // Section G: Expenses & Other Entries
  const expenseList = drawer.expenseList;

  // Section H: Branch & Session Verification
  const orphanTransactionsCount = sales.filter(s => s.branchId !== targetBranchId).length;

  // Saved verification checks on DayClose
  const savedChecks = dayCloseRecord?.verificationChecks || {};
  const savedExceptions = dayCloseRecord?.verificationExceptions || {};

  // Build the 8 Checklist Verification Cards
  const checklist = {
    salesInvoices: {
      key: 'salesInvoices',
      title: "Today's Sales & Invoices",
      summary: `${postedInvoices} posted invoices (${formatCurrency(netSalesTotal, branch)}), ${cancelledInvoicesCount} cancelled, ${paidInvoices} paid`,
      details: {
        totalInvoicesCreated,
        postedInvoices,
        paidInvoices,
        partiallyPaidInvoices,
        unpaidInvoices,
        cancelledInvoicesCount,
        grossSales: grossSalesTotal,
        discounts: invoiceDiscountTotal,
        netSales: netSalesTotal,
        returns: salesReturnTotal
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.salesInvoices?.reviewed),
      reviewedAt: savedChecks.salesInvoices?.verifiedAt || null,
      reviewedBy: savedChecks.salesInvoices?.verifiedBy || null,
      actionRoute: '/sales/invoices',
      actionLabel: 'View Sales & Invoices'
    },
    payments: {
      key: 'payments',
      title: 'Payment & Collection Verification',
      summary: `Cash: ${formatCurrency(paymentBreakdown.Cash, branch)} | UPI: ${formatCurrency(paymentBreakdown.UPI, branch)} | Card: ${formatCurrency(paymentBreakdown.Card, branch)}`,
      details: {
        ...paymentBreakdown,
        totalCreditSales,
        totalOutstanding
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.payments?.reviewed),
      reviewedAt: savedChecks.payments?.verifiedAt || null,
      reviewedBy: savedChecks.payments?.verifiedBy || null,
      actionRoute: '/reports/sales',
      actionLabel: 'View Payment Details'
    },
    cashbook: {
      key: 'cashbook',
      title: 'Cash & Cashbook Reconciliation',
      summary: `Opening: ${formatCurrency(drawer.openingCash, branch)} + Receipts: ${formatCurrency(drawer.totalCashReceived, branch)} - Payments: ${formatCurrency(drawer.totalCashPaid, branch)} + Transfers: ${formatCurrency(drawer.netTransfers, branch)} = Expected Closing Cash: ${formatCurrency(drawer.expectedClosingCash, branch)}`,
      details: {
        openingCash: drawer.openingCash,
        previousClosingCash: drawer.previousClosingCash,
        additionalCashAdded: drawer.additionalCashAdded,
        cashRemovedBeforeOpening: drawer.cashRemovedBeforeOpening,
        cashSalesCollections: drawer.cashSalesCollections,
        otherCashReceipts: drawer.otherCashReceipts,
        totalCashReceived: drawer.totalCashReceived,
        cashExpenses: drawer.cashExpenses,
        cashRefunds: drawer.cashRefunds,
        supplierCashPayments: drawer.supplierCashPayments,
        totalCashPaid: drawer.totalCashPaid,
        transfersIn: drawer.transfersIn,
        transfersOut: drawer.transfersOut,
        netTransfers: drawer.netTransfers,
        expectedClosingCash: drawer.expectedClosingCash,
        physicalCash: drawer.physicalCash,
        cashDifference: drawer.cashDifference
      },
      hasDiscrepancy: drawer.cashDifference !== null && Math.abs(drawer.cashDifference) > 10,
      discrepancyMessage: drawer.cashDifference !== null && Math.abs(drawer.cashDifference) > 10
        ? `Cash difference of ${formatCurrency(drawer.cashDifference, branch)} between physical count and expected balance.`
        : null,
      isReviewed: Boolean(savedChecks.cashbook?.reviewed),
      reviewedAt: savedChecks.cashbook?.verifiedAt || null,
      reviewedBy: savedChecks.cashbook?.verifiedBy || null,
      actionRoute: '/accounting/reports/cash-book',
      actionLabel: 'View Cashbook'
    },
    inventory: {
      key: 'inventory',
      title: 'Inventory & Stock Balances',
      summary: `${totalUnitsSold} units sold, ${salesReturnQty} units returned. ${hasNegativeStock ? `${negativeStockItems.length} products with negative stock!` : 'All stocks positive.'}`,
      details: {
        totalUnitsSold,
        returnedStockUnits: salesReturnQty,
        negativeStockCount: negativeStockItems.length,
        negativeStockItems: negativeStockItems.map(ns => ({
          productId: ns.productId,
          productName: ns.product?.name || 'Unknown',
          sku: ns.product?.barcode || '',
          quantity: ns.quantity
        }))
      },
      hasDiscrepancy: hasNegativeStock,
      discrepancyMessage: hasNegativeStock ? `${negativeStockItems.length} products have negative stock balance.` : null,
      isReviewed: Boolean(savedChecks.inventory?.reviewed),
      reviewedAt: savedChecks.inventory?.verifiedAt || null,
      reviewedBy: savedChecks.inventory?.verifiedBy || null,
      actionRoute: '/reports/current-stock',
      actionLabel: 'Verify Inventory'
    },
    returnsRefunds: {
      key: 'returnsRefunds',
      title: 'Sales Returns & Cancellations',
      summary: `${returnSales.length} returns (${formatCurrency(salesReturnTotal, branch)}), ${cancelledInvoicesCount} cancelled invoices`,
      details: {
        returnCount: returnSales.length,
        returnTotal: salesReturnTotal,
        cancelledCount: cancelledInvoicesCount,
        returnsList,
        cancelledList
      },
      hasDiscrepancy: false,
      discrepancyMessage: null,
      isReviewed: Boolean(savedChecks.returnsRefunds?.reviewed),
      reviewedAt: savedChecks.returnsRefunds?.verifiedAt || null,
      reviewedBy: savedChecks.returnsRefunds?.verifiedBy || null,
      actionRoute: '/sales-return',
      actionLabel: 'View Returns & Cancellations'
    }
  };

  // Determine overall readiness
  const checklistKeys = Object.keys(checklist);
  const allReviewed = checklistKeys.every(k => checklist[k].isReviewed);
  const criticalDiscrepancies = checklistKeys.filter(k => checklist[k].hasDiscrepancy && !savedExceptions[k]);

  res.json({
    success: true,
    branchId: targetBranchId,
    branchName: branch?.name || 'Branch',
    currencySymbol: branch?.currencySymbol || getCurrencySymbol(branch?.currencyCode),
    currencyCode: branch?.currencyCode || 'AED',
    branch: branch ? {
      id: branch.id,
      name: branch.name,
      currencyCode: branch.currencyCode,
      currencySymbol: branch.currencySymbol
    } : null,
    businessDate: dateStr,
    businessDateDisplay: formatDisplayDate(dateStr),
    status: dayCloseRecord?.status || 'NOT_OPENED',
    checklist,
    allReviewed,
    canClose: allReviewed && criticalDiscrepancies.length === 0,
    criticalDiscrepancies,
    savedExceptions,
    expectedClosingCash: drawer.expectedClosingCash,
    drawer
  });
});

/**
 * @desc Save progress for checklist verification items
 * @route POST /api/day-close/save-verification
 * @access Private
 */
const saveVerificationProgress = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const { businessDate: inputDateStr, checks } = req.body;

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (existing && (existing.status === 'CLOSED' || existing.status === 'ADMIN_CLOSED')) {
    res.status(400);
    throw new Error('Cannot modify verification checks on a closed business day.');
  }

  const existingChecks = existing?.verificationChecks || {};
  const updatedChecks = { ...existingChecks };

  if (checks && typeof checks === 'object') {
    Object.keys(checks).forEach(key => {
      updatedChecks[key] = {
        reviewed: Boolean(checks[key].reviewed),
        verifiedAt: new Date().toISOString(),
        verifiedBy: req.user.name || req.user.username || 'Staff',
        notes: checks[key].notes || ''
      };
    });
  }

  const updatedRecord = await prisma.dayClose.upsert({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    update: {
      verificationChecks: updatedChecks,
      status: existing?.status === 'NOT_OPENED' ? 'OPEN' : (existing?.status || 'OPEN')
    },
    create: {
      branchId: targetBranchId,
      businessDate: dateUtc,
      status: 'OPEN',
      openedById: req.user.id,
      openedAt: new Date(),
      verificationChecks: updatedChecks,
      adjustments: []
    }
  });

  res.json({
    success: true,
    message: 'Verification progress saved successfully.',
    verificationChecks: updatedRecord.verificationChecks
  });
});

/**
 * @desc Manager/Admin approval for verification exceptions
 * @route POST /api/day-close/resolve-exception
 * @access Private (Admin/Manager only)
 */
const resolveException = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only authorized managers or administrators can approve verification exceptions.');
  }

  const targetBranchId = await resolveEffectiveBranchId(req);
  const { businessDate: inputDateStr, exceptionKey, reason } = req.body;

  if (!exceptionKey || !reason?.trim()) {
    res.status(400);
    throw new Error('Exception item key and a valid explanation reason are required.');
  }

  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;
  const dateUtc = getUtcDateObj(dateStr);

  const existing = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  const existingExceptions = existing?.verificationExceptions || {};
  existingExceptions[exceptionKey] = {
    approved: true,
    reason: reason.trim(),
    approvedById: req.user.id,
    approvedByName: req.user.name || req.user.username,
    approvedAt: new Date().toISOString()
  };

  const updatedRecord = await prisma.dayClose.upsert({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    },
    update: {
      verificationExceptions: existingExceptions,
      exceptionApprovedById: req.user.id,
      exceptionApprovalReason: reason.trim()
    },
    create: {
      branchId: targetBranchId,
      businessDate: dateUtc,
      status: 'OPEN',
      verificationExceptions: existingExceptions,
      exceptionApprovedById: req.user.id,
      exceptionApprovalReason: reason.trim(),
      adjustments: []
    }
  });

  res.json({
    success: true,
    message: `Exception for "${exceptionKey}" approved successfully.`,
    verificationExceptions: updatedRecord.verificationExceptions
  });
});

/**
 * @desc Confirm and Save Day Close with mandatory verification enforcement
 * @route POST /api/day-close/confirm
 * @access Private
 */
const confirmDayClose = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const {
    businessDate: inputDateStr,
    physicalCash: inputPhysicalCash,
    closingDenominations,
    notes,
    overrideChecks
  } = req.body;

  const todayStr = getLocalDateString();
  const activeDateInfo = await getBranchActiveBusinessDate(targetBranchId);
  const dateStr = inputDateStr || activeDateInfo.dateStr;

  // Rule 1: Prevent future dates
  if (dateStr > todayStr) {
    res.status(400);
    throw new Error(`Cannot close future business date: ${formatDisplayDate(dateStr)}.`);
  }

  const dateUtc = getUtcDateObj(dateStr);

  // Rule 2: Chronological Check: Verify no earlier date before dateStr is unclosed
  const sixtyDaysAgo = new Date(dateUtc);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [pastSales, pastOpenedSessions] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId: targetBranchId,
        saleDate: { gte: sixtyDaysAgo, lt: dateUtc },
        status: { not: 'cancelled' }
      },
      select: { saleDate: true },
      orderBy: { saleDate: 'asc' }
    }),
    prisma.dayClose.findMany({
      where: {
        branchId: targetBranchId,
        businessDate: { gte: sixtyDaysAgo, lt: dateUtc },
        status: { notIn: ['CLOSED', 'ADMIN_CLOSED'] }
      },
      select: { businessDate: true },
      orderBy: { businessDate: 'asc' }
    })
  ]);

  const distinctPastDates = Array.from(new Set([
    ...pastSales.map(s => getLocalDateString(s.saleDate)),
    ...pastOpenedSessions.map(o => getLocalDateString(o.businessDate))
  ])).sort((a, b) => a.localeCompare(b));

  for (const pDateStr of distinctPastDates) {
    const pUtc = getUtcDateObj(pDateStr);
    const existing = await prisma.dayClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: pUtc
        }
      }
    });

    if (!existing || (existing.status !== 'CLOSED' && existing.status !== 'ADMIN_CLOSED')) {
      res.status(400);
      throw new Error(`Day Close Pending! You have not closed the business date ${formatDisplayDate(pDateStr)}. Please complete the pending Day Close before proceeding to a later date.`);
    }
  }

  // Rule 3: Check if already closed
  const existingRecord = await prisma.dayClose.findUnique({
    where: {
      branchId_businessDate: {
        branchId: targetBranchId,
        businessDate: dateUtc
      }
    }
  });

  if (existingRecord && (existingRecord.status === 'CLOSED' || existingRecord.status === 'ADMIN_CLOSED')) {
    res.status(400);
    throw new Error(`Day Close for ${formatDisplayDate(dateStr)} has already been completed.`);
  }

  // Rule 4: Mandatory Verification Check
  const requiredKeys = ['salesInvoices', 'payments', 'cashbook', 'inventory', 'returnsRefunds'];
  const savedChecks = existingRecord?.verificationChecks || {};
  const savedExceptions = existingRecord?.verificationExceptions || {};

  const missingChecks = requiredKeys.filter(k => !savedChecks[k]?.reviewed);
  if (missingChecks.length > 0 && !overrideChecks) {
    res.status(400);
    throw new Error(`Cannot close day: Mandatory verification checklist is incomplete. Missing: ${missingChecks.join(', ')}.`);
  }

  // Check negative inventory exception
  const negativeStocks = await prisma.productStock.count({
    where: { branchId: targetBranchId, quantity: { lt: 0 } }
  });

  if (negativeStocks > 0 && !savedExceptions.inventory) {
    res.status(400);
    throw new Error(`Cannot close day: ${negativeStocks} inventory items have negative stock. A manager must approve this exception.`);
  }

  // Authoritative financial calculations
  const drawer = await calculateSessionCashDrawer(targetBranchId, dateStr);
  const expectedClosingCash = drawer.expectedClosingCash;
  const closingExpectedCash = expectedClosingCash;

  // Actual Physical Cash Counted validation: never silently default to expectedClosingCash
  let physicalCash = null;
  if (inputPhysicalCash !== undefined && inputPhysicalCash !== null && inputPhysicalCash !== '') {
    physicalCash = parseFloat(inputPhysicalCash);
  } else if (existingRecord?.physicalCash !== null && existingRecord?.physicalCash !== undefined) {
    physicalCash = Number(existingRecord.physicalCash);
  }

  if (physicalCash === null || isNaN(physicalCash) || physicalCash < 0) {
    res.status(400);
    throw new Error('Actual physical cash counted is mandatory and must be a valid non-negative number to finalize Day Close.');
  }

  const cashDifference = Number((physicalCash - expectedClosingCash).toFixed(2));

  // If cash difference is significant (> 10) and no note / manager approval, warn
  if (Math.abs(cashDifference) > 10 && !notes?.trim() && !savedExceptions.cashbook) {
    const branchForDiff = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { currencyCode: true, currencySymbol: true } });
    res.status(400);
    throw new Error(`Cash difference of ${formatCurrency(cashDifference, branchForDiff?.currencyCode || 'AED', branchForDiff?.currencySymbol)} requires an explanation note or manager approval before closing.`);
  }

  const startUtc = parseBusinessDateStart(dateStr);
  const endUtc = parseBusinessDateEnd(dateStr);

  const sales = await prisma.sale.findMany({
    where: { branchId: targetBranchId, saleDate: { gte: startUtc, lte: endUtc } },
    include: { items: true, payments: true }
  });

  const completedSales = sales.filter(s => s.status !== 'cancelled' && !s.isReturn);
  const returnSales = sales.filter(s => s.isReturn && s.status !== 'cancelled');
  const cancelledSales = sales.filter(s => s.status === 'cancelled');

  const salesSummary = {
    totalInvoices: completedSales.length,
    cancelledInvoices: cancelledSales.length,
    returnsCount: returnSales.length,
    grossSales: completedSales.reduce((sum, s) => sum + Number(s.subTotal || 0), 0),
    totalDiscounts: completedSales.reduce((sum, s) => sum + Number(s.discount || 0) + Number(s.voucherDiscount || 0), 0),
    taxTotal: completedSales.reduce((sum, s) => sum + Number(s.taxAmount || 0), 0),
    netSales: completedSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
    cashCollections: drawer.cashSalesCollections,
    otherCashReceipts: drawer.otherCashReceipts,
    totalCashReceived: drawer.totalCashReceived,
    totalExpenses: drawer.cashExpenses,
    cashRefunds: drawer.cashRefunds,
    supplierCashPayments: drawer.supplierCashPayments,
    totalCashPaid: drawer.totalCashPaid,
    transfersIn: drawer.transfersIn,
    transfersOut: drawer.transfersOut,
    netTransfers: drawer.netTransfers,
    openingCash: drawer.openingCash,
    expectedClosingCash,
    physicalCash,
    cashDifference
  };

  // Save Day Close record as CLOSED in an atomic transaction and handle Cash Over/Short accounting
  const dayCloseRecord = await prisma.$transaction(async (tx) => {
    const closedRecord = await tx.dayClose.upsert({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: dateUtc
        }
      },
      update: {
        status: 'CLOSED',
        closingExpectedCash,
        physicalCash,
        cashDifference,
        closingDenominations: closingDenominations || existingRecord?.closingDenominations || null,
        salesSummary,
        notes: notes || existingRecord?.notes || null,
        finalizedById: req.user.id,
        finalizedAt: new Date()
      },
      create: {
        branchId: targetBranchId,
        businessDate: dateUtc,
        status: 'CLOSED',
        openingCash: drawer.openingCash,
        actualOpeningCash: drawer.openingCash,
        previousClosingCash: drawer.previousClosingCash || 0,
        expectedOpeningCash: drawer.expectedOpeningCash || 0,
        closingExpectedCash,
        physicalCash,
        cashDifference,
        closingDenominations: closingDenominations || null,
        salesSummary,
        notes: notes || null,
        finalizedById: req.user.id,
        finalizedAt: new Date(),
        adjustments: []
      },
      include: {
        finalizedBy: { select: { id: true, name: true, username: true } },
        branch: { select: { id: true, name: true } }
      }
    });

    // Accounting Integration: Post Cash Over/Short Journal Voucher if discrepancy exists and not already posted
    if (Math.abs(cashDifference) > 0.01) {
      const voucherRef = `DAYCLOSE-${targetBranchId}-${dateStr}`;
      const existingVoucher = await tx.voucher.findFirst({
        where: { reference: voucherRef, branchId: targetBranchId }
      });

      if (!existingVoucher) {
        const isOverage = cashDifference > 0;
        const diffAbs = Math.abs(cashDifference);
        const cashLedger = await ensureLedger(tx, 'Cash', 'Cash-in-Hand');
        const overShortLedger = await ensureLedger(
          tx,
          'Cash Over/Short',
          isOverage ? 'Indirect Incomes' : 'Indirect Expenses'
        );

        const entries = isOverage
          ? [
              { ledgerId: cashLedger.id, type: 'DEBIT', amount: diffAbs },
              { ledgerId: overShortLedger.id, type: 'CREDIT', amount: diffAbs }
            ]
          : [
              { ledgerId: overShortLedger.id, type: 'DEBIT', amount: diffAbs },
              { ledgerId: cashLedger.id, type: 'CREDIT', amount: diffAbs }
            ];

        await postVoucher(tx, {
          type: 'JOURNAL',
          date: dateUtc,
          amount: diffAbs,
          narration: `Day Close ${formatDisplayDate(dateStr)}: Cash ${isOverage ? 'Overage' : 'Shortage'} discrepancy adjustment. ${notes ? `Notes: ${notes}` : ''}`.trim(),
          reference: voucherRef,
          createdBy: req.user.id,
          branchId: targetBranchId
        }, entries);
      }
    }

    return closedRecord;
  });

  const branchForMsg = await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { currencyCode: true, currencySymbol: true } });
  res.json({
    success: true,
    message: `Day Close for ${formatDisplayDate(dateStr)} saved successfully with final closing cash ${formatCurrency(physicalCash, branchForMsg?.currencyCode || 'AED', branchForMsg?.currencySymbol)}.`,
    dayClose: dayCloseRecord
  });
});

/**
 * @desc Find all unclosed business days for authorized user
 * @route GET /api/day-close/open-days
 * @access Private
 */
const findOpenDays = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const { fromDate, toDate, status } = req.query;

  const todayStr = getLocalDateString();
  const todayUtc = getUtcDateObj(todayStr);

  const sixtyDaysAgo = new Date(todayUtc);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const startUtc = fromDate ? getUtcDateObj(fromDate) : sixtyDaysAgo;
  const endUtc = toDate ? getUtcDateObj(toDate) : todayUtc;

  // 1. Find all sales within the range to find dates with activity
  const sales = await prisma.sale.findMany({
    where: {
      branchId: targetBranchId,
      saleDate: {
        gte: startUtc,
        lte: endUtc
      },
      status: { not: 'cancelled' }
    },
    select: {
      saleDate: true,
      totalAmount: true,
      paidAmount: true,
      paymentMethod: true,
      salesmanId: true
    }
  });

  // Group sales by business date string
  const salesByDate = {};
  sales.forEach(s => {
    const dStr = getLocalDateString(s.saleDate);
    if (!salesByDate[dStr]) {
      salesByDate[dStr] = {
        salesCount: 0,
        totalSales: 0,
        cashCollections: 0
      };
    }
    salesByDate[dStr].salesCount += 1;
    salesByDate[dStr].totalSales += Number(s.totalAmount || 0);
    if ((s.paymentMethod || 'Cash').toLowerCase() === 'cash') {
      salesByDate[dStr].cashCollections += Number(s.paidAmount || s.totalAmount || 0);
    }
  });

  // 2. Find DayClose records for these dates
  const dayCloseRecords = await prisma.dayClose.findMany({
    where: {
      branchId: targetBranchId,
      businessDate: {
        gte: startUtc,
        lte: endUtc
      }
    },
    include: {
      branch: { select: { id: true, name: true, currencyCode: true, currencySymbol: true } },
      openedBy: { select: { id: true, name: true, username: true } },
      terminal: { select: { id: true, name: true } }
    }
  });

  const dayCloseByDate = {};
  dayCloseRecords.forEach(dc => {
    const dStr = getLocalDateString(dc.businessDate);
    dayCloseByDate[dStr] = dc;
  });

  // Also fetch target branch details for fallback
  const targetBranch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
    select: { id: true, name: true, currencyCode: true, currencySymbol: true }
  });

  // Combine all distinct dates
  const allDistinctDates = Array.from(new Set([
    ...Object.keys(salesByDate),
    ...Object.keys(dayCloseByDate),
    todayStr
  ])).sort((a, b) => b.localeCompare(a)); // Descending order

  const openDaysList = [];

  for (const dStr of allDistinctDates) {
    const dc = dayCloseByDate[dStr];
    const sInfo = salesByDate[dStr] || { salesCount: 0, totalSales: 0, cashCollections: 0 };

    const isClosed = dc && (dc.status === 'CLOSED' || dc.status === 'ADMIN_CLOSED');
    if (isClosed) continue; // Skip closed days

    let sessionStatus = 'NOT_OPENED';
    if (dc?.status === 'OPEN') sessionStatus = 'OPEN';
    else if (dc?.status === 'CLOSING_PENDING') sessionStatus = 'CLOSING_PENDING';
    else if (sInfo.salesCount > 0) sessionStatus = 'CLOSING_PENDING';

    if (status && status !== 'all' && sessionStatus !== status) {
      continue;
    }

    const openingCash = Number(dc?.actualOpeningCash || dc?.openingCash || 0);
    const expectedCash = Number((openingCash + sInfo.cashCollections).toFixed(2));
    const effectiveBranch = dc?.branch || targetBranch;

    openDaysList.push({
      businessDate: dStr,
      businessDateDisplay: formatDisplayDate(dStr),
      branchId: targetBranchId,
      branchName: effectiveBranch?.name || 'Main Branch',
      currencyCode: effectiveBranch?.currencyCode || 'AED',
      currencySymbol: effectiveBranch?.currencySymbol || getCurrencySymbol(effectiveBranch?.currencyCode),
      branch: effectiveBranch ? {
        id: effectiveBranch.id,
        name: effectiveBranch.name,
        currencyCode: effectiveBranch.currencyCode,
        currencySymbol: effectiveBranch.currencySymbol
      } : null,
      cashier: dc?.openedBy ? (dc.openedBy.name || dc.openedBy.username) : 'Unassigned',
      register: dc?.terminal?.name || 'Default Register',
      openingTime: dc?.openedAt || null,
      openingCash,
      salesCount: sInfo.salesCount,
      totalSales: sInfo.totalSales,
      cashCollections: sInfo.cashCollections,
      expectedCash,
      currentStatus: sessionStatus,
      isPendingClosure: dStr < todayStr && (sInfo.salesCount > 0 || dc?.status === 'OPEN'),
      action: sessionStatus === 'NOT_OPENED' ? 'Open Day' : 'Resume Closing'
    });
  }

  res.json({
    success: true,
    total: openDaysList.length,
    openDays: openDaysList
  });
});

/**
 * @desc Global check for unclosed day close warning (for layout banner)
 * @route GET /api/day-close/check-unclosed
 * @access Private
 */
const checkUnclosed = asyncHandler(async (req, res) => {
  let targetBranchId;
  try {
    targetBranchId = await resolveEffectiveBranchId(req);
  } catch (e) {
    return res.json({ hasUnclosed: false, unclosedDate: null });
  }

  const todayStr = getLocalDateString();
  const todayUtc = getUtcDateObj(todayStr);

  const sixtyDaysAgo = new Date(todayUtc);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [pastSales, pastOpenedSessions] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId: targetBranchId,
        saleDate: { gte: sixtyDaysAgo, lt: todayUtc },
        status: { not: 'cancelled' }
      },
      select: { saleDate: true },
      orderBy: { saleDate: 'asc' }
    }),
    prisma.dayClose.findMany({
      where: {
        branchId: targetBranchId,
        businessDate: { gte: sixtyDaysAgo, lt: todayUtc },
        status: { notIn: ['CLOSED', 'ADMIN_CLOSED'] }
      },
      select: { businessDate: true },
      orderBy: { businessDate: 'asc' }
    })
  ]);

  const distinctPastDates = Array.from(new Set([
    ...pastSales.map(s => getLocalDateString(s.saleDate)),
    ...pastOpenedSessions.map(o => getLocalDateString(o.businessDate))
  ])).sort((a, b) => a.localeCompare(b));

  for (const pDateStr of distinctPastDates) {
    const pUtc = getUtcDateObj(pDateStr);
    const existing = await prisma.dayClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: targetBranchId,
          businessDate: pUtc
        }
      }
    });

    if (!existing || (existing.status !== 'CLOSED' && existing.status !== 'ADMIN_CLOSED')) {
      return res.json({
        hasUnclosed: true,
        unclosedDate: pDateStr,
        unclosedDateDisplay: formatDisplayDate(pDateStr),
        message: `Day Close Pending! You have not closed the business date ${formatDisplayDate(pDateStr)}. Please complete the pending Day Close before proceeding to a later date.`
      });
    }
  }

  res.json({ hasUnclosed: false, unclosedDate: null });
});

/**
 * @desc Get Day Close History
 * @route GET /api/day-close/history
 * @access Private
 */
const getDayCloseHistory = asyncHandler(async (req, res) => {
  const targetBranchId = await resolveEffectiveBranchId(req);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const where = {};
  if (targetBranchId) where.branchId = targetBranchId;

  const [total, records] = await Promise.all([
    prisma.dayClose.count({ where }),
    prisma.dayClose.findMany({
      where,
      include: {
        openedBy: { select: { id: true, name: true, username: true } },
        finalizedBy: { select: { id: true, name: true, username: true } },
        openingApprovedBy: { select: { id: true, name: true, username: true } },
        branch: { select: { id: true, name: true } },
        terminal: { select: { id: true, name: true } }
      },
      orderBy: { businessDate: 'desc' },
      skip,
      take: limit
    })
  ]);

  res.json({
    success: true,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    records
  });
});

module.exports = {
  getDayCloseStatus,
  openDay,
  editOpeningAmount,
  editClosingCash,
  postCloseAdjust,
  getSessionReport,
  getVerificationData,
  saveVerificationProgress,
  resolveException,
  confirmDayClose,
  findOpenDays,
  checkUnclosed,
  getDayCloseHistory
};
