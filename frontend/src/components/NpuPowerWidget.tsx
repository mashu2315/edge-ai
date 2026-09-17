import { Cpu, Zap, Thermometer, Gauge, TrendingUp, Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import type { NpuMetrics } from '@/types';

interface NpuPowerWidgetProps {
  metrics: NpuMetrics | null;
  history: Array<{ time: string; npuUtil: number; npuPower: number; npuTemp: number }>;
  loading: boolean;
}

function NpuRadialGauge({ value, label, color, size = 160 }: { value: number; label: string; color: string; size?: number }) {
  const data = [{ name: label, value: Math.min(value, 100), fill: color }];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="72%"
          outerRadius="100%"
          barSize={10}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: '#1e293b' }} dataKey="value" cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{value.toFixed(0)}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
    </div>
  );
}

export function NpuPowerWidget({ metrics, history, loading }: NpuPowerWidgetProps) {
  if (loading || !metrics) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
      </div>
    );
  }

  const tempColor = metrics.temperature > 80 ? '#fb7185' : metrics.temperature > 70 ? '#fbbf24' : '#34d399';
  const utilColor = metrics.utilization > 85 ? '#fb7185' : metrics.utilization > 60 ? '#fbbf24' : '#22d3ee';

  return (
    <div className="space-y-4">
      {/* NPU Gauges */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">NPU Status</h3>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="flex flex-col items-center">
            <NpuRadialGauge value={metrics.utilization} label="Utilization" color={utilColor} />
          </div>
          <div className="flex flex-col items-center">
            <NpuRadialGauge value={metrics.temperature} label="Temp °C" color={tempColor} />
          </div>
          <div className="flex flex-col items-center">
            <NpuRadialGauge value={Math.min((metrics.powerDraw / 45) * 100, 100)} label="Power" color="#60a5fa" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2.5">
            <Zap className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Power Draw</p>
              <p className="text-sm font-semibold text-white">{metrics.powerDraw.toFixed(1)}W</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2.5">
            <Gauge className="h-4 w-4 text-cyan-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Frequency</p>
              <p className="text-sm font-semibold text-white">{metrics.frequency} MHz</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2.5">
            <Activity className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Inferences</p>
              <p className="text-sm font-semibold text-white">{metrics.inferenceCount.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2.5">
            <TrendingUp className="h-4 w-4 text-purple-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Latency</p>
              <p className="text-sm font-semibold text-white">{Number(metrics.modelLatency).toFixed(2)}ms</p>
            </div>
          </div>
        </div>
      </div>

      {/* NPU Real-time Graph */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">NPU Real-time Metrics</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <span className="text-slate-400">Util %</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-slate-400">Power W</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              <span className="text-slate-400">Temp °C</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Line type="monotone" dataKey="npuUtil" stroke="#22d3ee" strokeWidth={2} dot={false} animationDuration={400} />
            <Line type="monotone" dataKey="npuPower" stroke="#fbbf24" strokeWidth={2} dot={false} animationDuration={400} />
            <Line type="monotone" dataKey="npuTemp" stroke="#fb7185" strokeWidth={2} dot={false} animationDuration={400} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
