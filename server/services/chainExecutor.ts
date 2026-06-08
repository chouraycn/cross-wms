/**
 * Chain Executor Service
 *
 * Executes skill chains sequentially, with SSE broadcasting, abort support,
 * retry logic, and timeout handling. Singleton pattern using module-level state.
 *
 * v2: Real execution via @tencent-ai/agent-sdk, node_results persistence,
 *     enriched SSE event types, and keepalive heartbeat.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { query } from '@tencent-ai/agent-sdk';
import {
  initDb,
  getSkillChain,
  getChainNodes,
  createSkillExecution,
  updateSkillExecution,
} from '../db';
import type { SkillChainNodeRow } from '../db';
import { loadModelsConfig } from '../modelsStore.js';

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
 * v2: Real execution via @tencent-ai/agent-sdk.
 *     Reads promptTemplate from user_skills, invokes agent-sdk query(),
 *     and returns the streaming response content.
 */
async function executeNodeWithTimeout(
  node: SkillChainNodeRow,
  input: Record<string, unknown>
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const timeoutMs = node.timeout || 60000;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Node execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const executePromise = (async (): Promise<{ success: boolean; output?: unknown; error?: string }> => {
    const db = initDb();

    // Read skill's promptTemplate from user_skills
    const skillRow = db.prepare('SELECT promptTemplate FROM user_skills WHERE id = ?').get(node.skill_id) as { promptTemplate: string | null } | undefined;
    const promptTemplate = skillRow?.promptTemplate;

    if (!promptTemplate || promptTemplate.trim() === '') {
      // No promptTemplate — return a basic result without calling agent-sdk
      return {
        success: true,
        output: {
          skillId: node.skill_id,
          skillName: node.skill_name,
          executedAt: new Date().toISOString(),
          message: `Skill "${node.skill_name}" has no promptTemplate configured.`,
          result: { status: 'ok', note: 'no_prompt_template' },
        },
      };
    }

    // Build final prompt: inject input context into the prompt template
    let finalPrompt = promptTemplate;
    if (input && Object.keys(input).length > 0) {
      finalPrompt = `<context>\n${JSON.stringify(input, null, 2)}\n</context>\n\n${finalPrompt}`;
    }

    // 加载默认模型配置，注入 apiEndpoint、apiKey、temperature、topP
    const modelsConfig = loadModelsConfig();
    const defaultModelConfig = modelsConfig.models.find((m) => m.id === modelsConfig.defaultModelId);

    // Call agent-sdk
    const queryOptions: Record<string, unknown> = {
      permissionMode: 'bypassPermissions',
      cwd: process.cwd(),
    };
    if (defaultModelConfig) {
      if (defaultModelConfig.apiEndpoint) queryOptions.apiEndpoint = defaultModelConfig.apiEndpoint;
      if (defaultModelConfig.apiKey) queryOptions.apiKey = defaultModelConfig.apiKey;
      if (typeof defaultModelConfig.temperature === 'number') queryOptions.temperature = defaultModelConfig.temperature;
      if (typeof defaultModelConfig.topP === 'number') queryOptions.topP = defaultModelConfig.topP;
    }

    try {
      const queryInstance = query({ prompt: finalPrompt, options: queryOptions });
      let fullContent = '';

      for await (const msg of queryInstance) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              fullContent += block.text;
            }
          }
        }
      }

      return {
        success: true,
        output: {
          skillId: node.skill_id,
          skillName: node.skill_name,
          executedAt: new Date().toISOString(),
          result: { content: fullContent },
        },
      };
    } catch (sdkError) {
      return {
        success: false,
        error: `Agent SDK error: ${sdkError instanceof Error ? sdkError.message : 'Unknown error'}`,
      };
    }
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
  const nodeResults: Array<Record<string, unknown>> = [];
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
        nodeResults.push({
          nodeId: nodes[j].id,
          skillId: nodes[j].skill_id,
          skillName: nodes[j].skill_name,
          nodeOrder: j,
          status: 'skipped',
          reason: 'Chain aborted by user',
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

      nodeResults.push({
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        status: 'success',
        duration: nodeDuration,
        output: nodeResult.output,
        timestamp: new Date().toISOString(),
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

      // v2: Also broadcast the enriched event type for newer clients
      broadcast(executionId, {
        type: 'chain-exec-node-completed',
        executionId,
        chainId,
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        totalNodes: nodes.length,
        duration: nodeDuration,
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

      nodeResults.push({
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        status: 'failed',
        duration: nodeDuration,
        error: nodeResult.error,
        timestamp: new Date().toISOString(),
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

      // v2: Broadcast chain-exec-error for node-level failures
      broadcast(executionId, {
        type: 'chain-exec-error',
        executionId,
        chainId,
        nodeId: node.id,
        skillId: node.skill_id,
        skillName: node.skill_name,
        nodeOrder: i,
        error: nodeResult.error,
        failStrategy: chain.fail_strategy,
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
          nodeResults.push({
            nodeId: nodes[j].id,
            skillId: nodes[j].skill_id,
            skillName: nodes[j].skill_name,
            nodeOrder: j,
            status: 'skipped',
            reason: 'Previous node failed (failStrategy=stop)',
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

  // Build result summary
  const succeededCount = nodeResults.filter((r) => r.status === 'success').length;
  const failedCount = nodeResults.filter((r) => r.status === 'failed').length;
  const skippedCount = nodeResults.filter((r) => r.status === 'skipped').length;

  const resultSummary: Record<string, unknown> = {
    totalNodes: nodes.length,
    succeeded: succeededCount,
    failed: failedCount,
    skipped: skippedCount,
    totalDuration,
    completedAt,
  };

  let finalStatus: string;
  if (chainAborted) {
    finalStatus = 'aborted';
    resultSummary.status = 'aborted';

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
    resultSummary.status = 'failed';
  } else {
    finalStatus = 'completed';
    resultSummary.status = 'completed';

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

  // v2: Broadcast chain-exec-completed with result summary for newer clients
  broadcast(executionId, {
    type: 'chain-exec-completed',
    executionId,
    chainId,
    chainName: chain.name,
    status: finalStatus,
    totalDuration,
    summary: resultSummary,
    timestamp: completedAt,
  });

  // 8. Persist final execution state to DB (include nodeResults and result)
  try {
    updateSkillExecution(executionId, {
      status: finalStatus,
      steps: JSON.stringify(steps),
      nodeResults: JSON.stringify(nodeResults),
      result: JSON.stringify(resultSummary),
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
