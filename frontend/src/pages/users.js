import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import api from '@/lib/api';
import { MENU_STRUCTURE } from '@/lib/menuStructure';
import { FiPlus, FiUser, FiKey, FiEdit2, FiToggleLeft, FiToggleRight, FiSearch } from 'react-icons/fi';
import { toast } from 'react-toastify';
import SearchableSelect from '@/components/SearchableSelect';


const getInitialFormState = () => ({
  username: '', name: '', password: '', role: 'staff', branchId: '', adminId: '', allowedModules: [], incentivePercentage: 0,
  designation: '', department: '', joiningDate: '', basicSalary: 0, labourRule: '', nationalId: '',
  employeeCode: '', bankName: '', accountNumber: '', ifscCode: '', branchName: '',
  terminalIds: [],
  weeklyOff: 'Sunday',
  autoCode: true,
  isActive: true,
  image: null,
  imagePreview: null
});

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(getInitialFormState());
  const [editingId, setEditingId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [designations, setDesignations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [banks, setBanks] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [activeTab, setActiveTab] = useState('general');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const router = useRouter();

  // const modules = ['DASHBOARD', 'MASTER', 'INVENTORY', 'SALES', 'ACCOUNTS']; // Deprecated

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setCurrentUser(parsedUser);
      // Pre-set branch if admin with a branch and not editing
      if (parsedUser.role === 'admin' && parsedUser.branchId && !editingId) {
        setFormData(prev => ({ ...prev, branchId: parsedUser.branchId }));
      }
    }
    fetchUsers();
    fetchBranches();
    fetchCompanyProfile();
    fetchDesignations();
    fetchDepartments();
    fetchBankMaster();
    fetchTerminals();
  }, []);

  const fetchTerminals = async () => {
    try {
      const { data } = await api.get('/terminals');
      setTerminals(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCompanyProfile = async () => {
    try {
      const { data } = await api.get('/company');
      setCompanyProfile(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBranches = async () => {
    try {
      const { data } = await api.get('/branches');
      setBranches(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDesignations = async () => {
    try {
      const { data } = await api.get('/hrms/designations');
      setDesignations(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDepartments = async () => {
    try {
      const { data } = await api.get('/hrms/departments');
      setDepartments(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (formData.branchId) {
      fetchAdmins(formData.branchId);
    } else {
      setAdmins([]);
    }
  }, [formData.branchId]);

  const fetchAdmins = async (branchId) => {
    try {
      const { data } = await api.get(`/users/admins?branchId=${branchId}`);
      setAdmins(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBankMaster = async () => {
    try {
      const { data } = await api.get('/banks');
      setBanks(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get(`/users?t=${Date.now()}`);
      setUsers(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'allowedModules' || key === 'terminalIds') {
          formData[key].forEach(val => data.append(key, val));
        } else if (key === 'image') {
          if (formData[key]) data.append('image', formData[key]);
        } else if (key === 'password') {
          // Only append password if it has a value (for update)
          if (formData[key] && formData[key].trim() !== '') {
            data.append(key, formData[key]);
          }
        } else {
          data.append(key, formData[key]);
        }
      });

      if (editingId) {
        await api.put(`/users/${editingId}`, data);
        toast.success('User updated successfully');
      } else {
        await api.post('/users', data);
        toast.success('User created successfully');
      }
      await fetchUsers();
      setShowModal(false);
      setEditingId(null);
      setFormData(getInitialFormState());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save user');
    }
  };


  const openEditModal = async (user) => {
    const loadingToast = toast.loading('Loading fresh user data...');
    try {
      // Use cache-busting query param to guarantee fresh data
      const { data: freshUser } = await api.get(`/users/${user.id}?t=${Date.now()}`);
      
      console.log('Fetched fresh data:', freshUser);
      
      setFormData({
        username: freshUser.username || '',
        name: freshUser.name || '',
        password: '', // Clear password field for edit
        role: freshUser.role,
        branchId: freshUser.branchId || '',
        allowedModules: freshUser.allowedModules || [],
        incentivePercentage: freshUser.incentivePercentage || 0,
        designation: freshUser.employeeProfile?.designationId || '',
        department: freshUser.employeeProfile?.departmentId || '',
        joiningDate: freshUser.employeeProfile?.joiningDate ? freshUser.employeeProfile.joiningDate.split('T')[0] : '',
        basicSalary: freshUser.employeeProfile?.basicSalary || 0,
        labourRule: freshUser.employeeProfile?.labourRule || '',
        nationalId: freshUser.employeeProfile?.nationalId || '',
        employeeCode: freshUser.employeeProfile?.employeeCode || '',
        bankName: freshUser.employeeProfile?.bankName || '',
        accountNumber: freshUser.employeeProfile?.accountNumber || '',
        ifscCode: freshUser.employeeProfile?.ifscCode || '',
        branchName: freshUser.employeeProfile?.branchName || '',
        terminalIds: freshUser.terminals?.map(t => t.id) || [],
        weeklyOff: freshUser.weeklyOff || 'Sunday',
        autoCode: !freshUser.employeeProfile?.employeeCode,
        isActive: freshUser.isActive,
        adminId: freshUser.adminId || '',
        image: null,
        imagePreview: freshUser.imageUrl ? `${process.env.NEXT_PUBLIC_API_URL}${freshUser.imageUrl}` : null
      });
      setEditingId(freshUser.id);
      setShowModal(true);
      toast.dismiss(loadingToast);
    } catch (err) {
      console.error(err);
      toast.update(loadingToast, { render: 'Failed to fetch user', type: 'error', isLoading: false, autoClose: 3000 });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  const toggleModule = (module) => {
    setFormData(prev => {
      const current = prev.allowedModules || [];
      // Handle Parent Category Toggle
      if (!module.includes(':') && module !== 'DASHBOARD') {
        // Logic for parent toggle if needed, currently implicit
      }

      if (current.includes(module)) {
        return { ...prev, allowedModules: current.filter(m => m !== module) };
      } else {
        return { ...prev, allowedModules: [...current, module] };
      }
    });
  };

  const dashboardModule = 'DASHBOARD';

  const handleOpenAddUser = () => {
    setFormData(getInitialFormState());
    if (currentUser?.role === 'admin' && currentUser?.branchId) {
      setFormData(prev => ({ ...prev, branchId: currentUser.branchId }));
    }
    setEditingId(null);
    setShowModal(true);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Users</h1>
          <p className="text-slate-500 text-sm mt-1">Manage system access and roles</p>
        </div>
        <button className="btn btn-primary w-full md:w-auto" onClick={handleOpenAddUser}>
          <FiPlus className="text-lg" /> Add User
        </button>
      </div>

      <div className="card border-0 shadow-lg">
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th>User</th>
                <th>EMP CODE</th>
                <th>Branch</th>
                <th>Role</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Access</th>
                <th>Terminals</th>
                <th>Joined Date</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td className="font-medium text-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden border border-slate-200">
                        {user.imageUrl ? (
                          <img src={`${process.env.NEXT_PUBLIC_API_URL}${user.imageUrl}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <FiUser />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{user.name || 'No Name'}</div>
                        <div className="text-[10px] text-slate-400 font-mono tracking-tighter">@{user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-xs font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                      {user.employeeProfile?.employeeCode || '-'}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm text-slate-600">
                      {branches.find(b => b.id === user.branchId)?.name || 'Global'}
                    </span>
                  </td>
                  <td>
                    <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-slate-100 text-slate-600'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="text-slate-600">
                    {user.employeeProfile?.designation?.name ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {user.employeeProfile.designation.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="text-slate-600">
                    {user.employeeProfile?.department?.name ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                        {user.employeeProfile.department.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {user.allowedModules && user.allowedModules.map(m => (
                        <span key={m} className="px-2 py-0.5 bg-primary-light text-primary text-[10px] rounded border border-primary/20">{m}</span>
                      ))}
                      {(!user.allowedModules || user.allowedModules.length === 0) && <span className="text-slate-400 text-xs">-</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {user.terminals && user.terminals.map(t => (
                        <span key={t.id} className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] rounded border border-green-100 font-medium">{t.name}</span>
                      ))}
                      {(!user.terminals || user.terminals.length === 0) && <span className="text-slate-400 text-xs">-</span>}
                    </div>
                  </td>
                  <td className="text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-medium uppercase ${user.isActive ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary-light rounded-lg transition-colors"
                        title="Edit User"
                      >
                        <FiEdit2 />
                      </button>
                      {(currentUser?.role === 'admin') && (
                        <button
                          onClick={() => {
                            setStatusTarget(user);
                            setShowStatusModal(true);
                          }}
                          className="relative flex items-center cursor-pointer focus:outline-none group"
                          title={user.isActive ? 'Deactivate User Account' : 'Activate User Account'}
                        >
                          <div className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-300 ${user.isActive ? 'bg-primary shadow-inner' : 'bg-slate-200'}`}>
                            <div className={`absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300 transform ${user.isActive ? 'translate-x-full' : 'translate-x-0'} shadow-sm group-hover:scale-110`}></div>
                          </div>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr><td colSpan="5" className="text-center py-8 text-slate-400">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {
        showModal && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 text-left">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 tracking-tight">{editingId ? 'Edit User' : 'Add New User'}</h2>
                  <p className="text-slate-500 text-[11px] font-medium mt-0.5 uppercase tracking-wider">{editingId ? 'Modify existing account' : 'Setup system access for staff'}</p>
                </div>
                <button onClick={() => { setShowModal(false); setEditingId(null); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-100 text-slate-400 hover:text-red-500 hover:border-red-100 transition-all">
                  <FiPlus className="rotate-45 text-xl" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col h-full" autoComplete="off">
                {/* Tabs */}
                <div className="flex gap-6 border-b border-slate-100 mb-6 sticky top-0 bg-white z-10">
                  <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={`pb-3 text-xs font-medium uppercase tracking-wider transition-all border-b-2 ${activeTab === 'general' ? 'text-primary border-primary' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                  >
                    General Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('access')}
                    className={`pb-3 text-xs font-medium uppercase tracking-wider transition-all border-b-2 ${activeTab === 'access' ? 'text-primary border-primary' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                  >
                    User Access
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('salary')}
                    className={`pb-3 text-xs font-medium uppercase tracking-wider transition-all border-b-2 ${activeTab === 'salary' ? 'text-primary border-primary' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                  >
                    Salary & Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('bank')}
                    className={`pb-3 text-xs font-medium uppercase tracking-wider transition-all border-b-2 ${activeTab === 'bank' ? 'text-primary border-primary' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                  >
                    Bank Details
                  </button>
                </div>

                {/* General Tab */}
                <div className={activeTab === 'general' ? 'block' : 'hidden'}>
                  <div className="mb-6 flex flex-col items-center justify-center py-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-md overflow-hidden flex items-center justify-center text-slate-300">
                        {formData.imagePreview ? (
                          <img src={formData.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <FiUser size={40} />
                        )}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setFormData({
                                ...formData,
                                image: file,
                                imagePreview: URL.createObjectURL(file)
                              });
                            }
                          }}
                        />
                        <FiEdit2 size={20} />
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-3">Profile Photo</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Full Name</label>
                        <input
                          required
                          name="name"
                          autoComplete="off"
                          className="input w-full bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all font-normal py-2.5 text-sm"
                          placeholder="e.g. John Doe"
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Username</label>
                        <div className="relative">
                          <input
                            required
                            name="username"
                            autoComplete="off"
                            className="input w-full bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all font-normal py-2.5 text-sm"
                            placeholder="johndoe"
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                          <span>{editingId ? 'New Password (Optional)' : 'Initial Password'}</span>
                          {editingId && <span className="text-[9px] text-primary-dark normal-case font-medium">Leave blank to keep current</span>}
                        </label>
                        <div className="relative group">
                          <input
                            required={!editingId}
                            type="password"
                            name="password"
                            autoComplete="new-password"
                            className="input w-full bg-slate-50 border-slate-100 focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all font-normal py-2.5 text-sm pr-10"
                            placeholder={editingId ? "•••••••• (Untouched)" : "••••••••"}
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-primary transition-colors">
                            <FiKey />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Assigned Branch</label>
                        <select
                          className={`input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal py-2.5 text-sm ${currentUser?.branchId ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''}`}
                          value={formData.branchId}
                          onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                          disabled={currentUser?.branchId}
                        >
                          {currentUser?.branchId ? (
                            <option value={currentUser.branchId}>{currentUser.branchName || 'Current Branch'}</option>
                          ) : (
                            <>
                              <option value="">Global / No Branch</option>
                              {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Incentive (%)</label>
                        <input
                          type="number"
                          max="100"
                          step="0.1"
                          className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal py-2.5 text-sm"
                          placeholder="e.g. 5"
                          value={formData.incentivePercentage}
                          onChange={e => setFormData({ ...formData, incentivePercentage: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">System Role</label>
                        <div className="flex gap-2">
                          {['staff', 'admin'].map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setFormData({ ...formData, role: r })}
                              className={`flex-1 py-2 px-3 rounded-lg border transition-all font-medium uppercase text-[9px] tracking-widest ${formData.role === r ? 'border-primary bg-primary-light text-primary-dark' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      {formData.role === 'staff' && (
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                            Assigned Admin
                            <span className="text-[9px] text-red-500 normal-case font-medium">Required for Staff</span>
                          </label>
                          <SearchableSelect
                            options={admins.map(a => ({ value: a.id, label: `${a.name} (@${a.username})` }))}
                            value={formData.adminId}
                            onChange={val => setFormData({ ...formData, adminId: val })}
                            placeholder="Type to search admin..."
                          />
                        </div>
                      )}

                      {/* Status Toggle in Modal */}
                      <div className="pt-2">
                        <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-3">Account Status</label>
                        <label className="relative inline-flex items-center cursor-pointer p-2 rounded-lg border border-slate-100 bg-white">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={formData.isActive}
                            onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                            disabled={currentUser?.role !== 'admin'}
                          />
                          <div className="relative shrink-0 w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                          <span className="ml-3 text-xs font-medium text-slate-700 uppercase tracking-tight">Account is Active</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Access Tab */}
                <div className={activeTab === 'access' ? 'block' : 'hidden'}>
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <div className="w-1 h-3 bg-primary rounded-full"></div>
                      Module Permissions
                    </label>

                    {/* Dashboard separate */}
                    <div className="mb-3">
                      <label className="relative inline-flex items-center cursor-pointer p-2.5 rounded-lg border transition-all hover:bg-slate-50 border-slate-200">
                        <input
                          type="checkbox"
                          checked={formData.allowedModules?.includes(dashboardModule)}
                          onChange={() => toggleModule(dashboardModule)}
                          className="sr-only peer"
                        />
                        <div className="relative shrink-0 w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                        <span className={`ml-3 text-[10px] font-medium tracking-tight uppercase ${formData.allowedModules?.includes(dashboardModule) ? 'text-primary-dark' : 'text-slate-500'}`}>DASHBOARD</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {MENU_STRUCTURE.map(group => {
                        // Filter modules based on current user's access
                        if (currentUser?.role !== 'admin' || currentUser?.branchId) {
                          const allowed = currentUser?.allowedModules || [];
                          // If non-admin, only show the group if it's explicitly allowed OR if any of its items are allowed
                          if (!allowed.includes(group.title) && !group.items.some(item => allowed.includes(`${group.title}:${item.name}`))) {
                            return null;
                          }
                        }

                        return (
                          <div key={group.title} className="bg-white p-2.5 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-100">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.allowedModules?.includes(group.title)}
                                  onChange={() => toggleModule(group.title)}
                                  className="sr-only peer"
                                />
                                <div className="relative shrink-0 w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                              </label>
                              <span className="font-semibold text-slate-700 text-[10px] uppercase tracking-wide">{group.title}</span>
                            </div>

                            <div className="space-y-0.5">
                              {group.items.map(item => {
                                const permissionKey = `${group.title}:${item.name}`;
                                const isParentSelected = formData.allowedModules?.includes(group.title);
                                const isSelected = formData.allowedModules?.includes(permissionKey);

                                return (
                                  <label key={permissionKey} className={`flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-slate-50 transition-colors ${isParentSelected ? 'opacity-50' : ''}`}>
                                    <div className="relative inline-flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isSelected || isParentSelected}
                                        onChange={() => toggleModule(permissionKey)}
                                        disabled={isParentSelected}
                                        className="sr-only peer"
                                      />
                                      <div className="relative shrink-0 w-7 h-4 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all after:shadow-sm peer-checked:bg-primary"></div>
                                    </div>
                                    <span className={`text-[11px] ${isSelected || isParentSelected ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>{item.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Terminal Selection */}
                    <div className="mt-4 bg-white p-3 rounded-lg border border-slate-200">
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <div className="w-1 h-3 bg-green-500 rounded-full"></div>
                        Authorized Terminals
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2">
                        {terminals.filter(t =>
                          t.isActive &&
                          (!formData.branchId || t.branchId === parseInt(formData.branchId))
                        ).map(t => (
                          <label key={t.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${formData.terminalIds?.includes(t.id) ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                            <input
                              type="checkbox"
                              className="accent-green-500"
                              checked={formData.terminalIds?.includes(t.id)}
                              onChange={(e) => {
                                const current = formData.terminalIds || [];
                                if (e.target.checked) {
                                  setFormData({ ...formData, terminalIds: [...current, t.id] });
                                } else {
                                  setFormData({ ...formData, terminalIds: current.filter(id => id !== t.id) });
                                }
                              }}
                            />
                            <div>
                              <div className={`text-xs font-medium ${formData.terminalIds?.includes(t.id) ? 'text-green-700' : 'text-slate-600'}`}>{t.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{t.terminalCode}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Salary & Labour Tab */}
                <div className={activeTab === 'salary' ? 'block' : 'hidden'}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Weekly Off Day</label>
                      <select
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        value={formData.weeklyOff}
                        onChange={e => setFormData({ ...formData, weeklyOff: e.target.value })}
                      >
                        <option value="Sunday">Sunday</option>
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                        <option value="Friday">Friday</option>
                        <option value="Saturday">Saturday</option>
                        <option value="None">None / No Off</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
                        Employee Code
                        <div className="flex items-center gap-1 cursor-pointer select-none" onClick={() => setFormData({ ...formData, autoCode: !formData.autoCode, employeeCode: !formData.autoCode ? '' : formData.employeeCode })}>
                          <div className={`w-3 h-3 rounded-full border-2 ${formData.autoCode ? 'bg-primary border-primary' : 'bg-white border-slate-300'}`}></div>
                          <span className="text-[9px]">AUTO</span>
                        </div>
                      </label>
                      <input
                        disabled={formData.autoCode}
                        className={`input w-full transition-all font-normal text-sm py-2.5 ${formData.autoCode ? 'bg-slate-100 text-slate-400 italic' : 'bg-slate-50 border-slate-100'}`}
                        placeholder={formData.autoCode ? "Auto-generated" : "Custom Code"}
                        value={formData.employeeCode}
                        onChange={e => setFormData({ ...formData, employeeCode: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Designation</label>
                      <select
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        value={formData.designation}
                        onChange={e => setFormData({ ...formData, designation: e.target.value })}
                      >
                        <option value="">Select Designation</option>
                        {designations.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Department</label>
                      <select
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        value={formData.department}
                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                      >
                        <option value="">Select Department</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Joining Date</label>
                      <input
                        type="date"
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        value={formData.joiningDate}
                        onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Basic Salary ({companyProfile?.currencySymbol || 'AED'})</label>
                      <input
                        type="number"
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        value={formData.basicSalary}
                        onChange={e => setFormData({ ...formData, basicSalary: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">
                        {companyProfile?.country === 'India' ? 'Labour Rule (ESI/PF)' :
                          companyProfile?.country === 'UAE' ? 'Labour Rule (WPS/MOL)' : 'Labour Rule'}
                      </label>
                      <input
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        placeholder="e.g. Category A"
                        value={formData.labourRule}
                        onChange={e => setFormData({ ...formData, labourRule: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">
                        {companyProfile?.country === 'India' ? 'Aadhar / PAN' :
                          companyProfile?.country === 'UAE' ? 'Emirates ID / Labor Card' : 'National ID'}
                      </label>
                      <input
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        placeholder="ID Number"
                        value={formData.nationalId}
                        onChange={e => setFormData({ ...formData, nationalId: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Details Tab */}
                <div className={activeTab === 'bank' ? 'block' : 'hidden'}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Bank Name</label>
                      <input
                        type="text"
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        value={formData.bankName}
                        onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                        placeholder="e.g. HDFC Bank"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Account Number</label>
                      <input
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5 font-mono"
                        placeholder="1234567890"
                        value={formData.accountNumber}
                        onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">IFSC / Routing Code</label>
                      <input
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5 uppercase font-mono"
                        placeholder="HDFC0001234"
                        value={formData.ifscCode}
                        onChange={e => setFormData({ ...formData, ifscCode: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">Bank Branch</label>
                      <input
                        className="input w-full bg-slate-50 border-slate-100 focus:bg-white transition-all font-normal text-sm py-2.5"
                        placeholder="Branch Name"
                        value={formData.branchName}
                        onChange={e => setFormData({ ...formData, branchName: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                  <button type="button" className="px-4 py-2 font-medium text-slate-400 hover:text-slate-600 transition-colors uppercase text-[10px]" onClick={() => { setShowModal(false); setEditingId(null); }}>Cancel</button>
                  <button type="submit" className="bg-slate-900 text-white font-medium px-8 py-2.5 rounded-lg hover:bg-black hover:shadow-lg transition-all active:scale-95 text-xs uppercase tracking-widest">
                    {editingId ? 'Save Changes' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      }


      {/* Custom Status Confirmation Modal */}
      {showStatusModal && statusTarget && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
            <div className={`p-6 ${statusTarget.isActive ? 'bg-amber-50' : 'bg-green-50'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${statusTarget.isActive ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                  {statusTarget.isActive ? <FiToggleRight className="w-6 h-6" /> : <FiToggleLeft className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-900">
                    {statusTarget.isActive ? 'Deactivate Account?' : 'Activate Account?'}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 font-medium">
                    {statusTarget.name} (@{statusTarget.username})
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-slate-600 text-sm leading-relaxed">
                {statusTarget.isActive
                  ? 'This user will no longer be able to log in to the system. You can reactivate their account anytime.'
                  : 'This user will regain access to the system with their previous permissions.'}
              </p>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.put(`/users/${statusTarget.id}`, { isActive: !statusTarget.isActive });
                      toast.success(`User ${statusTarget.isActive ? 'deactivated' : 'activated'} successfully`);
                      setShowStatusModal(false);
                      fetchUsers();
                    } catch (err) {
                      toast.error('Failed to update status');
                    }
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm text-white shadow-lg transition-all active:scale-95 ${statusTarget.isActive ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-green-500 hover:bg-green-600 shadow-green-200'}`}
                >
                  Yes, {statusTarget.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div >
  );
}
