/**
 * 移植自 openclaw/src/agents/agent-auth-credentials.ts
 *
 * Converts auth-profile credentials into agent runtime credential maps.
 * In cross-wms the full auth profile store infrastructure is not available,
 * so resolveAgentCredentialMapFromStore returns an empty map.
 */

/** Credential value shape consumed by agent runtimes after auth-profile normalization. */
type AgentApiKeyCredential = { type: "api_key"; key: string };
type AgentOAuthCredential = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
};

/** Credential map consumed by agent runtimes. */
type AgentCredential = AgentApiKeyCredential | AgentOAuthCredential;
export type AgentCredentialMap = Record<string, AgentCredential>;

/** Build one credential per normalized provider from an auth profile store (returns empty in cross-wms). */
export function resolveAgentCredentialMapFromStore(..._args: unknown[]): AgentCredentialMap {
  return {};
}
