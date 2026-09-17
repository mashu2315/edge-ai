import { useEffect, useState } from 'react';
import { Activity, Cpu, MemoryStick, Search } from 'lucide-react';
import type { ProcessInfo } from '@/types';
import { fetchProcesses } from '@/services/api';

export function ProcessTable() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof ProcessInfo>('cpu');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval>;

    const load = async () => {
      const data = await fetchProcesses();
      if (active) {
        setProcesses(data);
        setLoading(false);
      }
    };

    load();
    timer = setInterval(load, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const statusColors: Record<ProcessInfo['status'], string> = {
    running: 'text-emerald-400 bg-emerald-500/10',
    sleeping: 'text-blue-400 bg-blue-500/10',
    stopped: 'text-amber-400 bg-amber-500/10',
    zombie: 'text-rose-400 bg-rose-500/10',
  };

  const filtered = processes
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search))
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      return sortDir === 'desc'
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });

  const handleSort = (key: keyof ProcessInfo) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl border border-slate-800/60 bg-slate-900/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Running Processes</h3>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{filtered.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter processes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-xs text-slate-300 placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800/60 text-slate-500">
              <th className="cursor-pointer px-4 py-2.5 font-medium hover:text-slate-300" onClick={() => handleSort('pid')}>PID</th>
              <th className="cursor-pointer px-4 py-2.5 font-medium hover:text-slate-300" onClick={() => handleSort('name')}>Process Name</th>
              <th className="cursor-pointer px-4 py-2.5 font-medium hover:text-slate-300" onClick={() => handleSort('cpu')}>
                <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU %</span>
              </th>
              <th className="cursor-pointer px-4 py-2.5 font-medium hover:text-slate-300" onClick={() => handleSort('memory')}>
                <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" /> Mem %</span>
              </th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Threads</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((proc) => (
              <tr
                key={proc.pid}
                className="border-b border-slate-800/30 transition-colors hover:bg-slate-800/30"
              >
                <td className="px-4 py-2.5 font-mono text-slate-500">{proc.pid}</td>
                <td className="px-4 py-2.5 font-medium text-slate-300">{proc.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${proc.cpu > 50 ? 'bg-rose-400' : proc.cpu > 25 ? 'bg-amber-400' : 'bg-cyan-400'}`}
                        style={{ width: `${Math.min(proc.cpu * 2, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-slate-400">{proc.cpu.toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${proc.memory > 10 ? 'bg-amber-400' : 'bg-blue-400'}`}
                        style={{ width: `${Math.min(proc.memory * 5, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-slate-400">{proc.memory.toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${statusColors[proc.status]}`}>
                    {proc.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{proc.user}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">{proc.threads}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
