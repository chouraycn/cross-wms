/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/bootstrap.ts
 *
 * Bootstrap context building and sanitization for embedded-agent sessions.
 * Simplified for cross-wms: no config-dependent agent resolution.
 */

export const DEFAULT_BOOTSTRAP_MAX_CHARS = 20_000;
export const DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS = 60_000;
export const DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE = "always";

const BOOTSTRAP_HEAD_RATIO = 0.75;
const BOOTSTRAP_TAIL_RATIO = 0.25;
const MIN_BOOTSTRAP_TRIMMED_CONTENT_CHARS = 16;

type EmbeddedContextFile = {
  path: string;
  content: string;
};

type WorkspaceBootstrapFile = {
  name: string;
  path?: string;
  content?: string;
  missing?: boolean;
};

/** Resolve the maximum characters allowed for bootstrap context. */
export function resolveBootstrapMaxChars(
  cfg?: { agents?: { defaults?: { bootstrapMaxChars?: number } } },
  _agentId?: string | null,
): number {
  const raw = cfg?.agents?.defaults?.bootstrapMaxChars;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_BOOTSTRAP_MAX_CHARS;
}

/** Resolve the total maximum characters across all bootstrap files. */
export function resolveBootstrapTotalMaxChars(
  cfg?: { agents?: { defaults?: { bootstrapTotalMaxChars?: number } } },
  _agentId?: string | null,
): number {
  const raw = cfg?.agents?.defaults?.bootstrapTotalMaxChars;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS;
}

/** Resolve the prompt truncation warning mode. */
export function resolveBootstrapPromptTruncationWarningMode(
  cfg?: { agents?: { defaults?: { bootstrapPromptTruncationWarning?: string } } },
): "off" | "once" | "always" {
  const raw = cfg?.agents?.defaults?.bootstrapPromptTruncationWarning;
  if (raw === "off" || raw === "once" || raw === "always") {
    return raw;
  }
  return DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE;
}

function truncateUtf16Safe(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars);
}

function trimBootstrapContent(content: string, fileName: string, maxChars: number): {
  content: string;
  truncated: boolean;
} {
  const trimmed = content.trimEnd();
  if (trimmed.length <= maxChars) {
    return { content: trimmed, truncated: false };
  }

  const marker = `\n[…truncated ${fileName}: kept head+tail chars of ${trimmed.length}]\n`;
  const contentBudget = maxChars - marker.length;
  if (contentBudget < MIN_BOOTSTRAP_TRIMMED_CONTENT_CHARS) {
    return { content: truncateUtf16Safe(trimmed, maxChars), truncated: true };
  }

  const headChars = Math.floor(contentBudget * BOOTSTRAP_HEAD_RATIO);
  const tailChars = Math.floor(contentBudget * BOOTSTRAP_TAIL_RATIO);
  const head = trimmed.slice(0, headChars);
  const tail = tailChars > 0 ? trimmed.slice(-tailChars) : "";
  const result = head + marker + tail;
  return {
    content: result.length > maxChars ? truncateUtf16Safe(result, maxChars) : result,
    truncated: true,
  };
}

/** Strip Claude-style thought_signature fields from content blocks. */
export function stripThoughtSignatures<T>(content: T): T {
  if (!Array.isArray(content)) {
    return content;
  }
  return content.map((block) => {
    if (!block || typeof block !== "object") {
      return block;
    }
    const rec = block as Record<string, unknown>;
    if (typeof rec.thought_signature === "string" && rec.thought_signature.startsWith("msg_")) {
      const next = { ...rec };
      delete next.thought_signature;
      return next;
    }
    return block;
  }) as T;
}

/** Ensure a session header file exists. */
export async function ensureSessionHeader(_params: {
  sessionFile: string;
  sessionId: string;
  cwd: string;
}): Promise<void> {
  // Simplified: no-op in cross-wms (session file management is handled elsewhere)
}

/** Build bootstrap context files from workspace bootstrap files. */
export function buildBootstrapContextFiles(
  files: WorkspaceBootstrapFile[],
  opts?: { warn?: (message: string) => void; maxChars?: number; totalMaxChars?: number },
): EmbeddedContextFile[] {
  const maxChars = opts?.maxChars ?? DEFAULT_BOOTSTRAP_MAX_CHARS;
  const totalMaxChars = Math.max(
    1,
    Math.floor(opts?.totalMaxChars ?? Math.max(maxChars, DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS)),
  );
  let remainingTotalChars = totalMaxChars;
  const result: EmbeddedContextFile[] = [];

  for (const file of files) {
    if (remainingTotalChars <= 0) {
      break;
    }
    const pathValue = file.path?.trim() ?? "";
    if (!pathValue) {
      continue;
    }
    if (file.missing) {
      const missingText = `[MISSING] Expected at: ${pathValue}`;
      if (missingText.length <= remainingTotalChars) {
        remainingTotalChars -= missingText.length;
        result.push({ path: pathValue, content: missingText });
      }
      continue;
    }
    const fileMaxChars = Math.min(maxChars, remainingTotalChars);
    const trimmed = trimBootstrapContent(file.content ?? "", file.name, fileMaxChars);
    if (trimmed.content.length <= remainingTotalChars) {
      if (trimmed.truncated) {
        opts?.warn?.(
          `workspace bootstrap file ${file.name} truncated in injected context`,
        );
      }
      remainingTotalChars -= trimmed.content.length;
      result.push({ path: pathValue, content: trimmed.content });
    }
  }
  return result;
}

/** Sanitize Google turn ordering for assistant messages. */
export function sanitizeGoogleTurnOrdering<T>(messages: T[]): T[] {
  return messages;
}
