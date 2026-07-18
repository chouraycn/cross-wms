import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';

export type NodeInvokePolicyContext = {
  nodeId: string;
  command: string;
  params: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
  config?: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
};

export type NodeInvokePolicyResult = {
  ok: boolean;
  decision: 'allow' | 'deny' | 'review';
  reason?: string;
  code?: string;
  modifiedParams?: unknown;
  modifiedTimeoutMs?: number;
};

export type NodeInvokePolicyHandler = (
  context: NodeInvokePolicyContext,
) => Promise<NodeInvokePolicyResult> | NodeInvokePolicyResult;

export type NodeInvokePolicyRegistration = {
  id: string;
  pluginId: string;
  commands: string[];
  handler: NodeInvokePolicyHandler;
  priority: number;
  enabled: boolean;
};

const policyRegistry = new Map<string, NodeInvokePolicyRegistration>();

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function registerNodeInvokePolicy(params: {
  pluginId: string;
  commands: string[];
  handler: NodeInvokePolicyHandler;
  priority?: number;
  enabled?: boolean;
}): string {
  const id = `policy-${randomUUID()}`;
  const normalizedCommands = params.commands
    .map((cmd) => normalizeOptionalString(cmd))
    .filter((cmd): cmd is string => cmd !== null);

  const registration: NodeInvokePolicyRegistration = {
    id,
    pluginId: params.pluginId,
    commands: normalizedCommands,
    handler: params.handler,
    priority: params.priority ?? 0,
    enabled: params.enabled ?? true,
  };

  policyRegistry.set(id, registration);
  logger.info(`[Gateway] Node invoke policy registered: ${params.pluginId} (${normalizedCommands.length} commands)`);
  return id;
}

export function unregisterNodeInvokePolicy(policyId: string): boolean {
  const existed = policyRegistry.has(policyId);
  if (existed) {
    policyRegistry.delete(policyId);
    logger.debug(`[Gateway] Node invoke policy unregistered: ${policyId}`);
  }
  return existed;
}

export function unregisterPluginNodeInvokePolicies(pluginId: string): number {
  let removed = 0;
  for (const [id, policy] of policyRegistry) {
    if (policy.pluginId === pluginId) {
      policyRegistry.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    logger.debug(`[Gateway] Unregistered ${removed} node invoke policies for plugin: ${pluginId}`);
  }
  return removed;
}

export function listNodeInvokePolicies(): NodeInvokePolicyRegistration[] {
  return Array.from(policyRegistry.values()).sort((a, b) => b.priority - a.priority);
}

export function getNodeInvokePolicy(policyId: string): NodeInvokePolicyRegistration | undefined {
  return policyRegistry.get(policyId);
}

export function setNodeInvokePolicyEnabled(policyId: string, enabled: boolean): boolean {
  const policy = policyRegistry.get(policyId);
  if (!policy) {
    return false;
  }
  policy.enabled = enabled;
  return true;
}

function findMatchingPolicies(command: string): NodeInvokePolicyRegistration[] {
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {
    return [];
  }

  return listNodeInvokePolicies().filter(
    (policy) =>
      policy.enabled &&
      policy.commands.some(
        (cmd) => cmd === '*' || cmd === normalizedCommand || normalizedCommand.startsWith(`${cmd}:`),
      ),
  );
}

export async function applyPluginNodeInvokePolicy(params: {
  nodeId: string;
  command: string;
  params: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
  config?: Record<string, unknown>;
}): Promise<NodeInvokePolicyResult | null> {
  const matchingPolicies = findMatchingPolicies(params.command);

  if (matchingPolicies.length === 0) {
    return null;
  }

  const currentContext: NodeInvokePolicyContext = {
    nodeId: params.nodeId,
    command: params.command,
    params: params.params,
    timeoutMs: params.timeoutMs,
    idempotencyKey: params.idempotencyKey,
    config: params.config,
  };

  for (const policy of matchingPolicies) {
    try {
      const result = await policy.handler(currentContext);

      if (!result.ok) {
        logger.warn(
          `[Gateway] Node invoke policy denied: ${policy.pluginId} - ${params.command} - ${result.reason ?? 'unknown reason'}`,
        );
        return result;
      }

      if (result.decision === 'deny') {
        return result;
      }

      if (result.modifiedParams !== undefined) {
        currentContext.params = result.modifiedParams;
      }
      if (result.modifiedTimeoutMs !== undefined) {
        currentContext.timeoutMs = result.modifiedTimeoutMs;
      }
    } catch (err) {
      logger.error(
        `[Gateway] Node invoke policy error: ${policy.pluginId} - ${params.command}`,
        err,
      );
      return {
        ok: false,
        decision: 'deny',
        reason: `Policy execution error: ${err instanceof Error ? err.message : String(err)}`,
        code: 'POLICY_EXECUTION_ERROR',
      };
    }
  }

  return {
    ok: true,
    decision: 'allow',
    modifiedParams: currentContext.params,
    modifiedTimeoutMs: currentContext.timeoutMs,
  };
}

export function hasDangerousCommandPolicy(command: string): boolean {
  const matchingPolicies = findMatchingPolicies(command);
  return matchingPolicies.length > 0;
}

export function clearNodeInvokePolicies(): void {
  policyRegistry.clear();
  logger.info('[Gateway] All node invoke policies cleared');
}
