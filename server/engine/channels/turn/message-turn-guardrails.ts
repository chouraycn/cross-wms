import { logger } from "../../../logger.js";
import type { TurnGuardrailConfig, GuardrailViolation, TurnContext } from "./types.js";
import type { ChannelMessage } from "../message/types.js";

const defaultConfig: Required<TurnGuardrailConfig> = {
  maxTurnsPerConversation: 1000,
  maxTurnsPerMinute: 10,
  minIntervalMs: 500,
  maxInputLength: 10000,
  maxOutputLength: 20000,
  requireUserInput: true,
};

const turnTimestamps = new Map<string, number[]>();

export function configureTurnGuardrails(config: TurnGuardrailConfig): void {
  Object.assign(defaultConfig, config);
  logger.debug(`[Turn:Guardrails] Config updated`);
}

export function validateTurnInput(
  message: ChannelMessage,
  conversationTurns: TurnContext[]
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  if (defaultConfig.maxInputLength && message.content.length > defaultConfig.maxInputLength) {
    violations.push({
      rule: "maxInputLength",
      message: `Input too long: ${message.content.length} > ${defaultConfig.maxInputLength}`,
      severity: "error",
    });
  }

  if (defaultConfig.maxTurnsPerConversation && conversationTurns.length >= defaultConfig.maxTurnsPerConversation) {
    violations.push({
      rule: "maxTurnsPerConversation",
      message: `Too many turns in conversation: ${conversationTurns.length} >= ${defaultConfig.maxTurnsPerConversation}`,
      severity: "error",
    });
  }

  return violations;
}

export function validateTurnRate(conversationId: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const now = Date.now();

  let timestamps = turnTimestamps.get(conversationId) ?? [];
  timestamps = timestamps.filter((t) => now - t < 60000);
  timestamps.push(now);
  turnTimestamps.set(conversationId, timestamps);

  if (defaultConfig.maxTurnsPerMinute && timestamps.length > defaultConfig.maxTurnsPerMinute) {
    violations.push({
      rule: "maxTurnsPerMinute",
      message: `Rate limit exceeded: ${timestamps.length} turns in last minute`,
      severity: "error",
    });
  }

  if (defaultConfig.minIntervalMs && timestamps.length >= 2) {
    const lastTwo = timestamps.slice(-2);
    const interval = lastTwo[1] - lastTwo[0];
    if (interval < defaultConfig.minIntervalMs) {
      violations.push({
        rule: "minIntervalMs",
        message: `Turn interval too short: ${interval}ms < ${defaultConfig.minIntervalMs}ms`,
        severity: "warning",
      });
    }
  }

  return violations;
}

export function validateTurnOutput(
  content: string,
  metadata?: Record<string, unknown>
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  if (defaultConfig.maxOutputLength && content.length > defaultConfig.maxOutputLength) {
    violations.push({
      rule: "maxOutputLength",
      message: `Output too long: ${content.length} > ${defaultConfig.maxOutputLength}`,
      severity: "warning",
    });
  }

  return violations;
}

export function checkTurnGuards(
  message: ChannelMessage,
  conversationTurns: TurnContext[]
): {
  allowed: boolean;
  violations: GuardrailViolation[];
  reason?: string;
} {
  const inputViolations = validateTurnInput(message, conversationTurns);
  const rateViolations = validateTurnRate(message.conversationId ?? "default");
  const allViolations = [...inputViolations, ...rateViolations];

  const errors = allViolations.filter((v) => v.severity === "error");

  return {
    allowed: errors.length === 0,
    violations: allViolations,
    reason: errors.length > 0 ? errors[0].message : undefined,
  };
}

export function hasBlockingViolations(violations: GuardrailViolation[]): boolean {
  return violations.some((v) => v.severity === "error");
}

export function clearGuardrailTimestamps(conversationId?: string): void {
  if (conversationId) {
    turnTimestamps.delete(conversationId);
  } else {
    turnTimestamps.clear();
  }
}
