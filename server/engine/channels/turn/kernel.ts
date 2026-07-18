import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { TurnContext, TurnStatus, TurnSource } from "./types.js";
import type { ChannelMessage } from "../message/types.js";

const activeTurns = new Map<string, TurnContext>();
const turnHistory = new Map<string, TurnContext[]>();

export function createTurn(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId: string;
  threadId?: string;
  source: TurnSource;
  inputMessage?: ChannelMessage;
  metadata?: Record<string, unknown>;
}): TurnContext {
  const now = Date.now();
  const turnId = `turn-${params.conversationId}-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const turn: TurnContext = {
    turnId,
    channelId: params.channelId,
    accountId: params.accountId,
    conversationId: params.conversationId,
    threadId: params.threadId,
    status: "pending",
    source: params.source,
    inputMessage: params.inputMessage,
    outputMessages: [],
    startedAt: now,
    updatedAt: now,
    metadata: params.metadata ?? {},
  };

  activeTurns.set(turnId, turn);
  addToHistory(turn);

  logger.debug(`[Turn:Kernel] Created turn ${turnId} for conversation ${params.conversationId}`);

  return turn;
}

export function getTurn(turnId: string): TurnContext | undefined {
  return activeTurns.get(turnId);
}

export function updateTurnStatus(turnId: string, status: TurnStatus): boolean {
  const turn = activeTurns.get(turnId);
  if (!turn) return false;

  turn.status = status;
  turn.updatedAt = Date.now();

  if (status === "complete" || status === "failed" || status === "cancelled") {
    turn.completedAt = Date.now();
    activeTurns.delete(turnId);
  }

  logger.debug(`[Turn:Kernel] Turn ${turnId} status -> ${status}`);
  return true;
}

export function addOutputMessage(turnId: string, message: ChannelMessage): boolean {
  const turn = activeTurns.get(turnId);
  if (!turn) return false;

  turn.outputMessages.push(message);
  turn.updatedAt = Date.now();
  return true;
}

export function setTurnMetadata(turnId: string, key: string, value: unknown): boolean {
  const turn = activeTurns.get(turnId);
  if (!turn) return false;

  turn.metadata[key] = value;
  turn.updatedAt = Date.now();
  return true;
}

function addToHistory(turn: TurnContext): void {
  const key = turn.conversationId;
  const history = turnHistory.get(key) ?? [];
  history.push(turn);

  if (history.length > 100) {
    history.shift();
  }

  turnHistory.set(key, history);
}

export function getConversationTurns(conversationId: string, limit?: number): TurnContext[] {
  const history = turnHistory.get(conversationId) ?? [];
  if (limit) {
    return history.slice(-limit);
  }
  return [...history];
}

export function getActiveTurnCount(): number {
  return activeTurns.size;
}

export function getTurnsByChannel(channelId: ChannelId): TurnContext[] {
  return Array.from(activeTurns.values()).filter((t) => t.channelId === channelId);
}

export function cancelTurn(turnId: string, reason?: string): boolean {
  const turn = activeTurns.get(turnId);
  if (!turn) return false;

  turn.status = "cancelled";
  turn.updatedAt = Date.now();
  turn.completedAt = Date.now();
  if (reason) {
    turn.metadata.cancelReason = reason;
  }

  activeTurns.delete(turnId);
  logger.debug(`[Turn:Kernel] Cancelled turn ${turnId}: ${reason ?? "no reason"}`);
  return true;
}

export function clearTurnHistory(conversationId?: string): void {
  if (conversationId) {
    turnHistory.delete(conversationId);
  } else {
    turnHistory.clear();
  }
}
