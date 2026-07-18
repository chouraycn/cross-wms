import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { logger } from '../../logger.js';
import type { HookSource } from './types.js';

const IMMUTABLE_SOURCES: ReadonlySet<HookSource> = new Set(['bundled']);

export function buildImportUrl(handlerPath: string, source: HookSource): string {
  const base = pathToFileURL(handlerPath).href;

  if (IMMUTABLE_SOURCES.has(source)) {
    return base;
  }

  try {
    const { mtimeMs, size } = fs.statSync(handlerPath);
    return `${base}?t=${mtimeMs}&s=${size}`;
  } catch {
    return `${base}?t=${Date.now()}`;
  }
}

export function isImmutableSource(source: HookSource): boolean {
  return IMMUTABLE_SOURCES.has(source);
}

export function parseImportUrl(url: string): {
  basePath: string;
  mtimeMs?: number;
  size?: number;
  timestamp?: number;
} {
  try {
    const parsed = new URL(url);
    const basePath = parsed.pathname;
    const params = parsed.searchParams;

    const result: {
      basePath: string;
      mtimeMs?: number;
      size?: number;
      timestamp?: number;
    } = { basePath };

    const t = params.get('t');
    const s = params.get('s');

    if (t) {
      const num = Number(t);
      if (!Number.isNaN(num)) {
        if (s) {
          result.mtimeMs = num;
        } else {
          result.timestamp = num;
        }
      }
    }

    if (s) {
      const sizeNum = Number(s);
      if (!Number.isNaN(sizeNum)) {
        result.size = sizeNum;
      }
    }

    return result;
  } catch {
    return { basePath: url };
  }
}

export function invalidateImportCache(handlerPath: string): void {
  const url = pathToFileURL(handlerPath).href;
  logger.debug(`[hooks:ImportUrl] Invalidating cache for: ${handlerPath}`);
  try {
    delete (globalThis as unknown as { webpackModule?: unknown }).webpackModule;
  } catch {
    // Not in webpack context
  }
}

export function buildImportUrlWithCacheBust(
  handlerPath: string,
  source: HookSource,
  forceBust = false,
): string {
  if (forceBust) {
    const base = pathToFileURL(handlerPath).href;
    return `${base}?t=${Date.now()}`;
  }
  return buildImportUrl(handlerPath, source);
}

export function hasImportUrlChanged(
  currentUrl: string,
  handlerPath: string,
  source: HookSource,
): boolean {
  const newUrl = buildImportUrl(handlerPath, source);
  return currentUrl !== newUrl;
}
