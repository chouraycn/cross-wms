// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/channels/plugins/types.config.ts
// Status: 已移植 openclaw 同源类型定义
// Used by: server/engine/plugins/{bundled-channel-config-metadata,manifest,types_plugin}.ts
// 注：定义 channel 配置的 JSON Schema 元数据、UI 提示与运行时 parser 结果形状。
//      依赖 JsonSchemaObject (../shared/json-schema.types.js)。

import type { JsonSchemaObject } from "../shared/json-schema.types.js";

/** Optional UI metadata for a JSON Schema property. */
export type ChannelConfigUiHint = {
  label?: string;
  help?: string;
  tags?: string[];
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

/** Normalized validation issue emitted by a channel runtime parser. */
export type ChannelConfigRuntimeIssue = {
  path?: Array<string | number>;
  message?: string;
  code?: string;
} & Record<string, unknown>;

/** Minimal safeParse result shape accepted from channel-owned validators. */
export type ChannelConfigRuntimeParseResult =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      issues: ChannelConfigRuntimeIssue[];
    };

/** Runtime validator contract paired with the JSON Schema config surface. */
export type ChannelConfigRuntimeSchema = {
  safeParse: (value: unknown) => ChannelConfigRuntimeParseResult;
};

/** Complete channel config schema description exposed to host tooling. */
export type ChannelConfigSchema = {
  schema: JsonSchemaObject;
  uiHints?: Record<string, ChannelConfigUiHint>;
  runtime?: ChannelConfigRuntimeSchema;
};
