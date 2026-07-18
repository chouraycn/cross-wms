import { diagnosticSystem } from './diagnostic.js';
import { emitDiagnosticMemorySample, formatReadableBytes } from './diagnostic-memory.js';
import { getDiagnosticStabilitySnapshot } from './diagnostic-stability.js';
import { getSessionStateDiagnostics } from './diagnostic-session-state.js';
import type { SupportBundle } from '../types.js';

export function generateSupportBundle(): SupportBundle {
  const memory = diagnosticSystem.getMemoryDiagnostic();
  const stability = getDiagnosticStabilitySnapshot({ limit: 100 });
  const sessions = getSessionStateDiagnostics();
  const indicators = diagnosticSystem.getStabilityIndicators();

  return {
    id: `bundle-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    version: process.env.npm_package_version ?? '1.0.0',
    platform: process.platform,
    memory,
    sessions,
    stabilityIndicators: indicators,
    recentLogs: stability.events.map(e => JSON.stringify(e)),
    errors: stability.events
      .filter(e => e.level === 'error' || e.level === 'fatal')
      .map(e => String(e.type)),
  };
}

export function formatSupportBundleSummary(bundle: SupportBundle): string {
  const lines: string[] = [];
  lines.push(`Support Bundle: ${bundle.id}`);
  lines.push(`Generated: ${bundle.generatedAt}`);
  lines.push(`Version: ${bundle.version}`);
  lines.push(`Platform: ${bundle.platform}`);
  lines.push('');
  lines.push('Memory:');
  lines.push(`  RSS: ${formatReadableBytes(bundle.memory.rss)}`);
  lines.push(`  Heap Used: ${formatReadableBytes(bundle.memory.heapUsed)}`);
  lines.push(`  Heap Total: ${formatReadableBytes(bundle.memory.heapTotal)}`);
  lines.push('');
  lines.push(`Sessions: ${bundle.sessions.length}`);
  lines.push(`Recent Logs: ${bundle.recentLogs.length}`);
  lines.push(`Errors: ${bundle.errors.length}`);
  lines.push('');
  lines.push('Stability Indicators:');
  for (const indicator of bundle.stabilityIndicators) {
    lines.push(`  ${indicator.name}: ${indicator.value} (threshold: ${indicator.threshold}, status: ${indicator.status})`);
  }
  return lines.join('\n');
}

export function validateSupportBundle(bundle: unknown): bundle is SupportBundle {
  if (!bundle || typeof bundle !== 'object') return false;
  const b = bundle as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.generatedAt === 'string' &&
    typeof b.version === 'string' &&
    typeof b.platform === 'string' &&
    typeof b.memory === 'object' &&
    Array.isArray(b.sessions) &&
    Array.isArray(b.stabilityIndicators) &&
    Array.isArray(b.recentLogs) &&
    Array.isArray(b.errors)
  );
}
