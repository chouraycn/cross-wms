/**
 * Agent identity and message-prefix resolution.
 * Applies account, channel, global, and per-agent precedence for reactions,
 * prefixes, and human-delay settings.
 */
import type { HumanDelayConfig, IdentityConfig } from "../config/types.base.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveAgentConfig } from "./agent-scope.js";

const DEFAULT_ACK_REACTION = "👀";

/** Resolve the configured identity block for one agent. */
export function resolveAgentIdentity(
  cfg: OpenClawConfig,
  agentId: string,
): IdentityConfig | undefined {
  return resolveAgentConfig(cfg, agentId)?.identity;
}

/** Resolve the acknowledgement reaction using account, channel, global, then identity fallback. */
export function resolveAckReaction(
  cfg: OpenClawConfig,
  agentId: string,
  opts?: { channel?: string; accountId?: string },
): string {
  // L1: Channel account level
  if (opts?.channel && opts?.accountId) {
    const channelCfg = getChannelConfig(cfg, opts.channel);
    const accounts = channelCfg?.accounts as Record<string, Record<string, unknown>> | undefined;
    const accountReaction = accounts?.[opts.accountId]?.ackReaction as string | undefined;
    if (accountReaction !== undefined) {
      return accountReaction.trim();
    }
  }

  // L2: Channel level
  if (opts?.channel) {
    const channelCfg = getChannelConfig(cfg, opts.channel);
    const channelReaction = channelCfg?.ackReaction as string | undefined;
    if (channelReaction !== undefined) {
      return channelReaction.trim();
    }
  }

  // L3: Global messages level
  const configured = cfg.messages?.ackReaction;
  if (configured !== undefined) {
    return configured.trim();
  }

  // L4: Agent identity emoji fallback
  const emoji = resolveAgentIdentity(cfg, agentId)?.emoji?.trim();
  return emoji || DEFAULT_ACK_REACTION;
}

/** Build the automatic `[name]` prefix for an agent identity. */
export function resolveIdentityNamePrefix(
  cfg: OpenClawConfig,
  agentId: string,
): string | undefined {
  const name = resolveAgentIdentity(cfg, agentId)?.name?.trim();
  if (!name) {
    return undefined;
  }
  return `[${name}]`;
}

/** Resolve the outbound message prefix, preserving explicit empty prefixes. */
export function resolveMessagePrefix(
  cfg: OpenClawConfig,
  agentId: string,
  opts?: { configured?: string; hasAllowFrom?: boolean; fallback?: string },
): string {
  const configured = opts?.configured ?? cfg.messages?.messagePrefix;
  if (configured !== undefined) {
    return configured;
  }

  const hasAllowFrom = opts?.hasAllowFrom === true;
  if (hasAllowFrom) {
    return "";
  }

  return resolveIdentityNamePrefix(cfg, agentId) ?? opts?.fallback ?? "[openclaw]";
}

