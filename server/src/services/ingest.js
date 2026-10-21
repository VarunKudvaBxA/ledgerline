import Transaction from '../models/Transaction.js';
import { scoreQueue } from './queue.js';

/**
 * Single entry point for new transactions (used by the HTTP API and by the simulator).
 * 1. Save with status "pending".  2. Queue a scoring job.  The caller gets an answer immediately.
 * Idempotent: the same externalId sent twice returns the original record and queues nothing.
 */
export async function ingestTransaction(payload) {
  try {
    const txn = await Transaction.create({ ...payload, status: 'pending' });
    await scoreQueue.add('score', { id: txn.id }, {
      jobId: txn.id,               // one job per transaction
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
    return { txn, duplicate: false };
  } catch (err) {
    if (err.code === 11000) {
      return { txn: await Transaction.findOne({ externalId: payload.externalId }), duplicate: true };
    }
    throw err;
  }
}
