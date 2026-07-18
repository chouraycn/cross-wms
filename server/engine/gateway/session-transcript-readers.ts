import fs from 'node:fs';
import { extractJsonStringFieldPrefix, extractJsonNumberFieldPrefix } from './session-transcript-json.js';

export type TranscriptLine = {
  role?: string;
  text?: string;
  ts?: number;
  type?: string;
};

export function readTranscriptLines(filePath: string, limit?: number): TranscriptLine[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const result: TranscriptLine[] = [];

    const linesToProcess = limit ? lines.slice(-limit) : lines;

    for (const line of linesToProcess) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        result.push({
          role: typeof parsed.role === 'string' ? parsed.role : undefined,
          text: typeof parsed.text === 'string' ? parsed.text : undefined,
          ts: typeof parsed.ts === 'number' ? parsed.ts : undefined,
          type: typeof parsed.type === 'string' ? parsed.type : undefined,
        });
      } catch {
        const role = extractJsonStringFieldPrefix(line, 'role');
        const text = extractJsonStringFieldPrefix(line, 'text');
        const ts = extractJsonNumberFieldPrefix(line, 'ts');
        if (role || text) {
          result.push({ role, text, ts });
        }
      }
    }

    return result;
  } catch {
    return [];
  }
}

export function getTranscriptPreview(filePath: string, maxLines = 10): TranscriptLine[] {
  return readTranscriptLines(filePath, maxLines);
}

export function countTranscriptLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}
