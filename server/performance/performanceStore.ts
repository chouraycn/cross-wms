/**
 * End-to-end performance store — 端到端性能数据存储与聚合
 *
 * 接收前端 telemetry 快照，聚合启动阶段、Web Vitals、API 请求、Render 耗时。
 * 参照 OpenClaw diagnostic-events.ts 的 seq/ts 设计，轻量无 DB 依赖。
 */

import { metricsCollector } from '../metrics/collector.js';

export interface TimingPhase {
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface WebVitalMetric {
  name: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB' | 'FID';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  entryType: string;
}

export interface RequestSample {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  ttfbMs?: number;
  transferSize?: number;
  timestamp: number;
}

export interface RenderSample {
  component: string;
  phase: 'mount' | 'update';
  actualDurationMs: number;
  baseDurationMs: number;
  startTime: number;
  commitTime: number;
}

export interface NavigationTimingSummary {
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
  domParseMs?: number;
  domReadyMs?: number;
  loadCompleteMs?: number;
}

export interface PerformanceSnapshot {
  ts: number;
  seq?: number;
  sessionId: string;
  url: string;
  userAgent: string;
  navigation: NavigationTimingSummary;
  webVitals: WebVitalMetric[];
  phases: TimingPhase[];
  requests: RequestSample[];
  renders: RenderSample[];
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

export interface PhaseSummary {
  name: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  minMs: number;
}

export interface VitalSummary {
  name: string;
  count: number;
  avgMs: number;
  p75Ms: number;
  p95Ms: number;
  maxMs: number;
  goodCount: number;
  poorCount: number;
}

export interface RequestSummary {
  count: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  errorCount: number;
  byEndpoint: Record<string, { count: number; avgMs: number; errorCount: number }>;
}

export interface PerformanceSummary {
  generatedAt: number;
  sessionCount: number;
  snapshotCount: number;
  navigation: {
    avgDomReadyMs?: number;
    avgLoadCompleteMs?: number;
    avgTtfbMs?: number;
  };
  phases: PhaseSummary[];
  vitals: VitalSummary[];
  requests: RequestSummary;
  topSlowRequests: RequestSample[];
  topSlowRenders: RenderSample[];
  latestMemory?: {
    usedJSHeapSizeMB: number;
    totalJSHeapSizeMB: number;
  };
}

const MAX_SNAPSHOTS = 200;
const snapshots: PerformanceSnapshot[] = [];
const backendPhases: TimingPhase[] = [];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarizeByName<T extends { name: string; durationMs?: number }>(
  items: T[],
  extractDuration: (item: T) => number | undefined = (item) => item.durationMs,
): PhaseSummary[] {
  const byName = new Map<string, number[]>();
  for (const item of items) {
    const d = extractDuration(item);
    if (d === undefined || !Number.isFinite(d)) continue;
    const arr = byName.get(item.name) || [];
    arr.push(d);
    byName.set(item.name, arr);
  }

  const result: PhaseSummary[] = [];
  for (const [name, values] of byName) {
    const sorted = [...values].sort((a, b) => a - b);
    result.push({
      name,
      count: sorted.length,
      avgMs: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p50Ms: Math.round(percentile(sorted, 50)),
      p95Ms: Math.round(percentile(sorted, 95)),
      maxMs: Math.round(sorted[sorted.length - 1]),
      minMs: Math.round(sorted[0]),
    });
  }
  return result.sort((a, b) => b.avgMs - a.avgMs);
}

function summarizeVitals(vitals: WebVitalMetric[]): VitalSummary[] {
  const byName = new Map<string, WebVitalMetric[]>();
  for (const v of vitals) {
    const arr = byName.get(v.name) || [];
    arr.push(v);
    byName.set(v.name, arr);
  }

  const result: VitalSummary[] = [];
  for (const [name, values] of byName) {
    const sorted = [...values].map((v) => v.value).sort((a, b) => a - b);
    result.push({
      name,
      count: sorted.length,
      avgMs: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p75Ms: Math.round(percentile(sorted, 75)),
      p95Ms: Math.round(percentile(sorted, 95)),
      maxMs: Math.round(sorted[sorted.length - 1]),
      goodCount: values.filter((v) => v.rating === 'good').length,
      poorCount: values.filter((v) => v.rating === 'poor').length,
    });
  }
  return result;
}

function summarizeRequests(requests: RequestSample[]): RequestSummary {
  const durations = requests.map((r) => r.durationMs);
  const sorted = [...durations].sort((a, b) => a - b);
  const byEndpoint: RequestSummary['byEndpoint'] = {};
  for (const r of requests) {
    try {
      const url = new URL(r.url, 'http://localhost');
      const endpoint = url.pathname;
      const entry = byEndpoint[endpoint] || { count: 0, avgMs: 0, errorCount: 0 };
      entry.count += 1;
      entry.avgMs += r.durationMs;
      if (r.status >= 400 || r.status === 0) entry.errorCount += 1;
      byEndpoint[endpoint] = entry;
    } catch {
      // ignore invalid URLs
    }
  }
  for (const key of Object.keys(byEndpoint)) {
    const entry = byEndpoint[key];
    entry.avgMs = Math.round(entry.avgMs / entry.count);
  }

  return {
    count: requests.length,
    avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    p95DurationMs: Math.round(percentile(sorted, 95)),
    maxDurationMs: sorted.length ? sorted[sorted.length - 1] : 0,
    errorCount: requests.filter((r) => r.status >= 400 || r.status === 0).length,
    byEndpoint,
  };
}

export function recordSnapshot(snapshot: PerformanceSnapshot): void {
  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();

  // 同步到 metricsCollector 自定义指标，便于统一监控
  metricsCollector.recordCustomMetric('frontend_snapshot_count', snapshots.length, { sessionId: snapshot.sessionId });
  if (snapshot.memory?.usedJSHeapSize) {
    metricsCollector.recordCustomMetric('frontend_heap_used_mb', Math.round(snapshot.memory.usedJSHeapSize / 1024 / 1024));
  }
  for (const vital of snapshot.webVitals) {
    metricsCollector.recordCustomMetric(`frontend_vital_${vital.name.toLowerCase()}`, Math.round(vital.value), {
      rating: vital.rating,
    });
  }
  for (const req of snapshot.requests) {
    metricsCollector.recordCustomMetric('frontend_request_duration_ms', Math.round(req.durationMs), {
      status: String(req.status),
      endpoint: new URL(req.url, 'http://localhost').pathname,
    });
  }
}

export function recordBackendPhase(name: string, durationMs: number, details?: Record<string, unknown>): void {
  backendPhases.push({
    name,
    startTime: Date.now() - durationMs,
    endTime: Date.now(),
    durationMs,
    details,
  });
  if (backendPhases.length > MAX_SNAPSHOTS) backendPhases.shift();
  metricsCollector.recordCustomMetric('backend_phase_duration_ms', Math.round(durationMs), { phase: name });
}

export function getLatestSnapshot(): PerformanceSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

export function getSnapshots(durationMs?: number): PerformanceSnapshot[] {
  if (!durationMs) return [...snapshots];
  const cutoff = Date.now() - durationMs;
  return snapshots.filter((s) => s.ts >= cutoff);
}

export function getSummary(durationMs?: number): PerformanceSummary {
  const recent = getSnapshots(durationMs);
  const allPhases: TimingPhase[] = [];
  const allVitals: WebVitalMetric[] = [];
  const allRequests: RequestSample[] = [];
  const allRenders: RenderSample[] = [];
  for (const s of recent) {
    allPhases.push(...s.phases);
    allVitals.push(...s.webVitals);
    allRequests.push(...s.requests);
    allRenders.push(...s.renders);
  }

  const navs = recent.map((s) => s.navigation).filter((n) => n.domReadyMs !== undefined);
  const latest = getLatestSnapshot();

  return {
    generatedAt: Date.now(),
    sessionCount: new Set(recent.map((s) => s.sessionId)).size,
    snapshotCount: recent.length,
    navigation: {
      avgDomReadyMs: navs.length
        ? Math.round(navs.reduce((sum, n) => sum + (n.domReadyMs ?? 0), 0) / navs.length)
        : undefined,
      avgLoadCompleteMs: navs.length
        ? Math.round(navs.reduce((sum, n) => sum + (n.loadCompleteMs ?? 0), 0) / navs.length)
        : undefined,
      avgTtfbMs: navs.length
        ? Math.round(navs.reduce((sum, n) => sum + (n.ttfbMs ?? 0), 0) / navs.length)
        : undefined,
    },
    phases: summarizeByName([...allPhases, ...backendPhases]),
    vitals: summarizeVitals(allVitals),
    requests: summarizeRequests(allRequests),
    topSlowRequests: [...allRequests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20),
    topSlowRenders: [...allRenders].sort((a, b) => b.actualDurationMs - a.actualDurationMs).slice(0, 20),
    latestMemory: latest?.memory
      ? {
          usedJSHeapSizeMB: Math.round((latest.memory.usedJSHeapSize ?? 0) / 1024 / 1024),
          totalJSHeapSizeMB: Math.round((latest.memory.totalJSHeapSize ?? 0) / 1024 / 1024),
        }
      : undefined,
  };
}

export function getBackendPhases(): TimingPhase[] {
  return [...backendPhases];
}

/** 生成可读的端到端性能摘要日志 */
export function formatPerformanceSummaryForLog(): string {
  const summary = getSummary(5 * 60 * 1000);
  const lines = [
    '[PerfSummary] 端到端性能摘要（最近5分钟）',
    `- 会话数: ${summary.sessionCount}, 快照数: ${summary.snapshotCount}`,
    `- 导航: DOM Ready ${summary.navigation.avgDomReadyMs ?? '-'}ms, Load Complete ${summary.navigation.avgLoadCompleteMs ?? '-'}ms, TTFB ${summary.navigation.avgTtfbMs ?? '-'}ms`,
    `- 前端内存: 已用 ${summary.latestMemory?.usedJSHeapSizeMB ?? '-'}MB / 总计 ${summary.latestMemory?.totalJSHeapSizeMB ?? '-'}MB`,
    `- 请求: ${summary.requests.count} 次, 平均 ${summary.requests.avgDurationMs}ms, P95 ${summary.requests.p95DurationMs}ms, 错误 ${summary.requests.errorCount}`,
  ];
  if (summary.vitals.length > 0) {
    lines.push(`- Web Vitals: ${summary.vitals.map((v) => `${v.name}=${v.avgMs}ms(${v.goodCount}/${v.poorCount})`).join(', ')}`);
  }
  if (summary.phases.length > 0) {
    lines.push(`- Top Phases: ${summary.phases.slice(0, 5).map((p) => `${p.name}=${p.avgMs}ms`).join(', ')}`);
  }
  if (summary.topSlowRequests.length > 0) {
    lines.push(`- 最慢请求: ${summary.topSlowRequests[0].url} ${summary.topSlowRequests[0].durationMs}ms`);
  }
  if (summary.topSlowRenders.length > 0) {
    lines.push(`- 最慢渲染: ${summary.topSlowRenders[0].component} ${summary.topSlowRenders[0].actualDurationMs}ms`);
  }
  return lines.join('\n');
}

export function startPerformanceSummaryLogger(intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (snapshots.length === 0) return;
    // eslint-disable-next-line no-console
    console.log(formatPerformanceSummaryForLog());
  }, intervalMs);
  timer.unref();
  return timer;
}
