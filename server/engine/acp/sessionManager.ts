/**
 * ACP Session Manager Core
 * ACP 会话管理器核心 - 协调 ACP 会话元数据、运行时句柄、每会话队列和回合执行
 */

import type {
  AcpCloseSessionInput,
  AcpCloseSessionResult,
  AcpInitializeSessionInput,
  AcpManagerObservabilitySnapshot,
  AcpRunTurnInput,
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeHandle,
  AcpSessionManagerDeps,
  AcpSessionMeta,
  AcpSessionResolution,
  AcpSessionRuntimeOptions,
  AcpSessionState,
  SessionAcpMeta,
  TurnLatencyStats,
} from "./types.js";
import { AcpRuntimeError, AcpRuntimeErrorCode } from "./types.js";
import { SessionActorQueue } from "./sessionActorQueue.js";
import { RuntimeHandleCache } from "./runtimeCache.js";
import { markAcpTurnActive, clearAcpTurnActive } from "./activeTurns.js";
import {
  normalizeRuntimeOptions,
  validateRuntimeOptionPatch,
  buildRuntimeControlSignature,
  runtimeOptionsEqual,
  mergeRuntimeOptions,
} from "./runtimeOptions.js";
import { runManagerTurn } from "./turnRunner.js";

function normalizeActorKey(sessionKey: string): string {
  return sessionKey.toLowerCase().trim();
}

function canonicalizeSessionKey(sessionKey: string): string {
  if (!sessionKey) {
    return "";
  }
  return sessionKey.toLowerCase().trim();
}

export class AcpSessionManager {
  private readonly actorQueue = new SessionActorQueue();
  private readonly runtimeHandles = new RuntimeHandleCache();
  private readonly activeTurnBySession = new Map<string, {
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    abortController: AbortController;
    startedAt: number;
  }>();
  private readonly turnLatencyStats: TurnLatencyStats = {
    completed: 0,
    failed: 0,
    totalMs: 0,
    maxMs: 0,
  };
  private readonly errorCountsByCode = new Map<string, number>();
  private readonly deps: AcpSessionManagerDeps;

  constructor(deps: AcpSessionManagerDeps) {
    this.deps = deps;
  }

  /**
   * 解析会话状态
   */
  resolveSession(params: { cfg: unknown; sessionKey: string }): AcpSessionResolution {
    const sessionKey = canonicalizeSessionKey(params.sessionKey);
    if (!sessionKey) {
      return {
        kind: "none",
        sessionKey,
      };
    }
    const entry = this.deps.readSessionEntry({
      cfg: params.cfg,
      sessionKey,
      clone: false,
    });
    const acp = entry?.acp;
    if (acp) {
      return {
        kind: "ready",
        sessionKey,
        meta: acp,
      };
    }
    // 检查是否是有问题的会话键
    if (sessionKey.startsWith("acp::")) {
      return {
        kind: "stale",
        sessionKey,
        error: "ACP session metadata not found.",
      };
    }
    return {
      kind: "none",
      sessionKey,
    };
  }

