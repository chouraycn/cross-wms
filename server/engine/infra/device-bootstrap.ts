// 首次运行时引导设备身份和信任状态。
// 降级实现：openclaw 中从 @openclaw/normalization-core/number-coercion 导入数字辅助，
// 从 ../logging/subsystem.js 导入子系统日志器，
// 从 ../shared/device-bootstrap-profile.js 和 ../shared/operator-scope-compat.js 导入共享辅助，
// cross-wms 在 _runtime-stubs 和 _device-shared-stubs 中提供降级实现。
import path from "node:path";

import {
  asDateTimestampMs,
  createSubsystemLogger,
  resolveExpiresAtMsFromDurationMs,
} from "./_runtime-stubs.js";
import {
  normalizeDeviceBootstrapHandoffProfile,
  normalizeDeviceBootstrapProfile,
  PAIRING_SETUP_BOOTSTRAP_PROFILE,
  resolveBootstrapProfileScopesForRole,
  roleScopesAllow,
  type DeviceBootstrapProfile,
  type DeviceBootstrapProfileInput,
} from "./_device-shared-stubs.js";
import { normalizeDevicePublicKeyBase64Url } from "./device-identity.js";
import {
  createAsyncLock,
  pruneExpiredPending,
  resolvePairingPaths,
  tryReadJson,
  writeJson,
} from "./pairing-files.js";
import { generatePairingToken, verifyPairingToken } from "./pairing-token.js";

/** bootstrap pairing tokens 是用于首次设备认证的短期 bearer 凭证 */
export const DEVICE_BOOTSTRAP_TOKEN_TTL_MS = 10 * 60 * 1000;

/** 持久化的 bootstrap token 状态，包括绑定和 role/scope 兑换进度 */
type DeviceBootstrapTokenRecord = {
  token: string;
  ts: number;
  deviceId?: string;
  publicKey?: string;
  profile?: DeviceBootstrapProfile;
  redeemedProfile?: DeviceBootstrapProfile;
  pendingProfile?: DeviceBootstrapProfile;
  roles?: string[];
  scopes?: string[];
  issuedAtMs: number;
  lastUsedAtMs?: number;
};

type DeviceBootstrapStateFile = Record<string, DeviceBootstrapTokenRecord>;

const withLock = createAsyncLock();
const log = createSubsystemLogger("device-bootstrap");

function resolveBootstrapPath(baseDir?: string): string {
  return path.join(resolvePairingPaths(baseDir, "devices").dir, "bootstrap.json");
}

function resolveIssuedBootstrapProfileInput(params: {
  profile?: DeviceBootstrapProfileInput;
  roles?: readonly string[];
  scopes?: readonly string[];
}): DeviceBootstrapProfileInput | undefined {
  if (params.profile) {
    return params.profile;
  }
  if (params.roles || params.scopes) {
    return {
      roles: params.roles,
      scopes: params.scopes,
    };
  }
  return undefined;
}

function resolvePersistedBootstrapProfile(
  record: Partial<DeviceBootstrapTokenRecord>,
): DeviceBootstrapProfile {
  return normalizeDeviceBootstrapProfile(record.profile ?? record);
}

function resolvePersistedRedeemedProfile(
  record: Partial<DeviceBootstrapTokenRecord>,
): DeviceBootstrapProfile {
  return normalizeDeviceBootstrapProfile(record.redeemedProfile);
}

function resolvePersistedPendingProfile(
  record: Partial<DeviceBootstrapTokenRecord>,
): DeviceBootstrapProfile | null {
  return record.pendingProfile ? normalizeDeviceBootstrapProfile(record.pendingProfile) : null;
}

function resolveRequestedBootstrapProfile(params: {
  role: string;
  scopes: readonly string[];
}): DeviceBootstrapProfile {
  return normalizeDeviceBootstrapProfile({
    roles: [params.role],
    scopes: resolveBootstrapProfileScopesForRole(params.role, params.scopes),
  });
}

