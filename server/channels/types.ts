/**
 * Channel core types.
 *
 * Defines channel identifiers, metadata, capabilities, and configuration adapters.
 */

/** Unique identifier for a channel plugin. */
export type ChannelId = string;

/** Unique identifier for a channel account. */
export type AccountId = string;

/** User-facing metadata used in docs, pickers, and setup surfaces. */
export interface ChannelMeta {
  id: ChannelId;
  label: string;
  selectionLabel: string;
  docsPath?: string;
  blurb?: string;
  aliases?: string[];
  markdownCapable?: boolean;
}

/** Static capability flags advertised by a channel plugin. */
export interface ChannelCapabilities {
  chatTypes?: ("direct" | "group")[];
  media?: boolean;
  reactions?: boolean;
  threads?: boolean;
  polls?: boolean;
  mentions?: boolean;
  voice?: boolean;
  video?: boolean;
  typing?: boolean;
}

/** App configuration shape (platform-specific, injected by consumer). */
export interface AppConfig {
  [key: string]: unknown;
}

/** Adapter for resolving and validating channel account configuration. */
export interface ChannelConfigAdapter<TAccount = any> {
  listAccountIds(config: AppConfig): AccountId[];
  resolveAccount(config: AppConfig, accountId: AccountId): TAccount | null;
  isEnabled(account: TAccount, config: AppConfig): boolean;
  isConfigured(account: TAccount, config: AppConfig): boolean;
}

// ============================================================================
// Runtime Channel Types
// ============================================================================

/**
 * Channel runtime status.
 */
export type ChannelStatus = "initializing" | "ready" | "paused" | "error" | "closed";

/**
 * Runtime channel instance capable of sending and receiving messages.
 */
export interface Channel {
  /** Channel unique identifier. */
  id: ChannelId;
  /** Channel display metadata. */
  meta: ChannelMeta;
  /** Current runtime status. */
  status: ChannelStatus;
  /** Send a message through this channel. */
  send(message: ChannelMessage): Promise<void>;
  /** Start the channel. */
  start?(): Promise<void>;
  /** Stop the channel. */
  stop?(): Promise<void>;
}

/**
 * Channel message used in runtime operations.
 * Extended from the adapter-level message type with routing info.
 */
export interface ChannelMessage {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  content: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
  timestamp?: number;
  /** Target agent id for routing. */
  targetAgentId?: string;
  /** Thread id for thread binding. */
  threadId?: string;
  /** Parent message id for reply threading. */
  parentMessageId?: string;
  /** Explicit mentions in the message. */
  mentions?: string[];
}
