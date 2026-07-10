import { request } from './api';

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    available: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
    free: number;
  };
  network: {
    rx: number;
    tx: number;
    rxBytes: number;
    txBytes: number;
  };
  uptime: number;
  process: {
    pid: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface CustomMetricRecord {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface CustomMetricSeries {
  name: string;
  records: CustomMetricRecord[];
}

export async function getCurrentMetrics(): Promise<SystemMetrics> {
  return request<SystemMetrics>('GET', '/api/metrics/current');
}

export async function getLatestMetrics(): Promise<SystemMetrics> {
  return request<SystemMetrics>('GET', '/api/metrics/latest');
}

export async function getHistoryMetrics(minutes?: number): Promise<SystemMetrics[]> {
  const query = minutes ? `?minutes=${minutes}` : '';
  return request<SystemMetrics[]>('GET', `/api/metrics/history${query}`);
}

export interface RecordCustomMetricPayload {
  value: number;
  labels?: Record<string, string>;
}

export async function recordCustomMetric(name: string, data: RecordCustomMetricPayload): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('POST', `/api/metrics/custom/${encodeURIComponent(name)}`, data);
}

export async function getCustomMetric(name: string): Promise<CustomMetricSeries> {
  return request<CustomMetricSeries>('GET', `/api/metrics/custom/${encodeURIComponent(name)}`);
}

export async function getCustomMetricNames(): Promise<string[]> {
  return request<string[]>('GET', '/api/metrics/custom');
}