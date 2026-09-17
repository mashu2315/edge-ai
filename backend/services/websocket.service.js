const { WebSocketServer } = require('ws');
const telemetryService = require('./telemetry.service');
const logService = require('./log.service');
const logger = require('../logger');

class WebSocketService {
  constructor() {
    this.wss = null;
  }

  setup(httpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url === '/ws/live-metrics') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => { logger.info('WebSocket client disconnected'); });
    });

    setInterval(() => {
      this.wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    // Event bindings
    telemetryService.on('metrics', (data) => this.broadcast({ type: 'system', data }));
    telemetryService.on('npu', (data) => this.broadcast({ type: 'npu', data }));
    logService.on('log', (data) => this.broadcast({ type: 'log', data }));
    logService.on('anomaly', (data) => this.broadcast({ type: 'anomaly', data }));
    // cleanup:suggestions and cleanup:complete are broadcast directly from cleanup.routes.js
    // via wsService.broadcast({ type: 'cleanup:suggestions', data }) and
    // wsService.broadcast({ type: 'cleanup:complete', data })
  }

  broadcast(payload) {
    if (!this.wss) return;
    const data = JSON.stringify(payload);
    this.wss.clients.forEach(client => {
      if (client.readyState === 1 /* OPEN */) {
        client.send(data);
      }
    });
  }
}

const wsService = new WebSocketService();
module.exports = wsService;
