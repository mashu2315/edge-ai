import axios, { AxiosInstance } from 'axios';
import type {
  SystemMetrics,
  ProcessInfo,
  AiInsight,
  RemediationPlan,
  CleanupAnalysisResult,
  CleanupExecutionResult,
} from '@/types';
import {
  generateSystemMetrics,
  generateProcesses,
  generateAiInsight,
  generateRemediationScript,
  generateMockCleanupAnalysis,
  generateMockCleanupExecution,
} from './mockData';

const API_BASE = 'http://localhost:5000/api';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let usingMock = false;

function isMockMode(): boolean {
  return usingMock;
}

async function withFallback<T>(
  request: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  try {
    const result = await request();
    usingMock = false;
    return result;
  } catch {
    usingMock = true;
    return fallback();
  }
}

export async function fetchSystemMetrics(): Promise<SystemMetrics> {
  return withFallback(
    () => client.get<SystemMetrics>('/system/metrics').then((r) => r.data),
    () => generateSystemMetrics(),
  );
}

export async function fetchProcesses(): Promise<ProcessInfo[]> {
  return withFallback(
    () => client.get<ProcessInfo[]>('/system/processes').then((r) => r.data),
    () => generateProcesses(),
  );
}

export async function analyzeWithAI(): Promise<AiInsight> {
  return withFallback(
    () => client.post<AiInsight>('/ai/analyze').then((r) => r.data),
    () => generateAiInsight(),
  );
}

export async function requestRemediation(insight: AiInsight): Promise<RemediationPlan> {
  return withFallback(
    () =>
      client
        .post<RemediationPlan>('/ai/remediate', { insightId: insight.id, insight })
        .then((r) => r.data),
    () => {
      const script = generateRemediationScript(insight);
      return {
        id: `rem-${Date.now()}`,
        insightId: insight.id,
        script,
        description: insight.recommendedAction,
        riskLevel: insight.severity === 'critical' ? 'high' : insight.severity === 'high' ? 'medium' : 'low',
        estimatedDuration: insight.category === 'security' ? '~45s' : '~20s',
        steps: script.split('\n').filter((l) => l.includes('Step') || l.includes('echo "[INFO]"')),
        createdAt: Date.now(),
      };
    },
  );
}

export async function executeRemediation(
  planId: string,
  approved: boolean,
): Promise<{ success: boolean; message: string }> {
  return withFallback(
    () =>
      client
        .post('/ai/remediate/execute', { planId, approved })
        .then((r) => r.data),
    () => ({
      success: approved,
      message: approved
        ? 'Remediation script executed successfully (mock mode).'
        : 'Remediation rejected (mock mode).',
    }),
  );
}

export async function analyzeTempFiles(): Promise<CleanupAnalysisResult> {
  return withFallback(
    () => client.post<CleanupAnalysisResult>('/system/cleanup/analyze').then((r) => r.data),
    () => generateMockCleanupAnalysis(),
  );
}

export async function getCleanupPlan(approvedPaths: string[]): Promise<{ id: string; script: string; file_count: number; manifest_path?: string }> {
  return withFallback(
    () =>
      client
        .post('/system/cleanup/plan', { approved_paths: approvedPaths })
        .then((r) => r.data),
    () => ({
      id: `cleanup-plan-${Date.now()}`,
      script: `#!/bin/bash\nset -euo pipefail\n# Mock cleanup script for ${approvedPaths.length} files\necho "[INFO] Deleting ${approvedPaths.length} files..."\n${approvedPaths.map((p) => `rm -f "${p}"`).join('\n')}\necho "[DONE] Cleanup complete"`,
      file_count: approvedPaths.length,
      manifest_path: '/var/log/edge-ai/cleanup/manifest.json',
    }),
  );
}

export async function executeCleanup(
  approvedPaths: string[],
  approved: boolean,
  planId?: string,
): Promise<CleanupExecutionResult> {
  return withFallback(
    () =>
      client
        .post<CleanupExecutionResult>('/system/cleanup/execute', {
          plan_id: planId,
          approved_paths: approvedPaths,
          approved,
        })
        .then((r) => r.data),
    () => generateMockCleanupExecution(approvedPaths.length),
  );
}

export { isMockMode };

export async function runNpuOptimization(modelPath: string): Promise<import('@/types').NpuOptimizationResult> {
  return withFallback(
    () => client.post<import('@/types').NpuOptimizationResult>('/optimization/run', { modelPath }).then((r) => r.data),
    () => ({
      success: true,
      logs: 'Mock execution log\nOptimization complete.',
      report: {
        original_model: { execution_provider: 'QNN', latency_ms: 15.42, is_npu_compatible: true },
        optimized_model: { execution_provider: 'QNN', latency_ms: 5.21, is_npu_compatible: true, quantization: 'INT8' },
        metrics: { latency_reduction_pct: 66.21, power_savings_w: 0.4 },
        recommendation: 'Optimization successful. Deploy INT8 model to Snapdragon NPU.'
      }
    })
  );
}

export async function getLatestNpuReport(): Promise<{ report: import('@/types').NpuOptimizationReport }> {
  return withFallback(
    () => client.get<{ report: import('@/types').NpuOptimizationReport }>('/optimization/report').then((r) => r.data),
    () => ({
      report: {
        original_model: { execution_provider: 'QNN', latency_ms: 15.42, is_npu_compatible: true },
        optimized_model: { execution_provider: 'QNN', latency_ms: 5.21, is_npu_compatible: true, quantization: 'INT8' },
        metrics: { latency_reduction_pct: 66.21, power_savings_w: 0.4 },
        recommendation: 'Optimization successful. Deploy INT8 model to Snapdragon NPU.'
      }
    })
  );
}
