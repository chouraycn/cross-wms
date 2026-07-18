/**
 * 反应级别 — 通道插件的 ACK 和代理反应控制
 * 参考 openclaw/src/utils/reaction-level.ts
 */

export type ReactionLevel = "off" | "ack" | "minimal" | "extensive";

export type ResolvedReactionLevel = {
  level: ReactionLevel;
  ackEnabled: boolean;
  agentReactionsEnabled: boolean;
  agentReactionGuidance?: "minimal" | "extensive";
};

const LEVELS = new Set<ReactionLevel>(["off", "ack", "minimal", "extensive"]);

function parseLevel(
  value: unknown,
): { kind: "missing" } | { kind: "invalid" } | { kind: "ok"; value: ReactionLevel } {
  if (value === undefined || value === null) {
    return { kind: "missing" };
  }
  if (typeof value !== "string") {
    return { kind: "invalid" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: "missing" };
  }
  if (LEVELS.has(trimmed as ReactionLevel)) {
    return { kind: "ok", value: trimmed as ReactionLevel };
  }
  return { kind: "invalid" };
}

export function resolveReactionLevel(params: {
  value: unknown;
  defaultLevel: ReactionLevel;
  invalidFallback: "ack" | "minimal";
}): ResolvedReactionLevel {
  const parsed = parseLevel(params.value);
  const effective =
    parsed.kind === "ok"
      ? parsed.value
      : parsed.kind === "missing"
        ? params.defaultLevel
        : params.invalidFallback;

  switch (effective) {
    case "off":
      return { level: "off", ackEnabled: false, agentReactionsEnabled: false };
    case "ack":
      return { level: "ack", ackEnabled: true, agentReactionsEnabled: false };
    case "minimal":
      return {
        level: "minimal",
        ackEnabled: false,
        agentReactionsEnabled: true,
        agentReactionGuidance: "minimal",
      };
    case "extensive":
      return {
        level: "extensive",
        ackEnabled: false,
        agentReactionsEnabled: true,
        agentReactionGuidance: "extensive",
      };
    default:
      return {
        level: "minimal",
        ackEnabled: false,
        agentReactionsEnabled: true,
        agentReactionGuidance: "minimal",
      };
  }
}