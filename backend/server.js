process.env.TZ = 'Asia/Kolkata';
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const path = require('path');
const fs = require('fs');
const { initSocket } = require("./utils/socket");
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorMiddleware');
dotenv.config();

const prisma = require('./config/prisma'); // Singleton Prisma

const validateEnv = require("./utils/envValidator");
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:3030', 'http://localhost:3010', 'http://127.0.0.1:3030', 'http://127.0.0.1:3010', ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [])],
  credentials: true
}));
app.use(express.json());

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});


// UPLOADS CONFIGURATION
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(__dirname, '../frontend/public/uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_PATH)) {
  console.log(`[INIT] Creating uploads directory at: ${UPLOADS_PATH}`);
  fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

app.use('/uploads', express.static(UPLOADS_PATH));

const server = http.createServer(app);
initSocket(server);

// Routes
app.get("/", (req, res) => {
  res.send("Billing Software API is running...");
});

// Health Check Endpoint
app.get("/api/health", async (req, res) => {
  let dbStatus = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    dbStatus = 'disconnected';
  }

  res.json({
    status: dbStatus === 'connected' ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/company', require('./routes/companyRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/accounts', require('./routes/accountsRoutes'));
app.use('/api/branches', require('./routes/branchRoutes'));
app.use('/api/transfers', require('./routes/stockTransferRoutes'));
app.use('/api/barcode-settings', require('./routes/barcodeSettingRoutes'));
app.use('/api/barcode-templates', require('./routes/barcodeTemplateRoutes'));
app.use('/api/hrms', require('./routes/hrmsRoutes'));
app.use('/api/crm', require('./routes/crmRoutes'));
app.use('/api/credits', require('./routes/creditRoutes'));
app.use('/api/accounting', require('./routes/accountingRoutes'));
app.use('/api/states', require('./routes/stateRoutes'));
app.use('/api/gst-settings', require('./routes/gstSettingsRoutes'));
app.use('/api/gst', require('./routes/gstRoutes'));
app.use('/api/b2b', require('./routes/b2bRoutes'));
app.use('/api/delivery-challans', require('./routes/deliveryChallanRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/product-types', require('./routes/productTypeRoutes'));
app.use('/api/brands', require('./routes/brandRoutes'));
app.use('/api/banks', require('./routes/bankRoutes'));
app.use('/api/financial-years', require('./routes/financialYearRoutes'));
app.use('/api/quotations', require('./routes/quotationRoutes'));
app.use('/api/reports/gst', require('./routes/gstReportRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/terminals', require('./routes/terminalRoutes'));
app.use('/api/accounting/reconciliation', require('./routes/bankReconciliationRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/invoice-settings', require('./routes/invoiceSettingsRoutes'));
app.use('/api/advances', require('./routes/advanceRoutes'));
app.use('/api/day-close', require('./routes/dayCloseRoutes'));
app.use('/api/customer-vouchers', require('./routes/customerVoucherRoutes'));

// Global Error Handler (MUST be last)
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`[STARTUP] Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  const { seedAccountGroups } = require('./utils/accountGroupSeeder');
  seedAccountGroups()
    .then(() => console.log('[STARTUP] Account groups verified and seeded successfully.'))
    .catch(err => console.error('[STARTUP] Failed to seed account groups:', err.message));
});

// Graceful Shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    prisma.$disconnect().then(() => {
      console.log('Database disconnected.');
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
