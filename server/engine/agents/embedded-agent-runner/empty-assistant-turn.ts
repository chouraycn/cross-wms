/**
 * Detects provider stop turns that contain no assistant-visible content.
 */
import { asFiniteNumber } from "@openclaw/normalization-core/number-coercion";

type EmptyAssistantTurnLike = {
  content?: any;
  stopReason?: any;
  usage?: any;
};

type UsageFieldMap = {
  input?: any;
  output?: any;
  cacheRead?: any;
  cacheWrite?: any;
  total?: any;
  totalTokens?: any;
  total_tokens?: any;
};

// Upstream agent runtimes should normalize Anthropic zero-token empty `stop`
// turns before OpenClaw sees them. Downstream: openclaw/openclaw#71880.
function readFiniteTokenCount(value: any): number | undefined {
  return asFiniteNumber(value);
}

function isZero(value: number | undefined): value is 0 {
  return value === 0;
}

function hasZeroTokenUsageSnapshot(usage: any): boolean {
  if (!usage || typeof usage !== "object") {
    return false;
  }
  const typed = usage as UsageFieldMap;
  const input = readFiniteTokenCount(typed.input);
  const output = readFiniteTokenCount(typed.output);
  const cacheRead = readFiniteTokenCount(typed.cacheRead);
  const cacheWrite = readFiniteTokenCount(typed.cacheWrite);
  const total = readFiniteTokenCount(typed.total ?? typed.totalTokens ?? typed.total_tokens);
  if (total !== undefined) {
    return (
      total === 0 &&
      [input, output, cacheRead, cacheWrite].every((value) => value === undefined || value === 0)
    );
  }
  const components = [input, output, cacheRead, cacheWrite].filter(
    (value): value is number => value !== undefined,
  );
  return components.length > 0 && components.every(isZero);
}

export function isZeroUsageEmptyStopAssistantTurn(message: EmptyAssistantTurnLike | null): boolean {
  return Boolean(
    message &&
    message.stopReason === "stop" &&
    Array.isArray(message.content) &&
    message.content.length === 0 &&
    hasZeroTokenUsageSnapshot(message.usage),
  );
}
