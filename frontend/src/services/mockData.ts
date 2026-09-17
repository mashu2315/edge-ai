import type {
  SystemMetrics,
  ProcessInfo,
  NpuMetrics,
  LogEntry,
  AiInsight,
  LogLevel,
} from '@/types';

const PROCESS_NAMES = [
  'edge_inference_engine',
  'npu_scheduler',
  'anomaly_detector',
  'system_monitor',
  'telemetry_collector',
  'model_loader',
  'data_pipeline',
  'security_scanner',
  'network_proxy',
  'log_aggregator',
  'config_manager',
  'health_checker',
  'resource_optimizer',
  'event_dispatcher',
  'cache_manager',
];

const USERS = ['root', 'edge', 'system', 'nobody'];
const STATUSES: ProcessInfo['status'][] = ['running', 'sleeping', 'stopped', 'zombie'];

const LOG_SOURCES = [
  'npu_scheduler',
  'inference_engine',
  'anomaly_detector',
  'system_monitor',
  'security_scanner',
  'network_proxy',
];

const LOG_TEMPLATES: Array<{ level: LogLevel; message: string }> = [
  { level: 'INFO', message: 'Inference batch completed in {latency}ms' },
  { level: 'INFO', message: 'Model {model} loaded successfully' },
  { level: 'INFO', message: 'NPU frequency scaled to {freq}MHz' },
  { level: 'INFO', message: 'Telemetry packet sent to cloud endpoint' },
  { level: 'INFO', message: 'Health check passed: all subsystems nominal' },
  { level: 'WARN', message: 'Memory usage above 80% threshold ({mem}%)' },
  { level: 'WARN', message: 'NPU temperature approaching limit: {temp}°C' },
  { level: 'WARN', message: 'Inference latency degraded: {latency}ms exceeds SLA' },
  { level: 'WARN', message: 'Process {proc} consuming excessive CPU ({cpu}%)' },
  { level: 'ERROR', message: 'Model inference failed: input tensor shape mismatch' },
  { level: 'ERROR', message: 'NPU thermal throttling activated' },
  { level: 'ERROR', message: 'Connection to cloud telemetry endpoint lost' },
  { level: 'ERROR', message: 'Data pipeline buffer overflow detected' },
  { level: 'CRITICAL', message: 'NPU temperature critical: {temp}°C — initiating safe shutdown' },
  { level: 'CRITICAL', message: 'Memory exhaustion detected — OOM killer may activate' },
  { level: 'DEBUG', message: 'Scheduler tick: {procs} processes evaluated' },
  { level: 'DEBUG', message: 'Cache hit ratio: {ratio}%' },
  { level: 'DEBUG', message: 'GC cycle completed in {gc}ms' },
];

const ANOMALY_MESSAGES: Array<{ level: LogLevel; message: string }> = [
  { level: 'CRITICAL', message: '⚠ ANOMALY DETECTED: CPU spike anomaly — pattern matches crypto-miner signature' },
  { level: 'CRITICAL', message: '⚠ ANOMALY DETECTED: Unusual network egress to unknown IP 185.220.101.47' },
  { level: 'ERROR', message: '⚠ ANOMALY DETECTED: NPU inference time distribution shifted 3σ from baseline' },
  { level: 'CRITICAL', message: '⚠ ANOMALY DETECTED: Process fork bomb pattern detected from edge_inference_engine' },
  { level: 'ERROR', message: '⚠ ANOMALY DETECTED: Memory leak signature in model_loader (growth rate 12MB/min)' },
];

