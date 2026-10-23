import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import { FiPlus, FiTrash2, FiDollarSign, FiFilter } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { formatCurrency } from '@/lib/currency';

export default function Accounts() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('expenses');
  const [outstandingData, setOutstandingData] = useState({ customers: [], suppliers: [] });

  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(''); // '' means All for logic default
  const [user, setUser] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);

  useEffect(() => {
    if (router.query.tab) {
      setActiveTab(router.query.tab);
    }

    // Init User & Branch
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      setUser(u);
      setSelectedBranch(u.branchId?.toString() || '');

      if (u.role === 'admin') {
        api.get('/branches').then(res => setBranches(res.data)).catch(console.error);
      }
      api.get('/company').then(res => setCompanyProfile(res.data)).catch(console.error);
    }
  }, [router.query.tab]);

  const [transactions, setTransactions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    type: 'expense',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: ''
  });

  const activeBranchObj = useMemo(() => {
    if (selectedBranch && selectedBranch !== 'all') {
      return branches.find(b => b.id.toString() === selectedBranch.toString()) || null;
    }
    if (user?.branchId) {
      return branches.find(b => b.id === user.branchId) || null;
    }
    return null;
  }, [branches, selectedBranch, user]);

  const activeCurrency = useMemo(() => {
    return activeBranchObj || companyProfile || 'AED';
  }, [activeBranchObj, companyProfile]);

  useEffect(() => {
    if (selectedBranch) {
      fetchTransactions();
    }
  }, [activeTab, selectedBranch]);

  const fetchTransactions = async () => {
    try {
      const queryBranchId = selectedBranch === 'all' ? undefined : selectedBranch;

      if (activeTab === 'outstanding') {
        const { data } = await api.get('/accounts/outstanding', { params: { branchId: queryBranchId } });
        setOutstandingData(data);
        return;
      }

      const endpoint = activeTab === 'expenses' ? '/accounts/expenses' : '/accounts/payments';
      const { data } = await api.get(endpoint, { params: { branchId: queryBranchId } });

      if (activeTab === 'expenses') {
        setTransactions(data);
      } else {
        // Filter by receipts or payments
        setTransactions(data.filter(d => d.type === (activeTab === 'receipts' ? 'receipt' : 'payment')));
      }
    } catch (err) {
      console.log('Error fetching accounts data', err);
      toast.error('Failed to load financial data');
      setTransactions([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const storedUser = localStorage.getItem('user');
      await api.post(endpoint, {
        ...formData,
        branchId: user?.branchId, // Always create in user's own branch, filtering is for viewing only
        type: activeTab === 'receipts' ? 'receipt' : formData.type,
        date: new Date(formData.date).toISOString()
      });
      setShowModal(false);
      fetchTransactions();
      toast.success('Transaction saved!');
    } catch (err) {
      toast.error('Failed to save transaction');
    }
  };

  const tabs = [
    { id: 'expenses', label: 'Expenses', color: 'text-red-500' },
    { id: 'payments', label: 'Payments (Out)', color: 'text-orange-500' },
    { id: 'receipts', label: 'Receipts (In)', color: 'text-primary' },
    { id: 'outstanding', label: 'Outstanding Report', color: 'text-blue-500' }
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Accounts & Ledger</h1>
          <p className="text-slate-500 text-sm mt-1">Manage finances, expenses, and transaction logs</p>
        </div>
        <div className="flex items-center gap-4">
          {user?.role === 'admin' && (
            <select
              className="input py-2 border rounded-lg px-3 font-medium text-slate-700 text-sm"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-primary" onClick={() => {
            setFormData({ ...formData, type: activeTab === 'receipts' ? 'receipt' : activeTab === 'expenses' ? 'expense' : 'payment' });
            setShowModal(true);
          }}>
            <FiPlus className="text-lg" /> New Transaction
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-lg p-0 overflow-hidden">
        {/* Modern Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="table-container border-0 rounded-none">
          {activeTab === 'outstanding' ? (
            <div className="p-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-primary-light/10 p-6 rounded-2xl border border-primary/20">
                  <p className="text-xs font-medium text-primary uppercase tracking-widest mb-1">Total Receivables</p>
                  <p className="text-3xl font-extrabold text-primary-dark">{formatCurrency(outstandingData.customers.reduce((s, c) => s + c.totalBalance, 0), activeCurrency)}</p>
                  <p className="text-[10px] text-primary/80 mt-2 font-medium">From {outstandingData.customers.length} Customers</p>
                </div>
                <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                  <p className="text-xs font-medium text-red-600 uppercase tracking-widest mb-1">Total Payables</p>
                  <p className="text-3xl font-extrabold text-red-700">{formatCurrency(outstandingData.suppliers.reduce((s, p) => s + p.totalBalance, 0), activeCurrency)}</p>
                  <p className="text-[10px] text-red-500 mt-2 font-medium">To {outstandingData.suppliers.length} Suppliers</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Customer Dues */}
                <div>
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary rounded-full"></span> Customer Receivables
                  </h3>
                  <div className="space-y-3">
                    {outstandingData.customers.map(c => (
                      <div key={c.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-slate-800">{c.name}</span>
                          <span className="text-primary font-extrabold text-lg">{formatCurrency(c.totalBalance, activeCurrency)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">
                          {c.items.length} Invoices Pending
                        </div>
                      </div>
                    ))}
                    {outstandingData.customers.length === 0 && (
                      <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm italic mb-1">No customer dues found.</p>
                        <p className="text-[10px] text-slate-300 px-10">Dues appear when you create a POS sale with partial payment or 'Credit' method.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supplier Payables */}
                <div>
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span> Supplier Payables
                  </h3>
                  <div className="space-y-3">
                    {outstandingData.suppliers.map(s => (
                      <div key={s.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-slate-800">{s.name}</span>
                          <span className="text-red-600 font-extrabold text-lg">{formatCurrency(s.totalBalance, activeCurrency)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">
                          {s.items.length} Purchases Unpaid
                        </div>
                      </div>
                    ))}
                    {outstandingData.suppliers.length === 0 && (
                      <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm italic mb-1">No supplier dues found.</p>
                        <p className="text-[10px] text-slate-300 px-10">Dues appear when you record a Purchase with 'Credit' payment method.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td className="text-slate-600 font-medium">{new Date(t.date || t.createdAt).toLocaleDateString()}</td>
                    <td className="text-slate-800">
                      <div>{t.description || t.notes || '-'}</div>
                      {t.reference && <div className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{t.reference}</div>}
                    </td>
                    <td>
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                        {t.category || t.method || 'General'}
                      </span>
                    </td>
                    <td className={`text-right font-medium ${activeTab === 'receipts' ? 'text-primary' : 'text-red-500'}`}>
                      {activeTab === 'receipts' ? '+' : '-'} {formatCurrency(parseFloat(t.amount || 0), activeCurrency)}
                    </td>
                    <td className="text-right">
                      <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><FiTrash2 /></button>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan="5" className="p-8 text-center text-slate-400">No transactions found for this category.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-slate-800 capitalize">Add {activeTab === 'receipts' ? 'Receipt' : activeTab.slice(0, -1)}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input type="date" className="input" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-semibold">{activeCurrency.currencySymbol || activeCurrency.currencyCode || 'AED'}</span>
                  <input type="number" className="input pl-14" required value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input className="input" placeholder="Transaction details..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input className="input" placeholder="e.g. Rent, Salary, Advance" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
