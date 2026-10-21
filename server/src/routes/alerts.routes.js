import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, httpError } from '../middleware/errorHandler.js';
import Alert from '../models/Alert.js';
import AuditLog from '../models/AuditLog.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const statuses = String(req.query.status || 'open,escalated').split(',').filter((s) => ['open', 'approved', 'blocked', 'escalated'].includes(s));
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(await Alert.find({ status: { $in: statuses } }).sort({ score: -1, createdAt: -1 }).limit(limit).lean());
}));

const decision = z.object({ action: z.enum(['approve', 'block', 'escalate']), note: z.string().trim().max(500).optional() });
const NEXT = { approve: 'approved', block: 'blocked', escalate: 'escalated' };

router.patch('/:id/decision', asyncHandler(async (req, res) => {
  const { action, note } = decision.parse(req.body);
  const alert = await Alert.findById(req.params.id);
  if (!alert) throw httpError(404, 'Alert not found');

  if (!['open', 'escalated'].includes(alert.status)) throw httpError(409, 'This alert has already been closed');
  if (alert.status === 'escalated' && action === 'escalate') throw httpError(409, 'This alert is already escalated');
  if (alert.status === 'escalated' && req.user.role !== 'admin') throw httpError(403, 'Only an admin can close an escalated alert');

  // Compare-and-set: succeeds only if nobody changed the status since we read it,
  // so two analysts clicking at the same moment can't both "win".
  const updated = await Alert.findOneAndUpdate(
    { _id: alert._id, status: alert.status },
    { $set: { status: NEXT[action], decidedBy: req.user.email, decidedAt: new Date(), note } },
    { new: true }
  ).lean();
  if (!updated) throw httpError(409, 'Another analyst just updated this alert. Refresh to see the latest.');

  await AuditLog.create({
    actorId: req.user.id, actorEmail: req.user.email, action: `alert.${action}`,
    targetType: 'alert', targetId: String(alert._id),
    details: { from: alert.status, to: updated.status, note, score: alert.score, accountId: alert.accountId },
  });

  req.app.get('io').emit('alert:updated', updated);
  res.json(updated);
}));

export default router;
