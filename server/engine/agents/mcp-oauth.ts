/**
 * 移植自 openclaw/src/agents/mcp-oauth.ts
 *
 * MCP OAuth credential store and login helpers. cross-wms provides
 * in-memory stubs since the full MCP SDK OAuth infrastructure is not available.
 */

/** Persisted OAuth credential presence flags for one MCP server. */
export type McpOAuthCredentialsStatus = {
  hasTokens: boolean;
  hasClientInformation: boolean;
  hasCodeVerifier: boolean;
  hasDiscoveryState: boolean;
  hasLastAuthorizationUrl: boolean;
};

// In-memory credential store keyed by serverName+serverUrl
const credentialStore = new Map<string, Record<string, unknown>>();

function storeKey(serverName: string, serverUrl: string): string {
  return `${serverName}\0${serverUrl}`;
}

/** Creates a minimal OAuth client provider. In cross-wms this throws on auth-required operations. */
export function createMcpOAuthClientProvider(params: {
  serverName: string;
  serverUrl: string;
  config?: unknown;
  onAuthorizationUrl?: (url: URL) => void | Promise<void>;
  allowAuthorizationRedirect?: boolean;
}): Record<string, unknown> {
  const key = storeKey(params.serverName, params.serverUrl);
  return {
    redirectUrl: "http://127.0.0.1:8989/oauth/callback",
    clientMetadata: {
      client_name: "cross-wms MCP",
      redirect_uris: ["http://127.0.0.1:8989/oauth/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    async state() {
      throw new Error(
        `MCP server "${params.serverName}" requires OAuth authorization. Run the login command for this server.`,
      );
    },
    async clientInformation() {
      const store = credentialStore.get(key);
      return store?.clientInformation;
    },
    async saveClientInformation(clientInformation: unknown) {
      const store = credentialStore.get(key) ?? {};
      credentialStore.set(key, { ...store, clientInformation });
    },
    async tokens() {
      const store = credentialStore.get(key);
      return store?.tokens;
    },
    async saveTokens(tokens: unknown) {
      const store = credentialStore.get(key) ?? {};
      credentialStore.set(key, { ...store, tokens });
    },
    async redirectToAuthorization(_authorizationUrl: URL) {
      throw new Error(
        `MCP server "${params.serverName}" requires OAuth authorization. Run the login command for this server.`,
      );
    },
    async saveCodeVerifier(_codeVerifier: string) {
      // Stored in memory
    },
    async codeVerifier() {
      throw new Error("Missing MCP OAuth code verifier. Run the login flow again.");
    },
    async invalidateCredentials(_scope: string) {
      credentialStore.delete(key);
    },
    async saveDiscoveryState(_discoveryState: unknown) {
      // Stored in memory
    },
    async discoveryState() {
      return undefined;
    },
  };
}

/** Deletes stored OAuth credentials for one MCP server. */
export async function clearMcpOAuthCredentials(params: {
  serverName: string;
  serverUrl: string;
}): Promise<void> {
  credentialStore.delete(storeKey(params.serverName, params.serverUrl));
}

/** Reads stored OAuth credential presence without exposing credential values. */
export async function readMcpOAuthCredentialsStatus(params: {
  serverName: string;
  serverUrl: string;
}): Promise<McpOAuthCredentialsStatus> {
  const store = credentialStore.get(storeKey(params.serverName, params.serverUrl));
  if (!store) {
    return {
      hasTokens: false,
      hasClientInformation: false,
      hasCodeVerifier: false,
      hasDiscoveryState: false,
      hasLastAuthorizationUrl: false,
    };
  }
  return {
    hasTokens: Boolean(store.tokens),
    hasClientInformation: Boolean(store.clientInformation),
    hasCodeVerifier: Boolean(store.codeVerifier),
    hasDiscoveryState: Boolean(store.discoveryState),
    hasLastAuthorizationUrl: Boolean(store.lastAuthorizationUrl),
  };
}

/** Runs the MCP OAuth login flow — throws in cross-wms since browser redirect is not available. */
export async function runMcpOAuthLogin(_params: {
  serverName: string;
  serverUrl: string;
  config?: unknown;
  authorizationCode?: string;
  fetchFn?: unknown;
  onAuthorizationUrl?: (url: URL) => void | Promise<void>;
}): Promise<"authorized" | "redirect"> {
  throw new Error("MCP OAuth login is not supported in cross-wms. Configure API keys directly.");
}
