import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // The first account created becomes admin. Admins can run the simulator, see the audit trail and close escalations.
    role: { type: String, enum: ['analyst', 'admin'], default: 'analyst' },
    refreshTokenHash: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
