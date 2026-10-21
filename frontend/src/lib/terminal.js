import axios from 'axios';
import api from './api';

const TERMINAL_KEY = 'jewellery_terminal_id';

export const getTerminalId = () => {
    if (typeof window === 'undefined') return null;

    let terminalId = localStorage.getItem(TERMINAL_KEY);
    if (!terminalId) {
        terminalId = window.crypto.randomUUID();
        localStorage.setItem(TERMINAL_KEY, terminalId);
    }
    return terminalId;
};

export const checkTerminalAccess = async () => {
    const terminalCode = getTerminalId();
    if (!terminalCode) return { authorized: true, error: true };
    try {
        const baseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
        const { data } = await axios.get(`${baseUrl}/api/terminals/check?terminalCode=${terminalCode}`);
        return data; // { authorized: boolean, registered: boolean, terminal: {} }
    } catch (err) {
        // Do not crash or trigger session logout interceptor on terminal check failures
        console.warn('Terminal check could not be completed:', err.response?.data?.message || err.message);
        return { authorized: true, error: true }; // Fallback to avoid blocking cashier on network/terminal issue
    }
};

export const registerThisTerminal = async (name, branchId) => {
    const terminalCode = getTerminalId();
    try {
        const { data } = await api.post('/terminals/register', {
            terminalCode,
            name,
            branchId
        });
        return data;
    } catch (err) {
        throw err;
    }
};
