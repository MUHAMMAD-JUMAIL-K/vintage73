const express = require('express');
const router = express.Router();
const customerVoucherController = require('../controllers/customerVoucherController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Fast POS validation endpoint
router.post('/validate', customerVoucherController.validateVoucher);

// Dashboard metrics
router.get('/dashboard', customerVoucherController.getVoucherDashboardStats);

// Purchase reward settings
router.get('/reward-settings', customerVoucherController.getRewardSettings);
router.post('/reward-settings', customerVoucherController.updateRewardSettings);

// Audit redemptions
router.get('/redemptions', customerVoucherController.getRedemptions);

// CRUD
router.get('/', customerVoucherController.getVouchers);
router.post('/', customerVoucherController.createVoucher);
router.get('/:id', customerVoucherController.getVoucherById);
router.put('/:id', customerVoucherController.updateVoucher);
router.put('/:id/toggle-status', customerVoucherController.toggleVoucherStatus);
router.put('/:id/cancel', customerVoucherController.cancelVoucher);

module.exports = router;
