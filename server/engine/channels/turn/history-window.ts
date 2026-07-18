import { logger } from "../../../logger.js";
import type { TurnContext, TurnWindow } from "./types.js";
import { getConversationTurns } from "./kernel.js";

export interface HistoryWindowOptions {
  maxTurns?: number;
  maxAgeMs?: number;
  includeFailed?: boolean;
  includeCancelled?: boolean;
}

const defaultOptions: Required<HistoryWindowOptions> = {
  maxTurns: 20,
  maxAgeMs: 60 * 60 * 1000,
  includeFailed: false,
  includeCancelled: false,
};

export function getTurnHistoryWindow(
  conversationId: string,
  options: HistoryWindowOptions = {}
): TurnWindow {
  const opts = { ...defaultOptions, ...options };
  const allTurns = getConversationTurns(conversationId);
  const now = Date.now();

  let filtered = allTurns.filter((turn) => {
    if (!opts.includeFailed && turn.status === "failed") return false;
    if (!opts.includeCancelled && turn.status === "cancelled") return false;
    if (now - turn.startedAt > opts.maxAgeMs) return false;
    return true;
  });

  if (opts.maxTurns > 0 && filtered.length > opts.maxTurns) {
    filtered = filtered.slice(-opts.maxTurns);
  }

  const window: TurnWindow = {
    turns: filtered,
    windowStart: filtered.length > 0 ? filtered[0].startedAt : now,
    windowEnd: filtered.length > 0 ? filtered[filtered.length - 1].updatedAt : now,
    count: filtered.length,
  };

  logger.debug(`[Turn:HistoryWindow] Window for ${conversationId}: ${filtered.length} turns`);

  return window;
}

export function getRecentTurns(
  conversationId: string,
  count: number
): TurnContext[] {
  const window = getTurnHistoryWindow(conversationId, { maxTurns: count });
  return window.turns;
}

export function getTurnsInTimeRange(
  conversationId: string,
  startTime: number,
  endTime: number
): TurnContext[] {
  const allTurns = getConversationTurns(conversationId);
  return allTurns.filter(
    (turn) => turn.startedAt >= startTime && turn.startedAt <= endTime
  );
}

export function getTurnCountInWindow(
  conversationId: string,
  windowMs: number
): number {
  const now = Date.now();
  const allTurns = getConversationTurns(conversationId);
  return allTurns.filter((turn) => now - turn.startedAt <= windowMs).length;
}

export function getLastUserTurn(conversationId: string): TurnContext | undefined {
  const allTurns = getConversationTurns(conversationId);
  for (let i = allTurns.length - 1; i >= 0; i--) {
    if (allTurns[i].source === "user") {
      return allTurns[i];
    }
  }
  return undefined;
}

export function getLastBotTurn(conversationId: string): TurnContext | undefined {
  const allTurns = getConversationTurns(conversationId);
  for (let i = allTurns.length - 1; i >= 0; i--) {
    if (allTurns[i].source === "bot") {
      return allTurns[i];
    }
  }
  return undefined;
}

export function formatHistoryForPrompt(
  window: TurnWindow,
  maxLength?: number
): string {
  const lines: string[] = [];
  let totalLength = 0;

  for (const turn of window.turns) {
    if (turn.inputMessage) {
      const userLine = `User: ${turn.inputMessage.content}`;
      if (maxLength && totalLength + userLine.length > maxLength) break;
      lines.push(userLine);
      totalLength += userLine.length;
    }

    for (const output of turn.outputMessages) {
      const botLine = `Assistant: ${output.content}`;
      if (maxLength && totalLength + botLine.length > maxLength) break;
      lines.push(botLine);
      totalLength += botLine.length;
    }
  }

  return lines.join("\n");
}
