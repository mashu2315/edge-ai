import type {
  SystemMetrics,
  NpuMetrics,
  LogEntry,
  AiInsight,
} from '@/types';
import {
  generateSystemMetrics,
  generateNpuMetrics,
  generateLogEntry,
  generateAnomalyLog,
  generateAiInsight,
} from './mockData';

export type MetricPayload =
  | { type: 'system'; data: SystemMetrics }
  | { type: 'npu'; data: NpuMetrics }
  | { type: 'log'; data: LogEntry }
  | { type: 'anomaly'; data: LogEntry }
  | { type: 'insight'; data: AiInsight }
  | { type: 'cleanup:suggestions'; data: import('@/types').CleanupAnalysisResult }
  | { type: 'cleanup:complete'; data: { plan_id: string; files_deleted: number; message: string } };

type Listener = (payload: MetricPayload) => void;
type StatusListener = (status: 'connected' | 'reconnecting' | 'disconnected') => void;

const WS_URL = 'ws://localhost:5000/ws/live-metrics';
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 15000;
const TICK_INTERVAL = 2000;
const LOG_INTERVAL = 1500;
const ANOMALY_INTERVAL = 12000;
const INSIGHT_INTERVAL = 20000;

/**
 * WebSocket service with automatic reconnection and graceful fallback to
 * a local mock-data simulator when the backend is unreachable.
 */
class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mockTimers: ReturnType<typeof setInterval>[] = [];
  private mockPrevSystem: Partial<SystemMetrics> = {};
  private mockPrevNpu: Partial<NpuMetrics> = {};
  private useMock = false;
  private started = false;

  connect(): void {
    if (this.started) return;
    this.started = true;
    this.attemptConnection();
  }

  private attemptConnection(): void {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.useMock = false;
        this.stopMock();
        this.notifyStatus('connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as MetricPayload;
          this.listeners.forEach((fn) => fn(payload));
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onerror = () => {
        // The onclose handler will fire and trigger reconnect/fallback
      };

      this.ws.onclose = () => {
        if (!this.useMock) {
          this.notifyStatus('reconnecting');
          this.scheduleReconnect();
        }
      };
    } catch {
      this.notifyStatus('reconnecting');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= 3) {
      this.startMock();
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.attemptConnection();
    }, delay);
  }

  private startMock(): void {
    if (this.useMock) return;
    this.useMock = true;
    this.notifyStatus('connected');

    // System metrics tick
    this.mockTimers.push(
      setInterval(() => {
        const data = generateSystemMetrics(this.mockPrevSystem);
        this.mockPrevSystem = data;
        this.emit({ type: 'system', data });
      }, TICK_INTERVAL),
    );

    // NPU metrics tick
    this.mockTimers.push(
      setInterval(() => {
        const data = generateNpuMetrics(this.mockPrevNpu);
        this.mockPrevNpu = data;
        this.emit({ type: 'npu', data });
      }, TICK_INTERVAL),
    );

    // Log stream
    this.mockTimers.push(
      setInterval(() => {
        this.emit({ type: 'log', data: generateLogEntry() });
      }, LOG_INTERVAL),
    );

    // Anomaly logs
    this.mockTimers.push(
      setInterval(() => {
        this.emit({ type: 'anomaly', data: generateAnomalyLog() });
      }, ANOMALY_INTERVAL),
    );

    // AI insights
    this.mockTimers.push(
      setInterval(() => {
        this.emit({ type: 'insight', data: generateAiInsight() });
      }, INSIGHT_INTERVAL),
    );
  }

  private stopMock(): void {
    this.mockTimers.forEach(clearInterval);
    this.mockTimers = [];
  }

  private emit(payload: MetricPayload): void {
    this.listeners.forEach((fn) => fn(payload));
  }

  private notifyStatus(status: 'connected' | 'reconnecting' | 'disconnected'): void {
    this.statusListeners.forEach((fn) => fn(status));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  disconnect(): void {
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopMock();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus('disconnected');
  }

  isMockMode(): boolean {
    return this.useMock;
  }
}

export const wsService = new WebSocketService();
