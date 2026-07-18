const IDENTIFIER_PATTERNS = [
  {
    name: 'uuid',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: '<uuid>',
  },
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '<email>',
  },
  {
    name: 'phone',
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b/g,
    replacement: '<phone>',
  },
  {
    name: 'ipAddress',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '<ip>',
  },
  {
    name: 'sessionId',
    pattern: /\bsession[_-]?id["\s:=]+["']?([A-Za-z0-9_-]{16,})["']?/gi,
    replacement: 'sessionId=<redacted>',
  },
  {
    name: 'userId',
    pattern: /\buser[_-]?id["\s:=]+["']?([A-Za-z0-9_-]{8,})["']?/gi,
    replacement: 'userId=<redacted>',
  },
];

export function redactIdentifiers(text: string): string {
  let result = text;
  for (const { pattern, replacement } of IDENTIFIER_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactIdentifiersInObject<T>(obj: T): T {
  if (typeof obj === 'string') return redactIdentifiers(obj) as unknown as T;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactIdentifiersInObject(item)) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = redactIdentifiersInObject(value);
  }
  return result as unknown as T;
}

export function maskString(str: string, visibleStart: number = 4, visibleEnd: number = 4): string {
  if (str.length <= visibleStart + visibleEnd + 4) {
    return '*'.repeat(str.length);
  }
  return str.slice(0, visibleStart) + '****' + str.slice(str.length - visibleEnd);
}

export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '<email>';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= 2) return '*'.repeat(local.length) + domain;
  return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + domain;
}