  /**
   * 获取可观测性快照
   */
  getObservabilitySnapshot(_cfg: unknown): AcpManagerObservabilitySnapshot {
    const completedTurns = this.turnLatencyStats.completed + this.turnLatencyStats.failed;
    const averageLatencyMs =
      completedTurns > 0 ? Math.round(this.turnLatencyStats.totalMs / completedTurns) : 0;
    return {
      runtimeCache: this.runtimeHandles.getObservabilitySnapshot(),
      turns: {
        active: this.activeTurnBySession.size,
        queueDepth: this.actorQueue.getTotalPendingCount(),
        completed: this.turnLatencyStats.completed,
        failed: this.turnLatencyStats.failed,
        averageLatencyMs,
        maxLatencyMs: this.turnLatencyStats.maxMs,
      },
      errorsByCode: Object.fromEntries(
        Array.from(this.errorCountsByCode.entries()).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  }

  /**
   * 初始化会话
   */
  async initializeSession(input: AcpInitializeSessionInput): Promise<{
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    meta: SessionAcpMeta;
  }> {
    const sessionKey = canonicalizeSessionKey(input.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError(
        AcpRuntimeErrorCode.ACP_SESSION_INIT_FAILED,
        "ACP session key is required.",
      );
    }

    await this.evictIdleRuntimeHandles(input.cfg);

    return await this.withSessionActor(sessionKey, async () => {
      return await this.runManagerInitializeSession({
        input,
        sessionKey,
        deps: this.deps,
        runtimeHandles: this.runtimeHandles,
        enforceConcurrentSessionLimit: this.enforceConcurrentSessionLimit.bind(this),
        writeSessionMeta: this.writeSessionMeta.bind(this),
      });
    });
  }

  /**
   * 运行回合
   */
  async runTurn(input: AcpRunTurnInput): Promise<void> {
    const sessionKey = canonicalizeSessionKey(input.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError(
        AcpRuntimeErrorCode.ACP_SESSION_INIT_FAILED,
        "ACP session key is required.",
      );
    }

    await this.evictIdleRuntimeHandles(input.cfg);

    await this.withSessionActor(
      sessionKey,
      async () =>
        await runManagerTurn({
          input,
          sessionKey,
          deps: this.deps,
          runtimeHandles: this.runtimeHandles,
          activeTurnBySession: this.activeTurnBySession,
          resolveSession: this.resolveSession.bind(this),
          ensureRuntimeHandle: this.ensureRuntimeHandle.bind(this),
          applyRuntimeControls: this.applyRuntimeControls.bind(this),
          setSessionState: this.setSessionState.bind(this),
          recordTurnCompletion: this.recordTurnCompletion.bind(this),
          reconcileRuntimeSessionIdentifiers: this.reconcileRuntimeSessionIdentifiers.bind(this),
          writeSessionMeta: this.writeSessionMeta.bind(this),
        }),
      input.signal,
    );
  }

  /**
   * 取消会话
   */
  async cancelSession(params: {
    cfg: unknown;
    sessionKey: string;
    reason?: string;
  }): Promise<void> {
    const sessionKey = canonicalizeSessionKey(params.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError(
        AcpRuntimeErrorCode.ACP_SESSION_INIT_FAILED,
        "ACP session key is required.",
      );
    }

    await this.evictIdleRuntimeHandles(params.cfg);

    const activeTurn = this.activeTurnBySession.get(normalizeActorKey(sessionKey));
    if (activeTurn) {
      activeTurn.abortController.abort();
      clearAcpTurnActive(sessionKey);
    }

    await this.setSessionState({
      cfg: params.cfg,
      sessionKey,
      state: "error",
      lastError: params.reason ?? "Session cancelled.",
    });
  }

  /**
   * 关闭会话
   */
  async closeSession(input: AcpCloseSessionInput): Promise<AcpCloseSessionResult> {
    const sessionKey = canonicalizeSessionKey(input.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError(
        AcpRuntimeErrorCode.ACP_SESSION_INIT_FAILED,
        "ACP session key is required.",
      );
    }

    await this.evictIdleRuntimeHandles(input.cfg);

    const cached = this.runtimeHandles.get(sessionKey);
    if (cached) {
      try {
        await cached.runtime.close({
          handle: cached.handle,
          reason: input.reason ?? "Session closed.",
        });
      } catch (error) {
        console.warn(`Failed to close runtime for ${sessionKey}:`, error);
      }
      this.runtimeHandles.clear(sessionKey);
    }

    await this.writeSessionMeta({
      cfg: input.cfg,
      sessionKey,
      mutate: (current) => {
        if (!current) {
          return null;
        }
        return {
          ...current,
          state: "closed" as AcpSessionState,
        };
      },
    });

    return {
      sessionKey,
      closedAt: Date.now(),
    };
  }

  /**
   * 更新会话运行时选项
   */
  async updateSessionRuntimeOptions(params: {
    cfg: unknown;
    sessionKey: string;
    patch: Partial<AcpSessionRuntimeOptions>;
  }): Promise<AcpSessionRuntimeOptions> {
    const sessionKey = canonicalizeSessionKey(params.sessionKey);
    const validatedPatch = validateRuntimeOptionPatch(params.patch);
    if (!sessionKey) {
      throw new AcpRuntimeError(
        AcpRuntimeErrorCode.ACP_SESSION_INIT_FAILED,
        "ACP session key is required.",
      );
    }

    await this.evictIdleRuntimeHandles(params.cfg);

    return await this.withSessionActor(sessionKey, async () => {
      const currentResolution = this.resolveSession({ cfg: params.cfg, sessionKey });
      if (currentResolution.kind !== "ready" || !currentResolution.meta) {
        throw new AcpRuntimeError(
          AcpRuntimeErrorCode.ACP_SESSION_NOT_FOUND,
          `Session ${sessionKey} not found.`,
        );
      }

      const currentOptions = currentResolution.meta.runtimeOptions ?? {};
      const mergedOptions = mergeRuntimeOptions({
        current: currentOptions,
        patch: validatedPatch,
      });

      await this.writeSessionMeta({
        cfg: params.cfg,
        sessionKey,
        mutate: (current) => {
          if (!current) {
            return null;
          }
          return {
            ...current,
            runtimeOptions: mergedOptions,
          };
        },
      });

      return mergedOptions;
    });
  }

  private async ensureRuntimeHandle(params: {
    cfg: unknown;
    sessionKey: string;
    meta: SessionAcpMeta;
  }): Promise<{ runtime: AcpRuntime; handle: AcpRuntimeHandle; meta: SessionAcpMeta }> {
    const cached = this.runtimeHandles.get(params.sessionKey);
    const currentSignature = buildRuntimeControlSignature(params.meta.runtimeOptions ?? {});

    // 检查缓存的运行时是否仍然有效
    if (cached && runtimeOptionsEqual(cached, params.meta.runtimeOptions)) {
      return { runtime: cached.runtime, handle: cached.handle, meta: params.meta };
    }

    // 创建新的运行时
    const runtime = await this.deps.createRuntime({
      backend: params.meta.backend,
      meta: params.meta,
    });

    // 创建会话句柄
    const handle = await runtime.createSession({
      model: params.meta.runtimeOptions?.model,
      thinking: params.meta.runtimeOptions?.thinking,
      permissionProfile: params.meta.runtimeOptions?.permissionProfile,
      backendExtras: params.meta.runtimeOptions?.backendExtras,
    });

    // 缓存运行时状态
    this.runtimeHandles.set(params.sessionKey, {
      runtime,
      handle,
      backend: params.meta.backend,
      agent: params.meta.agent,
      mode: params.meta.mode,
      cwd: params.meta.cwd,
      configSignature: currentSignature,
      lastTouchedAt: Date.now(),
    });

    return { runtime, handle, meta: params.meta };
  }

  private enforceConcurrentSessionLimit(params: { cfg: unknown; sessionKey: string }): void {
    const configuredLimit = (params.cfg as { acp?: { maxConcurrentSessions?: number } })?.acp?.maxConcurrentSessions;
    if (typeof configuredLimit !== "number" || !Number.isFinite(configuredLimit)) {
      return;
    }
    const limit = Math.max(1, Math.floor(configuredLimit));
    if (this.runtimeHandles.has(params.sessionKey)) {
      return;
    }
    const activeCount = this.runtimeHandles.size();
    if (activeCount >= limit) {
      throw new AcpRuntimeError(
        AcpRuntimeErrorCode.ACP_MAX_CONCURRENT_SESSIONS,
        `ACP max concurrent sessions reached (${activeCount}/${limit}).`,
      );
    }
  }

  private recordTurnCompletion(params: { startedAt: number; errorCode?: string }): void {
    const durationMs = Math.max(0, Date.now() - params.startedAt);
    this.turnLatencyStats.totalMs += durationMs;
    this.turnLatencyStats.maxMs = Math.max(this.turnLatencyStats.maxMs, durationMs);
    if (params.errorCode) {
      this.turnLatencyStats.failed += 1;
      this.errorCountsByCode.set(
        params.errorCode,
        (this.errorCountsByCode.get(params.errorCode) ?? 0) + 1,
      );
      return;
    }
    this.turnLatencyStats.completed += 1;
  }

  private async applyRuntimeControls(params: {
    sessionKey: string;
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    meta: SessionAcpMeta;
  }): Promise<void> {
    const cached = this.runtimeHandles.get(params.sessionKey);
    const currentSignature = buildRuntimeControlSignature(params.meta.runtimeOptions ?? {});

    if (cached?.appliedControlSignature === currentSignature) {
      return;
    }

    // 应用运行时控制
    // 实际实现会根据 runtime 类型调用对应的控制方法

    // 更新缓存的签名
    const entry = this.runtimeHandles.get(params.sessionKey);
    if (entry) {
      entry.appliedControlSignature = currentSignature;
    }
  }

  private async setSessionState(params: {
    cfg: unknown;
    sessionKey: string;
    state: SessionAcpMeta["state"];
    lastError?: string;
    clearLastError?: boolean;
  }): Promise<void> {
    await this.writeSessionMeta({
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      mutate: (current) => {
        if (!current) {
          return null;
        }
        const next: SessionAcpMeta = {
          ...current,
          state: params.state,
          lastActivityAt: Date.now(),
        };
        if (params.lastError) {
          next.lastError = params.lastError;
        } else if (params.clearLastError) {
          delete next.lastError;
        }
        return next;
      },
    });
  }

  private async reconcileRuntimeSessionIdentifiers(params: {
    cfg: unknown;
    sessionKey: string;
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    meta: SessionAcpMeta;
    failOnStatusError: boolean;
  }): Promise<{ handle: AcpRuntimeHandle; meta: SessionAcpMeta }> {
    // 简单实现：直接返回原始值
    return { handle: params.handle, meta: params.meta };
  }

  private async evictIdleRuntimeHandles(cfg: unknown): Promise<void> {
    const maxIdleMs = ((cfg as { acp?: { maxIdleMs?: number } })?.acp?.maxIdleMs ?? 5 * 60 * 1000);
    await this.runtimeHandles.evictIdle({
      cfg,
      maxIdleMs,
      actorQueue: this.actorQueue,
      activeTurnBySession: this.activeTurnBySession,
    });
  }

  private async writeSessionMeta(params: {
    cfg: unknown;
    sessionKey: string;
    mutate: (
      current: SessionAcpMeta | undefined,
      entry: { acp?: SessionAcpMeta } | undefined,
    ) => SessionAcpMeta | null | undefined;
  }): Promise<{ acp?: SessionAcpMeta } | null> {
    try {
      return await this.deps.upsertSessionMeta({
        cfg: params.cfg,
        sessionKey: params.sessionKey,
        mutate: params.mutate,
      });
    } catch (error) {
      console.warn(`acp-manager: failed persisting ACP metadata for ${params.sessionKey}:`, error);
      return null;
    }
  }

  private async runManagerInitializeSession(params: {
    input: AcpInitializeSessionInput;
    sessionKey: string;
    deps: AcpSessionManagerDeps;
    runtimeHandles: RuntimeHandleCache;
    enforceConcurrentSessionLimit: (params: { cfg: unknown; sessionKey: string }) => void;
    writeSessionMeta: (params: {
      cfg: unknown;
      sessionKey: string;
      mutate: (
        current: SessionAcpMeta | undefined,
        entry: { acp?: SessionAcpMeta } | undefined,
      ) => SessionAcpMeta | null | undefined;
    }) => Promise<{ acp?: SessionAcpMeta } | null>;
  }): Promise<{ runtime: AcpRuntime; handle: AcpRuntimeHandle; meta: SessionAcpMeta }> {
    const { input, sessionKey, deps, runtimeHandles, enforceConcurrentSessionLimit, writeSessionMeta } = params;

    enforceConcurrentSessionLimit({ cfg: input.cfg, sessionKey });

    const resolvedMode = input.mode ?? "converse";
    const resolvedBackend = input.backend ?? "default";
    const resolvedAgent = input.agent ?? "default";

    const sessionMeta: SessionAcpMeta = {
      backend: resolvedBackend,
      agent: resolvedAgent,
      runtimeSessionName: sessionKey,
      mode: resolvedMode,
      runtimeOptions: normalizeRuntimeOptions(input.runtimeOptions),
      state: "initializing",
      lastActivityAt: Date.now(),
    };

    await writeSessionMeta({
      cfg: input.cfg,
      sessionKey,
      mutate: () => sessionMeta,
    });

    const runtime = await deps.createRuntime({
      backend: resolvedBackend,
      meta: sessionMeta,
    });

    const handle = await runtime.createSession({
      model: sessionMeta.runtimeOptions?.model,
      thinking: sessionMeta.runtimeOptions?.thinking,
      permissionProfile: sessionMeta.runtimeOptions?.permissionProfile,
      backendExtras: sessionMeta.runtimeOptions?.backendExtras,
    });

    const configSignature = buildRuntimeControlSignature(sessionMeta.runtimeOptions ?? {});
    runtimeHandles.set(sessionKey, {
      runtime,
      handle,
      backend: resolvedBackend,
      agent: resolvedAgent,
      mode: resolvedMode,
      cwd: sessionMeta.cwd,
      configSignature,
      lastTouchedAt: Date.now(),
    });

    await writeSessionMeta({
      cfg: input.cfg,
      sessionKey,
      mutate: (current) => {
        if (!current) {
          return null;
        }
        return {
          ...current,
          state: "idle",
        };
      },
    });

    return { runtime, handle, meta: sessionMeta };
  }

  private async withSessionActor<T>(
    sessionKey: string,
    op: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const actorKey = normalizeActorKey(sessionKey);
    this.throwIfAborted(signal);

    const queued = this.actorQueue.run(actorKey, async () => {
      this.throwIfAborted(signal);
      return await op();
    });

    if (!signal) {
      return await queued;
    }

    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal!.removeEventListener("abort", onAbort);
      };
      const settleValue = (value: T) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };
      const settleError = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        settleError(new AcpRuntimeError(AcpRuntimeErrorCode.ACP_TURN_CANCELLED, "Operation aborted."));
      };

      signal.addEventListener("abort", onAbort, { once: true });
      queued.then(settleValue, settleError);
      if (signal.aborted) {
        onAbort();
      }
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new AcpRuntimeError(AcpRuntimeErrorCode.ACP_TURN_CANCELLED, "Operation aborted.");
    }
  }
}
