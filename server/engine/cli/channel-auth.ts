// Channel login/logout command helpers for local config and gateway reconciliation.
// 移植自 openclaw/src/cli/channel-auth.ts。
//
// 降级策略：原模块依赖 `@openclaw/normalization-core/string-coerce`、
// `../../packages/terminal-core/src/ansi.js`、`../channels/plugins/*`、
// `../commands/channel-setup/*`、`../config/*`、`../gateway/call.js`、
// `../globals.js`、`../infra/errors.js`、`../infra/prototype-keys.js`、
// `../runtime.js`、`../utils/message-channel.js`、`./command-format.js`、
// `./error-format.js`、`./plugins-install-record-commit.js`。
// 这些模块大多未移植；这里提供降级 stub，保留函数签名。

import { normalizeOptionalString } from "../infra/string-coerce.js";
import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

type ChannelAuthOptions = {
  channel?: string;
  account?: string;
  verbose?: boolean;
};

type ChannelAuthResult = {
  ok: boolean;
  message?: string;
};

/**
 * Run a channel login or logout flow.
 *
 * 降级实现：openclaw 的 `channels/plugins/*`、`gateway/call.js`、`runtime.js`、
 * `commands/channel-setup/*` 未移植；这里返回 `{ ok: false, message: "not supported" }`。
 */
export async function runChannelAuth(
  _mode: "login" | "logout",
  _opts: ChannelAuthOptions,
): Promise<ChannelAuthResult> {
  return {
    ok: false,
    message:
      "openclaw channel auth: not supported in stub mode (channels/plugins, gateway/call not ported).",
  };
}

/**
 * Resolve channel auth options from CLI flags.
 *
 * 降级实现：保留 normalizeOptionalString 调用以维持签名兼容。
 */
export function resolveChannelAuthOptions(raw: {
  channel?: unknown;
  account?: unknown;
  verbose?: unknown;
}): ChannelAuthOptions {
  return {
    channel: normalizeOptionalString(raw.channel),
    account: normalizeOptionalString(raw.account),
    verbose: Boolean(raw.verbose),
  };
}

/**
 * Check if a channel is configured for auth in the config.
 *
 * 降级实现：openclaw 的 `channels/plugins/*` 未移植；这里返回 false。
 */
export function isChannelAuthConfigured(_channelId: string, _config: OpenClawConfig): boolean {
  return false;
}
