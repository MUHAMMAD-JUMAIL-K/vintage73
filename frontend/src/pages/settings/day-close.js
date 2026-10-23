import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import {
  FiCalendar, FiCheckCircle, FiAlertTriangle, FiLock, FiClock, FiRefreshCw,
  FiDollarSign, FiShoppingBag, FiLayers, FiBox, FiFileText, FiEye, FiList,
  FiX, FiCheck, FiArrowRight, FiShield, FiSliders, FiCreditCard, FiSearch,
  FiChevronRight, FiEdit, FiTrendingUp, FiBookOpen
} from 'react-icons/fi';
import { useRouter } from 'next/router';
import { formatCurrency, extractCurrencyMeta } from '@/lib/currency';

const formatDisplayFromIso = (isoStr) => {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
};

export default function DayClosePage() {
  const router = useRouter();

  // Session & Status States
  const [statusData, setStatusData] = useState(null);
  const [verificationData, setVerificationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifLoading, setVerifLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Day Opening Modal State
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingActualCash, setOpeningActualCash] = useState('');
  const [openingAddCash, setOpeningAddCash] = useState('0');
  const [openingRemCash, setOpeningRemCash] = useState('0');
  const [openingReason, setOpeningReason] = useState('');
  const [openingRemarks, setOpeningRemarks] = useState('');

  // Day Closing States
  const [physicalCash, setPhysicalCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Find Open Days Drawer / Modal
  const [showOpenDaysModal, setShowOpenDaysModal] = useState(false);
  const [openDaysList, setOpenDaysList] = useState([]);
  const [openDaysLoading, setOpenDaysLoading] = useState(false);
  const [openDaysFilter, setOpenDaysFilter] = useState({ fromDate: '', toDate: '', status: 'all' });

  // Detail Inspector Modal for Verification Items
  const [inspectingItem, setInspectingItem] = useState(null);

  // Exception Approval Modal (Manager / Admin)
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [selectedExceptionKey, setSelectedExceptionKey] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [approvingException, setApprovingException] = useState(false);

  // User info from localStorage
  const [currentUser, setCurrentUser] = useState(null);

  // Edit Opening Amount Modal State
  const [showEditOpenModal, setShowEditOpenModal] = useState(false);
  const [editOpeningVal, setEditOpeningVal] = useState('');
  const [editOpeningReason, setEditOpeningReason] = useState('');
  const [savingEditOpen, setSavingEditOpen] = useState(false);

  // Edit Closing Cash Count State
  const [savingEditClose, setSavingEditClose] = useState(false);

  // Prior Day Discrepancy Reconciliation Modal
  const [showPriorReconcileModal, setShowPriorReconcileModal] = useState(false);
  const [priorReconcileReason, setPriorReconcileReason] = useState('');
  const [savingPriorReconcile, setSavingPriorReconcile] = useState(false);

  // Post-Closing Adjustment & Reopening Modal (Admin only)
  const [showPostCloseModal, setShowPostCloseModal] = useState(false);
  const [postCloseAction, setPostCloseAction] = useState('REOPEN'); // 'REOPEN' or 'ADJUST_AMOUNTS'
  const [postCloseReason, setPostCloseReason] = useState('');
  const [postCloseOpeningVal, setPostCloseOpeningVal] = useState('');
  const [postCloseClosingVal, setPostCloseClosingVal] = useState('');
  const [savingPostClose, setSavingPostClose] = useState(false);

  // Historical Session Report Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [sessionReportData, setSessionReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem('user');
      if (u) setCurrentUser(JSON.parse(u));
    } catch (e) {}
  }, []);

  // Fetch session status whenever router query changes or initially
  useEffect(() => {
    fetchSessionStatus(router.query.date);
  }, [router.query.date]);

  const fetchSessionStatus = async (dateOverride = null) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (dateOverride) params.date = dateOverride;
      const res = await api.get('/day-close/status', { params });
      if (res.data && res.data.success) {
        setStatusData(res.data);
        // Pre-fill physical cash with expected closing cash if not closed
        if (res.data.status !== 'CLOSED') {
          fetchVerificationDetails(res.data.businessDate);
        }
      }
    } catch (err) {
      console.error('Error fetching day close status:', err);
      setError(err.response?.data?.message || 'Failed to load business session status');
      toast.error(err.response?.data?.message || 'Failed to load Day Close status');
    } finally {
      setLoading(false);
    }
  };

  const fetchVerificationDetails = async (businessDate) => {
    setVerifLoading(true);
    try {
      const res = await api.get('/day-close/verification-data', {
        params: { date: businessDate }
      });
      if (res.data && res.data.success) {
        setVerificationData(res.data);
        if (!physicalCash && res.data.expectedClosingCash !== undefined) {
          setPhysicalCash(res.data.expectedClosingCash.toString());
        }
      }
    } catch (err) {
      console.error('Error fetching verification data:', err);
    } finally {
      setVerifLoading(false);
    }
  };

  // Toggle Verification Checkbox and Save to Server
  const handleToggleCheck = async (key, currentReviewed) => {
    const newReviewed = !currentReviewed;

    // Optimistic UI update
    setVerificationData(prev => {
      if (!prev || !prev.checklist) return prev;
      const updatedChecklist = {
        ...prev.checklist,
        [key]: {
          ...prev.checklist[key],
          isReviewed: newReviewed
        }
      };
      const allRev = Object.keys(updatedChecklist).every(k => updatedChecklist[k].isReviewed);
      return {
        ...prev,
        checklist: updatedChecklist,
        allReviewed: allRev,
        canClose: allRev && (!prev.criticalDiscrepancies || prev.criticalDiscrepancies.length === 0)
      };
    });

    try {
      await api.post('/day-close/save-verification', {
        businessDate: statusData.businessDate,
        checks: {
          [key]: { reviewed: newReviewed }
        }
      });
    } catch (err) {
      console.error('Failed to save verification check:', err);
      toast.error('Failed to save verification status to server');
      // Revert on error
      fetchVerificationDetails(statusData.businessDate);
    }
  };

  // Handle Day Opening
  const handleOpenDaySubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const prevCash = Number(statusData?.previousClosingCash || 0);
      const addCash = parseFloat(openingAddCash) || 0;
      const remCash = parseFloat(openingRemCash) || 0;
      const actualCash = parseFloat(openingActualCash) || 0;
      const expectedCash = prevCash + addCash - remCash;
      const diff = actualCash - expectedCash;

      if (Math.abs(diff) > 0.01 && !openingReason.trim()) {
        const branchCurr = statusData?.branch || currentUser?.branch || 'AED';
        toast.warn(`Please provide an explanation for the opening difference of ${formatCurrency(diff, branchCurr)}.`);
        setSubmitting(false);
        return;
      }

      const payload = {
        branchId: statusData.branchId,
        previousClosingCash: prevCash,
        additionalCashAdded: addCash,
        cashRemovedBeforeOpening: remCash,
        actualOpeningCash: actualCash,
        openingDiscrepancyReason: openingReason.trim(),
        openingRemarks: openingRemarks.trim()
      };

      const res = await api.post('/day-close/open', payload);
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Business day opened successfully!');
        setShowOpenModal(false);
        await fetchSessionStatus(statusData.businessDate);
      }
    } catch (err) {
      console.error('Error opening business day:', err);
      toast.error(err.response?.data?.message || 'Failed to open business day');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Manager Exception Approval
  const handleApproveException = async () => {
    if (!exceptionReason.trim()) {
      toast.warn('Please provide an approval reason/notes.');
      return;
    }
    setApprovingException(true);
    try {
      const res = await api.post('/day-close/resolve-exception', {
        businessDate: statusData.businessDate,
        exceptionKey: selectedExceptionKey,
        reason: exceptionReason.trim()
      });
      if (res.data && res.data.success) {
        toast.success(`Exception for "${selectedExceptionKey}" approved.`);
        setShowExceptionModal(false);
        setExceptionReason('');
        await fetchVerificationDetails(statusData.businessDate);
      }
    } catch (err) {
      console.error('Error approving exception:', err);
      toast.error(err.response?.data?.message || 'Failed to approve exception');
    } finally {
      setApprovingException(false);
    }
  };

  // Handle Confirm Day Close
  const handleConfirmClose = async () => {
    setSubmitting(true);
    try {
      const payload = {
        businessDate: statusData.businessDate,
        physicalCash: parseFloat(physicalCash) || 0,
        notes: closingNotes.trim()
      };
      const res = await api.post('/day-close/confirm', payload);
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Day Close completed successfully!');
        setShowConfirmModal(false);
        await fetchSessionStatus(statusData.businessDate);
      }
    } catch (err) {
      console.error('Error confirming day close:', err);
      toast.error(err.response?.data?.message || 'Failed to complete Day Close');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Opening Amount
  const handleEditOpeningSubmit = async (e) => {
    e.preventDefault();
    if (!editOpeningReason.trim()) {
      toast.warn('Please provide a mandatory explanation for modifying the opening balance.');
      return;
    }
    setSavingEditOpen(true);
    try {
      const res = await api.post('/day-close/edit-opening', {
        branchId: statusData.branchId,
        businessDate: statusData.businessDate,
        actualOpeningCash: parseFloat(editOpeningVal) || 0,
        reason: editOpeningReason.trim()
      });
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Opening balance updated successfully!');
        setShowEditOpenModal(false);
        await fetchSessionStatus(statusData.businessDate);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to edit opening balance');
    } finally {
      setSavingEditOpen(false);
    }
  };

  // Handle Save / Update Closing Cash Count
  const handleSaveClosingCashCount = async () => {
    setSavingEditClose(true);
    try {
      const res = await api.post('/day-close/edit-closing-cash', {
        branchId: statusData.branchId,
        businessDate: statusData.businessDate,
        physicalCash: parseFloat(physicalCash) || 0,
        notes: closingNotes.trim(),
        reason: closingNotes.trim() || 'Physical cash count recorded'
      });
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Cash count recorded successfully!');
        await fetchSessionStatus(statusData.businessDate);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to record cash count');
    } finally {
      setSavingEditClose(false);
    }
  };

  // Handle Reconcile Prior Day Adjustment
  const handlePriorReconcileSubmit = async (e) => {
    e.preventDefault();
    if (!priorReconcileReason.trim()) {
      toast.warn('Please provide a reason for reconciling the prior day adjustment.');
      return;
    }
    setSavingPriorReconcile(true);
    try {
      const res = await api.post('/day-close/post-close-adjust', {
        branchId: statusData.branchId,
        businessDate: statusData.businessDate,
        action: 'RECONCILE_PRIOR_DAY',
        reason: priorReconcileReason.trim()
      });
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Prior day adjustment reconciled!');
        setShowPriorReconcileModal(false);
        await fetchSessionStatus(statusData.businessDate);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to reconcile prior day adjustment');
    } finally {
      setSavingPriorReconcile(false);
    }
  };

  // Handle Post-Closing Adjustment or Reopen (Admin only)
  const handlePostCloseSubmit = async (e) => {
    e.preventDefault();
    if (!postCloseReason.trim()) {
      toast.warn('A mandatory explanation is required for any post-closing adjustment or reopening.');
      return;
    }
    setSavingPostClose(true);
    try {
      const payload = {
        branchId: statusData.branchId,
        businessDate: statusData.businessDate,
        action: postCloseAction,
        reason: postCloseReason.trim()
      };
      if (postCloseAction === 'ADJUST_AMOUNTS') {
        if (postCloseOpeningVal !== '') payload.correctedOpeningCash = parseFloat(postCloseOpeningVal);
        if (postCloseClosingVal !== '') payload.correctedClosingCash = parseFloat(postCloseClosingVal);
      }
      const res = await api.post('/day-close/post-close-adjust', payload);
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Action executed successfully!');
        setShowPostCloseModal(false);
        await fetchSessionStatus(statusData.businessDate);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to process post-close adjustment');
    } finally {
      setSavingPostClose(false);
    }
  };

  // Handle Fetch Detailed Historical Session Report
  const handleFetchSessionReport = async (dateStr = null) => {
    setReportLoading(true);
    setShowReportModal(true);
    try {
      const targetDate = dateStr || statusData?.businessDate;
      const res = await api.get('/day-close/session-report', {
        params: { branchId: statusData?.branchId, date: targetDate }
      });
      if (res.data && res.data.success) {
        setSessionReportData(res.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load detailed session report');
    } finally {
      setReportLoading(false);
    }
  };

  // Load Unclosed / Open Days
  const handleFetchOpenDays = async () => {
    setOpenDaysLoading(true);
    try {
      const params = {};
      if (openDaysFilter.fromDate) params.fromDate = openDaysFilter.fromDate;
      if (openDaysFilter.toDate) params.toDate = openDaysFilter.toDate;
      if (openDaysFilter.status !== 'all') params.status = openDaysFilter.status;

      const res = await api.get('/day-close/open-days', { params });
      if (res.data && res.data.openDays) {
        setOpenDaysList(res.data.openDays);
      }
    } catch (err) {
      console.error('Error fetching open days:', err);
      toast.error('Failed to load open business days');
    } finally {
      setOpenDaysLoading(false);
    }
  };

  const isClosed = statusData?.status === 'CLOSED';
  const isNotOpened = statusData?.status === 'NOT_OPENED';
  const isOpen = statusData?.status === 'OPEN' || statusData?.status === 'CLOSING_PENDING';
  const isPendingPrevious = statusData?.hasPendingPrevious;
  const pendingDateDisplay = statusData?.pendingDateDisplay;
  const pendingDateIso = statusData?.pendingDate;

  const displayFormattedDate = statusData?.businessDateDisplay || formatDisplayFromIso(statusData?.businessDate);

  const prevClosingCash = Number(statusData?.previousClosingCash || 0);
  const addCashNum = parseFloat(openingAddCash) || 0;
  const remCashNum = parseFloat(openingRemCash) || 0;
  const actualCashNum = parseFloat(openingActualCash) || 0;
  const expectedOpenCalc = prevClosingCash + addCashNum - remCashNum;
  const openDiffCalc = actualCashNum - expectedOpenCalc;

  const expectedClosing = verificationData?.expectedClosingCash !== undefined ? Number(verificationData.expectedClosingCash) : 0;
  const actualClosingNum = parseFloat(physicalCash) || 0;
  const closingDiffCalc = Number((actualClosingNum - expectedClosing).toFixed(2));

  const branchCurrency = statusData?.branch || currentUser?.branch || 'AED';
  const currencyMeta = extractCurrencyMeta(branchCurrency);
  const currencySymbol = currencyMeta.symbol;

  // Verification readiness check
  const checklist = verificationData?.checklist || {};
  const checklistKeys = Object.keys(checklist);
  const totalChecks = checklistKeys.length;
  const reviewedCount = checklistKeys.filter(k => checklist[k].isReviewed).length;
  const allChecksComplete = totalChecks > 0 && reviewedCount === totalChecks;

  const criticalIssues = verificationData?.criticalDiscrepancies || [];
  const canCloseDay = allChecksComplete && criticalIssues.length === 0;

  return (
    <div className="w-full space-y-6 pt-1 pb-12">
      {/* Title Card with Header & Find Open Days */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-2xl font-bold flex-shrink-0">
            <FiClock />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
              Business Day Management & Close
            </h1>
            <p className="text-xs text-gray-500">
              Session verification, daily reconciliation, and end-of-day immutable closing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleFetchSessionReport(statusData?.businessDate)}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border border-emerald-200"
          >
            <FiBookOpen className="text-emerald-700" /> Detailed Session Report
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOpenDaysModal(true);
              handleFetchOpenDays();
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <FiSearch className="text-slate-500" /> Find Open Days
          </button>
          <button
            type="button"
            onClick={() => fetchSessionStatus(statusData?.businessDate)}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer"
            title="Refresh Status"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          <FiRefreshCw className="animate-spin text-emerald-600" />
          Loading business session details...
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center space-y-4">
          <div className="text-red-500 text-sm font-semibold">{error}</div>
          <button
            onClick={() => fetchSessionStatus()}
            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FiRefreshCw /> Retry Loading
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Missed Day Close Warning Banner */}
          {isPendingPrevious && (
            <div className="bg-amber-500 text-white p-4 rounded-xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <FiAlertTriangle className="text-2xl flex-shrink-0 text-amber-100" />
                <div>
                  <h4 className="font-bold text-sm">Day Close Pending!</h4>
                  <p className="text-xs text-amber-50 mt-0.5">
                    You have not closed the business date <span className="font-bold text-white">{pendingDateDisplay}</span>. Please complete the pending Day Close before proceeding to a later date.
                  </p>
                </div>
              </div>
              {pendingDateIso && statusData.businessDate !== pendingDateIso && (
                <button
                  type="button"
                  onClick={() => router.push(`/settings/day-close?date=${pendingDateIso}`)}
                  className="px-3.5 py-1.5 bg-white text-amber-900 text-xs font-bold rounded-lg shadow-sm hover:bg-amber-50 transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
                >
                  Go to {pendingDateDisplay} →
                </button>
              )}
            </div>
          )}

          {/* Prior Day Modification Discrepancy Banner */}
          {statusData?.hasPriorDayDiscrepancy && (
            <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
              <div className="flex items-center gap-3">
                <FiAlertTriangle className="text-2xl text-amber-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-amber-900">Prior Day Closing Discrepancy Detected</h4>
                  <p className="mt-0.5 text-amber-800">
                    The immediately preceding business day's closing balance was modified by <strong>₹{statusData.priorDayDiscrepancyAmount}</strong> after this session was opened.
                    (Session recorded: ₹{statusData.priorDayRecordedClosingCash} → Current saved: ₹{statusData.priorDayCurrentClosingCash}).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPriorReconcileReason('');
                  setShowPriorReconcileModal(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm whitespace-nowrap cursor-pointer transition-all"
              >
                Reconcile Prior Day Variance
              </button>
            </div>
          )}

          {/* Business Session Information Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CURRENT BUSINESS SESSION</span>
                <div className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                  {displayFormattedDate}
                  <span className={`text-xs px-3 py-1 font-bold rounded-full ${
                    isClosed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : isOpen
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {statusData.status}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {isNotOpened && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningActualCash(prevClosingCash.toString());
                      setShowOpenModal(true);
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <FiCheckCircle /> Open Business Day
                  </button>
                )}
                {isOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpeningVal(statusData.openingCash.toString());
                      setEditOpeningReason('');
                      setShowEditOpenModal(true);
                    }}
                    className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiEdit /> Edit Opening Amount
                  </button>
                )}
              </div>
            </div>

            {/* Session Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Branch</span>
                <p className="font-bold text-gray-800">{statusData.branchName}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Register / Terminal</span>
                <p className="font-bold text-gray-800">{statusData.terminalName || 'Main Register'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Cashier / Opened By</span>
                <p className="font-bold text-gray-800">{statusData.openedBy || 'Not Opened'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Opening Cash</span>
                <p className="font-bold text-emerald-600">{formatCurrency(statusData.openingCash, branchCurrency)}</p>
              </div>
            </div>

            {/* Previous Closing Reference */}
            {statusData.previousClosingDateDisplay && (
              <div className="text-[11px] text-gray-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2">
                <FiLock className="text-slate-400" />
                <span>
                  Previous Closing Reference: Closed on <span className="font-bold text-gray-700">{statusData.previousClosingDateDisplay}</span> with <span className="font-bold text-gray-700">{formatCurrency(statusData.previousClosingCash, branchCurrency)}</span> closing cash.
                </span>
              </div>
            )}
          </div>

          {/* CLOSED STATE VIEW */}
          {isClosed ? (
            <div className="space-y-6">
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-emerald-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-2xl font-bold flex-shrink-0">
                      <FiCheckCircle />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-emerald-950">Business Day is Closed & Verified</h3>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Day Close completed on {statusData.closedAt ? new Date(statusData.closedAt).toLocaleString() : '—'} by {statusData.closedBy || 'Staff'}.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleFetchSessionReport(statusData.businessDate)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FiBookOpen /> Detailed Session Report
                    </button>
                    {currentUser?.role === 'admin' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPostCloseAction('ADJUST_AMOUNTS');
                            setPostCloseOpeningVal(statusData.openingCash?.toString() || '');
                            setPostCloseClosingVal(statusData.physicalCash?.toString() || '');
                            setPostCloseReason('');
                            setShowPostCloseModal(true);
                          }}
                          className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <FiEdit /> Post-Close Adjust
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPostCloseAction('REOPEN');
                            setPostCloseReason('');
                            setShowPostCloseModal(true);
                          }}
                          className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs rounded-xl border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <FiRefreshCw /> Reopen Business Day
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Closed Financial Summary Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Opening Balance</span>
                    <p className="font-extrabold text-gray-900">{formatCurrency(statusData.openingCash, branchCurrency)}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Cash Received</span>
                    <p className="font-extrabold text-emerald-700">+{formatCurrency(statusData.totalCashReceived || 0, branchCurrency)}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Cash Paid</span>
                    <p className="font-extrabold text-rose-700">-{formatCurrency(statusData.totalCashPaid || 0, branchCurrency)}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Expected Closing</span>
                    <p className="font-extrabold text-blue-900">{formatCurrency(statusData.closingExpectedCash, branchCurrency)}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Physical Cash Count</span>
                    <p className="font-extrabold text-gray-900">{formatCurrency(statusData.physicalCash, branchCurrency)}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Closing Difference</span>
                    <p className={`font-extrabold ${Number(statusData.cashDifference || 0) === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {Number(statusData.cashDifference || 0) >= 0 ? '+' : ''}{formatCurrency(statusData.cashDifference, branchCurrency)}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-0.5 col-span-2">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Closing Notes</span>
                    <p className="font-medium text-gray-700 truncate">{statusData.notes || 'None recorded'}</p>
                  </div>
                </div>
              </div>

              {/* Adjustments & Audit History Section */}
              {Array.isArray(statusData?.adjustments) && statusData.adjustments.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
                  <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                    <FiShield className="text-emerald-600" /> Audit History & Adjustments Log
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500">
                        <tr>
                          <th className="p-2.5 rounded-l-lg">Timestamp</th>
                          <th className="p-2.5">Event Type</th>
                          <th className="p-2.5">Changed Values</th>
                          <th className="p-2.5">Reason</th>
                          <th className="p-2.5 rounded-r-lg">Authorized User</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {statusData.adjustments.map((adj, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="p-2.5 text-gray-500 whitespace-nowrap">
                              {new Date(adj.timestamp).toLocaleString()}
                            </td>
                            <td className="p-2.5 font-bold text-gray-800 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px]">{adj.type}</span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-gray-700">
                              {adj.field ? (
                                <span>{adj.field}: {adj.oldValue} → <strong className="text-emerald-700">{adj.newValue}</strong></span>
                              ) : adj.type === 'DAY_REOPENED' ? (
                                <span className="text-rose-700 font-semibold">Day reopened by admin</span>
                              ) : (
                                <span>Updated financial balances</span>
                              )}
                            </td>
                            <td className="p-2.5 text-gray-600 max-w-xs">{adj.reason}</td>
                            <td className="p-2.5 font-semibold text-gray-700">{adj.userName || 'Admin'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* OPEN / CLOSING_PENDING STATE: DAILY ACTIVITY VERIFICATION CHECKLIST */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-800">Daily Activity Verification Checklist</h2>
                  <p className="text-xs text-gray-500">
                    Mandatory verification: inspect each activity domain and mark as reviewed before closing.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    allChecksComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {reviewedCount} / {totalChecks} Verified
                  </span>
                </div>
              </div>

              {/* 8 Required Verification Checklist Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {checklistKeys.map(key => {
                  const item = checklist[key];
                  const hasDiscrepancy = item.hasDiscrepancy;
                  const isApproved = verificationData?.savedExceptions?.[key];

                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-xl border transition-all space-y-3 bg-white ${
                        hasDiscrepancy && !isApproved
                          ? 'border-red-300 shadow-sm shadow-red-50 bg-red-50/20'
                          : item.isReviewed
                          ? 'border-emerald-200 shadow-sm'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={item.isReviewed}
                            onChange={() => handleToggleCheck(key, item.isReviewed)}
                            className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div>
                            <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                              {item.title}
                            </h4>
                            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                              {item.summary}
                            </p>
                          </div>
                        </label>

                        {/* Status Badge */}
                        <div className="flex-shrink-0">
                          {hasDiscrepancy && !isApproved ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                              <FiAlertTriangle /> Discrepancy
                            </span>
                          ) : item.isReviewed ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <FiCheck /> Reviewed
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Discrepancy Alert & Resolution */}
                      {hasDiscrepancy && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 flex items-center justify-between gap-2">
                          <span>{item.discrepancyMessage}</span>
                          {currentUser?.role === 'admin' && !isApproved && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExceptionKey(key);
                                setShowExceptionModal(true);
                              }}
                              className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-bold hover:bg-red-700"
                            >
                              Approve Exception
                            </button>
                          )}
                        </div>
                      )}

                      {isApproved && (
                        <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-700">
                          Exception Approved by {verificationData.savedExceptions[key].approvedByName}: "{verificationData.savedExceptions[key].reason}"
                        </div>
                      )}

                      {/* View Details / Navigate Button */}
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                        <button
                          type="button"
                          onClick={() => setInspectingItem(item)}
                          className="text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1"
                        >
                          <FiEye /> Quick Inspect
                        </button>

                        <button
                          type="button"
                          onClick={() => router.push(item.actionRoute)}
                          className="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
                        >
                          {item.actionLabel} <FiChevronRight />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* End of Day Cash Count & Final Closing Confirmation */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                <h3 className="text-sm font-bold text-gray-800">Final Cash Reconciliation & Day Close</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Expected Closing Cash</span>
                    <p className="text-lg font-extrabold text-gray-800">{formatCurrency(expectedClosing, branchCurrency)}</p>
                    <span className="text-[10px] text-gray-400">Opening + Cash Sales - Expenses</span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Actual Physical Cash Counted</span>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={physicalCash}
                        onChange={(e) => setPhysicalCash(e.target.value)}
                        placeholder="Enter counted cash"
                        className="w-full px-2.5 py-1 text-sm font-bold bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveClosingCashCount}
                        disabled={savingEditClose}
                        className="px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg whitespace-nowrap shadow-sm"
                        title="Record physical cash count in database before final closing"
                      >
                        {savingEditClose ? 'Saving...' : 'Save Count'}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Closing Cash Difference</span>
                    <p className={`text-lg font-extrabold ${
                      closingDiffCalc === 0
                        ? 'text-emerald-600'
                        : closingDiffCalc > 0
                        ? 'text-blue-600'
                        : 'text-red-600'
                    }`}>
                      {closingDiffCalc >= 0 ? `+${formatCurrency(closingDiffCalc, branchCurrency)}` : `-${formatCurrency(Math.abs(closingDiffCalc), branchCurrency)}`}
                    </p>
                    <span className="text-[10px] text-gray-400">{closingDiffCalc === 0 ? 'Exact match' : 'Difference'}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500">Closing Notes / Remarks (Optional)</label>
                  <textarea
                    rows={2}
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Enter any notes about cash variance, shift changes, or special events..."
                    className="w-full mt-1 p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Validation warnings before closing */}
                {!canCloseDay && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <FiAlertTriangle /> Day Closing is Currently Blocked:
                    </div>
                    {!allChecksComplete && (
                      <p className="text-[11px]">
                        • You must inspect and check off all {totalChecks} verification items above ({reviewedCount} completed).
                      </p>
                    )}
                    {criticalIssues.length > 0 && (
                      <p className="text-[11px]">
                        • Critical discrepancies exist in ({criticalIssues.join(', ')}). A manager must resolve or approve an exception before closing.
                      </p>
                    )}
                  </div>
                )}

                {/* Confirm Close Button */}
                <button
                  type="button"
                  disabled={!canCloseDay || submitting}
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <FiLock /> Proceed to Final Day Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Day Opening Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 pt-16 sm:pt-20 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4 my-auto translate-y-4 sm:translate-y-6">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <FiClock className="text-emerald-600" /> Open Business Day
              </h3>
              <button onClick={() => setShowOpenModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleOpenDaySubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-gray-50 rounded-lg">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase">Business Date</span>
                  <p className="font-bold text-gray-800">{displayFormattedDate}</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-lg">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase">Previous Closing Cash</span>
                  <p className="font-bold text-gray-800">{formatCurrency(prevClosingCash, branchCurrency)}</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-gray-600">Additional Cash Added to Till ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingAddCash}
                    onChange={(e) => setOpeningAddCash(e.target.value)}
                    className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-gray-600">Cash Removed Before Opening ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingRemCash}
                    onChange={(e) => setOpeningRemCash(e.target.value)}
                    className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg font-bold"
                  />
                </div>

                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 flex justify-between items-center">
                  <span className="text-emerald-800 font-bold">Expected Opening Cash:</span>
                  <span className="text-emerald-900 font-extrabold text-sm">{formatCurrency(expectedOpenCalc, branchCurrency)}</span>
                </div>

                <div>
                  <label className="font-semibold text-gray-600">Actual Opening Cash Counted ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={openingActualCash}
                    onChange={(e) => setOpeningActualCash(e.target.value)}
                    placeholder="Enter physical cash in drawer"
                    className="w-full mt-1 p-2 bg-white border border-emerald-400 rounded-lg font-extrabold text-sm text-gray-900"
                  />
                </div>

                {Math.abs(openDiffCalc) > 0.01 && (
                  <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex justify-between items-center text-amber-800 font-bold">
                      <span>Opening Difference:</span>
                      <span>{openDiffCalc > 0 ? `+${formatCurrency(openDiffCalc, branchCurrency)}` : `-${formatCurrency(Math.abs(openDiffCalc), branchCurrency)}`}</span>
                    </div>
                    <label className="block text-[10px] font-bold text-amber-900 uppercase">Reason / Explanation (Required):</label>
                    <textarea
                      required
                      rows={2}
                      value={openingReason}
                      onChange={(e) => setOpeningReason(e.target.value)}
                      placeholder="Explain the opening cash difference..."
                      className="w-full p-2 bg-white border border-amber-300 rounded text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="font-semibold text-gray-600">Opening Remarks (Optional)</label>
                  <input
                    type="text"
                    value={openingRemarks}
                    onChange={(e) => setOpeningRemarks(e.target.value)}
                    placeholder="Shift notes or opening remarks"
                    className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  {submitting ? 'Opening...' : 'Confirm & Open Day'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Find Open Days Modal */}
      {showOpenDaysModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-5xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <FiSearch className="text-emerald-600" /> Find Unclosed Business Days
                </h3>
                <p className="text-xs text-gray-500">
                  Business dates requiring verification and closure.
                </p>
              </div>
              <button onClick={() => setShowOpenDaysModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">From Date</label>
                <input
                  type="date"
                  value={openDaysFilter.fromDate}
                  onChange={(e) => setOpenDaysFilter({ ...openDaysFilter, fromDate: e.target.value })}
                  className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">To Date</label>
                <input
                  type="date"
                  value={openDaysFilter.toDate}
                  onChange={(e) => setOpenDaysFilter({ ...openDaysFilter, toDate: e.target.value })}
                  className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Status</label>
                <select
                  value={openDaysFilter.status}
                  onChange={(e) => setOpenDaysFilter({ ...openDaysFilter, status: e.target.value })}
                  className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                >
                  <option value="all">All Open Statuses</option>
                  <option value="NOT_OPENED">Not Opened</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSING_PENDING">Closing Pending</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleFetchOpenDays}
                  className="w-full py-1.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 text-xs"
                >
                  Apply Filter
                </button>
              </div>
            </div>

            {/* Results Table */}
            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl">
              {openDaysLoading ? (
                <div className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                  <FiRefreshCw className="animate-spin text-emerald-600" /> Loading open days...
                </div>
              ) : openDaysList.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">
                  No unclosed business days found for the selected criteria.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-3">Business Date</th>
                      <th className="p-3">Branch</th>
                      <th className="p-3">Cashier</th>
                      <th className="p-3 text-right">Sales Count</th>
                      <th className="p-3 text-right">Total Sales</th>
                      <th className="p-3 text-right">Cash Collections</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {openDaysList.map((od) => (
                      <tr key={od.businessDate} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-gray-800">{od.businessDateDisplay}</td>
                        <td className="p-3 text-gray-600">{od.branchName}</td>
                        <td className="p-3 text-gray-600">{od.cashier}</td>
                        <td className="p-3 text-right text-gray-800">{od.salesCount}</td>
                        <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(od.totalSales, branchCurrency)}</td>
                        <td className="p-3 text-right text-emerald-600 font-bold">{formatCurrency(od.cashCollections, branchCurrency)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            od.isPendingClosure
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {od.currentStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setShowOpenDaysModal(false);
                              router.push(`/settings/day-close?date=${od.businessDate}`);
                            }}
                            className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-lg text-xs"
                          >
                            {od.action} →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Quick Inspector Modal for Verification Items */}
      {inspectingItem && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base">{inspectingItem.title} - Detailed Inspection</h3>
              <button onClick={() => setInspectingItem(null)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 text-xs">
              <pre className="p-3 bg-gray-50 border border-gray-100 rounded-xl font-mono text-[11px] text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(inspectingItem.details, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  const targetRoute = inspectingItem.actionRoute;
                  setInspectingItem(null);
                  router.push(targetRoute);
                }}
                className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700"
              >
                Go to Dedicated Page →
              </button>
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Exception Approval Modal */}
      {showExceptionModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2 text-red-600">
                <FiShield /> Manager Exception Approval
              </h3>
              <button onClick={() => setShowExceptionModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              You are approving an exception for <span className="font-bold text-gray-800">"{selectedExceptionKey}"</span>. An audit trail will be permanently recorded with your user ID and timestamp.
            </p>

            <div>
              <label className="text-[11px] font-bold text-gray-600 uppercase">Reason / Justification Note:</label>
              <textarea
                required
                rows={3}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                placeholder="e.g. Approved inventory count adjustment in progress; cash shortage acknowledged by staff."
                className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:bg-white"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowExceptionModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approvingException}
                onClick={handleApproveException}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm"
              >
                {approvingException ? 'Approving...' : 'Sign & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Pre-Closing Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 pt-16 sm:pt-20 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full p-6 space-y-4 text-center my-auto translate-y-4 sm:translate-y-6">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              <FiLock />
            </div>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Confirm Final Day Close</h3>
              <p className="text-xs text-gray-500 mt-1">
                You are about to finalize business date <span className="font-bold text-gray-900">{displayFormattedDate}</span>. Once closed, this business day becomes completely immutable.
              </p>
            </div>

            {/* Reconciliation Snapshot */}
            <div className="p-3 bg-gray-50 rounded-xl text-left text-xs space-y-1.5 border border-gray-100 font-medium">
              <div className="flex justify-between">
                <span className="text-gray-500">Opening Cash:</span>
                <span className="font-bold text-gray-800">{formatCurrency(statusData.openingCash, branchCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Expected Closing Cash:</span>
                <span className="font-bold text-gray-800">{formatCurrency(expectedClosing, branchCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Actual Physical Cash:</span>
                <span className="font-bold text-emerald-600">{formatCurrency(actualClosingNum, branchCurrency)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-gray-500">Cash Difference:</span>
                <span className={`font-bold ${closingDiffCalc === 0 ? 'text-gray-700' : 'text-red-600'}`}>
                  {formatCurrency(closingDiffCalc, branchCurrency)}
                </span>
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmClose}
                className="px-6 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 shadow-md transition-colors"
              >
                {submitting ? 'Finalizing...' : 'Yes, Finalize & Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Edit Opening Amount Modal */}
      {showEditOpenModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <FiEdit className="text-amber-600" /> Correct Opening Cash Amount
              </h3>
              <button onClick={() => setShowEditOpenModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleEditOpeningSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">Current Saved Opening Cash</span>
                <p className="text-xl font-black text-amber-950">{formatCurrency(statusData?.openingCash, branchCurrency)}</p>
                <p className="text-[11px] text-amber-700">Modifying opening cash will recalculate dependent session summaries and preserve this change in the audit trail.</p>
              </div>

              <div>
                <label className="font-bold text-gray-700">Corrected Opening Cash ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editOpeningVal}
                  onChange={(e) => setEditOpeningVal(e.target.value)}
                  placeholder="Enter corrected opening balance"
                  className="w-full mt-1 p-2.5 bg-white border border-gray-300 rounded-xl font-extrabold text-sm text-gray-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700">Mandatory Justification / Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={editOpeningReason}
                  onChange={(e) => setEditOpeningReason(e.target.value)}
                  placeholder="Explain why the opening balance is being corrected..."
                  className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditOpenModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditOpen}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm"
                >
                  {savingEditOpen ? 'Saving...' : 'Save Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: Prior Day Discrepancy Reconciliation Modal */}
      {showPriorReconcileModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-amber-900 text-base flex items-center gap-2">
                <FiAlertTriangle className="text-amber-600" /> Prior Day Closing Reconciliation
              </h3>
              <button onClick={() => setShowPriorReconcileModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handlePriorReconcileSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-amber-950">
                <p className="font-bold">Prior Day Closing Balance Modified Post-Opening:</p>
                <div className="flex justify-between text-xs">
                  <span>Balance at Session Open:</span>
                  <span className="font-mono font-bold">₹{statusData?.priorDayRecordedClosingCash}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Current Saved Prior Closing:</span>
                  <span className="font-mono font-bold">₹{statusData?.priorDayCurrentClosingCash}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-amber-200 pt-1 font-bold">
                  <span>Variance to Reconcile:</span>
                  <span className="font-mono text-amber-900">₹{statusData?.priorDayDiscrepancyAmount}</span>
                </div>
                <p className="text-[11px] text-amber-800 pt-1">
                  Reconciling acknowledges this adjustment and updates the current session opening baseline in the audit trail without silently overwriting previous historical closing records.
                </p>
              </div>

              <div>
                <label className="font-bold text-gray-700">Reconciliation Reason & Explanation *</label>
                <textarea
                  required
                  rows={3}
                  value={priorReconcileReason}
                  onChange={(e) => setPriorReconcileReason(e.target.value)}
                  placeholder="Explain why prior day closing balance was adjusted and how cash was reconciled..."
                  className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPriorReconcileModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPriorReconcile}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm"
                >
                  {savingPriorReconcile ? 'Reconciling...' : 'Confirm Reconciliation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: Post-Closing Adjustment & Reopening Modal (Admin Only) */}
      {showPostCloseModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <FiShield className="text-rose-600" />
                {postCloseAction === 'REOPEN' ? 'Reopen Closed Business Day' : 'Post-Close Balance Adjustment'}
              </h3>
              <button onClick={() => setShowPostCloseModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handlePostCloseSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 space-y-1">
                <p className="font-bold">Admin Controlled Workflow:</p>
                <p className="text-[11px] text-rose-800">
                  {postCloseAction === 'REOPEN'
                    ? 'Reopening will move status back to OPEN so further transaction corrections or cash adjustments can be made.'
                    : 'Modifying closed opening/closing balances directly will preserve old values in the audit adjustments log.'}
                </p>
              </div>

              {postCloseAction === 'ADJUST_AMOUNTS' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-gray-700">Corrected Opening Cash ({currencySymbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      value={postCloseOpeningVal}
                      onChange={(e) => setPostCloseOpeningVal(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-gray-200 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700">Corrected Closing Physical Cash ({currencySymbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      value={postCloseClosingVal}
                      onChange={(e) => setPostCloseClosingVal(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-gray-200 rounded-lg font-bold"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-gray-700">Mandatory Justification / Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={postCloseReason}
                  onChange={(e) => setPostCloseReason(e.target.value)}
                  placeholder="Explain why this post-closing operation is required..."
                  className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPostCloseModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPostClose}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm"
                >
                  {savingPostClose ? 'Processing...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: Detailed Historical Session Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-4xl w-full p-6 space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <FiBookOpen className="text-emerald-600" /> Business Session Comprehensive Report
                </h3>
                <p className="text-xs text-gray-500">
                  Business Date: <span className="font-bold text-gray-800">{sessionReportData?.businessDate || statusData?.businessDate}</span> | Branch: <span className="font-bold text-gray-800">{sessionReportData?.branchName || statusData?.branchName}</span>
                </p>
              </div>
              <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={18} />
              </button>
            </div>

            {reportLoading ? (
              <div className="p-12 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                <FiRefreshCw className="animate-spin text-emerald-600" /> Loading session financial report...
              </div>
            ) : !sessionReportData ? (
              <div className="p-8 text-center text-xs text-gray-400">No report data found.</div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl space-y-0.5 border border-slate-100">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Opening Cash</span>
                    <p className="text-base font-black text-gray-900">{formatCurrency(sessionReportData.balances?.openingCash, branchCurrency)}</p>
                    <span className="text-[10px] text-gray-500">Prev Close: {formatCurrency(sessionReportData.balances?.previousClosingCash, branchCurrency)}</span>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl space-y-0.5 border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 font-semibold uppercase">Total Cash In</span>
                    <p className="text-base font-black text-emerald-800">+{formatCurrency(sessionReportData.balances?.totalCashReceived, branchCurrency)}</p>
                    <span className="text-[10px] text-emerald-600">Sales + Inbound</span>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-xl space-y-0.5 border border-rose-100">
                    <span className="text-[10px] text-rose-700 font-semibold uppercase">Total Cash Out</span>
                    <p className="text-base font-black text-rose-800">-{formatCurrency(sessionReportData.balances?.totalCashPaid, branchCurrency)}</p>
                    <span className="text-[10px] text-rose-600">Expenses + Supplier</span>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl space-y-0.5 border border-blue-100">
                    <span className="text-[10px] text-blue-700 font-semibold uppercase">Closing Reconciliation</span>
                    <p className="text-base font-black text-blue-900">{formatCurrency(sessionReportData.balances?.physicalCash, branchCurrency)}</p>
                    <span className={`text-[10px] font-bold ${Number(sessionReportData.balances?.cashDifference || 0) === 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      Diff: {formatCurrency(sessionReportData.balances?.cashDifference, branchCurrency)}
                    </span>
                  </div>
                </div>

                {/* Cash Movements Breakdown Table */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 font-bold text-gray-700 text-xs">
                    Session Cash Movements Breakdown
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100/50 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5 text-right">Inflow (+)</th>
                        <th className="p-2.5 text-right">Outflow (-)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Cash Sales Collections</td>
                        <td className="p-2.5 text-gray-500">Direct cash collections at counter</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">+{formatCurrency(sessionReportData.movements?.cashSalesCollections || 0, branchCurrency)}</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Other Cash Receipts</td>
                        <td className="p-2.5 text-gray-500">Direct customer invoice payments in cash</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">+{formatCurrency(sessionReportData.movements?.otherCashReceipts || 0, branchCurrency)}</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Bank Cash Withdrawals (Inbound)</td>
                        <td className="p-2.5 text-gray-500">Contra transfers from bank to cash register</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">+{formatCurrency(sessionReportData.movements?.bankCashWithdrawals || 0, branchCurrency)}</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Cash Expenses</td>
                        <td className="p-2.5 text-gray-500">Direct operating expenses paid in cash</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">-{formatCurrency(sessionReportData.movements?.cashExpenses || 0, branchCurrency)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Cash Refunds</td>
                        <td className="p-2.5 text-gray-500">Sales returns refunded in cash</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">-{formatCurrency(sessionReportData.movements?.cashRefunds || 0, branchCurrency)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Supplier Cash Payments</td>
                        <td className="p-2.5 text-gray-500">Supplier/vendor bills settled in cash</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">-{formatCurrency(sessionReportData.movements?.cashSupplierPayments || 0, branchCurrency)}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-gray-800">Bank Cash Deposits (Outbound)</td>
                        <td className="p-2.5 text-gray-500">Contra transfers from cash register to bank</td>
                        <td className="p-2.5 text-right text-gray-400">—</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">-{formatCurrency(sessionReportData.movements?.bankCashDeposits || 0, branchCurrency)}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold border-t">
                        <td className="p-2.5 uppercase text-gray-700" colSpan={2}>Net Session Cash Flow</td>
                        <td className="p-2.5 text-right text-emerald-800">+{formatCurrency(sessionReportData.balances?.totalCashReceived || 0, branchCurrency)}</td>
                        <td className="p-2.5 text-right text-rose-800">-{formatCurrency(sessionReportData.balances?.totalCashPaid || 0, branchCurrency)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Audit & Adjustments History */}
                {sessionReportData.adjustments && sessionReportData.adjustments.length > 0 && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 font-bold text-gray-700 text-xs">
                      Session Audit History & Adjustments
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-100/50 text-[10px] uppercase font-bold text-gray-500">
                        <tr>
                          <th className="p-2.5">Time</th>
                          <th className="p-2.5">Action</th>
                          <th className="p-2.5">User</th>
                          <th className="p-2.5">Reason</th>
                          <th className="p-2.5">Changes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sessionReportData.adjustments.map((a, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 text-gray-500">{new Date(a.timestamp).toLocaleString()}</td>
                            <td className="p-2.5 font-bold text-gray-800">{a.type}</td>
                            <td className="p-2.5 text-gray-700">{a.userName}</td>
                            <td className="p-2.5 text-gray-600">{a.reason}</td>
                            <td className="p-2.5 font-mono text-[11px] text-gray-700">
                              {a.field ? `${a.field}: ${a.oldValue} → ${a.newValue}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
