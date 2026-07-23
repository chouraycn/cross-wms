/**
 * 执行审批核心逻辑 — 参考 OpenClaw infra/exec-approvals.ts
 *
 * 管理命令执行的审批流程，支持自动允许、需要审批、拒绝等决策。
 * 集成白名单、安全策略和持久化审批记录。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../../logger.js';
import type {
  ExecHost,
  ExecTarget,
  ExecSecurity,
  ExecAsk,
  ExecMode,
  ExecApprovalDecision,
  ExecApprovalUnavailableDecision,
  ExecAllowlistEntry,
  ExecApprovalRequest,
  ExecApprovalResolved,
  ExecApprovalsDefaults,
  ExecApprovalsAgent,
  ExecApprovalsFile,
  ExecApprovalsSnapshot,
  ExecApprovalsResolved,
  ExecApprovalsDefaultOverrides,
} from './types.js';

export * from './types.js';

export const EXEC_TARGET_VALUES: readonly ExecTarget[] = ['auto', 'sandbox', 'gateway', 'node'];

export function normalizeExecHost(value?: string | null): ExecHost | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === 'sandbox' || normalized === 'gateway' || normalized === 'node') {
    return normalized;
  }
  return null;
}

export function normalizeExecTarget(value?: string | null): ExecTarget | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === 'auto') {
    return normalized;
  }
  return normalizeExecHost(normalized);
}

export function requireValidExecTarget(value?: unknown): ExecTarget | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(
      `Invalid exec host value type ${typeof value}. Allowed values: ${EXEC_TARGET_VALUES.join(
        ', ',
      )}.`,
    );
  }
  const normalized = normalizeOptionalLowercaseString(value);
  if (!normalized) {
    return null;
  }
  const target = normalizeExecTarget(normalized);
  if (target) {
    return target;
  }
  throw new Error(
    `Invalid exec host "${value}". Allowed values: ${EXEC_TARGET_VALUES.join(', ')}.`,
  );
}

export function normalizeExecSecurity(value?: string | null): ExecSecurity | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === 'deny' || normalized === 'allowlist' || normalized === 'full') {
    return normalized;
  }
  return null;
}

export function normalizeExecAsk(value?: string | null): ExecAsk | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === 'off' || normalized === 'on-miss' || normalized === 'always') {
    return normalized;
  }
  return null;
}

export function normalizeExecMode(value?: string | null): ExecMode | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (
    normalized === 'deny' ||
    normalized === 'allowlist' ||
    normalized === 'ask' ||
    normalized === 'auto' ||
    normalized === 'full'
  ) {
    return normalized;
  }
  return null;
}

export function resolveExecModeFromPolicy(params: {
  security: ExecSecurity;
  ask: ExecAsk;
}): ExecMode {
  if (params.security === 'deny') {
    return 'deny';
  }
  if (params.security === 'allowlist' && params.ask === 'off') {
    return 'allowlist';
  }
  if (params.security === 'full' && params.ask !== 'always') {
    return 'full';
  }
  return 'ask';
}

export function resolveExecPolicyForMode(mode: ExecMode): {
  security: ExecSecurity;
  ask: ExecAsk;
  autoReview: boolean;
} {
  switch (mode) {
    case 'deny':
      return { security: 'deny', ask: 'off', autoReview: false };
    case 'allowlist':
      return { security: 'allowlist', ask: 'off', autoReview: false };
    case 'ask':
      return { security: 'allowlist', ask: 'on-miss', autoReview: false };
    case 'auto':
      return { security: 'allowlist', ask: 'on-miss', autoReview: true };
    case 'full':
      return { security: 'full', ask: 'off', autoReview: false };
  }
  const exhaustiveMode: never = mode;
  throw new Error(`Unsupported exec mode: ${String(exhaustiveMode)}`);
}

export function resolveExecModePolicy(params: {
  mode?: ExecMode | null;
  security: ExecSecurity;
  ask: ExecAsk;
}): {
  mode: ExecMode;
  security: ExecSecurity;
  ask: ExecAsk;
  autoReview: boolean;
} {
  if (!params.mode) {
    return {
      mode: resolveExecModeFromPolicy({ security: params.security, ask: params.ask }),
      security: params.security,
      ask: params.ask,
      autoReview: false,
    };
  }
  return {
    mode: params.mode,
    ...resolveExecPolicyForMode(params.mode),
  };
}

export const DEFAULT_EXEC_APPROVAL_TIMEOUT_MS = 1_800_000;

const DEFAULT_SECURITY: ExecSecurity = 'full';
const DEFAULT_ASK: ExecAsk = 'off';
export const DEFAULT_EXEC_APPROVAL_ASK_FALLBACK: ExecSecurity = 'deny';
const DEFAULT_AUTO_ALLOW_SKILLS = false;
const DEFAULT_EXEC_APPROVALS_STATE_DIR = '~/.cdf-know-clow';
const EXEC_APPROVALS_FILE = 'exec-approvals.json';
const EXEC_APPROVALS_SOCKET = 'exec-approvals.sock';
const DEFAULT_AGENT_ID = 'main';

function normalizeOptionalLowercaseString(value?: string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value).trim().toLowerCase();
}

function normalizeOptionalString(value?: string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLowercaseStringOrEmpty(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

function hashExecApprovalsRaw(raw: string | null): string {
  return crypto
    .createHash('sha256')
    .update(raw ?? '')
    .digest('hex');
}

function resolveExecApprovalsStateDir(env: NodeJS.ProcessEnv = process.env): {
  path: string;
  displayPath: string;
} {
  const override = env.CDF_STATE_DIR?.trim();
  if (override) {
    const resolved = override.startsWith('~')
      ? path.join(os.homedir(), override.slice(1))
      : override;
    return {
      path: resolved,
      displayPath: resolved,
    };
  }
  const resolved = DEFAULT_EXEC_APPROVALS_STATE_DIR.startsWith('~')
    ? path.join(os.homedir(), DEFAULT_EXEC_APPROVALS_STATE_DIR.slice(1))
    : DEFAULT_EXEC_APPROVALS_STATE_DIR;
  return {
    path: resolved,
    displayPath: DEFAULT_EXEC_APPROVALS_STATE_DIR,
  };
}

export function resolveExecApprovalsPath(): string {
  return path.join(resolveExecApprovalsStateDir().path, EXEC_APPROVALS_FILE);
}

export function resolveExecApprovalsSocketPath(): string {
  return path.join(resolveExecApprovalsStateDir().path, EXEC_APPROVALS_SOCKET);
}

export function resolveExecApprovalsDisplayPath(): string {
  const stateDir = resolveExecApprovalsStateDir().displayPath;
  return stateDir === DEFAULT_EXEC_APPROVALS_STATE_DIR
    ? `${stateDir}/${EXEC_APPROVALS_FILE}`
    : path.join(stateDir, EXEC_APPROVALS_FILE);
}

export function resolveExecApprovalsTranscriptPath(): string {
  return process.env.CDF_STATE_DIR?.trim()
    ? `$CDF_STATE_DIR/${EXEC_APPROVALS_FILE}`
    : `${DEFAULT_EXEC_APPROVALS_STATE_DIR}/${EXEC_APPROVALS_FILE}`;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const dirStat = fs.lstatSync(dir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error(`拒绝使用不安全的 exec approvals 目录: ${dir}`);
  }
  try {
    fs.chmodSync(dir, 0o700);
  } catch (err) {
    if (process.platform !== 'win32') {
      throw err;
    }
  }
  return dir;
}

function assertSafeExecApprovalsDestination(filePath: string): void {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`拒绝通过符号链接写入 exec approvals: ${filePath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

function writeExecApprovalsRaw(filePath: string, raw: string) {
  const dir = ensureDir(filePath);
  assertSafeExecApprovalsDestination(filePath);
  const tempPath = path.join(dir, `.exec-approvals.${process.pid}.${crypto.randomUUID()}.tmp`);
  let tempWritten = false;
  try {
    fs.writeFileSync(tempPath, raw, { mode: 0o600, flag: 'wx' });
    try {
      fs.chmodSync(tempPath, 0o600);
    } catch (_chmodErr) {
    }
    tempWritten = true;
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EEXIST') {
      const contents = fs.readFileSync(tempPath);
      fs.writeFileSync(filePath, contents);
      fs.rmSync(tempPath, { force: true });
    } else {
      throw err;
    }
  } finally {
    if (tempWritten && fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (_chmodErr) {
  }
}

function coerceAllowlistEntries(allowlist: unknown): ExecAllowlistEntry[] | undefined {
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return Array.isArray(allowlist) ? (allowlist as ExecAllowlistEntry[]) : undefined;
  }
  let changed = false;
  const result: ExecAllowlistEntry[] = [];
  for (const item of allowlist) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) {
        result.push({ pattern: trimmed });
        changed = true;
      } else {
        changed = true;
      }
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const pattern = (item as { pattern?: unknown }).pattern;
      if (typeof pattern === 'string' && pattern.trim().length > 0) {
        result.push(item as ExecAllowlistEntry);
      } else {
        changed = true;
      }
    } else {
      changed = true;
    }
  }
  return changed ? (result.length > 0 ? result : undefined) : (allowlist as ExecAllowlistEntry[]);
}

function ensureAllowlistIds(
  allowlist: ExecAllowlistEntry[] | undefined,
): ExecAllowlistEntry[] | undefined {
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return allowlist;
  }
  let changed = false;
  const next = allowlist.map((entry) => {
    if (entry.id) {
      return entry;
    }
    changed = true;
    return { ...entry, id: crypto.randomUUID() };
  });
  return changed ? next : allowlist;
}

function stripAllowlistCommandText(
  allowlist: ExecAllowlistEntry[] | undefined,
): ExecAllowlistEntry[] | undefined {
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return allowlist;
  }
  let changed = false;
  const next = allowlist.map((entry) => {
    if (typeof entry.commandText !== 'string') {
      return entry;
    }
    changed = true;
    const { commandText: _commandText, ...rest } = entry;
    return rest;
  });
  return changed ? next : allowlist;
}

function sanitizeExecApprovalPolicy(
  policy: ExecApprovalsDefaults | ExecApprovalsAgent | undefined,
): ExecApprovalsDefaults {
  const security = normalizeOptionalString(policy?.security);
  const ask = normalizeOptionalString(policy?.ask);
  const askFallback = normalizeOptionalString(policy?.askFallback);
  return {
    security:
      security === 'deny' || security === 'allowlist' || security === 'full' ? security : undefined,
    ask: ask === 'off' || ask === 'on-miss' || ask === 'always' ? ask : undefined,
    askFallback:
      askFallback === 'deny' || askFallback === 'allowlist' || askFallback === 'full'
        ? askFallback
        : undefined,
    autoAllowSkills: policy?.autoAllowSkills,
  };
}

export function normalizeExecApprovals(file: ExecApprovalsFile): ExecApprovalsFile {
  const socketPath = file.socket?.path?.trim();
  const token = file.socket?.token?.trim();
  const agents = { ...file.agents };
  const legacyDefault = agents.default;
  if (legacyDefault) {
    const main = agents[DEFAULT_AGENT_ID];
    agents[DEFAULT_AGENT_ID] = main ? mergeLegacyAgent(main, legacyDefault) : legacyDefault;
    delete agents.default;
  }
  for (const [key, agent] of Object.entries(agents)) {
    const coerced = coerceAllowlistEntries(agent.allowlist);
    const withIds = ensureAllowlistIds(coerced);
    const allowlist = stripAllowlistCommandText(withIds);
    const sanitizedPolicy = sanitizeExecApprovalPolicy(agent);
    const agentChanged =
      allowlist !== agent.allowlist ||
      sanitizedPolicy.security !== agent.security ||
      sanitizedPolicy.ask !== agent.ask ||
      sanitizedPolicy.askFallback !== agent.askFallback;
    if (agentChanged) {
      agents[key] = {
        ...agent,
        allowlist,
        security: sanitizedPolicy.security,
        ask: sanitizedPolicy.ask,
        askFallback: sanitizedPolicy.askFallback,
      };
    }
  }
  const sanitizedDefaults = sanitizeExecApprovalPolicy(file.defaults);
  const normalized: ExecApprovalsFile = {
    version: 1,
    socket: {
      path: socketPath && socketPath.length > 0 ? socketPath : undefined,
      token: token && token.length > 0 ? token : undefined,
    },
    defaults: {
      ...sanitizedDefaults,
    },
    agents,
  };
  return normalized;
}

function mergeLegacyAgent(
  current: ExecApprovalsAgent,
  legacy: ExecApprovalsAgent,
): ExecApprovalsAgent {
  const allowlist: ExecAllowlistEntry[] = [];
  const seen = new Set<string>();
  const pushEntry = (entry: ExecAllowlistEntry) => {
    const patternKey = normalizeAllowlistPattern(entry.pattern);
    if (!patternKey) {
      return;
    }
    const key = `${patternKey}\x00${entry.argPattern?.trim() ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    allowlist.push(entry);
  };
  for (const entry of current.allowlist ?? []) {
    pushEntry(entry);
  }
  for (const entry of legacy.allowlist ?? []) {
    pushEntry(entry);
  }

  return {
    security: current.security ?? legacy.security,
    ask: current.ask ?? legacy.ask,
    askFallback: current.askFallback ?? legacy.askFallback,
    autoAllowSkills: current.autoAllowSkills ?? legacy.autoAllowSkills,
    allowlist: allowlist.length > 0 ? allowlist : undefined,
  };
}

function normalizeAllowlistPattern(value: string | undefined): string | null {
  const trimmed = normalizeOptionalString(value) ?? '';
  return trimmed ? normalizeLowercaseStringOrEmpty(trimmed) : null;
}

export function readExecApprovalsSnapshot(): ExecApprovalsSnapshot {
  const filePath = resolveExecApprovalsPath();
  if (!fs.existsSync(filePath)) {
    const file = normalizeExecApprovals({ version: 1, agents: {} });
    return {
      path: filePath,
      exists: false,
      raw: null,
      file,
      hash: hashExecApprovalsRaw(null),
    };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed: ExecApprovalsFile | null;
  try {
    parsed = JSON.parse(raw) as ExecApprovalsFile;
  } catch (_parseErr) {
    parsed = null;
  }
  const file =
    parsed?.version === 1
      ? normalizeExecApprovals(parsed)
      : normalizeExecApprovals({ version: 1, agents: {} });
  return {
    path: filePath,
    exists: true,
    raw,
    file,
    hash: hashExecApprovalsRaw(raw),
  };
}