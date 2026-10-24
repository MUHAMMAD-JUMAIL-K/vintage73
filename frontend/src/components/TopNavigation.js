import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MENU_STRUCTURE } from '@/lib/menuStructure';
import { useTabs } from '@/context/TabContext';
import { FiChevronDown, FiGrid, FiSearch, FiSettings, FiLogOut } from 'react-icons/fi';

export default function TopNavigation() {
  const router = useRouter();
  const { addTab } = useTabs();
  const [user, setUser] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 });
  const menuScrollRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const searchRef = useRef(null);
  const navRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    // Click outside to close search and module dropdowns
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchTerm('');
      }
      if (navRef.current && !navRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateDropdownPosition = () => {
    if (activeDropdown) {
      const activeBtn = document.querySelector(`[data-group="${activeDropdown}"]`);
      if (activeBtn) {
        const rect = activeBtn.getBoundingClientRect();
        setDropdownPos({ left: rect.left, top: rect.bottom });
      }
    }
  };

  useEffect(() => {
    if (activeDropdown) {
      updateDropdownPosition();
      const menuEl = menuScrollRef.current;
      
      window.addEventListener('resize', updateDropdownPosition);
      window.addEventListener('scroll', updateDropdownPosition, true); // Capture phase for all scrolls
      if (menuEl) menuEl.addEventListener('scroll', updateDropdownPosition);

      return () => {
        window.removeEventListener('resize', updateDropdownPosition);
        window.removeEventListener('scroll', updateDropdownPosition, true);
        if (menuEl) menuEl.removeEventListener('scroll', updateDropdownPosition);
      };
    }
  }, [activeDropdown]);

  const handleMouseEnter = (groupTitle, event) => {
    // Ignore hover events on small screens/touch devices to prevent flickering
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return;

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveDropdown(groupTitle);
    if (event && event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      setDropdownPos({ left: rect.left, top: rect.bottom });
    }
  };

  const handleMouseLeave = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return;

    closeTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 300); // 300ms delay for stability
  };

  const handleItemClick = (item) => {
    addTab({ name: item.name, path: item.path });
    setActiveDropdown(null);
    setSearchTerm(''); // Clear search on selection
  };

  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }

    const results = [];
    MENU_STRUCTURE.forEach(group => {
      // Role-based permission check
      if (user && user.role !== 'admin') {
        const allowedModules = user.allowedModules || [];
        const hasFullGroupAccess = allowedModules.includes(group.title);

        // Skip group if no item is accessible
        const hasAccessibleItems = group.items.some(item =>
          hasFullGroupAccess || allowedModules.includes(`${group.title}:${item.name}`)
        );
        if (!hasAccessibleItems) return;

        group.items.forEach(item => {
          const hasAccess = hasFullGroupAccess || allowedModules.includes(`${group.title}:${item.name}`);
          if (hasAccess && item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push({ ...item, group: group.title });
          }
        });
      } else {
        // Admin or fallback
        group.items.forEach(item => {
          if (item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push({ ...item, group: group.title });
          }
        });
      }
    });
    setSearchResults(results);
  }, [searchTerm, user]);

  const filteredGroups = MENU_STRUCTURE.map(group => {
    if (!user) return null;

    // Global Admin (Level 1) sees everything
    if (user.role === 'admin' && !user.branchId) return group;

    const allowedModules = user.allowedModules || [];
    const hasFullGroupAccess = allowedModules.includes(group.title);

    const visibleItems = group.items.filter(item => {
      if (hasFullGroupAccess) return true;
      if (allowedModules.includes(`${group.title}:${item.name}`)) return true;
      return false;
    });

    if (visibleItems.length > 0) {
      return { ...group, items: visibleItems };
    }
    return null;
  }).filter(Boolean);

  return (
    <nav className="bg-gradient-to-r from-primary-dark to-primary px-2 md:px-4 h-12 md:h-14 flex items-center justify-between gap-2 md:gap-4 shadow-md relative z-[999]">
        <div 
          ref={navRef}
          className="flex-1 flex items-center overflow-hidden"
        >
          {/* Dynamic Menu Groups - Always in one line, scrolls if needed */}
          <div 
            ref={menuScrollRef}
            className="flex items-center gap-1 md:gap-2 overflow-x-auto scroll-line lg:no-scrollbar whitespace-nowrap py-1 w-full scroll-smooth"
          >
            {filteredGroups.map((group, idx) => (
              <div
                key={idx}
                className="relative group h-full flex items-center"
                data-group={group.title}
                onMouseEnter={(e) => handleMouseEnter(group.title, e)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  onClick={(e) => {
                      e.stopPropagation();
                      if (activeDropdown === group.title) {
                          setActiveDropdown(null);
                      } else {
                          // Update position for mobile before showing
                          const rect = e.currentTarget.getBoundingClientRect();
                          setDropdownPos({ left: rect.left, top: rect.bottom });
                          setActiveDropdown(group.title);
                      }
                  }}
                  className={`flex items-center gap-1 md:gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-sm font-semibold capitalize tracking-normal transition-all flex-shrink-0
                          ${activeDropdown === group.title
                      ? 'bg-white text-primary-dark shadow-sm transform scale-105'
                      : 'text-white/90 hover:bg-white/20 hover:text-white'}
                      `}
                >
                  {group.icon && <group.icon className="text-base md:text-lg flex-shrink-0" />}
                  <span className="flex-shrink-0">{group.title.toLowerCase()}</span>
                  <FiChevronDown className={`transition-transform duration-200 flex-shrink-0 ${activeDropdown === group.title ? 'rotate-180' : 'opacity-70'}`} />
                </button>

                {/* Dropdown Menu - Fixed positioning to avoid parent clipping */}
                {activeDropdown === group.title && (
                  <div
                    className="fixed !z-[99999]"
                    style={{ 
                      top: `${dropdownPos.top}px`,
                      left: typeof window !== 'undefined' && window.innerWidth < 768 ? '1rem' : `${dropdownPos.left}px`,
                      right: typeof window !== 'undefined' && window.innerWidth < 768 ? '1rem' : 'auto',
                      minWidth: '240px',
                      paddingTop: '8px' // Buffer spacing
                    }}
                    onMouseEnter={() => handleMouseEnter(group.title)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <div className="bg-white border text-left border-gray-100 rounded-lg shadow-xl py-2 overflow-y-auto max-h-[70vh] md:max-h-none md:overflow-visible">
                      <div className="px-3 py-1.5 mb-1 bg-slate-50 border-b border-gray-50">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.title} Modules</h4>
                      </div>
                      {group.items.map((item) => (
                        <div
                          key={item.path}
                          onClick={() => handleItemClick(item)}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors
                                              ${router.pathname === item.path ? 'bg-primary-light text-primary-dark font-medium border-l-4 border-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-primary-dark'}
                                          `}
                        >
                          <item.icon className={router.pathname === item.path ? 'text-primary' : 'text-slate-400'} />
                          {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>


      <div className="flex items-center gap-4">
        {/* Search Bar */}
        <div className="relative" ref={searchRef}>
        <div className="relative">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-dark" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-32 sm:w-48 pl-8 pr-3 py-1.5 text-sm bg-white border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-800 placeholder-slate-400 shadow-sm/20 transition-all"
          />
        </div>

        {/* Search Results Dropdown - Also fixed on mobile */}
        {searchTerm && searchResults.length > 0 && (
          <div className="fixed md:absolute top-[104px] md:top-full left-4 right-4 md:right-0 md:mt-2 md:w-72 bg-white border border-gray-200 rounded-lg shadow-xl py-2 !z-[99999] md:!z-[99999] max-h-[400px] overflow-y-auto">
            <div className="flex flex-col bg-white border-b border-gray-200 sticky top-0 z-[9999] px-3 py-1.5 mb-1 text-xs font-medium text-slate-400 uppercase">
              Search Results
            </div>
            {searchResults.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleItemClick(item)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-primary-dark cursor-pointer transition-colors"
              >
                <item.icon className="text-slate-400" />
                <div className="flex flex-col">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-[10px] text-slate-400">{item.group}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {searchTerm && searchResults.length === 0 && (
          <div className="fixed md:absolute top-[104px] md:top-full left-4 right-4 md:right-0 md:mt-2 md:w-48 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-center z-[100] md:z-50">
            <p className="text-sm text-slate-500">No results found</p>
          </div>
        )}
      </div>
    </div>
  </nav>
);
}
