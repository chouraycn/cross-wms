/**
 * Outbound message deliverer types.
 *
 * Defines delivery strategies, options, and the deliverer interface.
 */
import type { ChannelId, AccountId, AppConfig } from "../types.js";
import type { ChannelPlugin } from "../plugin.js";
import type { DurableMessageSendContext } from "./context.js";
import type { DurableMessageBatchSendResult } from "./result.js";

/**
 * Delivery strategy determines retry and durability behavior.
 */
export type DeliveryStrategy = "required" | "best_effort";

/**
 * Delivery options for configuring outbound message delivery.
 */
export interface DeliveryOptions {
  /** Delivery strategy to use. */
  strategy: DeliveryStrategy;

  /** Maximum number of delivery attempts (default: 3). */
  maxAttempts?: number;

  /** Delivery timeout in milliseconds (default: 30000). */
  timeout?: number;

  /** Whether to enable queue persistence for durability. */
  persistent?: boolean;
}

/**
 * Parameters for the outbound deliverer.
 */
export interface OutboundDelivererParams {
  /** Channel plugin for sending messages. */
  plugin: ChannelPlugin;

  /** Target channel ID. */
  channelId: ChannelId;

  /** Target recipient. */
  to: string;

  /** Account ID for sending. */
  accountId?: AccountId;

  /** Application configuration. */
  config: AppConfig;

  /** Delivery options. */
  options?: DeliveryOptions;
}

/**
 * Outbound deliverer interface for sending messages through channel plugins.
 */
export interface OutboundDeliverer {
  /**
   * Delivers a message using the provided send context.
   */
  deliver(params: {
    context: DurableMessageSendContext;
    plugin: ChannelPlugin;
    accountId?: AccountId;
    config: AppConfig;
  }): Promise<DurableMessageBatchSendResult>;

  /**
   * Checks if the deliverer supports the given channel.
   */
  supportsChannel(channelId: ChannelId): boolean;
}

/**
 * Delivery intent for tracking send operations.
 */
export interface DeliveryIntent {
  id: string;
  channel: ChannelId;
  to: string;
  accountId?: AccountId;
  strategy: DeliveryStrategy;
  createdAt: number;
  attempts: number;
}

/**
 * Delivery commitment state.
 */
export type DeliveryCommitmentState = "pending" | "committed" | "failed";

/**
 * Delivery commitment record.
 */
export interface DeliveryCommitment {
  intentId: string;
  state: DeliveryCommitmentState;
  committedAt?: number;
  error?: Error;
}