function sameBootstrapProfile(
  left: DeviceBootstrapProfile,
  right: DeviceBootstrapProfile,
): boolean {
  if (left.roles.length !== right.roles.length || left.scopes.length !== right.scopes.length) {
    return false;
  }
  return (
    left.roles.every((role, index) => role === right.roles[index]) &&
    left.scopes.every((scope, index) => scope === right.scopes[index])
  );
}

function resolveIssuedBootstrapProfile(params: {
  profile?: DeviceBootstrapProfileInput;
  roles?: readonly string[];
  scopes?: readonly string[];
}): DeviceBootstrapProfile {
  const input = resolveIssuedBootstrapProfileInput(params);
  if (input) {
    // 已签发的 token 可以请求多个 roles/scopes，但 bootstrap 交接仅持久化允许列表
    return normalizeDeviceBootstrapHandoffProfile(input);
  }
  return PAIRING_SETUP_BOOTSTRAP_PROFILE;
}

function warnIfIssuedBootstrapScopesWereStripped(params: {
  input: DeviceBootstrapProfileInput | undefined;
  profile: DeviceBootstrapProfile;
}): void {
  if (!params.input) {
    return;
  }
  const requestedProfile = normalizeDeviceBootstrapProfile(params.input);
  const requestedScopes = requestedProfile.scopes;
  if (requestedScopes.length === 0) {
    return;
  }
  const retainedScopeSet = new Set(params.profile.scopes);
  const strippedScopes = requestedScopes.filter((scope) => !retainedScopeSet.has(scope));
  if (strippedScopes.length === 0) {
    return;
  }
  log.warn("bootstrap_token_scopes_stripped", {
    roles: requestedProfile.roles,
    requestedScopes,
    retainedScopes: params.profile.scopes,
    strippedScopes,
    consoleMessage: "bootstrap token scopes stripped to bootstrap handoff allowlist",
  });
}

function bootstrapProfileAllowsRequest(params: {
  allowedProfile: DeviceBootstrapProfile;
  requestedRole: string;
  requestedScopes: readonly string[];
}): boolean {
  return (
    params.allowedProfile.roles.includes(params.requestedRole) &&
    roleScopesAllow({
      role: params.requestedRole,
      requestedScopes: params.requestedScopes,
      allowedScopes: params.allowedProfile.scopes,
    })
  );
}

function bootstrapProfileSatisfiesProfile(params: {
  actualProfile: DeviceBootstrapProfile;
  requiredProfile: DeviceBootstrapProfile;
}): boolean {
  for (const requiredRole of params.requiredProfile.roles) {
    if (!params.actualProfile.roles.includes(requiredRole)) {
      return false;
    }
    const requiredScopes = resolveBootstrapProfileScopesForRole(
      requiredRole,
      params.requiredProfile.scopes,
    );
    if (
      requiredScopes.length > 0 &&
      !bootstrapProfileAllowsRequest({
        allowedProfile: params.actualProfile,
        requestedRole: requiredRole,
        requestedScopes: requiredScopes,
      })
    ) {
      return false;
    }
  }
  return true;
}

function normalizeBootstrapPublicKey(publicKey: string): string {
  const trimmed = publicKey.trim();
  if (!trimmed) {
    return "";
  }
  // 同一密钥的 PEM/base64/base64url 编码必须绑定到一个 token 身份
  if (trimmed.includes("BEGIN") || /[+/=]/.test(trimmed)) {
    return normalizeDevicePublicKeyBase64Url(trimmed) ?? trimmed;
  }
  return trimmed;
}

