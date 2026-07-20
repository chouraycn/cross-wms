/**
 * 移植自 openclaw/src/agents/model-auth-markers.ts
 *
 * Non-secret model-auth marker helpers.
 * Distinguishes persisted auth markers, env-var placeholders, OAuth markers,
 * local auth sentinels, and secret-ref header markers without exposing secrets.
 */

/** @deprecated MiniMax provider-owned marker; do not use from third-party plugins. */
export const MINIMAX_OAUTH_MARKER = "minimax-oauth";
/** Prefix for persisted OAuth-backed API-key marker values. */
export const OAUTH_API_KEY_MARKER_PREFIX = "oauth:";
/** Marker for local Ollama auth that does not use a real API key. */
export const OLLAMA_LOCAL_AUTH_MARKER = "ollama-local";
/** @deprecated Bundled local-provider marker; do not use from third-party plugins. */
export const CUSTOM_LOCAL_AUTH_MARKER = "custom-local";
/** @deprecated Codex provider-owned marker; do not use from third-party plugins. */
export const CODEX_APP_SERVER_AUTH_MARKER = "codex-app-server";
/** Marker for Google Vertex credentials resolved outside plain API-key env vars. */
export const GCP_VERTEX_CREDENTIALS_MARKER = "gcp-vertex-credentials";
/** Marker for a secret-ref-managed credential that is not stored as an env var. */
export const NON_ENV_SECRETREF_MARKER = "secretref-managed"; // pragma: allowlist secret
/** Prefix for secret-ref header markers that name an env-backed source. */
export const SECRETREF_ENV_HEADER_MARKER_PREFIX = "secretref-env:"; // pragma: allowlist secret

const AWS_SDK_ENV_MARKERS = new Set([
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_ACCESS_KEY_ID",
  "AWS_PROFILE",
]);
const CORE_NON_SECRET_API_KEY_MARKERS = [
  CUSTOM_LOCAL_AUTH_MARKER,
  CODEX_APP_SERVER_AUTH_MARKER,
  GCP_VERTEX_CREDENTIALS_MARKER,
  OLLAMA_LOCAL_AUTH_MARKER,
  NON_ENV_SECRETREF_MARKER,
] as const;

// Legacy marker names kept for backward compatibility with existing models.json files.
const LEGACY_ENV_API_KEY_MARKERS = [
  "GOOGLE_API_KEY",
  "DEEPSEEK_API_KEY",
  "PERPLEXITY_API_KEY",
  "FIREWORKS_API_KEY",
  "NOVITA_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_API_KEY",
  "MINIMAX_CODE_PLAN_KEY",
];

// Known provider env api key names from the bundled plugin set.
const BUNDLED_PROVIDER_ENV_API_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "XAI_API_KEY",
  "MINIMAX_API_KEY",
  "MOONSHOT_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "TOGETHER_API_KEY",
  "NOVITA_API_KEY",
];

const ALL_KNOWN_ENV_API_KEY_MARKERS = new Set([
  ...BUNDLED_PROVIDER_ENV_API_KEY_NAMES,
  ...LEGACY_ENV_API_KEY_MARKERS,
  ...AWS_SDK_ENV_MARKERS,
]);

let knownNonSecretApiKeyMarkersCache: string[] | undefined;

/** List non-secret auth markers known from core and bundled plugin manifests. */
export function listKnownNonSecretApiKeyMarkers(): string[] {
  knownNonSecretApiKeyMarkersCache ??= [...CORE_NON_SECRET_API_KEY_MARKERS];
  return [...knownNonSecretApiKeyMarkersCache];
}

/** Return true for AWS SDK env marker values that represent ambient auth. */
export function isAwsSdkAuthMarker(value: string): boolean {
  return AWS_SDK_ENV_MARKERS.has(value.trim());
}

/** Return true for recognized env-var API-key placeholders, excluding AWS SDK markers. */
export function isKnownEnvApiKeyMarker(value: string): boolean {
  const trimmed = value.trim();
  return ALL_KNOWN_ENV_API_KEY_MARKERS.has(trimmed) && !isAwsSdkAuthMarker(trimmed);
}

/** Build the persisted OAuth marker for one provider id. */
export function resolveOAuthApiKeyMarker(providerId: string): string {
  return `${OAUTH_API_KEY_MARKER_PREFIX}${providerId.trim()}`;
}

/** Return true when a marker value points at provider OAuth auth. */
export function isOAuthApiKeyMarker(value: string): boolean {
  return value.trim().startsWith(OAUTH_API_KEY_MARKER_PREFIX);
}

/** Resolve the API-key placeholder for a non-env secret-ref source. */
export function resolveNonEnvSecretRefApiKeyMarker(_source: unknown): string {
  return NON_ENV_SECRETREF_MARKER;
}

/** Resolve the header-value placeholder for a non-env secret-ref source. */
export function resolveNonEnvSecretRefHeaderValueMarker(_source: unknown): string {
  return NON_ENV_SECRETREF_MARKER;
}

/** Resolve the header-value placeholder for an env-backed secret-ref source. */
export function resolveEnvSecretRefHeaderValueMarker(envVarName: string): string {
  return `${SECRETREF_ENV_HEADER_MARKER_PREFIX}${envVarName.trim()}`;
}

/** Return true for secret-ref placeholders used in auth header values. */
export function isSecretRefHeaderValueMarker(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === NON_ENV_SECRETREF_MARKER || trimmed.startsWith(SECRETREF_ENV_HEADER_MARKER_PREFIX)
  );
}

/** Return true for persisted non-secret placeholders that should not be treated as real keys. */
export function isNonSecretApiKeyMarker(
  value: string,
  opts?: { includeEnvVarName?: boolean },
): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const isKnownMarker =
    isOAuthApiKeyMarker(trimmed) ||
    listKnownNonSecretApiKeyMarkers().includes(trimmed) ||
    isAwsSdkAuthMarker(trimmed);
  if (isKnownMarker) {
    return true;
  }
  if (opts?.includeEnvVarName === false) {
    return false;
  }
  return ALL_KNOWN_ENV_API_KEY_MARKERS.has(trimmed);
}
