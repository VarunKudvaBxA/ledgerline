import 'dotenv/config';

const required = (key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  return process.env[key];
};

export const env = {
  port: Number(process.env.PORT || 5001),
  isProd: process.env.NODE_ENV === 'production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5174',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ledgerline',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
  explainProvider: process.env.EXPLAIN_PROVIDER || 'mock',
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
};
