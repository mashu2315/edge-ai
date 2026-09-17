import { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, Pause, Play, ChevronDown } from 'lucide-react';
import type { LogEntry, LogLevel } from '@/types';

interface LogsViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  loading: boolean;
}

const LEVEL_STYLES: Record<LogLevel, { text: string; bg: string; border: string; label: string }> = {
  INFO: { text: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20', label: 'INFO' },
  WARN: { text: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20', label: 'WARN' },
  ERROR: { text: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/20', label: 'ERR ' },
  CRITICAL: { text: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/40', label: 'CRIT' },
  DEBUG: { text: 'text-slate-500', bg: 'bg-slate-500/5', border: 'border-slate-500/20', label: 'DBG ' },
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function LogsViewer({ logs, onClear, loading }: LogsViewerProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setShowScrollButton(!atBottom);
    if (!atBottom && autoScroll) {
      setAutoScroll(false);
    } else if (atBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setAutoScroll(true);
      setShowScrollButton(false);
    }
  };

  const anomalyCount = logs.filter((l) => l.isAnomaly).length;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800/60 bg-slate-950/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Live System Logs</h3>
          <span className="ml-2 rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
            {logs.length} entries
          </span>
          {anomalyCount > 0 && (
            <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">
              {anomalyCount} anomalies
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              autoScroll ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {autoScroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {autoScroll ? 'Auto-scroll' : 'Paused'}
          </button>
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-rose-400"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed scroll-smooth"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}
      >
        {loading && logs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
              Connecting to log stream...
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-600">
            No logs yet. Waiting for data...
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log) => {
              const style = LEVEL_STYLES[log.level];
              return (
                <div
                  key={log.id}
                  className={`group flex items-start gap-2 rounded px-2 py-1 transition-colors hover:bg-slate-800/30 ${
                    log.isAnomaly ? `${style.bg} border-l-2 ${style.border}` : ''
                  }`}
                  style={{ animation: log.isAnomaly ? 'fadeInLeft 0.3s ease-out both' : undefined }}
                >
                  <span className="shrink-0 text-slate-600">{formatTimestamp(log.timestamp)}</span>
                  <span className={`shrink-0 font-bold ${style.text}`}>[{style.label}]</span>
                  <span className="shrink-0 text-slate-500">{log.source}</span>
                  <span className={`flex-1 ${log.isAnomaly ? 'text-slate-200' : 'text-slate-400'}`}>
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/90 px-4 py-2 text-xs font-medium text-slate-300 shadow-lg backdrop-blur-sm transition-all hover:bg-slate-800"
        >
          <ChevronDown className="h-3 w-3" />
          Jump to latest
        </button>
      )}
    </div>
  );
}
