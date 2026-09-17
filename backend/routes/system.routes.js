const express = require('express');
const router = express.Router();
const telemetryService = require('../services/telemetry.service');

router.get('/metrics', (req, res) => {
  try {
    const metrics = telemetryService.getLatestMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/processes', (req, res) => {
  try {
    const processes = telemetryService.getLatestProcesses();
    res.json(processes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
