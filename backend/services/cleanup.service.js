'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const config = require('../config/default.json');
const logger = require('../logger');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || config.aiEngine.url || 'http://localhost:8000';
const PLAN_EXPIRY_MS = config.remediation?.planExpiryMs || 300_000; // 5 minutes

// ---------------------------------------------------------------------------
// In-memory plan store (planId → { plan, script, expiresAt })
// ---------------------------------------------------------------------------
const cleanupPlans = new Map();

// ---------------------------------------------------------------------------
// Helper: proxy request to ai-engine
// ---------------------------------------------------------------------------
async function _aiPost(endpoint, body = {}) {
  const res = await fetch(`${AI_ENGINE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeout: 30_000,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI engine ${endpoint} returned ${res.status}: ${text}`);
  }
  return res.json();
}

async function _aiGet(endpoint) {
  const res = await fetch(`${AI_ENGINE_URL}${endpoint}`, { timeout: 60_000 });
  if (!res.ok) throw new Error(`AI engine GET ${endpoint} returned ${res.status}`);
  return res.json();
}

// ===========================================================================
// analyzeCleanup — scan + classify temp files via AI engine
// ===========================================================================
async function analyzeCleanup() {
  logger.info('[cleanup] Starting temp file analysis via AI engine...');
  const data = await _aiPost('/cleanup/analyze');
  logger.info(
    `[cleanup] Analysis complete: ${data.scanned} files scanned, ` +
    `${(data.safe_to_delete || []).length} safe to delete, ` +
    `${data.total_reclaimable_mb} MB reclaimable`
  );
  return data;
}

// ===========================================================================
// generateCleanupPlan — get script from AI engine, store with expiry token
// ===========================================================================
async function generateCleanupPlan(approvedPaths) {
  if (!Array.isArray(approvedPaths) || approvedPaths.length === 0) {
    throw new Error('approvedPaths must be a non-empty array');
  }

  const planId = uuidv4();
  logger.info(`[cleanup] Generating cleanup plan ${planId} (${approvedPaths.length} files)`);

  const data = await _aiPost('/cleanup/execute', {
    approved_paths: approvedPaths,
    plan_id: planId,
    dry_run: false,
  });

  if (data.error) throw new Error(data.error);

  const plan = {
    id: planId,
    script: data.script,
    manifest_path: data.manifest_path,
    valid_paths: data.valid_paths || [],
    rejected_paths: data.rejected_paths || [],
    file_count: data.file_count || 0,
    created_at: Date.now(),
  };

  const expiresAt = Date.now() + PLAN_EXPIRY_MS;
  cleanupPlans.set(planId, { plan, expiresAt });
  setTimeout(() => cleanupPlans.delete(planId), PLAN_EXPIRY_MS);

  logger.info(`[cleanup] Plan ${planId} generated: ${plan.file_count} valid paths`);
  return plan;
}

// ===========================================================================
// executeCleanupPlan — REQUIRES approved === true; runs sandboxed execFile
// ===========================================================================
async function executeCleanupPlan(planId, approved) {
  if (!approved) {
    logger.warn(`[cleanup] Execution REJECTED by user for plan ${planId}`);
    return { success: false, message: 'Cleanup not approved by user.' };
  }

  const entry = cleanupPlans.get(planId);
  if (!entry) {
    return { success: false, message: 'Cleanup plan not found or has expired (> 5 min).' };
  }
  if (Date.now() > entry.expiresAt) {
    cleanupPlans.delete(planId);
    return { success: false, message: 'Cleanup plan has expired. Run a new analysis.' };
  }

  const { plan } = entry;
  const tmpFile = path.join(os.tmpdir(), `edge-ai-cleanup-${planId}.sh`);

  try {
    fs.writeFileSync(tmpFile, plan.script, { mode: 0o700 });
    logger.info(`[cleanup] Executing approved plan ${planId} via ${tmpFile}`);

    return await new Promise((resolve) => {
      execFile('/bin/bash', [tmpFile], { timeout: 120_000 }, (error, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}

        if (error) {
          logger.error(`[cleanup] Plan ${planId} failed: ${error.message}\n${stderr}`);
          resolve({ success: false, message: `Execution failed: ${error.message}`, output: stderr });
        } else {
          logger.info(`[cleanup] Plan ${planId} succeeded:\n${stdout}`);
          cleanupPlans.delete(planId); // consumed — one-shot
          resolve({
            success: true,
            message: 'Cleanup executed successfully.',
            output: stdout,
            files_deleted: plan.valid_paths.length,
            manifest_path: plan.manifest_path,
          });
        }
      });
    });
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return { success: false, message: `Failed to write/execute script: ${err.message}` };
  }
}

// ===========================================================================
// NPU status proxy
// ===========================================================================
async function getNpuStatus() {
  return _aiGet('/npu/status');
}

async function runNpuBenchmark() {
  return _aiPost('/npu/benchmark');
}

async function triggerNpuOptimize() {
  return _aiPost('/npu/optimize');
}

module.exports = {
  analyzeCleanup,
  generateCleanupPlan,
  executeCleanupPlan,
  getNpuStatus,
  runNpuBenchmark,
  triggerNpuOptimize,
};

