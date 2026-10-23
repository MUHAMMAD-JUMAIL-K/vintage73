
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  detectRuntime,
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.10.2
 * Query Engine version: 5a9203d0590c951969e85a7d07215503f4672eb9
 */
Prisma.prismaVersion = {
  client: "5.10.2",
  engine: "5a9203d0590c951969e85a7d07215503f4672eb9"
}

Prisma.PrismaClientKnownRequestError = () => {
  throw new Error(`PrismaClientKnownRequestError is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  throw new Error(`PrismaClientUnknownRequestError is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  throw new Error(`PrismaClientRustPanicError is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  throw new Error(`PrismaClientInitializationError is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  throw new Error(`PrismaClientValidationError is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  throw new Error(`NotFoundError is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  throw new Error(`sqltag is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  throw new Error(`empty is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  throw new Error(`join is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  throw new Error(`raw is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  throw new Error(`Extensions.getExtensionContext is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  throw new Error(`Extensions.defineExtension is unable to be run ${runtimeDescription}.
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}

/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  username: 'username',
  password: 'password',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  allowedModules: 'allowedModules',
  name: 'name',
  branchId: 'branchId',
  incentivePercentage: 'incentivePercentage',
  imageUrl: 'imageUrl',
  weeklyOff: 'weeklyOff',
  isActive: 'isActive',
  adminId: 'adminId'
};

exports.Prisma.BranchScalarFieldEnum = {
  id: 'id',
  name: 'name',
  address: 'address',
  phone: 'phone',
  email: 'email',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  invoiceSettings: 'invoiceSettings',
  stockIncluded: 'stockIncluded',
  invoiceTemplate: 'invoiceTemplate',
  currencyCode: 'currencyCode',
  currencySymbol: 'currencySymbol'
};

exports.Prisma.CompanyProfileScalarFieldEnum = {
  id: 'id',
  companyName: 'companyName',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  phone: 'phone',
  email: 'email',
  website: 'website',
  registrationNumber: 'registrationNumber',
  logoUrl: 'logoUrl',
  currencyCode: 'currencyCode',
  currencySymbol: 'currencySymbol',
  country: 'country',
  taxSystem: 'taxSystem',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  invoiceSettings: 'invoiceSettings',
  bankId: 'bankId',
  dashboardImageUrl: 'dashboardImageUrl',
  gradientType: 'gradientType',
  primaryColor: 'primaryColor',
  secondaryColor: 'secondaryColor',
  showOnlyLogoOnDashboard: 'showOnlyLogoOnDashboard'
};

exports.Prisma.StateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  country: 'country',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerScalarFieldEnum = {
  id: 'id',
  name: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  state: 'state',
  area: 'area',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId',
  city: 'city',
  gstin: 'gstin',
  partyType: 'partyType',
  pincode: 'pincode',
  accessPermissions: 'accessPermissions',
  password: 'password',
  role: 'role',
  username: 'username'
};

exports.Prisma.AdvanceScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  totalAmount: 'totalAmount',
  usedAmount: 'usedAmount',
  balance: 'balance',
  createdAt: 'createdAt',
  notes: 'notes',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdvanceHistoryScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  advanceId: 'advanceId',
  action: 'action',
  amount: 'amount',
  balanceAfter: 'balanceAfter',
  reference: 'reference',
  createdAt: 'createdAt',
  date: 'date'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  name: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  state: 'state',
  gstNumber: 'gstNumber',
  contactPerson: 'contactPerson',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  unitType: 'unitType',
  attributes: 'attributes',
  defaultLabelDesignId: 'defaultLabelDesignId'
};

exports.Prisma.ProductTypeScalarFieldEnum = {
  id: 'id',
  name: 'name',
  categoryId: 'categoryId',
  genders: 'genders',
  attributes: 'attributes',
  sizes: 'sizes',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BrandScalarFieldEnum = {
  id: 'id',
  name: 'name',
  barcode: 'barcode',
  categoryId: 'categoryId',
  categoryName: 'categoryName',
  categoryIds: 'categoryIds',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  name: 'name',
  brandId: 'brandId',
  brandName: 'brandName',
  categoryId: 'categoryId',
  categoryName: 'categoryName',
  productTypeId: 'productTypeId',
  productTypeName: 'productTypeName',
  gender: 'gender',
  attributes: 'attributes',
  size: 'size',
  sizeStocks: 'sizeStocks',
  price: 'price',
  brandPrices: 'brandPrices',
  costPrice: 'costPrice',
  taxRate: 'taxRate',
  taxPercent: 'taxPercent',
  taxType: 'taxType',
  isTaxInclusive: 'isTaxInclusive',
  hsnCode: 'hsnCode',
  warranty: 'warranty',
  description: 'description',
  barcode: 'barcode',
  hasBarcode: 'hasBarcode',
  minStockLevel: 'minStockLevel',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  maxDiscount: 'maxDiscount',
  minDiscount: 'minDiscount',
  imageUrl: 'imageUrl',
  isActive: 'isActive'
};

exports.Prisma.ProductStockScalarFieldEnum = {
  id: 'id',
  branchId: 'branchId',
  productId: 'productId',
  quantity: 'quantity'
};

exports.Prisma.PurchaseScalarFieldEnum = {
  id: 'id',
  invoiceNumber: 'invoiceNumber',
  supplierId: 'supplierId',
  purchaseDate: 'purchaseDate',
  totalAmount: 'totalAmount',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  paymentMethod: 'paymentMethod',
  balanceAmount: 'balanceAmount',
  paidAmount: 'paidAmount',
  branchId: 'branchId',
  subTotal: 'subTotal',
  taxAmount: 'taxAmount',
  financialYearId: 'financialYearId'
};

exports.Prisma.PurchaseItemScalarFieldEnum = {
  id: 'id',
  purchaseId: 'purchaseId',
  productId: 'productId',
  size: 'size',
  quantity: 'quantity',
  unitCost: 'unitCost',
  totalCost: 'totalCost'
};

exports.Prisma.SaleScalarFieldEnum = {
  id: 'id',
  invoiceNumber: 'invoiceNumber',
  customerId: 'customerId',
  saleDate: 'saleDate',
  subTotal: 'subTotal',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  roundOffAmount: 'roundOffAmount',
  paymentMethod: 'paymentMethod',
  status: 'status',
  isReturn: 'isReturn',
  returnReason: 'returnReason',
  originalInvoice: 'originalInvoice',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  balanceAmount: 'balanceAmount',
  paidAmount: 'paidAmount',
  cancelledAt: 'cancelledAt',
  cancelledBy: 'cancelledBy',
  cancelReason: 'cancelReason',
  branchId: 'branchId',
  salesmanId: 'salesmanId',
  incentiveAmount: 'incentiveAmount',
  ewayBillDate: 'ewayBillDate',
  ewayBillNumber: 'ewayBillNumber',
  isB2B: 'isB2B',
  placeOfSupply: 'placeOfSupply',
  transportMode: 'transportMode',
  transporterId: 'transporterId',
  transporterName: 'transporterName',
  vehicleNumber: 'vehicleNumber',
  isTaxInclusive: 'isTaxInclusive',
  terminalId: 'terminalId',
  financialYearId: 'financialYearId',
  isInvoice: 'isInvoice',
  quotationId: 'quotationId',
  currencyCode: 'currencyCode',
  exchangeRate: 'exchangeRate',
  discount: 'discount',
  advanceUsed: 'advanceUsed',
  description: 'description',
  deliveryCharge: 'deliveryCharge',
  hasDeliveryCharge: 'hasDeliveryCharge',
  voucherCode: 'voucherCode',
  voucherName: 'voucherName',
  showVoucherOnBill: 'showVoucherOnBill',
  voucherDiscount: 'voucherDiscount'
};

exports.Prisma.SaleItemScalarFieldEnum = {
  id: 'id',
  saleId: 'saleId',
  productId: 'productId',
  size: 'size',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  originalUnitPrice: 'originalUnitPrice',
  total: 'total',
  discountAmount: 'discountAmount',
  discountPercent: 'discountPercent',
  voucherDiscountAmount: 'voucherDiscountAmount',
  taxAmount: 'taxAmount',
  taxRate: 'taxRate',
  isTaxInclusive: 'isTaxInclusive'
};

exports.Prisma.ExpenseScalarFieldEnum = {
  id: 'id',
  title: 'title',
  amount: 'amount',
  category: 'category',
  description: 'description',
  date: 'date',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  type: 'type',
  amount: 'amount',
  method: 'method',
  reference: 'reference',
  description: 'description',
  paymentDate: 'paymentDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  customerId: 'customerId',
  saleId: 'saleId',
  supplierId: 'supplierId',
  branchId: 'branchId',
  quotationId: 'quotationId'
};

exports.Prisma.QuotationScalarFieldEnum = {
  id: 'id',
  quotationNumber: 'quotationNumber',
  customerId: 'customerId',
  quotationDate: 'quotationDate',
  validUntil: 'validUntil',
  subTotal: 'subTotal',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  status: 'status',
  notes: 'notes',
  terms: 'terms',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId',
  isTaxInclusive: 'isTaxInclusive',
  taxType: 'taxType',
  financialYearId: 'financialYearId'
};

exports.Prisma.QuotationItemScalarFieldEnum = {
  id: 'id',
  quotationId: 'quotationId',
  productId: 'productId',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  total: 'total',
  taxAmount: 'taxAmount',
  taxRate: 'taxRate',
  discountAmount: 'discountAmount',
  discountPercent: 'discountPercent'
};

exports.Prisma.StockTransferScalarFieldEnum = {
  id: 'id',
  fromBranchId: 'fromBranchId',
  toBranchId: 'toBranchId',
  status: 'status',
  transferDate: 'transferDate',
  remarks: 'remarks',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  receivedById: 'receivedById',
  receivedAt: 'receivedAt'
};

exports.Prisma.StockTransferItemScalarFieldEnum = {
  id: 'id',
  transferId: 'transferId',
  productId: 'productId',
  quantity: 'quantity',
  taxAmount: 'taxAmount',
  taxPercent: 'taxPercent',
  totalCost: 'totalCost',
  unitCost: 'unitCost'
};

exports.Prisma.BarcodeSettingScalarFieldEnum = {
  id: 'id',
  branchId: 'branchId',
  nameFontSize: 'nameFontSize',
  priceFontSize: 'priceFontSize',
  barcodeWidth: 'barcodeWidth',
  barcodeHeight: 'barcodeHeight',
  barcodeFontSize: 'barcodeFontSize',
  alignment: 'alignment',
  showName: 'showName',
  showPrice: 'showPrice',
  showBarcodeValue: 'showBarcodeValue',
  paperSize: 'paperSize',
  columns: 'columns',
  margin: 'margin',
  labelWidth: 'labelWidth',
  labelHeight: 'labelHeight',
  paperWidth: 'paperWidth',
  columnGap: 'columnGap',
  rowGap: 'rowGap',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BarcodeTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  rawZpl: 'rawZpl',
  labelWidth: 'labelWidth',
  labelHeight: 'labelHeight',
  dpi: 'dpi',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeProfileScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  designationId: 'designationId',
  departmentId: 'departmentId',
  joiningDate: 'joiningDate',
  basicSalary: 'basicSalary',
  labourRule: 'labourRule',
  nationalId: 'nationalId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  accountNumber: 'accountNumber',
  bankName: 'bankName',
  branchName: 'branchName',
  employeeCode: 'employeeCode',
  ifscCode: 'ifscCode'
};

exports.Prisma.DesignationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DepartmentScalarFieldEnum = {
  id: 'id',
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttendanceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  date: 'date',
  checkIn: 'checkIn',
  checkOut: 'checkOut',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.LeaveRequestScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  startDate: 'startDate',
  endDate: 'endDate',
  reason: 'reason',
  status: 'status',
  approvedById: 'approvedById',
  leaveTypeId: 'leaveTypeId',
  isHalfDay: 'isHalfDay',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.LeaveTypeScalarFieldEnum = {
  id: 'id',
  name: 'name',
  isPaid: 'isPaid',
  color: 'color',
  monthlyLimit: 'monthlyLimit',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PayrollScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  month: 'month',
  year: 'year',
  basicSalary: 'basicSalary',
  allowances: 'allowances',
  deductions: 'deductions',
  netSalary: 'netSalary',
  status: 'status',
  fromDate: 'fromDate',
  toDate: 'toDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  voucherId: 'voucherId',
  branchId: 'branchId'
};

exports.Prisma.LeadScalarFieldEnum = {
  id: 'id',
  name: 'name',
  company: 'company',
  email: 'email',
  phone: 'phone',
  source: 'source',
  status: 'status',
  assignedTo: 'assignedTo',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  address: 'address',
  budget: 'budget',
  followUpDate: 'followUpDate',
  priority: 'priority',
  productId: 'productId',
  quantity: 'quantity',
  quotationId: 'quotationId',
  saleId: 'saleId',
  lastFollowUpDate: 'lastFollowUpDate',
  nextFollowUpDate: 'nextFollowUpDate',
  outcome: 'outcome',
  reminderFlag: 'reminderFlag',
  branchId: 'branchId',
  commissionAmount: 'commissionAmount',
  commissionPaid: 'commissionPaid',
  commissionPercentage: 'commissionPercentage',
  negotiationAmount: 'negotiationAmount',
  referredById: 'referredById'
};

exports.Prisma.ReferralPaymentScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  paymentDate: 'paymentDate',
  amountPaid: 'amountPaid',
  paymentMethod: 'paymentMethod',
  bankName: 'bankName',
  transactionNumber: 'transactionNumber',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FollowUpScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  date: 'date',
  notes: 'notes',
  status: 'status',
  nextFollowUpDate: 'nextFollowUpDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  completedAt: 'completedAt',
  outcome: 'outcome'
};

exports.Prisma.LeadActivityScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  type: 'type',
  description: 'description',
  createdAt: 'createdAt'
};

exports.Prisma.DealScalarFieldEnum = {
  id: 'id',
  title: 'title',
  value: 'value',
  stage: 'stage',
  closeDate: 'closeDate',
  probability: 'probability',
  leadId: 'leadId',
  assignedTo: 'assignedTo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CRMTaskScalarFieldEnum = {
  id: 'id',
  title: 'title',
  dueDate: 'dueDate',
  status: 'status',
  priority: 'priority',
  description: 'description',
  leadId: 'leadId',
  dealId: 'dealId',
  assignedTo: 'assignedTo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MissPunchRequestScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  date: 'date',
  checkInTime: 'checkInTime',
  checkOutTime: 'checkOutTime',
  reason: 'reason',
  status: 'status',
  reviewedBy: 'reviewedBy',
  reviewedAt: 'reviewedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.SalaryAdvanceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  amount: 'amount',
  reason: 'reason',
  requestDate: 'requestDate',
  status: 'status',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  deductedInPayroll: 'deductedInPayroll',
  payrollId: 'payrollId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  voucherId: 'voucherId',
  branchId: 'branchId'
};

exports.Prisma.AccountGroupScalarFieldEnum = {
  id: 'id',
  name: 'name',
  groupType: 'groupType',
  parentId: 'parentId',
  isSystem: 'isSystem',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LedgerScalarFieldEnum = {
  id: 'id',
  name: 'name',
  groupId: 'groupId',
  openingBalance: 'openingBalance',
  balanceType: 'balanceType',
  isActive: 'isActive',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isSystem: 'isSystem'
};

exports.Prisma.TransactionPostingScalarFieldEnum = {
  id: 'id',
  transactionType: 'transactionType',
  label: 'label',
  targetTable: 'targetTable',
  role: 'role',
  ledgerId: 'ledgerId',
  side: 'side',
  postingMethod: 'postingMethod',
  amountField: 'amountField',
  customFormula: 'customFormula',
  condition: 'condition',
  isSystem: 'isSystem',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VoucherScalarFieldEnum = {
  id: 'id',
  voucherNumber: 'voucherNumber',
  voucherType: 'voucherType',
  date: 'date',
  narration: 'narration',
  totalAmount: 'totalAmount',
  status: 'status',
  reference: 'reference',
  createdBy: 'createdBy',
  branchId: 'branchId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JournalEntryScalarFieldEnum = {
  id: 'id',
  voucherId: 'voucherId',
  debitLedgerId: 'debitLedgerId',
  creditLedgerId: 'creditLedgerId',
  amount: 'amount',
  description: 'description',
  createdAt: 'createdAt',
  bankDate: 'bankDate',
  isReconciled: 'isReconciled',
  reconRemarks: 'reconRemarks'
};

exports.Prisma.FinancialYearScalarFieldEnum = {
  id: 'id',
  name: 'name',
  startDate: 'startDate',
  endDate: 'endDate',
  isClosed: 'isClosed',
  isLocked: 'isLocked',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  invoicePrefix: 'invoicePrefix',
  invoiceSequence: 'invoiceSequence',
  branchId: 'branchId',
  challanPrefix: 'challanPrefix',
  challanSequence: 'challanSequence',
  purchasePrefix: 'purchasePrefix',
  purchaseSequence: 'purchaseSequence',
  quotationPrefix: 'quotationPrefix',
  quotationSequence: 'quotationSequence'
};

exports.Prisma.GSTSettingsScalarFieldEnum = {
  id: 'id',
  ewayBillUsername: 'ewayBillUsername',
  ewayBillPassword: 'ewayBillPassword',
  ewayBillThreshold: 'ewayBillThreshold',
  autoGenerateEwayBill: 'autoGenerateEwayBill',
  defaultPlaceOfSupply: 'defaultPlaceOfSupply',
  invoicePrefix: 'invoicePrefix',
  challanPrefix: 'challanPrefix',
  termsAndConditions: 'termsAndConditions',
  bankDetails: 'bankDetails',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  apiMode: 'apiMode',
  autoGenerateEinvoice: 'autoGenerateEinvoice',
  einvoiceClientId: 'einvoiceClientId',
  einvoiceClientSecret: 'einvoiceClientSecret',
  einvoicePassword: 'einvoicePassword',
  einvoiceUsername: 'einvoiceUsername',
  ewayBillClientId: 'ewayBillClientId',
  ewayBillClientSecret: 'ewayBillClientSecret',
  gspName: 'gspName'
};

exports.Prisma.DeliveryChallanScalarFieldEnum = {
  id: 'id',
  challanNumber: 'challanNumber',
  customerId: 'customerId',
  challanDate: 'challanDate',
  transportMode: 'transportMode',
  vehicleNumber: 'vehicleNumber',
  transporterName: 'transporterName',
  transporterId: 'transporterId',
  reasonForMovement: 'reasonForMovement',
  placeOfSupply: 'placeOfSupply',
  dispatchFrom: 'dispatchFrom',
  dispatchTo: 'dispatchTo',
  ewayBillNumber: 'ewayBillNumber',
  ewayBillDate: 'ewayBillDate',
  branchId: 'branchId',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  financialYearId: 'financialYearId'
};

exports.Prisma.DeliveryChallanItemScalarFieldEnum = {
  id: 'id',
  challanId: 'challanId',
  productId: 'productId',
  quantity: 'quantity',
  hsnCode: 'hsnCode',
  description: 'description'
};

exports.Prisma.BankScalarFieldEnum = {
  id: 'id',
  name: 'name',
  accountNumber: 'accountNumber',
  ifscCode: 'ifscCode',
  branchName: 'branchName',
  address: 'address',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WhatsAppSettingScalarFieldEnum = {
  id: 'id',
  apiKey: 'apiKey',
  apiUrl: 'apiUrl',
  isActive: 'isActive',
  salesTemplate: 'salesTemplate',
  quotationTemplate: 'quotationTemplate',
  paymentTemplate: 'paymentTemplate',
  creditTemplate: 'creditTemplate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WhatsAppLogScalarFieldEnum = {
  id: 'id',
  mobile: 'mobile',
  message: 'message',
  status: 'status',
  timestamp: 'timestamp'
};

exports.Prisma.TerminalScalarFieldEnum = {
  id: 'id',
  terminalCode: 'terminalCode',
  name: 'name',
  branchId: 'branchId',
  isActive: 'isActive',
  lastUsed: 'lastUsed',
  ipAddress: 'ipAddress',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SystemSettingScalarFieldEnum = {
  id: 'id',
  key: 'key',
  value: 'value',
  description: 'description',
  category: 'category',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChatMessageScalarFieldEnum = {
  id: 'id',
  senderId: 'senderId',
  receiverId: 'receiverId',
  message: 'message',
  attachmentUrl: 'attachmentUrl',
  attachmentType: 'attachmentType',
  attachmentName: 'attachmentName',
  isRead: 'isRead',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  message: 'message',
  type: 'type',
  isRead: 'isRead',
  link: 'link',
  createdAt: 'createdAt',
  ticketId: 'ticketId'
};

exports.Prisma.WorkLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  adminId: 'adminId',
  branchId: 'branchId',
  date: 'date',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TicketScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  title: 'title',
  description: 'description',
  categoryName: 'categoryName',
  categoryId: 'categoryId',
  priority: 'priority',
  status: 'status',
  fileUrl: 'fileUrl',
  branchId: 'branchId',
  customerId: 'customerId',
  assignedToId: 'assignedToId',
  createdByRole: 'createdByRole',
  slaStatus: 'slaStatus',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  resignReason: 'resignReason',
  adminId: 'adminId',
  createdById: 'createdById',
  reassignReason: 'reassignReason',
  previousAssigneeId: 'previousAssigneeId'
};

exports.Prisma.TicketCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name'
};

exports.Prisma.TicketHistoryScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  action: 'action',
  message: 'message',
  doneById: 'doneById',
  role: 'role',
  createdAt: 'createdAt',
  reason: 'reason'
};

exports.Prisma.TicketMessageScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  message: 'message',
  senderId: 'senderId',
  role: 'role',
  createdAt: 'createdAt'
};

exports.Prisma.TicketClosureRequestScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  requestedById: 'requestedById',
  reason: 'reason',
  status: 'status',
  createdAt: 'createdAt'
};

exports.Prisma.InvoiceSettingScalarFieldEnum = {
  id: 'id',
  type: 'type',
  settings: 'settings',
  updatedAt: 'updatedAt'
};

exports.Prisma.DayCloseScalarFieldEnum = {
  id: 'id',
  branchId: 'branchId',
  businessDate: 'businessDate',
  status: 'status',
  terminalId: 'terminalId',
  openedById: 'openedById',
  openedAt: 'openedAt',
  openingCash: 'openingCash',
  previousClosingCash: 'previousClosingCash',
  additionalCashAdded: 'additionalCashAdded',
  cashRemovedBeforeOpening: 'cashRemovedBeforeOpening',
  expectedOpeningCash: 'expectedOpeningCash',
  actualOpeningCash: 'actualOpeningCash',
  openingDifference: 'openingDifference',
  openingDiscrepancyReason: 'openingDiscrepancyReason',
  openingApprovedById: 'openingApprovedById',
  openingDenominations: 'openingDenominations',
  openingRemarks: 'openingRemarks',
  verificationChecks: 'verificationChecks',
  verificationExceptions: 'verificationExceptions',
  exceptionApprovedById: 'exceptionApprovedById',
  exceptionApprovalReason: 'exceptionApprovalReason',
  salesSummary: 'salesSummary',
  closingExpectedCash: 'closingExpectedCash',
  physicalCash: 'physicalCash',
  cashDifference: 'cashDifference',
  closingDenominations: 'closingDenominations',
  notes: 'notes',
  finalizedById: 'finalizedById',
  finalizedAt: 'finalizedAt',
  adjustments: 'adjustments',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffDayCloseScalarFieldEnum = {
  id: 'id',
  dayCloseId: 'dayCloseId',
  userId: 'userId',
  salesSummary: 'salesSummary',
  physicalCash: 'physicalCash',
  cashDifference: 'cashDifference',
  denomination: 'denomination',
  notes: 'notes',
  status: 'status',
  submittedAt: 'submittedAt'
};

exports.Prisma.CustomerVoucherScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  type: 'type',
  value: 'value',
  maximumDiscount: 'maximumDiscount',
  minimumPurchaseAmount: 'minimumPurchaseAmount',
  issueDate: 'issueDate',
  expiryDate: 'expiryDate',
  status: 'status',
  customerId: 'customerId',
  branchId: 'branchId',
  issuedSaleId: 'issuedSaleId',
  redeemedSaleId: 'redeemedSaleId',
  redeemedAt: 'redeemedAt',
  usageLimit: 'usageLimit',
  usageCount: 'usageCount',
  description: 'description',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerVoucherRedemptionScalarFieldEnum = {
  id: 'id',
  voucherId: 'voucherId',
  saleId: 'saleId',
  customerId: 'customerId',
  branchId: 'branchId',
  discountAmount: 'discountAmount',
  redeemedAt: 'redeemedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  User: 'User',
  Branch: 'Branch',
  CompanyProfile: 'CompanyProfile',
  State: 'State',
  Customer: 'Customer',
  Advance: 'Advance',
  AdvanceHistory: 'AdvanceHistory',
  Supplier: 'Supplier',
  Category: 'Category',
  ProductType: 'ProductType',
  Brand: 'Brand',
  Product: 'Product',
  ProductStock: 'ProductStock',
  Purchase: 'Purchase',
  PurchaseItem: 'PurchaseItem',
  Sale: 'Sale',
  SaleItem: 'SaleItem',
  Expense: 'Expense',
  Payment: 'Payment',
  Quotation: 'Quotation',
  QuotationItem: 'QuotationItem',
  StockTransfer: 'StockTransfer',
  StockTransferItem: 'StockTransferItem',
  BarcodeSetting: 'BarcodeSetting',
  BarcodeTemplate: 'BarcodeTemplate',
  EmployeeProfile: 'EmployeeProfile',
  Designation: 'Designation',
  Department: 'Department',
  Attendance: 'Attendance',
  LeaveRequest: 'LeaveRequest',
  LeaveType: 'LeaveType',
  Payroll: 'Payroll',
  Lead: 'Lead',
  ReferralPayment: 'ReferralPayment',
  FollowUp: 'FollowUp',
  LeadActivity: 'LeadActivity',
  Deal: 'Deal',
  CRMTask: 'CRMTask',
  MissPunchRequest: 'MissPunchRequest',
  SalaryAdvance: 'SalaryAdvance',
  AccountGroup: 'AccountGroup',
  Ledger: 'Ledger',
  TransactionPosting: 'TransactionPosting',
  Voucher: 'Voucher',
  JournalEntry: 'JournalEntry',
  FinancialYear: 'FinancialYear',
  GSTSettings: 'GSTSettings',
  DeliveryChallan: 'DeliveryChallan',
  DeliveryChallanItem: 'DeliveryChallanItem',
  Bank: 'Bank',
  WhatsAppSetting: 'WhatsAppSetting',
  WhatsAppLog: 'WhatsAppLog',
  Terminal: 'Terminal',
  SystemSetting: 'SystemSetting',
  ChatMessage: 'ChatMessage',
  Notification: 'Notification',
  WorkLog: 'WorkLog',
  Ticket: 'Ticket',
  TicketCategory: 'TicketCategory',
  TicketHistory: 'TicketHistory',
  TicketMessage: 'TicketMessage',
  TicketClosureRequest: 'TicketClosureRequest',
  InvoiceSetting: 'InvoiceSetting',
  DayClose: 'DayClose',
  StaffDayClose: 'StaffDayClose',
  CustomerVoucher: 'CustomerVoucher',
  CustomerVoucherRedemption: 'CustomerVoucherRedemption'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        const runtime = detectRuntime()
        const edgeRuntimeName = {
          'workerd': 'Cloudflare Workers',
          'deno': 'Deno and Deno Deploy',
          'netlify': 'Netlify Edge Functions',
          'edge-light': 'Vercel Edge Functions or Edge Middleware',
        }[runtime]

        let message = 'PrismaClient is unable to run in '
        if (edgeRuntimeName !== undefined) {
          message += edgeRuntimeName + '. As an alternative, try Accelerate: https://pris.ly/d/accelerate.'
        } else {
          message += 'this browser environment, or has been bundled for the browser (running in `' + runtime + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
