
import {
  FiHome, FiUsers, FiBox, FiShoppingBag, FiTruck, FiBarChart2, FiSettings, FiGrid,
  FiDollarSign, FiBook, FiPackage, FiBriefcase, FiCheckCircle, FiLayers, FiCreditCard, FiClock,
  FiDatabase, FiTarget, FiShoppingCart, FiUsers as FiUserGroup, FiArchive, FiFileText,
  FiPieChart, FiClipboard, FiRefreshCw, FiList, FiActivity, FiCalendar, FiArrowDownLeft, FiArrowUpRight, FiKey, FiDroplet,
  FiLock, FiMessageSquare, FiMonitor, FiTrendingUp, FiTag
} from 'react-icons/fi';
import { TbBarcode, TbReportAnalytics, TbReceipt } from 'react-icons/tb';

export const MENU_STRUCTURE = [
  {
    title: 'ACCOUNTING',
    icon: FiFileText,
    items: [
      { name: 'Dashboard', icon: FiGrid, path: '/dashboard/accounting' },
      { name: 'Balance Sheet', icon: FiClipboard, path: '/accounting/reports/balance-sheet' },
      { name: 'Bank Reconciliation', icon: FiCheckCircle, path: '/accounting/bank-reconciliation' },
      { name: 'Bulk Posting Utility', icon: FiRefreshCw, path: '/accounting/bulk-posting' },
      { name: 'Cash Book', icon: FiBook, path: '/accounting/reports/cash-book' },
      { name: 'Chart of Accounts', icon: FiLayers, path: '/accounting/chart-of-accounts' },
      { name: 'Contra Entry', icon: FiRefreshCw, path: '/accounting/vouchers/contra' },
      { name: 'Finance Ledger Posting Setup', icon: FiSettings, path: '/accounting/posting-setup' },
      { name: 'Financial Year Settings', icon: FiLock, path: '/accounting/financial-year' },
      { name: 'Journal Entry', icon: FiFileText, path: '/accounting/vouchers/journal' },
      { name: 'Ledger Report', icon: FiList, path: '/accounting/reports/ledger' },
      { name: 'Payment Voucher', icon: FiArrowUpRight, path: '/accounting/vouchers/payment' },
      { name: 'Profit & Loss', icon: FiPieChart, path: '/accounting/reports/profit-loss' },
      { name: 'Receipt Voucher', icon: FiArrowDownLeft, path: '/accounting/vouchers/receipt' },
      { name: 'Trial Balance', icon: FiActivity, path: '/accounting/reports/trial-balance' },
    ]
  },
  {
    title: 'CRM',
    icon: FiTarget,
    items: [
      { name: 'Dashboard', icon: FiBarChart2, path: '/crm' },
      { name: 'Deals Pipeline', icon: FiBriefcase, path: '/crm/deals' },
      { name: 'Leads', icon: FiUsers, path: '/crm/leads' },
      { name: 'Lead Follow-ups', icon: FiCalendar, path: '/crm/followups' },
      { name: 'My Referral Leads', icon: FiTrendingUp, path: '/crm/my-leads' },
      { name: 'Won Leads', icon: FiCheckCircle, path: '/crm/converted' },
      { name: 'Tasks', icon: FiCheckCircle, path: '/crm/tasks' },
    ]
  },
  {
    title: 'HRMS',
    icon: FiUserGroup,
    items: [
      { name: 'Attendance', icon: FiCheckCircle, path: '/hrms/attendance' },
      { name: 'Attendance Sheet', icon: FiList, path: '/hrms/attendance-sheet' },
      { name: 'Bank Statement', icon: FiCreditCard, path: '/hrms/bank-statement' },
      { name: 'Dashboard', icon: FiGrid, path: '/hrms' },
      { name: 'Departments', icon: FiLayers, path: '/hrms/departments' },
      { name: 'Designations', icon: FiBriefcase, path: '/hrms/designations' },
      { name: 'Leave Types', icon: FiSettings, path: '/hrms/leave-types' },
      { name: 'Leaves', icon: FiCalendar, path: '/hrms/leaves' },
      { name: 'Miss Punch', icon: FiClock, path: '/hrms/miss-punch' },
      { name: 'Payroll', icon: FiDollarSign, path: '/hrms/payroll' },
      { name: 'Salary Advance', icon: FiDollarSign, path: '/hrms/salary-advance' },
      { name: 'Salary Processing', icon: FiCreditCard, path: '/hrms/salary-processing' },
      { name: 'Work Log', icon: FiClipboard, path: '/hrms/work-log' },
    ]
  },
  {
    title: 'INVENTORY',
    icon: FiArchive,
    items: [
      { name: 'Barcode Creator', icon: TbBarcode, path: '/barcode' },
      { name: 'Purchase Entry', icon: FiShoppingBag, path: '/purchase' },
      { name: 'Stock Receipt', icon: FiPackage, path: '/stock-receipt' },
      { name: 'Stock Transfer', icon: FiTruck, path: '/stock-transfer' },
      { name: 'Suppliers', icon: FiTruck, path: '/suppliers' },
    ]
  },
  {
    title: 'MASTER',
    icon: FiDatabase,
    items: [
      { name: 'Bank Master', icon: FiCreditCard, path: '/master/banks' },
      { name: 'Brand Master', icon: FiTag, path: '/master/brands' },
      { name: 'Branches', icon: FiHome, path: '/branches' },
      { name: 'Category Master', icon: FiGrid, path: '/master/categories' },
      { name: 'Product Types', icon: FiLayers, path: '/master/product-types' },
      { name: 'Company Profile', icon: FiSettings, path: '/company' },
      { name: 'Invoice Settings', icon: FiFileText, path: '/master/invoice_settings' },
      { name: 'Products', icon: FiBox, path: '/products' },
      { name: 'Report Design', icon: FiBarChart2, path: '/master/report-design' },
      { name: 'State Master', icon: FiArrowUpRight, path: '/master/states' },
      { name: 'Users', icon: FiUsers, path: '/users' },
    ]
  },
  {
    title: 'SALES',
    icon: FiShoppingCart,
    items: [
      { name: 'B2B Invoice', icon: FiFileText, path: '/sales/b2b-invoice' },
      { name: 'Credit Management', icon: FiDollarSign, path: '/credit' },
      { name: 'Customers', icon: FiUsers, path: '/customers' },
      { name: 'Delivery Challan', icon: FiTruck, path: '/sales/delivery-challan' },
      { name: 'Invoices', icon: FiFileText, path: '/sales/invoices' },
      { name: 'New Sale (POS)', icon: FiGrid, path: '/pos' },
      { name: 'Quotations', icon: FiFileText, path: '/sales/quotations' },
      { name: 'Product Advance', icon: FiDollarSign, path: '/sales/product-advance' },
      { name: 'Sales Return', icon: FiBox, path: '/sales-return' },
      { name: 'Voucher Management', icon: TbReceipt, path: '/sales/vouchers' },
    ]
  },
  {
    title: 'SUPPORT',
    icon: FiMessageSquare,
    items: [
      { name: 'Ticketing System', icon: FiClipboard, path: '/ticketing' },
      { name: 'Ticketing Dashboard', icon: FiPieChart, path: '/ticketing-dashboard' },
    ]
  },
  {
    title: 'REPORTS',
    icon: TbReportAnalytics,
    items: [
      { name: 'Sales Report', icon: FiFileText, path: '/reports/sales' },
      { name: 'Sales Performance', icon: FiActivity, path: '/reports/sales-performance' },
      { name: 'Stock Movement Register', icon: FiActivity, path: '/reports/stock-movement' },
      { name: 'Stock Summary Report', icon: FiActivity, path: '/reports/stock-summary' },
      { name: 'Current Stock Balance', icon: FiBox, path: '/reports/current-stock' },
      { name: 'HSN Summary', icon: FiList, path: '/reports/hsn-summary' },
      { name: 'GSTR-1', icon: FiFileText, path: '/reports/gstr-1' },
      { name: 'GSTR-3B', icon: FiPieChart, path: '/reports/gstr-3b' },
    ]
  },
  {
    title: 'SETTINGS',
    icon: FiSettings,
    items: [
      { name: 'Change Password', icon: FiKey, path: '/settings/change-password' },
      { name: 'GST Settings', icon: FiFileText, path: '/settings/gst-settings' },
      { name: 'Screen Layout', icon: FiGrid, path: '/settings/screen-layout' },
      { name: 'Terminal Master', icon: FiMonitor, path: '/settings/terminal-master' },
      { name: 'Theme Settings', icon: FiDroplet, path: '/settings/theme' },
      { name: 'WhatsApp History', icon: FiClock, path: '/settings/whatsapp-history' },
      { name: 'WhatsApp Integration', icon: FiMessageSquare, path: '/settings/whatsapp' },
    ]
  }
];
