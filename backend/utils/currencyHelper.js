const CURRENCY_SYMBOLS = {
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

const RAW_CURRENCY_SYMBOLS = {
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

const DEFAULT_CURRENCY = 'AED';
const DEFAULT_CURRENCY_SYMBOL = 'AED';

function getCurrencySymbol(code, options = {}) {
  if (!code) return DEFAULT_CURRENCY_SYMBOL;
  const c = String(code).trim().toUpperCase();
  if (options.raw) {
    return RAW_CURRENCY_SYMBOLS[c] || CURRENCY_SYMBOLS[c] || c;
  }
  return CURRENCY_SYMBOLS[c] || c;
}

async function resolveCurrency(branchOrQuery, companyProfile) {
  let branch = branchOrQuery;
  if (branchOrQuery?.branchId && !branchOrQuery?.currencyCode) {
    try {
      const prisma = require('../config/prisma');
      branch = await prisma.branch.findUnique({ where: { id: parseInt(branchOrQuery.branchId) } });
    } catch (e) {}
  } else if (typeof branchOrQuery === 'number') {
    try {
      const prisma = require('../config/prisma');
      branch = await prisma.branch.findUnique({ where: { id: branchOrQuery } });
    } catch (e) {}
  }
  const code = (branch?.currencyCode || companyProfile?.currencyCode || DEFAULT_CURRENCY).trim().toUpperCase();
  const rawSymbol = branch?.currencySymbol || companyProfile?.currencySymbol;
  const symbol = rawSymbol || getCurrencySymbol(code);
  return { code, symbol };
}

function formatCurrency(amount, currencyOrBranch = DEFAULT_CURRENCY, currencySymbol) {
  const num = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
  const safeNum = isNaN(num) ? 0 : num;
  let code = DEFAULT_CURRENCY;
  let symbol = currencySymbol;

  if (typeof currencyOrBranch === 'string') {
    code = currencyOrBranch.trim().toUpperCase() || DEFAULT_CURRENCY;
  } else if (currencyOrBranch && typeof currencyOrBranch === 'object') {
    code = (currencyOrBranch.currencyCode || currencyOrBranch.code || DEFAULT_CURRENCY).trim().toUpperCase();
    symbol = symbol || currencyOrBranch.currencySymbol || currencyOrBranch.symbol;
  }

  const isNegative = safeNum < 0;
  const absVal = Math.abs(safeNum).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (code === 'AED') {
    return isNegative ? `-AED ${absVal}` : `AED ${absVal}`;
  }
  const sym = symbol || getCurrencySymbol(code);
  return isNegative ? `-${sym}${absVal}` : `${sym}${absVal}`;
}

module.exports = {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  CURRENCY_SYMBOLS,
  RAW_CURRENCY_SYMBOLS,
  getCurrencySymbol,
  resolveCurrency,
  formatCurrency
};
