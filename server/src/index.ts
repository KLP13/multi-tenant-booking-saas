import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// Route imports
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import bookingRoutes from './routes/bookings';
import adminRoutes from './routes/admin';
import superadminRoutes from './routes/superadmin';
import webhookRoutes from './routes/webhook';

// Middleware imports
import { errorHandler } from './middleware/errorHandler';

// Lib connections
import './lib/prisma';   // initializes Prisma client
import './lib/redis';    // initializes Redis client / fallback

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:3000',
  credentials: true,
}));

// Raw body required for Stripe webhook signature verification
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON body parser for all other routes
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication
app.use('/api/auth', authRoutes);

// Public tenant & slot browsing
app.use('/api', publicRoutes);

// Slot locking and booking flow
app.use('/api', bookingRoutes);

// Admin dashboard (scoped by tenant)
app.use('/api/admin', adminRoutes);

// Superadmin platform management
app.use('/api/superadmin', superadminRoutes);

// ─── Error Handler (must be last) ─────────────────────────────────────────

app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});