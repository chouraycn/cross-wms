// Gateway exec approval manager.
// Tracks pending operator decisions and short-lived resolved approval records.
//
// 降级说明：
//  - openclaw 原始依赖 `@openclaw/normalization-core/number-coercion` 的
//    `resolveExpiresAtMsFromDurationMs` 与 `../shared/number-coercion.js` 的
//    `resolveTimerTimeoutMs`。cross-wms 未移植这两个工具，这里内联最小实现。
//  - `@openclaw/normalization-core/string-coerce` 的 `normalizeLowercaseStringOrEmpty`
//    改从 `../infra/string-coerce.js` 导入。
//  - `../infra/exec-approvals.js` 的 `ExecApprovalDecision`、`ExecApprovalRequestPayload`
//    在 cross-wms 的 infra/exec-approvals 中未导出，这里定义本地占位类型。
import { randomUUID } from "node:crypto";
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";

// ============================================================================
// 降级类型与工具
// ============================================================================

/** Exec 审批决策（降级占位，与 openclaw infra/exec-approvals 保持一致）。 */
export type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

/** Exec 审批请求 payload（降级宽松占位）。 */
export type ExecApprovalRequestPayload = {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
};

/**
 * 根据持续时长与当前时间戳解析过期时间戳（降级实现）。
 *
 * 降级原因：openclaw `@openclaw/normalization-core/number-coercion` 的同名函数
 * 还会处理负数、NaN、Infinity 等边界。这里实现等价语义。
 */
function resolveExpiresAtMsFromDurationMs(
  durationMs: number,
  options?: { nowMs?: number },
): number | undefined {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }
  const nowMs = options?.nowMs ?? Date.now();
  return nowMs + Math.floor(durationMs);
}

/**
 * 解析 timer 超时，至少为 minMs（降级实现）。
 *
 * 降级原因：openclaw `shared/number-coercion.js` 的 resolveTimerTimeoutMs
 * 还会从 env 读取上限。这里仅保证下限。
 */
function resolveTimerTimeoutMs(timeoutMs: number, minMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return minMs;
  }
  return Math.max(minMs, Math.floor(timeoutMs));
}

// ============================================================================
// 主实现
// ============================================================================

// Grace period to keep resolved entries for late awaitDecision calls
const RESOLVED_ENTRY_GRACE_MS = 15_000;

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  const unref = (timer as { unref?: () => void }).unref;
  if (typeof unref === "function") {
    unref.call(timer);
  }
}

function scheduleResolvedEntryCleanup(cleanup: () => void): void {
  // Resolved approvals stay visible briefly so node.invoke sanitizers can
  // consume a just-approved id after the UI decision races the command retry.
  const timer = setTimeout(cleanup, RESOLVED_ENTRY_GRACE_MS);
  unrefTimer(timer);
}

function resolveApprovalTimeoutMs(timeoutMs: number): number {
  return resolveTimerTimeoutMs(timeoutMs, 1);
}

export type ExecApprovalRecord<TPayload = ExecApprovalRequestPayload> = {
  id: string;
  request: TPayload;
  createdAtMs: number;
  expiresAtMs: number;
  // Caller metadata (best-effort). Used to prevent other clients from replaying an approval id.
  requestedByConnId?: string | null;
  requestedByDeviceId?: string | null;
  requestedByClientId?: string | null;
  requestedByDeviceTokenAuth?: boolean;
  approvalReviewerDeviceIds?: string[];
  resolvedAtMs?: number;
  decision?: ExecApprovalDecision;
  consumedDecision?: ExecApprovalDecision;
  resolvedBy?: string | null;
};

type PendingEntry<TPayload = ExecApprovalRequestPayload> = {
  record: ExecApprovalRecord<TPayload>;
  resolve: (decision: ExecApprovalDecision | null) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  promise: Promise<ExecApprovalDecision | null>;
};

export type ExecApprovalIdLookupResult =
  | { kind: "exact" | "prefix"; id: string }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "none" };

export class ExecApprovalManager<TPayload = ExecApprovalRequestPayload> {
  private pending = new Map<string, PendingEntry<TPayload>>();

  create(request: TPayload, timeoutMs: number, id?: string | null): ExecApprovalRecord<TPayload> {
    const now = Date.now();
    const resolvedTimeoutMs = resolveApprovalTimeoutMs(timeoutMs);
    const expiresAtMs = resolveExpiresAtMsFromDurationMs(resolvedTimeoutMs, { nowMs: now });
    if (expiresAtMs === undefined) {
      throw new Error("approval expiry is unavailable");
    }
    const resolvedId = id && id.trim().length > 0 ? id.trim() : randomUUID();
    const record: ExecApprovalRecord<TPayload> = {
      id: resolvedId,
      request,
      createdAtMs: now,
      expiresAtMs,
    };
    return record;
  }

