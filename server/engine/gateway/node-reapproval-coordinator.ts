// 在配对 node 重新审批请求进入配对存储前进行协调。
// 移植自 openclaw/src/gateway/node-reapproval-coordinator.ts。
// 依赖调整：
//  - ../infra/node-pairing.js 的 finalizeNodePairingCleanupClaim、requestNodePairing、
//    reusePendingNodePairingForReconnect 及相关类型均已存在于 cross-wms
//  - ./auth-rate-limit.js 的 AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL、buildRateLimitIdentityKey、
//    createAuthRateLimiter → 本地降级实现（cross-wms auth-rate-limit.ts 未导出这些符号）；
//    RateLimitConfig 类型来自 ./auth-rate-limit.js
//  - ./rate-limit-attempt-serialization.js 的 withSerializedKeyedAttempt 已存在
import {
  finalizeNodePairingCleanupClaim,
  requestNodePairing,
  reusePendingNodePairingForReconnect,
  type NodePairingCleanupClaim,
  type NodePairingRequestInput,
  type NodePairingSupersededRequest,
  type RequestNodePairingResult,
} from "../infra/node-pairing.js";
import type { RateLimitConfig } from "./auth-rate-limit.js";
import { withSerializedKeyedAttempt } from "./rate-limit-attempt-serialization.js";

// ============================================================================
// 本地降级实现：auth-rate-limit 未导出的限流符号
// cross-wms auth-rate-limit.ts 导出 checkRateLimit/incrementRateLimit 等，
// 但未导出 createAuthRateLimiter、AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL、
// buildRateLimitIdentityKey。这里提供最小可用的本地实现。
// ============================================================================

/** node 重新审批限流作用域。 */
const AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL = "node-reapproval";

/** 构建限流身份键。 */
function buildRateLimitIdentityKey(kind: string, identity: string): string {
  return `${kind}:${identity}`;
}

/** 限流检查结果。 */
type RateLimitCheckResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

/**
 * 本地降级限流器。
 *
 * 降级原因：cross-wms auth-rate-limit.ts 未导出 createAuthRateLimiter。
 * 这里实现最小可用的滑动窗口限流：按 identity+scope 计数，超限拒绝。
 */
type LocalRateLimiter = {
  check: (identityKey: string, scope: string) => RateLimitCheckResult;
  recordFailure: (identityKey: string, scope: string) => void;
  dispose: () => void;
};

function createAuthRateLimiter(config: RateLimitConfig): LocalRateLimiter {
  const maxAttempts = config.maxAttempts > 0 ? config.maxAttempts : 5;
  const windowMs = config.windowMs > 0 ? config.windowMs : 60_000;
  const store = new Map<string, { count: number; windowStart: number }>();

  return {
    check(identityKey, scope) {
      const key = `${scope}:${identityKey}`;
      const now = Date.now();
      let entry = store.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        entry = { count: 0, windowStart: now };
        store.set(key, entry);
      }
      return entry.count < maxAttempts
        ? { allowed: true }
        : { allowed: false, retryAfterMs: entry.windowStart + windowMs - now };
    },
    recordFailure(identityKey, scope) {
      const key = `${scope}:${identityKey}`;
      const now = Date.now();
      let entry = store.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        entry = { count: 0, windowStart: now };
        store.set(key, entry);
      }
      entry.count++;
    },
    dispose() {
      store.clear();
    },
  };
}

// ============================================================================

type ReapprovalRequestParams = {
  input: NodePairingRequestInput;
  cleanupClaim?: NodePairingCleanupClaim;
  baseDir?: string;
};

type DeferredResult = {
  promise: Promise<RequestNodePairingResult | null>;
  resolve: (result: RequestNodePairingResult | null) => void;
  reject: (error: unknown) => void;
};

type QueuedRequest = {
  fingerprint: string;
  params: ReapprovalRequestParams;
  deferred: DeferredResult;
  followers: DeferredResult[];
};

type NodeRequestState = {
  activeFingerprint: string;
  queued?: QueuedRequest;
};

export type NodeReapprovalCoordinator = {
  request: (params: ReapprovalRequestParams) => Promise<RequestNodePairingResult | null>;
  finalizeCleanup: (claim: NodePairingCleanupClaim) => Promise<NodePairingSupersededRequest[]>;
  dispose: () => void;
};

function createDeferredResult(): DeferredResult {
  let resolve!: DeferredResult["resolve"];
  let reject!: DeferredResult["reject"];
  const promise = new Promise<RequestNodePairingResult | null>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function normalizeFingerprintList(value: string[] | undefined): string[] | undefined {
  return value
    ? [
        ...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0)),
      ].toSorted()
    : undefined;
}

