const express = require('express');
const router = express.Router();
const logService = require('../services/log.service');

router.get('/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    res.json(logService.getLogs(limit));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/anomalies', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json(logService.getAnomalies(limit));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
