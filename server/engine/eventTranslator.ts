/**
 * Event Translator
 * 事件转译器 - 在 Gateway 事件和 ACP 事件之间进行双向转译
 */

export type TranslatorDirection = "gateway-to-acp" | "acp-to-gateway";

export interface TranslatedEvent {
  type: string;
  payload: Record<string, unknown>;
  metadata: {
    translatedAt: number;
    direction: TranslatorDirection;
    originalType: string;
  };
}

export interface TranslationContext {
  sessionKey: string;
  direction: TranslatorDirection;
  timestamp?: number;
}

export interface EventTranslationRule {
  match: (eventType: string) => boolean;
  translate: (
    event: { type: string; payload: Record<string, unknown> },
    context: TranslationContext,
  ) => TranslatedEvent;
}

/**
 * 事件转译器 - 管理事件类型的双向转译规则
 */
export class EventTranslator {
  private readonly gatewayToAcpRules: EventTranslationRule[] = [];
  private readonly acpToGatewayRules: EventTranslationRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * 注册转译规则
   */
  registerRule(direction: TranslatorDirection, rule: EventTranslationRule): void {
    if (direction === "gateway-to-acp") {
      this.gatewayToAcpRules.push(rule);
    } else {
      this.acpToGatewayRules.push(rule);
    }
  }

  /**
   * 转译事件
   */
  translate(
    event: { type: string; payload: Record<string, unknown> },
    context: TranslationContext,
  ): TranslatedEvent {
    const rules =
      context.direction === "gateway-to-acp"
        ? this.gatewayToAcpRules
        : this.acpToGatewayRules;

    for (const rule of rules) {
      if (rule.match(event.type)) {
        return rule.translate(event, context);
      }
    }

    return {
      type: event.type,
      payload: event.payload,
      metadata: {
        translatedAt: context.timestamp ?? Date.now(),
        direction: context.direction,
        originalType: event.type,
      },
    };
  }

  /**
   * 批量转译事件流
   */
  async *translateStream(
    source: AsyncIterable<{ type: string; payload: Record<string, unknown> }>,
    context: TranslationContext,
  ): AsyncIterable<TranslatedEvent> {
    for await (const event of source) {
      yield this.translate(event, context);
    }
  }

  private registerDefaultRules(): void {
    // Gateway -> ACP 规则
    this.registerRule("gateway-to-acp", {
      match: (type) => type === "message.created",
      translate: (event, context) => ({
        type: "content-block-delta",
        payload: {
          content: event.payload.content ?? "",
          role: event.payload.role ?? "assistant",
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("gateway-to-acp", {
      match: (type) => type === "tool.call.started",
      translate: (event, context) => ({
        type: "tool-call-started",
        payload: {
          id: event.payload.toolCallId ?? event.payload.id ?? "",
          name: event.payload.name ?? "",
          input: event.payload.input ?? {},
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("gateway-to-acp", {
      match: (type) => type === "tool.call.completed",
      translate: (event, context) => ({
        type: "tool-call-completed",
        payload: {
          id: event.payload.toolCallId ?? event.payload.id ?? "",
          result: event.payload.result ?? event.payload.output ?? {},
          isError: event.payload.isError ?? false,
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("gateway-to-acp", {
      match: (type) => type === "turn.completed",
      translate: (event, context) => ({
        type: "done",
        payload: {
          status: event.payload.status ?? "completed",
          summary: event.payload.summary ?? "",
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("gateway-to-acp", {
      match: (type) => type === "turn.failed",
      translate: (event, context) => ({
        type: "error",
        payload: {
          error: event.payload.error ?? event.payload.message ?? "Unknown error",
          code: event.payload.code,
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    // ACP -> Gateway 规则
    this.registerRule("acp-to-gateway", {
      match: (type) => type === "content-block-delta",
      translate: (event, context) => ({
        type: "message.delta",
        payload: {
          content: event.payload.content ?? event.payload.text ?? "",
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("acp-to-gateway", {
      match: (type) => type === "tool-call-started",
      translate: (event, context) => ({
        type: "tool.call.started",
        payload: {
          toolCallId: event.payload.id,
          name: event.payload.name,
          input: event.payload.input,
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("acp-to-gateway", {
      match: (type) => type === "tool-call-completed",
      translate: (event, context) => ({
        type: "tool.call.completed",
        payload: {
          toolCallId: event.payload.id,
          result: event.payload.result,
          isError: event.payload.isError,
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("acp-to-gateway", {
      match: (type) => type === "done",
      translate: (event, context) => ({
        type: "turn.completed",
        payload: {
          status: event.payload.status ?? "completed",
        },
        metadata: this.makeMetadata(event, context),
      }),
    });

    this.registerRule("acp-to-gateway", {
      match: (type) => type === "error",
      translate: (event, context) => ({
        type: "turn.failed",
        payload: {
          error: event.payload.error,
          code: event.payload.code,
        },
        metadata: this.makeMetadata(event, context),
      }),
    });
  }

  private makeMetadata(
    event: { type: string; payload: Record<string, unknown> },
    context: TranslationContext,
  ): TranslatedEvent["metadata"] {
    return {
      translatedAt: context.timestamp ?? Date.now(),
      direction: context.direction,
      originalType: event.type,
    };
  }
}

// 单例
let TRANSLATOR_INSTANCE: EventTranslator | null = null;

export function getEventTranslator(): EventTranslator {
  if (!TRANSLATOR_INSTANCE) {
    TRANSLATOR_INSTANCE = new EventTranslator();
  }
  return TRANSLATOR_INSTANCE;
}

export function resetEventTranslatorForTests(): void {
  TRANSLATOR_INSTANCE = null;
}