function buildRequestFingerprint(input: NodePairingRequestInput): string {
  const permissions = input.permissions
    ? Object.fromEntries(
        Object.entries(input.permissions).toSorted(([left], [right]) => left.localeCompare(right)),
      )
    : undefined;
  return JSON.stringify({
    nodeId: input.nodeId.trim(),
    clientId: input.clientId,
    clientMode: input.clientMode,
    displayName: input.displayName,
    platform: input.platform,
    version: input.version,
    coreVersion: input.coreVersion,
    uiVersion: input.uiVersion,
    deviceFamily: input.deviceFamily,
    modelIdentifier: input.modelIdentifier,
    caps: normalizeFingerprintList(input.caps),
    commands: normalizeFingerprintList(input.commands),
    permissions,
    remoteIp: input.remoteIp,
    silent: Boolean(input.silent),
  });
}

/** 创建配对 node 重新审批写入限制的 gateway 生命周期所有者。 */
export function createNodeReapprovalCoordinator(
  config?: RateLimitConfig,
): NodeReapprovalCoordinator {
  const limiter = createAuthRateLimiter({
    ...config,
    scope: "node-reapproval",
  } as RateLimitConfig);
  const requestStates = new Map<string, NodeRequestState>();
  let disposed = false;

  const executeRequest = async ({
    input,
    cleanupClaim,
    baseDir,
  }: ReapprovalRequestParams): Promise<RequestNodePairingResult | null> => {
    if (disposed) {
      return null;
    }
    const reused = await reusePendingNodePairingForReconnect(input, cleanupClaim, baseDir);
    if (reused) {
      return reused;
    }

    const nodeId = input.nodeId.trim();
    const identityKey = buildRateLimitIdentityKey("node", nodeId);
    const rateCheck = limiter.check(identityKey, AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL);
    if (!rateCheck.allowed) {
      return null;
    }
    const result = await requestNodePairing(input, baseDir);
    limiter.recordFailure(identityKey, AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL);
    return result;
  };

  const finishActiveRequest = (nodeId: string, state: NodeRequestState, fingerprint: string) => {
    if (requestStates.get(nodeId) !== state || state.activeFingerprint !== fingerprint) {
      return;
    }
    if (!state.queued) {
      requestStates.delete(nodeId);
    }
  };

  const startFirstRequest = (
    nodeId: string,
    state: NodeRequestState,
    request: QueuedRequest,
  ): void => {
    void withSerializedKeyedAttempt({
      key: `node-reapproval:${nodeId}`,
      run: async () => {
        try {
          request.deferred.resolve(await executeRequest(request.params));
        } catch (error) {
          request.deferred.reject(error);
        } finally {
          finishActiveRequest(nodeId, state, request.fingerprint);
        }
      },
    });
  };

  const startQueuedRequest = (nodeId: string, state: NodeRequestState): void => {
    void withSerializedKeyedAttempt({
      key: `node-reapproval:${nodeId}`,
      run: async () => {
        const queued = state.queued;
        if (!queued) {
          return;
        }
        state.queued = undefined;
        state.activeFingerprint = queued.fingerprint;
        try {
          queued.deferred.resolve(await executeRequest(queued.params));
          for (const follower of queued.followers) {
            follower.resolve(null);
          }
        } catch (error) {
          queued.deferred.reject(error);
          for (const follower of queued.followers) {
            follower.reject(error);
          }
        } finally {
          finishActiveRequest(nodeId, state, queued.fingerprint);
        }
      },
    });
  };

  return {
    request(params) {
      if (disposed) {
        return Promise.resolve(null);
      }
      const nodeId = params.input.nodeId.trim();
      const fingerprint = buildRequestFingerprint(params.input);
      const state = requestStates.get(nodeId);
      if (!state) {
        const deferred = createDeferredResult();
        const nextState: NodeRequestState = { activeFingerprint: fingerprint };
        requestStates.set(nodeId, nextState);
        startFirstRequest(nodeId, nextState, {
          fingerprint,
          params,
          deferred,
          followers: [],
        });
        return deferred.promise;
      }
      if (state.queued?.fingerprint === fingerprint) {
        const follower = createDeferredResult();
        state.queued.params = params;
        state.queued.followers.push(follower);
        return follower.promise;
      }

      const deferred = createDeferredResult();
      if (state.queued) {
        state.queued.deferred.resolve(null);
        for (const follower of state.queued.followers) {
          follower.resolve(null);
        }
        state.queued = { fingerprint, params, deferred, followers: [] };
      } else {
        state.queued = { fingerprint, params, deferred, followers: [] };
        startQueuedRequest(nodeId, state);
      }
      return deferred.promise;
    },
    async finalizeCleanup(claim) {
      return await withSerializedKeyedAttempt({
        key: `node-reapproval:${claim.nodeId}`,
        run: async () => await finalizeNodePairingCleanupClaim(claim),
      });
    },
    dispose() {
      disposed = true;
      for (const state of requestStates.values()) {
        state.queued?.deferred.resolve(null);
        for (const follower of state.queued?.followers ?? []) {
          follower.resolve(null);
        }
      }
      requestStates.clear();
      limiter.dispose();
    },
  };
}
