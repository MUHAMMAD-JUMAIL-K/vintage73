export const DEFAULT_CURRENCY = 'AED';
export const DEFAULT_CURRENCY_SYMBOL = 'AED';

export const CURRENCY_LIST = [
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', label: 'AED — د.إ (UAE Dirham)' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', label: 'INR — ₹ (Indian Rupee)' },
  { code: 'USD', symbol: '$', name: 'US Dollar', label: 'USD — $ (US Dollar)' },
  { code: 'EUR', symbol: '€', name: 'Euro', label: 'EUR — € (Euro)' },
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', label: 'SAR — ر.س (Saudi Riyal)' },
  { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', label: 'QAR — ر.ق (Qatari Riyal)' },
  { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial', label: 'OMR — ر.ع. (Omani Rial)' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', label: 'KWD — د.ك (Kuwaiti Dinar)' },
  { code: 'BHD', symbol: 'د.ب', name: 'Bahraini Dinar', label: 'BHD — د.ب (Bahraini Dinar)' },
  { code: 'GBP', symbol: '£', name: 'British Pound', label: 'GBP — £ (British Pound)' }
];

export const CURRENCY_SYMBOLS = {
  AED: 'AED',
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SAR: 'ر.س',
  QAR: 'ر.ق',
  OMR: 'ر.ع.',
  KWD: 'د.ك',
  BHD: 'د.ب'
};

export const RAW_CURRENCY_SYMBOLS = {
  AED: 'د.إ',
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SAR: 'ر.س',
  QAR: 'ر.ق',
  OMR: 'ر.ع.',
  KWD: 'د.ك',
  BHD: 'د.ب'
};

export function getCurrencySymbol(code, options = {}) {
  if (!code) return DEFAULT_CURRENCY_SYMBOL;
  const c = String(code).trim().toUpperCase();
  if (options.raw) {
    return RAW_CURRENCY_SYMBOLS[c] || CURRENCY_SYMBOLS[c] || c;
  }
  return CURRENCY_SYMBOLS[c] || c;
}

export function normalizeCurrencySymbol(symbol, code) {
  const c = (code || DEFAULT_CURRENCY).trim().toUpperCase();
  if (c === 'AED') {
    return symbol === 'د.إ' ? 'د.إ' : 'AED';
  }
  return symbol || getCurrencySymbol(c);
}

export const CURRENCY_LOCALES = {
  AED: 'en-AE',
  INR: 'en-IN',
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
    return { code: DEFAULT_CURRENCY, symbol: DEFAULT_CURRENCY_SYMBOL, locale: 'en-AE' };
  }
  if (typeof branchOrCurrency === 'string') {
    const code = branchOrCurrency.trim().toUpperCase() || DEFAULT_CURRENCY;
    return {
      code,
      symbol: getCurrencySymbol(code),
      locale: CURRENCY_LOCALES[code] || (code === 'AED' ? 'en-AE' : (code === 'INR' ? 'en-IN' : 'en-US'))
    };
  }
  if (typeof branchOrCurrency === 'object') {
    const code = (branchOrCurrency.currencyCode || branchOrCurrency.code || DEFAULT_CURRENCY).trim().toUpperCase();
    const symbol = branchOrCurrency.currencySymbol || branchOrCurrency.symbol || getCurrencySymbol(code);
    const locale = branchOrCurrency.locale || CURRENCY_LOCALES[code] || (code === 'AED' ? 'en-AE' : (code === 'INR' ? 'en-IN' : 'en-US'));
    return { code, symbol, locale };
  }
  return { code: DEFAULT_CURRENCY, symbol: DEFAULT_CURRENCY_SYMBOL, locale: 'en-AE' };
}

export const formatCurrency = (amount, branchOrCurrency = DEFAULT_CURRENCY, locale) => {
  const num = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
  const safeNum = isNaN(num) ? 0 : num;
  const meta = extractCurrencyMeta(branchOrCurrency);
  const code = meta.code || DEFAULT_CURRENCY;
  const targetLocale = locale || meta.locale || CURRENCY_LOCALES[code] || (code === 'AED' ? 'en-AE' : 'en-US');

  try {
    const formatted = new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeNum);
    return formatted.replace(/\u00a0/g, ' ');
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

export function formatAmountWithCurrency(amount, currencyCode = DEFAULT_CURRENCY, currencySymbol) {
  const num = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
  const safeNum = isNaN(num) ? 0 : num;
  const code = (currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
  const meta = {
    code,
    currencyCode: code,
    currencySymbol: currencySymbol || getCurrencySymbol(code)
  };
  return formatCurrency(safeNum, meta);
}

export function resolveActiveCurrency(branch, companyProfile) {
  const code = (branch?.currencyCode || branch?.code || companyProfile?.currencyCode || companyProfile?.code || DEFAULT_CURRENCY).trim().toUpperCase();
  const rawSymbol = branch?.currencySymbol || branch?.symbol || companyProfile?.currencySymbol || companyProfile?.symbol;
  const symbol = normalizeCurrencySymbol(rawSymbol, code);
  return { code, symbol };
}
