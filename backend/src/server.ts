import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { config } from './config';
import { meetingsRouter } from './routes/meetings';
import { handleWebSocketConnection } from './ws/handler';

const app = express();

const allowedOrigins = config.server.corsOrigin
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.some((allowed) => origin === allowed) ||
        origin.endsWith('.ngrok-free.dev') ||
        origin.endsWith('.amplifyapp.com')
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS: ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  }),
);
app.use(express.json());

// Health-check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST routes
app.use('/api', meetingsRouter);

// HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', handleWebSocketConnection);

server.listen(config.server.port, () => {
  const p = config.server.port;
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   Infinize Translation Server                         ║
║   REST API  : http://localhost:${p}/api               ║
║   WebSocket : ws://localhost:${p}/ws                  ║
║   Region    : ${config.aws.region.padEnd(40)}║
╚═══════════════════════════════════════════════════════╝`);
});
