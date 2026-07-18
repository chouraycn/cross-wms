/**
 * Subagent Announce Format — 公告格式
 *
 * 管理公告的格式化和序列化。
 */

import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent } from './subagent-registry.state.js';

export type AnnouncementFormat = 'json' | 'messagepack' | 'yaml' | 'text';

export interface FormatOptions {
  format?: AnnouncementFormat;
  includeMetadata?: boolean;
  compress?: boolean;
  pretty?: boolean;
}

export interface FormattedAnnouncement {
  payload: string | Buffer;
  format: AnnouncementFormat;
  contentType: string;
  size: number;
}

export interface AnnouncementMetadata {
  instanceId: string;
  sessionKey: string;
  definitionId: string;
  timestamp: number;
  type: string;
}

export function formatAnnouncement(
  instanceId: string,
  type: string,
  content: unknown,
  options: FormatOptions = {},
): FormattedAnnouncement {
  const instance = getActiveSubagent(instanceId);
  const format = options.format ?? 'json';
  const includeMetadata = options.includeMetadata ?? true;

  const metadata: AnnouncementMetadata = {
    instanceId,
    sessionKey: instance?.sessionKey ?? '',
    definitionId: instance?.definitionId ?? '',
    timestamp: Date.now(),
    type,
  };

  const payload: Record<string, unknown> = {
    ...(includeMetadata ? { metadata } : {}),
    content,
  };

  let serialized: string | Buffer;
  let contentType: string;

  switch (format) {
    case 'json':
      serialized = options.pretty
        ? JSON.stringify(payload, null, 2)
        : JSON.stringify(payload);
      contentType = 'application/json';
      break;

    case 'messagepack':
      serialized = Buffer.from(JSON.stringify(payload));
      contentType = 'application/x-msgpack';
      break;

    case 'yaml':
      serialized = toYaml(payload);
      contentType = 'text/yaml';
      break;

    case 'text':
      serialized = typeof content === 'string' ? content : JSON.stringify(content);
      contentType = 'text/plain';
      break;

    default:
      serialized = JSON.stringify(payload);
      contentType = 'application/json';
  }

  return {
    payload: serialized,
    format,
    contentType,
    size: typeof serialized === 'string' ? serialized.length : serialized.length,
  };
}

export function parseAnnouncement(
  payload: string | Buffer,
  format: AnnouncementFormat = 'json',
): Record<string, unknown> {
  const raw = typeof payload === 'string' ? payload : payload.toString('utf-8');

  switch (format) {
    case 'json':
      return JSON.parse(raw);

    case 'messagepack':
      return JSON.parse(raw);

    case 'yaml':
      return parseYaml(raw);

    case 'text':
      return { content: raw };

    default:
      return JSON.parse(raw);
  }
}

function toYaml(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  const serialize = (value: unknown, indent: number): string => {
    const prefix = '  '.repeat(indent);

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return `"${value}"`;

    if (Array.isArray(value)) {
      return `[\n${value.map((v) => `${prefix}  - ${serialize(v, indent + 1)}`).join('\n')}\n${prefix}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      return `{\n${entries.map(([k, v]) => `${prefix}  ${k}: ${serialize(v, indent + 1)}`).join('\n')}\n${prefix}}`;
    }

    return String(value);
  };

  for (const [key, value] of Object.entries(obj)) {
    lines.push(`${key}: ${serialize(value, 0)}`);
  }

  return lines.join('\n');
}

function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    let parsedValue: unknown;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (value === 'null') parsedValue = null;
    else if (!isNaN(Number(value))) parsedValue = Number(value);
    else if (value.startsWith('"') && value.endsWith('"')) parsedValue = value.slice(1, -1);
    else parsedValue = value;

    result[key] = parsedValue;
  }

  return result;
}

export function validateAnnouncement(
  payload: string | Buffer,
  format: AnnouncementFormat = 'json',
): { valid: boolean; error?: string } {
  try {
    parseAnnouncement(payload, format);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}