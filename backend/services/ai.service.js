const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/default.json');
const logger = require('../logger');

class AiService {
  constructor() {
    this.baseUrl = config.aiEngine.url;
    this.timeout = config.aiEngine.timeout;
    this.metricsHistory = [];
  }

  async isHealthy() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { timeout: 2000 });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async analyze(metrics, recentLogs) {
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 5) this.metricsHistory.shift();

    try {
      const res = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, recentLogs }),
        timeout: this.timeout
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      logger.warn(`AI engine unreachable, using rule-based heuristics: ${e.message}`);
    }

    return this.ruleBasedAnalysis(metrics, recentLogs);
  }

  ruleBasedAnalysis(metrics, recentLogs) {
    const insight = {
      id: uuidv4(),
      title: 'System Stable',
      description: 'System operating within normal parameters.',
      rootCause: 'None',
      confidence: 45,
      severity: 'low',
      category: 'performance',
      detectedAt: Date.now(),
      affectedComponents: [],
      recommendedAction: 'None',
      status: 'active'
    };

    let cpuSpikeCount = this.metricsHistory.filter(m => m.cpuUsage > 90).length;
    if (cpuSpikeCount >= 3) {
      insight.title = 'CPU is maxing out';
      insight.description = 'The system is working unusually hard over a sustained period.';
      insight.severity = 'high';
      insight.recommendedAction = 'Close unnecessary background apps to free up CPU.';
      insight.affectedComponents = ['CPU'];
      return insight;
    }

    if (metrics.memoryUsage > 85) {
      insight.title = 'Running out of memory';
      insight.description = 'A program is consuming too much memory.';
      insight.severity = 'medium';
      insight.recommendedAction = 'Restart affected services or close apps.';
      insight.affectedComponents = ['Memory'];
      return insight;
    }

    const anomalies = recentLogs.filter(l => l.isAnomaly);
    if (anomalies.length > 0) {
      insight.title = 'Suspicious logs detected';
      insight.severity = anomalies[0].level === 'CRITICAL' ? 'critical' : 'high';
      insight.description = 'Unusual activity found in system logs: ' + anomalies[0].message;
      insight.category = 'software';
      insight.affectedComponents = ['Logs'];
      return insight;
    }

    return insight;
  }
}

const aiService = new AiService();
module.exports = aiService;
