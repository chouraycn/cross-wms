/**
 * Channel plugin types.
 *
 * Defines the full plugin object shape composed from config, runtime, and adapter surfaces.
 */
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";
import type {
  ChannelMessageSendAdapter,
  ChannelMessageReceiveAdapter,
  ChannelStreamingAdapter,
} from "./message/types.js";

/** Schema for channel configuration validation. */
export interface ChannelConfigSchema {
  type: "object";
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Adapter for channel authentication. */
export interface ChannelAuthAdapter {
  getAuth?(accountId: string): Promise<unknown>;
  clearAuth?(accountId: string): Promise<void>;
}

/** Adapter for channel security policy. */
export interface ChannelSecurityAdapter<TAccount = any> {
  checkSecurity?(account: TAccount, config: AppConfig): Promise<boolean>;
}

/** Probe result from channel status check. */
export interface ChannelProbeResult {
  ok: boolean;
  error?: string;
}

/** Audit info from channel status check. */
export interface ChannelAuditInfo {
  [key: string]: unknown;
}

/** Adapter for channel status monitoring. */
export interface ChannelStatusAdapter<TAccount = any, TProbe = unknown, TAudit = unknown> {
  probe?(account: TAccount, config: AppConfig): Promise<TProbe>;
  audit?(account: TAccount, config: AppConfig): Promise<TAudit>;
}

/** Adapter for channel lifecycle events. */
export interface ChannelLifecycleAdapter {
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
}

/** Agent tool registered by a channel plugin. */
export interface ChannelAgentTool {
  name: string;
  description?: string;
  schema?: unknown;
}

/** Lazy agent-tool factory used when tool availability depends on config. */
export type ChannelAgentToolFactory = (params: { cfg?: AppConfig }) => ChannelAgentTool[];

/** Full capability contract for a channel plugin. */
export interface ChannelPlugin<
  TAccount = any,
  TProbe = unknown,
  TAudit = unknown,
> {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;

  /** Configuration adapter for listing/resolving accounts. */
  config: ChannelConfigAdapter<TAccount>;
  configSchema?: ChannelConfigSchema;

  /** Message handling adapters. */
  message?: {
    send?: ChannelMessageSendAdapter;
    receive?: ChannelMessageReceiveAdapter;
    streaming?: ChannelStreamingAdapter;
  };

  /** Authentication adapter. */
  auth?: ChannelAuthAdapter;

  /** Security adapter. */
  security?: ChannelSecurityAdapter<TAccount>;

  /** Status and lifecycle adapters. */
  status?: ChannelStatusAdapter<TAccount, TProbe, TAudit>;
  lifecycle?: ChannelLifecycleAdapter;

  /** Channel-owned agent tools (login flows, etc.). */
  agentTools?: ChannelAgentToolFactory | ChannelAgentTool[];
}
