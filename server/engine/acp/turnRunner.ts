/**
 * Turn Runner
 * 回合运行器 - 处理单个 ACP 回合的执行，包括故障转移和超时处理
 */

import type {
  AcpRunTurnInput,
  AcpRuntime,
  AcpRuntimeHandle,
  AcpSessionManagerDeps,
  AcpSessionMeta,
  AcpTurnEvent,
  ActiveTurnState,
  BackendAttempt,
  SessionAcpMeta,
} from "./types.js";
import { AcpRuntimeError, AcpRuntimeErrorCode } from "./types.js";
import { clearAcpTurnActive, markAcpTurnActive } from "./activeTurns.js";
import { RuntimeHandleCache } from "./runtimeCache.js";
import { buildRuntimeControlSignature, runtimeOptionsEqual } from "./runtimeOptions.js";

const ACP_TURN_TIMEOUT_GRACE_MS = 1_000;

interface TurnRunnerParams {
  input: AcpRunTurnInput;
  sessionKey: string;
  deps: AcpSessionManagerDeps;
  runtimeHandles: RuntimeHandleCache;
  activeTurnBySession: Map<string, ActiveTurnState>;
  resolveSession: (params: { cfg: unknown; sessionKey: string }) => {
    kind: "ready" | "stale" | "none";
    sessionKey: string;
    meta?: SessionAcpMeta;
    error?: string;
  };
  ensureRuntimeHandle: (params: {
    cfg: unknown;
    sessionKey: string;
    meta: SessionAcpMeta;
  }) => Promise<{ runtime: AcpRuntime; handle: AcpRuntimeHandle; meta: SessionAcpMeta }>;
  applyRuntimeControls: (params: {
    sessionKey: string;
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    meta: SessionAcpMeta;
  }) => Promise<void>;
  setSessionState: (params: {
    cfg: unknown;
    sessionKey: string;
    state: SessionAcpMeta["state"];
    lastError?: string;
    clearLastError?: boolean;
  }) => Promise<void>;
  recordTurnCompletion: (params: { startedAt: number; errorCode?: string }) => void;
  reconcileRuntimeSessionIdentifiers: (params: {
    cfg: unknown;
    sessionKey: string;
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    meta: SessionAcpMeta;
    failOnStatusError: boolean;
  }) => Promise<{ handle: AcpRuntimeHandle; meta: SessionAcpMeta }>;
  writeSessionMeta: (params: {
    cfg: unknown;
    sessionKey: string;
    mutate: (
      current: SessionAcpMeta | undefined,
      entry: { acp?: SessionAcpMeta } | undefined,
    ) => SessionAcpMeta | null | undefined;
  }) => Promise<{ acp?: SessionAcpMeta } | null>;
}

function normalizeActorKey(sessionKey: string): string {
  return sessionKey.toLowerCase().trim();
}

function resolveBackendCandidatePlan(params: {
  configuredPrimaryBackend?: string;
  resolvedPrimaryBackend?: string;
  fallbackBackends?: string[];
}): { candidateBackends: string[]; describeBackendCandidate: (backend: string) => string } {
  const backends: string[] = [];

  if (params.configuredPrimaryBackend) {
    backends.push(params.configuredPrimaryBackend);
  } else if (params.resolvedPrimaryBackend) {
    backends.push(params.resolvedPrimaryBackend);
  }

  if (params.fallbackBackends) {
    for (const fb of params.fallbackBackends) {
      if (!backends.includes(fb)) {
        backends.push(fb);
      }
    }
  }

  // Default backend
  if (backends.length === 0) {
    backends.push("default");
  }

  return {
    candidateBackends: backends,
    describeBackendCandidate: (backend: string) => backend,
  };
}

function isFailoverWorthyBackendError(attempt: BackendAttempt): boolean {
  // Network errors, timeouts, and temporary failures are worth retrying
  const retryableCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ACP_TURN_TIMEOUT",
    "ACP_TURN_FAILED",
  ];
  return retryableCodes.includes(attempt.code) || attempt.sawOutput;
}

