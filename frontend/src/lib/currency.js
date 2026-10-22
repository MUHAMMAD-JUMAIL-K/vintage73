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

export function extractCurrencyMeta(branchOrCurrency) {
  if (!branchOrCurrency) {
    return { code: 'INR', symbol: '₹', locale: 'en-IN' };
  }
  if (typeof branchOrCurrency === 'string') {
    const code = branchOrCurrency.trim().toUpperCase() || 'INR';
    return {
      code,
      symbol: getCurrencySymbol(code),
      locale: CURRENCY_LOCALES[code] || (code === 'INR' ? 'en-IN' : 'en-US')
    };
  }
  if (typeof branchOrCurrency === 'object') {
    const code = (branchOrCurrency.currencyCode || branchOrCurrency.code || 'INR').trim().toUpperCase();
    const symbol = branchOrCurrency.currencySymbol || branchOrCurrency.symbol || getCurrencySymbol(code);
    const locale = branchOrCurrency.locale || CURRENCY_LOCALES[code] || (code === 'INR' ? 'en-IN' : 'en-US');
    return { code, symbol, locale };
  }
  return { code: 'INR', symbol: '₹', locale: 'en-IN' };
}

export const formatCurrency = (amount, branchOrCurrency = 'INR', locale) => {
  const num = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
  const safeNum = isNaN(num) ? 0 : num;
  const meta = extractCurrencyMeta(branchOrCurrency);
  const code = meta.code;
  const targetLocale = locale || meta.locale || CURRENCY_LOCALES[code] || 'en-IN';

  try {
    return new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeNum);
  } catch (e) {
    const isNegative = safeNum < 0;
    const absVal = Math.abs(safeNum).toLocaleString(targetLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const sym = meta.symbol || getCurrencySymbol(code);
    if (code === 'AED') {
      return isNegative ? `-AED ${absVal}` : `AED ${absVal}`;
    }
    return isNegative ? `-${sym}${absVal}` : `${sym}${absVal}`;
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
