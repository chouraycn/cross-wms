const DEFAULT_REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys
  { pattern: /(?:api[_-]?key|apikey)["\s:=]+([A-Za-z0-9_\-]{20,})/gi, replacement: '$1=<redacted>' },
  // Bearer tokens
  { pattern: /Bearer\s+([A-Za-z0-9_\-\.]{20,})/gi, replacement: 'Bearer <redacted>' },
  // Passwords
  { pattern: /(?:password|passwd|pwd)["\s:=]+(\S+)/gi, replacement: '$1=<redacted>' },
  // Secrets
  { pattern: /(?:secret|token)["\s:=]+([A-Za-z0-9_\-]{16,})/gi, replacement: '$1=<redacted>' },
  // Connection strings
  { pattern: /(\w+):\/\/([^:]+):([^@]+)@/g, replacement: '$1://$2:<redacted>@' },
  // Authorization headers
  { pattern: /authorization["\s:]+Bearer\s+\S+/gi, replacement: 'authorization: Bearer <redacted>' },
  // AWS keys
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '<redacted-aws-key>' },
  // Private keys
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, replacement: '<redacted-private-key>' },
  // Credit card numbers
  { pattern: /\b(?:\d[ -]*?){13,16}\b/g, replacement: '<redacted-cc>' },
];

const customPatterns: Array<{ pattern: RegExp; replacement: string }> = [];

export function getDefaultRedactPatterns() {
  return DEFAULT_REDACT_PATTERNS;
}

export function addRedactPattern(pattern: RegExp, replacement: string): void {
  customPatterns.push({ pattern, replacement });
}

export function redactSensitiveText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of [...DEFAULT_REDACT_PATTERNS, ...customPatterns]) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactObject<T>(obj: T): T {
  if (typeof obj === 'string') return redactSensitiveText(obj) as unknown as T;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactObject(item)) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (isSensitiveKey(lowerKey) && typeof value === 'string') {
      result[key] = '<redacted>';
    } else {
      result[key] = redactObject(value);
    }
  }
  return result as unknown as T;
}

function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = ['password', 'secret', 'token', 'apikey', 'api_key', 'credential', 'privatekey', 'private_key'];
  return sensitivePatterns.some(p => key.includes(p));
}
