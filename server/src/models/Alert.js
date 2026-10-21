import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    // unique: one alert per transaction, even if a job is retried
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true },
    accountId: String,
    amount: Number,
    merchant: String,
    country: String,
    score: Number,
    severity: { type: String, enum: ['medium', 'high'] },
    reasons: [{ _id: false, code: String, points: Number, detail: String }],
    explanation: String,
    status: { type: String, enum: ['open', 'approved', 'blocked', 'escalated'], default: 'open', index: true },
    decidedBy: String,
    decidedAt: Date,
    note: String,
  },
  { timestamps: true }
);

export default mongoose.model('Alert', alertSchema);
