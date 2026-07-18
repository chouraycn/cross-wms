import { z } from 'zod';
import { logger } from '../../logger.js';

export const CliOutputLineSchema = z.object({
  type: z.enum(['stdout', 'stderr', 'status', 'error']),
  content: z.string(),
  timestamp: z.number(),
});

export type CliOutputLine = z.infer<typeof CliOutputLineSchema>;

export interface CliOutputFormatterOptions {
  colorize?: boolean;
  timestamps?: boolean;
  maxLines?: number;
}

export class CliOutputFormatter {
  private options: Required<CliOutputFormatterOptions>;
  private buffer: CliOutputLine[] = [];

  constructor(options: CliOutputFormatterOptions = {}) {
    this.options = {
      colorize: options.colorize ?? false,
      timestamps: options.timestamps ?? false,
      maxLines: options.maxLines ?? 1000,
    };
  }

  addLine(type: CliOutputLine['type'], content: string): void {
    const line: CliOutputLine = {
      type,
      content,
      timestamp: Date.now(),
    };
    
    this.buffer.push(line);
    
    if (this.buffer.length > this.options.maxLines) {
      this.buffer = this.buffer.slice(-this.options.maxLines);
    }
  }

  addStdout(content: string): void {
    this.addLine('stdout', content);
  }

  addStderr(content: string): void {
    this.addLine('stderr', content);
  }

  addStatus(content: string): void {
    this.addLine('status', content);
  }

  addError(content: string): void {
    this.addLine('error', content);
  }

  getLines(): CliOutputLine[] {
    return [...this.buffer];
  }

  getText(): string {
    return this.buffer.map(line => this.formatLine(line)).join('\n');
  }

  private formatLine(line: CliOutputLine): string {
    let prefix = '';
    
    if (this.options.timestamps) {
      const time = new Date(line.timestamp).toISOString();
      prefix += `[${time}] `;
    }

    if (this.options.colorize) {
      switch (line.type) {
        case 'stdout':
          prefix += '\x1b[0m';
          break;
        case 'stderr':
          prefix += '\x1b[31m';
          break;
        case 'status':
          prefix += '\x1b[36m';
          break;
        case 'error':
          prefix += '\x1b[31m';
          break;
      }
    }

    const typePrefix = line.type === 'stderr' || line.type === 'error' ? '[ERR] ' : '';
    return `${prefix}${typePrefix}${line.content}`;
  }

  clear(): void {
    this.buffer = [];
  }

  getLastNLines(n: number): CliOutputLine[] {
    return this.buffer.slice(-n);
  }

  hasErrors(): boolean {
    return this.buffer.some(line => line.type === 'error');
  }

  getExitSummary(): { stdout: string; stderr: string; errors: string[] } {
    const stdout = this.buffer
      .filter(l => l.type === 'stdout')
      .map(l => l.content)
      .join('\n');
    
    const stderr = this.buffer
      .filter(l => l.type === 'stderr')
      .map(l => l.content)
      .join('\n');
    
    const errors = this.buffer
      .filter(l => l.type === 'error')
      .map(l => l.content);

    return { stdout, stderr, errors };
  }
}

export function createCliOutputFormatter(options?: CliOutputFormatterOptions): CliOutputFormatter {
  return new CliOutputFormatter(options);
}

export function formatCliOutput(lines: CliOutputLine[], options?: CliOutputFormatterOptions): string {
  const formatter = new CliOutputFormatter(options);
  for (const line of lines) {
    formatter.addLine(line.type, line.content);
  }
  return formatter.getText();
}

logger.debug('[Agents:CliOutput] Module loaded');
