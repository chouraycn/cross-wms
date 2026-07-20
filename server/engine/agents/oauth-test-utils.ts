/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-test-utils.ts
 *
 * cross-wms 降级实现：提供简化的 OAuth 测试工具函数。
 * 使用 fs/os/path 替代完整 OpenClaw 依赖。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const OAUTH_AGENT_ENV_KEYS = ["OPENCLAW_STATE_DIR", "OPENCLAW_AGENT_DIR"];

export function resolveApiKeyForProfileInTest(
  resolver: (params: Record<string, unknown>) => unknown,
  params: Record<string, unknown>,
) {
  return resolver({ cfg: {}, ...params });
}

export function oauthCred(params: {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  email?: string;
}): Record<string, unknown> {
  return { type: "oauth", ...params };
}

export function storeWith(profileId: string, cred: Record<string, unknown>): Record<string, unknown> {
  return { version: 1, profiles: { [profileId]: cred } };
}

export function createExpiredOauthStore(params: {
  profileId: string;
  provider: string;
  access?: string;
  refresh?: string;
  accountId?: string;
  email?: string;
}): Record<string, unknown> {
  return {
    version: 1,
    profiles: {
      [params.profileId]: {
        type: "oauth",
        provider: params.provider,
        access: params.access ?? "cached-access-token",
        refresh: params.refresh ?? "refresh-token",
        expires: Date.now() - 60_000,
        accountId: params.accountId,
        email: params.email,
      },
    },
  };
}

export async function createOAuthTestTempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function createOAuthMainAgentDir(stateDir: string): Promise<string> {
  const agentDir = path.join(stateDir, "agents", "main", "agent");
  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_AGENT_DIR = agentDir;
  await fs.mkdir(agentDir, { recursive: true });
  return agentDir;
}

export async function removeOAuthTestTempRoot(tempRoot: string): Promise<void> {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export function readAuthProfileStoreForTest(agentDir: string): Record<string, unknown> {
  // Simplified: return empty store instead of loading from disk
  return { version: 1, profiles: {} };
}

export function resetOAuthProviderRuntimeMocks(mocks: {
  refreshProviderOAuthCredentialWithPluginMock: { mockReset: () => void; mockResolvedValue: (v: unknown) => void };
  formatProviderAuthProfileApiKeyWithPluginMock: { mockReset: () => void; mockReturnValue: (v: unknown) => void };
}): void {
  mocks.refreshProviderOAuthCredentialWithPluginMock.mockReset();
  mocks.refreshProviderOAuthCredentialWithPluginMock.mockResolvedValue(undefined);
  mocks.formatProviderAuthProfileApiKeyWithPluginMock.mockReset();
  mocks.formatProviderAuthProfileApiKeyWithPluginMock.mockReturnValue(undefined);
}

export function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomAsciiString(rng: () => number, maxLen: number): string {
  const len = Math.floor(rng() * maxLen);
  const chars: string[] = [];
  for (let index = 0; index < len; index += 1) {
    chars.push(String.fromCodePoint(32 + Math.floor(rng() * 95)));
  }
  return chars.join("");
}

export function maybe<T>(rng: () => number, value: T): T | undefined {
  return rng() < 0.5 ? value : undefined;
}

export function randomlyCased(value: string, rng: () => number): string {
  return value
    .split("")
    .map((char) => (rng() < 0.5 ? char.toUpperCase() : char.toLowerCase()))
    .join("");
}
