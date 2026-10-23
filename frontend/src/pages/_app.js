import '@/styles/globals.css';
import 'react-toastify/dist/ReactToastify.css';
import Layout from '@/components/Layout';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import { TabProvider } from '@/context/TabContext';
import { ThemeProvider } from '@/context/ThemeContext';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Environment Check
    if (!process.env.NEXT_PUBLIC_API_URL) {
      console.warn('⚠️ CRITICAL: NEXT_PUBLIC_API_URL is not defined! API calls will fail.');
    }

    // Basic Auth Check
    const token = localStorage.getItem('token');
    const publicPaths = ['/login', '/setup'];

    if (!token && !publicPaths.includes(router.pathname)) {
      router.replace('/login');
    }
  }, [router.pathname]);

  if (!mounted) return null; // Prevent hydration mismatch

  return (
    <ThemeProvider>
      <TabProvider>
        <Layout>
          <Component {...pageProps} />
          <ToastContainer
            position="bottom-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            style={{ zIndex: 99999 }}
          />
        </Layout>
      </TabProvider>
    </ThemeProvider>
  );
}
