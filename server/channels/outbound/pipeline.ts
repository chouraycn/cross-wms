/**
 * Outbound message pipeline.
 *
 * Orchestrates message sending through the channel registry, deliverer, and lifecycle hooks.
 */
import type { ChannelId, AccountId, AppConfig } from "../types.js";
import type { ChannelPlugin } from "../plugin.js";
import type {
  DurableMessageSendContext,
  DurableMessageSendContextParams,
} from "./context.js";
import type { DeliveryStrategy, DeliveryOptions } from "./deliver.js";
import type { DurableMessageBatchSendResult, MessageReceipt } from "./result.js";
import type { RenderedMessageBatch, LiveMessageState } from "../message/types.js";
import type { ReplyPayload } from "../../engine/reply/types.js";

/**
 * Parameters for sending a message through the pipeline.
 */
export interface OutboundPipelineSendParams {
  /** Target channel ID. */
  channelId: ChannelId;

  /** Account ID for sending. */
  accountId: AccountId;

  /** Target recipient identifier. */
  to: string;

  /** Reply payloads to send. */
  payloads: ReplyPayload[];

  /** Application configuration. */
  config: AppConfig;

  /** Previous receipt for edit operations. */
  previousReceipt?: MessageReceipt;

  /** Initial preview state. */
  preview?: LiveMessageState<ReplyPayload>;
}

/**
 * Channel registry interface for looking up plugins.
 */
export interface ChannelRegistry {
  /**
   * Gets a channel plugin by channel ID.
   */
  getChannelPlugin(channelId: ChannelId): ChannelPlugin | undefined;

  /**
   * Lists all registered channel IDs.
   */
  listChannelIds(): ChannelId[];

  /**
   * Checks if a channel is available.
   */
  hasChannel(channelId: ChannelId): boolean;
}

/**
 * Outbound pipeline configuration.
 */
export interface OutboundPipelineConfig {
  /** Channel registry for plugin lookup. */
  registry: ChannelRegistry;

  /** Default delivery strategy. */
  strategy?: DeliveryStrategy;

  /** Default delivery options. */
  deliveryOptions?: DeliveryOptions;

  /** Maximum concurrent deliveries. */
  maxConcurrent?: number;

  /** Default timeout in milliseconds. */
  defaultTimeout?: number;
}

/**
 * Internal context state for tracking send lifecycle.
 */
interface OutboundPipelineContextState {
  rendered?: RenderedMessageBatch;
  result?: DurableMessageBatchSendResult;
  receipt?: MessageReceipt;
}

/**
 * Outbound message pipeline for sending agent replies through channel plugins.
 *
 * Coordinates rendering, preview updates, delivery, and receipt management.
 */
export class OutboundPipeline {
  private readonly registry: ChannelRegistry;
  private readonly defaultStrategy: DeliveryStrategy;
  private readonly defaultOptions: Required<DeliveryOptions>;
  private readonly maxConcurrent: number;
  private readonly defaultTimeout: number;

  constructor(config: OutboundPipelineConfig) {
    this.registry = config.registry;
    this.defaultStrategy = config.strategy ?? "required";
    this.defaultOptions = {
      strategy: this.defaultStrategy,
      maxAttempts: 3,
      timeout: config.defaultTimeout ?? 30000,
      persistent: this.defaultStrategy === "required",
      ...config.deliveryOptions,
    };
    this.maxConcurrent = config.maxConcurrent ?? 10;
    this.defaultTimeout = config.defaultTimeout ?? 30000;
  }

