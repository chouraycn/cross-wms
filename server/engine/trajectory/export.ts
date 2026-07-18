/**
 * 通用导出
 *
 * 提供轨迹数据的通用导出功能，
 * 支持多种格式和选项。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import {
  TrajectoryEntry,
} from './types.js';
import type {
  TrajectoryEvent,
  TrajectoryBundleManifest,
  TrajectoryBundleWarning,
  TrajectoryExportOptions,
  TrajectoryExportResult,
} from './types.js';

export type TrajectoryExportFormat = 'jsonl' | 'json' | 'ndjson' | 'csv' | 'markdown' | 'html';

export { TrajectoryExportOptions, TrajectoryExportResult };

export class TrajectoryExporter {
  private readonly inputPath: string;

  constructor(inputPath: string) {
    this.inputPath = inputPath;
  }

  async readEvents(): Promise<TrajectoryEvent[]> {
    const events: TrajectoryEvent[] = [];

    try {
      const content = await fs.readFile(this.inputPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as TrajectoryEvent;
          if (event.traceSchema === 'cdf-know-trajectory' || event.traceSchema === 'openclaw-trajectory') {
            events.push(event);
          }
        } catch {
          // 跳过无效行
        }
      }
    } catch (err) {
      logger.error(`[Trajectory Export] Failed to read events: ${String(err)}`);
      throw err;
    }

    return events;
  }

  async readEntries(): Promise<TrajectoryEntry[]> {
    const entries: TrajectoryEntry[] = [];

    try {
      const content = await fs.readFile(this.inputPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        const entry = TrajectoryEntry.fromJSON(line);
        if (entry) {
          entries.push(entry);
        }
      }
    } catch (err) {
      logger.error(`[Trajectory Export] Failed to read entries: ${String(err)}`);
      throw err;
    }

    return entries;
  }

  private filterEvents(events: TrajectoryEvent[], options: TrajectoryExportOptions): TrajectoryEvent[] {
    let filtered = events.filter((event) => {
      if (options.filterByType && options.filterByType.length > 0) {
        if (!options.filterByType.includes(event.type)) {
          return false;
        }
      }

      if (options.excludeTypes && options.excludeTypes.length > 0) {
        if (options.excludeTypes.includes(event.type)) {
          return false;
        }
      }

      if (options.startTime) {
        const eventTime = new Date(event.ts);
        if (eventTime < options.startTime) {
          return false;
        }
      }

      if (options.endTime) {
        const eventTime = new Date(event.ts);
        if (eventTime > options.endTime) {
          return false;
        }
      }

      return true;
    });

    if (options.maxEvents && filtered.length > options.maxEvents) {
      filtered = filtered.slice(0, options.maxEvents);
    }

    return filtered;
  }

  private redactSensitiveData(events: TrajectoryEvent[]): TrajectoryEvent[] {
    const sensitivePatterns = [
      /sk-[A-Za-z0-9_-]{20,}/g,
      /api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+["']?/gi,
      /password["']?\s*[:=]\s*["']?[^"'\s]+["']?/gi,
      /token["']?\s*[:=]\s*["']?[^"'\s]+["']?/gi,
      /secret["']?\s*[:=]\s*["']?[^"'\s]+["']?/gi,
    ];

    return events.map((event) => {
      if (!event.data) return event;
      const dataStr = JSON.stringify(event.data);
      let redacted = dataStr;
      for (const pattern of sensitivePatterns) {
        redacted = redacted.replace(pattern, '[REDACTED]');
      }
      try {
        return { ...event, data: JSON.parse(redacted) };
      } catch {
        return event;
      }
    });
  }

  async exportToJsonl(outputPath: string, options: TrajectoryExportOptions = {}): Promise<TrajectoryExportResult> {
    const startTime = Date.now();
    let events = await this.readEvents();
    let filtered = this.filterEvents(events, options);

    if (options.redactSensitive) {
      filtered = this.redactSensitiveData(filtered);
    }

    const lines = filtered.map((event) => JSON.stringify(event));
    const content = lines.join('\n') + '\n';

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');

    const stats = await fs.stat(outputPath);

    return {
      outputPath,
      eventCount: filtered.length,
      format: 'jsonl',
      sizeBytes: stats.size,
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }

  async exportToJson(outputPath: string, options: TrajectoryExportOptions = {}): Promise<TrajectoryExportResult> {
    const startTime = Date.now();
    let events = await this.readEvents();
    let filtered = this.filterEvents(events, options);

    if (options.redactSensitive) {
      filtered = this.redactSensitiveData(filtered);
    }

    const data: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      sourcePath: this.inputPath,
      eventCount: filtered.length,
      events: filtered,
    };

    if (options.includeMetadata) {
      const typeCounts: Record<string, number> = {};
      for (const event of filtered) {
        typeCounts[event.type] = (typeCounts[event.type] ?? 0) + 1;
      }
      data.metadata = {
        typeCounts,
        timeRange: filtered.length > 0 ? {
          start: filtered[0]?.ts,
          end: filtered[filtered.length - 1]?.ts,
        } : null,
        sessionId: filtered[0]?.sessionId,
      };
    }

    const content = options.prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');

    const stats = await fs.stat(outputPath);

    return {
      outputPath,
      eventCount: filtered.length,
      format: 'json',
      sizeBytes: stats.size,
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }

  async exportToCsv(outputPath: string, options: TrajectoryExportOptions = {}): Promise<TrajectoryExportResult> {
    const startTime = Date.now();
    let events = await this.readEvents();
    let filtered = this.filterEvents(events, options);

    if (options.redactSensitive) {
      filtered = this.redactSensitiveData(filtered);
    }

    const headers = ['traceId', 'seq', 'type', 'ts', 'source', 'sessionId', 'runId', 'provider', 'modelId'];
    if (options.includeData) {
      headers.push('data');
    }
    const csvLines = [headers.join(',')];

    const escapeCsv = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    for (const event of filtered) {
      const row = [
        event.traceId,
        String(event.seq),
        event.type,
        event.ts,
        event.source,
        event.sessionId,
        event.runId ?? '',
        event.provider ?? '',
        event.modelId ?? '',
      ].map(escapeCsv);

      if (options.includeData) {
        row.push(escapeCsv(JSON.stringify(event.data ?? {})));
      }

      csvLines.push(row.join(','));
    }

    const content = csvLines.join('\n') + '\n';

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');

    const stats = await fs.stat(outputPath);

    return {
      outputPath,
      eventCount: filtered.length,
      format: 'csv',
      sizeBytes: stats.size,
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }

  async exportToMarkdown(outputPath: string, options: TrajectoryExportOptions = {}): Promise<TrajectoryExportResult> {
    const startTime = Date.now();
    let events = await this.readEvents();
    let filtered = this.filterEvents(events, options);

    if (options.redactSensitive) {
      filtered = this.redactSensitiveData(filtered);
    }

    const lines: string[] = [];

    lines.push('# Trajectory Export');
    lines.push('');
    lines.push(`- **Exported At**: ${new Date().toISOString()}`);
    lines.push(`- **Source**: ${this.inputPath}`);
    lines.push(`- **Event Count**: ${filtered.length}`);
    lines.push(`- **Session ID**: ${filtered[0]?.sessionId ?? 'N/A'}`);
    if (filtered.length > 0) {
      lines.push(`- **Time Range**: ${filtered[0]?.ts} → ${filtered[filtered.length - 1]?.ts}`);
    }
    lines.push('');

    const typeCounts: Record<string, number> = {};
    for (const event of filtered) {
      typeCounts[event.type] = (typeCounts[event.type] ?? 0) + 1;
    }

    lines.push('## Event Type Summary');
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    for (const [type, count] of Object.entries(typeCounts).sort()) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');

    lines.push('## Events');
    lines.push('');

    for (const event of filtered) {
      lines.push(`### [${event.seq}] ${event.type}`);
      lines.push('');
      lines.push(`- **Timestamp**: ${event.ts}`);
      lines.push(`- **Source**: ${event.source}`);
      if (event.provider) lines.push(`- **Provider**: ${event.provider}`);
      if (event.modelId) lines.push(`- **Model**: ${event.modelId}`);
      if (event.runId) lines.push(`- **Run ID**: ${event.runId}`);
      lines.push('');
      if (event.data && Object.keys(event.data).length > 0) {
        lines.push('```json');
        lines.push(JSON.stringify(event.data, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    const content = lines.join('\n') + '\n';

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');

    const stats = await fs.stat(outputPath);

    return {
      outputPath,
      eventCount: filtered.length,
      format: 'markdown',
      sizeBytes: stats.size,
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }

  async exportToHtml(outputPath: string, options: TrajectoryExportOptions = {}): Promise<TrajectoryExportResult> {
    const startTime = Date.now();
    let events = await this.readEvents();
    let filtered = this.filterEvents(events, options);

    if (options.redactSensitive) {
      filtered = this.redactSensitiveData(filtered);
    }

    const typeCounts: Record<string, number> = {};
    for (const event of filtered) {
      typeCounts[event.type] = (typeCounts[event.type] ?? 0) + 1;
    }

    const typeSummaryRows = Object.entries(typeCounts)
      .sort()
      .map(([type, count]) => `<tr><td>${this.escapeHtml(type)}</td><td>${count}</td></tr>`)
      .join('');

    const eventHtml = filtered.map((event) => {
      const dataJson = event.data ? JSON.stringify(event.data, null, 2) : '{}';
      return `
        <div class="event">
          <h3><span class="seq">#${event.seq}</span> <span class="type">${this.escapeHtml(event.type)}</span></h3>
          <div class="meta">
            <span class="timestamp">${this.escapeHtml(event.ts)}</span>
            <span class="source">${this.escapeHtml(event.source)}</span>
            ${event.provider ? `<span class="provider">${this.escapeHtml(event.provider)}</span>` : ''}
            ${event.modelId ? `<span class="model">${this.escapeHtml(event.modelId)}</span>` : ''}
          </div>
          <pre class="data">${this.escapeHtml(dataJson)}</pre>
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trajectory Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 8px; }
    h2 { color: #444; margin-top: 24px; }
    h3 { color: #555; margin-bottom: 4px; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 8px; }
    .meta span { margin-right: 12px; }
    .event { border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
    .event .seq { color: #007bff; font-weight: bold; }
    .event .type { color: #28a745; }
    pre.data { background: #f8f9fa; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f8f9fa; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .info-item { background: #f8f9fa; padding: 12px; border-radius: 4px; }
    .info-item .label { font-size: 0.85em; color: #666; margin-bottom: 4px; }
    .info-item .value { font-weight: 600; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Trajectory Export</h1>
    
    <div class="info-grid">
      <div class="info-item">
        <div class="label">Exported At</div>
        <div class="value">${new Date().toISOString()}</div>
      </div>
      <div class="info-item">
        <div class="label">Event Count</div>
        <div class="value">${filtered.length}</div>
      </div>
      <div class="info-item">
        <div class="label">Session ID</div>
        <div class="value">${this.escapeHtml(filtered[0]?.sessionId ?? 'N/A')}</div>
      </div>
      ${filtered.length > 0 ? `
      <div class="info-item">
        <div class="label">Time Range</div>
        <div class="value">${this.escapeHtml(filtered[0]?.ts ?? '')}</div>
      </div>
      ` : ''}
    </div>

    <h2>Event Type Summary</h2>
    <table>
      <thead>
        <tr><th>Type</th><th>Count</th></tr>
      </thead>
      <tbody>
        ${typeSummaryRows}
      </tbody>
    </table>

    <h2>Events</h2>
    ${eventHtml}
  </div>
</body>
</html>`;

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, 'utf-8');

    const stats = await fs.stat(outputPath);

    return {
      outputPath,
      eventCount: filtered.length,
      format: 'html',
      sizeBytes: stats.size,
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async export(outputPath: string, options: TrajectoryExportOptions = {}): Promise<TrajectoryExportResult> {
    const format = options.format ?? 'jsonl';

    logger.info(`[Trajectory Export] Exporting trajectory to ${format}: ${outputPath}`);

    switch (format) {
      case 'jsonl':
      case 'ndjson':
        return this.exportToJsonl(outputPath, options);
      case 'json':
        return this.exportToJson(outputPath, options);
      case 'csv':
        return this.exportToCsv(outputPath, options);
      case 'markdown':
        return this.exportToMarkdown(outputPath, options);
      case 'html':
        return this.exportToHtml(outputPath, options);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async createBundle(outputDir: string, params: {
    sessionFile?: string;
    sessionId: string;
    sessionKey?: string;
    workspaceDir?: string;
  }): Promise<{ manifestPath: string; manifest: TrajectoryBundleManifest }> {
    const events = await this.readEvents();

    const manifest: TrajectoryBundleManifest = {
      traceSchema: 'cdf-know-trajectory',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      traceId: params.sessionId,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      workspaceDir: params.workspaceDir ?? process.cwd(),
      leafId: null,
      eventCount: events.length,
      runtimeEventCount: events.filter((e) => e.source === 'runtime').length,
      transcriptEventCount: events.filter((e) => e.source === 'transcript').length,
      sourceFiles: {
        session: params.sessionFile ?? this.inputPath,
        runtime: this.inputPath,
      },
      warnings: [],
    };

    await fs.mkdir(outputDir, { recursive: true });

    const manifestPath = path.join(outputDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const eventsPath = path.join(outputDir, 'events.jsonl');
    const eventsContent = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(eventsPath, eventsContent, 'utf-8');

    return { manifestPath, manifest };
  }
}

export function createTrajectoryExporter(inputPath: string): TrajectoryExporter {
  return new TrajectoryExporter(inputPath);
}
