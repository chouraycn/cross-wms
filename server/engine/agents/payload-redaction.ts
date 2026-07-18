import { logger } from '../../logger.js';

const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'api-key',
  'access_key',
  'access-key',
  'private_key',
  'private-key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'credential',
  'credit_card',
  'creditcard',
  'ssn',
  'phone',
  'email',
  'address',
];

const DEFAULT_REPLACEMENT = '[REDACTED]';

export interface RedactionOptions {
  fields?: string[];
  replacement?: string;
  redactValues?: boolean;
  redactKeys?: boolean;
  deep?: boolean;
}

export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  const fields = (options.fields ?? DEFAULT_SENSITIVE_FIELDS).map(f => f.toLowerCase());
  const replacement = options.replacement ?? DEFAULT_REPLACEMENT;
  const deep = options.deep ?? true;

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value, fields, replacement);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (!deep) return value;
    return value.map(item => redactValue(item, options));
  }

  if (typeof value === 'object') {
    if (!deep) return value;
    return redactObject(value as Record<string, unknown>, fields, replacement, options);
  }

  return value;
}

function redactString(str: string, fields: string[], replacement: string): string {
  let result = str;

  for (const field of fields) {
    const patterns = [
      new RegExp(`"${field}"\\s*:\\s*"[^"]*"`, 'gi'),
      new RegExp(`'${field}'\\s*:\\s*'[^']*'`, 'gi'),
      new RegExp(`${field}\\s*=\\s*[^\\s&]+`, 'gi'),
      new RegExp(`${field}:\\s*[^\\s,}]+`, 'gi'),
    ];

    for (const pattern of patterns) {
      result = result.replace(pattern, (match) => {
        const keyMatch = match.match(/^[^=:]+/);
        const key = keyMatch ? keyMatch[0].trim() : field;
        return `${key}${match.includes('=') ? '=' : ':'} ${replacement}`;
      });
    }
  }

  return result;
}

function redactObject(
  obj: Record<string, unknown>,
  fields: string[],
  replacement: string,
  options: RedactionOptions,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = fields.some(field => 
      keyLower.includes(field) || field.includes(keyLower)
    );

    if (isSensitive) {
      result[key] = replacement;
    } else if (options.deep ?? true) {
      result[key] = redactValue(value, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function redactPayload(payload: unknown, options?: RedactionOptions): unknown {
  return redactValue(payload, options);
}

export function redactHeaders(
  headers: Record<string, string>,
  options?: RedactionOptions,
): Record<string, string> {
  const fields = (options?.fields ?? DEFAULT_SENSITIVE_FIELDS).map(f => f.toLowerCase());
  const replacement = options?.replacement ?? DEFAULT_REPLACEMENT;
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const keyLower = key.toLowerCase();
    const isSensitive = fields.some(field => 
      keyLower.includes(field) || field.includes(keyLower)
    );
    
    result[key] = isSensitive ? replacement : value;
  }

  return result;
}

export function isSensitiveField(fieldName: string, options?: RedactionOptions): boolean {
  const fields = (options?.fields ?? DEFAULT_SENSITIVE_FIELDS).map(f => f.toLowerCase());
  const lowerName = fieldName.toLowerCase();
  return fields.some(field => 
    lowerName.includes(field) || field.includes(lowerName)
  );
}

export function createRedactor(options?: RedactionOptions) {
  const mergedOptions: Required<RedactionOptions> = {
    fields: options?.fields ?? DEFAULT_SENSITIVE_FIELDS,
    replacement: options?.replacement ?? DEFAULT_REPLACEMENT,
    redactValues: options?.redactValues ?? true,
    redactKeys: options?.redactKeys ?? false,
    deep: options?.deep ?? true,
  };

  return {
    redact: (value: unknown) => redactValue(value, mergedOptions),
    redactHeaders: (headers: Record<string, string>) => redactHeaders(headers, mergedOptions),
    isSensitive: (fieldName: string) => isSensitiveField(fieldName, mergedOptions),
    options: mergedOptions,
  };
}

logger.debug('[Agents:PayloadRedaction] Module loaded');
