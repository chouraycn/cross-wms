/**
 * sessions_history built-in tool.
 *
 * Reads bounded, redacted session transcript history after session visibility filtering.
 *
 * Ported from openclaw/src/agents/tools/sessions-history-tool.ts.
 *
 * cross-wms adjustments:
 * - Replaced `@openclaw/normalization-core/string-coerce` import of `readStringValue`
 *   with `../../infra/string-coerce.js` because cross-wms exposes it there.
 * - Replaced `../../config/config.js` import of `getRuntimeConfig` with a local stub
 *   because cross-wms does not export `getRuntimeConfig`; the tool accepts an explicit
 *   `config` option so the stub is only a fallback.
 * - Replaced `../../gateway/call.js` import of `callGateway` with
 *   `../../gateway/call.runtime.js` because cross-wms keeps the stub there.
 * - Replaced `../../gateway/session-transcript-readers.js` import of
 *   `capArrayByJsonBytes` with `../../gateway/session-utils.fs.js` because cross-wms
 *   keeps that helper there.
 * - Replaced `../../logging/redact.js` import of `redactToolPayloadText` with a local
 *   identity stub because cross-wms does not expose that redaction helper.
 * - Replaced `../../utils.js` import of `truncateUtf16Safe` with
 *   `../../utils/string.js` because cross-wms keeps it there.
 * - Replaced `../schema/typebox.js` import of `optionalPositiveIntegerSchema` with
 *   `../typebox.js` because cross-wms keeps it at `agents/typebox.ts`.
 * - Visibility helpers (`createSessionVisibilityGuard`, `createAgentToAgentPolicy`,
 *   `resolveEffectiveSessionToolsVisibility`) and `resolveSandboxedSessionToolContext`
 *   are imported from `./sessions-access.js`, which re-exports the visibility helpers
 *   from `../../plugin-sdk/session-visibility.js`.
 * - `resolveSessionReference` and `resolveVisibleSessionReference` are not present in
 *   cross-wms `sessions-resolution.ts`; local stubs are added that short-circuit to
 *   an "ok" resolution using the input key. The downstream gateway call is also a stub,
 *   so this preserves type safety without changing runtime behavior.
 * - `jsonResult`, `readPositiveIntegerParam`, `readStringParam` from openclaw
 *   `./common.js` are not exported by cross-wms common.ts, so local helpers are added.
 */
import { Type } from "typebox";
import { readStringValue } from "../../infra/string-coerce.js";
import { jsonUtf8Bytes } from "../../infra/json-utf8-bytes.js";
import { truncateUtf16Safe } from "../../utils/string.js";
import { optionalPositiveIntegerSchema } from "../typebox.js";
import {
  describeSessionsHistoryTool,
  SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY,
} from "../tool-description-presets.js";
import { stripToolMessages } from "./chat-history-text.js";
import type { AnyAgentTool, AgentToolResult } from "./common.js";
import { callGateway } from "../../gateway/call.runtime.js";
import { capArrayByJsonBytes } from "../../gateway/session-utils.fs.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  createAgentToAgentPolicy,
  createSessionVisibilityGuard,
  resolveEffectiveSessionToolsVisibility,
  resolveSandboxedSessionToolContext,
} from "./sessions-access.js";

const SessionsHistoryToolSchema = Type.Object({
  sessionKey: Type.String(),
  limit: optionalPositiveIntegerSchema() as unknown as ReturnType<typeof Type.Optional>,
  includeTools: Type.Optional(Type.Boolean()),
});

const SESSIONS_HISTORY_MAX_BYTES = 80 * 1024;
const SESSIONS_HISTORY_TEXT_MAX_CHARS = 4000;
type GatewayCaller = typeof callGateway;

/** Local stub for openclaw `getRuntimeConfig`. cross-wms does not export it. */
function getRuntimeConfig(): OpenClawConfig {
  return {} as OpenClawConfig;
}

/** Local identity stub for openclaw `redactToolPayloadText`. cross-wms does not expose it. */
function redactToolPayloadText<T>(value: T): T {
  return value;
}

/** Reads a string param from a params record. */
function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options?: { required?: boolean; trim?: boolean },
): string {
  const value = params[key];
  if (typeof value !== "string") {
    if (options?.required) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return "";
  }
  return options?.trim === false ? value : value.trim();
}

