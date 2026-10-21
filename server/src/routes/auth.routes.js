import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler, httpError } from '../middleware/errorHandler.js';
import User from '../models/User.js';

const router = Router();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const cookieOptions = {
  httpOnly: true,
  secure: env.isProd || env.cookieSameSite === 'none',
  sameSite: env.cookieSameSite,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role });

async function startSession(user, res) {
  const accessToken = jwt.sign({ role: user.role, email: user.email }, env.jwtAccessSecret, { subject: user.id, expiresIn: '15m' });
  const refreshToken = jwt.sign({ jti: crypto.randomUUID() }, env.jwtRefreshSecret, { subject: user.id, expiresIn: '7d' });
  user.refreshTokenHash = sha256(refreshToken);
  await user.save();
  res.cookie('refreshToken', refreshToken, cookieOptions);
  return accessToken;
}

const credentials = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(100) });

router.post('/register', asyncHandler(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  if (await User.findOne({ email })) throw httpError(409, 'An account with this email already exists');
  const isFirst = (await User.estimatedDocumentCount()) === 0;
  const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12), role: isFirst ? 'admin' : 'analyst' });
  res.status(201).json({ accessToken: await startSession(user, res), user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw httpError(401, 'Incorrect email or password');
  res.json({ accessToken: await startSession(user, res), user: publicUser(user) });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) throw httpError(401, 'No session');
  let payload;
  try { payload = jwt.verify(token, env.jwtRefreshSecret); } catch { throw httpError(401, 'Session expired'); }
  const user = await User.findById(payload.sub);
  if (!user) throw httpError(401, 'No session');
  if (user.refreshTokenHash !== sha256(token)) {
    user.refreshTokenHash = null; // an old token was replayed: revoke the session
    await user.save();
    res.clearCookie('refreshToken', { path: '/api/auth' });
    throw httpError(401, 'Session revoked. Please sign in again.');
  }
  res.json({ accessToken: await startSession(user, res), user: publicUser(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (token) {
    try { await User.findByIdAndUpdate(jwt.verify(token, env.jwtRefreshSecret).sub, { refreshTokenHash: null }); } catch { /* already invalid */ }
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ ok: true });
}));

export default router;
