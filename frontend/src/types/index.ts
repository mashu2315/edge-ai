export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  memoryUsed: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
  temperature: number;
  loadAverage: [number, number, number];
  timestamp: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  status: 'running' | 'sleeping' | 'stopped' | 'zombie';
  user: string;
  threads: number;
}

export interface NpuMetrics {
  utilization: number;
  powerDraw: number;
  temperature: number;
  frequency: number;
  inferenceCount: number;
  modelLatency: number;
  timestamp: number;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'CRITICAL';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  isAnomaly?: boolean;
}

export interface AiInsight {
  id: string;
  title: string;
  description: string;
  rootCause: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'performance' | 'security' | 'hardware' | 'software' | 'network';
  detectedAt: number;
  affectedComponents: string[];
  recommendedAction: string;
  status: 'active' | 'investigating' | 'resolved';
}

export interface RemediationPlan {
  id: string;
  insightId: string;
  script: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedDuration: string;
  steps: string[];
  createdAt: number;
}

export interface MetricHistory {
  cpu: Array<{ time: string; value: number }>;
  memory: Array<{ time: string; value: number }>;
  npu: Array<{ time: string; utilization: number; power: number; temperature: number }>;
  network: Array<{ time: string; in: number; out: number }>;
}

export type ViewSection = 'overview' | 'metrics' | 'logs' | 'insights' | 'processes' | 'cleanup' | 'npu-opt';

export interface ConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  latency: number;
  lastConnected: number | null;
}

export interface TempFileItem {
  path: string;
  size_kb: number;
  age_hours: number;
  extension: string;
  label: 'junk' | 'user-relevant' | 'system-critical';
  safe_to_delete: boolean;
  confidence: number;
  reason: string;
}

export interface CleanupAnalysisResult {
  scanned: number;
  safe_to_delete: TempFileItem[];
  skip: TempFileItem[];
  total_reclaimable_mb: number;
  scan_dirs: string[];
  timestamp: number;
  errors?: string[];
}

export interface CleanupExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  files_deleted?: number;
  manifest_path?: string;
}


export interface NpuOptimizationReport {
  original_model: {
    execution_provider: string;
    latency_ms: number;
    is_npu_compatible: boolean;
  };
  optimized_model: {
    execution_provider: string;
    latency_ms: number;
    is_npu_compatible: boolean;
    quantization: string;
  };
  metrics: {
    latency_reduction_pct: number;
    power_savings_w: number;
  };
  recommendation: string;
}

export interface NpuOptimizationResult {
  success: boolean;
  logs: string;
  report?: NpuOptimizationReport;
  message?: string;
}
