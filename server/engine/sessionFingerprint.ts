/**
 * Session Fingerprint
 * 会话指纹 - 用于会话复用决策的指纹计算与验证
 *
 * 基于 openclaw 的 cli-session 实现，提供：
 * 1. 会话绑定类型定义
 * 2. 指纹哈希计算
 * 3. 会话复用决策
 * 4. 会话目录管理
 */
import crypto from 'crypto';
import fsSync, { type Dirent } from 'fs';
import fs from 'fs/promises';
import path from 'path';

// ===================== 类型定义 =====================

export interface CliSessionBinding {
  sessionId: string;
  forceReuse?: boolean;
  authProfileId?: string;
  authEpoch?: string;
  authEpochVersion?: number;
  extraSystemPromptHash?: string;
  messageToolPolicyHash?: string;
  promptToolNamesHash?: string;
  cwdHash?: string;
  mcpConfigHash?: string;
  mcpResumeHash?: string;
}

export interface SessionFingerprintConfig {
  authProfileId?: string;
  authEpoch?: string;
  authEpochVersion?: number;
  extraSystemPrompt?: string;
  messageToolPolicy?: string;
  promptToolNames?: string;
  cwd?: string;
  mcpConfig?: Record<string, unknown>;
  mcpResume?: Record<string, unknown>;
}

export type SessionInvalidationReason =
  | 'auth-profile'
  | 'auth-epoch'
  | 'system-prompt'
  | 'tool-policy'
  | 'cwd'
  | 'mcp';

export interface SessionReuseResult {
  sessionId?: string;
  invalidatedReason?: SessionInvalidationReason;
}

// ===================== 哈希辅助函数 =====================

/**
 * 对字符串进行 SHA-256 哈希
 * 空字符串或 undefined 返回 undefined
 */
export function hashString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

/**
 * 对对象进行稳定哈希（先 JSON.stringify 再哈希）
 * 空对象或 undefined 返回 undefined
 */
export function hashObject(value: Record<string, unknown> | undefined): string | undefined {
  if (!value || Object.keys(value).length === 0) {
    return undefined;
  }
  try {
    const normalized = JSON.stringify(value, Object.keys(value).sort());
    return hashString(normalized);
  } catch {
    return undefined;
  }
}

// ===================== 指纹计算函数 =====================

/**
 * 根据配置计算会话指纹
 * 返回包含各字段哈希的 CliSessionBinding（不含 sessionId）
 */
export function computeSessionFingerprint(
  config: SessionFingerprintConfig,
): Omit<CliSessionBinding, 'sessionId' | 'forceReuse'> {
  return {
    authProfileId: config.authProfileId,
    authEpoch: config.authEpoch,
    authEpochVersion: config.authEpochVersion,
    extraSystemPromptHash: hashString(config.extraSystemPrompt),
    messageToolPolicyHash: hashString(config.messageToolPolicy),
    promptToolNamesHash: hashString(config.promptToolNames),
    cwdHash: hashString(config.cwd),
    mcpConfigHash: hashObject(config.mcpConfig),
    mcpResumeHash: hashObject(config.mcpResume),
  };
}

// ===================== 会话复用决策 =====================

/**
 * 判断存储的会话是否可以复用
 *
 * 按以下优先级顺序校验，任一不匹配则会话失效：
 * 1. 认证配置变更 - authProfileId / authEpoch 变化
 * 2. 系统提示变更 - extraSystemPromptHash 变化
 * 3. 工具策略变更 - messageToolPolicyHash / promptToolNamesHash 变化
 * 4. 工作目录变更 - cwdHash 变化
 * 5. MCP 配置变更 - mcpConfigHash / mcpResumeHash 变化
 */
