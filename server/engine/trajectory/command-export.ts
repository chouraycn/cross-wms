/**
 * 命令导出
 *
 * 提供命令行友好的轨迹导出功能，
 * 支持从命令行参数解析导出选项，
 * 以及 Shell 脚本重放功能。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { TrajectoryExporter } from './export.js';
import type { TrajectoryExportOptions, TrajectoryExportResult, TrajectoryExportFormat } from './export.js';
import { TrajectoryCleanupManager } from './cleanup.js';
import type { TrajectoryCleanupOptions, TrajectoryCleanupResult } from './cleanup.js';
import { replayTrajectory } from './replay.js';
import type { TrajectoryEvent } from './types.js';

export type CommandExportOptions = {
  input: string;
  output?: string;
  format?: TrajectoryExportFormat;
  filterType?: string[];
  startTime?: string;
  endTime?: string;
  pretty?: boolean;
  list?: boolean;
  cleanup?: boolean;
  maxAgeDays?: number;
  maxSizeBytes?: number;
  dryRun?: boolean;
  trajectoryDir?: string;
  toShell?: boolean;
  shellType?: 'bash' | 'zsh' | 'sh';
};

export type CommandExportResult = {
  success: boolean;
  message: string;
  exportResult?: TrajectoryExportResult;
  cleanupResult?: TrajectoryCleanupResult;
  sessions?: Array<{ sessionId: string; modifiedAt: string; eventCount: number; sizeBytes: number }>;
};

export class TrajectoryCommandExporter {
  constructor() {}

  async execute(options: CommandExportOptions): Promise<CommandExportResult> {
    try {
      if (options.list && options.trajectoryDir) {
        return this.listSessions(options.trajectoryDir);
      }

      if (options.cleanup && options.trajectoryDir) {
        return this.cleanup(options.trajectoryDir, {
          maxAgeDays: options.maxAgeDays,
          maxTotalBytes: options.maxSizeBytes,
          dryRun: options.dryRun,
        });
      }

      if (options.toShell) {
        return this.exportToShellScript(options);
      }

      return this.exportTrajectory(options);
    } catch (err) {
      logger.error(`[Trajectory CommandExport] Command failed: ${String(err)}`);
      return {
        success: false,
        message: `Command failed: ${String(err)}`,
      };
    }
  }

  private async exportTrajectory(options: CommandExportOptions): Promise<CommandExportResult> {
    if (!options.input) {
      return {
        success: false,
        message: 'Input trajectory file path is required',
      };
    }

    const exporter = new TrajectoryExporter(options.input);

    const exportOptions: TrajectoryExportOptions = {
      format: options.format ?? 'jsonl',
      filterByType: options.filterType,
      prettyPrint: options.pretty,
    };

    if (options.startTime) {
      exportOptions.startTime = new Date(options.startTime);
    }

    if (options.endTime) {
      exportOptions.endTime = new Date(options.endTime);
    }

    const outputPath = options.output ?? this.generateOutputPath(options.input, options.format ?? 'jsonl');

    const result = await exporter.export(outputPath, exportOptions);

    return {
      success: true,
      message: `Exported ${result.eventCount} events to ${outputPath} (${formatBytes(result.sizeBytes)})`,
      exportResult: result,
    };
  }

  private generateOutputPath(inputPath: string, format: TrajectoryExportFormat): string {
    const ext = format === 'ndjson' ? 'ndjson' : format;
    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(dir, `${baseName}.exported.${timestamp}.${ext}`);
  }

  private async exportToShellScript(options: CommandExportOptions): Promise<CommandExportResult> {
    if (!options.input) {
      return {
        success: false,
        message: 'Input trajectory file path is required for shell export',
      };
    }

    const content = await fs.readFile(options.input, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const events: TrajectoryEvent[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.traceSchema === 'cdf-know-trajectory' || parsed.traceSchema === 'openclaw-trajectory') {
          events.push(parsed as TrajectoryEvent);
        }
      } catch {
        // skip invalid lines
      }
    }

    const shellScript = this.generateShellScript(events, options.shellType ?? 'bash');
    const outputPath = options.output ?? options.input.replace(/\.jsonl?$/, '.sh');
    await fs.writeFile(outputPath, shellScript, { mode: 0o755 });

    return {
      success: true,
      message: `Exported shell script to ${outputPath}`,
    };
  }

  private generateShellScript(events: TrajectoryEvent[], shellType: string): string {
    const header = this.generateScriptHeader(shellType);
    const commands: string[] = [];

    for (const event of events) {
      if (event.type === 'tool_call' || event.type === 'tool.call') {
        const toolName = event.data?.toolName ?? event.data?.name ?? 'unknown';
        const args = event.data?.arguments ?? event.data?.parameters ?? {};

        if (toolName === 'bash' || toolName === 'shell') {
          const cmd = typeof args === 'object' && args !== null && 'command' in args
            ? String(args.command)
            : '';
          if (cmd) {
            commands.push(`# Step ${event.seq}: ${toolName}`);
            commands.push(cmd);
            commands.push('');
          }
        } else {
          commands.push(`# Step ${event.seq}: tool ${toolName}`);
          commands.push(`# Arguments: ${JSON.stringify(args)}`);
          commands.push('');
        }
      }
    }

    return header + '\n' + commands.join('\n') + '\n';
  }

  private generateScriptHeader(shellType: string): string {
    const shebang = shellType === 'zsh' ? '#!/usr/bin/env zsh'
      : shellType === 'sh' ? '#!/bin/sh'
      : '#!/usr/bin/env bash';

    return `${shebang}
# Generated by Trajectory Exporter
# Shell script replay of tool commands
#
# Usage:
#   chmod +x script.sh
#   ./script.sh
#
set -euo pipefail

echo "Starting trajectory replay..."
echo "=============================="
echo ""
`;
  }

  private async listSessions(trajectoryDir: string): Promise<CommandExportResult> {
    const cleanupManager = new TrajectoryCleanupManager(trajectoryDir);
    const sessions = await cleanupManager.listSessions();

    const sessionInfo = sessions.map((s) => ({
      sessionId: s.sessionId,
      modifiedAt: s.modifiedAt.toISOString(),
      eventCount: 0,
      sizeBytes: s.sizeBytes,
    }));

    return {
      success: true,
      message: `Found ${sessions.length} sessions`,
      sessions: sessionInfo,
    };
  }

  private async cleanup(trajectoryDir: string, options: TrajectoryCleanupOptions): Promise<CommandExportResult> {
    const cleanupManager = new TrajectoryCleanupManager(trajectoryDir);
    const result = await cleanupManager.cleanup(options);

    const action = options.dryRun ? 'Would delete' : 'Deleted';
    return {
      success: true,
      message: `${action} ${result.deletedSessions.length} sessions, freed ${formatBytes(result.freedBytes)}`,
      cleanupResult: result,
    };
  }

  parseArgs(args: string[]): CommandExportOptions {
    const options: CommandExportOptions = {
      input: '',
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;

      switch (arg) {
        case '--input':
        case '-i':
          options.input = args[++i] ?? '';
          break;
        case '--output':
        case '-o':
          options.output = args[++i] ?? '';
          break;
        case '--format':
        case '-f':
          options.format = (args[++i] as TrajectoryExportFormat) ?? 'jsonl';
          break;
        case '--filter-type':
          options.filterType = (args[++i] ?? '').split(',').filter(Boolean);
          break;
        case '--start-time':
          options.startTime = args[++i];
          break;
        case '--end-time':
          options.endTime = args[++i];
          break;
        case '--pretty':
          options.pretty = true;
          break;
        case '--list':
        case '-l':
          options.list = true;
          break;
        case '--cleanup':
          options.cleanup = true;
          break;
        case '--max-age-days':
          options.maxAgeDays = parseInt(args[++i] ?? '0', 10);
          break;
        case '--max-size':
          options.maxSizeBytes = parseSizeToBytes(args[++i] ?? '');
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--dir':
        case '-d':
          options.trajectoryDir = args[++i];
          break;
        case '--to-shell':
          options.toShell = true;
          break;
        case '--shell-type':
          options.shellType = (args[++i] as 'bash' | 'zsh' | 'sh') ?? 'bash';
          break;
        default:
          if (!options.input && !arg.startsWith('-')) {
            options.input = arg;
          }
          break;
      }
    }

    return options;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0;

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)?$/i);
  if (!match) return parseInt(sizeStr, 10) || 0;

  const num = parseFloat(match[1]!);
  const unit = (match[2] ?? 'B').toUpperCase();

  switch (unit) {
    case 'KB':
      return Math.floor(num * 1024);
    case 'MB':
      return Math.floor(num * 1024 * 1024);
    case 'GB':
      return Math.floor(num * 1024 * 1024 * 1024);
    default:
      return Math.floor(num);
  }
}

export const trajectoryCommandExporter = new TrajectoryCommandExporter();

export async function runTrajectoryCommand(args: string[]): Promise<CommandExportResult> {
  const options = trajectoryCommandExporter.parseArgs(args);
  return trajectoryCommandExporter.execute(options);
}
