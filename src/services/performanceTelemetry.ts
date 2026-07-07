/**
 * End-to-end performance telemetry — 端到端性能采集
 *
 * 采集维度：
 * - 启动阶段（navigation、DOM、首屏、React hydrate）
 * - Web Vitals（FCP、LCP、CLS、INP、TTFB）
 * - API 请求耗时
 * - React render 耗时
 *
 * 参照 OpenClaw diagnostic-events.ts 的 seq/ts 设计，轻量无依赖。
 */

import { API_BASE_URL } from '../constants/api';

const REPORT_INTERVAL_MS = 15_000;
const MAX_REQUEST_SAMPLES = 200;
const MAX_RENDER_SAMPLES = 200;
const MAX_PHASE_SAMPLES = 100;

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

let seq = 0;
const phases: TimingPhase[] = [];
const webVitals: WebVitalMetric[] = [];
const requests: RequestSample[] = [];
const renders: RenderSample[] = [];
let reportTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotReported = false;

function generateSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const sessionId = generateSessionId();

function getMemoryInfo(): PerformanceSnapshot['memory'] {
  try {
    const mem = (performance as any).memory;
    if (!mem) return undefined;
    return {
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
    };
  } catch {
    return undefined;
  }
}

export function markPhase(name: string, details?: Record<string, unknown>): TimingPhase {
  const phase: TimingPhase = {
    name,
    startTime: performance.now(),
    details,
  };
  phases.push(phase);
  if (phases.length > MAX_PHASE_SAMPLES) phases.shift();
  return phase;
}

export function endPhase(phaseOrName: TimingPhase | string, details?: Record<string, unknown>): TimingPhase | undefined {
  const now = performance.now();
  const phase = typeof phaseOrName === 'string'
    ? [...phases].reverse().find((p) => p.name === phaseOrName && p.endTime === undefined)
    : phaseOrName;
  if (!phase || phase.endTime !== undefined) return undefined;

  phase.endTime = now;
  phase.durationMs = now - phase.startTime;
  if (details) {
    phase.details = { ...phase.details, ...details };
  }
  return phase;
}

function ratingForVital(name: string, value: number): WebVitalMetric['rating'] {
  switch (name) {
    case 'LCP':
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
    case 'FCP':
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    case 'INP':
      return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
    case 'TTFB':
      return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
    case 'FID':
      return value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';
    default:
      return 'poor';
  }
}

function observeWebVital(entryType: string, name: WebVitalMetric['name'], extractValue?: (entry: PerformanceEntry) => number) {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = extractValue ? extractValue(entry) : (entry as any).startTime ?? entry.duration;
        webVitals.push({
          name,
          value,
          rating: ratingForVital(name, value),
          entryType,
        });
        if (webVitals.length > 50) webVitals.shift();
      }
    });
    observer.observe({ type: entryType as any, buffered: true });
  } catch {
    // Ignore unsupported entry types
  }
}

function observeLayoutShift() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    let clsValue = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      webVitals.push({
        name: 'CLS',
        value: clsValue,
        rating: ratingForVital('CLS', clsValue),
        entryType: 'layout-shift',
      });
      if (webVitals.length > 50) webVitals.shift();
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Ignore unsupported
  }
}

function observeEventTiming() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    let inpValue = 0;
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        const duration = (entry as any).duration ?? 0;
        if (duration > inpValue) inpValue = duration;
      }
      webVitals.push({
        name: 'INP',
        value: inpValue,
        rating: ratingForVital('INP', inpValue),
        entryType: 'event',
      });
      if (webVitals.length > 50) webVitals.shift();
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 0 } as any);
  } catch {
    // Ignore unsupported
  }
}

export function initWebVitals() {
  observeWebVital('paint', 'FCP', (entry) => (entry as PerformancePaintTiming).startTime);
  observeWebVital('paint', 'LCP', (entry) => (entry as PerformancePaintTiming).startTime);
  observeWebVital('navigation', 'TTFB', (entry) => (entry as PerformanceNavigationTiming).responseStart);
  observeLayoutShift();
  observeEventTiming();
}

function getNavigationSummary(): NavigationTimingSummary {
  if (typeof window === 'undefined') return {};
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return {};
  return {
    dnsMs: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
    tcpMs: Math.round(nav.connectEnd - nav.connectStart),
    tlsMs: nav.secureConnectionStart > 0 ? Math.round(nav.connectEnd - nav.secureConnectionStart) : undefined,
    ttfbMs: Math.round(nav.responseStart - nav.requestStart),
    downloadMs: Math.round(nav.responseEnd - nav.responseStart),
    domParseMs: Math.round(nav.domInteractive - nav.responseEnd),
    domReadyMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
    loadCompleteMs: Math.round(nav.loadEventEnd - nav.startTime),
  };
}

export function buildSnapshot(): PerformanceSnapshot {
  seq += 1;
  return {
    ts: Date.now(),
    sessionId,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    navigation: getNavigationSummary(),
    webVitals: [...webVitals],
    phases: [...phases],
    requests: [...requests],
    renders: [...renders],
    memory: getMemoryInfo(),
  };
}

export async function reportSnapshot(immediate = false): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const snapshot = buildSnapshot();
    const body = JSON.stringify({ data: snapshot, seq });
    // sendBeacon 默认使用 text/plain Content-Type，后端 express.json 无法解析，
    // 因此统一使用 fetch + keepalive，确保上报携带正确的 application/json。
    await fetch(`${API_BASE_URL}/api/performance/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    snapshotReported = true;
  } catch {
    // Non-critical telemetry; ignore failures
  }
}

function scheduleReport() {
  if (reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    reportSnapshot();
  }, REPORT_INTERVAL_MS);
}

export function recordRequest(sample: RequestSample): void {
  requests.push(sample);
  if (requests.length > MAX_REQUEST_SAMPLES) requests.shift();
  scheduleReport();
}

export function recordRender(sample: RenderSample): void {
  renders.push(sample);
  if (renders.length > MAX_RENDER_SAMPLES) renders.shift();
  scheduleReport();
}

export function wrapFetchTiming(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const start = performance.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    try {
      const res = await originalFetch(input, init);
      const end = performance.now();
      recordRequest({
        url,
        method,
        status: res.status,
        durationMs: Math.round(end - start),
        timestamp: Date.now(),
      });
      return res;
    } catch (err) {
      const end = performance.now();
      recordRequest({
        url,
        method,
        status: 0,
        durationMs: Math.round(end - start),
        timestamp: Date.now(),
      });
      throw err;
    }
  };
}

export function initPerformanceTelemetry() {
  if (typeof window === 'undefined') return;

  markPhase('telemetry:init');
  initWebVitals();

  // 包装全局 fetch，记录 API 耗时
  const originalFetch = window.fetch;
  window.fetch = wrapFetchTiming(originalFetch);

  // 页面卸载时立即上报
  window.addEventListener('pagehide', () => reportSnapshot(true));
  window.addEventListener('beforeunload', () => reportSnapshot(true));

  // 启动后首次上报
  setTimeout(() => {
    endPhase('telemetry:init');
    reportSnapshot();
  }, 0);

  // 定期上报
  setInterval(() => reportSnapshot(), REPORT_INTERVAL_MS);
}

export function hasReportedSnapshot(): boolean {
  return snapshotReported;
}