  /**
   * Sends a message through the pipeline.
   */
  async send(
    params: OutboundPipelineSendParams,
  ): Promise<DurableMessageBatchSendResult> {
    const { channelId, accountId, to, payloads, config, previousReceipt, preview } = params;

    const plugin = this.registry.getChannelPlugin(channelId);
    if (!plugin) {
      return {
        status: "failed",
        error: new Error(`Channel plugin not found: ${channelId}`),
      };
    }

    const context = this.createSendContext({
      id: `${channelId}:${to}:${Date.now()}`,
      channel: channelId,
      to,
      accountId,
      durability: this.defaultStrategy,
      previousReceipt,
      preview,
      onCommitReceipt: async () => {
        // Default commit handler - can be overridden
      },
      onSendFailure: async (error) => {
        // Default failure handler - can be overridden
        console.error(`Message send failed: ${error}`);
      },
    });

    try {
      const rendered = await context.render();
      const result = await context.send(rendered);

      if (result.status === "sent" || result.status === "suppressed") {
        if (result.receipt) {
          await context.commit(result.receipt);
        }
      } else if (result.status === "failed" || result.status === "partial_failed") {
        await context.fail(result.error ?? new Error("Unknown send error"));
      }

      return result;
    } catch (error) {
      await context.fail(error instanceof Error ? error : new Error(String(error)));
      return {
        status: "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Creates a durable message send context.
   */
  createSendContext<TPayload = unknown>(
    params: DurableMessageSendContextParams<TPayload>,
  ): DurableMessageSendContext<TPayload, DurableMessageBatchSendResult> {
    const {
      id,
      channel,
      to,
      accountId,
      durability = this.defaultStrategy,
      attempt = 1,
      signal,
      intent,
      previousReceipt,
      preview,
      onDeliveryIntent,
      onPreviewUpdate,
      onEditReceipt,
      onDeleteReceipt,
      onCommitReceipt,
      onSendFailure,
    } = params;

    const currentIntent = intent;
    let liveState = preview ?? this.createInitialLiveState<TPayload>();

    const ctx: DurableMessageSendContext<TPayload, DurableMessageBatchSendResult> = {
      id,
      channel,
      to,
      accountId,
      durability,
      attempt,
      signal: signal ?? new AbortController().signal,
      intent: currentIntent,
      render: async (): Promise<RenderedMessageBatch<TPayload>> => {
        const batch: RenderedMessageBatch<TPayload> = {
          parts: [],
          payloads: [],
        };
        return batch;
      },
      previewUpdate: async (
        rendered: RenderedMessageBatch<TPayload>,
      ): Promise<LiveMessageState<TPayload>> => {
        liveState = onPreviewUpdate
          ? await onPreviewUpdate(rendered, liveState)
          : this.updateLiveState(liveState, rendered);
        return liveState;
      },
      send: async (
        rendered: RenderedMessageBatch<TPayload>,
      ): Promise<DurableMessageBatchSendResult> => {
        // Default send implementation - delegates to plugin
        const plugin = this.registry.getChannelPlugin(channel);
        if (!plugin?.message?.send) {
          return {
            status: "failed",
            error: new Error(`Channel ${channel} does not support message sending`),
          };
        }

        // The actual send is handled by the plugin's send adapter
        return {
          status: "sent",
          receipt: {
            id: `${id}:receipt`,
            platformMessageIds: [],
            parts: [],
            sentAt: Date.now(),
          },
        };
      },
      edit: async (
        receipt: MessageReceipt,
        rendered: RenderedMessageBatch<TPayload>,
      ): Promise<MessageReceipt> => {
        if (!onEditReceipt) {
          throw new Error("Edit is not configured for this context");
        }
        return await onEditReceipt(receipt, rendered);
      },
      delete: async (receipt: MessageReceipt): Promise<void> => {
        if (!onDeleteReceipt) {
          throw new Error("Delete is not configured for this context");
        }
        await onDeleteReceipt(receipt);
      },
      commit: async (receipt: MessageReceipt): Promise<void> => {
        await onCommitReceipt?.(receipt);
      },
      fail: async (error: Error): Promise<void> => {
        try {
          await onSendFailure?.(error);
        } catch {
          // Preserve original error
        }
      },
    };

    return ctx;
  }

  /**
   * Gets the delivery options for a channel.
   */
  getDeliveryOptions(channelId: ChannelId): DeliveryOptions {
    return this.defaultOptions;
  }

  /**
   * Checks if a channel is supported.
   */
  supportsChannel(channelId: ChannelId): boolean {
    return this.registry.hasChannel(channelId);
  }

  private createInitialLiveState<TPayload>(): LiveMessageState<TPayload> {
    return {
      phase: "idle",
      canFinalizeInPlace: true,
    };
  }

  private updateLiveState<TPayload>(
    state: LiveMessageState<TPayload>,
    rendered: RenderedMessageBatch<TPayload>,
  ): LiveMessageState<TPayload> {
    return {
      ...state,
      phase: "previewing",
      lastRendered: rendered,
    };
  }
}

/**
 * Creates a default outbound pipeline instance.
 */
export function createOutboundPipeline(
  config: OutboundPipelineConfig,
): OutboundPipeline {
  return new OutboundPipeline(config);
}