async function loadState(baseDir?: string): Promise<DeviceBootstrapStateFile> {
  const bootstrapPath = resolveBootstrapPath(baseDir);
  const rawState = (await tryReadJson<DeviceBootstrapStateFile>(bootstrapPath)) ?? {};
  const state: DeviceBootstrapStateFile = {};
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return state;
  }
  for (const [tokenKey, entry] of Object.entries(rawState)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Partial<DeviceBootstrapTokenRecord>;
    // 旧文件可能以 map id 而非 bearer token 本身作为键
    const token =
      typeof record.token === "string" && record.token.trim().length > 0 ? record.token : tokenKey;
    const issuedAtMs = asDateTimestampMs(record.issuedAtMs) ?? 0;
    const profile = resolvePersistedBootstrapProfile(record);
    const pendingProfile = resolvePersistedPendingProfile(record);
    state[tokenKey] = {
      token,
      profile,
      redeemedProfile: resolvePersistedRedeemedProfile(record),
      ...(pendingProfile ? { pendingProfile } : {}),
      deviceId: typeof record.deviceId === "string" ? record.deviceId : undefined,
      publicKey: typeof record.publicKey === "string" ? record.publicKey : undefined,
      issuedAtMs,
      ts: asDateTimestampMs(record.ts) ?? issuedAtMs,
      lastUsedAtMs: typeof record.lastUsedAtMs === "number" ? record.lastUsedAtMs : undefined,
    };
  }
  pruneExpiredPending(state, asDateTimestampMs(Date.now()) ?? 0, DEVICE_BOOTSTRAP_TOKEN_TTL_MS);
  return state;
}

async function persistState(state: DeviceBootstrapStateFile, baseDir?: string): Promise<void> {
  const bootstrapPath = resolveBootstrapPath(baseDir);
  await writeJson(bootstrapPath, state);
}

/** 签发一个带有有界 role/scope 交接 profile 的短期 bootstrap token */
export async function issueDeviceBootstrapToken(
  params: {
    baseDir?: string;
    profile?: DeviceBootstrapProfileInput;
    roles?: readonly string[];
    scopes?: readonly string[];
  } = {},
): Promise<{ token: string; expiresAtMs: number }> {
  return await withLock.run(async () => {
    const state = await loadState(params.baseDir);
    const token = generatePairingToken();
    const issuedAtMs = asDateTimestampMs(Date.now());
    const expiresAtMs =
      issuedAtMs === undefined
        ? undefined
        : resolveExpiresAtMsFromDurationMs(DEVICE_BOOTSTRAP_TOKEN_TTL_MS, { nowMs: issuedAtMs });
    if (issuedAtMs === undefined || expiresAtMs === undefined) {
      throw new Error("Device bootstrap token expiry could not be resolved.");
    }
    const profileInput = resolveIssuedBootstrapProfileInput(params);
    const profile = resolveIssuedBootstrapProfile(params);
    warnIfIssuedBootstrapScopesWereStripped({ input: profileInput, profile });
    state[token] = {
      token,
      ts: issuedAtMs,
      profile,
      redeemedProfile: normalizeDeviceBootstrapProfile(undefined),
      issuedAtMs,
    };
    await persistState(state, params.baseDir);
    return { token, expiresAtMs };
  });
}

/** 从配对状态文件中移除所有未完成的 bootstrap token */
export async function clearDeviceBootstrapTokens(
  params: {
    baseDir?: string;
  } = {},
): Promise<{ removed: number }> {
  return await withLock.run(async () => {
    const state = await loadState(params.baseDir);
    const removed = Object.keys(state).length;
    await persistState({}, params.baseDir);
    return { removed };
  });
}

/** 撤销一个 bootstrap token 并返回其记录用于 best-effort 恢复流程 */
export async function revokeDeviceBootstrapToken(params: {
  token: string;
  baseDir?: string;
}): Promise<{ removed: boolean; record?: DeviceBootstrapTokenRecord }> {
  return await withLock.run(async () => {
    const providedToken = params.token.trim();
    if (!providedToken) {
      return { removed: false };
    }
    const state = await loadState(params.baseDir);
    const found = Object.entries(state).find(([, candidate]) =>
      verifyPairingToken(providedToken, candidate.token),
    );
    if (!found) {
      return { removed: false };
    }
    const [tokenKey, record] = found;
    delete state[tokenKey];
    await persistState(state, params.baseDir);
    return { removed: true, record };
  });
}

