export type SecretInputMode = "env" | "file" | "keychain" | "prompt" | "oauth";

export type SecretInput =
  | { type: "env"; envVar: string }
  | { type: "file"; path: string }
  | { type: "keychain"; service: string; account: string }
  | { type: "prompt"; label: string }
  | { type: "oauth"; provider: string };

export type ProviderAuthMethod =
  | "api-key"
  | "oauth"
  | "env-var"
  | "secret-file"
  | "none";

export type ProviderAuthResult = {
  ok: boolean;
  apiKey?: string;
  error?: string;
  source?: string;
  expiresAt?: number;
};

export type ProviderAuthContext = {
  provider: string;
  cfg?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  agentDir?: string;
};

export type ProviderAuthDoctorHintContext = {
  provider: string;
  cfg?: Record<string, unknown>;
};

export type ProviderAuthMethodNonInteractiveContext = {
  provider: string;
  cfg?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
};

export type ProviderPreparedRuntimeAuth = {
  apiKey?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  expiresAt?: number;
};

export type ProviderPrepareRuntimeAuthContext = {
  provider: string;
  model?: string;
  cfg?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
};

export type ProviderResolveUsageAuthContext = {
  provider: string;
  cfg?: Record<string, unknown>;
};

export type ProviderResolvedUsageAuth = {
  ok: boolean;
  usageToken?: string;
  error?: string;
};

export type ProviderUsageAuthToken = {
  token: string;
  provider: string;
  expiresAt?: number;
};

export function formatApiKeyPreview(apiKey: string): string {
  if (!apiKey) {
    return "";
  }
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function normalizeApiKeyInput(input: string): string {
  return input.trim();
}

export function validateApiKeyInput(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: "API key cannot be empty" };
  }
  if (trimmed.length < 4) {
    return { valid: false, error: "API key is too short" };
  }
  return { valid: true };
}
