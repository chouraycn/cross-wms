import { z } from 'zod';

export const errorMetadataSchema = z.object({
  code: z.string().optional(),
  category: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  retryable: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  cause: z.string().optional(),
  stack: z.string().optional(),
  timestamp: z.string().optional(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});

export type ErrorMetadata = z.infer<typeof errorMetadataSchema>;

export function extractErrorMetadata(error: unknown): ErrorMetadata {
  if (!error) {
    return {};
  }

  if (error instanceof Error) {
    const metadata: ErrorMetadata = {
      code: (error as { code?: string }).code,
      cause: (error as { cause?: unknown }).cause
        ? String((error as { cause: unknown }).cause)
        : undefined,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };

    const err = error as Error & Record<string, unknown>;
    if (err.category !== undefined) {
      metadata.category = String(err.category);
    }
    if (err.severity !== undefined) {
      metadata.severity = String(err.severity) as ErrorMetadata['severity'];
    }
    if (err.retryable !== undefined) {
      metadata.retryable = Boolean(err.retryable);
    }
    if (err.context !== undefined && typeof err.context === 'object') {
      metadata.context = err.context as Record<string, unknown>;
    }
    if (err.requestId !== undefined) {
      metadata.requestId = String(err.requestId);
    }
    if (err.sessionId !== undefined) {
      metadata.sessionId = String(err.sessionId);
    }
    if (err.userId !== undefined) {
      metadata.userId = String(err.userId);
    }

    return metadata;
  }

  if (typeof error === 'object') {
    const result = errorMetadataSchema.safeParse(error);
    if (result.success) {
      return result.data;
    }
  }

  return {
    cause: String(error),
    timestamp: new Date().toISOString(),
  };
}

export function formatErrorMetadata(metadata: ErrorMetadata): string {
  const parts: string[] = [];
  if (metadata.code) parts.push(`code=${metadata.code}`);
  if (metadata.category) parts.push(`category=${metadata.category}`);
  if (metadata.severity) parts.push(`severity=${metadata.severity}`);
  if (metadata.retryable !== undefined) parts.push(`retryable=${metadata.retryable}`);
  if (metadata.requestId) parts.push(`requestId=${metadata.requestId}`);
  if (metadata.sessionId) parts.push(`sessionId=${metadata.sessionId}`);
  return parts.join(' ');
}

export function classifyError(error: unknown): {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
} {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused')) {
    return { category: 'network', severity: 'medium', retryable: true };
  }

  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
    return { category: 'rate_limit', severity: 'medium', retryable: true };
  }

  if (lower.includes('authentication') || lower.includes('unauthorized') || lower.includes('401')) {
    return { category: 'authentication', severity: 'high', retryable: false };
  }

  if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('403')) {
    return { category: 'permission', severity: 'high', retryable: false };
  }

  if (lower.includes('not found') || lower.includes('404')) {
    return { category: 'not_found', severity: 'low', retryable: false };
  }

  if (lower.includes('validation') || lower.includes('bad request') || lower.includes('400')) {
    return { category: 'validation', severity: 'low', retryable: false };
  }

  if (lower.includes('out of memory') || lower.includes('heap') || lower.includes('oom')) {
    return { category: 'memory', severity: 'critical', retryable: false };
  }

  if (lower.includes('fatal') || lower.includes('crash')) {
    return { category: 'fatal', severity: 'critical', retryable: false };
  }

  return { category: 'unknown', severity: 'medium', retryable: false };
}

export function createErrorWithMetadata(
  message: string,
  metadata: ErrorMetadata,
): Error & ErrorMetadata {
  const error = new Error(message);
  return Object.assign(error, metadata);
}
