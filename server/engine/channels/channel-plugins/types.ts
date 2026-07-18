import { z } from "zod";

export type PluginId = string;

export type PluginVersion = string;

export type PluginStatus = "installed" | "enabled" | "disabled" | "error" | "installing";

export type PluginHookType =
  | "beforeInitialize"
  | "afterInitialize"
  | "beforeSend"
  | "afterSend"
  | "beforeReceive"
  | "afterReceive"
  | "beforeProcess"
  | "afterProcess"
  | "onError"
  | "onShutdown";

export interface PluginMetadata {
  id: PluginId;
  name: string;
  version: PluginVersion;
  description?: string;
  author?: string;
  homepage?: string;
  dependencies?: PluginId[];
  category?: string;
}

export interface PluginConfig {
  enabled?: boolean;
  settings?: Record<string, unknown>;
}

export interface PluginContext {
  logger: typeof import("../../../logger.js").logger;
  config: Record<string, unknown>;
  channelId: string;
  accountId?: string;
}

export interface PluginHookContext {
  pluginId: PluginId;
  hookType: PluginHookType;
  data?: unknown;
  context: PluginContext;
}

export interface PluginHookHandler {
  (context: PluginHookContext): Promise<void> | void;
}

export interface PluginHookRegistration {
  hookType: PluginHookType;
  handler: PluginHookHandler;
  priority?: number;
}

export interface PluginPermission {
  id: string;
  name: string;
  description?: string;
  scope: "read" | "write" | "admin";
}

export interface PluginSandboxOptions {
  allowedGlobals?: string[];
  allowedModules?: string[];
  memoryLimitMb?: number;
  timeoutMs?: number;
}

export interface PluginInstallOptions {
  source?: string;
  version?: string;
  force?: boolean;
  skipDependencies?: boolean;
}

export interface PluginInstallationResult {
  success: boolean;
  pluginId?: PluginId;
  error?: string;
  installedDependencies?: PluginId[];
}

export interface PluginDefinition {
  metadata: PluginMetadata;
  configSchema?: z.ZodType;
  permissions?: PluginPermission[];
  hooks?: PluginHookRegistration[];
  initialize?: (context: PluginContext) => Promise<void>;
  shutdown?: (context: PluginContext) => Promise<void>;
}

export interface RegisteredPlugin {
  definition: PluginDefinition;
  status: PluginStatus;
  config: PluginConfig;
  context: PluginContext;
  instance?: unknown;
  error?: string;
}

export const PluginMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  category: z.string().optional(),
});

export const PluginConfigSchema = z.object({
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const PluginPermissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  scope: z.enum(["read", "write", "admin"]),
});