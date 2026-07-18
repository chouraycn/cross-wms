import {
  runProbes,
  registerProbe,
  getDefaultProbes,
  type CrestodianProbe,
} from './probes.js';
import {
  loadCrestodianOverview,
  formatCrestodianOverview,
  type CrestodianOverview,
} from './overview.js';
import {
  executeCrestodianOperation,
  type CrestodianOperationResult,
  type CrestodianOperationType,
} from './operations.js';
import {
  auditCrestodianOperation,
  getRecentAuditEntries,
  type CrestodianAuditEntry,
} from './audit.js';
import {
  checkRescueConditions,
  triggerRescue,
  type CrestodianRescueMessage,
} from './rescue-message.js';
import { getDefaultRescuePolicy, type CrestodianRescuePolicy } from './rescue-policy.js';
import { type CrestodianStatus } from './types.js';

class Crestodian {
  private started = false;
  private startTime = Date.now();
  private probes: CrestodianProbe[] = [];
  private rescuePolicy: CrestodianRescuePolicy;
  private status: CrestodianStatus = 'unknown';
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.rescuePolicy = getDefaultRescuePolicy();
    this.probes = getDefaultProbes();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.startTime = Date.now();
    this.startHeartbeat();
  }

  stop(): void {
    this.started = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      void this.heartbeat();
    }, 30000);
    this.heartbeatInterval.unref?.();
  }

  private async heartbeat(): Promise<void> {
    try {
      const results = await runProbes(this.probes);
      const criticalCount = results.filter((r) => r.status === 'critical').length;
      const degradedCount = results.filter((r) => r.status === 'degraded').length;

      if (criticalCount > 0) {
        this.status = 'critical';
      } else if (degradedCount > 0) {
        this.status = 'degraded';
      } else {
        this.status = 'healthy';
      }

      if (this.rescuePolicy.enabled && this.rescuePolicy.autoRecover) {
        await checkRescueConditions(results, this.rescuePolicy);
      }
    } catch {
      this.status = 'unknown';
    }
  }

  async getOverview(): Promise<CrestodianOverview> {
    return loadCrestodianOverview({
      probes: this.probes,
      uptimeMs: Date.now() - this.startTime,
    });
  }

  formatOverview(overview: CrestodianOverview): string {
    return formatCrestodianOverview(overview);
  }

  async runProbe(name: string): Promise<{
    name: string;
    status: CrestodianStatus;
    message: string;
  } | null> {
    const probe = this.probes.find((p) => p.name === name);
    if (!probe) return null;
    const result = await probe.check();
    return {
      name: probe.name,
      status: result.status,
      message: result.message,
    };
  }

  async runAllProbes(): Promise<CrestodianOverview> {
    return this.getOverview();
  }

  async executeOperation(
    operation: CrestodianOperationType,
    options?: { initiator?: 'system' | 'user' | 'automatic'; approved?: boolean },
  ): Promise<CrestodianOperationResult> {
    const auditEntry = auditCrestodianOperation({
      operation,
      status: 'started',
      initiator: options?.initiator ?? 'user',
      message: `Starting ${operation} operation`,
    });

    try {
      const result = await executeCrestodianOperation(operation);
      auditCrestodianOperation({
        ...auditEntry,
        status: result.success ? 'completed' : 'failed',
        message: result.message,
        durationMs: result.durationMs,
        error: result.error,
      });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      auditCrestodianOperation({
        ...auditEntry,
        status: 'failed',
        message: `Operation failed: ${error}`,
        error,
      });
      return {
        success: false,
        operation,
        message: `Operation failed: ${error}`,
        durationMs: 0,
        error,
      };
    }
  }

  getAuditHistory(limit?: number): CrestodianAuditEntry[] {
    return getRecentAuditEntries(limit);
  }

  registerProbe(probe: CrestodianProbe): void {
    this.probes.push(probe);
  }

  getRescuePolicy(): CrestodianRescuePolicy {
    return { ...this.rescuePolicy };
  }

  setRescuePolicy(policy: Partial<CrestodianRescuePolicy>): void {
    this.rescuePolicy = { ...this.rescuePolicy, ...policy };
  }

  getStatus(): CrestodianStatus {
    return this.status;
  }

  getUptimeMs(): number {
    return Date.now() - this.startTime;
  }

  async triggerRescue(message: CrestodianRescueMessage): Promise<void> {
    await triggerRescue(message, this.rescuePolicy);
  }

  isRunning(): boolean {
    return this.started;
  }
}

export const crestodian = new Crestodian();

export function startCrestodian(): void {
  crestodian.start();
}

export function stopCrestodian(): void {
  crestodian.stop();
}

export function getCrestodian(): Crestodian {
  return crestodian;
}

export { Crestodian };