const INSIGHT_TEMPLATES: Omit<AiInsight, 'id' | 'detectedAt' | 'status'>[] = [
  {
    title: 'NPU Thermal Throttling Detected',
    description: 'NPU temperature has exceeded 85°C threshold, triggering automatic frequency reduction. Sustained thermal load will degrade inference throughput by approximately 23%.',
    rootCause: 'Ambient temperature increase combined with sustained inference workload on model_v3_large. The cooling fan profile is set to conservative thresholds.',
    confidence: 94,
    severity: 'high',
    category: 'hardware',
    affectedComponents: ['npu_scheduler', 'inference_engine'],
    recommendedAction: 'Adjust fan curve to aggressive profile and redistribute inference load across NPU cores.',
  },
  {
    title: 'Memory Leak in Model Loader',
    description: 'The model_loader process is exhibiting a steady memory growth pattern of 12MB/minute, consistent with a tensor deallocation defect. OOM risk in approximately 18 minutes.',
    rootCause: 'Model_v3_large weights are not being freed after inference session termination. The garbage collection hook for GPU tensors is missing.',
    confidence: 88,
    severity: 'critical',
    category: 'software',
    affectedComponents: ['model_loader', 'data_pipeline'],
    recommendedAction: 'Restart model_loader process and apply patch to tensor deallocation path.',
  },
  {
    title: 'Anomalous Network Egress Pattern',
    description: 'Outbound traffic to IP 185.220.101.47 detected at 2.3 MB/s. This IP is flagged in threat intelligence feeds. Pattern matches data exfiltration signatures.',
    rootCause: 'The network_proxy process has an open connection to a known malicious endpoint. Likely compromised configuration or supply-chain injection.',
    confidence: 91,
    severity: 'critical',
    category: 'security',
    affectedComponents: ['network_proxy', 'security_scanner'],
    recommendedAction: 'Block the destination IP, kill the network_proxy connection, and rotate API credentials.',
  },
  {
    title: 'CPU Scheduling Anomaly',
    description: 'edge_inference_engine is consuming 67% CPU, significantly above its baseline of 12%. Process behavior pattern matches cryptocurrency mining signatures.',
    rootCause: 'Binary integrity check failed for edge_inference_engine. The process binary appears to have been modified post-installation, injecting a mining payload.',
    confidence: 86,
    severity: 'high',
    category: 'security',
    affectedComponents: ['edge_inference_engine', 'system_monitor'],
    recommendedAction: 'Quarantine the process, restore from known-good binary, and run full security audit.',
  },
  {
    title: 'Inference Latency Degradation',
    description: 'Average inference latency has increased from 45ms to 127ms over the last 15 minutes, exceeding the 100ms SLA threshold.',
    rootCause: 'NPU frequency has been reduced due to thermal throttling. Additionally, the inference queue depth has grown to 234 pending requests, indicating a throughput bottleneck.',
    confidence: 79,
    severity: 'medium',
    category: 'performance',
    affectedComponents: ['inference_engine', 'npu_scheduler'],
    recommendedAction: 'Scale inference workers horizontally and optimize batch size for current NPU frequency.',
  },
];

let processCache: ProcessInfo[] | null = null;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSystemMetrics(prev?: Partial<SystemMetrics>): SystemMetrics {
  const baseCpu = prev?.cpuUsage ?? 35;
  const baseMem = prev?.memoryUsage ?? 45;
  const baseTemp = prev?.temperature ?? 62;

  const cpuUsage = Math.max(5, Math.min(98, baseCpu + rand(-8, 8)));
  const memoryUsage = Math.max(20, Math.min(95, baseMem + rand(-3, 3)));
  const temperature = Math.max(40, Math.min(95, baseTemp + rand(-2, 2)));

  return {
    cpuUsage: Math.round(cpuUsage * 10) / 10,
    memoryUsage: Math.round(memoryUsage * 10) / 10,
    memoryTotal: 16,
    memoryUsed: Math.round((memoryUsage / 100) * 16 * 10) / 10,
    diskUsage: 67.3,
    networkIn: Math.round(rand(0.5, 15) * 100) / 100,
    networkOut: Math.round(rand(0.3, 8) * 100) / 100,
    uptime: (prev?.uptime ?? 86400) + 2,
    temperature: Math.round(temperature * 10) / 10,
    loadAverage: [
      Math.round(rand(0.3, 4) * 100) / 100,
      Math.round(rand(0.3, 3.5) * 100) / 100,
      Math.round(rand(0.2, 3) * 100) / 100,
    ],
    timestamp: Date.now(),
  };
}

