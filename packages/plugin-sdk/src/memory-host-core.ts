// 记忆宿主运行时核心：公共记忆工件发现与工作区管理。
// openclaw 原始实现从 ../config/config.js、../plugins/memory-state.js、
// ./memory-core-host-status.js、./memory-host-events.js 导入。此处提供
// 最小可用类型与桩函数，待依赖子系统移植后接入。

/** 记忆插件公共工件类型。 */
export type MemoryPluginPublicArtifactKind =
  | "memory-root"
  | "daily-note"
  | "dream-report"
  | "event-log";

/** 记忆插件公共工件内容类型。 */
export type MemoryPluginPublicArtifactContentType = "markdown" | "json";

/** 记忆插件公共工件。 */
export type MemoryPluginPublicArtifact = {
  /** 工件类型。 */
  kind: MemoryPluginPublicArtifactKind;
  /** 工作区目录。 */
  workspaceDir: string;
  /** 相对路径。 */
  relativePath: string;
  /** 绝对路径。 */
  absolutePath: string;
  /** 关联 agent ID 列表。 */
  agentIds: string[];
  /** 内容类型。 */
  contentType: MemoryPluginPublicArtifactContentType;
};

/** 记忆工作区配置。 */
export type MemoryWorkspaceConfig = {
  /** 工作区目录。 */
  workspaceDir: string;
  /** 关联 agent ID 列表。 */
  agentIds: string[];
};

/** openclaw 运行时配置（最小子集）。 */
export type OpenClawConfigLike = {
  memory?: {
    workspaces?: Array<MemoryWorkspaceConfig | string>;
  };
};

// TODO: 依赖模块未移植，暂用本地桩
export async function resolveMemoryDreamingWorkspaces(
  _cfg: OpenClawConfigLike,
): Promise<MemoryWorkspaceConfig[]> {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveMemoryHostEventLogPath(workspaceDir: string): string {
  return `${workspaceDir}/memory-events.jsonl`;
}

/** 列出单个工作区的公共记忆工件，包括笔记与事件日志。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function listMemoryWorkspacePublicArtifacts(params: {
  workspaceDir: string;
  agentIds: string[];
}): Promise<MemoryPluginPublicArtifact[]> {
  return [];
}

/** 列出所有已配置记忆工作区的公共工件。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function listMemoryHostPublicArtifacts(params: {
  cfg: OpenClawConfigLike;
}): Promise<MemoryPluginPublicArtifact[]> {
  const workspaces = await resolveMemoryDreamingWorkspaces(params.cfg);
  const artifacts: MemoryPluginPublicArtifact[] = [];
  for (const workspace of workspaces) {
    artifacts.push(
      ...(await listMemoryWorkspacePublicArtifacts({
        workspaceDir: workspace.workspaceDir,
        agentIds: workspace.agentIds,
      })),
    );
  }
  return artifacts;
}
