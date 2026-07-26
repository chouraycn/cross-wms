// Human-readable formatting for agent routing binding match criteria.
// 移植自 openclaw/src/commands/agents.binding-format.ts
//
// 降级说明：
//  - AgentRouteBinding 来自 ../config/types.js，cross-wms 中降级为 unknown
//  - 在本文件中定义本地最小 AgentRouteBinding 结构占位，保持 describeBinding 类型契约
//  - 调用方传入的完整 AgentRouteBinding 对象可通过结构子集化赋值给此类型

/** Agent routing binding match criteria（最小占位，与 openclaw 定义结构兼容）。 */
export type AgentRouteBindingMatch = {
  channel: string;
  accountId?: string;
  peer?: { kind: string; id: string };
  guildId?: string;
  teamId?: string;
};

/** Agent routing binding（最小占位，与 openclaw 定义结构兼容）。 */
export type AgentRouteBinding = {
  match: AgentRouteBindingMatch;
  [key: string]: unknown;
};

/** Render one route binding as a compact CLI line fragment. */
export function describeBinding(binding: AgentRouteBinding): string {
  const match = binding.match;
  const parts = [match.channel];
  if (match.accountId) {
    parts.push(`accountId=${match.accountId}`);
  }
  if (match.peer) {
    parts.push(`peer=${match.peer.kind}:${match.peer.id}`);
  }
  if (match.guildId) {
    parts.push(`guild=${match.guildId}`);
  }
  if (match.teamId) {
    parts.push(`team=${match.teamId}`);
  }
  return parts.join(" ");
}
