/**
 * Cron Store Payload Codec - Payload 编解码
 *
 * 处理 cron payload 变体的编码和解码，支持 systemEvent、agentTurn 和 command 三种类型。
 */

import type { CronPayload } from "../types.js";
import { parseJsonValue, serializeJson, parseJsonArray, integerToBoolean, booleanToInteger } from "./scalar-codec.js";

/**
 * 将 cron payload 序列化为 JSON 兼容的对象
 */
export function encodePayload(payload: CronPayload): Record<string, unknown> {
  if (payload.kind === "systemEvent") {
    return {
      kind: "systemEvent",
      text: payload.text,
    };
  }
  if (payload.kind === "command") {
    const { timeoutSeconds: _timeoutSeconds, ...rest } = payload;
    return {
      kind: "command",
      message: serializeJson(rest),
      timeoutSeconds: payload.timeoutSeconds ?? null,
    };
  }
  return {
    kind: "agentTurn",
    message: payload.message,
    model: payload.model ?? null,
    fallbacks: serializeJson(payload.fallbacks),
    thinking: payload.thinking ?? null,
    timeoutSeconds: payload.timeoutSeconds ?? null,
    allowUnsafeExternalContent: booleanToInteger(payload.allowUnsafeExternalContent),
    lightContext: booleanToInteger(payload.lightContext),
    toolsAllow: serializeJson(payload.toolsAllow),
  };
}

/**
 * 从原始记录中重建 cron payload，对于无效行返回 null
 */
export function decodePayload(row: Record<string, unknown>): CronPayload | null {
  const kind = row.kind ?? row.payload_kind;
  if (kind === "systemEvent") {
    const text = row.text ?? row.payload_message;
    return typeof text === "string" ? { kind: "systemEvent", text } : null;
  }
  if (kind === "agentTurn") {
    const message = row.message ?? row.payload_message;
    if (typeof message !== "string") {
      return null;
    }
    const fallbacksJson = row.fallbacks ?? row.payload_fallbacks_json;
    const fallbacks = typeof fallbacksJson === "string"
      ? parseJsonArray(fallbacksJson)
      : Array.isArray(fallbacksJson) ? fallbacksJson.filter((x): x is string => typeof x === "string") : undefined;
    const timeoutSeconds = typeof row.timeoutSeconds === "number"
      ? row.timeoutSeconds
      : typeof row.payload_timeout_seconds === "number"
        ? row.payload_timeout_seconds
        : undefined;
    const allowUnsafeExternalContent = row.allowUnsafeExternalContent !== undefined
      ? integerToBoolean(row.allowUnsafeExternalContent as number)
      : row.payload_allow_unsafe_external_content !== undefined
        ? integerToBoolean(row.payload_allow_unsafe_external_content as number)
        : undefined;
    const lightContext = row.lightContext !== undefined
      ? integerToBoolean(row.lightContext as number)
      : row.payload_light_context !== undefined
        ? integerToBoolean(row.payload_light_context as number)
        : undefined;
    const toolsAllowJson = row.toolsAllow ?? row.payload_tools_allow_json;
    const toolsAllow = typeof toolsAllowJson === "string"
      ? parseJsonArray(toolsAllowJson)
      : Array.isArray(toolsAllowJson) ? toolsAllowJson.filter((x): x is string => typeof x === "string") : undefined;
    return {
      kind: "agentTurn",
      message,
      ...(typeof row.model === "string" ? { model: row.model } : typeof row.payload_model === "string" ? { model: row.payload_model } : {}),
      ...(fallbacks ? { fallbacks } : {}),
      ...(typeof row.thinking === "string" ? { thinking: row.thinking } : typeof row.payload_thinking === "string" ? { thinking: row.payload_thinking } : {}),
      ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
      ...(allowUnsafeExternalContent !== undefined ? { allowUnsafeExternalContent } : {}),
      ...(lightContext !== undefined ? { lightContext } : {}),
      ...(toolsAllow ? { toolsAllow } : {}),
    };
  }
  if (kind === "command") {
    const messageRaw = row.message ?? row.payload_message;
    const command = typeof messageRaw === "string"
      ? parseCommandPayloadMessage(messageRaw)
      : parseCommandPayloadFromRecord(row);
    if (!command) {
      return null;
    }
    const timeoutSeconds = typeof row.timeoutSeconds === "number"
      ? row.timeoutSeconds
      : typeof row.payload_timeout_seconds === "number"
        ? row.payload_timeout_seconds
        : undefined;
    return {
      kind: "command",
      ...command,
      ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
    };
  }
  return null;
}

function parseCommandPayloadMessage(raw: string): Omit<Extract<CronPayload, { kind: "command" }>, "kind" | "timeoutSeconds"> | null {
  const parsed = parseJsonValue<unknown>(raw, undefined);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parseCommandPayloadFromRecord(parsed as Record<string, unknown>);
}

function parseCommandPayloadFromRecord(record: Record<string, unknown>): Omit<Extract<CronPayload, { kind: "command" }>, "kind" | "timeoutSeconds"> | null {
  if (
    !Array.isArray(record.argv) ||
    record.argv.length === 0 ||
    record.argv.some((value) => typeof value !== "string" || value.length === 0)
  ) {
    return null;
  }
  const argv = record.argv.map((value) => String(value));
  const env =
    record.env && typeof record.env === "object" && !Array.isArray(record.env)
      ? Object.fromEntries(
          Object.entries(record.env as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;
  const noOutputTimeoutSeconds = typeof record.noOutputTimeoutSeconds === "number"
    ? record.noOutputTimeoutSeconds
    : undefined;
  const outputMaxBytes = typeof record.outputMaxBytes === "number"
    ? record.outputMaxBytes
    : undefined;
  return {
    argv,
    ...(typeof record.cwd === "string" && record.cwd.trim() ? { cwd: record.cwd } : {}),
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
    ...(typeof record.input === "string" ? { input: record.input } : {}),
    ...(noOutputTimeoutSeconds !== undefined ? { noOutputTimeoutSeconds } : {}),
    ...(outputMaxBytes !== undefined && outputMaxBytes > 0 ? { outputMaxBytes } : {}),
  };
}
