import { API_BASE } from '../constants/api';

const METRICS_BASE = `${API_BASE}/metrics`;
const PERFORMANCE_BASE = `${API_BASE}/performance`;
const HEALTH_BASE = `${API_BASE}/health-enhanced`;

// ===== Metrics =====

export interface SystemMetrics {
  timestamp: string;
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { rx: number; tx: number };
  uptime: number;
}

export interface MetricHistory {
  timestamps: string[];
  cpu: number[];
  memory: number[];
  disk: number[];
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const response = await fetch(`${METRICS_BASE}/current`);
  return response.json();
}

export async function getMetricHistory(range: string = '1h'): Promise<MetricHistory> {
  const response = await fetch(`${METRICS_BASE}/history?range=${range}`);
  return response.json();
}

// ===== Performance =====

export interface PerformanceSnapshot {
  id: string;
  timestamp: string;
  duration: number;
  operation: string;
  details: Record<string, unknown>;
}

export async function getPerformanceSnapshots(limit?: number): Promise<{ snapshots: PerformanceSnapshot[] }> {
  const url = new URL(`${PERFORMANCE_BASE}/snapshots`, window.location.origin);
  if (limit) url.searchParams.set('limit', String(limit));
  const response = await fetch(url.toString());
  return response.json();
}

export async function getPerformanceSummary(): Promise<{
  avgResponseTime: number;
  totalRequests: number;
  errorRate: number;
  slowestOperations: PerformanceSnapshot[];
}> {
  const response = await fetch(`${PERFORMANCE_BASE}/summary`);
  return response.json();
}

// ===== Health Enhanced =====

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{
    name: string;
    status: 'up' | 'down' | 'degraded';
    latency: number;
    message: string;
  }>;
  channels: Array<{
    name: string;
    type: string;
    status: 'up' | 'down';
    latency: number;
  }>;
  timestamp: string;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const response = await fetch(`${HEALTH_BASE}/status`);
  return response.json();
}

export async function checkChannel(name: string): Promise<{ name: string; status: 'up' | 'down'; latency: number }> {
  const response = await fetch(`${HEALTH_BASE}/channels/${name}/check`, { method: 'POST' });
  return response.json();
}

export function subscribeToHealthUpdates(onUpdate: (status: HealthStatus) => void): () => void {
  const eventSource = new EventSource(`${HEALTH_BASE}/stream`);
  eventSource.addEventListener('health', (event) => {
    try {
      const data = JSON.parse(event.data);
      onUpdate(data);
    } catch { /* ignore parse errors */ }
  });
  return () => eventSource.close();
}