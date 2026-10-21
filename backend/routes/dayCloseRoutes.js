const express = require('express');
const router = express.Router();
const {
  getDayCloseStatus,
  openDay,
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
