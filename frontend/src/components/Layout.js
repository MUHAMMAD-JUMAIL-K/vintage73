import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import TopNavigation from './TopNavigation';
import TabBar from './TabBar';
import { FiLogOut, FiMapPin, FiArrowLeft, FiAlertTriangle } from 'react-icons/fi';
import api, { getServerUrl } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { useTabs } from '@/context/TabContext';
import NotificationBell from './NotificationBell';
import ChatSidebar from './ChatSidebar';
import { initSocket, disconnectSocket } from '@/utils/socket';
import { IoChatbubbleEllipsesOutline } from 'react-icons/io5';

export default function Layout({ children }) {
  const router = useRouter();
  const { theme } = useTheme();
  const { clearAllTabs } = useTabs();
  const noLauncher = ['/login', '/setup', '/_error'];
  const showNavigation = !noLauncher.includes(router.pathname);
  const [user, setUser] = useState(null);
  const [loginTime, setLoginTime] = useState('');
  const [branch, setBranch] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [unclosedInfo, setUnclosedInfo] = useState(null);

  useEffect(() => {
    // Company Profile is now managed by ThemeContext

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);

      if (userData.role !== 'customer') {
        initSocket(userData.id);
        fetchUnreadCount();
        checkUnclosedDayClose();

        const socket = initSocket(userData.id);
        socket.on('receive_message', () => {
          fetchUnreadCount();
        });

        // Fallback: Fetch branch name if missing from existing session
        const branchIdToLoad = userData.branchId || localStorage.getItem('activeBranchId');
        if (branchIdToLoad) {
          api.get(`/branches/${branchIdToLoad}`)
            .then(res => {
              setBranch(res.data);
              if (userData.branchId) {
                const updatedUser = { ...userData, branchName: res.data.name };
                localStorage.setItem('user', JSON.stringify(updatedUser));
              }
            })
            .catch(err => {
              console.error("Error fetching branch:", err);
              if (userData.branchName) setBranch({ name: userData.branchName, currencyCode: 'AED' });
            });
        } else if (userData.branchName) {
          setBranch({ name: userData.branchName, currencyCode: 'AED' });
        }
      } else {
        // Customers also get socket for real-time notifications
        initSocket(userData.id);
        if (userData.branchName) {
          setBranch({ name: userData.branchName, currencyCode: 'AED' });
        }
      }
    }

    const handleActiveBranchEvent = (e) => {
      const bId = e.detail?.branchId || localStorage.getItem('activeBranchId');
      if (bId) {
        api.get(`/branches/${bId}`)
          .then(res => setBranch(res.data))
          .catch(() => {});
      } else {
        const u = localStorage.getItem('user');
        const parsed = u ? JSON.parse(u) : null;
        if (!parsed?.branchId) setBranch(null);
      }
    };
    window.addEventListener('activeBranchChanged', handleActiveBranchEvent);

    // Set login time (simulated for today's session)
    if (!loginTime) {
      setLoginTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

    return () => {
      window.removeEventListener('activeBranchChanged', handleActiveBranchEvent);
    };
  }, [router.pathname]);

  const checkUnclosedDayClose = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await api.get('/day-close/check-unclosed');
      if (res.data && res.data.hasUnclosed) {
        setUnclosedInfo(res.data);
      } else {
        setUnclosedInfo(null);
      }
    } catch (err) {
      console.error('Error checking unclosed day close:', err);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await api.get('/chat/conversations');
      const total = res.data.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      setTotalUnread(total);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const handleLogout = () => {
    disconnectSocket();
    clearAllTabs(); // Clear all tabs from state and localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = '/login'; // Force full reload to clear any context states if needed
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col relative">
      {/* Global Screen Layout Wallpaper - Only visible on Main Menu */}
      {(router.pathname === '/' || router.pathname === '/dashboard') && theme.companyProfile?.dashboardImageUrl && (
        <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none mt-24 pb-12 px-4 md:px-6">
          <img
            src={`${getServerUrl()}${theme.companyProfile.dashboardImageUrl}`}
            alt="Layout Background"
            className="h-[500px] w-auto max-w-5xl object-contain opacity-80 shadow-sm"
          />
        </div>
      )}

      {showNavigation && (
        <div className="flex flex-col bg-white border-b border-gray-200 sticky top-0 z-[9999]">
          {/* 1. Global Header */}
          <header className="h-14 flex items-center justify-between px-3 md:px-6 border-b border-gray-100">
            {/* Left - Logo */}
            <div className="flex items-center gap-2 md:gap-3">
              {theme.companyProfile?.logoUrl ? (
                <img
                  src={`${getServerUrl()}${theme.companyProfile.logoUrl}`}
                  alt="Company Logo"
                  className="h-8 md:h-10 w-auto object-contain"
                />
              ) : (
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white font-medium text-base md:text-lg shadow-sm" style={{ backgroundColor: theme.primaryColor }}>
                  {(theme.companyProfile?.companyName || 'P').charAt(0).toUpperCase()}
                </div>
              )}
              <h1 className="text-lg md:text-xl font-semibold text-slate-800 tracking-tight truncate max-w-[120px] sm:max-w-none">
                {theme.companyProfile?.companyName || 'Inventory'}
              </h1>
            </div>

            {/* Right - Profile & Global Actions */}
            <div className="flex items-center gap-2 md:gap-6">
              {branch && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-50 text-slate-700 rounded-full border border-gray-200 text-xs">
                  <FiMapPin className="text-xs text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">{branch.name}</span>
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black text-[10px]">
                    {branch.currencyCode || 'AED'}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 md:gap-3 md:pl-6 md:border-l md:border-gray-100">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-800 leading-none">{user?.name || user?.username || 'Guest'}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Logged in: {loginTime}</p>
                </div>
                <div
                  className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white font-medium text-xs md:text-sm border-2 border-white ring-2 ring-gray-100"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="flex items-center gap-1 md:gap-2 ml-1 md:ml-4">
                  {user?.role !== 'customer' && (
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className="p-1.5 md:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
                      title="Internal Chat"
                    >
                      <IoChatbubbleEllipsesOutline className="text-xl md:text-2xl text-gray-600 dark:text-gray-300" />
                      {totalUnread > 0 && (
                        <span className="absolute top-0 right-0 md:top-1 md:right-1 bg-blue-500 text-white text-[9px] md:text-[10px] w-3.5 h-3.5 md:w-4 md:h-4 flex items-center justify-center rounded-full font-medium border-2 border-white dark:border-gray-800">
                          {totalUnread}
                        </span>
                      )}
                    </button>
                  )}
                  <NotificationBell />
                </div>

                <button
                  onClick={handleLogout}
                  className="p-1.5 md:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all ml-0 md:ml-2"
                  title="Logout"
                >
                  <FiLogOut className="text-lg md:text-xl" />
                </button>
              </div>
            </div>
          </header>

          {/* 2. Top Navigation Bar */}
          <TopNavigation />

          {/* 3. Open Tabs Bar */}
          <TabBar />
        </div>
      )}

      {/* 4. Main Content Area */}
      <main className="flex-1 overflow-x-hidden p-3 md:p-6 relative">
        <div className="max-w-[1920px] mx-auto">
          {unclosedInfo?.hasUnclosed && router.pathname !== '/settings/day-close' && (
            <div className="mb-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 rounded-xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <FiAlertTriangle className="text-xl text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Day Close Pending!</h4>
                  <p className="text-xs text-amber-50 mt-0.5">
                    You have not closed the business date <span className="font-bold text-white">{unclosedInfo.unclosedDateDisplay || unclosedInfo.unclosedDate}</span>. Please complete the pending Day Close before proceeding to a later date.
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push(`/settings/day-close?date=${unclosedInfo.unclosedDate}`)}
                className="px-4 py-2 bg-white text-amber-900 text-xs font-bold rounded-lg shadow-sm hover:bg-amber-50 transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                Go to Day Close →
              </button>
            </div>
          )}
          {children}
        </div>
      </main>
      {/* 5. Right Sidebar Chat */}
      <ChatSidebar isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
