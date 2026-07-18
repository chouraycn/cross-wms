// 移植自 openclaw/src/config/bindings.ts
// 规范化 channel、route 和 ACP 会话的 agent binding 配置。
import type { AgentAcpBinding, AgentBinding, AgentRouteBinding } from './types/agents.js';
import type { OpenClawConfig } from './types/openclaw.js';

function normalizeBindingType(binding: AgentBinding): 'route' | 'acp' {
  // 缺失 type 是遗留/默认的 route binding 形态。
  return binding.type === 'acp' ? 'acp' : 'route';
}

/** 将已配置的 binding 收窄为 channel route 形态。 */
export function isRouteBinding(binding: AgentBinding): binding is AgentRouteBinding {
  return normalizeBindingType(binding) === 'route';
}

function isAcpBinding(binding: AgentBinding): binding is AgentAcpBinding {
  return normalizeBindingType(binding) === 'acp';
}

/** 返回已配置的 binding 列表，将缺失/非数组配置视为空。 */
export function listConfiguredBindings(cfg: OpenClawConfig): AgentBinding[] {
  return Array.isArray(cfg.bindings) ? cfg.bindings : [];
}

/** 列出 channel route binding，包括没有显式 type 的遗留 binding。 */
export function listRouteBindings(cfg: OpenClawConfig): AgentRouteBinding[] {
  return listConfiguredBindings(cfg).filter(isRouteBinding);
}

/** 仅列出 ACP 会话 binding。 */
export function listAcpBindings(cfg: OpenClawConfig): AgentAcpBinding[] {
  return listConfiguredBindings(cfg).filter(isAcpBinding);
}
