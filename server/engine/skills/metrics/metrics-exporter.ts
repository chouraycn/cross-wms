import fs from 'node:fs';
import path from 'node:path';
import { getChildLogger } from "../../logging/logger.js";
import {
  getAllSkillStats,
  exportMetrics,
  type SkillPerformanceStats,
  type SkillMetric,
} from "./skill-metrics.js";

const logger = getChildLogger({ module: "skills-metrics-exporter" });

export type MetricsExporterOptions = {
  intervalMs?: number;
  output?: 'log' | 'file' | 'http';
  filePath?: string;
  httpPort?: number;
};

let exportInterval: ReturnType<typeof setInterval> | null = null;

export function startMetricsExporter(options?: MetricsExporterOptions): void {
  if (exportInterval) {
    logger.warn("metrics exporter already running");
    return;
  }

  const opts = {
    intervalMs: 60000,
    output: 'log' as const,
    ...options,
  };

  logger.info("starting metrics exporter", { ...opts });

  const exportAndLog = () => {
    try {
      const stats = getAllSkillStats();
      const metrics = exportMetrics();

      if (opts.output === 'log') {
        logger.info("skill performance metrics", { stats, metricsCount: metrics.length });
      }

      if (opts.output === 'file' && opts.filePath) {
        exportToFile(opts.filePath);
      }
    } catch (err) {
      logger.error("failed to export metrics", { error: err instanceof Error ? err.message : String(err) });
    }
  };

  exportAndLog();
  exportInterval = setInterval(exportAndLog, opts.intervalMs);

  logger.info("metrics exporter started successfully");
}

export function stopMetricsExporter(): void {
  if (exportInterval) {
    clearInterval(exportInterval);
    exportInterval = null;
    logger.info("metrics exporter stopped");
  }
}

export function exportToPrometheus(): string {
  const stats = getAllSkillStats();
  const metrics = exportMetrics();

  const lines: string[] = [];

  lines.push("# HELP cross_wms_skill_total_calls Total number of calls per skill");
  lines.push("# TYPE cross_wms_skill_total_calls counter");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_total_calls{skill="${stat.skillName}"} ${stat.totalCalls}`);
  }

  lines.push("# HELP cross_wms_skill_total_errors Total number of errors per skill");
  lines.push("# TYPE cross_wms_skill_total_errors counter");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_total_errors{skill="${stat.skillName}"} ${stat.totalErrors}`);
  }

  lines.push("# HELP cross_wms_skill_avg_duration_ms Average duration per skill (ms)");
  lines.push("# TYPE cross_wms_skill_avg_duration_ms gauge");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_avg_duration_ms{skill="${stat.skillName}"} ${stat.avgDurationMs.toFixed(2)}`);
  }

  lines.push("# HELP cross_wms_skill_p50_duration_ms P50 duration per skill (ms)");
  lines.push("# TYPE cross_wms_skill_p50_duration_ms gauge");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_p50_duration_ms{skill="${stat.skillName}"} ${stat.p50DurationMs}`);
  }

  lines.push("# HELP cross_wms_skill_p90_duration_ms P90 duration per skill (ms)");
  lines.push("# TYPE cross_wms_skill_p90_duration_ms gauge");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_p90_duration_ms{skill="${stat.skillName}"} ${stat.p90DurationMs}`);
  }

  lines.push("# HELP cross_wms_skill_p99_duration_ms P99 duration per skill (ms)");
  lines.push("# TYPE cross_wms_skill_p99_duration_ms gauge");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_p99_duration_ms{skill="${stat.skillName}"} ${stat.p99DurationMs}`);
  }

  lines.push("# HELP cross_wms_skill_max_duration_ms Max duration per skill (ms)");
  lines.push("# TYPE cross_wms_skill_max_duration_ms gauge");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_max_duration_ms{skill="${stat.skillName}"} ${stat.maxDurationMs}`);
  }

  lines.push("# HELP cross_wms_skill_min_duration_ms Min duration per skill (ms)");
  lines.push("# TYPE cross_wms_skill_min_duration_ms gauge");
  for (const stat of stats) {
    lines.push(`cross_wms_skill_min_duration_ms{skill="${stat.skillName}"} ${stat.minDurationMs}`);
  }

  lines.push("# HELP cross_wms_metrics_total Total number of metrics recorded");
  lines.push("# TYPE cross_wms_metrics_total gauge");
  lines.push(`cross_wms_metrics_total ${metrics.length}`);

  return lines.join('\n');
}

export function exportToJSON(): {
  stats: SkillPerformanceStats[];
  metrics: SkillMetric[];
  exportedAt: number;
} {
  return {
    stats: getAllSkillStats(),
    metrics: exportMetrics(),
    exportedAt: Date.now(),
  };
}

export function exportToFile(filePath: string): void {
  const data = exportToJSON();

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    logger.debug("metrics exported to file", { filePath, count: data.metrics.length });
  } catch (err) {
    logger.error("failed to export metrics to file", { filePath, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}