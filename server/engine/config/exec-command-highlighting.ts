// 移植自 openclaw/src/config/exec-command-highlighting.ts
// 为 agent 会话解析 exec 命令高亮配置。
//
// 降级说明：源文件依赖 ../routing/session-key.js 的 normalizeAgentId。
// 此处内联等价实现。
import type { OpenClawConfig } from './types/openclaw.js';

/** 内联降级实现：将 agent id 规范化为小写并去除空白。 */
function normalizeAgentId(agentId: string): string {
  return agentId.trim().toLowerCase();
}

/** 解析当前 agent 作用域下 exec 命令高亮是否启用。 */
export function resolveExecCommandHighlighting(params: {
  config?: OpenClawConfig | null;
  agentId?: string | null;
}): boolean {
  const config = params.config ?? {};
  const globalValue = config.tools?.exec?.commandHighlighting;
  const agentId = params.agentId ? normalizeAgentId(params.agentId) : null;
  const agentValue = agentId
    ? config.agents?.list?.find((entry) => normalizeAgentId(entry.id) === agentId)?.tools?.exec
        ?.commandHighlighting
    : undefined;
  // Agent 作用域配置覆盖全局 exec 设置；缺失配置保持禁用。
  return agentValue ?? globalValue ?? false;
}