  /**
   * Register an approval record and return a promise that resolves when the decision is made.
   * This separates registration (synchronous) from waiting (async), allowing callers to
   * confirm registration before the decision is made.
   */
  register(
    record: ExecApprovalRecord<TPayload>,
    timeoutMs: number,
  ): Promise<ExecApprovalDecision | null> {
    const existing = this.pending.get(record.id);
    if (existing) {
      // Idempotent: return existing promise if still pending
      if (existing.record.resolvedAtMs === undefined) {
        return existing.promise;
      }
      // Already resolved - don't allow re-registration
      throw new Error(`approval id '${record.id}' already resolved`);
    }
    let resolvePromise: (decision: ExecApprovalDecision | null) => void;
    let rejectPromise: (err: Error) => void;
    const promise = new Promise<ExecApprovalDecision | null>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    // Create entry first so we can capture it in the closure (not re-fetch from map)
    const entry: PendingEntry<TPayload> = {
      record,
      resolve: resolvePromise!,
      reject: rejectPromise!,
      timer: null as unknown as ReturnType<typeof setTimeout>,
      promise,
    };
    const timerDelayMs = resolveApprovalTimeoutMs(timeoutMs);
    entry.timer = setTimeout(() => {
      this.expire(record.id);
    }, timerDelayMs);
    this.pending.set(record.id, entry);
    return promise;
  }

  resolve(recordId: string, decision: ExecApprovalDecision, resolvedBy?: string | null): boolean {
    const pending = this.pending.get(recordId);
    if (!pending) {
      return false;
    }
    // Prevent double-resolve (e.g., if called after timeout already resolved)
    if (pending.record.resolvedAtMs !== undefined) {
      return false;
    }
    clearTimeout(pending.timer);
    pending.record.resolvedAtMs = Date.now();
    pending.record.decision = decision;
    pending.record.resolvedBy = resolvedBy ?? null;
    // Resolve the promise first, then delete after a grace period.
    // This allows in-flight awaitDecision calls to find the resolved entry.
    pending.resolve(decision);
    scheduleResolvedEntryCleanup(() => {
      // Only delete if the entry hasn't been replaced
      if (this.pending.get(recordId) === pending) {
        this.pending.delete(recordId);
      }
    });
    return true;
  }

  expire(recordId: string, resolvedBy?: string | null): boolean {
    const pending = this.pending.get(recordId);
    if (!pending) {
      return false;
    }
    if (pending.record.resolvedAtMs !== undefined) {
      return false;
    }
    clearTimeout(pending.timer);
    pending.record.resolvedAtMs = Date.now();
    pending.record.decision = undefined;
    pending.record.resolvedBy = resolvedBy ?? null;
    pending.resolve(null);
    scheduleResolvedEntryCleanup(() => {
      if (this.pending.get(recordId) === pending) {
        this.pending.delete(recordId);
      }
    });
    return true;
  }

  getSnapshot(recordId: string): ExecApprovalRecord<TPayload> | null {
    const entry = this.pending.get(recordId);
    return entry?.record ?? null;
  }

  listPendingRecords(): ExecApprovalRecord<TPayload>[] {
    return Array.from(this.pending.values())
      .map((entry) => entry.record)
      .filter((record) => record.resolvedAtMs === undefined);
  }

  consumeAllowOnce(recordId: string): boolean {
    const entry = this.pending.get(recordId);
    if (!entry) {
      return false;
    }
    const record = entry.record;
    if (record.decision !== "allow-once") {
      return false;
    }
    // One-time approvals must be consumed atomically so the same runId
    // cannot be replayed during the resolved-entry grace window.
    record.consumedDecision = record.decision;
    record.decision = undefined;
    return true;
  }

  /**
   * Wait for decision on an already-registered approval.
   * Returns the decision promise if the ID is pending, null otherwise.
   */
  awaitDecision(recordId: string): Promise<ExecApprovalDecision | null> | null {
    const entry = this.pending.get(recordId);
    return entry?.promise ?? null;
  }

  lookupApprovalId(
    input: string,
    opts: {
      includeResolved?: boolean;
      filter?: (record: ExecApprovalRecord<TPayload>) => boolean;
    } = {},
  ): ExecApprovalIdLookupResult {
    const normalized = input.trim();
    if (!normalized) {
      return { kind: "none" };
    }

    const exact = this.pending.get(normalized);
    if (exact) {
      return (opts.includeResolved || exact.record.resolvedAtMs === undefined) &&
        (opts.filter?.(exact.record) ?? true)
        ? { kind: "exact", id: normalized }
        : { kind: "none" };
    }

    const lowerPrefix = normalizeLowercaseStringOrEmpty(normalized);
    const matches: string[] = [];
    for (const [id, entry] of this.pending.entries()) {
      if (!opts.includeResolved && entry.record.resolvedAtMs !== undefined) {
        continue;
      }
      if (opts.filter && !opts.filter(entry.record)) {
        continue;
      }
      if (normalizeLowercaseStringOrEmpty(id).startsWith(lowerPrefix)) {
        matches.push(id);
      }
    }

    if (matches.length === 1) {
      return { kind: "prefix", id: matches[0] };
    }
    if (matches.length > 1) {
      return { kind: "ambiguous", ids: matches };
    }
    return { kind: "none" };
  }

  lookupPendingId(input: string): ExecApprovalIdLookupResult {
    return this.lookupApprovalId(input);
  }
}
