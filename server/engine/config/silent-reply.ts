// 移植自 openclaw/src/config/silent-reply.ts
// 为 channel 响应抑制规范化 silent-reply 配置。
//
// 降级说明：源文件依赖 @openclaw/normalization-core/string-coerce 的
// normalizeLowercaseStringOrEmpty 与 ../shared/silent-reply-policy.js 的多个导出。
// 此处内联等价实现与类型，策略解析降级为基于 cfg 的简单合并。

/** 内联降级实现：将输入归一化为小写字符串，非字符串返回空串。 */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/** 静默回复会话类型（降级内联类型）。 */
export type SilentReplyConversationType = 'direct' | 'group' | 'thread' | 'unknown';

/** 静默回复策略形态（降级内联类型）。 */
export type SilentReplyPolicyShape = {
  direct?: boolean;
  group?: boolean;
  thread?: boolean;
};

/** 静默回复策略（降级内联类型）。 */
export type SilentReplyPolicy = {
  silent: boolean;
};

/** 降级实现：根据 sessionKey/surface 推断会话类型。 */
function classifySilentReplyConversationType(params: {
  sessionKey?: string;
  surface?: string;
  conversationType?: SilentReplyConversationType;
}): SilentReplyConversationType {
  if (params.conversationType) {
    return params.conversationType;
  }
  const key = normalizeLowercaseStringOrEmpty(params.sessionKey);
  if (key.includes('group')) {
    return 'group';
  }
  if (key.includes('thread')) {
    return 'thread';
  }
  if (key.includes('direct') || key.includes('dm')) {
    return 'direct';
  }
  return 'unknown';
}

/** 降级实现：从 default/surface 策略形态解析最终策略。 */
function resolveSilentReplyPolicyFromPolicies(context: {
  conversationType: SilentReplyConversationType;
  defaultPolicy?: SilentReplyPolicyShape;
  surfacePolicy?: SilentReplyPolicyShape;
}): SilentReplyPolicy {
  const merged: SilentReplyPolicyShape = {
    ...context.defaultPolicy,
    ...context.surfacePolicy,
  };
  const type = context.conversationType;
  const flag =
    type === 'group'
      ? merged.group
      : type === 'thread'
        ? merged.thread
        : type === 'direct'
          ? merged.direct
          : undefined;
  return { silent: flag ?? false };
}

import type { OpenClawConfig } from './types/openclaw.js';

type ResolveSilentReplyParams = {
  cfg?: OpenClawConfig;
  sessionKey?: string;
  surface?: string;
  conversationType?: SilentReplyConversationType;
};

function resolveSilentReplyConversationContext(params: ResolveSilentReplyParams): {
  conversationType: SilentReplyConversationType;
  defaultPolicy?: SilentReplyPolicyShape;
  surfacePolicy?: SilentReplyPolicyShape;
} {
  const conversationType = classifySilentReplyConversationType({
    sessionKey: params.sessionKey,
    surface: params.surface,
    conversationType: params.conversationType,
  });
  const normalizedSurface = normalizeLowercaseStringOrEmpty(params.surface);
  // Surfaces 存储在规范化 id 下；保留显式 conversationType 不变。
  const surface = normalizedSurface ? params.cfg?.surfaces?.[normalizedSurface] : undefined;
  return {
    conversationType,
    defaultPolicy: params.cfg?.agents?.defaults?.silentReply as SilentReplyPolicyShape | undefined,
    surfacePolicy: surface?.silentReply as SilentReplyPolicyShape | undefined,
  };
}

/** 为路由的会话解析有效的 silent-reply 设置。 */
export function resolveSilentReplySettings(params: ResolveSilentReplyParams): {
  policy: SilentReplyPolicy;
} {
  const context = resolveSilentReplyConversationContext(params);
  return {
    policy: resolveSilentReplyPolicyFromPolicies(context),
  };
}

/** 仅为不需要元数据的调用方返回有效的 silent-reply 策略。 */
export function resolveSilentReplyPolicy(params: ResolveSilentReplyParams): SilentReplyPolicy {
  return resolveSilentReplySettings(params).policy;
}
