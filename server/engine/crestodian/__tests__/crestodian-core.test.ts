import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDefaultProbes,
  runProbes,
  registerProbe,
  getProbeByName,
  getRegisteredProbes,
  type CrestodianProbe,
} from '../probes.js';
import { loadCrestodianOverview, formatCrestodianOverview } from '../overview.js';
import {
  executeCrestodianOperation,
  resolveOperationFromText,
  isPersistentCrestodianOperation,
  getOperationDescription,
} from '../operations.js';
import {
  auditCrestodianOperation,
  getRecentAuditEntries,
  getAuditEntriesByOperation,
  getAuditEntriesByStatus,
  getAuditSummary,
  formatAuditEntry,
  clearAuditLog,
} from '../audit.js';
import {
  createRescueMessage,
  getRescueMessages,
  acknowledgeRescueMessage,
  acknowledgeAllRescueMessages,
  checkRescueConditions,
  triggerRescue,
  clearRescueMessages,
} from '../rescue-message.js';
import {
  getDefaultRescuePolicy,
  validateRescuePolicy,
  normalizeRescuePolicy,
  shouldTriggerRescue,
  getRescueAction,
  formatRescuePolicy,
} from '../rescue-policy.js';
import { Crestodian, getCrestodian, startCrestodian, stopCrestodian } from '../crestodian.js';
import { planCrestodianCommand, formatAssistantPlan } from '../assistant.js';
import type { CrestodianProbeResult, CrestodianRescuePolicy } from '../types.js';

describe('crestodian > probes', () => {
  it('returns default probes', () => {
    const probes = getDefaultProbes();
    expect(probes.length).toBeGreaterThan(0);
    expect(probes.some((p) => p.name === 'memory')).toBe(true);
  });

  it('runs default probes', async () => {
    const results = await runProbes(getDefaultProbes());
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('status');
    expect(results[0]).toHaveProperty('message');
    expect(results[0]).toHaveProperty('durationMs');
  });

  it('skips disabled probes', async () => {
    const probe: CrestodianProbe = {
      name: 'disabled',
      description: 'disabled probe',
      category: 'test',
      enabled: false,
      check: async () => ({ status: 'healthy', message: 'ok' }),
    };
    const results = await runProbes([probe]);
    expect(results).toHaveLength(0);
  });

  it('registers and retrieves custom probes', () => {
    const probe: CrestodianProbe = {
      name: 'custom',
      description: 'custom probe',
      category: 'test',
      check: async () => ({ status: 'healthy', message: 'ok' }),
    };
    registerProbe(probe);
    expect(getProbeByName('custom', getRegisteredProbes())).toBeDefined();
  });

  it('handles probe failures gracefully', async () => {
    const probe: CrestodianProbe = {
      name: 'failing',
      description: 'failing probe',
      category: 'test',
      check: async () => {
        throw new Error('probe error');
      },
    };
    const results = await runProbes([probe]);
    expect(results[0].status).toBe('critical');
    expect(results[0].message).toContain('probe error');
  });
});

describe('crestodian > overview', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  afterEach(() => {
    clearAuditLog();
  });

  it('loads an overview with probe results', async () => {
    const overview = await loadCrestodianOverview();
    expect(overview.status).toBeDefined();
    expect(overview.summary.total).toBeGreaterThan(0);
    expect(overview.probes.length).toBeGreaterThan(0);
  });

  it('formats overview with all statuses', () => {
    const overview = {
      id: 'test',
      generatedAt: new Date().toISOString(),
      status: 'degraded' as const,
      version: '1.0.0',
      platform: 'darwin',
      uptimeMs: 3661000,
      probes: [
        { name: 'memory', status: 'healthy' as const, message: 'ok', durationMs: 1, timestamp: 't' },
        { name: 'disk', status: 'degraded' as const, message: 'slow', durationMs: 1, timestamp: 't' },
      ],
      summary: { total: 2, healthy: 1, degraded: 1, critical: 0 },
      recentOperations: [],
      activeRescues: 0,
    };
    const formatted = formatCrestodianOverview(overview);
    expect(formatted).toContain('DEGRADED');
    expect(formatted).toContain('memory');
    expect(formatted).toContain('disk');
  });
});

