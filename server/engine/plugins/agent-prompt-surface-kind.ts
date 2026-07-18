/**
 * 规范化插件声明的 agent prompt surface kind。
 *
 * 降级说明：原实现依赖 ./types.js 中的 AgentPromptSurfaceKind 类型，
 * cross-wms 暂未移植该类型，这里以本地联合类型替代，覆盖已知的 surface 名。
 */

/** 插件可声明的 agent prompt surface 名称。 */
export type AgentPromptSurfaceKind =
  | "openclaw_main"
  | "pi_main"
  | "openclaw_subagent"
  | "openclaw_compaction"
  | "openclaw_planner"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** 将旧版 prompt surface 名规范化为当前 OpenClaw surface 名。 */
export function normalizeAgentPromptSurfaceKind(
  surface: AgentPromptSurfaceKind,
): AgentPromptSurfaceKind {
  return surface === "pi_main" ? "openclaw_main" : surface;
}

/** 当 prompt surface 指向 OpenClaw 主 prompt 时返回 true。 */
export function isOpenClawMainPromptSurface(surface: AgentPromptSurfaceKind): boolean {
  return normalizeAgentPromptSurfaceKind(surface) === "openclaw_main";
}
