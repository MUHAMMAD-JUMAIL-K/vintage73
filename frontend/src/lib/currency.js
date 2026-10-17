export const CURRENCY_LIST = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', label: 'INR — ₹ (Indian Rupee)' },
  { code: 'USD', symbol: '$', name: 'US Dollar', label: 'USD — $ (US Dollar)' },
  { code: 'EUR', symbol: '€', name: 'Euro', label: 'EUR — € (Euro)' },
  { code: 'AED', symbol: '\u202Dد.إ\u202C', name: 'UAE Dirham', label: 'AED — \u202Dد.إ\u202C (UAE Dirham)' }
];

export const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  AED: '\u202Dد.إ\u202C'
};

export const RAW_CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  AED: 'د.إ'
};

export function getCurrencySymbol(code, options = {}) {
  if (!code) return '₹';
  const c = String(code).toUpperCase();
  if (options.raw) {
    return RAW_CURRENCY_SYMBOLS[c] || CURRENCY_SYMBOLS[c] || c;
  }
  return CURRENCY_SYMBOLS[c] || c;
}

export function normalizeCurrencySymbol(symbol, code) {
  if (code?.toUpperCase() === 'AED' || symbol === 'د.إ') {
    return '\u202Dد.إ\u202C';
  }
  return symbol || getCurrencySymbol(code);
}

export const CURRENCY_LOCALES = {
  INR: 'en-IN',
  AED: 'en-AE',
  USD: 'en-US',
  EUR: 'en-IE',
  GBP: 'en-GB',
  OMR: 'en-US',
  SAR: 'en-US',
  KWD: 'en-US',
  QAR: 'en-US',
  BHD: 'en-US'
};

export const formatCurrency = (amount, currencyCode = 'INR', locale) => {
  const num = Number(amount) || 0;
  const code = (currencyCode || 'INR').toUpperCase();
  const defaultLocale = locale || CURRENCY_LOCALES[code] || 'en-IN';
  try {
    return new Intl.NumberFormat(defaultLocale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch (e) {
    const sym = getCurrencySymbol(code);
    return `${sym}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

export function formatAmountWithCurrency(amount, currencyCode = 'INR', currencySymbol) {
  const code = (currencyCode || 'INR').toUpperCase();
  const sym = currencySymbol ? normalizeCurrencySymbol(currencySymbol, code) : getCurrencySymbol(code);
  const numStr = Number(amount || 0).toFixed(2);
  if (code === 'AED') {
    return `${numStr} ${sym}`;
  }
  return `${sym}${numStr}`;
}