export function generateNpuMetrics(prev?: Partial<NpuMetrics>): NpuMetrics {
  const baseUtil = prev?.utilization ?? 55;
  const basePower = prev?.powerDraw ?? 18;
  const baseTemp = prev?.temperature ?? 65;

  const utilization = Math.max(0, Math.min(100, baseUtil + rand(-10, 10)));
  const powerDraw = Math.max(5, Math.min(45, basePower + rand(-2, 2)));

  return {
    utilization: Math.round(utilization * 10) / 10,
    powerDraw: Math.round(powerDraw * 10) / 10,
    temperature: Math.max(45, Math.min(90, baseTemp + rand(-1.5, 1.5))),
    frequency: Math.round(rand(800, 2200)),
    inferenceCount: (prev?.inferenceCount ?? 124530) + Math.floor(rand(5, 50)),
    modelLatency: Number(rand(25.4, 85.6).toFixed(2)),
    timestamp: Date.now(),
  };
}

export function generateProcesses(): ProcessInfo[] {
  if (processCache) {
    return processCache.map((p) => ({
      ...p,
      cpu: Math.max(0, Math.round((p.cpu + rand(-5, 5)) * 10) / 10),
      memory: Math.max(0, Math.round((p.memory + rand(-2, 2)) * 10) / 10),
    }));
  }

  processCache = PROCESS_NAMES.map((name, i) => ({
    pid: 1000 + i * 7,
    name,
    cpu: Math.round(rand(0.1, 30) * 10) / 10,
    memory: Math.round(rand(0.5, 15) * 10) / 10,
    status: pick(STATUSES),
    user: pick(USERS),
    threads: Math.floor(rand(1, 24)),
  }));

  return processCache;
}

export function generateLogEntry(): LogEntry {
  const template = pick(LOG_TEMPLATES);
  const replacements: Record<string, string> = {
    '{latency}': String(Math.floor(rand(30, 200))),
    '{model}': `model_v${Math.floor(rand(1, 5))}`,
    '{freq}': String(Math.floor(rand(800, 2200))),
    '{mem}': String(Math.floor(rand(75, 95))),
    '{temp}': String(Math.floor(rand(75, 90))),
    '{proc}': pick(PROCESS_NAMES),
    '{cpu}': String(Math.floor(rand(40, 90))),
    '{procs}': String(Math.floor(rand(10, 30))),
    '{ratio}': String(Math.floor(rand(60, 99))),
    '{gc}': String(Math.floor(rand(2, 15))),
  };
  const message = template.message.replace(
    /\{latency\}|\{model\}|\{freq\}|\{mem\}|\{temp\}|\{proc\}|\{cpu\}|\{procs\}|\{ratio\}|\{gc\}/g,
    (match) => replacements[match] ?? match,
  );

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    level: template.level,
    source: pick(LOG_SOURCES),
    message,
  };
}

export function generateAnomalyLog(): LogEntry {
  const template = pick(ANOMALY_MESSAGES);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    level: template.level,
    source: 'anomaly_detector',
    message: template.message,
    isAnomaly: true,
  };
}

export function generateAiInsight(): AiInsight {
  const template = pick(INSIGHT_TEMPLATES);
  return {
    ...template,
    id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    detectedAt: Date.now(),
    status: 'active',
  };
}

