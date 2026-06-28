/**
 * Inbound event handler.
 *
 * Processes inbound events from external platforms, including:
 * - Event classification
 * - Access control
 * - Agent dispatching
 */
import type {
  InboundEvent,
  InboundEventKind,
  InboundEventHandler as InboundEventHandlerType,
  InboundDecision,
  HandleResult,
  ChannelRegistry,
  AccessControl,
  AgentDispatcher,
  MessagePayload,
} from "./types.js";
import { logger } from "../../logger.js";

/**
 * Default handler priorities by event kind.
 */
const DEFAULT_PRIORITIES: Record<InboundEventKind, number> = {
  message: 100,
  reaction: 50,
  typing: 10,
  edited: 60,
  deleted: 60,
  presence: 20,
  error: 200,
};

/**
 * Inbound event handler configuration.
 */
export interface InboundEventHandlerConfig {
  registry: ChannelRegistry;
  accessControl: AccessControl;
  agentDispatcher: AgentDispatcher;
}

/**
 * Event handler registration.
 */
interface HandlerRegistration {
  handler: InboundEventHandlerType;
  priority: number;
}

/**
 * Inbound event handler that processes events through the pipeline:
 * 1. Validates the event
 * 2. Checks access control
 * 3. Classifies the event
 * 4. Dispatches to agent if needed
 */
export class InboundEventHandler {
  private registry: ChannelRegistry;
  private accessControl: AccessControl;
  private agentDispatcher: AgentDispatcher;
  private handlers: Map<InboundEventKind, HandlerRegistration[]>;
  private defaultHandler: InboundEventHandlerType | null = null;

  constructor(params: InboundEventHandlerConfig) {
    this.registry = params.registry;
    this.accessControl = params.accessControl;
    this.agentDispatcher = params.agentDispatcher;
    this.handlers = new Map();
  }

  /**
   * Register a handler for a specific event kind.
   * Handlers are executed in priority order (higher priority first).
   */
  on(kind: InboundEventKind, handler: InboundEventHandlerType, priority = 0): void {
    const registrations = this.handlers.get(kind) ?? [];
    registrations.push({
      handler,
      priority: priority || DEFAULT_PRIORITIES[kind] || 50,
    });
    registrations.sort((a, b) => b.priority - a.priority);
    this.handlers.set(kind, registrations);
  }

  /**
   * Set a default handler for events that don't have specific handlers.
   */
  onDefault(handler: InboundEventHandlerType): void {
    this.defaultHandler = handler;
  }

  /**
   * Handle an inbound event.
   * Processes the event through access control, classification, and dispatch.
   */
  async handle(event: InboundEvent): Promise<HandleResult> {
    try {
      // Validate event
      const validationError = this.validateEvent(event);
      if (validationError) {
        return {
          success: false,
          error: new Error(validationError),
          decision: { action: "error", reason: validationError },
        };
      }

      // Check channel and account exist
      const channel = this.registry.getChannel(event.channelId);
      if (!channel) {
        return {
          success: false,
          error: new Error(`Channel not found: ${event.channelId}`),
          decision: { action: "error", reason: "Channel not found" },
        };
      }

      const account = this.registry.getAccount(event.channelId, event.accountId);
      if (!account) {
        return {
          success: false,
          error: new Error(`Account not found: ${event.accountId}`),
          decision: { action: "error", reason: "Account not found" },
        };
      }

      if (!account.isEnabled) {
        return {
          success: false,
          error: new Error(`Account is disabled: ${event.accountId}`),
          decision: { action: "drop", reason: "Account disabled" },
        };
      }

      // Check access control for message events
      const decision: InboundDecision = { action: "dispatch" };
      if (event.kind === "message") {
        const payload = event.payload as MessagePayload;
        const accessResult = await this.accessControl.canSendMessage({
          channelId: event.channelId,
          accountId: event.accountId,
          userId: payload.from,
          conversationId: payload.to,
        });

        if (!accessResult.allowed) {
          return {
            success: false,
            error: new Error(accessResult.reason ?? "Access denied"),
            decision: { action: "drop", reason: accessResult.reason ?? "Access denied" },
          };
        }
      }

      // Execute kind-specific handlers
      const registrations = this.handlers.get(event.kind);
      if (registrations && registrations.length > 0) {
        for (const registration of registrations) {
          try {
            await registration.handler(event);
          } catch (err) {
            logger.error(`[InboundEventHandler] Handler error for ${event.kind}:`, err);
          }
        }
      } else if (this.defaultHandler) {
        try {
          await this.defaultHandler(event);
        } catch (err) {
          logger.error(`[InboundEventHandler] Default handler error:`, err);
        }
      }

      // Determine if event should be dispatched to agent
      const shouldDispatch = this.shouldDispatchToAgent(event, decision);
      if (shouldDispatch) {
        const dispatchResult = await this.agentDispatcher.dispatch({
          event,
          agentId: decision.agentId,
        });

        return {
          success: true,
          dispatched: dispatchResult.dispatched,
          decision,
        };
      }

      return {
        success: true,
        dispatched: false,
        decision,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[InboundEventHandler] Error handling event:`, error);

      return {
        success: false,
        error,
        decision: { action: "error", reason: error.message },
      };
    }
  }

  /**
   * Validate an inbound event.
   * Returns an error message if validation fails, undefined otherwise.
   */
  private validateEvent(event: InboundEvent): string | undefined {
    if (!event.kind) {
      return "Missing event kind";
    }
    if (!event.channelId) {
      return "Missing channel ID";
    }
    if (!event.accountId) {
      return "Missing account ID";
    }
    if (!event.messageId) {
      return "Missing message ID";
    }
    if (typeof event.timestamp !== "number" || event.timestamp <= 0) {
      return "Invalid timestamp";
    }
    if (event.payload === undefined) {
      return "Missing payload";
    }
    return undefined;
  }

  /**
   * Determine if an event should be dispatched to an agent.
   */
  private shouldDispatchToAgent(event: InboundEvent, decision: InboundDecision): boolean {
    // Only dispatch actionable events
    if (decision.action === "drop") {
      return false;
    }

    if (decision.action === "error") {
      return false;
    }

    // Message events are generally dispatchable
    if (event.kind === "message") {
      return true;
    }

    // Edited messages may be dispatchable depending on configuration
    if (event.kind === "edited") {
      return true;
    }

    // Other event types are typically not dispatched to agents
    return false;
  }
}
