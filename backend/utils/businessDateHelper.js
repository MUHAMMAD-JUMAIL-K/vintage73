const prisma = require('../config/prisma');

// TIMEZONE: Asia/Kolkata (IST, UTC+5:30)
// Use Intl.DateTimeFormat so the date is always correct regardless of server OS timezone.
const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current date as YYYY-MM-DD in IST, or converts a given Date/string to IST date.
 */
const getLocalDateString = (d = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(new Date(d));
};

// Helper to get Date object at start of UTC day for @db.Date storage (Prisma @db.Date expects UTC midnight)
const getUtcDateObj = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Helper to format date for UI display (DD/MM/YYYY)
const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Gets the authoritative active business date for a branch.
 * Returns the earliest unclosed business date with activity, or today's date (IST) if all previous dates are closed.
 * @param {number} branchId
 * @returns {Promise<{ dateStr: string, dateObj: Date, isPendingPrevious: boolean }>}
 */
async function getBranchActiveBusinessDate(branchId) {
  const todayStr = getLocalDateString(); // YYYY-MM-DD in IST
  const todayUtc = getUtcDateObj(todayStr);

  if (!branchId) {
    const [ty, tm, td] = todayStr.split('-').map(Number);
    return {
      dateStr: todayStr,
      dateObj: new Date(ty, tm - 1, td, 12, 0, 0, 0),
      isPendingPrevious: false
    };
  }

  // Look back up to 60 days for any unclosed dates with activity or opened sessions
  const sixtyDaysAgo = new Date(todayUtc);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [pastSales, pastOpenedSessions] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId: parseInt(branchId),
        saleDate: {
          gte: sixtyDaysAgo,
          lt: todayUtc  // strictly before today — today's activity is added to today
        },
        status: { not: 'cancelled' }
      },
      select: { saleDate: true },
      orderBy: { saleDate: 'asc' }
    }),
    prisma.dayClose.findMany({
      where: {
        branchId: parseInt(branchId),
        businessDate: {
          gte: sixtyDaysAgo,
          lt: todayUtc
        },
        status: { notIn: ['CLOSED', 'ADMIN_CLOSED'] }
      },
      select: { businessDate: true },
      orderBy: { businessDate: 'asc' }
    })
  ]);

  // Combine and sort all distinct past dates (IST)
  const distinctPastDates = Array.from(new Set([
    ...pastSales.map(s => getLocalDateString(s.saleDate)),
    ...pastOpenedSessions.map(o => getLocalDateString(o.businessDate))
  ])).sort((a, b) => a.localeCompare(b));

  for (const pDateStr of distinctPastDates) {
    const pUtc = getUtcDateObj(pDateStr);
    const existing = await prisma.dayClose.findUnique({
      where: {
        branchId_businessDate: {
          branchId: parseInt(branchId),
          businessDate: pUtc
        }
      }
    });

    if (!existing || (existing.status !== 'CLOSED' && existing.status !== 'ADMIN_CLOSED')) {
      // Unclosed past date found — this is the active business date
      const [y, m, d] = pDateStr.split('-').map(Number);
      return {
        dateStr: pDateStr,
        dateObj: new Date(y, m - 1, d, 12, 0, 0, 0),
        isPendingPrevious: true
      };
    }
  }

  // All past dates are closed — today (IST) is the active business date
  const [ty, tm, td] = todayStr.split('-').map(Number);
  return {
    dateStr: todayStr,
    dateObj: new Date(ty, tm - 1, td, 12, 0, 0, 0),
    isPendingPrevious: false
  };
}

module.exports = {
  getLocalDateString,
  getUtcDateObj,
  formatDisplayDate,
  getBranchActiveBusinessDate
};
