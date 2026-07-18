/**
 * Native 命令会话目标解析 — 为 channel-native 命令事件选择存储与命令目标会话 key
 *
 * 参考 openclaw/src/channels/native-command-session-targets.ts
 */
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";

/** Native 命令会话目标解析输入 */
export type ResolveNativeCommandSessionTargetsParams = {
  agentId: string;
  sessionPrefix: string;
  userId: string;
  targetSessionKey: string;
  boundSessionKey?: string;
  lowercaseSessionKey?: boolean;
};

/** 解析 native 命令的存储会话 key 与命令目标会话 key */
export function resolveNativeCommandSessionTargets(
  params: ResolveNativeCommandSessionTargetsParams,
) {
  const rawSessionKey =
    params.boundSessionKey ??
    `agent:${params.agentId}:${params.sessionPrefix}:${params.userId}`;
  return {
    // 部分服务以大小写不敏感方式规范化用户 id；通过此开关以兼容需要大小写敏感的频道
    sessionKey: params.lowercaseSessionKey
      ? normalizeLowercaseStringOrEmpty(rawSessionKey)
      : rawSessionKey,
    commandTargetSessionKey: params.boundSessionKey ?? params.targetSessionKey,
  };
}
