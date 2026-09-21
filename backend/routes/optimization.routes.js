const express = require('express');
const router = express.Router();
const optimizationService = require('../services/optimization.service');

router.post('/run', async (req, res) => {
  const { modelPath } = req.body;
  if (!modelPath) {
    return res.status(400).json({ error: "modelPath is required" });
  }

  try {
    const result = await optimizationService.runOptimization(modelPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Optimization failed", details: error });
  }
});

router.get('/report', (req, res) => {
  try {
    const report = optimizationService.getLatestReport();
    if (report) {
      res.json({ report });
    } else {
      res.status(404).json({ error: "No report found. Run optimization first." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

