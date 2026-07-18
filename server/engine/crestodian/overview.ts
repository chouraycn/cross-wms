import { randomUUID } from 'node:crypto';
import { runProbes, getDefaultProbes, type CrestodianProbe } from './probes.js';
import { getRecentAuditEntries, type CrestodianAuditEntry } from './audit.js';
import type { CrestodianOverview, CrestodianStatus } from './types.js';

export type { CrestodianOverview } from './types.js';

export async function loadCrestodianOverview(options?: {
  probes?: CrestodianProbe[];
  uptimeMs?: number;
  includeRecentOperations?: number;
}): Promise<CrestodianOverview> {
  const probes = options?.probes ?? getDefaultProbes();
  const probeResults = await runProbes(probes);

  let status: CrestodianStatus = 'healthy';
  let healthy = 0;
  let degraded = 0;
  let critical = 0;

  for (const result of probeResults) {
    if (result.status === 'critical') {
      critical++;
      status = 'critical';
    } else if (result.status === 'degraded') {
      degraded++;
      if (status === 'healthy') {
        status = 'degraded';
      }
    } else {
      healthy++;
    }
  }

  const recentOperations = getRecentAuditEntries(options?.includeRecentOperations ?? 5);
  const activeRescues = recentOperations.filter(
    (e) => e.operation === 'repair' && e.status === 'started',
  ).length;

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    status,
    version: process.env.npm_package_version ?? '1.0.0',
    platform: process.platform,
    uptimeMs: options?.uptimeMs ?? 0,
    probes: probeResults,
    summary: {
      total: probeResults.length,
      healthy,
      degraded,
      critical,
    },
    recentOperations,
    activeRescues,
  };
}

export function formatCrestodianOverview(overview: CrestodianOverview): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push('  CRESTODIAN SYSTEM OVERVIEW');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`  Status:     ${statusToLabel(overview.status)}`);
  lines.push(`  Version:    ${overview.version}`);
  lines.push(`  Platform:   ${overview.platform}`);
  lines.push(`  Uptime:     ${formatUptime(overview.uptimeMs)}`);
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('  HEALTH PROBES');
  lines.push('─'.repeat(60));

  for (const probe of overview.probes) {
    const statusIcon = statusToIcon(probe.status);
    lines.push(`  ${statusIcon} ${probe.name.padEnd(25)} ${probe.message}`);
  }

  lines.push('');
  lines.push(`  Summary: ${overview.summary.healthy} healthy, ${overview.summary.degraded} degraded, ${overview.summary.critical} critical`);
  lines.push('');

  if (overview.recentOperations.length > 0) {
    lines.push('─'.repeat(60));
    lines.push('  RECENT OPERATIONS');
    lines.push('─'.repeat(60));
    for (const op of overview.recentOperations.slice(0, 5)) {
      const statusIcon = op.status === 'completed' ? '✓' : op.status === 'failed' ? '✗' : '◐';
      lines.push(`  ${statusIcon} ${op.operation.padEnd(12)} ${op.status.padEnd(10)} ${op.message.slice(0, 30)}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(60));

  return lines.join('\n');
}

function statusToLabel(status: CrestodianStatus): string {
  switch (status) {
    case 'healthy':
      return 'HEALTHY ✓';
    case 'degraded':
      return 'DEGRADED ⚠';
    case 'critical':
      return 'CRITICAL ✗';
    default:
      return 'UNKNOWN ?';
  }
}

function statusToIcon(status: CrestodianStatus): string {
  switch (status) {
    case 'healthy':
      return '✓';
    case 'degraded':
      return '⚠';
    case 'critical':
      return '✗';
    default:
      return '?';
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
