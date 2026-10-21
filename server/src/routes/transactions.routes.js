import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import Transaction from '../models/Transaction.js';
import { ingestTransaction } from '../services/ingest.js';

const router = Router();

const schema = z.object({
  externalId: z.string().min(1).max(100),
  accountId: z.string().min(1).max(50),
  amount: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default('USD'),
  merchant: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  country: z.string().length(2),
  channel: z.enum(['card_present', 'online']).default('online'),
  occurredAt: z.coerce.date().default(() => new Date()),
});

// Unknown fields (for example the simulator's hidden labels) are dropped by the schema.
router.post('/', asyncHandler(async (req, res) => {
  const { txn, duplicate } = await ingestTransaction(schema.parse(req.body));
  // 202: accepted for scoring. 200 for a repeated externalId.
  res.status(duplicate ? 200 : 202).json({ id: txn.id, status: txn.status, duplicate });
}));

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const filter = req.query.flagged === 'true' ? { flagged: true } : { status: 'scored' };
  res.json(await Transaction.find(filter).sort({ occurredAt: -1 }).limit(limit).select('-simLabel -simIncident').lean());
}));

export default router;
