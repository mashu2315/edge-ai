import { useEffect, useRef, useState, useCallback } from 'react';
import { wsService } from '@/services/websocket';
import type { MetricPayload } from '@/services/websocket';
import type {
  SystemMetrics,
  NpuMetrics,
  LogEntry,
  AiInsight,
  ConnectionStatus,
} from '@/types';

const MAX_LOGS = 200;
const MAX_HISTORY = 60;
const MAX_INSIGHTS = 10;

interface MetricHistoryPoint {
  time: string;
  cpu: number;
  memory: number;
  npuUtil: number;
  npuPower: number;
  npuTemp: number;
  netIn: number;
  netOut: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function useLiveMetrics() {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [npuMetrics, setNpuMetrics] = useState<NpuMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    reconnecting: false,
    latency: 0,
    lastConnected: null,
  });

  const lastMessageTime = useRef<number>(Date.now());

  const handlePayload = useCallback((payload: MetricPayload) => {
    lastMessageTime.current = Date.now();

    switch (payload.type) {
      case 'system':
        setSystemMetrics(payload.data);
        setHistory((prev) => {
          const point: MetricHistoryPoint = {
            time: formatTime(payload.data.timestamp),
            cpu: payload.data.cpuUsage,
            memory: payload.data.memoryUsage,
            npuUtil: 0,
            npuPower: 0,
            npuTemp: payload.data.temperature,
            netIn: payload.data.networkIn,
            netOut: payload.data.networkOut,
          };
          const next = [...prev, point];
          if (next.length > MAX_HISTORY) next.shift();
          return next.map((p, i, arr) => {
            const npuEntry = arr.find((e) => e.time === p.time);
            return npuEntry && npuEntry.npuPower > 0
              ? p
              : { ...p, npuUtil: p.npuUtil, npuPower: p.npuPower, npuTemp: p.npuTemp };
          });
        });
        break;

      case 'npu':
        setNpuMetrics(payload.data);
        setHistory((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            npuUtil: payload.data.utilization,
            npuPower: payload.data.powerDraw,
            npuTemp: payload.data.temperature,
          };
          return updated;
        });
        break;

      case 'log':
      case 'anomaly':
        setLogs((prev) => {
          const next = [...prev, payload.data];
          if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
          return next;
        });
        break;

      case 'insight':
        setInsights((prev) => {
          const next = [payload.data, ...prev];
          if (next.length > MAX_INSIGHTS) next.pop();
          return next;
        });
        break;
    }
  }, []);

  useEffect(() => {
    const unsubMetrics = wsService.subscribe(handlePayload);
    const unsubStatus = wsService.subscribeStatus((status) => {
      if (status === 'connected') {
        setConnectionStatus({
          connected: true,
          reconnecting: false,
          latency: 0,
          lastConnected: Date.now(),
        });
      } else if (status === 'reconnecting') {
        setConnectionStatus((prev) => ({
          ...prev,
          connected: false,
          reconnecting: true,
        }));
      } else {
        setConnectionStatus({
          connected: false,
          reconnecting: false,
          latency: 0,
          lastConnected: null,
        });
      }
    });

    wsService.connect();

    // Latency monitor
    const latencyTimer = setInterval(() => {
      const elapsed = Date.now() - lastMessageTime.current;
      setConnectionStatus((prev) => ({
        ...prev,
        latency: prev.connected ? Math.min(elapsed, 9999) : 0,
      }));
    }, 1000);

    return () => {
      unsubMetrics();
      unsubStatus();
      clearInterval(latencyTimer);
      wsService.disconnect();
    };
  }, [handlePayload]);

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    systemMetrics,
    npuMetrics,
    logs,
    insights,
    history,
    connectionStatus,
    dismissInsight,
    clearLogs,
  };
}
