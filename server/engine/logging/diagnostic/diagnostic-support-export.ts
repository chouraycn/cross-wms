import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateSupportBundle, formatSupportBundleSummary } from './diagnostic-support-bundle.js';
import { redactSupportBundle } from './diagnostic-support-redaction.js';
import type { SupportBundle } from '../types.js';

export type ExportFormat = 'json' | 'text';

export type ExportOptions = {
  format?: ExportFormat;
  outputDir?: string;
  redact?: boolean;
  includeLogs?: boolean;
  maxLogLines?: number;
};

export type ExportResult = {
  success: boolean;
  path?: string;
  size?: number;
  error?: string;
  bundle?: SupportBundle;
};

function resolveOutputDir(options?: ExportOptions): string {
  if (options?.outputDir) {
    return options.outputDir;
  }
  return path.join(os.tmpdir(), 'cross-wms-diagnostics');
}

function generateFilename(format: ExportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = format === 'json' ? 'json' : 'txt';
  return `diagnostic-bundle-${timestamp}.${ext}`;
}

export async function exportSupportBundle(options?: ExportOptions): Promise<ExportResult> {
  try {
    const format = options?.format ?? 'json';
    const outputDir = resolveOutputDir(options);
    const filename = generateFilename(format);
    const outputPath = path.join(outputDir, filename);

    let bundle = generateSupportBundle();

    if (options?.redact !== false) {
      bundle = redactSupportBundle(bundle);
    }

    fs.mkdirSync(outputDir, { recursive: true });

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(bundle, null, 2);
    } else {
      content = formatSupportBundleSummary(bundle);
    }

    fs.writeFileSync(outputPath, content, 'utf8');
    const stats = fs.statSync(outputPath);

    return {
      success: true,
      path: outputPath,
      size: stats.size,
      bundle,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function exportSupportBundleSync(options?: ExportOptions): ExportResult {
  try {
    const format = options?.format ?? 'json';
    const outputDir = resolveOutputDir(options);
    const filename = generateFilename(format);
    const outputPath = path.join(outputDir, filename);

    let bundle = generateSupportBundle();

    if (options?.redact !== false) {
      bundle = redactSupportBundle(bundle);
    }

    fs.mkdirSync(outputDir, { recursive: true });

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(bundle, null, 2);
    } else {
      content = formatSupportBundleSummary(bundle);
    }

    fs.writeFileSync(outputPath, content, 'utf8');
    const stats = fs.statSync(outputPath);

    return {
      success: true,
      path: outputPath,
      size: stats.size,
      bundle,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getBundleExportPath(options?: ExportOptions): string {
  const format = options?.format ?? 'json';
  const outputDir = resolveOutputDir(options);
  const filename = generateFilename(format);
  return path.join(outputDir, filename);
}
