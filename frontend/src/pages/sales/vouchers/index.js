import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import {
  FiPlus, FiSearch, FiClock, FiX, FiCheckCircle, FiAlertCircle,
  FiTag, FiPercent, FiGift, FiCopy, FiSettings, FiCheck, FiSlash, FiEye
} from 'react-icons/fi';
import { TbReceipt } from 'react-icons/tb';
import { toast } from 'react-toastify';
import SearchableSelect from '@/components/SearchableSelect';
import { formatAmountWithCurrency, getCurrencySymbol } from '@/lib/currency';

export default function VoucherManagement() {
  const [stats, setStats] = useState({
    totalVouchers: 0,
    activeVouchers: 0,
    redeemedVouchers: 0,
    expiredVouchers: 0,
    cancelledVouchers: 0,
    totalValueIssued: 0,
    totalDiscountRedeemed: 0
  });

  const [vouchers, setVouchers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'FIXED',
    value: '',
    maximumDiscount: '',
    minimumPurchaseAmount: '0',
    expiryDate: '',
    customerId: '',
    branchId: '',
    usageLimit: '1',
    description: ''
  });

  // Reward Rule Settings State
  const [rewardRule, setRewardRule] = useState({
    enabled: false,
    minQualifyingSpend: 500,
    rewardType: 'FIXED',
    rewardValue: 50,
    minFutureSpend: 200,
    validityDays: 30,
    customerSpecific: true,
    branchSpecific: false
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [statsRes, vouchersRes, custRes, branchRes, rewardRes] = await Promise.all([
        api.get('/customer-vouchers/dashboard').catch(() => ({ data: {} })),
        api.get('/customer-vouchers').catch(() => ({ data: [] })),
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/branches').catch(() => ({ data: [] })),
        api.get('/customer-vouchers/reward-settings').catch(() => ({ data: null }))
      ]);

      if (statsRes.data) setStats(statsRes.data);
      if (vouchersRes.data) setVouchers(vouchersRes.data);
      if (custRes.data) setCustomers(custRes.data);
      if (branchRes.data) setBranches(branchRes.data);
      if (rewardRes.data) setRewardRule(rewardRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load voucher data');
    } finally {
      setLoading(false);
    }
  };

  const reloadVouchers = async () => {
    try {
      const [statsRes, vouchersRes] = await Promise.all([
        api.get('/customer-vouchers/dashboard'),
        api.get('/customer-vouchers')
      ]);
      setStats(statsRes.data);
      setVouchers(vouchersRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = formData.type === 'PERCENTAGE' ? 'PCT-' : 'VOUCH-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setFormData({ ...formData, code });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!formData.name.trim()) return toast.error('Please enter voucher name');
      if (!formData.value || parseFloat(formData.value) <= 0) return toast.error('Please enter a valid value');

      await api.post('/customer-vouchers', formData);
      toast.success('Voucher created successfully');
      setShowCreateModal(false);
      setFormData({
        name: '',
        code: '',
        type: 'FIXED',
        value: '',
        maximumDiscount: '',
        minimumPurchaseAmount: '0',
        expiryDate: '',
        customerId: '',
        branchId: '',
        usageLimit: '1',
        description: ''
      });
      reloadVouchers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create voucher');
    }
  };

  const handleSaveRewardSettings = async (e) => {
    e.preventDefault();
    try {
      await api.post('/customer-vouchers/reward-settings', rewardRule);
      toast.success('Purchase reward settings saved');
      setShowRewardModal(false);
    } catch (err) {
      toast.error('Failed to save reward settings');
    }
  };

  const handleToggleStatus = async (voucher) => {
    try {
      const res = await api.put(`/customer-vouchers/${voucher.id}/toggle-status`);
      toast.success(res.data.message || 'Status updated');
      reloadVouchers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleCancelVoucher = async (voucher) => {
    if (!window.confirm(`Are you sure you want to cancel voucher "${voucher.code}"?`)) return;
    try {
      await api.put(`/customer-vouchers/${voucher.id}/cancel`);
      toast.success('Voucher cancelled');
      reloadVouchers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel voucher');
    }
  };

  const handleViewDetails = async (voucher) => {
    try {
      const { data } = await api.get(`/customer-vouchers/${voucher.id}`);
      setSelectedVoucher(data);
      setShowDetailModal(true);
    } catch (err) {
      toast.error('Failed to load voucher details');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.info(`Copied "${text}" to clipboard`);
  };

  // Filtered vouchers
  const filteredVouchers = vouchers.filter(v => {
    if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && v.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = v.code?.toLowerCase().includes(q);
      const matchName = v.name?.toLowerCase().includes(q);
      const matchCust = v.customer?.name?.toLowerCase().includes(q);
      const matchPhone = v.customer?.phone?.includes(q);
      if (!matchCode && !matchName && !matchCust && !matchPhone) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <TbReceipt className="text-primary text-3xl" /> Customer Voucher Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create, monitor, and configure promotional discount vouchers & automatic purchase rewards
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowRewardModal(true)}
            className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <FiSettings size={16} /> Reward Rules
          </button>
          <button
            onClick={() => {
              handleGenerateCode();
              setShowCreateModal(true);
            }}
            className="flex-1 md:flex-none px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <FiPlus size={18} /> New Voucher
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Vouchers</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><FiCheckCircle size={18} /></span>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mt-2">{stats.activeVouchers}</p>
          <p className="text-xs text-slate-400 mt-1">Ready for POS redemption</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Redeemed</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><TbReceipt size={18} /></span>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mt-2">{stats.redeemedVouchers}</p>
          <p className="text-xs text-indigo-600 font-semibold mt-1">
            ₹{parseFloat(stats.totalDiscountRedeemed || 0).toFixed(2)} total savings
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Issued</span>
            <span className="p-2 bg-primary-light/10 text-primary rounded-lg"><FiTag size={18} /></span>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mt-2">{stats.totalVouchers}</p>
          <p className="text-xs text-slate-400 mt-1">₹{parseFloat(stats.totalValueIssued || 0).toFixed(2)} face value</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Expired / Cancelled</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg"><FiAlertCircle size={18} /></span>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mt-2">{stats.expiredVouchers + stats.cancelledVouchers}</p>
          <p className="text-xs text-slate-400 mt-1">{stats.expiredVouchers} Expired, {stats.cancelledVouchers} Cancelled</p>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <FiSearch className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, name, customer..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary bg-white"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="REDEEMED">Redeemed</option>
              <option value="INACTIVE">Inactive</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white outline-none cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="FIXED">Fixed Discount</option>
              <option value="PERCENTAGE">Percentage</option>
              <option value="PURCHASE_REWARD">Purchase Reward</option>
            </select>
          </div>
        </div>

        {/* Vouchers Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Voucher Code</th>
                <th className="py-3.5 px-4">Name & Type</th>
                <th className="py-3.5 px-4">Discount Value</th>
                <th className="py-3.5 px-4">Min Spend</th>
                <th className="py-3.5 px-4">Usage</th>
                <th className="py-3.5 px-4">Customer / Branch</th>
                <th className="py-3.5 px-4">Expiry Date</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-400">Loading vouchers...</td>
                </tr>
              ) : filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-400">
                    No vouchers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredVouchers.map(v => {
                  const isExpired = v.expiryDate && new Date(v.expiryDate) < new Date();
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span>{v.code}</span>
                          <button
                            onClick={() => copyToClipboard(v.code)}
                            className="text-slate-400 hover:text-primary p-1 rounded"
                            title="Copy code"
                          >
                            <FiCopy size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800">{v.name}</p>
                        <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          v.type === 'PERCENTAGE' ? 'bg-purple-100 text-purple-700' :
                          v.type === 'PURCHASE_REWARD' ? 'bg-amber-100 text-amber-800' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {v.type === 'PURCHASE_REWARD' ? 'Purchase Reward' : v.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {v.type === 'PERCENTAGE' ? (
                          <span>{v.value}% {v.maximumDiscount ? `(Max ₹${v.maximumDiscount})` : ''}</span>
                        ) : (
                          <span>₹{parseFloat(v.value).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                        {parseFloat(v.minimumPurchaseAmount) > 0 ? `₹${parseFloat(v.minimumPurchaseAmount).toFixed(2)}` : 'No minimum'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold">
                        <span className={v.usageCount >= v.usageLimit ? 'text-indigo-600' : 'text-slate-700'}>
                          {v.usageCount} / {v.usageLimit || 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <p className="font-semibold text-slate-800">
                          {v.customer?.name ? v.customer.name : <span className="text-slate-400 font-normal">All Customers</span>}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {v.branch?.name ? v.branch.name : 'All Branches'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {v.expiryDate ? (
                          <span className={isExpired ? 'text-red-500 font-semibold' : 'text-slate-600'}>
                            {new Date(v.expiryDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-400">Never</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                          v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                          v.status === 'REDEEMED' ? 'bg-indigo-100 text-indigo-700' :
                          v.status === 'EXPIRED' ? 'bg-amber-100 text-amber-700' :
                          v.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDetails(v)}
                            className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FiEye size={15} />
                          </button>
                          {v.status !== 'REDEEMED' && v.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleToggleStatus(v)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                v.status === 'ACTIVE'
                                  ? 'text-amber-600 hover:bg-amber-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            >
                              {v.status === 'ACTIVE' ? <FiSlash size={15} /> : <FiCheck size={15} />}
                            </button>
                          )}
                          {v.status !== 'REDEEMED' && v.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCancelVoucher(v)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Cancel Voucher"
                            >
                              <FiX size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE VOUCHER MODAL */}
      {showCreateModal && (
        <div 
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto my-auto relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FiPlus className="text-primary" /> Create Customer Voucher
              </h2>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <FiX size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Voucher Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Summer Festive ₹50 Off"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Voucher Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="VOUCH-XXXX-XXXX"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none focus:border-primary uppercase"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl h-[42px] cursor-pointer"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Type *</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary bg-white"
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="FIXED">Fixed Discount (₹)</option>
                    <option value="PERCENTAGE">Percentage Discount (%)</option>
                    <option value="PURCHASE_REWARD">Purchase Reward</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Value {formData.type === 'PERCENTAGE' ? '(%)' : '(₹)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder={formData.type === 'PERCENTAGE' ? '10' : '50'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                    value={formData.value}
                    onChange={e => setFormData({ ...formData, value: e.target.value })}
                  />
                </div>
              </div>

              {formData.type === 'PERCENTAGE' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Maximum Discount Cap (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 100 (Optional)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary"
                    value={formData.maximumDiscount}
                    onChange={e => setFormData({ ...formData, maximumDiscount: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Min Purchase (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary"
                    value={formData.minimumPurchaseAmount}
                    onChange={e => setFormData({ ...formData, minimumPurchaseAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary bg-white"
                    value={formData.expiryDate}
                    onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Restrict to Customer
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary bg-white"
                    value={formData.customerId}
                    onChange={e => setFormData({ ...formData, customerId: e.target.value })}
                  >
                    <option value="">All Customers (Open Promo)</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Restrict to Branch
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary bg-white"
                    value={formData.branchId}
                    onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                  >
                    <option value="">All Branches</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Usage Limit
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary"
                  value={formData.usageLimit}
                  onChange={e => setFormData({ ...formData, usageLimit: e.target.value })}
                />
                <span className="text-[11px] text-slate-400">Set to 1 for single-use promo vouchers</span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Notes / Description</label>
                <textarea
                  rows="2"
                  placeholder="Internal campaign notes..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary resize-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold shadow-xs cursor-pointer"
                >
                  Save Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REWARD RULES MODAL */}
      {showRewardModal && (
        <div 
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setShowRewardModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto my-auto relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FiGift className="text-primary" /> Automatic Purchase Reward Rule
              </h2>
              <button 
                onClick={() => setShowRewardModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <FiX size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRewardSettings} className="space-y-4 mt-4">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-slate-800">Enable Automatic Rewards</p>
                  <p className="text-xs text-slate-500">Automatically issue a voucher when a sale meets qualifying criteria</p>
                </div>
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-primary cursor-pointer"
                  checked={rewardRule.enabled}
                  onChange={e => setRewardRule({ ...rewardRule, enabled: e.target.checked })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Qualifying Bill Spend (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                    value={rewardRule.minQualifyingSpend}
                    onChange={e => setRewardRule({ ...rewardRule, minQualifyingSpend: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-[11px] text-slate-400">Minimum sale total to earn voucher</span>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Reward Voucher Value (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                    value={rewardRule.rewardValue}
                    onChange={e => setRewardRule({ ...rewardRule, rewardValue: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-[11px] text-slate-400">Fixed discount value awarded</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Future Min Purchase (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                    value={rewardRule.minFutureSpend}
                    onChange={e => setRewardRule({ ...rewardRule, minFutureSpend: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-[11px] text-slate-400">Spend needed to redeem reward</span>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Validity (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                    value={rewardRule.validityDays}
                    onChange={e => setRewardRule({ ...rewardRule, validityDays: parseInt(e.target.value) || 30 })}
                  />
                  <span className="text-[11px] text-slate-400">Days until reward expires</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="custSpec"
                  className="w-4 h-4 accent-primary cursor-pointer"
                  checked={rewardRule.customerSpecific}
                  onChange={e => setRewardRule({ ...rewardRule, customerSpecific: e.target.checked })}
                />
                <label htmlFor="custSpec" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Lock reward voucher to the purchasing customer account
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRewardModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold shadow-xs cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOUCHER DETAILS & REDEMPTIONS MODAL */}
      {showDetailModal && selectedVoucher && (
        <div 
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setShowDetailModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto my-auto relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{selectedVoucher.name}</h2>
                <p className="text-xs font-mono font-bold text-primary mt-0.5">{selectedVoucher.code}</p>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4 p-4 bg-slate-50 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 font-bold uppercase">Discount</span>
                <p className="font-bold text-slate-800 text-sm mt-0.5">
                  {selectedVoucher.type === 'PERCENTAGE' ? `${selectedVoucher.value}%` : `₹${selectedVoucher.value}`}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase">Min Spend</span>
                <p className="font-bold text-slate-800 text-sm mt-0.5">₹{selectedVoucher.minimumPurchaseAmount}</p>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase">Status</span>
                <p className="font-bold text-sm mt-0.5">{selectedVoucher.status}</p>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase">Redeemed</span>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedVoucher.usageCount} times</p>
              </div>
            </div>

            {/* Redemption History */}
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Redemption History</h3>
              {selectedVoucher.redemptions && selectedVoucher.redemptions.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Invoice #</th>
                        <th className="p-2.5">Discount Given</th>
                        <th className="p-2.5">Redeemed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedVoucher.redemptions.map(r => (
                        <tr key={r.id}>
                          <td className="p-2.5 font-bold text-slate-800">{r.sale?.invoiceNumber || `#${r.saleId}`}</td>
                          <td className="p-2.5 font-semibold text-emerald-600">₹{parseFloat(r.discountAmount).toFixed(2)}</td>
                          <td className="p-2.5 text-slate-500">{new Date(r.redeemedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                  This voucher has not been redeemed yet.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
