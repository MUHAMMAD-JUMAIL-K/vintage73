import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    const token = localStorage.getItem('token');
    if (token) {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user.role === 'customer') {
            router.replace('/customer-dashboard');
          } else {
            router.replace('/dashboard');
          }
        } catch (e) {
          router.replace('/dashboard');
        }
      } else {
        router.replace('/dashboard');
      }
    } else {
      router.replace('/login');
    }
  }, []);

  return <div className="flex items-center justify-center h-screen">Loading...</div>;
}
