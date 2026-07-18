/**
 * Install policy context.
 * 移植自 openclaw/src/plugins/install-policy-context.ts。
 * 降级策略：返回默认值。
 */
export type BeforeInstallHookPayloadParams = {
  pluginId: string;
  source: string;
  sourceKind: "npm" | "local" | "clawhub" | "git" | "archive";
  workspaceDir?: string;
};

export function createBeforeInstallHookPayload(params: BeforeInstallHookPayloadParams): {
  pluginId: string;
  source: string;
  sourceKind: string;
  timestamp: number;
} {
  return {
    pluginId: params.pluginId,
    source: params.source,
    sourceKind: params.sourceKind,
    timestamp: Date.now(),
  };
}
