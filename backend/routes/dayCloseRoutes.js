const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/dayCloseController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Day Opening & Status
router.get('/status', getDayCloseStatus);
router.get('/summary', getDayCloseStatus); // Backward compatibility alias
router.post('/open', openDay);
router.post('/edit-opening', editOpeningAmount);

// Day Closing & Adjustments
router.post('/edit-closing-cash', editClosingCash);
router.post('/post-close-adjust', postCloseAdjust);
router.get('/session-report', getSessionReport);

// Daily Activity Verification & Reconciliation
router.get('/verification-data', getVerificationData);
router.post('/save-verification', saveVerificationProgress);
router.post('/resolve-exception', resolveException);

// Closing Confirmation & History
router.post('/confirm', confirmDayClose);
router.get('/open-days', findOpenDays);
router.get('/check-unclosed', checkUnclosed);
router.get('/history', getDayCloseHistory);

module.exports = router;
