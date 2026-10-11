import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import alertRoutes from './routes/alerts.routes.js';
import authRoutes from './routes/auth.routes.js';
import opsRoutes from './routes/ops.routes.js';
import transactionRoutes from './routes/transactions.routes.js';

const limiter = (limit) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false });

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', limiter(30), authRoutes);
  app.use('/api/transactions', requireAuth, transactionRoutes);
  app.use('/api/alerts', requireAuth, limiter(1500), alertRoutes);
  app.use('/api', requireAuth, limiter(3000), opsRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
