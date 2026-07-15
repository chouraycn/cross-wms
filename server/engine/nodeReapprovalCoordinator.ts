/**
 * 节点重新审批协调器 — 参考 OpenClaw gateway/node-reapproval-coordinator.ts
 *
 * 在配对节点重新审批请求进入配对存储之前进行协调。
 */

import { logger } from '../logger.js';
import { AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL, createAuthRateLimiter } from './authRateLimit.js';
import { withSerializedKeyedAttempt } from './rateLimitAttemptSerialization.js';

export interface NodePairingRequestInput {
  nodeId: string;
  clientId?: string;
  clientMode?: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  permissions?: Record<string, unknown>;
  fingerprints?: string[];
}

export interface NodePairingCleanupClaim {
  nodeId: string;
  claimId: string;
}

export interface NodePairingSupersededRequest {
  requestId: string;
  nodeId: string;
}

export interface RequestNodePairingResult {
  requestId: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface NodeReapprovalCoordinator {
  request: (params: {
    input: NodePairingRequestInput;
    cleanupClaim?: NodePairingCleanupClaim;
  }) => Promise<RequestNodePairingResult | null>;
  finalizeCleanup: (claim: NodePairingCleanupClaim) => Promise<NodePairingSupersededRequest[]>;
  dispose: () => void;
}

interface DeferredResult {
  promise: Promise<RequestNodePairingResult | null>;
  resolve: (result: RequestNodePairingResult | null) => void;
  reject: (error: unknown) => void;
}

interface QueuedRequest {
  fingerprint: string;
  input: NodePairingRequestInput;
  cleanupClaim?: NodePairingCleanupClaim;
  deferred: DeferredResult;
  followers: DeferredResult[];
}

interface NodeRequestState {
  activeFingerprint: string;
  queued?: QueuedRequest;
}

function createDeferredResult(): DeferredResult {
  let resolve!: DeferredResult['resolve'];
  let reject!: DeferredResult['reject'];
  const promise = new Promise<RequestNodePairingResult | null>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function normalizeFingerprintList(value: string[] | undefined): string[] | undefined {
  return value
    ? [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))].sort()
    : undefined;
}

function buildRequestFingerprint(input: NodePairingRequestInput): string {
  const permissions = input.permissions
    ? Object.fromEntries(Object.entries(input.permissions).sort(([left], [right]) => left.localeCompare(right)))
    : undefined;

  return JSON.stringify({
    nodeId: input.nodeId.trim(),
    clientId: input.clientId,
    clientMode: input.clientMode,
    displayName: input.displayName,
    platform: input.platform,
    version: input.version,
    coreVersion: input.coreVersion,
    permissions,
    fingerprints: normalizeFingerprintList(input.fingerprints),
  });
}

export function createNodeReapprovalCoordinator(): NodeReapprovalCoordinator {
  const nodeStates = new Map<string, NodeRequestState>();
  const limiter = createAuthRateLimiter({
    maxAttempts: 5,
    windowMs: 60_000,
    lockoutMs: 300_000,
  });

  async function request(params: {
    input: NodePairingRequestInput;
    cleanupClaim?: NodePairingCleanupClaim;
  }): Promise<RequestNodePairingResult | null> {
    const nodeId = params.input.nodeId.trim();
    const fingerprint = buildRequestFingerprint(params.input);

    return withSerializedKeyedAttempt({
      key: `${AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL}:${nodeId}`,
      run: async () => {
        const state = nodeStates.get(nodeId);

        if (state && state.activeFingerprint === fingerprint) {
          const deferred = createDeferredResult();
          state.queued?.followers.push(deferred);
          return deferred.promise;
        }

        const checkResult = limiter.check(nodeId, AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL);
        if (!checkResult.allowed) {
          logger.warn(`[NodeReapproval] 节点 ${nodeId} 重新审批被速率限制`);
          return null;
        }

        const deferred = createDeferredResult();
        const queuedRequest: QueuedRequest = {
          fingerprint,
          input: params.input,
          cleanupClaim: params.cleanupClaim,
          deferred,
          followers: [],
        };

        nodeStates.set(nodeId, {
          activeFingerprint: fingerprint,
          queued: queuedRequest,
        });

        try {
          const result = await performReapproval(queuedRequest);
          limiter.recordSuccess(nodeId, AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL);
          return result;
        } catch (err) {
          limiter.recordFailure(nodeId, AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL);
          throw err;
        }
      },
    });
  }

  async function performReapproval(request: QueuedRequest): Promise<RequestNodePairingResult | null> {
    logger.info(`[NodeReapproval] 处理节点 ${request.input.nodeId} 重新审批请求`);

    const result: RequestNodePairingResult = {
      requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nodeId: request.input.nodeId,
      status: 'pending',
    };

    request.deferred.resolve(result);

    for (const follower of request.followers) {
      follower.resolve(result);
    }

    return result;
  }

  async function finalizeCleanup(claim: NodePairingCleanupClaim): Promise<NodePairingSupersededRequest[]> {
    logger.info(`[NodeReapproval] 完成节点 ${claim.nodeId} 清理`);
    nodeStates.delete(claim.nodeId);
    return [];
  }

  function dispose(): void {
    limiter.dispose();
    nodeStates.clear();
  }

  return {
    request,
    finalizeCleanup,
    dispose,
  };
}