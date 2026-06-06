/**
 * Chain Executor Service
 *
 * Executes skill chains sequentially, with SSE broadcasting, abort support,
 * retry logic, and timeout handling. Singleton pattern using module-level state.
 *
 * First version (v1): Simulated execution — nodes are marked success/failure
 * for orchestration validation, no actual skill execution performed.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import {
  initDb,
  getSkillChain,
  getChainNodes,
  createSkillExecution,
  updateSkillExecution,
} from '../db';
import type { SkillChainNodeRow } from '../db';

// ===================== Module-Level State =====================

/** Map of executionId → Set of SSE response clients */
const sseClients = new Map<string, Set<Response>>();

/** Map of executionId → abort flag */
const abortSignals = new Map<string, boolean>();

// ===================== SSE Broadcasting =====================

/**
 * Broadcast an SSE event to all clients watching a specific execution.
 */
function broadcast(execId: string, event: Record<string, unknown>): void {
  const clients = sseClients.get(execId);
  if (!clients || clients.size === 0) {
    return;
  }
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    if (res.writable) {
      try {
        res.write(data);
      } catch {
        // Client disconnected, will be cleaned up on 'close' event
      }
    }
  }
}

// ===================== Public API =====================

/**
 * Register an SSE response client for a specific execution.
 */
export function addClient(execId: string, res: Response): void {
  if (!sseClients.has(execId)) {
    sseClients.set(execId, new Set());
  }
  sseClients.get(execId)!.add(res);
}

/**
 * Remove an SSE response client.
 */
export function removeClient(execId: string, res: Response): void {
  const clients = sseClients.get(execId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      sseClients.delete(execId);
    }
  }
}

/**
 * Signal abort for a running execution.
 * The executor checks this flag before each node.
 */
export function abortExecution(execId: string): void {
  abortSignals.set(execId, true);
  broadcast(execId, {
    type: 'chain-aborted',
    executionId: execId,
    timestamp: new Date().toISOString(),
  });
}

// ===================== Context Builder =====================

/**
 * Build the input context for a node based on the previous node's output
 * and the node's dataPassMode setting.
 */
function buildNodeInput(
  context: Record<string, unknown>,
  node: SkillChainNodeRow,
  previousOutput: unknown
): Record<string, unknown> {
  const dataPassMode = node.data_pass_mode || 'full';

  if (dataPassMode === 'full') {
    // Pass the entire previous output
    return { previousOutput, ...context };
  }

  if (dataPassMode === 'fields') {
    // Pass only selected fields from previous output
    let selectedFields: string[] = [];
    try {
      selectedFields = JSON.parse(node.selected_fields || '[]');
    } catch {
      selectedFields = [];
    }
    if (selectedFields.length === 0) {
      return { ...context };
    }
    const filteredOutput: Record<string, unknown> = {};
    if (previousOutput && typeof previousOutput === 'object' && !Array.isArray(previousOutput)) {
      const prevObj = previousOutput as Record<string, unknown>;
      for (const field of selectedFields) {
        if (field in prevObj) {
          filteredOutput[field] = prevObj[field];
        }
      }
    }
    return { ...context, previousOutput: filteredOutput };
  }

  if (dataPassMode === 'custom') {
    // Use custom mapping
    let customMapping: Record<string, string> = {};
    try {
      customMapping = JSON.parse(node.custom_mapping || '{}');
    } catch {
      customMapping = {};
    }
    const mappedOutput: Record<string, unknown> = {};
    if (previousOutput && typeof previousOutput === 'object' && !Array.isArray(previousOutput)) {
      const prevObj = previousOutput as Record<string, unknown>;
      for (const [targetKey, sourceKey] of Object.entries(customMapping)) {
        if (sourceKey in prevObj) {
          mappedOutput[targetKey] = prevObj[sourceKey];
        }
      }
    }
    return { ...context, previousOutput: mappedOutput };
  }

  // Default: full pass
  return { previousOutput, ...context };
}

