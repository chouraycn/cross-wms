import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skills-metrics" });

export type MetricType = 'execution_time' | 'call_count' | 'error_count' | 'memory_usage';

export type SkillMetric = {
  skillName: string;
  metricType: MetricType;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
};

export type SkillPerformanceStats = {
  skillName: string;
  totalCalls: number;
  totalErrors: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p90DurationMs: number;
  p99DurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  lastCallAt: number | null;
};

type SkillMetricData = {
  executionTimes: number[];
  callCount: number;
  errorCount: number;
  memoryUsages: number[];
  lastCallAt: number | null;
};

const skillMetrics = new Map<string, SkillMetricData>();
const allMetrics: SkillMetric[] = [];
const MAX_METRICS_HISTORY = 10000;

function getOrCreateSkillData(skillName: string): SkillMetricData {
  let data = skillMetrics.get(skillName);
  if (!data) {
    data = {
      executionTimes: [],
      callCount: 0,
      errorCount: 0,
      memoryUsages: [],
      lastCallAt: null,
    };
    skillMetrics.set(skillName, data);
  }
  return data;
}

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * (sorted.length - 1));
  return sorted[index] ?? 0;
}

export function recordMetric(metric: SkillMetric): void {
  if (!metric.skillName) {
    logger.warn("recordMetric: missing skillName");
    return;
  }

  const normalized: SkillMetric = {
    skillName: metric.skillName,
    metricType: metric.metricType,
    value: metric.value,
    timestamp: metric.timestamp ?? Date.now(),
    tags: metric.tags,
  };

  allMetrics.push(normalized);

  if (allMetrics.length > MAX_METRICS_HISTORY) {
    allMetrics.shift();
  }

  const data = getOrCreateSkillData(metric.skillName);

  switch (metric.metricType) {
    case 'execution_time':
      data.executionTimes.push(metric.value);
      data.lastCallAt = metric.timestamp;
      break;
    case 'call_count':
      data.callCount += metric.value;
      data.lastCallAt = metric.timestamp;
      break;
    case 'error_count':
      data.errorCount += metric.value;
      data.lastCallAt = metric.timestamp;
      break;
    case 'memory_usage':
      data.memoryUsages.push(metric.value);
      break;
  }

  logger.debug("recorded metric", { skill: metric.skillName, type: metric.metricType, value: metric.value });
}

export function recordExecution(skillName: string, durationMs: number, success: boolean): void {
  recordMetric({
    skillName,
    metricType: 'execution_time',
    value: durationMs,
    timestamp: Date.now(),
    tags: { success: String(success) },
  });

  recordMetric({
    skillName,
    metricType: 'call_count',
    value: 1,
    timestamp: Date.now(),
    tags: { success: String(success) },
  });

  if (!success) {
    recordMetric({
      skillName,
      metricType: 'error_count',
      value: 1,
      timestamp: Date.now(),
    });
  }

  logger.debug("recorded execution", { skill: skillName, durationMs, success });
}

export function getSkillStats(skillName: string): SkillPerformanceStats | null {
  const data = skillMetrics.get(skillName);
  if (!data) return null;

  const times = data.executionTimes;
  const totalCalls = data.callCount;

  return {
    skillName,
    totalCalls,
    totalErrors: data.errorCount,
    avgDurationMs: totalCalls > 0 ? times.reduce((sum, t) => sum + t, 0) / totalCalls : 0,
    p50DurationMs: computePercentile(times, 50),
    p90DurationMs: computePercentile(times, 90),
    p99DurationMs: computePercentile(times, 99),
    maxDurationMs: times.length > 0 ? Math.max(...times) : 0,
    minDurationMs: times.length > 0 ? Math.min(...times) : 0,
    lastCallAt: data.lastCallAt,
  };
}

export function getAllSkillStats(): SkillPerformanceStats[] {
  const stats: SkillPerformanceStats[] = [];
  for (const skillName of skillMetrics.keys()) {
    const stat = getSkillStats(skillName);
    if (stat) {
      stats.push(stat);
    }
  }
  return stats;
}

export function resetSkillStats(skillName?: string): void {
  if (skillName) {
    skillMetrics.delete(skillName);
    logger.debug("reset stats for skill", { skill: skillName });
  } else {
    skillMetrics.clear();
    logger.debug("reset all skill stats");
  }
}

export function getTopSkillsByMetric(metricType: MetricType, limit: number = 10): SkillPerformanceStats[] {
  const stats = getAllSkillStats();

  stats.sort((a, b) => {
    switch (metricType) {
      case 'execution_time':
        return b.avgDurationMs - a.avgDurationMs;
      case 'call_count':
        return b.totalCalls - a.totalCalls;
      case 'error_count':
        return b.totalErrors - a.totalErrors;
      case 'memory_usage':
        return b.maxDurationMs - a.maxDurationMs;
      default:
        return 0;
    }
  });

  return stats.slice(0, limit);
}

export function exportMetrics(): SkillMetric[] {
  return [...allMetrics];
}