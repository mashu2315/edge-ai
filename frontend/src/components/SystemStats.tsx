import { Cpu, MemoryStick, HardDrive, Network, Thermometer, Activity } from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { SystemMetrics } from '@/types';

interface SystemStatsProps {
  metrics: SystemMetrics | null;
  history: Array<{ time: string; cpu: number; memory: number; netIn: number; netOut: number }>;
  loading: boolean;
}

interface StatCardProps {
  icon: typeof Cpu;
  label: string;
  value: string;
  unit: string;
  percentage: number;
  color: string;
  delay: number;
}

function StatCard({ icon: Icon, label, value, unit, percentage, color, delay }: StatCardProps) {
  const getColorClass = (c: string) => {
    const map: Record<string, string> = {
      cyan: 'text-cyan-400 bg-cyan-500/10',
      blue: 'text-blue-400 bg-blue-500/10',
      amber: 'text-amber-400 bg-amber-500/10',
      emerald: 'text-emerald-400 bg-emerald-500/10',
      rose: 'text-rose-400 bg-rose-500/10',
    };
    return map[c] || map.cyan;
  };

  const getBarColor = (c: string) => {
    const map: Record<string, string> = {
      cyan: 'bg-cyan-400',
      blue: 'bg-blue-400',
      amber: 'bg-amber-400',
      emerald: 'bg-emerald-400',
      rose: 'bg-rose-400',
    };
    return map[c] || map.cyan;
  };

  const getBarWidth = (p: number) => {
    if (p > 90) return 'bg-rose-500';
    if (p > 75) return 'bg-amber-500';
    return getBarColor(color);
  };

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 transition-all duration-300 hover:border-slate-700/80 hover:bg-slate-900/70"
      style={{ animation: `fadeInUp 0.5s ease-out ${delay}ms both` }}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${getColorClass(color)} transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-white">
          {value}
          <span className="ml-0.5 text-sm font-medium text-slate-500">{unit}</span>
        </span>
      </div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getBarWidth(percentage)}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-xs font-medium text-slate-600">{percentage.toFixed(1)}%</p>
    </div>
  );
}

export function SystemStats({ metrics, history, loading }: SystemStatsProps) {
  if (loading || !metrics) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
      </div>
    );
  }

  const uptimeStr = (() => {
    const s = metrics.uptime;
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  })();

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Cpu} label="CPU Usage" value={metrics.cpuUsage.toFixed(1)} unit="%" percentage={metrics.cpuUsage} color="cyan" delay={0} />
        <StatCard icon={MemoryStick} label="Memory" value={metrics.memoryUsed.toFixed(1)} unit={`/ ${metrics.memoryTotal}GB`} percentage={metrics.memoryUsage} color="blue" delay={80} />
        <StatCard icon={Network} label="Network In" value={metrics.networkIn.toFixed(1)} unit="MB/s" percentage={Math.min(metrics.networkIn * 6.7, 100)} color="emerald" delay={160} />
        <StatCard icon={Thermometer} label="Temperature" value={metrics.temperature.toFixed(1)} unit="°C" percentage={Math.min((metrics.temperature / 100) * 100, 100)} color={metrics.temperature > 80 ? 'rose' : 'amber'} delay={240} />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3">
          <Activity className="h-4 w-4 text-cyan-400" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Load Avg</p>
            <p className="text-sm font-semibold text-white">{metrics.loadAverage[0].toFixed(2)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3">
          <HardDrive className="h-4 w-4 text-blue-400" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Disk Usage</p>
            <p className="text-sm font-semibold text-white">{metrics.diskUsage.toFixed(1)}%</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3">
          <Network className="h-4 w-4 text-emerald-400" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Net Out</p>
            <p className="text-sm font-semibold text-white">{metrics.networkOut.toFixed(1)} MB/s</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3">
          <Cpu className="h-4 w-4 text-amber-400" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Uptime</p>
            <p className="text-sm font-semibold text-white">{uptimeStr}</p>
          </div>
        </div>
      </div>

      {/* CPU & Memory Chart */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">CPU & Memory Utilization</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <span className="text-slate-400">CPU</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-slate-400">Memory</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area type="monotone" dataKey="cpu" stroke="#22d3ee" strokeWidth={2} fill="url(#cpuGrad)" animationDuration={400} />
            <Area type="monotone" dataKey="memory" stroke="#60a5fa" strokeWidth={2} fill="url(#memGrad)" animationDuration={400} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Network Chart */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Network I/O</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">In (MB/s)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <span className="text-slate-400">Out (MB/s)</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="netInGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="netOutGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
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
            <Area type="monotone" dataKey="netIn" stroke="#34d399" strokeWidth={2} fill="url(#netInGrad)" animationDuration={400} />
            <Area type="monotone" dataKey="netOut" stroke="#a78bfa" strokeWidth={2} fill="url(#netOutGrad)" animationDuration={400} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
