import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiImage, FiBriefcase, FiGlobe, FiMapPin, FiPhone, FiMail, FiDollarSign } from 'react-icons/fi';
import SearchableSelect from '@/components/SearchableSelect';
import { CURRENCY_LIST, getCurrencySymbol, DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL } from '@/lib/currency';

export default function CompanyProfile() {
  const [formData, setFormData] = useState({
    registrationNumber: '', logoUrl: '', website: '', pincode: '',
    currencyCode: DEFAULT_CURRENCY, currencySymbol: DEFAULT_CURRENCY_SYMBOL, country: 'United Arab Emirates', taxSystem: 'GST',
    bankId: ''
  });
  const [states, setStates] = useState([]);
  const [banks, setBanks] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profileRes, statesRes, banksRes] = await Promise.all([
        api.get('/company'),
        api.get('/states'),
        api.get('/banks')
      ]);

      if (profileRes.data) {
        setFormData({
          ...profileRes.data,
          bankId: profileRes.data.bankId || ''
        });
      }
      setStates(statesRes.data);
      setBanks(banksRes.data || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && key !== 'logoUrl') {
          data.append(key, formData[key]);
        }
      });

      if (logoFile) {
        data.append('logo', logoFile);
      }

      const res = await api.post('/company', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setFormData(res.data);
      setLogoFile(null);
      setLogoPreview(null);
      toast.success('Profile Updated Successfully');
    } catch (err) {
      toast.error('Company update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Profile...</div>;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Company Profile</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your business identity and billing details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Logo Section */}
          <div className="md:col-span-1">
            <div className="card bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center">
              <h3 className="text-sm font-medium text-slate-700 mb-4 w-full text-center">Business Logo</h3>
              <div className="relative group w-48 h-48 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden mb-4 hover:border-primary transition-colors">
                {(logoPreview || formData.logoUrl) ? (
                  <img
                    src={logoPreview || formData.logoUrl}
                    alt="Logo"
                    className="w-full h-full object-contain p-4"
                  />
                ) : (
                  <div className="text-slate-400 text-center">
                    <FiImage className="text-4xl mb-2 mx-auto" />
                    <p className="text-xs font-semibold">Upload Logo</p>
                  </div>
                )}
                <label className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-sm font-medium">
                  Change Logo
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              <p className="text-xs text-slate-500 text-center leading-relaxed max-w-[200px]">
                Recommended: Square PNG or JPG<br />Max size: 2MB
              </p>
            </div>
          </div>

          {/* Details Section */}
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="card bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Company Legal Name <span className="text-red-500">*</span></label>
                    <input
                      className="input w-full"
                      value={formData.companyName}
                      onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                      required
                      placeholder="e.g. Acme Corp Pvt Ltd"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN / Registration No.</label>
                    <input
                      className="input w-full"
                      value={formData.registrationNumber}
                      onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })}
                      placeholder="e.g. 27ABCDE1234F1Z5"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                    <input
                      className="input w-full"
                      value={formData.website || ''}
                      onChange={e => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Business Address</label>
                    <textarea
                      className="input w-full"
                      rows="3"
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Street address, building, suite, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                    <input
                      className="input w-full"
                      value={formData.city || ''}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <SearchableSelect
                      options={states.map(s => ({ label: s.name, value: s.name }))}
                      value={formData.state || ''}
                      onChange={val => setFormData({ ...formData, state: val })}
                      placeholder="Select State..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                    <input
                      className="input w-full"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input
                      className="input w-full"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Default Base Currency</label>
                    <select
                      className="input w-full"
                      value={formData.currencyCode || DEFAULT_CURRENCY}
                      onChange={e => {
                        const code = e.target.value;
                        setFormData({
                          ...formData,
                          currencyCode: code,
                          currencySymbol: getCurrencySymbol(code, { raw: true })
                        });
                      }}
                    >
                      {CURRENCY_LIST.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>



                  <div className="md:col-span-2 mt-2 pt-6 border-t border-slate-100">
                    <h3 className="text-base font-medium text-slate-800 mb-4 flex items-center gap-2">
                      <FiBriefcase /> Primary Bank (for Statements)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company Default Bank</label>
                        <SearchableSelect
                          options={banks.map(b => ({ label: `${b.name} - ${b.accountNumber}`, value: b.id }))}
                          value={formData.bankId || ''}
                          onChange={val => setFormData({ ...formData, bankId: val })}
                          placeholder="Select Bank from Master..."
                          direction="down"
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 italic">* This bank's details will appear as the "Source Bank" on your Salary Bank Statements.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-lg font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
