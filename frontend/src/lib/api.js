import axios from 'axios';

const getBaseURL = () => {
  return `${process.env.NEXT_PUBLIC_API_URL}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
});

export const getServerUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL;
};

// Request Interceptor
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const activeBranchId = localStorage.getItem('activeBranchId');
    if (activeBranchId && !config.headers['x-branch-id']) {
      config.headers['x-branch-id'] = activeBranchId;
    }
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      if (status === 401) {
        // Token expired or invalid
        console.warn('[API] session expired or unauthorized');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          // Optional: redirect to login if not already there
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login?reason=expired';
          }
        }
      } else if (status === 500) {
        console.error('[API] Internal Server Error:', data.message || 'Unknown error');
      }
    } else if (error.request) {
      console.error('[API] Network Error: No response received');
    } else {
      console.error('[API] Request Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
