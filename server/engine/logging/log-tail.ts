import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export class LogTail {
  private readonly filePath: string;
  private lines: string[] = [];
  private readonly maxLines: number;

  constructor(filePath: string, maxLines = 100) {
    this.filePath = filePath;
    this.maxLines = maxLines;
  }

  async read(): Promise<string[]> {
    try {
      const stats = await stat(this.filePath);
      if (!stats.isFile()) return [];

      const rl = createInterface({
        input: createReadStream(this.filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      });

      const allLines: string[] = [];
      for await (const line of rl) {
        allLines.push(line);
      }

      this.lines = allLines.slice(-this.maxLines);
      return this.lines;
    } catch {
      return [];
    }
  }

  async filter(pattern: RegExp): Promise<string[]> {
    const lines = await this.read();
    return lines.filter(line => pattern.test(line));
  }

  getLines(): string[] {
    return this.lines;
  }

  toJSON(): string {
    return JSON.stringify(this.lines);
  }
}

export function createLogTail(filePath: string, maxLines?: number): LogTail {
  return new LogTail(filePath, maxLines);
}
