import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import Alert from '../models/Alert.js';
import AuditLog from '../models/AuditLog.js';
import Transaction from '../models/Transaction.js';
import * as simulator from '../services/simulator.js';

const router = Router();

router.get('/stats', asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 60_000);
  const [totals, alertsByStatus, resolve, tp, incidents, lastMinute] = await Promise.all([
    Transaction.aggregate([{ $match: { status: 'scored' } }, { $group: { _id: null, scored: { $sum: 1 }, flagged: { $sum: { $cond: ['$flagged', 1, 0] } } } }]),
    Alert.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Alert.aggregate([
      { $match: { status: { $in: ['approved', 'blocked'] }, decidedAt: { $ne: null } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$decidedAt', '$createdAt'] } } } },
    ]),
    // Of the transactions we flagged that carry a simulator label, how many were truly suspicious?
    Transaction.aggregate([{ $match: { flagged: true, simLabel: { $ne: null } } }, { $group: { _id: '$simLabel', n: { $sum: 1 } } }]),
    // Incident-level recall: an incident counts as caught if at least one of its transactions was flagged.
    Transaction.aggregate([
      { $match: { status: 'scored', simIncident: { $ne: null } } },
      { $group: { _id: '$simIncident', caught: { $max: { $cond: ['$flagged', 1, 0] } } } },
      { $group: { _id: null, total: { $sum: 1 }, caught: { $sum: '$caught' } } },
    ]),
    Transaction.countDocuments({ occurredAt: { $gte: since } }),
  ]);

  const flaggedBy = Object.fromEntries(tp.map((x) => [x._id, x.n]));
  const truePos = flaggedBy.suspicious || 0;
  const falsePos = flaggedBy.normal || 0;
  const inc = incidents[0] || { total: 0, caught: 0 };

  res.json({
    scored: totals[0]?.scored || 0,
    flagged: totals[0]?.flagged || 0,
    perMinute: lastMinute,
    alerts: Object.fromEntries(alertsByStatus.map((x) => [x._id, x.n])),
    avgMinutesToDecision: resolve[0] ? Number((resolve[0].avgMs / 60000).toFixed(1)) : null,
    quality: {
      precision: truePos + falsePos ? truePos / (truePos + falsePos) : null,
      recall: inc.total ? inc.caught / inc.total : null,
      incidents: inc.total,
      incidentsCaught: inc.caught,
    },
  });
}));

router.get('/audit', requireRole('admin'), asyncHandler(async (req, res) => {
  res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 100, 500)).lean());
}));

router.get('/simulator', asyncHandler(async (req, res) => res.json(simulator.status())));

const startSchema = z.object({ ratePerSec: z.number().min(0.5).max(20).optional(), anomalyRate: z.number().min(0).max(0.5).optional() });
router.post('/simulator/start', requireRole('admin'), asyncHandler(async (req, res) => res.json(await simulator.start(startSchema.parse(req.body || {})))));
router.post('/simulator/stop', requireRole('admin'), asyncHandler(async (req, res) => res.json(simulator.stop())));

export default router;