// ===================== Node Execution =====================

/**
 * Execute a single node with timeout support.
 * v1: Simulated execution — marks success by default.
 */
async function executeNodeWithTimeout(
  node: SkillChainNodeRow,
  _input: Record<string, unknown>
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const timeoutMs = node.timeout || 30000;

  const timeoutPromise = new Promise<{ success: boolean; output?: unknown; error?: string }>(
    (_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Node execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }
  );

  const executePromise = (async (): Promise<{ success: boolean; output?: unknown; error?: string }> => {
    // v1: Simulated execution
    // In future versions, this will invoke the actual skill via agent-sdk or similar
    const skillId = node.skill_id;
    const skillName = node.skill_name;

    // Simulate a brief processing delay (10-50ms) for realistic timing
    const delay = 10 + Math.random() * 40;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return {
      success: true,
      output: {
        skillId,
        skillName,
        executedAt: new Date().toISOString(),
        message: `Simulated execution of "${skillName}" completed successfully`,
        result: { status: 'ok', simulated: true },
      },
    };
  })();

  try {
    return await Promise.race([executePromise, timeoutPromise]);
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
    };
  }
}

// ===================== Main Execution Function =====================

/**
 * Execute a skill chain by ID.
 *
 * Flow:
 * 1. Read chain + nodes from DB
 * 2. Generate executionId, broadcast chain-started
 * 3. Create execution record
 * 4. Execute nodes sequentially with abort/retry/timeout support
 * 5. Persist final execution state
 *
 * @param chainId - The skill chain ID to execute
 * @returns The execution ID for SSE subscription
 */
