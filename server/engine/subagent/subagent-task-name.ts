/**
 * Subagent Task Name — 任务命名
 *
 * 管理子代理任务的命名规范。
 */

import type { SubagentInstance } from '../subagentRegistry.js';

export interface TaskNameOptions {
  prefix?: string;
  separator?: string;
  maxLength?: number;
  includeTimestamp?: boolean;
  includeInstanceId?: boolean;
}

const DEFAULT_PREFIX = 'subagent';
const DEFAULT_SEPARATOR = '-';
const DEFAULT_MAX_LENGTH = 64;

export function generateTaskName(
  instance: SubagentInstance,
  options: TaskNameOptions = {},
): string {
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const separator = options.separator ?? DEFAULT_SEPARATOR;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;

  const parts: string[] = [prefix];

  if (options.includeTimestamp) {
    parts.push(Date.now().toString(36));
  }

  if (options.includeInstanceId) {
    parts.push(instance.id.slice(0, 8));
  }

  if (instance.taskDescription) {
    const cleanedDescription = instance.taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, separator)
      .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');
    if (cleanedDescription) {
      parts.push(cleanedDescription);
    }
  }

  let name = parts.join(separator);

  if (name.length > maxLength) {
    name = name.slice(0, maxLength);
    name = name.replace(new RegExp(`${separator}+$`), '');
  }

  return name;
}

export function sanitizeTaskName(name: string, options: TaskNameOptions = {}): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;

  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, separator)
    .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
    sanitized = sanitized.replace(new RegExp(`${separator}+$`), '');
  }

  return sanitized || DEFAULT_PREFIX;
}

export function parseTaskName(name: string): {
  prefix?: string;
  timestamp?: number;
  instanceId?: string;
  description?: string;
} {
  const parts = name.split('-');
  const result: {
    prefix?: string;
    timestamp?: number;
    instanceId?: string;
    description?: string;
  } = {};

  if (parts.length > 0) {
    result.prefix = parts[0];
  }

  for (const part of parts) {
    const timestampMatch = part.match(/^\d{9,10}$/);
    if (timestampMatch) {
      result.timestamp = parseInt(part, 10);
    }

    const instanceIdMatch = part.match(/^[a-f0-9]{8}$/);
    if (instanceIdMatch) {
      result.instanceId = part;
    }
  }

  const descriptionParts = parts.filter((p) => {
    return (
      p !== result.prefix &&
      p !== result.timestamp?.toString() &&
      p !== result.instanceId
    );
  });

  if (descriptionParts.length > 0) {
    result.description = descriptionParts.join('-');
  }

  return result;
}

export function generateUniqueTaskName(
  instance: SubagentInstance,
  existingNames: string[],
  options: TaskNameOptions = {},
): string {
  const baseName = generateTaskName(instance, options);

  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  let counter = 1;
  let candidate = `${baseName}${options.separator ?? DEFAULT_SEPARATOR}${counter}`;

  while (existingNames.includes(candidate)) {
    counter++;
    candidate = `${baseName}${options.separator ?? DEFAULT_SEPARATOR}${counter}`;
  }

  return candidate;
}