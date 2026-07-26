// Runtime-only type alias for reply dispatcher creation.
// 移植自 openclaw/src/auto-reply/reply/reply-dispatcher.runtime-types.ts
//
// 降级说明：
//  - 原文件依赖 ./reply-dispatcher.js 中的 createReplyDispatcherWithTyping 工厂。
//  - cross-wms 暂未移植 reply-dispatcher.ts 运行时实现，这里通过本地最小类型
//    占位暴露 CreateReplyDispatcherWithTyping 类型契约，保持下游类型层一致。

/** Reply dispatcher factory input options（最小占位）。 */
export type ReplyDispatcherFactoryOptions = {
  [key: string]: unknown;
};

/** Reply dispatcher 工厂返回值（最小占位，结构兼容现有 ReplyDispatcher 契约）。 */
export type ReplyDispatcherFactoryResult = {
  [key: string]: unknown;
};

/**
 * Type of the lazy reply dispatcher factory used by runtime dispatch paths.
 *
 * 降级实现：cross-wms 暂未移植 reply-dispatcher.ts 运行时，此处用最小函数签名
 * 维持类型契约；待运行时移植完成后替换为 `typeof import("./reply-dispatcher.js")`。
 */
export type CreateReplyDispatcherWithTyping = (
  options: ReplyDispatcherFactoryOptions,
) => ReplyDispatcherFactoryResult;
