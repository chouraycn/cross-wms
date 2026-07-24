// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/channels/plugins/types.core.ts (ChannelMeta, ChannelExposure)
// Status: 已移植 openclaw 同源类型定义
// Used by: server/engine/plugins/{channel-validation,meta-normalization,types_plugin}.ts
// 注：openclaw 中 ChannelMeta 定义在 types.core.ts，types.public.ts 为 barrel re-export。
//      字段结构与 cross-wms channels/_openclaw-stubs.ts 中的 ChannelMeta 保持一致
//      （selectionLabel/docsPath/blurb 为可选），以确保两处类型结构兼容、
//      listChatChannels() 返回值可直接赋值。

/** Channel surface exposure flags for docs, setup, and config flows. */
export type ChannelExposure = {
  configured?: boolean;
  setup?: boolean;
  docs?: boolean;
};

/** User-facing metadata used in docs, pickers, and setup surfaces. */
export type ChannelMeta = {
  id: string;
  label: string;
  selectionLabel?: string;
  docsPath?: string;
  docsLabel?: string;
  blurb?: string;
  detailLabel?: string;
  systemImage?: string;
  [key: string]: unknown;
};
