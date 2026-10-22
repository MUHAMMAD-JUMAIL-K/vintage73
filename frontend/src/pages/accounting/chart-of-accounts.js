import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiDownload, FiFilter, FiX, FiRotateCcw, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import SearchableSelect from '@/components/SearchableSelect';
import { formatCurrency } from '@/lib/currency';

export default function ChartOfAccounts() {
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    // Advanced Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState('ALL');
    const [selectedGroup, setSelectedGroup] = useState('ALL');
    const [selectedBalanceFilter, setSelectedBalanceFilter] = useState('ALL');
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [formData, setFormData] = useState({
        name: '',
        groupId: '',
        openingBalance: '0',
        balanceType: 'DEBIT',
        description: ''
    });
    const [editingId, setEditingId] = useState(null);

    // Branch Filtering & Currency
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [activeBranch, setActiveBranch] = useState(null);
    const [activeCurrency, setActiveCurrency] = useState({ code: 'INR', symbol: '₹' });

    useEffect(() => {
        fetchBranches();
        fetchData();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data || []);
        } catch (err) {
            console.error('Failed to load branches', err);
        }
    };

    const fetchData = async (overrideBranchId) => {
        setLoading(true);
        const targetBranchId = overrideBranchId !== undefined ? overrideBranchId : selectedBranch;
        try {
            const [ledgersRes, groupsRes] = await Promise.all([
                api.get('/accounting/ledgers', {
                    params: {
                        details: 'true',
                        branchId: targetBranchId || undefined
                    }
                }),
                api.get('/accounting/groups')
            ]);

            if (ledgersRes.data && ledgersRes.data.ledgers) {
                setLedgers(ledgersRes.data.ledgers);
                setActiveBranch(ledgersRes.data.branch || null);
                setActiveCurrency(ledgersRes.data.currency || { code: 'INR', symbol: '₹' });
            } else {
                setLedgers(Array.isArray(ledgersRes.data) ? ledgersRes.data : []);
                setActiveBranch(null);
                setActiveCurrency({ code: 'INR', symbol: '₹' });
            }

            setGroups(groupsRes.data || []);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.groupId) {
            toast.error('Account Group is required');
            return;
        }
        try {
            if (editingId) {
                await api.put(`/accounting/ledgers/${editingId}`, formData);
                toast.success('Ledger updated successfully');
            } else {
                await api.post('/accounting/ledgers', formData);
                toast.success('Ledger created successfully');
            }
            setIsModalOpen(false);
            resetForm();
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save ledger');
        }
    };

    const handleEdit = (ledger) => {
        setFormData({
            name: ledger.name,
            groupId: ledger.groupId.toString(),
            openingBalance: ledger.openingBalance.toString(),
            balanceType: ledger.balanceType,
            description: ledger.description || ''
        });
        setEditingId(ledger.id);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this ledger?')) return;

        try {
            await api.delete(`/accounting/ledgers/${id}`);
            toast.success('Ledger deleted successfully');
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete ledger');
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            groupId: '',
            openingBalance: '0',
            balanceType: 'DEBIT',
            description: ''
        });
        setEditingId(null);
    };

    // Derived collections for filters
    const availableGroups = Array.from(
        new Set(
            [
                ...groups.map(g => g.name),
                ...ledgers.map(l => l.group?.name)
            ].filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));

    const typeCounts = ledgers.reduce((acc, l) => {
        const t = l.group?.groupType || 'OTHER';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {});

    // Filter ledgers based on all active criteria
    const filteredLedgers = ledgers.filter(ledger => {
        // Search filter (name, group, description)
        if (searchTerm.trim()) {
            const query = searchTerm.toLowerCase();
            const matchesName = (ledger.name || '').toLowerCase().includes(query);
            const matchesGroup = (ledger.group?.name || '').toLowerCase().includes(query);
            const matchesDesc = (ledger.description || '').toLowerCase().includes(query);
            if (!matchesName && !matchesGroup && !matchesDesc) return false;
        }

        // Account Type filter
        if (selectedType !== 'ALL' && ledger.group?.groupType !== selectedType) {
            return false;
        }

        // Account Group filter
        if (selectedGroup !== 'ALL' && ledger.group?.name !== selectedGroup) {
            return false;
        }

        // Balance Filter
        const bal = parseFloat(ledger.currentBalance || 0);
        if (selectedBalanceFilter === 'NON_ZERO' && Math.abs(bal) < 0.001) return false;
        if (selectedBalanceFilter === 'ZERO' && Math.abs(bal) >= 0.001) return false;
        if (selectedBalanceFilter === 'DR' && bal <= 0) return false;
        if (selectedBalanceFilter === 'CR' && bal >= 0) return false;

        // Ledger Origin / Category
        if (selectedCategory === 'SYSTEM' && !ledger.isSystem) return false;
        if (selectedCategory === 'CUSTOM' && ledger.isSystem) return false;

        return true;
    });

    const isFiltered = Boolean(
        searchTerm.trim() ||
        selectedType !== 'ALL' ||
        selectedGroup !== 'ALL' ||
        selectedBalanceFilter !== 'ALL' ||
        selectedCategory !== 'ALL'
    );

    // Pagination state (15 ledgers per page)
    const PAGE_SIZE = 15;
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(filteredLedgers.length / PAGE_SIZE));

    // Reset page to 1 whenever any filter or branch changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedType, selectedGroup, selectedBalanceFilter, selectedCategory, selectedBranch]);

    // Ensure current page does not exceed total pages when list shrinks
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paginatedLedgers = filteredLedgers.slice(startIndex, startIndex + PAGE_SIZE);

    const resetFilters = () => {
        setSearchTerm('');
        setSelectedType('ALL');
        setSelectedGroup('ALL');
        setSelectedBalanceFilter('ALL');
        setSelectedCategory('ALL');
        setCurrentPage(1);
    };

    // Export to CSV with filter context
    const handleExport = () => {
        const branchLabel = activeBranch ? activeBranch.name : 'All Branches (Consolidated)';
        const currLabel = activeCurrency?.code || 'INR';

        const filterSummary = [];
        if (searchTerm.trim()) filterSummary.push(`Search: "${searchTerm.trim()}"`);
        if (selectedType !== 'ALL') filterSummary.push(`Type: ${selectedType}`);
        if (selectedGroup !== 'ALL') filterSummary.push(`Group: ${selectedGroup}`);
        if (selectedBalanceFilter !== 'ALL') filterSummary.push(`Balance: ${selectedBalanceFilter}`);
        if (selectedCategory !== 'ALL') filterSummary.push(`Category: ${selectedCategory}`);

        const csvContent = [
            ['Report', 'Chart of Accounts'],
            ['Branch', `"${branchLabel.replace(/"/g, '""')}"`],
            ['Currency', currLabel],
            ['Filters Applied', filterSummary.length ? `"${filterSummary.join(' | ')}"` : 'None (All Ledgers)'],
            ['Matching Ledgers', filteredLedgers.length],
            [],
            ['#', 'Ledger Name', 'Description', 'Group', 'Type', `Opening Balance [${currLabel}]`, `Current Balance [${currLabel}]`, 'Balance Type', 'Category'],
            ...filteredLedgers.map((l, idx) => [
                idx + 1,
                `"${(l.name || '').replace(/"/g, '""')}"`,
                `"${(l.description || '').replace(/"/g, '""')}"`,
                `"${(l.group?.name || '').replace(/"/g, '""')}"`,
                l.group?.groupType || '',
                (parseFloat(l.openingBalance) || 0).toFixed(2),
                (parseFloat(l.currentBalance || 0)).toFixed(2),
                l.balanceType,
                l.isSystem ? 'System' : 'Custom'
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const branchFilename = activeBranch ? `_${activeBranch.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '_AllBranches';
        a.download = `chart-of-accounts${branchFilename}.csv`;
        a.click();
    };

    return (
        <div className="p-4 sm:p-6 w-full min-h-screen animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800">Chart of Accounts</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-slate-500 text-sm">{filteredLedgers.length} ledgers</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {activeBranch ? `Branch: ${activeBranch.name}` : 'Consolidated (All Branches)'}
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Currency: {activeCurrency?.code || 'INR'} ({activeCurrency?.symbol || '₹'})
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Branch:</span>
                        <select
                            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                            value={selectedBranch}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSelectedBranch(val);
                                fetchData(val);
                            }}
                        >
                            <option value="">All Branches (Consolidated)</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.name} ({b.currencyCode || 'INR'})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleExport}
                        className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all cursor-pointer"
                    >
                        <FiDownload size={16} /> Export CSV
                    </button>
                    <button
                        onClick={() => {
                            resetForm();
                            setIsModalOpen(true);
                        }}
                        className="bg-primary text-white px-5 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 hover:bg-primary-dark transition-all shadow-sm cursor-pointer"
                    >
                        <FiPlus size={16} /> Add Ledger
                    </button>
                </div>
            </div>

            {/* Quick Account Type Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {[
                    { id: 'ALL', label: 'All Accounts', count: ledgers.length },
                    { id: 'ASSETS', label: 'Assets', count: typeCounts.ASSETS || 0 },
                    { id: 'LIABILITIES', label: 'Liabilities', count: typeCounts.LIABILITIES || 0 },
                    { id: 'INCOME', label: 'Income', count: typeCounts.INCOME || 0 },
                    { id: 'EXPENSES', label: 'Expenses', count: typeCounts.EXPENSES || 0 },
                    { id: 'EQUITY', label: 'Equity', count: typeCounts.EQUITY || 0 },
                ].map(tab => {
                    const isSelected = selectedType === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedType(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                                isSelected
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <span>{tab.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Filter Controls Card */}
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm mb-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                    {/* Search */}
                    <div className="lg:col-span-4 relative">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search ledger name, group, remarks..."
                            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                title="Clear search"
                            >
                                <FiX size={14} />
                            </button>
                        )}
                    </div>

                    {/* Account Group Dropdown */}
                    <div className="lg:col-span-3">
                        <select
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all cursor-pointer"
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                        >
                            <option value="ALL">All Groups ({availableGroups.length})</option>
                            {availableGroups.map(grp => (
                                <option key={grp} value={grp}>{grp}</option>
                            ))}
                        </select>
                    </div>

                    {/* Balance Status Dropdown */}
                    <div className="lg:col-span-2">
                        <select
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all cursor-pointer"
                            value={selectedBalanceFilter}
                            onChange={(e) => setSelectedBalanceFilter(e.target.value)}
                        >
                            <option value="ALL">All Balances</option>
                            <option value="NON_ZERO">With Balance (Non-Zero)</option>
                            <option value="ZERO">Zero Balance Only</option>
                            <option value="DR">Debit (Dr) Balances</option>
                            <option value="CR">Credit (Cr) Balances</option>
                        </select>
                    </div>

                    {/* Origin / Classification Dropdown */}
                    <div className="lg:col-span-2">
                        <select
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all cursor-pointer"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            <option value="ALL">All Categories</option>
                            <option value="CUSTOM">Custom Ledgers</option>
                            <option value="SYSTEM">System Ledgers</option>
                        </select>
                    </div>

                    {/* Reset Button */}
                    <div className="lg:col-span-1 flex items-center justify-end">
                        {isFiltered ? (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="w-full lg:w-auto px-3 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                title="Reset all filters"
                            >
                                <FiRotateCcw size={13} />
                                <span>Reset</span>
                            </button>
                        ) : (
                            <span className="text-[11px] font-semibold text-slate-400 hidden lg:inline-flex items-center justify-end w-full gap-1">
                                <FiFilter size={12} />
                                Filters
                            </span>
                        )}
                    </div>
                </div>

                {/* Active filter badges indicator */}
                {isFiltered && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-400 font-medium text-[11px] uppercase tracking-wider">Active:</span>
                        {searchTerm && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-xs">
                                Search: "{searchTerm}"
                                <button type="button" onClick={() => setSearchTerm('')} className="hover:text-red-500 cursor-pointer"><FiX size={12} /></button>
                            </span>
                        )}
                        {selectedType !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-medium text-xs">
                                Type: {selectedType}
                                <button type="button" onClick={() => setSelectedType('ALL')} className="hover:text-red-500 cursor-pointer"><FiX size={12} /></button>
                            </span>
                        )}
                        {selectedGroup !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-xs">
                                Group: {selectedGroup}
                                <button type="button" onClick={() => setSelectedGroup('ALL')} className="hover:text-red-500 cursor-pointer"><FiX size={12} /></button>
                            </span>
                        )}
                        {selectedBalanceFilter !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs">
                                Balance: {
                                    selectedBalanceFilter === 'NON_ZERO' ? 'With Balance' :
                                    selectedBalanceFilter === 'ZERO' ? 'Zero Balance' :
                                    selectedBalanceFilter === 'DR' ? 'Debit (Dr)' : 'Credit (Cr)'
                                }
                                <button type="button" onClick={() => setSelectedBalanceFilter('ALL')} className="hover:text-red-500 cursor-pointer"><FiX size={12} /></button>
                            </span>
                        )}
                        {selectedCategory !== 'ALL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-medium text-xs">
                                Category: {selectedCategory === 'SYSTEM' ? 'System' : 'Custom'}
                                <button type="button" onClick={() => setSelectedCategory('ALL')} className="hover:text-red-500 cursor-pointer"><FiX size={12} /></button>
                            </span>
                        )}
                        <span className="text-slate-400 text-xs ml-auto">
                            Showing <strong className="text-slate-700">{filteredLedgers.length}</strong> of <strong className="text-slate-700">{ledgers.length}</strong> ledgers
                        </span>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-400">Loading...</div>
            ) : (
                <div className="card shadow-md border border-slate-200">
                    <div className="table-container scroll-line lg:no-scrollbar overflow-x-auto shadow-sm border border-slate-200">
                        <table className="table-modern w-full">
                            <thead>
                                <tr className="whitespace-nowrap">
                                    <th style={{ width: '4%' }}>#</th>
                                    <th style={{ width: '26%' }}>Ledger Name</th>
                                    <th style={{ width: '18%' }}>Group</th>
                                    <th style={{ width: '10%' }}>Type</th>
                                    <th className="text-right" style={{ width: '13%' }}>Opening Balance</th>
                                    <th className="text-right" style={{ width: '13%' }}>Current Balance</th>
                                    <th className="text-center" style={{ width: '6%' }}>Dr/Cr</th>
                                    <th className="text-center" style={{ width: '10%' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLedgers.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="text-center py-8 text-slate-400">
                                            No ledgers found
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedLedgers.map((ledger, index) => {
                                        const rowNumber = startIndex + index + 1;
                                        return (
                                            <tr key={ledger.id}>
                                                <td className="text-slate-500">
                                                    {rowNumber}
                                                </td>
                                                <td className="font-semibold text-slate-800">
                                                    {ledger.name}
                                                    {ledger.description && (
                                                        <div className="text-[10px] text-slate-500 font-normal mt-0">
                                                            {ledger.description}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="text-slate-600">
                                                    {ledger.group?.name || '-'}
                                                </td>
                                                <td>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${ledger.group?.groupType === 'ASSETS' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                                        ledger.group?.groupType === 'LIABILITIES' ? 'bg-red-50 text-red-700 border border-red-100' :
                                                            ledger.group?.groupType === 'EQUITY' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                                                ledger.group?.groupType === 'INCOME' ? 'bg-primary-light/10 text-primary border border-primary/20' :
                                                                    ledger.group?.groupType === 'EXPENSES' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                                                                        'bg-slate-50 text-slate-700'
                                                        }`}>
                                                        {ledger.group?.groupType || '-'}
                                                    </span>
                                                </td>
                                                <td className="text-right font-mono text-slate-700">
                                                    {formatCurrency(ledger.openingBalance, activeCurrency)}
                                                </td>
                                                <td className="text-right font-mono font-semibold">
                                                    <span className={parseFloat(ledger.currentBalance || 0) >= 0 ? 'text-primary' : 'text-red-600'}>
                                                        {formatCurrency(ledger.currentBalance || 0, activeCurrency)}
                                                    </span>
                                                </td>
                                                <td className="text-center">
                                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ledger.balanceType === 'DEBIT'
                                                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                                        : 'bg-green-50 text-green-700 border border-green-100'
                                                        }`}>
                                                        {ledger.balanceType === 'DEBIT' ? 'Dr' : 'Cr'}
                                                    </span>
                                                </td>
                                                <td className="text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleEdit(ledger)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <FiEdit2 size={14} />
                                                        </button>
                                                        {!ledger.isSystem && (
                                                            <button
                                                                onClick={() => handleDelete(ledger.id)}
                                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <FiTrash2 size={14} />
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

                    {/* Summary & Pagination Footer */}
                    <div className="bg-slate-50 border-t border-slate-300 px-4 py-3 flex flex-col lg:flex-row justify-between items-center gap-4">
                        {/* Summary Info */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm">
                            <div className="text-slate-600">
                                {filteredLedgers.length === 0 ? (
                                    '0 ledgers'
                                ) : (
                                    <>
                                        Showing <span className="font-semibold text-slate-900">{startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filteredLedgers.length)}</span> of <span className="font-semibold text-slate-900">{filteredLedgers.length}</span> ledgers
                                        <span className="text-slate-400 ml-1.5">(Page {currentPage} of {totalPages})</span>
                                        {isFiltered && (
                                            <span className="ml-2 text-xs font-semibold text-primary px-2 py-0.5 bg-primary/10 rounded-full">Filtered view</span>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="hidden sm:block text-slate-300">|</div>
                            <div className="flex flex-wrap gap-4 text-xs sm:text-sm">
                                <div>
                                    <span className="text-slate-500">{isFiltered ? 'Filtered' : 'Total'} Opening: </span>
                                    <span className="font-medium text-slate-800">
                                        {formatCurrency(filteredLedgers.reduce((sum, l) => sum + parseFloat(l.openingBalance || 0), 0), activeCurrency)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500">{isFiltered ? 'Filtered' : 'Total'} Current: </span>
                                    <span className="font-medium text-primary">
                                        {formatCurrency(filteredLedgers.reduce((sum, l) => sum + parseFloat(l.currentBalance || 0), 0), activeCurrency)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Pagination Arrow Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                    title="Previous Page"
                                >
                                    <FiChevronLeft size={16} />
                                    <span className="hidden sm:inline">Previous</span>
                                </button>

                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                                        // Show first, last, and window around current page
                                        if (
                                            pageNum === 1 ||
                                            pageNum === totalPages ||
                                            (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                                        ) {
                                            const isActive = pageNum === currentPage;
                                            return (
                                                <button
                                                    key={pageNum}
                                                    type="button"
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                        isActive
                                                            ? 'bg-primary text-white shadow-sm'
                                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        }
                                        if (
                                            (pageNum === 2 && currentPage > 3) ||
                                            (pageNum === totalPages - 1 && currentPage < totalPages - 2)
                                        ) {
                                            return <span key={pageNum} className="px-1 text-slate-400 text-xs font-bold select-none">...</span>;
                                        }
                                        return null;
                                    })}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                    title="Next Page"
                                >
                                    <span className="hidden sm:inline">Next</span>
                                    <FiChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-200 shrink-0">
                            <h2 className="text-xl font-semibold text-slate-800">
                                {editingId ? 'Edit Ledger' : 'Add New Ledger'}
                            </h2>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                                    Ledger Name *
                                </label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                                    Account Group *
                                </label>
                                <SearchableSelect
                                    options={groups.map(group => ({
                                        value: group.id,
                                        label: group.parent ? `${group.parent.name} > ${group.name}` : group.name
                                    }))}
                                    value={formData.groupId}
                                    onChange={val => setFormData({ ...formData, groupId: val })}
                                    placeholder="Select Group"
                                    direction="down"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                                        Opening Balance
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        value={formData.openingBalance}
                                        onChange={e => setFormData({ ...formData, openingBalance: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                                        Balance Type
                                    </label>
                                    <SearchableSelect
                                        options={[
                                            { value: 'DEBIT', label: 'Debit' },
                                            { value: 'CREDIT', label: 'Credit' }
                                        ]}
                                        value={formData.balanceType}
                                        onChange={val => setFormData({ ...formData, balanceType: val })}
                                        placeholder="Select Type"
                                        direction="down"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                                    Description (Optional)
                                </label>
                                <textarea
                                    rows="2"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        resetForm();
                                    }}
                                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-semibold text-sm text-slate-700 hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-dark transition-all"
                                >
                                    {editingId ? 'Update' : 'Create'} Ledger
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
