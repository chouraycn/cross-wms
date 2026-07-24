// === PENDING MIGRATION STUB ===
// Source: openclaw/src/runtime/load-context.ts (待迁移)
// Status: 类型安全 no-op 实现 — 返回空 PluginLoadOptions / 透传 PluginRuntimeLoadContext
// Used by: server/engine/plugins/tools.ts
// 注：openclaw 同源实现需要从 plugin 配置解析运行时加载上下文
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PluginLoadOptions } from "./loader.js";

export interface PluginRuntimeLoadContext {
  config: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  logger: {
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const buildPluginRuntimeLoadOptions = (
  _context: unknown,
  _options?: Record<string, unknown>,
): PluginLoadOptions => ({});

export const resolvePluginRuntimeLoadContext = (params: {
  config: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: unknown;
}): PluginRuntimeLoadContext => ({
  config: params.config,
  workspaceDir: typeof params.workspaceDir === "string" ? params.workspaceDir : undefined,
  logger: { error: () => {}, warn: () => {}, debug: () => {} },
});
