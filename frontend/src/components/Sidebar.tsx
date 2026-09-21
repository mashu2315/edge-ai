import { Activity, Cpu, ScrollText, BrainCircuit, Gauge, Zap, Wifi, WifiOff, Loader2, Trash2 } from 'lucide-react';
import type { ViewSection, ConnectionStatus } from '@/types';

interface SidebarProps {
  activeSection: ViewSection;
  onSectionChange: (section: ViewSection) => void;
  connectionStatus: ConnectionStatus;
  isMockMode: boolean;
}

const NAV_ITEMS: Array<{ id: ViewSection; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'metrics', label: 'System Metrics', icon: Cpu },
  { id: 'logs', label: 'Live Logs', icon: ScrollText },
  { id: 'insights', label: 'AI Insights', icon: BrainCircuit },
  { id: 'processes', label: 'Processes', icon: Activity },
  { id: 'cleanup', label: 'Temp Cleaner', icon: Trash2 },
  { id: 'npu-opt', label: 'NPU Optimization', icon: Cpu },
];

export function Sidebar({ activeSection, onSectionChange, connectionStatus, isMockMode }: SidebarProps) {
  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-slate-800/60 bg-slate-950/80 py-4 backdrop-blur-xl lg:w-60">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
          <Zap className="h-5 w-5 text-white" fill="white" />
        </div>
        <div className="hidden lg:block">
          <h1 className="text-sm font-bold tracking-tight text-white">Edge AI</h1>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Intelligence Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400" />
              )}
              <Icon className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Connection Status */}
      <div className="mt-auto px-2 lg:px-3">
        <div className="flex flex-col gap-2 rounded-lg border border-slate-800/60 bg-slate-900/40 p-3">
          <div className="flex items-center gap-2">
            {connectionStatus.connected ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : connectionStatus.reconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-rose-400" />
            )}
            <span className="hidden text-xs font-medium lg:inline" style={{ color: connectionStatus.connected ? '#34d399' : connectionStatus.reconnecting ? '#fbbf24' : '#fb7185' }}>
              {connectionStatus.connected ? 'Connected' : connectionStatus.reconnecting ? 'Reconnecting...' : 'Disconnected'}
            </span>
          </div>
          {isMockMode && (
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-amber-400/70 lg:inline">
              Demo Mode
            </span>
          )}
          {connectionStatus.connected && connectionStatus.latency > 0 && (
            <span className="hidden text-[10px] text-slate-500 lg:inline">
              {Number(connectionStatus.latency).toFixed(2)}ms latency
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
