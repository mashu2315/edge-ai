import { BrainCircuit, AlertTriangle, Shield, Cpu, Wifi, Gauge, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { AiInsight } from '@/types';

interface AiInsightsProps {
  insights: AiInsight[];
  onRemediate: (insight: AiInsight) => void;
  onDismiss: (id: string) => void;
  loading: boolean;
}

const SEVERITY_STYLES: Record<AiInsight['severity'], { text: string; bg: string; border: string; label: string }> = {
  low: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'LOW' },
  medium: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'MEDIUM' },
  high: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'HIGH' },
  critical: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', label: 'CRITICAL' },
};

const CATEGORY_ICONS: Record<AiInsight['category'], typeof Cpu> = {
  hardware: Cpu,
  software: Gauge,
  security: Shield,
  performance: AlertTriangle,
  network: Wifi,
};

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 90 ? '#34d399' : score >= 75 ? '#fbbf24' : '#fb7185';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{score}%</span>
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function AiInsights({ insights, onRemediate, onDismiss, loading }: AiInsightsProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-800/60 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
          <BrainCircuit className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">AI Anomaly Detection Engine</h2>
          <p className="text-xs text-slate-500">
            {insights.length} active {insights.length === 1 ? 'insight' : 'insights'} · Auto-analyzing system patterns
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Engine Active
        </div>
      </div>

      {/* Insights List */}
      {loading && insights.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-800/60 bg-slate-900/40">
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            <span className="text-sm">AI engine analyzing system state...</span>
          </div>
        </div>
      ) : insights.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-800/60 bg-slate-900/40">
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <CheckCircle2 className="h-8 w-8 text-emerald-400/50" />
            <span className="text-sm">No anomalies detected. System is operating normally.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, index) => {
            const sev = SEVERITY_STYLES[insight.severity];
            const CatIcon = CATEGORY_ICONS[insight.category];
            return (
              <div
                key={insight.id}
                className={`overflow-hidden rounded-2xl border ${sev.border} bg-slate-900/40 transition-all duration-300 hover:bg-slate-900/70`}
                style={{ animation: `fadeInUp 0.4s ease-out ${index * 60}ms both` }}
              >
                {/* Top Row */}
                <div className="flex items-start gap-3 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${sev.bg}`}>
                    <CatIcon className={`h-5 w-5 ${sev.text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{insight.title}</h3>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sev.bg} ${sev.text}`}>
                        {sev.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-600">{insight.category}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">{insight.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-slate-600">Confidence</p>
                    <ConfidenceBar score={insight.confidence} />
                    <p className="mt-1 text-[10px] text-slate-600">{timeAgo(insight.detectedAt)}</p>
                  </div>
                </div>

                {/* Root Cause */}
                <div className="border-t border-slate-800/40 px-4 py-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-400/70" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">Root Cause Analysis</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">{insight.rootCause}</p>
                </div>

                {/* Affected Components */}
                <div className="flex items-center gap-2 border-t border-slate-800/40 px-4 py-2.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">Affected:</span>
                  {insight.affectedComponents.map((comp) => (
                    <span key={comp} className="rounded-md bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      {comp}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-slate-800/40 px-4 py-3">
                  <button
                    onClick={() => onRemediate(insight)}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-400 transition-all hover:bg-cyan-500/20 hover:shadow-md hover:shadow-cyan-500/10"
                  >
                    <BrainCircuit className="h-3.5 w-3.5" />
                    Generate Fix
                  </button>
                  <button
                    onClick={() => onDismiss(insight.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
