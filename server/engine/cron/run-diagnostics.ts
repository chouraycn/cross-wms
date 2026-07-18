/**
 * Cron Run Diagnostics - 运行诊断信息
 *
 * 为 cron 运行日志和 UI 界面构建有界的、脱敏的诊断信息。
 * 支持诊断条目的规范化、合并和摘要生成。
 */

import type {
  CronRunDiagnostic,
  CronRunDiagnostics,
  CronRunDiagnosticSeverity,
  CronRunDiagnosticSource,
} from "./types.js";

const MAX_ENTRIES = 10;
const MAX_ENTRY_CHARS = 1_000;
const MAX_SUMMARY_CHARS = 2_000;

function normalizeSeverity(value: unknown): CronRunDiagnosticSeverity {
  return value === "info" || value === "warn" || value === "error" ? value : "error";
}

function normalizeSource(value: unknown): CronRunDiagnosticSource {
  switch (value) {
    case "cron-preflight":
    case "cron-setup":
    case "model-preflight":
    case "agent-run":
    case "tool":
    case "exec":
    case "delivery":
      return value;
    default:
      return "agent-run";
  }
}

function normalizeTimestamp(value: unknown, nowMs: () => number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : nowMs();
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeToolName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeExitCode(value: unknown): number | null | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return value === null ? null : undefined;
}

function normalizeDiagnosticMessage(value: unknown): { message?: string; truncated?: boolean } {
  if (typeof value !== "string") {
    return {};
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  if (trimmed.length <= MAX_ENTRY_CHARS) {
    return { message: trimmed };
  }
  return { message: `${trimmed.slice(0, MAX_ENTRY_CHARS - 1)}…`, truncated: true };
}

function trimSummary(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= MAX_SUMMARY_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}

/**
 * 返回持久化 cron 诊断的操作员可见摘要
 */
export function summarizeCronRunDiagnostics(
  diagnostics: CronRunDiagnostics | undefined,
): string | undefined {
  if (!diagnostics) {
    return undefined;
  }
  return trimSummary(diagnostics.summary ?? diagnostics.entries[0]?.message);
}

/**
 * 将不受信任的 cron 诊断有效负载规范化为有界的条目
 */
export function normalizeCronRunDiagnostics(
  value: unknown,
  opts?: { nowMs?: () => number },
): CronRunDiagnostics | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as { summary?: unknown; entries?: unknown };
  const nowMs = opts?.nowMs ?? Date.now;
  const entriesRaw = Array.isArray(record.entries) ? record.entries : [];
  const entries: CronRunDiagnostic[] = [];
  for (const item of entriesRaw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Partial<CronRunDiagnostic>;
    const normalized = normalizeDiagnosticMessage(entry.message);
    if (!normalized.message) {
      continue;
    }
    entries.push({
      ts: normalizeTimestamp(entry.ts, nowMs),
      source: normalizeSource(entry.source),
      severity: normalizeSeverity(entry.severity),
      message: normalized.message,
      ...(typeof entry.toolName === "string" && entry.toolName.trim()
        ? { toolName: entry.toolName.trim() }
        : {}),
      ...(typeof entry.exitCode === "number" && Number.isFinite(entry.exitCode)
        ? { exitCode: entry.exitCode }
        : entry.exitCode === null
          ? { exitCode: null }
          : {}),
      ...(entry.truncated === true || normalized.truncated ? { truncated: true } : {}),
    });
    if (entries.length > MAX_ENTRIES) {
      entries.shift();
    }
  }
  const summary = trimSummary(
    typeof record.summary === "string" ? record.summary : undefined,
  );
  if (entries.length === 0 && !summary) {
    return undefined;
  }
  return { ...(summary ? { summary } : {}), entries };
}

/**
 * 合并 cron 诊断，同时选择严重程度最高的最新摘要
 */
export function mergeCronRunDiagnostics(
  ...values: Array<CronRunDiagnostics | undefined>
): CronRunDiagnostics | undefined {
  const entries: CronRunDiagnostic[] = [];
  let summaryCandidate: { summary: string; severity: number; order: number } | undefined;
  for (const value of values) {
    const normalized = normalizeCronRunDiagnostics(value);
    if (!normalized) {
      continue;
    }
    const entryCandidate =
      normalized.entries.findLast((entry) => entry.severity === "error") ??
      normalized.entries.findLast((entry) => entry.severity === "warn") ??
      normalized.entries.findLast((entry) => entry.severity === "info");
    const summary = trimSummary(normalized.summary ?? entryCandidate?.message);
    if (summary) {
      const severity =
        entryCandidate?.severity === "error" ? 2 : entryCandidate?.severity === "warn" ? 1 : 0;
      const order = entries.length + normalized.entries.length;
      if (
        !summaryCandidate ||
        severity > summaryCandidate.severity ||
        (severity === summaryCandidate.severity && order >= summaryCandidate.order)
      ) {
        summaryCandidate = { summary, severity, order };
      }
    }
    entries.push(...normalized.entries);
  }
  return normalizeCronRunDiagnostics({
    summary: summaryCandidate?.summary,
    entries,
  });
}

/**
 * 将任意抛出的 cron 错误转换为脱敏的诊断条目
 */
export function createCronRunDiagnosticsFromError(
  source: CronRunDiagnosticSource,
  error: unknown,
  opts?: {
    severity?: CronRunDiagnosticSeverity;
    nowMs?: () => number;
    toolName?: string;
    exitCode?: number | null;
  },
): CronRunDiagnostics | undefined {
  const message = formatUnknownError(error);
  return normalizeCronRunDiagnostics(
    {
      summary: message,
      entries: [
        {
          ts: opts?.nowMs?.() ?? Date.now(),
          source,
          severity: opts?.severity ?? "error",
          message,
          toolName: opts?.toolName,
          exitCode: opts?.exitCode,
        },
      ],
    },
    opts,
  );
}

/**
 * 从工具元数据中提取失败的执行详情到 cron 诊断中
 */
export function createCronRunDiagnosticsFromExecDetails(
  details: unknown,
  opts?: {
    nowMs?: () => number;
    toolName?: string;
    finalStatus?: "ok" | "error" | "skipped";
  },
): CronRunDiagnostics | undefined {
  if (!isRecord(details)) {
    return undefined;
  }
  const status = typeof details.status === "string" ? details.status : undefined;
  const exitCode = normalizeExitCode(details.exitCode);
  const relevant = status === "failed" || (typeof exitCode === "number" && exitCode !== 0);
  if (!relevant) {
    return undefined;
  }
  const aggregated = typeof details.aggregated === "string" ? details.aggregated : undefined;
  const message = aggregated
    ? aggregated
    : typeof exitCode === "number"
      ? `exec failed with exit code ${exitCode}`
      : "exec failed";
  return normalizeCronRunDiagnostics(
    {
      summary: message,
      entries: [
        {
          ts: opts?.nowMs?.() ?? Date.now(),
          source: "exec",
          severity: opts?.finalStatus === "ok" ? "warn" : status === "failed" ? "error" : "warn",
          message,
          toolName: opts?.toolName,
          exitCode,
        },
      ],
    },
    opts,
  );
}
