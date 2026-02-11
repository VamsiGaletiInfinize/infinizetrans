import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { config } from './config';
import { meetingsRouter } from './routes/meetings';
import { handleWebSocketConnection } from './ws/handler';

const app = express();

app.use(
  cors({
    origin: config.server.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());

// Health-check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST routes
app.use('/api', meetingsRouter);

// HTTP server
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', handleWebSocketConnection);

httpServer.listen(config.server.port, () => {
  const p = config.server.port;
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   Infinize Translation Server                         ║
║   REST API  : http://localhost:${p}/api               ║
║   WebSocket : ws://localhost:${p}/ws                  ║
║   Region    : ${config.aws.region.padEnd(40)}║
╚═══════════════════════════════════════════════════════╝`);
});

// HTTPS server (if certs exist)
const certPath = process.env.SSL_CERT_PATH || '/app/certs/cert.pem';
const keyPath = process.env.SSL_KEY_PATH || '/app/certs/key.pem';

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = https.createServer(
    { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    app,
  );
  const wssSecure = new WebSocketServer({ server: httpsServer, path: '/ws' });
  wssSecure.on('connection', handleWebSocketConnection);

  httpsServer.listen(443, () => {
    console.log(`║   HTTPS API : https://localhost:443/api              ║`);
    console.log(`║   WSS       : wss://localhost:443/ws                 ║`);
  });
}