export function resolveSessionReuse(params: {
  binding?: CliSessionBinding;
  authProfileId?: string;
  authEpoch?: string;
  authEpochVersion: number;
  extraSystemPromptHash?: string;
  messageToolPolicyHash?: string;
  promptToolNamesHash?: string;
  cwdHash?: string;
  mcpConfigHash?: string;
  mcpResumeHash?: string;
}): SessionReuseResult {
  const { binding } = params;
  const sessionId = binding?.sessionId?.trim();
  if (!sessionId || !binding) {
    return {};
  }

  if (binding.forceReuse === true) {
    return { sessionId };
  }

  const currentAuthProfileId = normalizeOptionalString(params.authProfileId);
  const currentAuthEpoch = normalizeOptionalString(params.authEpoch);
  const currentExtraSystemPromptHash = normalizeOptionalString(params.extraSystemPromptHash);
  const currentMessageToolPolicyHash = normalizeOptionalString(params.messageToolPolicyHash);
  const currentPromptToolNamesHash = normalizeOptionalString(params.promptToolNamesHash);
  const currentCwdHash = normalizeOptionalString(params.cwdHash);
  const currentMcpConfigHash = normalizeOptionalString(params.mcpConfigHash);
  const currentMcpResumeHash = normalizeOptionalString(params.mcpResumeHash);

  const storedAuthProfileId = normalizeOptionalString(binding.authProfileId);
  const storedAuthEpoch = normalizeOptionalString(binding.authEpoch);

  const hasMatchingVersionedAuthEpoch =
    binding.authEpochVersion === params.authEpochVersion &&
    storedAuthEpoch !== undefined &&
    currentAuthEpoch !== undefined &&
    storedAuthEpoch === currentAuthEpoch;

  // 1. 认证配置变更
  if (storedAuthProfileId !== currentAuthProfileId) {
    if (!hasMatchingVersionedAuthEpoch) {
      return { invalidatedReason: 'auth-profile' };
    }
  }

  if (
    binding.authEpochVersion === params.authEpochVersion &&
    storedAuthEpoch !== currentAuthEpoch
  ) {
    return { invalidatedReason: 'auth-epoch' };
  }

  // 2. 系统提示变更
  const storedExtraSystemPromptHash = normalizeOptionalString(binding.extraSystemPromptHash);
  if (storedExtraSystemPromptHash !== currentExtraSystemPromptHash) {
    return { invalidatedReason: 'system-prompt' };
  }

  // 3. 工具策略变更
  const storedMessageToolPolicyHash = normalizeOptionalString(binding.messageToolPolicyHash);
  if (storedMessageToolPolicyHash !== currentMessageToolPolicyHash) {
    return { invalidatedReason: 'tool-policy' };
  }

  const storedPromptToolNamesHash = normalizeOptionalString(binding.promptToolNamesHash);
  if (storedPromptToolNamesHash !== currentPromptToolNamesHash) {
    return { invalidatedReason: 'tool-policy' };
  }

  // 4. 工作目录变更
  const storedCwdHash = normalizeOptionalString(binding.cwdHash);
  if (storedCwdHash !== undefined && storedCwdHash !== currentCwdHash) {
    return { invalidatedReason: 'cwd' };
  }

  // 5. MCP 配置变更
  const storedMcpResumeHash = normalizeOptionalString(binding.mcpResumeHash);
  if (storedMcpResumeHash && currentMcpResumeHash) {
    if (storedMcpResumeHash !== currentMcpResumeHash) {
      return { invalidatedReason: 'mcp' };
    }
    return { sessionId };
  }

  const storedMcpConfigHash = normalizeOptionalString(binding.mcpConfigHash);
  if (storedMcpConfigHash !== currentMcpConfigHash) {
    return { invalidatedReason: 'mcp' };
  }

  return { sessionId };
}

// ===================== 会话目录管理 =====================

export interface SessionDirEntry {
  sessionId: string;
  dirPath: string;
  mtime: number;
}

