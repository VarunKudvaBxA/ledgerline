import mongoose from 'mongoose';

const reasonSchema = new mongoose.Schema({ code: String, points: Number, detail: String }, { _id: false });

const transactionSchema = new mongoose.Schema({
  // Supplied by the sender. The unique index makes ingestion idempotent: a retried request can't create a duplicate.
  externalId: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  merchant: { type: String, required: true },
  category: { type: String, required: true },
  country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
  channel: { type: String, enum: ['card_present', 'online'], default: 'online' },
  occurredAt: { type: Date, required: true },

  status: { type: String, enum: ['pending', 'scored'], default: 'pending' },
  score: { type: Number, default: 0 },
  severity: { type: String, enum: ['none', 'medium', 'high'], default: 'none' },
  flagged: { type: Boolean, default: false },
  reasons: [reasonSchema],
  scoredAt: Date,

  // Only set by the built-in simulator. Lets us measure precision and recall against known answers.
  simLabel: { type: String, enum: ['normal', 'suspicious', null], default: null },
  simIncident: { type: String, default: null },
});

transactionSchema.index({ accountId: 1, occurredAt: -1 }); // history lookups for scoring
transactionSchema.index({ occurredAt: -1 });               // live feed

export default mongoose.model('Transaction', transactionSchema);