export function generateRemediationScript(insight: AiInsight): string {
  const scripts: Record<string, string> = {
    hardware: `#!/bin/bash
# Remediation: ${insight.title}
# Risk: LOW | Estimated: ~30s
# Generated by Edge AI Intelligence Engine

set -euo pipefail

echo "[INFO] Applying thermal remediation for ${insight.affectedComponents[0]}..."

# Step 1: Adjust fan curve to aggressive profile
echo "[INFO] Setting fan profile to aggressive..."
echo "aggressive" > /sys/class/npu/fan_profile

# Step 2: Reduce NPU frequency cap to manage thermals
echo "[INFO] Capping NPU frequency to 1800MHz..."
echo 1800 > /sys/class/npu/freq_cap

# Step 3: Redistribute inference load
echo "[INFO] Enabling load distribution across NPU cores..."
npu-cli --distribute-load --strategy=round-robin

# Step 4: Verify thermal state
sleep 5
TEMP=$(cat /sys/class/npu/temperature)
echo "[INFO] Current NPU temperature: \${TEMP}C"
if [ "$TEMP" -lt 80 ]; then
  echo "[SUCCESS] Thermal remediation complete"
else
  echo "[WARN] Temperature still elevated, escalating to passive cooling"
  echo "passive" > /sys/class/npu/cooling_mode
fi

echo "[DONE] Remediation script completed"`,

    software: `#!/bin/bash
# Remediation: ${insight.title}
# Risk: MEDIUM | Estimated: ~15s
# Generated by Edge AI Intelligence Engine

set -euo pipefail

echo "[INFO] Initiating memory leak remediation..."

# Step 1: Capture process state for diagnostics
echo "[INFO] Capturing memory state for analysis..."
ps aux | grep model_loader > /var/log/remediation/mem_state.log

# Step 2: Gracefully restart model_loader
echo "[INFO] Sending SIGTERM to model_loader (PID: $(pgrep model_loader))..."
kill -SIGTERM $(pgrep model_loader)

# Step 3: Wait for clean shutdown
sleep 3

# Step 4: Verify process terminated
if pgrep model_loader > /dev/null; then
  echo "[WARN] Process did not exit gracefully, sending SIGKILL"
  kill -9 $(pgrep model_loader)
fi

# Step 5: Restart with patched binary
echo "[INFO] Starting model_loader with patched deallocation..."
systemctl restart model_loader

# Step 6: Verify recovery
sleep 2
if systemctl is-active --quiet model_loader; then
  echo "[SUCCESS] model_loader restarted successfully"
  echo "[INFO] Monitoring memory for 60s to confirm leak resolved..."
else
  echo "[ERROR] model_loader failed to restart"
  exit 1
fi

echo "[DONE] Remediation script completed"`,

    security: `#!/bin/bash
# Remediation: ${insight.title}
# Risk: HIGH | Estimated: ~45s
# Generated by Edge AI Intelligence Engine

set -euo pipefail

echo "[WARN] SECURITY REMEDIATION — requires approval"
echo "[INFO] Isolating affected components: ${insight.affectedComponents.join(', ')}"

# Step 1: Block malicious IP at firewall level
MALICIOUS_IP="185.220.101.47"
echo "[INFO] Blocking IP \${MALICIOUS_IP}..."
iptables -A OUTPUT -d "\${MALICIOUS_IP}" -j DROP
ip6tables -A OUTPUT -d "\${MALICIOUS_IP}" -j DROP

# Step 2: Kill compromised network_proxy connections
echo "[INFO] Terminating network_proxy connections..."
pkill -f "network_proxy" || true

# Step 3: Rotate API credentials
echo "[INFO] Rotating edge API credentials..."
edge-cli rotate-credentials --force

# Step 4: Quarantine suspicious process
echo "[INFO] Quarantining edge_inference_engine binary..."
mv /opt/edge/bin/edge_inference_engine /var/quarantine/edge_inference_engine.$(date +%s)

# Step 5: Restore from known-good backup
echo "[INFO] Restoring verified binary from backup..."
cp /opt/edge/backup/bin/edge_inference_engine /opt/edge/bin/
chmod +x /opt/edge/bin/edge_inference_engine

# Step 6: Run security audit
echo "[INFO] Initiating full security scan..."
edge-security --scan --deep --report /var/log/remediation/security_audit.log

# Step 7: Restart affected services
systemctl restart edge_inference_engine
systemctl restart network_proxy

echo "[DONE] Security remediation completed — review audit log"`,

    performance: `#!/bin/bash
# Remediation: ${insight.title}
# Risk: LOW | Estimated: ~20s
# Generated by Edge AI Intelligence Engine

set -euo pipefail

echo "[INFO] Optimizing inference pipeline performance..."

# Step 1: Scale inference workers
echo "[INFO] Scaling inference workers from 2 to 4..."
npu-cli --set-workers 4

# Step 2: Optimize batch size for current NPU frequency
FREQ=$(cat /sys/class/npu/current_freq)
echo "[INFO] Current NPU frequency: \${FREQ}MHz"
if [ "$FREQ" -lt 2000 ]; then
  echo "[INFO] Reducing batch size from 32 to 16 for thermal-constrained operation..."
  npu-cli --set-batch-size 16
fi

# Step 3: Clear inference queue backlog
echo "[INFO] Flushing stale inference requests (>30s old)..."
npu-cli --flush-queue --max-age 30

# Step 4: Enable request coalescing
echo "[INFO] Enabling request coalescing for batch optimization..."
echo "enabled" > /sys/class/npu/request_coalescing

# Step 5: Verify latency improvement
sleep 5
LATENCY=$(npu-cli --measure-latency --samples 10)
echo "[INFO] Post-remediation latency: \${LATENCY}ms"

echo "[DONE] Performance optimization complete"`,
  };

  return scripts[insight.category] || scripts.performance;
}

