import { logger } from "../../../logger.js";
import type { InboundEventContext, InboundEventClassification } from "./types.js";

export type ClassificationRule = {
  id: string;
  match: (event: InboundEventContext) => boolean;
  classify: (event: InboundEventContext) => Partial<InboundEventClassification>;
  priority: number;
};

const classificationRules: ClassificationRule[] = [];

export function registerClassificationRule(rule: ClassificationRule): void {
  classificationRules.push(rule);
  classificationRules.sort((a, b) => b.priority - a.priority);
  logger.debug(`[InboundEvent:Classification] Registered rule: ${rule.id}`);
}

export function unregisterClassificationRule(ruleId: string): void {
  const idx = classificationRules.findIndex((r) => r.id === ruleId);
  if (idx >= 0) {
    classificationRules.splice(idx, 1);
  }
}

export function classifyInboundEvent(event: InboundEventContext): InboundEventClassification {
  const classification: InboundEventClassification = {
    isCommand: false,
    isMention: false,
    isDM: false,
    isThread: false,
    isMedia: false,
    priority: "normal",
    tags: [],
  };

  for (const rule of classificationRules) {
    try {
      if (rule.match(event)) {
        const result = rule.classify(event);
        Object.assign(classification, result);
        if (result.tags) {
          classification.tags = [...new Set([...classification.tags, ...result.tags])];
        }
      }
    } catch (err) {
      logger.error(`[InboundEvent:Classification] Rule error: ${rule.id}`, { error: err });
    }
  }

  const basic = basicClassification(event);
  mergeClassification(classification, basic);

  logger.debug(
    `[InboundEvent:Classification] Event ${event.eventId}: priority=${classification.priority}, tags=${classification.tags.join(",")}`
  );

  return classification;
}

function basicClassification(event: InboundEventContext): Partial<InboundEventClassification> {
  const result: Partial<InboundEventClassification> = {
    tags: [],
  };

  const content = event.content ?? "";

  if (event.type === "command" || content.startsWith("/")) {
    result.isCommand = true;
    const cmdMatch = content.match(/^\/(\w+)/);
    if (cmdMatch) {
      result.commandName = cmdMatch[1];
      result.tags?.push("command", cmdMatch[1]);
    }
  }

  if (event.mentions && event.mentions.length > 0) {
    result.isMention = true;
    result.tags?.push("mention");
  }

  if (event.threadId) {
    result.isThread = true;
    result.tags?.push("thread");
  }

  if (event.media && event.media.length > 0) {
    result.isMedia = true;
    result.tags?.push("media");
  }

  if (event.attachments && event.attachments.length > 0) {
    result.isMedia = true;
    result.tags?.push("attachments");
  }

  return result;
}

function mergeClassification(
  target: InboundEventClassification,
  source: Partial<InboundEventClassification>
): void {
  if (source.isCommand !== undefined) target.isCommand = source.isCommand;
  if (source.isMention !== undefined) target.isMention = source.isMention;
  if (source.isDM !== undefined) target.isDM = source.isDM;
  if (source.isThread !== undefined) target.isThread = source.isThread;
  if (source.isMedia !== undefined) target.isMedia = source.isMedia;
  if (source.commandName !== undefined) target.commandName = source.commandName;
  if (source.priority !== undefined) target.priority = source.priority;
  if (source.tags) {
    target.tags = [...new Set([...target.tags, ...source.tags])];
  }
}

export function isHighPriority(event: InboundEventContext): boolean {
  const cls = event.classification ?? classifyInboundEvent(event);
  return cls.priority === "high" || cls.isCommand || cls.isMention;
}

export function hasTag(event: InboundEventContext, tag: string): boolean {
  const cls = event.classification ?? classifyInboundEvent(event);
  return cls.tags.includes(tag);
}

export function clearClassificationRules(): void {
  classificationRules.length = 0;
}
