import { z } from 'zod';

export const TranscriptHeaderSchema = z.object({
  sessionId: z.string(),
  schemaVersion: z.string(),
  createdAt: z.string(),
  appVersion: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  format: z.enum(['jsonl', 'json', 'markdown']),
  messageCount: z.number().int().nonnegative(),
});

export type TranscriptHeader = z.infer<typeof TranscriptHeaderSchema>;

export function createTranscriptHeader(
  sessionId: string,
  options: Partial<TranscriptHeader> = {}
): TranscriptHeader {
  return {
    sessionId,
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    format: 'jsonl',
    messageCount: 0,
    metadata: {},
    ...options,
  };
}

export function validateTranscriptHeader(header: unknown): header is TranscriptHeader {
  const result = TranscriptHeaderSchema.safeParse(header);
  return result.success;
}

export function parseTranscriptHeader(line: string): TranscriptHeader | null {
  try {
    const data = JSON.parse(line);
    const header = data.header || data.transcriptHeader || data.session;
    if (!header) return null;

    const result = TranscriptHeaderSchema.safeParse(header);
    if (result.success) {
      return result.data;
    }

    if (data.session?.id) {
      return {
        sessionId: data.session.id,
        schemaVersion: '1.0.0',
        createdAt: data.session.createdAt || new Date().toISOString(),
        format: 'jsonl',
        messageCount: data.session.messageCount || 0,
        metadata: {},
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function serializeTranscriptHeader(header: TranscriptHeader): string {
  return JSON.stringify({ header });
}

export function updateTranscriptHeader(
  header: TranscriptHeader,
  updates: Partial<TranscriptHeader>
): TranscriptHeader {
  return {
    ...header,
    ...updates,
  };
}