/** Reads a positive integer param from a params record. */
function readPositiveIntegerParam(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

/** Serializes a payload as a JSON text content block. */
function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

type SessionReferenceResolution =
  | {
      ok: true;
      key: string;
      displayKey: string;
      resolvedViaSessionId: boolean;
    }
  | { ok: false; status: "error" | "forbidden"; error: string };

type VisibleSessionReferenceResolution =
  | {
      ok: true;
      key: string;
      displayKey: string;
    }
  | {
      ok: false;
      status: "forbidden";
      error: string;
      displayKey: string;
    };

/**
 * Local stub for openclaw `resolveSessionReference`. cross-wms does not yet expose
 * this resolver; short-circuits to an "ok" resolution using the trimmed input key.
 */
async function resolveSessionReference(params: {
  sessionKey: string;
  alias: string;
  mainKey: string;
  requesterInternalKey?: string;
  restrictToSpawned: boolean;
}): Promise<SessionReferenceResolution> {
  const key = params.sessionKey.trim();
  return {
    ok: true,
    key,
    displayKey: key,
    resolvedViaSessionId: false,
  };
}

/**
 * Local stub for openclaw `resolveVisibleSessionReference`. cross-wms does not yet
 * expose this resolver; short-circuits to an "ok" resolution using the resolved key.
 */
async function resolveVisibleSessionReference(params: {
  resolvedSession: Extract<SessionReferenceResolution, { ok: true }>;
  requesterSessionKey: string;
  restrictToSpawned: boolean;
  visibilitySessionKey: string;
}): Promise<VisibleSessionReferenceResolution> {
  return {
    ok: true,
    key: params.resolvedSession.key,
    displayKey: params.resolvedSession.displayKey,
  };
}

// sandbox policy handling is shared with sessions-list-tool via sessions-helpers.ts

function truncateHistoryText(text: string): {
  text: string;
  truncated: boolean;
  redacted: boolean;
} {
  // sessions_history is a tool surface, not a log sink. Keep it redacted even
  // when operators disable general-purpose log redaction.
  const sanitized = redactToolPayloadText(text);
  const redacted = sanitized !== text;
  if (sanitized.length <= SESSIONS_HISTORY_TEXT_MAX_CHARS) {
    return { text: sanitized, truncated: false, redacted };
  }
  const cut = truncateUtf16Safe(sanitized, SESSIONS_HISTORY_TEXT_MAX_CHARS);
  return { text: `${cut}\n…(truncated)…`, truncated: true, redacted };
}

function sanitizeHistoryContentBlock(block: unknown): {
  block: unknown;
  truncated: boolean;
  redacted: boolean;
} {
  if (!block || typeof block !== "object") {
    return { block, truncated: false, redacted: false };
  }
  const entry = { ...(block as Record<string, unknown>) };
  let truncated = false;
  let redacted = false;
  const type = typeof entry.type === "string" ? entry.type : "";
  if (typeof entry.text === "string") {
    const res = truncateHistoryText(entry.text);
    entry.text = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  }
  if (type === "thinking") {
    if (typeof entry.thinking === "string") {
      const res = truncateHistoryText(entry.thinking);
      entry.thinking = res.text;
      truncated ||= res.truncated;
      redacted ||= res.redacted;
    }
    // The encrypted signature can be extremely large and is not useful for history recall.
    if ("thinkingSignature" in entry) {
      delete entry.thinkingSignature;
      truncated = true;
    }
    if ("openclawReasoningReplay" in entry) {
      delete entry.openclawReasoningReplay;
      truncated = true;
    }
  }
  if (typeof entry.partialJson === "string") {
    const res = truncateHistoryText(entry.partialJson);
    entry.partialJson = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  }
  if (type === "image") {
    const data = readStringValue(entry.data);
    const bytes = data ? data.length : undefined;
    if ("data" in entry) {
      delete entry.data;
      truncated = true;
    }
    entry.omitted = true;
    if (bytes !== undefined) {
      entry.bytes = bytes;
    }
  }
  return { block: entry, truncated, redacted };
}

function sanitizeHistoryMessage(message: unknown): {
  message: unknown;
  truncated: boolean;
  redacted: boolean;
} {
  if (!message || typeof message !== "object") {
    return { message, truncated: false, redacted: false };
  }
  const entry = { ...(message as Record<string, unknown>) };
  let truncated = false;
  let redacted = false;
  // Tool result details often contain very large nested payloads.
  if ("details" in entry) {
    delete entry.details;
    truncated = true;
  }
  if ("usage" in entry) {
    delete entry.usage;
    truncated = true;
  }
  if ("cost" in entry) {
    delete entry.cost;
    truncated = true;
  }

  if (typeof entry.content === "string") {
    const res = truncateHistoryText(entry.content);
    entry.content = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  } else if (Array.isArray(entry.content)) {
    const updated = entry.content.map((block) => sanitizeHistoryContentBlock(block));
    entry.content = updated.map((item) => item.block);
    truncated ||= updated.some((item) => item.truncated);
    redacted ||= updated.some((item) => item.redacted);
  }
  if (typeof entry.text === "string") {
    const res = truncateHistoryText(entry.text);
    entry.text = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  }
  return { message: entry, truncated, redacted };
}

function enforceSessionsHistoryHardCap(params: {
  items: unknown[];
  bytes: number;
  maxBytes: number;
}): { items: unknown[]; bytes: number; hardCapped: boolean } {
  if (params.bytes <= params.maxBytes) {
    return { items: params.items, bytes: params.bytes, hardCapped: false };
  }

  const last = params.items.at(-1);
  const lastOnly = last ? [last] : [];
  const lastBytes = jsonUtf8Bytes(lastOnly);
  if (lastBytes <= params.maxBytes) {
    return { items: lastOnly, bytes: lastBytes, hardCapped: true };
  }

  const placeholder = [
    {
      role: "assistant",
      content: "[sessions_history omitted: message too large]",
    },
  ];
  return { items: placeholder, bytes: jsonUtf8Bytes(placeholder), hardCapped: true };
}

export function createSessionsHistoryTool(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  callGateway?: GatewayCaller;
}): AnyAgentTool {
  return {
    label: "Session History",
    name: "sessions_history",
    displaySummary: SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY,
    description: describeSessionsHistoryTool(),
    parameters: SessionsHistoryToolSchema as unknown as Record<
      string,
      {
        name: string;
        type: "string" | "number" | "boolean" | "object" | "any" | "array";
        description: string;
        required: boolean;
        default?: unknown;
        enum?: string[];
        items?: { type: string };
        properties?: Record<string, unknown>;
      }
    >,
    execute: async (_toolCallId: string, args: unknown) => {
      const params = args as Record<string, unknown>;
      const gatewayCall = opts?.callGateway ?? callGateway;
      const sessionKeyParam = readStringParam(params, "sessionKey", {
        required: true,
      });
      const cfg = opts?.config ?? getRuntimeConfig();
      const { mainKey, alias, effectiveRequesterKey, restrictToSpawned } =
        resolveSandboxedSessionToolContext({
          cfg,
          agentSessionKey: opts?.agentSessionKey,
          sandboxed: opts?.sandboxed,
        });
      const resolvedSession = await resolveSessionReference({
        sessionKey: sessionKeyParam,
        alias,
        mainKey,
        requesterInternalKey: effectiveRequesterKey,
        restrictToSpawned,
      });
      if (!resolvedSession.ok) {
        return jsonResult({ status: resolvedSession.status, error: resolvedSession.error });
      }
      const visibleSession = await resolveVisibleSessionReference({
        resolvedSession,
        requesterSessionKey: effectiveRequesterKey,
        restrictToSpawned,
        visibilitySessionKey: sessionKeyParam,
      });
      if (!visibleSession.ok) {
        return jsonResult({
          status: visibleSession.status,
          error: visibleSession.error,
        });
      }
      // From here on, use the canonical key (sessionId inputs already resolved).
      const resolvedKey = visibleSession.key;
      const displayKey = visibleSession.displayKey;

      const a2aPolicy = createAgentToAgentPolicy(cfg);
      const visibility = resolveEffectiveSessionToolsVisibility({
        cfg,
        sandboxed: opts?.sandboxed === true,
      });
      const visibilityGuard = await createSessionVisibilityGuard({
        action: "history",
        requesterSessionKey: effectiveRequesterKey,
        visibility,
        a2aPolicy,
      });
      const access = visibilityGuard.check(resolvedKey);
      if (!access.allowed) {
        return jsonResult({
          status: access.status,
          error: access.error,
        });
      }

      const limit = readPositiveIntegerParam(params, "limit");
      const includeTools = Boolean(params.includeTools);
      const result = (await (gatewayCall as unknown as (req: unknown) => Promise<{
        messages: Array<unknown>;
      }>)({
        method: "chat.history",
        params: { sessionKey: resolvedKey, limit },
      })) ?? { messages: [] };
      const rawMessages = Array.isArray(result?.messages) ? result.messages : [];
      const selectedMessages = includeTools ? rawMessages : stripToolMessages(rawMessages);
      const sanitizedMessages = selectedMessages.map((message) => sanitizeHistoryMessage(message));
      const contentTruncated = sanitizedMessages.some((entry) => entry.truncated);
      const contentRedacted = sanitizedMessages.some((entry) => entry.redacted);
      const cappedMessages = capArrayByJsonBytes(
        sanitizedMessages.map((entry) => entry.message),
        SESSIONS_HISTORY_MAX_BYTES,
      ) as { items: unknown[]; bytes: number };
      const cappedItems = Array.isArray(cappedMessages?.items) ? cappedMessages.items : [];
      const cappedBytes = typeof cappedMessages?.bytes === "number" ? cappedMessages.bytes : 0;
      const droppedMessages = cappedItems.length < selectedMessages.length;
      const hardened = enforceSessionsHistoryHardCap({
        items: cappedItems,
        bytes: cappedBytes,
        maxBytes: SESSIONS_HISTORY_MAX_BYTES,
      });
      return jsonResult({
        sessionKey: displayKey,
        messages: hardened.items,
        truncated: droppedMessages || contentTruncated || hardened.hardCapped,
        droppedMessages: droppedMessages || hardened.hardCapped,
        contentTruncated,
        contentRedacted,
        bytes: hardened.bytes,
      });
    },
  } as unknown as AnyAgentTool;
}