function shouldAttemptBackendFailover(params: {
  backendIndex: number;
  candidateBackends: string[];
}): boolean {
  return params.backendIndex < params.candidateBackends.length - 1;
}

function resolveTurnTimeoutMs(params: {
  cfg: AcpRunTurnInput["cfg"];
  meta: SessionAcpMeta;
}): number {
  const configuredTimeout = params.cfg?.timeoutSeconds;
  const metaTimeout = params.meta.runtimeOptions?.timeoutSeconds;
  const timeout = configuredTimeout ?? metaTimeout ?? 120;
  return Math.max(10, timeout) * 1000;
}

function requireReadySessionMeta(
  resolution: { kind: "ready" | "stale" | "none"; sessionKey: string; meta?: SessionAcpMeta; error?: string },
): SessionAcpMeta {
  if (resolution.kind !== "ready" || !resolution.meta) {
    throw new AcpRuntimeError(
      resolution.kind === "stale" ? AcpRuntimeErrorCode.ACP_SESSION_CLOSED : AcpRuntimeErrorCode.ACP_SESSION_NOT_FOUND,
      resolution.error ?? `Session ${resolution.sessionKey} not ready.`,
    );
  }
  return resolution.meta;
}

function formatAcpErrorChain(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toAcpRuntimeError(params: {
  error: unknown;
  fallbackCode: AcpRuntimeErrorCode;
  fallbackMessage: string;
}): AcpRuntimeError {
  if (params.error instanceof AcpRuntimeError) {
    return params.error;
  }
  return new AcpRuntimeError(params.fallbackCode, params.fallbackMessage, params.error);
}

/**
 * 执行单个 ACP 回合
 */
export async function runManagerTurn(params: TurnRunnerParams): Promise<void> {
  const { input, sessionKey } = params;
  const turnStartedAt = Date.now();
  const actorKey = normalizeActorKey(sessionKey);

  const taskContext: { runId: string } | null = null;
  let taskProgressSummary = "";

  const initialResolution = params.resolveSession({
    cfg: input.cfg,
    sessionKey,
  });
  const initialMeta = requireReadySessionMeta(initialResolution);

  const { candidateBackends, describeBackendCandidate } = resolveBackendCandidatePlan({
    configuredPrimaryBackend: input.cfg?.acp?.backend,
    resolvedPrimaryBackend: initialMeta.backend,
    fallbackBackends: input.cfg?.acp?.fallbacks,
  });

  const backendAttempts: BackendAttempt[] = [];
  const recordBackendFailure = async (error: AcpRuntimeError) => {
    const failedBackends = backendAttempts
      .map((attempt) => `${attempt.backend}: ${attempt.error}`)
      .join(" | ");
    const errorToRecord =
      backendAttempts.length > 1
        ? new AcpRuntimeError(
            AcpRuntimeErrorCode.ACP_BACKEND_FAILOVER_EXHAUSTED,
            `All ACP backends failed (${backendAttempts.length}): ${failedBackends}`,
          )
        : error;
    params.recordTurnCompletion({
      startedAt: turnStartedAt,
      errorCode: errorToRecord.code,
    });
    await params.setSessionState({
      cfg: input.cfg,
      sessionKey,
      state: "error",
      lastError: formatAcpErrorChain(errorToRecord),
    });
    throw errorToRecord;
  };

  let acpTurnMarkedActive = false;

  // 标记活跃状态
  markAcpTurnActive(sessionKey, {
    runtime: null as unknown as AcpRuntime,
    handle: null as unknown as AcpRuntimeHandle,
    abortController: new AbortController(),
    startedAt: turnStartedAt,
  });
  acpTurnMarkedActive = true;

  try {
    for (let backendIdx = 0; backendIdx < candidateBackends.length; backendIdx += 1) {
      const currentBackend = candidateBackends[backendIdx];
      if (backendIdx > 0) {
        await params.runtimeHandles.get(sessionKey)?.runtime?.close({
          handle: params.runtimeHandles.get(sessionKey)!.handle,
          reason: "backend-failover",
        });
        console.log(
          `acp-manager: switching backend for ${sessionKey} from ${describeBackendCandidate(
            candidateBackends[backendIdx - 1],
          )} to ${describeBackendCandidate(currentBackend)}`,
        );
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const resolution =
          backendIdx === 0 && attempt === 0
            ? initialResolution
            : params.resolveSession({
                cfg: input.cfg,
                sessionKey,
              });
        const resolvedMeta = requireReadySessionMeta(resolution);
        const metaWithBackend: SessionAcpMeta = currentBackend
          ? { ...resolvedMeta, backend: currentBackend }
          : resolvedMeta;

        let runtime: AcpRuntime | undefined;
        let handle: AcpRuntimeHandle | undefined;
        let meta: SessionAcpMeta | undefined;
        let activeTurn: ActiveTurnState | undefined;
        let internalAbortController: AbortController | undefined;
        let onCallerAbort: (() => void) | undefined;
        let activeTurnStarted = false;
        let sawTurnOutput = false;
        let retryFreshHandle = false;
        const skipPostTurnCleanup = false;

        try {
          const ensured = await params.ensureRuntimeHandle({
            cfg: input.cfg,
            sessionKey,
            meta: metaWithBackend,
          });
          runtime = ensured.runtime;
          handle = ensured.handle;
          meta = ensured.meta;

          await params.applyRuntimeControls({
            sessionKey,
            runtime,
            handle,
            meta,
          });

          await params.setSessionState({
            cfg: input.cfg,
            sessionKey,
            state: "running",
            clearLastError: true,
          });

          internalAbortController = new AbortController();
          onCallerAbort = () => {
            internalAbortController?.abort();
          };
          if (input.signal?.aborted) {
            internalAbortController.abort();
          } else if (input.signal) {
            input.signal.addEventListener("abort", onCallerAbort, { once: true });
          }

          activeTurn = {
            runtime,
            handle,
            abortController: internalAbortController,
            startedAt: Date.now(),
          };
          params.activeTurnBySession.set(actorKey, activeTurn);
          activeTurnStarted = true;

          const combinedSignal =
            input.signal && typeof AbortSignal.any === "function"
              ? AbortSignal.any([input.signal, internalAbortController.signal])
              : internalAbortController.signal;

          await input.onLifecycle?.({
            type: "prompt_submitted",
            at: Date.now(),
          });

          // 执行回合流消费
          const turnPromise = consumeAcpTurnStream({
            runtime,
            turn: {
              handle,
              text: input.text,
              attachments: input.attachments,
              mode: input.mode,
              requestId: input.requestId,
              signal: combinedSignal,
            },
            onOutputEvent: (event) => {
              sawTurnOutput = true;
              if (event.type === "text_delta" && event.stream === "main" && event.text) {
                taskProgressSummary += event.text;
              }
              if (event.type === "text_delta" && event.stream === "thought" && event.text) {
                // Thinking content
              }
            },
            onEvent: input.onEvent,
          });

          const turnTimeoutMs = resolveTurnTimeoutMs({
            cfg: input.cfg,
            meta,
          });

          const turnOutcome = await awaitTurnWithTimeout({
            turnPromise,
            timeoutMs: turnTimeoutMs + ACP_TURN_TIMEOUT_GRACE_MS,
          });

          if (!turnOutcome.sawTerminalEvent) {
            throw new AcpRuntimeError(
              AcpRuntimeErrorCode.ACP_TURN_FAILED,
              "ACP turn ended without a terminal done event.",
            );
          }

          params.recordTurnCompletion({
            startedAt: turnStartedAt,
          });

          await params.setSessionState({
            cfg: input.cfg,
            sessionKey,
            state: "idle",
            clearLastError: true,
          });
          return;
        } catch (error) {
          const acpError = toAcpRuntimeError({
            error,
            fallbackCode: activeTurnStarted
              ? AcpRuntimeErrorCode.ACP_TURN_FAILED
              : AcpRuntimeErrorCode.ACP_SESSION_INIT_FAILED,
            fallbackMessage: activeTurnStarted
              ? "ACP turn failed before completion."
              : "Could not initialize ACP session runtime.",
          });

          // 判断是否应该重试
          retryFreshHandle = attempt === 0 && !sawTurnOutput;

          if (!retryFreshHandle) {
            const backendAttempt: BackendAttempt = {
              backend: describeBackendCandidate(currentBackend),
              error: acpError.message,
              code: acpError.code,
              sawOutput: sawTurnOutput,
            };
            backendAttempts.push(backendAttempt);

            if (
              !isFailoverWorthyBackendError(backendAttempt) ||
              !shouldAttemptBackendFailover({
                backendIndex: backendIdx,
                candidateBackends,
              })
            ) {
              await recordBackendFailure(acpError);
            }
            break;
          }
        } finally {
          if (input.signal && onCallerAbort) {
            input.signal.removeEventListener("abort", onCallerAbort);
          }
          if (activeTurn && params.activeTurnBySession.get(actorKey) === activeTurn) {
            params.activeTurnBySession.delete(actorKey);
          }
          if (!retryFreshHandle && !skipPostTurnCleanup && runtime && handle && meta) {
            try {
              const reconciled = await params.reconcileRuntimeSessionIdentifiers({
                cfg: input.cfg,
                sessionKey,
                runtime,
                handle,
                meta,
                failOnStatusError: false,
              });
              handle = reconciled.handle;
              meta = reconciled.meta;
            } catch (e) {
              console.warn(`Failed to reconcile runtime session identifiers: ${e}`);
            }
          }
          if (
            !retryFreshHandle &&
            !skipPostTurnCleanup &&
            runtime &&
            handle &&
            meta &&
            meta.mode === "oneshot"
          ) {
            try {
              await runtime.close({
                handle,
                reason: "oneshot-complete",
              });
            } catch (error) {
              console.warn(`acp-manager: ACP oneshot close failed for ${sessionKey}: ${String(error)}`);
            } finally {
              params.runtimeHandles.clear(sessionKey);
            }
          }
        }
        if (retryFreshHandle) {
          continue;
        }
      }
    }
  } finally {
    if (acpTurnMarkedActive) {
      clearAcpTurnActive(sessionKey);
    }
  }
}

interface ConsumeAcpTurnStreamParams {
  runtime: AcpRuntime;
  turn: {
    handle: AcpRuntimeHandle;
    text: string;
    attachments?: Array<{ type: "text" | "image" | "file"; content: string; mimeType?: string; name?: string }>;
    mode: string;
    requestId: string;
    signal: AbortSignal;
  };
  onOutputEvent?: (event: { type: string; text?: string; stream?: string }) => void;
  onEvent?: (event: AcpTurnEvent) => void;
}

async function consumeAcpTurnStream(params: ConsumeAcpTurnStreamParams): Promise<void> {
  const { runtime, turn } = params;

  try {
    // 调用运行时的 executeTurn 方法
    const result = await runtime.executeTurn({
      handle: turn.handle,
      text: turn.text,
      attachments: turn.attachments,
      mode: turn.mode as "prompt" | "continue" | "pause" | "resume",
      signal: turn.signal,
      requestId: turn.requestId,
    });

    // 处理流式结果
    if (result.stream) {
      for await (const event of result.stream) {
        params.onOutputEvent?.(event);
        params.onEvent?.(event);
      }
    }
  } catch (error) {
    params.onEvent?.({ type: "error", error: String(error) });
    throw error;
  }
}

interface AwaitTurnWithTimeoutParams {
  turnPromise: Promise<void>;
  timeoutMs: number;
}

async function awaitTurnWithTimeout(params: AwaitTurnWithTimeoutParams): Promise<{
  sawTerminalEvent: boolean;
  timedOut: boolean;
}> {
  let timedOut = false;
  let sawTerminalEvent = false;

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve("timeout");
    }, params.timeoutMs);
  });

  try {
    await params.turnPromise;
    sawTerminalEvent = true;
  } catch {
    // Turn may have failed, but that's ok
  }

  if (timedOut) {
    return { sawTerminalEvent: false, timedOut: true };
  }

  return { sawTerminalEvent, timedOut: false };
}
