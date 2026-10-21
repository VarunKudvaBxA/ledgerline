import mongoose from 'mongoose';

// Append-only record of every analyst action. Nothing in the API updates or deletes these.
const auditSchema = new mongoose.Schema(
  {
    actorId: String,
    actorEmail: String,
    action: String,
    targetType: String,
    targetId: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model('AuditLog', auditSchema);
