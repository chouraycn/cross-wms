/**
 * Deprecated draft preview finalizer facade. — 移植自 openclaw/src/channels/draft-preview-finalizer.ts
 *
 * 降级策略：
 *  - ./message/live.js (deliverFinalizableLivePreview 等) → ./_openclaw-stubs.js
 *    cross-wms 的 channels/message/ 子目录尚未移植 live.ts。
 *
 * 降级行为：deliverFinalizableLivePreview stub 会直接调用调用方提供的 deliverNormally，
 * 因此后置结果统一退化为 "normal-skipped" / "delivered"。
 */
import {
  deliverFinalizableLivePreview,
  type LivePreviewFinalizerDraft,
  type LivePreviewFinalizerResultKind,
} from "./_openclaw-stubs.js";

/**
 * @deprecated Use `LivePreviewFinalizerDraft` from `openclaw/plugin-sdk/channel-outbound`.
 */
export type DraftPreviewFinalizerDraft<TId> = LivePreviewFinalizerDraft<TId>;

/**
 * @deprecated Use `LivePreviewFinalizerResult` from `openclaw/plugin-sdk/channel-outbound`.
 */
export type DraftPreviewFinalizerResult = Exclude<
  LivePreviewFinalizerResultKind,
  "preview-retained"
>;

/**
 * @deprecated Use `deliverFinalizableLivePreview` from `openclaw/plugin-sdk/channel-outbound`.
 */
export async function deliverFinalizableDraftPreview<TPayload, TId, TEdit>(params: {
  kind: "tool" | "block" | "final";
  payload: TPayload;
  draft?: DraftPreviewFinalizerDraft<TId>;
  buildFinalEdit: (payload: TPayload) => TEdit | undefined;
  editFinal: (id: TId, edit: TEdit) => Promise<void>;
  deliverNormally: (payload: TPayload) => Promise<boolean | void>;
  onPreviewFinalized?: (id: TId) => Promise<void> | void;
  onNormalDelivered?: () => Promise<void> | void;
  logPreviewEditFailure?: (error: unknown) => void;
}): Promise<DraftPreviewFinalizerResult> {
  const result = await deliverFinalizableLivePreview<TPayload, TId, TEdit>({
    kind: params.kind,
    payload: params.payload,
    ...(params.draft ? { draft: params.draft } : {}),
    buildFinalEdit: params.buildFinalEdit,
    editFinal: params.editFinal,
    deliverNormally: params.deliverNormally,
    onPreviewFinalized: async (id) => {
      await params.onPreviewFinalized?.(id);
    },
    ...(params.onNormalDelivered ? { onNormalDelivered: params.onNormalDelivered } : {}),
    ...(params.logPreviewEditFailure
      ? { logPreviewEditFailure: params.logPreviewEditFailure }
      : {}),
  });

  // stub 实现下 deliverFinalizableLivePreview 始终返回 "delivered"，永远不会进入
  // "preview-retained" 分支。这里使用类型断言以兼容 openclaw 原始类型契约。
  return (result.kind === "preview-retained"
    ? "normal-skipped"
    : result.kind) as DraftPreviewFinalizerResult;
}