/** 撤销已绑定到特定设备身份的 bootstrap tokens */
export async function revokeDeviceBootstrapTokensForDevice(params: {
  deviceId: string;
  publicKey: string;
  baseDir?: string;
}): Promise<{ removed: number }> {
  return await withLock.run(async () => {
    const deviceId = params.deviceId.trim();
    const publicKey = normalizeBootstrapPublicKey(params.publicKey);
    if (!deviceId || !publicKey) {
      return { removed: 0 };
    }
    const state = await loadState(params.baseDir);
    let removed = 0;
    for (const [tokenKey, record] of Object.entries(state)) {
      const recordPublicKey =
        typeof record.publicKey === "string"
          ? normalizeBootstrapPublicKey(record.publicKey)
          : undefined;
      if (record.deviceId?.trim() === deviceId && recordPublicKey === publicKey) {
        delete state[tokenKey];
        removed += 1;
      }
    }
    if (removed > 0) {
      await persistState(state, params.baseDir);
    }
    return { removed };
  });
}

/** 在下游发送失败后恢复之前撤销的 bootstrap token 记录 */
export async function restoreDeviceBootstrapToken(params: {
  record: DeviceBootstrapTokenRecord;
  baseDir?: string;
}): Promise<void> {
  return await withLock.run(async () => {
    const state = await loadState(params.baseDir);
    state[params.record.token] = params.record;
    await persistState(state, params.baseDir);
  });
}

/** 读取有效 token 的已签发 profile，不绑定或兑换它 */
export async function getDeviceBootstrapTokenProfile(params: {
  token: string;
  baseDir?: string;
}): Promise<DeviceBootstrapProfile | null> {
  return await withLock.run(async () => {
    const providedToken = params.token.trim();
    if (!providedToken) {
      return null;
    }
    const state = await loadState(params.baseDir);
    const found = Object.values(state).find((candidate) =>
      verifyPairingToken(providedToken, candidate.token),
    );
    return found ? resolvePersistedBootstrapProfile(found) : null;
  });
}

/** 记录多角色 bootstrap 交接的一个 role/scope 腿已兑换 */
export async function redeemDeviceBootstrapTokenProfile(params: {
  token: string;
  role: string;
  scopes: readonly string[];
  baseDir?: string;
}): Promise<{ recorded: boolean; fullyRedeemed: boolean }> {
  return await withLock.run(async () => {
    const providedToken = params.token.trim();
    if (!providedToken) {
      return { recorded: false, fullyRedeemed: false };
    }
    const state = await loadState(params.baseDir);
    const found = Object.entries(state).find(([, candidate]) =>
      verifyPairingToken(providedToken, candidate.token),
    );
    if (!found) {
      return { recorded: false, fullyRedeemed: false };
    }
    const [tokenKey, record] = found;
    const issuedProfile = resolvePersistedBootstrapProfile(record);
    const pendingProfile = resolvePersistedPendingProfile(record);
    // 保留 pending profile 直到该握手的所有请求 roles/scopes 都已兑换
    const redeemedProfile = normalizeDeviceBootstrapProfile({
      roles: [...resolvePersistedRedeemedProfile(record).roles, params.role],
      scopes: [
        ...resolvePersistedRedeemedProfile(record).scopes,
        ...resolveBootstrapProfileScopesForRole(params.role, params.scopes),
      ],
    });
    const nextPendingProfile =
      pendingProfile &&
      !bootstrapProfileSatisfiesProfile({
        actualProfile: redeemedProfile,
        requiredProfile: pendingProfile,
      })
        ? pendingProfile
        : undefined;
    const nextRecord: DeviceBootstrapTokenRecord = {
      ...record,
      profile: issuedProfile,
      redeemedProfile,
    };
    if (nextPendingProfile) {
      nextRecord.pendingProfile = nextPendingProfile;
    } else {
      delete nextRecord.pendingProfile;
    }
    state[tokenKey] = nextRecord;
    await persistState(state, params.baseDir);
    return {
      recorded: true,
      fullyRedeemed: bootstrapProfileSatisfiesProfile({
        actualProfile: redeemedProfile,
        requiredProfile: issuedProfile,
      }),
    };
  });
}

