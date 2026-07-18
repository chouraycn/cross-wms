// Command-time secret resolution through gateway/local secret stores for configured targets.
// 移植自 openclaw/src/cli/command-secret-gateway.ts。
//
// 降级策略：
//  - 原模块依赖大量 openclaw 内部运行时模块（gateway/call、secrets/*、
//    plugins/plugin-registry、config/types.openclaw 等），cross-wms 均未移植。
//  - 此处降级为返回未修改的 config 与空 diagnostics，保留函数签名以便未来替换为正式实现。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

export type CommandSecretResolutionMode =
  | "enforce_resolved"
  | "read_only_status"
  | "read_only_operational";

type ResolveCommandSecretsResult = {
  resolvedConfig: OpenClawConfig;
  diagnostics: string[];
  targetStatesByPath: Record<string, CommandSecretTargetState>;
  hadUnresolvedTargets: boolean;
};

type CommandSecretTargetState =
  | "resolved_gateway"
  | "resolved_local"
  | "inactive_surface"
  | "unresolved";

/**
 * Resolve command-scoped secrets via gateway/local secret stores.
 *
 * 降级实现：openclaw 的 gateway/call、secrets/*、plugins/plugin-registry 等运行时模块
 * 尚未移植。这里降级为返回未修改的 config 与空 diagnostics，保留函数签名以便未来
 * 替换为正式实现。
 */
export async function resolveCommandSecretRefsViaGateway(params: {
  config: OpenClawConfig;
  commandName: string;
  targetIds: Set<string>;
  mode?: CommandSecretResolutionMode;
  allowedPaths?: ReadonlySet<string>;
  forcedActivePaths?: ReadonlySet<string>;
  optionalActivePaths?: ReadonlySet<string>;
  allowLocalExecSecretRefs?: boolean;
  scrubUnresolvedSecretRefs?: boolean;
}): Promise<ResolveCommandSecretsResult> {
  void params.commandName;
  void params.targetIds;
  void params.mode;
  void params.allowedPaths;
  void params.forcedActivePaths;
  void params.optionalActivePaths;
  void params.allowLocalExecSecretRefs;
  void params.scrubUnresolvedSecretRefs;
  return {
    resolvedConfig: params.config,
    diagnostics: [],
    targetStatesByPath: {},
    hadUnresolvedTargets: false,
  };
}