describe('crestodian > operations', () => {
  it('executes inspect operation', async () => {
    const result = await executeCrestodianOperation('inspect');
    expect(result.success).toBe(true);
    expect(result.operation).toBe('inspect');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('requires approval for destructive operations', async () => {
    const repair = await executeCrestodianOperation('repair');
    expect(repair.success).toBe(true);
    expect(repair.message).toContain('requires approval');

    const approvedRepair = await executeCrestodianOperation('repair', { approved: true });
    expect(approvedRepair.message).toContain('completed');
  });

  it('resolves operation from text', () => {
    expect(resolveOperationFromText('check system health')).toBe('inspect');
    expect(resolveOperationFromText('fix the issue')).toBe('repair');
    expect(resolveOperationFromText('unknown request')).toBeNull();
  });

  it('identifies persistent operations', () => {
    expect(isPersistentCrestodianOperation('backup')).toBe(true);
    expect(isPersistentCrestodianOperation('inspect')).toBe(false);
  });

  it('returns operation descriptions', () => {
    expect(getOperationDescription('restart')).toContain('Restart');
  });
});

describe('crestodian > audit', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  afterEach(() => {
    clearAuditLog();
  });

  it('records and retrieves audit entries', () => {
    auditCrestodianOperation({
      operation: 'inspect',
      status: 'completed',
      initiator: 'user',
      message: 'inspection done',
    });
    const entries = getRecentAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('inspect');
  });

  it('limits recent entries', () => {
    for (let i = 0; i < 5; i++) {
      auditCrestodianOperation({
        operation: 'inspect',
        status: 'completed',
        initiator: 'user',
        message: `run ${i}`,
      });
    }
    expect(getRecentAuditEntries(2)).toHaveLength(2);
  });

  it('filters by operation and status', () => {
    auditCrestodianOperation({ operation: 'repair', status: 'started', initiator: 'system', message: 'r' });
    auditCrestodianOperation({ operation: 'repair', status: 'completed', initiator: 'system', message: 'r' });
    auditCrestodianOperation({ operation: 'inspect', status: 'completed', initiator: 'user', message: 'i' });
    expect(getAuditEntriesByOperation('repair')).toHaveLength(2);
    expect(getAuditEntriesByStatus('completed')).toHaveLength(2);
  });

  it('computes audit summary', () => {
    auditCrestodianOperation({ operation: 'inspect', status: 'completed', initiator: 'user', message: 'i' });
    auditCrestodianOperation({ operation: 'repair', status: 'failed', initiator: 'system', message: 'r' });
    const summary = getAuditSummary();
    expect(summary.total).toBe(2);
    expect(summary.byOperation.inspect).toBe(1);
    expect(summary.byStatus.completed).toBe(1);
    expect(summary.successRate).toBe(0.5);
  });

  it('formats an audit entry', () => {
    const entry = auditCrestodianOperation({
      operation: 'inspect',
      status: 'completed',
      initiator: 'user',
      message: 'done',
      durationMs: 42,
    });
    const formatted = formatAuditEntry(entry);
    expect(formatted).toContain('INSPECT');
    expect(formatted).toContain('completed');
    expect(formatted).toContain('42ms');
  });
});

describe('crestodian > rescue policy', () => {
  it('provides a default policy', () => {
    const policy = getDefaultRescuePolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.rules.length).toBeGreaterThan(0);
  });

  it('validates policies', () => {
    expect(validateRescuePolicy(getDefaultRescuePolicy())).toBe(true);
    expect(validateRescuePolicy({})).toBe(false);
  });

  it('normalizes partial policies', () => {
    const normalized = normalizeRescuePolicy({ autoRecover: true });
    expect(normalized.enabled).toBe(true);
    expect(normalized.autoRecover).toBe(true);
  });

  it('determines when to trigger rescue', () => {
    const policy = getDefaultRescuePolicy();
    expect(shouldTriggerRescue({ probeName: 'memory', severity: 'warning', policy })).toBe(true);
    expect(shouldTriggerRescue({ probeName: 'memory', severity: 'info', policy })).toBe(false);
    expect(shouldTriggerRescue({ probeName: 'unknown', severity: 'critical', policy })).toBe(false);
  });

  it('returns rescue actions', () => {
    const policy = getDefaultRescuePolicy();
    expect(getRescueAction({ probeName: 'memory', severity: 'warning', policy })).toBe('repair');
    expect(getRescueAction({ probeName: 'unknown', severity: 'critical', policy })).toBeNull();
  });

  it('formats rescue policy', () => {
    const formatted = formatRescuePolicy(getDefaultRescuePolicy());
    expect(formatted).toContain('Rescue Policy');
    expect(formatted).toContain('memory');
  });
});

