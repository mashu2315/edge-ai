import { useState, useCallback } from 'react';
import { Trash2, Sparkles, ArrowRight, Cpu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SystemStats } from './SystemStats';
import { NpuPowerWidget } from './NpuPowerWidget';
import { LogsViewer } from './LogsViewer';
import { AiInsights } from './AiInsights';
import { RemediationModal } from './RemediationModal';
import { ProcessTable } from './ProcessTable';
import { TempCleaner } from './TempCleaner';
import { NpuOptimization } from './NpuOptimization';
import { useLiveMetrics } from '@/hooks/useLiveMetrics';
import { wsService } from '@/services/websocket';
import type { ViewSection, AiInsight } from '@/types';

export function Dashboard() {
  const [activeSection, setActiveSection] = useState<ViewSection>('overview');
  const [remediationInsight, setRemediationInsight] = useState<AiInsight | null>(null);

  const {
    systemMetrics,
    npuMetrics,
    logs,
    insights,
    history,
    connectionStatus,
    dismissInsight,
    clearLogs,
  } = useLiveMetrics();

  const handleRemediate = useCallback((insight: AiInsight) => {
    setRemediationInsight(insight);
  }, []);

  const loading = !systemMetrics || !npuMetrics;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-200">
      {/* Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        connectionStatus={connectionStatus}
        isMockMode={wsService.isMockMode()}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/60 bg-slate-950/80 px-6 py-3 backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white capitalize">
              {activeSection === 'overview'
                ? 'System Overview'
                : activeSection === 'metrics'
                ? 'System Metrics'
                : activeSection === 'logs'
                ? 'Live Logs'
                : activeSection === 'insights'
                ? 'AI Insights'
                : activeSection === 'processes'
                ? 'Processes'
                : 'AI Temp Cleaner'}
            </h2>
            <p className="text-xs text-slate-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connectionStatus.connected && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">
                  {wsService.isMockMode() ? 'Demo Mode Active' : 'Live'}
                </span>
              </div>
            )}
            {systemMetrics && (
              <div className="hidden items-center gap-4 text-xs sm:flex">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">CPU</span>
                  <span className={`font-semibold ${systemMetrics.cpuUsage > 80 ? 'text-rose-400' : 'text-cyan-400'}`}>
                    {systemMetrics.cpuUsage.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">MEM</span>
                  <span className={`font-semibold ${systemMetrics.memoryUsage > 85 ? 'text-rose-400' : 'text-blue-400'}`}>
                    {systemMetrics.memoryUsage.toFixed(1)}%
                  </span>
                </div>
                {npuMetrics && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">NPU</span>
                    <span className={`font-semibold ${npuMetrics.utilization > 85 ? 'text-rose-400' : 'text-cyan-400'}`}>
                      {npuMetrics.utilization.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="p-6">
          {activeSection === 'overview' && (
            <div className="space-y-6">
              {/* Top Row: System Stats + NPU Widget */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SystemStats metrics={systemMetrics} history={history} loading={loading} />
                <NpuPowerWidget metrics={npuMetrics} history={history} loading={loading} />
              </div>

              {/* AI Insights + Logs */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <AiInsights insights={insights} onRemediate={handleRemediate} onDismiss={dismissInsight} loading={loading} />
                <div className="h-[500px]">
                  <LogsViewer logs={logs} onClear={clearLogs} loading={loading} />
                </div>
              </div>

              {/* Quick Temp Cleanup Banner */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800/60 bg-gradient-to-r from-cyan-500/10 via-slate-900/40 to-blue-500/10 p-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">AI Intelligent Temp Cleaner</h4>
                      <span className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <Sparkles className="h-3 w-3" />
                        Ready
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Classifies temporary files across <code className="text-slate-300">/tmp</code>, <code className="text-slate-300">/var/tmp</code>, <code className="text-slate-300">~/.cache</code>, and <code className="text-slate-300">Trash</code> to safely reclaim disk space.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSection('cleanup')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-cyan-400 border border-slate-700/60 hover:bg-slate-700/80 hover:text-cyan-300 transition-all shadow-md shrink-0"
                >
                  <span>Open Temp Cleaner</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Quick NPU Optimization Banner */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800/60 bg-gradient-to-r from-blue-500/10 via-slate-900/40 to-indigo-500/10 p-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">Snapdragon NPU Optimizer</h4>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Validate edge AI models against Snapdragon NPU constraints and automatically apply INT8 quantization.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSection('npu-opt')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-blue-400 border border-slate-700/60 hover:bg-slate-700/80 hover:text-blue-300 transition-all shadow-md shrink-0"
                >
                  <span>Optimize Model</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeSection === 'metrics' && (
            <div className="space-y-6">
              <SystemStats metrics={systemMetrics} history={history} loading={loading} />
              <NpuPowerWidget metrics={npuMetrics} history={history} loading={loading} />
            </div>
          )}

          {activeSection === 'logs' && (
            <div className="h-[calc(100vh-120px)]">
              <LogsViewer logs={logs} onClear={clearLogs} loading={loading} />
            </div>
          )}

          {activeSection === 'insights' && (
            <AiInsights insights={insights} onRemediate={handleRemediate} onDismiss={dismissInsight} loading={loading} />
          )}

          {activeSection === 'processes' && <ProcessTable />}
          {activeSection === 'cleanup' && <TempCleaner />}
          {activeSection === 'npu-opt' && <NpuOptimization />}
        </div>
      </main>

      {/* Remediation Modal */}
      <RemediationModal insight={remediationInsight} onClose={() => setRemediationInsight(null)} />
    </div>
  );
}
