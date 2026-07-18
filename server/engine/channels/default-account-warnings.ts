/**
 * Default account warnings — 为依赖隐式默认账户的 channel 提供统一的告警文本
 *
 * 集中路径以便 doctor/setup 消息保持一致。
 *
 * 参考 openclaw/src/routing/default-account-warnings.ts
 */

function formatChannelDefaultAccountPath(channelKey: string): string {
  return `channels.${channelKey}.defaultAccount`;
}

export function formatChannelAccountsDefaultPath(channelKey: string): string {
  return `channels.${channelKey}.accounts.default`;
}

export function formatSetExplicitDefaultInstruction(channelKey: string): string {
  return `Set ${formatChannelDefaultAccountPath(channelKey)} or add ${formatChannelAccountsDefaultPath(channelKey)}`;
}

// 当 channel 已经配置了账户时使用此变体，应指向其中一个，
// 而非建议使用通用默认账户。
export function formatSetExplicitDefaultToConfiguredInstruction(params: {
  channelKey: string;
}): string {
  return `Set ${formatChannelDefaultAccountPath(params.channelKey)} to one of these accounts, or add ${formatChannelAccountsDefaultPath(params.channelKey)}`;
}
