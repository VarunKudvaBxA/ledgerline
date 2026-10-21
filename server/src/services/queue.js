import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires maxRetriesPerRequest: null on its connections.
export const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
connection.on('error', (err) => console.error('Redis:', err.message));

export const scoreQueue = new Queue('score', { connection });
