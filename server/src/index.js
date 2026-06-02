// src/index.js
// Architecture choice: Express + Socket.IO on a single Node process.
// Frontend served as static files in production (Vite build output).
// SQLite for persistence — no separate DB service needed on Render.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const setupSockets = require('./socket/socketHandler');

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);

// ── CORS ────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: IS_PROD ? true : [CLIENT_URL, 'http://localhost:5173'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── Serve React Frontend in Production ──────────────────────────────────────
if (IS_PROD) {
  // __dirname = server/src, so ../../client/dist = project root / client / dist
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  console.log('Serving static files from:', clientDist);
  app.use(express.static(clientDist));
  // SPA fallback — must come AFTER API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
});

setupSockets(io);

server.listen(PORT, () => {
  console.log(`🎮 Arschmallows server running on port ${PORT}`);
  console.log(`   Mode: ${IS_PROD ? 'production' : 'development'}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
