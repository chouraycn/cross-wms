import { logger } from "../../../logger.js";
import type { BotLoopProtectionState } from "./types.js";

const protectionStates = new Map<string, BotLoopProtectionState>();

export interface BotLoopProtectionConfig {
  maxConsecutiveBotMessages?: number;
  minUserMessageIntervalMs?: number;
  autoSuppressAfter?: number;
  suppressionCooldownMs?: number;
}

const defaultConfig: Required<BotLoopProtectionConfig> = {
  maxConsecutiveBotMessages: 5,
  minUserMessageIntervalMs: 60000,
  autoSuppressAfter: 10,
  suppressionCooldownMs: 300000,
};

let config = { ...defaultConfig };

export function configureBotLoopProtection(cfg: BotLoopProtectionConfig): void {
  config = { ...config, ...cfg };
  logger.debug(`[Turn:BotLoopProtection] Config updated`);
}

export function getLoopProtectionState(conversationId: string): BotLoopProtectionState {
  let state = protectionStates.get(conversationId);
  if (!state) {
    state = {
      conversationId,
      consecutiveBotMessages: 0,
      lastBotMessageAt: 0,
      lastUserMessageAt: 0,
      isSuppressed: false,
    };
    protectionStates.set(conversationId, state);
  }
  return state;
}

export function recordBotMessage(conversationId: string): BotLoopProtectionState {
  const state = getLoopProtectionState(conversationId);
  const now = Date.now();

  state.consecutiveBotMessages++;
  state.lastBotMessageAt = now;

  if (state.consecutiveBotMessages >= config.autoSuppressAfter) {
    state.isSuppressed = true;
    state.suppressionReason = `Exceeded ${config.autoSuppressAfter} consecutive bot messages`;
    logger.warn(`[Turn:BotLoopProtection] Suppressed ${conversationId}: ${state.suppressionReason}`);
  }

  return { ...state };
}

export function recordUserMessage(conversationId: string): BotLoopProtectionState {
  const state = getLoopProtectionState(conversationId);
  const now = Date.now();

  state.lastUserMessageAt = now;
  state.consecutiveBotMessages = 0;

  if (state.isSuppressed && now - state.lastBotMessageAt > config.suppressionCooldownMs) {
    state.isSuppressed = false;
    state.suppressionReason = undefined;
    logger.debug(`[Turn:BotLoopProtection] Released suppression for ${conversationId}`);
  }

  return { ...state };
}

export function checkLoopRisk(conversationId: string): {
  isSafe: boolean;
  risk: "low" | "medium" | "high";
  reason?: string;
} {
  const state = getLoopProtectionState(conversationId);
  const now = Date.now();

  if (state.isSuppressed) {
    return {
      isSafe: false,
      risk: "high",
      reason: state.suppressionReason ?? "Bot loop protection active",
    };
  }

  if (state.consecutiveBotMessages >= config.maxConsecutiveBotMessages) {
    return {
      isSafe: false,
      risk: "high",
      reason: `Too many consecutive bot messages (${state.consecutiveBotMessages})`,
    };
  }

  if (
    state.consecutiveBotMessages > 0 &&
    now - state.lastUserMessageAt > config.minUserMessageIntervalMs
  ) {
    return {
      isSafe: false,
      risk: "medium",
      reason: "No user message within expected interval",
    };
  }

  return { isSafe: true, risk: "low" };
}

export function isBotSuppressed(conversationId: string): boolean {
  return getLoopProtectionState(conversationId).isSuppressed;
}

export function resetLoopProtection(conversationId: string): void {
  protectionStates.delete(conversationId);
  logger.debug(`[Turn:BotLoopProtection] Reset for ${conversationId}`);
}

export function clearAllLoopProtection(): void {
  protectionStates.clear();
}

export function getProtectionStats(): {
  total: number;
  suppressed: number;
  highRisk: number;
} {
  let suppressed = 0;
  let highRisk = 0;

  for (const state of protectionStates.values()) {
    if (state.isSuppressed) suppressed++;
    if (state.consecutiveBotMessages >= config.maxConsecutiveBotMessages) highRisk++;
  }

  return {
    total: protectionStates.size,
    suppressed,
    highRisk,
  };
}
