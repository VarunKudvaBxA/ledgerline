import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { startWorker } from './services/worker.js';

await connectDb();

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.clientUrl, credentials: true } });
app.set('io', io);

// Only signed-in users can listen to the live feed.
io.use((socket, next) => {
  try {
    jwt.verify(socket.handshake.auth?.token, env.jwtAccessSecret);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

startWorker(io); // runs in this process; move to its own process to scale scoring separately

server.listen(env.port, () => console.log(`Ledgerline API on :${env.port}`));
