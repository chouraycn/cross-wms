/**
 * Subagent Spawn Attachments — 附件处理
 *
 * 处理子代理生成时的附件上传和管理。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import type { SpawnOptions } from './subagent-spawn.types.js';

export interface Attachment {
  name: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  mimeType?: string;
}

export interface ProcessedAttachment {
  name: string;
  bytes: number;
  sha256: string;
  filePath: string;
  mimeType?: string;
}

export interface AttachmentsResult {
  count: number;
  totalBytes: number;
  files: ProcessedAttachment[];
  relDir: string;
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;

function calculateSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function decodeContent(content: string, encoding: string): Buffer {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64');
  }
  return Buffer.from(content, 'utf8');
}

function validateAttachment(attachment: Attachment): { valid: boolean; error?: string } {
  if (!attachment.name || attachment.name.trim().length === 0) {
    return { valid: false, error: 'Attachment name is required' };
  }

  if (!attachment.content) {
    return { valid: false, error: 'Attachment content is required' };
  }

  const bytes = Buffer.byteLength(attachment.content, attachment.encoding === 'base64' ? 'base64' : 'utf8');
  if (bytes > MAX_ATTACHMENT_SIZE_BYTES) {
    return { valid: false, error: `Attachment size exceeds ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024}MB limit` };
  }

  const invalidChars = /[\\/:*?"<>|]/;
  if (invalidChars.test(attachment.name)) {
    return { valid: false, error: 'Attachment name contains invalid characters' };
  }

  return { valid: true };
}

export function processAttachments(
  options: SpawnOptions,
  baseDir: string,
): AttachmentsResult | null {
  const attachments = options.attachments;
  if (!attachments || attachments.length === 0) {
    return null;
  }

  if (attachments.length > MAX_ATTACHMENTS) {
    logger.warn(`[SubagentSpawn] Too many attachments: ${attachments.length}, limit: ${MAX_ATTACHMENTS}`);
    return null;
  }

  const relDir = options.attachMountPath ?? 'attachments';
  const fullDir = path.join(baseDir, relDir);

  try {
    fs.mkdirSync(fullDir, { recursive: true });
  } catch (error) {
    logger.error(
      '[SubagentSpawn] Failed to create attachments directory:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }

  const processed: ProcessedAttachment[] = [];
  let totalBytes = 0;

  for (const attachment of attachments) {
    const validation = validateAttachment(attachment);
    if (!validation.valid) {
      logger.warn(`[SubagentSpawn] Invalid attachment: ${validation.error}`);
      continue;
    }

    const bytes = Buffer.byteLength(attachment.content, attachment.encoding === 'base64' ? 'base64' : 'utf8');
    const sha256 = calculateSha256(attachment.content);
    const filePath = path.join(fullDir, attachment.name);

    try {
      const decoded = decodeContent(attachment.content, attachment.encoding || 'utf8');
      fs.writeFileSync(filePath, decoded);

      processed.push({
        name: attachment.name,
        bytes,
        sha256,
        filePath,
        mimeType: attachment.mimeType,
      });
      totalBytes += bytes;
    } catch (error) {
      logger.error(
        `[SubagentSpawn] Failed to write attachment ${attachment.name}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (processed.length === 0) {
    return null;
  }

  logger.debug(`[SubagentSpawn] Processed ${processed.length} attachments (${totalBytes} bytes)`);

  return {
    count: processed.length,
    totalBytes,
    files: processed,
    relDir,
  };
}

export function cleanupAttachments(baseDir: string, relDir: string): void {
  const fullDir = path.join(baseDir, relDir);
  if (!fs.existsSync(fullDir)) return;

  try {
    fs.rmSync(fullDir, { recursive: true, force: true });
    logger.debug(`[SubagentSpawn] Cleaned up attachments directory: ${fullDir}`);
  } catch (error) {
    logger.error(
      '[SubagentSpawn] Failed to cleanup attachments:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function validateAttachments(attachments: Attachment[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (attachments.length > MAX_ATTACHMENTS) {
    errors.push(`Too many attachments: ${attachments.length} > ${MAX_ATTACHMENTS}`);
    return { valid: false, errors };
  }

  for (let i = 0; i < attachments.length; i++) {
    const result = validateAttachment(attachments[i]);
    if (!result.valid) {
      errors.push(`Attachment ${i}: ${result.error}`);
    }
  }

  return { valid: errors.length === 0, errors };
}