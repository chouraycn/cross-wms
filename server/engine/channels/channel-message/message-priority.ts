import type { ChannelMessage } from "../../../channels/message/types.js";

export type MessagePriority = "low" | "normal" | "high" | "critical";

export const PRIORITY_VALUES: Record<MessagePriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export interface PriorityRule {
  id: string;
  priority: MessagePriority;
  condition: (message: ChannelMessage) => boolean;
  weight: number;
}

const priorityRules: PriorityRule[] = [];

export function addPriorityRule(rule: PriorityRule): void {
  priorityRules.push(rule);
  priorityRules.sort((a, b) => b.weight - a.weight);
}

export function removePriorityRule(ruleId: string): boolean {
  const idx = priorityRules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return false;
  priorityRules.splice(idx, 1);
  return true;
}

export function listPriorityRules(): PriorityRule[] {
  return [...priorityRules];
}

export function clearPriorityRules(): void {
  priorityRules.length = 0;
}

export function determinePriority(message: ChannelMessage): MessagePriority {
  for (const rule of priorityRules) {
    if (rule.condition(message)) {
      return rule.priority;
    }
  }

  return calculateDefaultPriority(message);
}

export function calculateDefaultPriority(message: ChannelMessage): MessagePriority {
  let score = PRIORITY_VALUES.normal;

  const kind = message.metadata?.kind as string | undefined;
  if (kind === "command") {
    score += 1;
  }

  if (kind === "system") {
    score += 2;
  }

  if (message.content.length > 1000) {
    score -= 1;
  }

  if (message.metadata?.urgent === true) {
    score += 2;
  }

  if (message.metadata?.priority) {
    const metaPriority = message.metadata.priority as MessagePriority;
    if (PRIORITY_VALUES[metaPriority]) {
      return metaPriority;
    }
  }

  score = Math.max(PRIORITY_VALUES.low, Math.min(PRIORITY_VALUES.critical, score));

  for (const [priority, value] of Object.entries(PRIORITY_VALUES)) {
    if (value === score) {
      return priority as MessagePriority;
    }
  }

  return "normal";
}

export function comparePriority(a: MessagePriority, b: MessagePriority): number {
  return PRIORITY_VALUES[a] - PRIORITY_VALUES[b];
}

export function isHigherPriority(a: MessagePriority, b: MessagePriority): boolean {
  return PRIORITY_VALUES[a] > PRIORITY_VALUES[b];
}

export function isLowerPriority(a: MessagePriority, b: MessagePriority): boolean {
  return PRIORITY_VALUES[a] < PRIORITY_VALUES[b];
}

export function getPriorityLabel(priority: MessagePriority): string {
  const labels: Record<MessagePriority, string> = {
    low: "低",
    normal: "普通",
    high: "高",
    critical: "紧急",
  };
  return labels[priority];
}

export function getPriorityColor(priority: MessagePriority): string {
  const colors: Record<MessagePriority, string> = {
    low: "gray",
    normal: "blue",
    high: "orange",
    critical: "red",
  };
  return colors[priority];
}