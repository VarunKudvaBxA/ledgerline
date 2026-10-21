import { Worker } from 'bullmq';
import Alert from '../models/Alert.js';
import Transaction from '../models/Transaction.js';
import { explain } from './explain.js';
import { connection } from './queue.js';
import { scoreTransaction } from './scorer.js';

const HISTORY_SIZE = 60;

/** Consumes scoring jobs: score, save, push to the dashboard, open an alert when flagged. */
export function startWorker(io) {
  const worker = new Worker(
    'score',
    async (job) => {
      const txn = await Transaction.findById(job.data.id);
      if (!txn || txn.status === 'scored') return; // safe to run twice (retries, duplicate delivery)

      const history = await Transaction.find({
        accountId: txn.accountId,
        occurredAt: { $lt: txn.occurredAt },
        _id: { $ne: txn._id },
      })
        .sort({ occurredAt: -1 })
        .limit(HISTORY_SIZE)
        .lean();

      const result = scoreTransaction(txn, history);
      txn.set({ ...result, status: 'scored', scoredAt: new Date() });
      await txn.save();
      // The simulator's hidden answer labels stay on the server.
      const { simLabel, simIncident, ...publicTxn } = txn.toObject();
      io.emit('txn:scored', publicTxn);

      if (!result.flagged) return;

      const explanation = await explain(txn, result.reasons);
      try {
        const alert = await Alert.create({
          transactionId: txn._id,
          accountId: txn.accountId,
          amount: txn.amount,
          merchant: txn.merchant,
          country: txn.country,
          score: result.score,
          severity: result.severity,
          reasons: result.reasons,
          explanation,
        });
        io.emit('alert:new', alert.toObject());
      } catch (err) {
        if (err.code !== 11000) throw err; // the unique index means this alert already exists
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on('failed', (job, err) => console.error(`Scoring job ${job?.id} failed:`, err.message));
  return worker;
}