export function generateMockCleanupAnalysis(): import('@/types').CleanupAnalysisResult {
  return {
    scanned: 42,
    safe_to_delete: [
      {
        path: '/tmp/old_build_artifacts.tmp',
        size_kb: 45200,
        age_hours: 74.5,
        extension: '.tmp',
        label: 'junk',
        safe_to_delete: true,
        confidence: 0.94,
        reason: 'Junk: temp extension (.tmp), old (74h) (confidence 94%)',
      },
      {
        path: '/var/tmp/stale_cache_package.part',
        size_kb: 89400,
        age_hours: 120.2,
        extension: '.part',
        label: 'junk',
        safe_to_delete: true,
        confidence: 0.98,
        reason: 'Junk: incomplete download (.part), not accessed in 120h (confidence 98%)',
      },
      {
        path: '/home/user/.cache/thumbnails/large/expired_thumb.png',
        size_kb: 12400,
        age_hours: 96.0,
        extension: '.png',
        label: 'junk',
        safe_to_delete: true,
        confidence: 0.88,
        reason: 'Junk: stale thumbnail cache, not accessed in 96h (confidence 88%)',
      },
      {
        path: '/home/user/.local/share/Trash/files/discarded_core.dump',
        size_kb: 154000,
        age_hours: 168.0,
        extension: '.dump',
        label: 'junk',
        safe_to_delete: true,
        confidence: 0.99,
        reason: 'Junk: trash file older than 7 days (confidence 99%)',
      },
    ],
    skip: [
      {
        path: '/tmp/dbus-daemon.sock',
        size_kb: 0,
        age_hours: 4.2,
        extension: '.sock',
        label: 'system-critical',
        safe_to_delete: false,
        confidence: 1.0,
        reason: 'Active socket — never delete',
      },
      {
        path: '/tmp/systemd-private.lock',
        size_kb: 0,
        age_hours: 12.0,
        extension: '.lock',
        label: 'system-critical',
        safe_to_delete: false,
        confidence: 1.0,
        reason: 'Protected system lock file',
      },
      {
        path: '/var/tmp/active_service.pid',
        size_kb: 0.04,
        age_hours: 8.5,
        extension: '.pid',
        label: 'system-critical',
        safe_to_delete: false,
        confidence: 1.0,
        reason: 'PID file points to a running process',
      },
      {
        path: '/tmp/recent_session_token.tmp',
        size_kb: 1.2,
        age_hours: 3.1,
        extension: '.tmp',
        label: 'user-relevant',
        safe_to_delete: false,
        confidence: 1.0,
        reason: 'File is < 24h old (too recent)',
      },
    ],
    total_reclaimable_mb: 301.0,
    scan_dirs: ['/tmp', '/var/tmp', '~/.cache', '~/.local/share/Trash'],
    timestamp: Date.now(),
  };
}

export function generateMockCleanupExecution(fileCount: number): import('@/types').CleanupExecutionResult {
  return {
    success: true,
    message: `Successfully deleted ${fileCount} temporary files.`,
    files_deleted: fileCount,
    manifest_path: '/var/log/edge-ai/cleanup/cleanup_mock_manifest.json',
    output: `[INFO] Starting cleanup...\n[DELETED] /tmp/old_build_artifacts.tmp\n[DELETED] /var/tmp/stale_cache_package.part\n[DELETED] /home/user/.cache/thumbnails/large/expired_thumb.png\n[DELETED] /home/user/.local/share/Trash/files/discarded_core.dump\n[DONE] Cleanup complete: ${fileCount} deleted`,
  };
}

