/**
 * Subagent Spawn Workspace — 工作空间
 *
 * 处理子代理的工作空间创建和管理。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../../logger.js';
import type { SpawnOptions, SpawnContext } from './subagent-spawn.types.js';

export interface WorkspaceInfo {
  path: string;
  relPath: string;
  created: boolean;
  temp: boolean;
}

export interface WorkspaceOptions {
  baseDir?: string;
  createIfNotExists?: boolean;
  useTemp?: boolean;
  prefix?: string;
}

const DEFAULT_WORKSPACE_PREFIX = 'subagent-workspace';
const MAX_WORKSPACE_PATH_LENGTH = 256;

function generateWorkspaceId(): string {
  return `${DEFAULT_WORKSPACE_PREFIX}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function resolveWorkspace(
  options: SpawnOptions,
  context: SpawnContext,
  workspaceOptions: WorkspaceOptions = {},
): WorkspaceInfo {
  const baseDir = workspaceOptions.baseDir ?? context.workspaceDir ?? process.cwd();
  const useTemp = workspaceOptions.useTemp ?? false;
  const prefix = workspaceOptions.prefix ?? DEFAULT_WORKSPACE_PREFIX;

  let workspacePath: string;
  let relPath: string;
  let created = false;

  if (options.cwd) {
    workspacePath = path.resolve(baseDir, options.cwd);
    relPath = options.cwd;
  } else if (useTemp) {
    const tempDir = fs.mkdtempSync(path.join(baseDir, `${prefix}-`));
    workspacePath = tempDir;
    relPath = path.relative(baseDir, tempDir);
    created = true;
  } else {
    const workspaceId = generateWorkspaceId();
    workspacePath = path.join(baseDir, workspaceId);
    relPath = workspaceId;
  }

  if (workspacePath.length > MAX_WORKSPACE_PATH_LENGTH) {
    logger.warn(`[SubagentSpawn] Workspace path too long: ${workspacePath.length} characters`);
  }

  if (workspaceOptions.createIfNotExists !== false) {
    try {
      fs.mkdirSync(workspacePath, { recursive: true });
      created = true;
    } catch (error) {
      logger.error(
        '[SubagentSpawn] Failed to create workspace:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  logger.debug(`[SubagentSpawn] Resolved workspace: ${workspacePath}`);

  return {
    path: workspacePath,
    relPath,
    created,
    temp: useTemp,
  };
}

export function cleanupWorkspace(workspacePath: string): void {
  if (!fs.existsSync(workspacePath)) return;

  try {
    fs.rmSync(workspacePath, { recursive: true, force: true });
    logger.debug(`[SubagentSpawn] Cleaned up workspace: ${workspacePath}`);
  } catch (error) {
    logger.error(
      '[SubagentSpawn] Failed to cleanup workspace:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function validateWorkspace(
  workspacePath: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!workspacePath) {
    errors.push('Workspace path is required');
    return { valid: false, errors };
  }

  if (workspacePath.length > MAX_WORKSPACE_PATH_LENGTH) {
    errors.push(`Workspace path exceeds ${MAX_WORKSPACE_PATH_LENGTH} characters`);
  }

  const resolved = path.resolve(workspacePath);
  const root = process.cwd();
  if (!resolved.startsWith(root)) {
    errors.push('Workspace path must be within the project directory');
  }

  return { valid: errors.length === 0, errors };
}

export function prepareWorkspace(
  options: SpawnOptions,
  context: SpawnContext,
): WorkspaceInfo | null {
  const workspace = resolveWorkspace(options, context);

  if (!workspace.created) {
    return null;
  }

  if (options.attachments && options.attachments.length > 0) {
    const attachDir = path.join(workspace.path, options.attachMountPath ?? 'attachments');
    try {
      fs.mkdirSync(attachDir, { recursive: true });
    } catch (error) {
      logger.error(
        '[SubagentSpawn] Failed to create attachments directory:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return workspace;
}