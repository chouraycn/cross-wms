import { logger } from '../../logger.js';
import type { ContextVisibilityDecision, ContextVisibilityKind, ContextVisibilityMode } from './types.js';

export type {
  ContextVisibilityMode,
  ContextVisibilityKind,
  ContextVisibilityDecision,
};

type VisibilityDecisionReason =
  | 'mode_all'
  | 'sender_allowed'
  | 'quote_override'
  | 'mode_none'
  | 'blocked';

export function evaluateSupplementalContextVisibility(params: {
  mode: ContextVisibilityMode;
  kind: ContextVisibilityKind;
  senderAllowed: boolean;
}): ContextVisibilityDecision {
  if (params.mode === 'all') {
    return { include: true, reason: 'mode_all' };
  }

  if (params.mode === 'none') {
    return { include: false, reason: 'mode_none' };
  }

  if (params.senderAllowed) {
    return { include: true, reason: 'sender_allowed' };
  }

  if (params.mode === 'allowlist_quote' && params.kind === 'quote') {
    return { include: true, reason: 'quote_override' };
  }

  return { include: false, reason: 'blocked' };
}

export function shouldIncludeSupplementalContext(params: {
  mode: ContextVisibilityMode;
  kind: ContextVisibilityKind;
  senderAllowed: boolean;
}): boolean {
  return evaluateSupplementalContextVisibility(params).include;
}

export function filterSupplementalContextItems<T>(params: {
  items: readonly T[];
  mode: ContextVisibilityMode;
  kind: ContextVisibilityKind;
  isSenderAllowed: (item: T) => boolean;
}): { items: T[]; omitted: number } {
  const items = params.items.filter((item) =>
    shouldIncludeSupplementalContext({
      mode: params.mode,
      kind: params.kind,
      senderAllowed: params.isSenderAllowed(item),
    }),
  );
  return {
    items,
    omitted: params.items.length - items.length,
  };
}

const SENSITIVE_PATTERNS = [
  { pattern: /api[_-]?key\s*[=:]\s*[A-Za-z0-9_\-]{20,}/gi, label: 'API key' },
  { pattern: /secret\s*[=:]\s*[A-Za-z0-9_\-]{20,}/gi, label: 'secret' },
  { pattern: /token\s*[=:]\s*[A-Za-z0-9_\-]{20,}/gi, label: 'token' },
  { pattern: /password\s*[=:]\s*[^\s]+/gi, label: 'password' },
  { pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gi, label: 'private key' },
  { pattern: /\b\d{16}\b/g, label: 'potential credit card number' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: 'potential SSN' },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: 'email address' },
];

const REDACTED = '[REDACTED]';

export function redactSensitiveInfo(content: string): {
  redacted: string;
  foundPatterns: string[];
  count: number;
} {
  let redacted = content;
  const foundPatterns: string[] = [];
  let count = 0;

  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      foundPatterns.push(label);
      count += matches.length;
      redacted = redacted.replace(pattern, REDACTED);
    }
  }

  if (count > 0) {
    logger.debug(`[Security:ContextVisibility] Redacted ${count} sensitive patterns: ${foundPatterns.join(', ')}`);
  }

  return { redacted, foundPatterns, count };
}

export function sanitizeContextForRole<T extends Record<string, unknown>>(
  context: T,
  options: {
    role: 'admin' | 'user' | 'guest' | 'system';
    sensitiveFields?: string[];
    redactValues?: boolean;
  },
): Partial<T> {
  const { role, sensitiveFields = [], redactValues = true } = options;

  if (role === 'admin' || role === 'system') {
    return { ...context };
  }

  const sanitized: Partial<T> = {};
  const defaultSensitive = ['password', 'token', 'secret', 'apiKey', 'api_key', 'privateKey', 'private_key'];
  const allSensitive = [...defaultSensitive, ...sensitiveFields];

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = allSensitive.some((f) => lowerKey.includes(f.toLowerCase()));

    if (isSensitive) {
      if (role === 'user' && redactValues) {
        (sanitized as Record<string, unknown>)[key] = REDACTED;
      }
    } else {
      (sanitized as Record<string, unknown>)[key] = value;
    }
  }

  return sanitized;
}

export function buildContextVisibilityReport(
  totalItems: number,
  includedItems: number,
  mode: ContextVisibilityMode,
): {
  total: number;
  included: number;
  omitted: number;
  mode: ContextVisibilityMode;
  includeRate: number;
} {
  const omitted = totalItems - includedItems;
  const includeRate = totalItems > 0 ? includedItems / totalItems : 1;

  return {
    total: totalItems,
    included: includedItems,
    omitted,
    mode,
    includeRate,
  };
}

export function validateVisibilityMode(mode: string): ContextVisibilityMode {
  const validModes: ContextVisibilityMode[] = ['all', 'allowlist', 'allowlist_quote', 'none'];
  if (validModes.includes(mode as ContextVisibilityMode)) {
    return mode as ContextVisibilityMode;
  }
  logger.warn(`[Security:ContextVisibility] Invalid visibility mode: ${mode}, defaulting to 'allowlist'`);
  return 'allowlist';
}
