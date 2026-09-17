'use strict';

const express = require('express');
const router = express.Router();
const cleanupService = require('../services/cleanup.service');
const wsService = require('../services/websocket.service');
const logger = require('../logger');

// ---------------------------------------------------------------------------
// POST /api/system/cleanup/analyze & /system/cleanup/analyze
// Scan temp directories and return AI classification results.
// ---------------------------------------------------------------------------
router.post(['/cleanup/analyze', '/analyze'], async (req, res) => {
  try {
    const result = await cleanupService.analyzeCleanup();

    // Broadcast suggestions over WebSocket so the UI can react in real-time
    wsService.broadcast({ type: 'cleanup:suggestions', data: result });

    res.json(result);
  } catch (error) {
    logger.error(`[cleanup route] /analyze error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/system/cleanup/plan & /system/cleanup/plan
// Generate a cleanup execution plan from a list of approved paths.
// Body: { approved_paths: string[] }
// ---------------------------------------------------------------------------
router.post(['/cleanup/plan', '/plan'], async (req, res) => {
  try {
    const { approved_paths } = req.body;
    if (!Array.isArray(approved_paths) || approved_paths.length === 0) {
      return res.status(400).json({ error: 'approved_paths must be a non-empty array' });
    }

    const plan = await cleanupService.generateCleanupPlan(approved_paths);
    res.json(plan);
  } catch (error) {
    logger.error(`[cleanup route] /plan error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/system/cleanup/execute & /system/cleanup/execute
// Execute a cleanup plan. Accepts { plan_id, approved: true } or { approved_paths, approved: true }
// ---------------------------------------------------------------------------
router.post(['/cleanup/execute', '/execute'], async (req, res) => {
  try {
    let { plan_id, approved, approved_paths } = req.body;
    if (!approved) {
      return res.status(403).json({ success: false, message: 'Cleanup not approved by user.' });
    }

    // Support direct execution by generating plan on the fly if approved_paths passed
    if (!plan_id && Array.isArray(approved_paths) && approved_paths.length > 0) {
      const plan = await cleanupService.generateCleanupPlan(approved_paths);
      plan_id = plan.id;
    }

    if (!plan_id) return res.status(400).json({ error: 'plan_id or approved_paths is required' });

    const result = await cleanupService.executeCleanupPlan(plan_id, approved);

    if (result.success) {
      wsService.broadcast({
        type: 'cleanup:complete',
        data: {
          plan_id,
          files_deleted: result.files_deleted,
          message: result.message,
        },
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`[cleanup route] /execute error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/system/npu/status
// Run NPU verification and return structured status.
// ---------------------------------------------------------------------------
router.get('/npu/status', async (req, res) => {
  try {
    const result = await cleanupService.getNpuStatus();
    res.json(result);
  } catch (error) {
    logger.error(`[cleanup route] /npu/status error: ${error.message}`);
    res.status(503).json({
      error: error.message,
      fallback: true,
      device: 'Unknown',
      provider: 'Unknown',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/system/npu/benchmark
// Run latency benchmark (NPU vs CPU comparison).
// ---------------------------------------------------------------------------
router.post('/npu/benchmark', async (req, res) => {
  try {
    const result = await cleanupService.runNpuBenchmark();
    res.json(result);
  } catch (error) {
    logger.error(`[cleanup route] /npu/benchmark error: ${error.message}`);
    res.status(503).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/system/npu/optimize
// Trigger model optimization pipeline in background.
// ---------------------------------------------------------------------------
router.post('/npu/optimize', async (req, res) => {
  try {
    const result = await cleanupService.triggerNpuOptimize();
    res.json(result);
  } catch (error) {
    logger.error(`[cleanup route] /npu/optimize error: ${error.message}`);
    res.status(503).json({ error: error.message });
  }
});

module.exports = router;

