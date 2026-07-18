/**
 * Subagent Spawn — 子代理生成器
 *
 * 负责创建新的子代理会话、处理上下文传递、模型选择和线程绑定。
 */

import crypto from 'node:crypto';
import { logger } from '../../logger.js';
import { getSubagentRegistry, type SubagentDefinition } from '../subagentRegistry.js';
import { resolveSubagentCapabilities } from './subagent-capabilities.js';
import {
  SUBAGENT_SPAWN_MODES,
  SUBAGENT_SPAWN_CONTEXT_MODES,
  SUBAGENT_SPAWN_SANDBOX_MODES,
  type SpawnOptions,
  type SpawnContext,
  type SpawnResult,
  type SpawnSubagentMode,
  type SpawnSubagentContextMode,
  type SpawnSubagentSandboxMode,
} from './subagent-spawn.types.js';

const DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH = 5;
const DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT = 10;
const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000;

function generateInstanceId(): string {
  return `subagent_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateChildSessionKey(agentId: string): string {
  return `agent:${agentId}:subagent:${crypto.randomUUID()}`;
}

function normalizeTaskName(taskName?: string): { taskName?: string; error?: string } {
  if (!taskName) return {};
  const trimmed = taskName.trim();
  if (trimmed.length === 0) return {};
  if (trimmed.length > 128) {
    return { error: 'taskName must be 128 characters or less' };
  }
  return { taskName: trimmed };
}

function resolveSpawnMode(params: {
  requestedMode?: SpawnSubagentMode;
  threadRequested: boolean;
}): SpawnSubagentMode {
  if (params.requestedMode && SUBAGENT_SPAWN_MODES.includes(params.requestedMode)) {
    return params.requestedMode;
  }
  return params.threadRequested ? 'session' : 'run';
}

function resolveContextMode(params: {
  requestedContext?: SpawnSubagentContextMode;
  threadRequested: boolean;
}): SpawnSubagentContextMode {
  if (params.requestedContext && SUBAGENT_SPAWN_CONTEXT_MODES.includes(params.requestedContext)) {
    return params.requestedContext;
  }
  return 'isolated';
}

function resolveSandboxMode(params: {
  requestedSandbox?: SpawnSubagentSandboxMode;
}): SpawnSubagentSandboxMode {
  if (params.requestedSandbox && SUBAGENT_SPAWN_SANDBOX_MODES.includes(params.requestedSandbox)) {
    return params.requestedSandbox;
  }
  return 'inherit';
}

function getParentDepth(parentSessionKey?: string): number {
  if (!parentSessionKey) return 0;
  const match = parentSessionKey.match(/:subagent:/g);
  return match ? match.length : 0;
}

function countActiveChildren(parentSessionKey: string): number {
  const registry = getSubagentRegistry();
  const instances = registry.listInstances({ parentSessionKey });
  return instances.filter(
    (i) => i.status === 'running' || i.status === 'spawning' || i.status === 'paused',
  ).length;
}

function findAgentDefinition(agentId?: string): SubagentDefinition | undefined {
  const registry = getSubagentRegistry();
  if (agentId) {
    return registry.getDefinition(agentId);
  }
  const defaults = registry.listDefinitions({ enabled: true });
  return defaults[0];
}

export async function spawnSubagent(
  options: SpawnOptions,
  context: SpawnContext = {},
): Promise<SpawnResult> {
  const task = options.task;
  const taskNameResult = normalizeTaskName(options.taskName);
  if (taskNameResult.error) {
    return { status: 'error', error: taskNameResult.error };
  }
  const taskName = taskNameResult.taskName;
  const label = options.label?.trim() || '';
  const requestThreadBinding = options.thread === true;
  const sandboxMode = resolveSandboxMode({ requestedSandbox: options.sandbox });
  const spawnMode = resolveSpawnMode({
    requestedMode: options.mode,
    threadRequested: requestThreadBinding,
  });
  const contextMode = resolveContextMode({
    requestedContext: options.context,
    threadRequested: requestThreadBinding,
  });

  if (spawnMode === 'session' && !requestThreadBinding) {
    return {
      status: 'error',
      error:
        'mode="session" requires thread=true so the subagent can stay bound to a channel thread.',
    };
  }

  const cleanup =
    spawnMode === 'session'
      ? 'keep'
      : options.cleanup === 'keep' || options.cleanup === 'delete'
        ? options.cleanup
        : 'keep';

  const parentSessionKey = context.parentSessionKey || context.agentSessionKey;
  const callerDepth = getParentDepth(parentSessionKey);
  const maxSpawnDepth = DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH;

  if (callerDepth >= maxSpawnDepth) {
    return {
      status: 'forbidden',
      error: `spawn is not allowed at this depth (current depth: ${callerDepth}, max: ${maxSpawnDepth})`,
    };
  }

  const maxChildren = DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT;
  if (parentSessionKey) {
    const activeChildren = countActiveChildren(parentSessionKey);
    if (activeChildren >= maxChildren) {
      return {
        status: 'forbidden',
        error: `has reached max active children for this session (${activeChildren}/${maxChildren})`,
      };
    }
  }

  const definition = findAgentDefinition(options.agentId);
  if (!definition) {
    return {
      status: 'error',
      error: `Agent definition not found: ${options.agentId || 'default'}`,
    };
  }

  if (!definition.enabled) {
    return {
      status: 'forbidden',
      error: `Agent definition is disabled: ${definition.id}`,
    };
  }

  const capabilities = resolveSubagentCapabilities({
    depth: callerDepth + 1,
    maxSpawnDepth,
  });

  const instanceId = generateInstanceId();
  const childSessionKey = generateChildSessionKey(definition.id);
  const runId = crypto.randomUUID();
  const timeoutMs = options.runTimeoutSeconds
    ? options.runTimeoutSeconds * 1000
    : definition.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS;

  const registry = getSubagentRegistry();

  try {
    const spawnResult = await registry.spawn({
      definitionId: definition.id,
      taskDescription: task,
      sessionKey: childSessionKey,
      parentSessionKey,
      input: {
        task,
        label,
        taskName,
        contextMode,
        sandboxMode,
        cleanup,
        lightContext: options.lightContext,
        expectsCompletionMessage: options.expectsCompletionMessage,
        ...options.metadata,
      },
      metadata: {
        instanceId,
        runId,
        spawnMode,
        contextMode,
        sandboxMode,
        cleanup,
        label,
        taskName,
        childDepth: callerDepth + 1,
        role: capabilities.role,
        controlScope: capabilities.controlScope,
        model: options.model,
        thinking: options.thinking,
        cwd: options.cwd,
        workspaceDir: context.workspaceDir,
        inheritedToolAllowlist: context.inheritedToolAllowlist,
        inheritedToolDenylist: context.inheritedToolDenylist,
      },
      timeoutMs,
    });

    logger.info(
      `[SubagentSpawn] Spawned subagent ${instanceId} (${definition.name}) ` +
        `for parent ${parentSessionKey || 'root'}, mode=${spawnMode}`,
    );

    return {
      status: 'accepted',
      instanceId,
      childSessionKey,
      runId,
      mode: spawnMode,
      taskName,
      note: label || undefined,
      resolvedModel: options.model,
      modelApplied: Boolean(options.model),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[SubagentSpawn] Spawn failed: ${errorMessage}`);
    return {
      status: 'error',
      error: errorMessage,
    };
  }
}

export function validateSpawnOptions(options: unknown): {
  success: boolean;
  data?: SpawnOptions;
  error?: string;
} {
  try {
    const { SpawnOptionsSchema } = require('./subagent-spawn.types.js');
    const result = SpawnOptionsSchema.safeParse(options);
    if (!result.success) {
      return {
        success: false,
        error: result.error.issues.map((i: { message: string }) => i.message).join(', '),
      };
    }
    return { success: true, data: result.data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export {
  SUBAGENT_SPAWN_MODES,
  SUBAGENT_SPAWN_CONTEXT_MODES,
  SUBAGENT_SPAWN_SANDBOX_MODES,
  DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH,
  DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT,
};
