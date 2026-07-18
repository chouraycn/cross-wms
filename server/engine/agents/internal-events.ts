/**
 * 内部运行时事件的 prompt 格式化。
 *
 * 将后台任务完成事件净化为受保护的 runtime-context 块或普通 prompt 文本。
 */
import {
  formatGeneratedAttachmentLines,
  mediaUrlsFromGeneratedAttachments,
  type AgentGeneratedAttachment,
} from "./generated-attachments.js";
import {
  AGENT_INTERNAL_EVENT_TYPE_TASK_COMPLETION,
  type AgentInternalEventSource,
  type AgentInternalEventStatus,
} from "./internal-event-contract.js";
import {
  escapeInternalRuntimeContextDelimiters,
  INTERNAL_RUNTIME_CONTEXT_BEGIN,
  INTERNAL_RUNTIME_CONTEXT_END,
} from "./internal-runtime-context.js";
import { wrapPromptDataBlock } from "./sanitize-for-prompt.js";

type AgentTaskCompletionInternalEvent = {
  type: typeof AGENT_INTERNAL_EVENT_TYPE_TASK_COMPLETION;
  source: AgentInternalEventSource;
  childSessionKey: string;
  childSessionId?: string;
  announceType: string;
  taskLabel: string;
  status: AgentInternalEventStatus;
  statusLabel: string;
  result: string;
  attachments?: AgentGeneratedAttachment[];
  mediaUrls?: string[];
  statsLine?: string;
  replyInstruction: string;
};

type TaskCompletionPromptMode = "plain" | "protected";

/** 可被渲染进 agent prompt 上下文的内部事件变体。 */
export type AgentInternalEvent = AgentTaskCompletionInternalEvent;

export { INTERNAL_RUNTIME_CONTEXT_BEGIN, INTERNAL_RUNTIME_CONTEXT_END };

function sanitizeSingleLineField(value: string, fallback: string): string {
  const sanitized = escapeInternalRuntimeContextDelimiters(value)
    .replace(/\r?\n+/g, " ")
    .trim();
  return sanitized || fallback;
}

function sanitizeMultilineField(value: string, fallback: string): string {
  const sanitized = escapeInternalRuntimeContextDelimiters(value).replace(/\r\n/g, "\n").trim();
  return sanitized || fallback;
}

function sanitizeMediaDirectiveValue(value: string): string | null {
  let singleLine = "";
  for (const char of escapeInternalRuntimeContextDelimiters(value).replace(/\r?\n/g, " ")) {
    const code = char.charCodeAt(0);
    singleLine += code < 32 || code === 127 ? " " : char;
  }
  const sanitized = singleLine.trim();
  return sanitized || null;
}

function formatChildResultDataBlock(value: string): string {
  return (
    wrapPromptDataBlock({
      label: "Child result",
      text: value,
    }) || "Child result: (no output)"
  );
}

function formatGeneratedMediaDirectiveLines(event: AgentTaskCompletionInternalEvent): string[] {
  const mediaUrls = Array.from(
    new Set(
      [...(event.mediaUrls ?? []), ...mediaUrlsFromGeneratedAttachments(event.attachments)]
        .map(sanitizeMediaDirectiveValue)
        .filter((value): value is string => value !== null),
    ),
  );
  if (mediaUrls.length === 0) {
    return [];
  }
  return ["Generated media:", ...mediaUrls.map((mediaUrl) => `MEDIA:${mediaUrl}`)];
}

function formatTaskCompletionEvent(
  event: AgentTaskCompletionInternalEvent,
  mode: TaskCompletionPromptMode,
): string {
  const sessionKey = sanitizeSingleLineField(event.childSessionKey, "unknown");
  const sessionId = sanitizeSingleLineField(event.childSessionId ?? "unknown", "unknown");
  const announceType = sanitizeSingleLineField(event.announceType, "unknown");
  const taskLabel = sanitizeSingleLineField(event.taskLabel, "unnamed task");
  const statusLabel = sanitizeSingleLineField(event.statusLabel, event.status);
  const result = formatChildResultDataBlock(event.result);
  const attachmentLines = formatGeneratedAttachmentLines(event.attachments);
  const mediaDirectiveLines = formatGeneratedMediaDirectiveLines(event);
  const lines =
    mode === "protected"
      ? ["[Internal task completion event]"]
      : [
          "A background task completed. Use this result to reply to the user in your normal assistant voice.",
          "",
        ];
  lines.push(
    `source: ${event.source}`,
    `session_key: ${sessionKey}`,
    `session_id: ${sessionId}`,
    `type: ${announceType}`,
    `task: ${taskLabel}`,
    `status: ${statusLabel}`,
    "",
    result,
  );
  if (attachmentLines.length > 0) {
    lines.push("", ...attachmentLines);
  }
  if (mediaDirectiveLines.length > 0) {
    lines.push("", ...mediaDirectiveLines);
  }
  if (event.statsLine?.trim()) {
    lines.push("", sanitizeMultilineField(event.statsLine, ""));
  }
  lines.push(
    "",
    mode === "protected" ? "Action:" : "Instruction:",
    sanitizeMultilineField(event.replyInstruction, ""),
  );
  return lines.join("\n");
}

/** 为受保护的 runtime-context prompt 块格式化内部运行时事件。 */
export function formatAgentInternalEventsForPrompt(events?: AgentInternalEvent[]): string {
  if (!events || events.length === 0) {
    return "";
  }
  const blocks = events
    .map((event) => {
      if (event.type === "task_completion") {
        return formatTaskCompletionEvent(event, "protected");
      }
      return "";
    })
    .filter((value) => value.trim().length > 0);
  if (blocks.length === 0) {
    return "";
  }
  return [
    INTERNAL_RUNTIME_CONTEXT_BEGIN,
    "OpenClaw runtime context (internal):",
    "This context is runtime-generated, not user-authored. Keep internal details private.",
    "",
    blocks.join("\n\n---\n\n"),
    INTERNAL_RUNTIME_CONTEXT_END,
  ].join("\n");
}

/** 为缺少上下文分隔符的普通 prompt 格式化内部运行时事件。 */
export function formatAgentInternalEventsForPlainPrompt(events?: AgentInternalEvent[]): string {
  if (!events || events.length === 0) {
    return "";
  }
  return events
    .map((event) => {
      if (event.type === "task_completion") {
        return formatTaskCompletionEvent(event, "plain");
      }
      return "";
    })
    .filter((value) => value.trim().length > 0)
    .join("\n\n---\n\n");
}
