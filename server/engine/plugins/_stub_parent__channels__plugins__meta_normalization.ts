// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/channels/plugins/meta-normalization.ts
// Status: 已移植 openclaw 同源实现
// Used by: server/engine/plugins/channel-validation.ts
// 注：规范化 channel 元数据 (id/label/selectionLabel/docsPath/blurb)，
//      保留可选 manifest/registry 字段。依赖 normalizeOptionalString
//      (本地 _openclaw__normalization_core__string_coerce.js) 与 ChannelMeta 类型。

import { normalizeOptionalString } from "./_openclaw__normalization_core__string_coerce.js";
import type { ChannelMeta } from "./_stub_parent__channels__plugins__types_public.js";

function stripRequiredChannelMeta(meta?: Partial<ChannelMeta> | null) {
  const {
    id: _ignoredId,
    label: _ignoredLabel,
    selectionLabel: _ignoredSelectionLabel,
    docsPath: _ignoredDocsPath,
    blurb: _ignoredBlurb,
    ...rest
  } = meta ?? {};
  return rest;
}

export function normalizeChannelMeta<TId extends string>(params: {
  id: TId;
  meta?: Partial<ChannelMeta> | null;
  existing?: Partial<ChannelMeta> | null;
}): ChannelMeta & { id: TId } {
  const next = params.meta ?? undefined;
  const existing = params.existing ?? undefined;
  const label =
    normalizeOptionalString(next?.label) ??
    normalizeOptionalString(existing?.label) ??
    normalizeOptionalString(next?.selectionLabel) ??
    normalizeOptionalString(existing?.selectionLabel) ??
    params.id;
  const selectionLabel =
    normalizeOptionalString(next?.selectionLabel) ??
    normalizeOptionalString(existing?.selectionLabel) ??
    label;
  const docsPath =
    normalizeOptionalString(next?.docsPath) ??
    normalizeOptionalString(existing?.docsPath) ??
    `/channels/${params.id}`;
  const blurb =
    normalizeOptionalString(next?.blurb) ?? normalizeOptionalString(existing?.blurb) ?? "";

  // Required fields are recomputed from normalized precedence above. Spreading
  // only optional leftovers prevents stale ids or labels from winning later.
  return {
    ...stripRequiredChannelMeta(existing),
    ...stripRequiredChannelMeta(next),
    id: params.id,
    label,
    selectionLabel,
    docsPath,
    blurb,
  } as ChannelMeta & { id: TId };
}
