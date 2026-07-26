export const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope'
export const SELECTED_AGENT_STORAGE_KEY = ENTERPRISE_AGENT_STORAGE_KEY
export const SESSION_FILTER_STORAGE_PREFIX = 'skill_agent_session_filter'
export const AGENT_SCOPE_CHANGE_EVENT = 'ultrarag-enterprise-agent-scope-change'

export function sessionFilterStorageKey(userId: string): string {
  return `${SESSION_FILTER_STORAGE_PREFIX}:${userId || 'anonymous'}`
}

export function persistSharedAgentScope(agentId: string, userId?: string): void {
  void userId
  if (!agentId) return
  window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, agentId)
}

export function readSharedAgentScope(): string | null {
  return window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)
}

export function clearSharedAgentScope(userId?: string): void {
  void userId
  window.localStorage.removeItem(ENTERPRISE_AGENT_STORAGE_KEY)
}

export function emitAgentScopeChange(agentId: string): void {
  window.dispatchEvent(
    new CustomEvent(AGENT_SCOPE_CHANGE_EVENT, {
      detail: { agentId },
    }),
  )
}

export type AgentScopeChangeDetail = { agentId: string }

export function isAgentScopeChangeEvent(
  event: Event,
): event is CustomEvent<AgentScopeChangeDetail> {
  return (
    event instanceof CustomEvent
    && event.type === AGENT_SCOPE_CHANGE_EVENT
  )
}