/** Helper to extract a channel config value by dynamic key. */
function getChannelConfig(
  cfg: OpenClawConfig,
  channel: string,
): Record<string, unknown> | undefined {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  const value = channels?.[channel];
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Resolve the optional response prefix, expanding `auto` to the identity name prefix. */
export function resolveResponsePrefix(
  cfg: OpenClawConfig,
  agentId: string,
  opts?: { channel?: string; accountId?: string },
): string | undefined {
  // L1: Channel account level
  if (opts?.channel && opts?.accountId) {
    const channelCfg = getChannelConfig(cfg, opts.channel);
    const accounts = channelCfg?.accounts as Record<string, Record<string, unknown>> | undefined;
    const accountPrefix = accounts?.[opts.accountId]?.responsePrefix as string | undefined;
    if (accountPrefix !== undefined) {
      if (accountPrefix === "auto") {
        return resolveIdentityNamePrefix(cfg, agentId);
      }
      return accountPrefix;
    }
  }

  // L2: Channel level
  if (opts?.channel) {
    const channelCfg = getChannelConfig(cfg, opts.channel);
    const channelPrefix = channelCfg?.responsePrefix as string | undefined;
    if (channelPrefix !== undefined) {
      if (channelPrefix === "auto") {
        return resolveIdentityNamePrefix(cfg, agentId);
      }
      return channelPrefix;
    }
  }

  // L4: Global level
  const configured = cfg.messages?.responsePrefix;
  if (configured !== undefined) {
    if (configured === "auto") {
      return resolveIdentityNamePrefix(cfg, agentId);
    }
    return configured;
  }
  return undefined;
}

/** Resolve message and response prefix values together for channel delivery. */
export function resolveEffectiveMessagesConfig(
  cfg: OpenClawConfig,
  agentId: string,
  opts?: {
    hasAllowFrom?: boolean;
    fallbackMessagePrefix?: string;
    channel?: string;
    accountId?: string;
  },
): { messagePrefix: string; responsePrefix?: string } {
  return {
    messagePrefix: resolveMessagePrefix(cfg, agentId, {
      hasAllowFrom: opts?.hasAllowFrom,
      fallback: opts?.fallbackMessagePrefix,
    }),
    responsePrefix: resolveResponsePrefix(cfg, agentId, {
      channel: opts?.channel,
      accountId: opts?.accountId,
    }),
  };
}

/** Resolve per-agent human-delay settings over global agent defaults. */
export function resolveHumanDelayConfig(
  cfg: OpenClawConfig,
  agentId: string,
): HumanDelayConfig | undefined {
  const defaults = cfg.agents?.defaults?.humanDelay;
  const overrides = resolveAgentConfig(cfg, agentId)?.humanDelay;
  if (!defaults && !overrides) {
    return undefined;
  }
  return {
    mode: overrides?.mode ?? defaults?.mode,
    minMs: overrides?.minMs ?? defaults?.minMs,
    maxMs: overrides?.maxMs ?? defaults?.maxMs,
  };
}

// ============================================================================
// WMS 兼容：agents.ts 通过 `new AgentIdentity({...})` 构造运行时身份对象。
// openclaw 没有这个类（它只用 IdentityConfig 类型）；此 class 是 WMS 扩展。
// ============================================================================

export type AgentIdentityInit = {
  id: string;
  name?: string;
  role?: string;
  prefix?: string;
  emoji?: string;
  ackReaction?: boolean | string;
  humanDelayMs?: number;
  scenarios?: string[];
};

export class AgentIdentity {
  readonly id: string;
  readonly name?: string;
  readonly role?: string;
  readonly prefix?: string;
  readonly emoji?: string;
  readonly ackReaction?: boolean | string;
  readonly humanDelayMs?: number;
  readonly scenarios: string[];

  constructor(init: AgentIdentityInit) {
    this.id = init.id;
    this.name = init.name;
    this.role = init.role;
    this.prefix = init.prefix;
    this.emoji = init.emoji;
    this.ackReaction = init.ackReaction;
    this.humanDelayMs = init.humanDelayMs;
    this.scenarios = init.scenarios ?? [];
  }
}

/**
 * 运行时 AgentIdentity 注册表（per-agentId）。
 * agents.ts 的 getAgentIdentity 会先查这里，再回退到默认构造。
 */
const runtimeAgentIdentities = new Map<string, AgentIdentity>();

/** 注册或覆盖运行时 AgentIdentity。 */
export function setAgentIdentity(agentId: string, identity: AgentIdentity): void {
  runtimeAgentIdentities.set(agentId, identity);
}

/** 获取运行时注册的 AgentIdentity；未注册返回 undefined。 */
export function getAgentIdentity(agentId: string): AgentIdentity | undefined {
  return runtimeAgentIdentities.get(agentId);
}

/** 清空运行时 AgentIdentity 注册表（主要用于测试）。 */
export function clearRuntimeAgentIdentities(): void {
  runtimeAgentIdentities.clear();
}