/** 验证 bootstrap token，将其绑定到第一个设备身份，并暂存请求的 scopes */
export async function verifyDeviceBootstrapToken(params: {
  token: string;
  deviceId: string;
  publicKey: string;
  role: string;
  scopes: readonly string[];
  baseDir?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return await withLock.run(async () => {
    const state = await loadState(params.baseDir);
    const providedToken = params.token.trim();
    if (!providedToken) {
      return { ok: false, reason: "bootstrap_token_invalid" };
    }
    const found = Object.entries(state).find(([, candidate]) =>
      verifyPairingToken(providedToken, candidate.token),
    );
    if (!found) {
      return { ok: false, reason: "bootstrap_token_invalid" };
    }
    const [tokenKey, record] = found;

    const deviceId = params.deviceId.trim();
    const publicKey = normalizeBootstrapPublicKey(params.publicKey);
    const role = params.role.trim();
    if (!deviceId || !publicKey || !role) {
      return { ok: false, reason: "bootstrap_token_invalid" };
    }
    const allowedProfile = resolvePersistedBootstrapProfile(record);
    // 在绑定到具体设备身份之前，对在已签发 role/scope 允许列表之外兑换 token 的任何尝试失败关闭
    if (
      allowedProfile.roles.length === 0 ||
      !bootstrapProfileAllowsRequest({
        allowedProfile,
        requestedRole: role,
        requestedScopes: params.scopes,
      })
    ) {
      return { ok: false, reason: "bootstrap_token_invalid" };
    }
    const requestedProfile = resolveRequestedBootstrapProfile({
      role,
      scopes: params.scopes,
    });

    const boundDeviceId = record.deviceId?.trim();
    const boundPublicKey =
      typeof record.publicKey === "string"
        ? normalizeBootstrapPublicKey(record.publicKey)
        : undefined;
    if (boundDeviceId || boundPublicKey) {
      if (boundDeviceId !== deviceId || boundPublicKey !== publicKey) {
        return { ok: false, reason: "bootstrap_token_invalid" };
      }
      const pendingProfile = resolvePersistedPendingProfile(record);
      if (pendingProfile && !sameBootstrapProfile(pendingProfile, requestedProfile)) {
        return { ok: false, reason: "bootstrap_token_invalid" };
      }
      state[tokenKey] = {
        ...record,
        profile: allowedProfile,
        pendingProfile: pendingProfile ?? requestedProfile,
        deviceId,
        publicKey,
        lastUsedAtMs: Date.now(),
      };
      await persistState(state, params.baseDir);
      return { ok: true };
    }

    state[tokenKey] = {
      ...record,
      profile: allowedProfile,
      pendingProfile: requestedProfile,
      deviceId,
      publicKey,
      lastUsedAtMs: Date.now(),
    };
    await persistState(state, params.baseDir);
    return { ok: true };
  });
}

/**
 * 读取已验证设备身份的已绑定 bootstrap profile。
 *
 * 仅在当前握手中 `verifyDeviceBootstrapToken()` 对相同 `token` / `deviceId` / `publicKey`
 * 元组返回 `{ ok: true }` 后调用此函数。
 */
export async function getBoundDeviceBootstrapProfile(params: {
  token: string;
  deviceId: string;
  publicKey: string;
  baseDir?: string;
}): Promise<DeviceBootstrapProfile | null> {
  return await withLock.run(async () => {
    const state = await loadState(params.baseDir);
    const providedToken = params.token.trim();
    if (!providedToken) {
      return null;
    }
    const found = Object.entries(state).find(([, candidate]) =>
      verifyPairingToken(providedToken, candidate.token),
    );
    if (!found) {
      return null;
    }
    const [, record] = found;
    const deviceId = params.deviceId.trim();
    const publicKey = normalizeBootstrapPublicKey(params.publicKey);
    if (!deviceId || !publicKey) {
      return null;
    }
    const recordPublicKey =
      typeof record.publicKey === "string"
        ? normalizeBootstrapPublicKey(record.publicKey)
        : undefined;
    if (record.deviceId?.trim() !== deviceId || recordPublicKey !== publicKey) {
      return null;
    }
    return resolvePersistedBootstrapProfile(record);
  });
}
