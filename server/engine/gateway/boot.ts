import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../logger.js';

export type BootResult = 'ran' | 'skipped' | 'failed';

export async function loadBootFile(workspaceDir: string): Promise<{ ok: string } | { missing: true } | { empty: true }> {
  try {
    const content = await readFile(join(workspaceDir, 'BOOT.md'), 'utf-8');
    if (!content.trim()) return { empty: true };
    return { ok: content };
  } catch {
    return { missing: true };
  }
}

export async function runBootOnce(params: {
  workspaceDir: string;
  agentId?: string;
}): Promise<BootResult> {
  const { workspaceDir } = params;
  logger.info(`[Gateway:Boot] Running BOOT.md check in ${workspaceDir}`);

  const bootFile = await loadBootFile(workspaceDir);
  if ('missing' in bootFile) {
    logger.info('[Gateway:Boot] No BOOT.md found, skipping');
    return 'skipped';
  }
  if ('empty' in bootFile) {
    logger.info('[Gateway:Boot] BOOT.md is empty, skipping');
    return 'skipped';
  }

  try {
    const bootPrompt = buildBootPrompt(bootFile.ok);
    logger.info(`[Gateway:Boot] BOOT.md loaded, prompt length=${bootPrompt.length}`);
    return 'ran';
  } catch (err) {
    logger.error('[Gateway:Boot] Failed to run boot', err);
    return 'failed';
  }
}

function buildBootPrompt(content: string): string {
  return `INTERNAL_RUNTIME_CONTEXT_BEGIN\n${content}\nINTERNAL_RUNTIME_CONTEXT_END`;
}
