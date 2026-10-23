const { PrismaClient } = require('../prisma/client');

// Prevent multiple instances of Prisma Client across environments and hot-reloads
let prisma;

if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
  });
}
prisma = global.prisma;

// Connection test
prisma.$connect()
    .then(() => console.log('✅ [DB] Database connected successfully'))
    .catch((err) => {
        console.error('❌ [DB] Connection Failed:', err.message);
    });

module.exports = prisma;
