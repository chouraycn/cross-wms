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
