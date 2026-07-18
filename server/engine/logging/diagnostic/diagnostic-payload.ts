import { z } from 'zod';
import type { DiagnosticEvent } from '../types.js';

export const diagnosticPayloadSchema = z.object({
  type: z.string(),
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  message: z.string(),
  timestamp: z.string().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  code: z.object({
    line: z.number().optional(),
    functionName: z.string().optional(),
  }).optional(),
  trace: z.object({
    traceId: z.string(),
    spanId: z.string().optional(),
    parentSpanId: z.string().optional(),
    traceFlags: z.string().optional(),
  }).optional(),
});

export type DiagnosticPayload = z.infer<typeof diagnosticPayloadSchema>;

export function validateDiagnosticPayload(payload: unknown): DiagnosticPayload | null {
  const result = diagnosticPayloadSchema.safeParse(payload);
  if (result.success) {
    return result.data;
  }
  return null;
}

export function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  return validateDiagnosticPayload(value) !== null;
}

export function normalizeDiagnosticPayload(payload: Partial<DiagnosticEvent>): DiagnosticEvent {
  return {
    type: payload.type ?? 'unknown',
    level: payload.level ?? 'info',
    message: payload.message ?? '',
    timestamp: payload.timestamp ?? new Date().toISOString(),
    ...(payload.attributes ? { attributes: payload.attributes } : {}),
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.trace ? { trace: payload.trace } : {}),
  };
}
