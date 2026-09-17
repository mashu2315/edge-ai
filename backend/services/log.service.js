const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/default.json');
const logger = require('../logger');

class LogService extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
    this.maxBuffer = config.logs.maxBuffer;

    this.anomalyPatterns = [
      { regex: /memory.*leak|out of memory|oom/i, level: 'CRITICAL', type: 'Memory' },
      { regex: /cpu.*spike|high.*cpu|cpu.*\d{2,3}%/i, level: 'ERROR', type: 'CPU' },
      { regex: /segfault|core dump|killed|oom killer/i, level: 'CRITICAL', type: 'Crash' },
      { regex: /auth.*fail|permission denied|unauthorized/i, level: 'WARN', type: 'Auth' }
    ];
  }

  addLog(entryData) {
    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      level: entryData.level || 'INFO',
      source: entryData.source || 'system',
      message: entryData.message || '',
      isAnomaly: false
    };

    // Anomaly detection
    for (const pattern of this.anomalyPatterns) {
      if (pattern.regex.test(entry.message)) {
        entry.isAnomaly = true;
        entry.level = pattern.level; // override level based on severity
        this.emit('anomaly', entry);
        logger.warn(`Anomaly detected: [${pattern.type}] ${entry.message}`);
        break;
      }
    }

    this.logs.push(entry);
    if (this.logs.length > this.maxBuffer) {
      this.logs.shift();
    }

    this.emit('log', entry);
    return entry;
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  getAnomalies(limit = 50) {
    return this.logs.filter(l => l.isAnomaly).slice(-limit);
  }
}

const logService = new LogService();
module.exports = logService;