function mapSessionDirs(baseDir: string, entries: Dirent[]): SessionDirEntry[] {
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dirPath = path.join(baseDir, entry.name);
      let mtime = 0;
      try {
        const stat = fsSync.statSync(dirPath);
        mtime = stat.mtimeMs;
      } catch {
        // 忽略无法读取的目录
      }
      return {
        sessionId: entry.name,
        dirPath,
        mtime,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * 同步扫描会话目录，返回会话列表（按修改时间倒序）
 */
export function scanSessionDirsSync(sessionsDir: string): SessionDirEntry[] {
  let entries: Dirent[];
  try {
    entries = fsSync.readdirSync(sessionsDir, { withFileTypes: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  return mapSessionDirs(sessionsDir, entries);
}

/**
 * 异步扫描会话目录，返回会话列表（按修改时间倒序）
 */
export async function scanSessionDirs(sessionsDir: string): Promise<SessionDirEntry[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const result: SessionDirEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(sessionsDir, entry.name);
    let mtime = 0;
    try {
      const stat = await fs.stat(dirPath);
      mtime = stat.mtimeMs;
    } catch {
      // 忽略无法读取的目录
    }
    result.push({
      sessionId: entry.name,
      dirPath,
      mtime,
    });
  }

  return result.sort((a, b) => b.mtime - a.mtime);
}

/**
 * 从会话目录中读取会话绑定信息
 * 绑定信息存储在会话目录下的 fingerprint.json 文件中
 */
export function readSessionBindingSync(sessionDir: string): CliSessionBinding | undefined {
  const fingerprintPath = path.join(sessionDir, 'fingerprint.json');
  try {
    const content = fsSync.readFileSync(fingerprintPath, 'utf-8');
    const data = JSON.parse(content) as CliSessionBinding;
    if (data?.sessionId) {
      return data;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 异步读取会话绑定信息
 */
export async function readSessionBinding(sessionDir: string): Promise<CliSessionBinding | undefined> {
  const fingerprintPath = path.join(sessionDir, 'fingerprint.json');
  try {
    const content = await fs.readFile(fingerprintPath, 'utf-8');
    const data = JSON.parse(content) as CliSessionBinding;
    if (data?.sessionId) {
      return data;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 同步写入会话绑定信息
 */
export function writeSessionBindingSync(sessionDir: string, binding: CliSessionBinding): void {
  const fingerprintPath = path.join(sessionDir, 'fingerprint.json');
  fsSync.mkdirSync(sessionDir, { recursive: true });
  fsSync.writeFileSync(fingerprintPath, JSON.stringify(binding, null, 2), 'utf-8');
}

/**
 * 异步写入会话绑定信息
 */
export async function writeSessionBinding(sessionDir: string, binding: CliSessionBinding): Promise<void> {
  const fingerprintPath = path.join(sessionDir, 'fingerprint.json');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(fingerprintPath, JSON.stringify(binding, null, 2), 'utf-8');
}

/**
 * 在会话目录中查找匹配指纹的会话
 * 返回第一个匹配的会话，按修改时间倒序查找
 */
export function findMatchingSessionSync(
  sessionsDir: string,
  currentFingerprint: Omit<CliSessionBinding, 'sessionId' | 'forceReuse'> & { authEpochVersion: number },
): SessionReuseResult {
  const sessions = scanSessionDirsSync(sessionsDir);

  for (const session of sessions) {
    const binding = readSessionBindingSync(session.dirPath);
    if (!binding) continue;

    const result = resolveSessionReuse({
      binding,
      authProfileId: currentFingerprint.authProfileId,
      authEpoch: currentFingerprint.authEpoch,
      authEpochVersion: currentFingerprint.authEpochVersion,
      extraSystemPromptHash: currentFingerprint.extraSystemPromptHash,
      messageToolPolicyHash: currentFingerprint.messageToolPolicyHash,
      promptToolNamesHash: currentFingerprint.promptToolNamesHash,
      cwdHash: currentFingerprint.cwdHash,
      mcpConfigHash: currentFingerprint.mcpConfigHash,
      mcpResumeHash: currentFingerprint.mcpResumeHash,
    });

    if (result.sessionId) {
      return result;
    }
  }

  return {};
}

/**
 * 异步查找匹配指纹的会话
 */
export async function findMatchingSession(
  sessionsDir: string,
  currentFingerprint: Omit<CliSessionBinding, 'sessionId' | 'forceReuse'> & { authEpochVersion: number },
): Promise<SessionReuseResult> {
  const sessions = await scanSessionDirs(sessionsDir);

  for (const session of sessions) {
    const binding = await readSessionBinding(session.dirPath);
    if (!binding) continue;

    const result = resolveSessionReuse({
      binding,
      authProfileId: currentFingerprint.authProfileId,
      authEpoch: currentFingerprint.authEpoch,
      authEpochVersion: currentFingerprint.authEpochVersion,
      extraSystemPromptHash: currentFingerprint.extraSystemPromptHash,
      messageToolPolicyHash: currentFingerprint.messageToolPolicyHash,
      promptToolNamesHash: currentFingerprint.promptToolNamesHash,
      cwdHash: currentFingerprint.cwdHash,
      mcpConfigHash: currentFingerprint.mcpConfigHash,
      mcpResumeHash: currentFingerprint.mcpResumeHash,
    });

    if (result.sessionId) {
      return result;
    }
  }

  return {};
}

// ===================== 工具函数 =====================

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}