describe('crestodian > rescue messages', () => {
  beforeEach(() => {
    clearRescueMessages();
    clearAuditLog();
  });

  afterEach(() => {
    clearRescueMessages();
    clearAuditLog();
  });

  it('creates and retrieves rescue messages', () => {
    const msg = createRescueMessage({ severity: 'warning', title: 't', message: 'm' });
    expect(msg.acknowledged).toBe(false);
    expect(getRescueMessages()).toHaveLength(1);
  });

  it('acknowledges a rescue message', () => {
    const msg = createRescueMessage({ severity: 'warning', title: 't', message: 'm' });
    expect(acknowledgeRescueMessage(msg.id)).toBe(true);
    expect(acknowledgeRescueMessage('unknown')).toBe(false);
  });

  it('acknowledges all rescue messages', () => {
    createRescueMessage({ severity: 'warning', title: 't1', message: 'm1' });
    createRescueMessage({ severity: 'critical', title: 't2', message: 'm2' });
    expect(acknowledgeAllRescueMessages()).toBe(2);
  });

  it('checks rescue conditions against probe results', async () => {
    const policy: CrestodianRescuePolicy = {
      ...getDefaultRescuePolicy(),
      autoRecover: true,
    };
    const results: CrestodianProbeResult[] = [
      { name: 'memory', status: 'critical', message: 'oom', durationMs: 1, timestamp: 't' },
      { name: 'uptime', status: 'healthy', message: 'ok', durationMs: 1, timestamp: 't' },
    ];
    const messages = await checkRescueConditions(results, policy);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].severity).toBe('critical');
  });

  it('returns empty messages when policy is disabled', async () => {
    const policy: CrestodianRescuePolicy = { ...getDefaultRescuePolicy(), enabled: false };
    const results: CrestodianProbeResult[] = [
      { name: 'memory', status: 'critical', message: 'oom', durationMs: 1, timestamp: 't' },
    ];
    const messages = await checkRescueConditions(results, policy);
    expect(messages).toHaveLength(0);
  });

  it('triggers auto-recovery when enabled', async () => {
    const msg = createRescueMessage({
      severity: 'critical',
      title: 't',
      message: 'm',
      suggestedAction: 'repair',
      autoRecoverable: true,
    });
    const policy: CrestodianRescuePolicy = { ...getDefaultRescuePolicy(), autoRecover: true };
    const result = await triggerRescue(msg, policy);
    expect(result.success).toBe(true);
  });

  it('refuses auto-recovery when disabled', async () => {
    const msg = createRescueMessage({
      severity: 'critical',
      title: 't',
      message: 'm',
      suggestedAction: 'repair',
      autoRecoverable: true,
    });
    const policy: CrestodianRescuePolicy = { ...getDefaultRescuePolicy(), autoRecover: false };
    const result = await triggerRescue(msg, policy);
    expect(result.success).toBe(false);
  });
});

describe('crestodian > Crestodian class', () => {
  let instance: Crestodian;

  beforeEach(() => {
    clearAuditLog();
    clearRescueMessages();
    instance = new Crestodian();
  });

  afterEach(() => {
    instance.stop();
    clearAuditLog();
    clearRescueMessages();
  });

  it('starts and stops', () => {
    expect(instance.isRunning()).toBe(false);
    instance.start();
    expect(instance.isRunning()).toBe(true);
    instance.stop();
    expect(instance.isRunning()).toBe(false);
  });

  it('loads overview', async () => {
    const overview = await instance.getOverview();
    expect(overview.probes.length).toBeGreaterThan(0);
    expect(overview.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('runs a specific probe', async () => {
    const result = await instance.runProbe('memory');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('memory');
  });

  it('returns null for unknown probe', async () => {
    const result = await instance.runProbe('nonexistent');
    expect(result).toBeNull();
  });

  it('executes an operation with audit trail', async () => {
    const result = await instance.executeOperation('inspect');
    expect(result.success).toBe(true);
    expect(instance.getAuditHistory().length).toBeGreaterThan(0);
  });

  it('manages rescue policy', () => {
    instance.setRescuePolicy({ autoRecover: true });
    expect(instance.getRescuePolicy().autoRecover).toBe(true);
  });

  it('tracks uptime after start', () => {
    instance.start();
    expect(instance.getUptimeMs()).toBeGreaterThanOrEqual(0);
  });

  it('registers custom probes', async () => {
    instance.registerProbe({
      name: 'custom-class',
      description: 'custom',
      category: 'test',
      check: async () => ({ status: 'healthy', message: 'ok' }),
    });
    const result = await instance.runProbe('custom-class');
    expect(result?.status).toBe('healthy');
  });
});

describe('crestodian > assistant planner', () => {
  it('plans a command from input', async () => {
    const plan = await planCrestodianCommand({ input: 'restart the service', overview: buildDummyOverview() });
    expect(plan).not.toBeNull();
    expect(plan?.operation).toBe('restart');
    expect(plan?.confidence).toBeGreaterThan(0);
  });

  it('returns null for empty input', async () => {
    const plan = await planCrestodianCommand({ input: '', overview: buildDummyOverview() });
    expect(plan).toBeNull();
  });

  it('formats a plan', async () => {
    const plan = await planCrestodianCommand({ input: 'backup data', overview: buildDummyOverview() });
    expect(plan).not.toBeNull();
    const formatted = formatAssistantPlan(plan!);
    expect(formatted).toContain('Operation: backup');
    expect(formatted).toContain('Steps:');
  });
});

function buildDummyOverview() {
  return {
    id: 'dummy',
    generatedAt: new Date().toISOString(),
    status: 'healthy' as const,
    version: '1.0.0',
    platform: 'darwin',
    uptimeMs: 0,
    probes: [],
    summary: { total: 0, healthy: 0, degraded: 0, critical: 0 },
    recentOperations: [],
    activeRescues: 0,
  };
}

describe('crestodian > singleton lifecycle', () => {
  beforeEach(() => {
    stopCrestodian();
    clearAuditLog();
  });

  afterEach(() => {
    stopCrestodian();
    clearAuditLog();
  });

  it('exports singleton helpers', () => {
    expect(getCrestodian()).toBeInstanceOf(Crestodian);
    startCrestodian();
    expect(getCrestodian().isRunning()).toBe(true);
    stopCrestodian();
    expect(getCrestodian().isRunning()).toBe(false);
  });
});