export async function executeChain(chainId: string): Promise<{ executionId: string }> {
  const db = initDb();

  // 1. Read chain + nodes from DB
  const chain = getSkillChain(chainId);
  if (!chain) {
    throw new Error(`Chain not found: ${chainId}`);
  }

  const nodes = getChainNodes(chainId);
  if (!nodes || nodes.length === 0) {
    throw new Error(`Chain has no nodes: ${chainId}`);
  }

  // 2. Generate executionId and start time
  const executionId = uuidv4();
  const startedAt = new Date().toISOString();

  // 3. Broadcast chain-started
  broadcast(executionId, {
    type: 'chain-exec-started',
    executionId,
    chainId,
    chainName: chain.name,
    totalNodes: nodes.length,
    failStrategy: chain.fail_strategy,
    timestamp: startedAt,
  });

  // 4. Create initial execution record
  createSkillExecution({
    id: executionId,
    chainId,
    status: 'running',
    failStrategy: chain.fail_strategy,
    steps: JSON.stringify(
      nodes.map((n, i) => ({
        nodeId: n.id,
        skillId: n.skill_id,
        skillName: n.skill_name,
        nodeOrder: i,
        status: 'pending',
      }))
    ),
    startedAt,
  });

  // 5. Initialize execution context
  const context: Record<string, unknown> = {};

  // 6. Execute nodes sequentially
  const steps: Array<Record<string, unknown>> = [];
  let chainFailed = false;
  let chainAborted = false;
  let previousOutput: unknown = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    // Check abort signal before each node
    if (abortSignals.get(executionId)) {
      chainAborted = true;
      for (let j = i; j < nodes.length; j++) {
        steps.push({
          nodeId: nodes[j].id,
          skillId: nodes[j].skill_id,
          skillName: nodes[j].skill_name,
          nodeOrder: j,
          status: 'skipped',
        });
        broadcast(executionId, {
          type: 'node-skipped',
          executionId,
          nodeId: nodes[j].id,
          skillId: nodes[j].skill_id,
          nodeOrder: j,
          reason: 'Chain aborted by user',
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    // Build node input context
    const nodeInput = buildNodeInput(context, node, previousOutput);

    // Broadcast node-started
    const nodeStartTime = Date.now();
    broadcast(executionId, {
      type: 'node-started',
      executionId,
      nodeId: node.id,
      skillId: node.skill_id,
      skillName: node.skill_name,
      nodeOrder: i,
      input: nodeInput,
      timestamp: new Date().toISOString(),
    });

    // Execute with retry logic
    let nodeResult: { success: boolean; output?: unknown; error?: string } = { success: false };
    const maxRetries = node.retry_count || 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        broadcast(executionId, {
          type: 'node-retry',
          executionId,
          nodeId: node.id,
          skillId: node.skill_id,
          nodeOrder: i,
          attempt,
          maxRetries,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        nodeResult = await executeNodeWithTimeout(node, nodeInput);
        if (nodeResult.success) {
          break;
        }
      } catch (e) {
        nodeResult = {
          success: false,
          error: (e as Error).message,
        };
      }

      // Small delay between retries (capped at 2 seconds max)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 500, 2000)));
      }
    }

    const nodeDuration = Date.now() - nodeStartTime;

    if (nodeResult.success) {
      // Store output in context for subsequent nodes
      context[`node_${i}_output`] = nodeResult.output;
      context[`node_${node.skill_id}_output`] = nodeResult.output;
      previousOutput = nodeResult.output;

      steps.push({
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        status: 'success',
        duration: nodeDuration,
        output: nodeResult.output,
      });

      broadcast(executionId, {
        type: 'node-completed',
        executionId,
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        duration: nodeDuration,
        input: nodeInput,
        output: nodeResult.output,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Node failed
      steps.push({
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        status: 'failed',
        duration: nodeDuration,
        error: nodeResult.error,
      });

      broadcast(executionId, {
        type: 'node-failed',
        executionId,
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        duration: nodeDuration,
        error: nodeResult.error,
        timestamp: new Date().toISOString(),
      });

      const failStrategy = chain.fail_strategy || 'stop';

      if (failStrategy === 'stop') {
        chainFailed = true;
        broadcast(executionId, {
          type: 'chain-failed',
          executionId,
          chainId,
          failedAtNode: node.id,
          failedAtNodeName: node.skill_name,
          error: nodeResult.error,
          timestamp: new Date().toISOString(),
        });

        // Mark remaining nodes as skipped
        for (let j = i + 1; j < nodes.length; j++) {
          steps.push({
            nodeId: nodes[j].id,
            skillId: nodes[j].skill_id,
            skillName: nodes[j].skill_name,
            nodeOrder: j,
            status: 'skipped',
          });
          broadcast(executionId, {
            type: 'node-skipped',
            executionId,
            nodeId: nodes[j].id,
            skillId: nodes[j].skill_id,
            nodeOrder: j,
            reason: 'Previous node failed (failStrategy=stop)',
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      // failStrategy='skip': continue to next node
    }
  }

  // 7. Determine final status
  const completedAt = new Date().toISOString();
  const totalDuration = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  let finalStatus: string;
  if (chainAborted) {
    finalStatus = 'aborted';
    broadcast(executionId, {
      type: 'chain-completed',
      executionId,
      chainId,
      chainName: chain.name,
      status: 'aborted',
      totalDuration,
      totalNodes: nodes.length,
      timestamp: completedAt,
    });
  } else if (chainFailed) {
    finalStatus = 'failed';
  } else {
    finalStatus = 'completed';
    broadcast(executionId, {
      type: 'chain-completed',
      executionId,
      chainId,
      chainName: chain.name,
      status: 'completed',
      totalDuration,
      totalNodes: nodes.length,
      timestamp: completedAt,
    });
  }

  // 8. Persist final execution state to DB
  try {
    updateSkillExecution(executionId, {
      status: finalStatus,
      steps: JSON.stringify(steps),
      completedAt,
      duration: totalDuration,
    });
  } catch (e) {
    console.error(`[ChainExecutor] Failed to persist execution ${executionId}:`, e);
  }

  // 9. Cleanup abort signal
  abortSignals.delete(executionId);

  return { executionId };
}
