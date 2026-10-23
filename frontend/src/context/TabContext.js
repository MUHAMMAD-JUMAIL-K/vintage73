import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const TabContext = createContext();

export function TabProvider({ children }) {
  const [tabs, setTabs] = useState([]);
  const router = useRouter();

  // Load tabs from localStorage on mount
  useEffect(() => {
    const storedTabs = localStorage.getItem('openTabs');
    if (storedTabs) {
      try {
        setTabs(JSON.parse(storedTabs));
      } catch (e) {
        console.error("Failed to parse tabs", e);
      }
    }
  }, []);

  // Save tabs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('openTabs', JSON.stringify(tabs));
  }, [tabs]);

  const addTab = (tab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.path === tab.path)) return prev;
      return [...prev, tab];
    });
    // Navigate to the new tab only if not already there
    if (router.asPath !== tab.path && router.pathname !== tab.path) {
      router.push(tab.path);
    }
  };

  const removeTab = (path, currentPath) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.path !== path);

      // If we closed the active tab, navigate to the last remaining tab or dashboard
      if (path === currentPath) {
        if (newTabs.length > 0) {
          const target = newTabs[newTabs.length - 1].path;
          if (router.asPath !== target && router.pathname !== target) {
            router.push(target);
          }
        } else {
          if (router.asPath !== '/dashboard' && router.pathname !== '/dashboard') {
            router.push('/dashboard');
          }
        }
      }
      return newTabs;
    });
  };

  const closeAllTabs = () => {
    setTabs([]);
    if (router.asPath !== '/dashboard' && router.pathname !== '/dashboard') {
      router.push('/dashboard');
    }
  };

  const clearAllTabs = () => {
    setTabs([]);
    localStorage.removeItem('openTabs');
  };

  return (
    <TabContext.Provider value={{ tabs, addTab, removeTab, closeAllTabs, clearAllTabs }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  return useContext(TabContext);
}
