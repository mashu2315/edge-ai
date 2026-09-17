const express = require('express');
const router = express.Router();
const aiService = require('../services/ai.service');
const telemetryService = require('../services/telemetry.service');
const logService = require('../services/log.service');
const remediationService = require('../services/remediation.service');
const wsService = require('../services/websocket.service');

const insightCache = new Map();

router.post('/analyze', async (req, res) => {
  try {
    const metrics = telemetryService.getLatestMetrics();
    const recentLogs = logService.getLogs(50);
    const insight = await aiService.analyze(metrics, recentLogs);
    
    insightCache.set(insight.id, insight);
    wsService.broadcast({ type: 'insight', data: insight });
    
    res.json(insight);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/remediate', (req, res) => {
  try {
    const { insightId, insight: bodyInsight } = req.body;
    let insight = insightCache.get(insightId);
    if (!insight && bodyInsight) {
      insight = bodyInsight;
    }
    if (!insight) return res.status(404).json({ error: 'Insight not found' });
    
    const plan = remediationService.generatePlan(insight);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/remediate/execute', async (req, res) => {
  try {
    const { planId, approved } = req.body;
    const result = await remediationService.executePlan(planId, approved);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
