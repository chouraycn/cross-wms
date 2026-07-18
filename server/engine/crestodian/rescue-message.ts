import { randomUUID } from 'node:crypto';
export type { CrestodianRescueMessage } from './types.js';
import type {
  CrestodianRescueMessage,
  CrestodianSeverity,
  CrestodianProbeResult,
  CrestodianRescuePolicy,
} from './types.js';
import { executeCrestodianOperation } from './operations.js';
import { auditCrestodianOperation } from './audit.js';

const rescueMessages: CrestodianRescueMessage[] = [];
const MAX_RESCUE_MESSAGES = 100;

export function createRescueMessage(params: {
  severity: CrestodianSeverity;
  title: string;
  message: string;
  probeName?: string;
  suggestedAction?: string;
  autoRecoverable?: boolean;
}): CrestodianRescueMessage {
  const msg: CrestodianRescueMessage = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    severity: params.severity,
    title: params.title,
    message: params.message,
    probeName: params.probeName,
    suggestedAction: params.suggestedAction,
    acknowledged: false,
    autoRecoverable: params.autoRecoverable ?? false,
  };

  rescueMessages.push(msg);
  if (rescueMessages.length > MAX_RESCUE_MESSAGES) {
    rescueMessages.shift();
  }

  return msg;
}

export function getRescueMessages(limit?: number): CrestodianRescueMessage[] {
  const messages = [...rescueMessages].reverse();
  if (limit && limit < messages.length) {
    return messages.slice(0, limit);
  }
  return messages;
}

export function getActiveRescueMessages(): CrestodianRescueMessage[] {
  return rescueMessages.filter((m) => !m.acknowledged);
}

export function acknowledgeRescueMessage(id: string): boolean {
  const msg = rescueMessages.find((m) => m.id === id);
  if (msg) {
    msg.acknowledged = true;
    return true;
  }
  return false;
}

export function acknowledgeAllRescueMessages(): number {
  let count = 0;
  for (const msg of rescueMessages) {
    if (!msg.acknowledged) {
      msg.acknowledged = true;
      count++;
    }
  }
  return count;
}

export async function checkRescueConditions(
  probeResults: CrestodianProbeResult[],
  policy: CrestodianRescuePolicy,
): Promise<CrestodianRescueMessage[]> {
  const newMessages: CrestodianRescueMessage[] = [];

  if (!policy.enabled) {
    return newMessages;
  }

  for (const result of probeResults) {
    if (result.status === 'healthy') {
      continue;
    }

    const severity: CrestodianSeverity = result.status === 'critical' ? 'critical' : 'warning';
    const rule = policy.rules.find((r) => r.probeName === result.name && r.enabled);

    if (rule || result.status === 'critical') {
      const msg = createRescueMessage({
        severity,
        title: `${result.name} ${result.status}`,
        message: result.message,
        probeName: result.name,
        suggestedAction: rule?.action ?? 'repair',
        autoRecoverable: policy.autoRecover && (rule?.enabled ?? result.status === 'critical'),
      });
      newMessages.push(msg);
    }
  }

  return newMessages;
}

export async function triggerRescue(
  message: CrestodianRescueMessage,
  policy: CrestodianRescuePolicy,
): Promise<{ success: boolean; message: string }> {
  if (!message.suggestedAction) {
    return { success: false, message: 'No suggested action available' };
  }

  if (!message.autoRecoverable || !policy.autoRecover) {
    return { success: false, message: 'Auto-recovery not enabled' };
  }

  const auditEntry = auditCrestodianOperation({
    operation: 'repair',
    status: 'started',
    initiator: 'automatic',
    message: `Auto-recovery triggered for ${message.probeName ?? 'unknown'}: ${message.title}`,
    details: { rescueMessageId: message.id },
  });

  try {
    const result = await executeCrestodianOperation('repair', { approved: true });
    auditCrestodianOperation({
      ...auditEntry,
      status: result.success ? 'completed' : 'failed',
      message: result.message,
      durationMs: result.durationMs,
      error: result.error,
    });
    return {
      success: result.success,
      message: result.message,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    auditCrestodianOperation({
      ...auditEntry,
      status: 'failed',
      message: `Rescue failed: ${error}`,
      error,
    });
    return {
      success: false,
      message: error,
    };
  }
}

export function clearRescueMessages(): void {
  rescueMessages.length = 0;
}
