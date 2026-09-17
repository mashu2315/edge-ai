const express = require('express');
const cors = require('cors');
const http = require('http');
const config = require('./config/default.json');
const logger = require('./logger');

const systemRoutes = require('./routes/system.routes');
const logsRoutes = require('./routes/logs.routes');
const aiRoutes = require('./routes/ai.routes');
const cleanupRoutes = require('./routes/cleanup.routes');

const wsService = require('./services/websocket.service');

// Auto-start singletons implicitly happens on require
require('./services/telemetry.service');
require('./services/log.service');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/system', systemRoutes);
app.use('/api/system', cleanupRoutes);   // mounts /api/system/cleanup/* and /api/system/npu/*
app.use('/system', cleanupRoutes);       // also supports /system/cleanup/* directly
app.use('/api/logs', logsRoutes);
app.use('/api/ai', aiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

const server = http.createServer(app);
wsService.setup(server);

server.listen(config.server.port, config.server.host, () => {
  logger.info(`Server listening on ${config.server.host}:${config.server.port}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully.');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully.');
  server.close(() => {
    process.exit(0);
  });
});
