import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { FiPlus, FiEdit2, FiTrash2, FiMapPin, FiPhone, FiMail, FiEye, FiFileText, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import ProfessionalInvoice from '@/components/ProfessionalInvoice';
import { INVOICE_TEMPLATES, getDemoInvoiceData, getTemplateName } from '@/lib/invoiceTemplates';
import { CURRENCY_LIST, getCurrencySymbol, normalizeCurrencySymbol } from '@/lib/currency';

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    address: '', 
    phone: '', 
    email: '', 
    currencyCode: 'AED',
    isActive: true, 
    stockIncluded: true
  });
  const [editingId, setEditingId] = useState(null);

  // Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState('modern');

  useEffect(() => {
    fetchBranches();
    fetchCompanyProfile();
  }, []);

  const fetchCompanyProfile = async () => {
    try {
      const { data } = await api.get('/company');
      if (data) setCompanyProfile(data);
    } catch (err) {
      console.error('Failed to fetch company profile', err);
    }
  };

  const fetchBranches = async () => {
    try {
      const { data } = await api.get('/branches');
      setBranches(data);
    } catch (err) {
      toast.error('Failed to fetch branches');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const code = formData.currencyCode || 'AED';
      const payload = {
        ...formData,
        currencyCode: code,
        currencySymbol: getCurrencySymbol(code, { raw: true })
      };
      if (editingId) {
        await api.put(`/branches/${editingId}`, payload);
        toast.success('Branch updated');
      } else {
        await api.post('/branches', payload);
        toast.success('Branch created');
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', address: '', phone: '', email: '', currencyCode: 'AED', isActive: true, stockIncluded: true });
      fetchBranches();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save branch');
    }
  };

  const openEditModal = (branch) => {
    setEditingId(branch.id);
    setFormData({
      name: branch.name,
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      currencyCode: branch.currencyCode || 'AED',
      isActive: branch.isActive,
      stockIncluded: branch.stockIncluded !== undefined ? branch.stockIncluded : true
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure? This will fail if users are assigned to this branch.')) return;
    try {
      await api.delete(`/branches/${id}`);
      toast.success('Branch deleted');
      fetchBranches();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete branch');
    }
  };

  const handleOpenPreview = (templateId) => {
    const targetTemplate = templateId || 'modern';
    setPreviewTemplate(targetTemplate);
    setShowPreviewModal(true);
  };

  // Build realistic demo preview data based on selected template and branch form
  const demoPrintData = getDemoInvoiceData(previewTemplate, formData, companyProfile);
  const previewProfile = {
    companyName: formData.name || companyProfile?.companyName || 'BOUTIQUE FASHION',
    address: formData.address || companyProfile?.address || 'Main Street, Fashion Boulevard',
    phone: formData.phone || companyProfile?.phone || '+971 4 345 6789',
    email: formData.email || companyProfile?.email || 'sales@boutique.ae',
    currencyCode: companyProfile?.currencyCode || 'AED',
    currencySymbol: companyProfile?.currencySymbol || 'AED ',
    logoUrl: companyProfile?.logoUrl || null
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Branches</h1>
          <p className="text-slate-500 text-sm mt-1">Manage multiple business locations</p>
        </div>
        <button 
          className="btn btn-primary w-full md:w-auto justify-center whitespace-nowrap" 
          onClick={() => {
            setEditingId(null);
            setFormData({ name: '', address: '', phone: '', email: '', currencyCode: 'INR', isActive: true, stockIncluded: true });
            setShowModal(true);
          }}
        >
          <FiPlus className="text-lg" /> Add Branch
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map(branch => {
          return (
            <div key={branch.id} className="card p-6 border-0 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full transition-colors ${branch.isActive ? 'bg-primary-light/10' : 'bg-slate-50'} group-hover:scale-110`}></div>

              <div className="relative">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${branch.isActive ? 'bg-primary-light/10 text-primary border border-primary/20' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      {branch.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${branch.stockIncluded ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      Stock: {branch.stockIncluded ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                      {branch.currencyCode || 'AED'} ({normalizeCurrencySymbol(branch.currencySymbol, branch.currencyCode || 'AED')})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEditModal(branch)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary-light/10 rounded-lg transition-colors" title="Edit Branch">
                      <FiEdit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(branch.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Branch">
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-medium text-slate-800 mb-4">{branch.name}</h3>

                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-3">
                    <FiMapPin className="text-slate-400 shrink-0" />
                    <span className="truncate">{branch.address || 'No address'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FiPhone className="text-slate-400 shrink-0" />
                    <span>{branch.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FiMail className="text-slate-400 shrink-0" />
                    <span className="truncate">{branch.email || 'No email'}</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">ID: BR-{branch.id.toString().padStart(3, '0')}</span>
                  <span className="text-xs text-slate-400">Created {new Date(branch.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
        {branches.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <p className="text-slate-400">No branches added yet. Click 'Add Branch' to get started.</p>
          </div>
        )}
      </div>

      {/* Branch Create / Edit Modal */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto max-h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">{editingId ? 'Edit Branch' : 'Add New Branch'}</h2>
              <button 
                type="button"
                onClick={() => { setShowModal(false); setEditingId(null); }} 
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors text-2xl font-semibold leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Branch Name *</label>
                <input
                  required
                  className="input w-full"
                  placeholder="e.g. Downtown Branch"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Address</label>
                <textarea
                  className="input w-full min-h-[75px]"
                  placeholder="Full address of the branch"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone</label>
                  <input
                    className="input w-full"
                    placeholder="+91..."
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    className="input w-full"
                    placeholder="branch@example.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Currency</label>
                <select
                  className="input w-full"
                  value={formData.currencyCode}
                  onChange={e => setFormData({ ...formData, currencyCode: e.target.value })}
                >
                  {CURRENCY_LIST.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3 py-2 mt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                  <span className="ml-3 text-sm font-medium text-slate-700">Active Status</span>
                </label>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="stockIncluded"
                    checked={formData.stockIncluded}
                    onChange={e => setFormData({ ...formData, stockIncluded: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-orange-500"></div>
                  <span className="ml-3 text-sm font-medium text-slate-700">Stock Included (Strict Validation)</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Update Branch' : 'Create Branch'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Invoice Template Realistic Preview Modal */}
      {showPreviewModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4" onClick={() => setShowPreviewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="p-4 px-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#009262]/10 text-[#009262] flex items-center justify-center">
                  <FiFileText size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">
                    Template Preview: {getTemplateName(previewTemplate)}
                  </h3>
                  <p className="text-xs text-slate-500">Realistic demo rendering using your branch layout settings</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors"
                title="Close"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-6 flex justify-center">
              <div className="bg-white shadow-md rounded-xl p-4 max-w-full overflow-x-auto border border-slate-200">
                <ProfessionalInvoice 
                  printData={demoPrintData} 
                  companyProfile={previewProfile} 
                  previewMode="Desktop" 
                />
              </div>
            </div>

            <div className="p-4 px-6 border-t border-slate-200 bg-white flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Template ID: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">{previewTemplate}</code>
              </span>
              <button 
                type="button" 
                className="btn btn-primary text-xs px-4 py-2" 
                onClick={() => setShowPreviewModal(false)}
              >
                Done Previewing
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
