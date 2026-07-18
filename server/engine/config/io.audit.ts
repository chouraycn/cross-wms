// 移植自 openclaw/src/config/io.audit.ts
// 审计配置路径与值，用于诊断与安全检查。
//
// 降级说明：
// 1. 源文件依赖 ../logging/redact.js 的 redactSecrets 与 redactToolPayloadText。
//    cross-wms 缺少对应实现，此处内联等价的简化脱敏。
// 2. 源文件依赖 ./paths.js 的 resolveStateDir。cross-wms 的 paths.ts 未导出该函数，
//    此处内联一个等价本地实现。
import path from 'node:path';

/** 内联降级实现：解析 OpenClaw 状态目录。 */
function resolveStateDir(env: NodeJS.ProcessEnv, homedir: () => string): string {
  const envDir = env.OPENCLAW_STATE_DIR;
  if (envDir) {
    return path.resolve(envDir);
  }
  const envHome = env.OPENCLAW_HOME || env.HOME || env.USERPROFILE;
  if (envHome) {
    return path.join(envHome, '.openclaw');
  }
  return path.join(homedir(), '.openclaw');
}

/** 内联降级实现：对工具负载文本进行基础脱敏。 */
function redactToolPayloadText(value: string): string {
  // 简化版：仅匹配常见的 token 形态。
  return value
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, '***')
    .replace(/ghp_[A-Za-z0-9]{10,}/g, '***')
    .replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, '***')
    .replace(/gsk_[A-Za-z0-9]{10,}/g, '***')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, '***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

/** 内联降级实现：对记录中的字符串值递归脱敏。 */
function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') {
    return redactToolPayloadText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      next[key] = redactSecrets(child);
    }
    return next as unknown as T;
  }
  return value;
}

const CONFIG_AUDIT_ARGV_CAP = 8;

// 保守的凭据型 flag 列表。下方的后缀启发式分类器可以覆盖长尾
// （--custom-api-key、--alibaba-model-studio-api-key、插件定义的 cliFlag 等），
// 不需要在此逐一列举。
const SECRET_FLAG_NAMES = new Set([
  '--token',
  '--api-key',
  '--apikey',
  '--secret',
  '--password',
  '--passwd',
  '--auth-token',
  '--access-token',
  '--refresh-token',
  '--client-secret',
  '--hook-token',
  '--gateway-token',
  '--bot-token',
  '--app-token',
  '--remote-token',
  '--push-token',
  '--webhook-secret',
  '--webhook-token',
  '--service-account-token',
  '--op-service-account-token',
  '--bearer',
  '--bearer-token',
  '--pat',
  '--personal-access-token',
  '--oauth-token',
  '--id-token',
  '--identity-token',
  '--session-token',
  '--service-token',
  '--private-key',
  '--recovery-key',
  '--gateway-key',
  '--session-key',
  '--active-key',
]);

// 后缀启发式。任何 --…-(token|secret|password|passwd|api-key|
// apikey|api-secret|webhook|credential|bearer|pat|private-key|recovery-key|
// signing-key|encryption-key|master-key|session-key|gateway-key|service-key|
// hook-key) 在显式列表之外也被视为 secret flag。
// 要求以 -- 开头，避免误匹配任意位置参数。
const SECRET_FLAG_SUFFIX_PATTERN =
  /^--(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?(?:token|secret|password|passwd|api[-_]?key|api[-_]?secret|webhook|credential|bearer|pat|private[-_]?key|recovery[-_]?key|signing[-_]?key|encryption[-_]?key|master[-_]?key|session[-_]?key|gateway[-_]?key|service[-_]?key|hook[-_]?key)$/;

function isSecretFlagName(flagName: string): boolean {
  if (SECRET_FLAG_NAMES.has(flagName)) {
    return true;
  }
  return SECRET_FLAG_SUFFIX_PATTERN.test(flagName);
}

function parseFlagName(arg: string): string | null {
  if (!arg.startsWith('--')) {
    return null;
  }
  const eq = arg.indexOf('=');
  return (eq === -1 ? arg : arg.slice(0, eq)).toLowerCase();
}

// 在 CLI argv 进入持久化 config-audit 日志之前脱敏。
// 每个元素依次应用以下层级：
//  1. 名字匹配显式列表或后缀启发式的 --flag=value 形式 —— 掩码 value 半边。
//  2. 跟在裸 --flag 之后的 value —— 输出 *** 代替下一个 arg，
//     即使以 - 开头。命令解析器对必填项接受以短横线开头的值，
//     此持久化审计日志应失败关闭。
//  3. 其他全部回退到 redactToolPayloadText，捕获 KEY=VALUE 形式、
//     原始 token 形态（sk-、ghp_、xox*、gsk_、AIza*、npm_、Telegram bot token、
//     PEM 块、Bearer header、URL query secret）使用共享的脱敏模式。
export function redactConfigAuditArgv(argv: readonly string[]): string[] {
  const result: string[] = [];
  let redactNext = false;
  for (const current of argv) {
    if (redactNext) {
      redactNext = false;
      result.push('***');
      continue;
    }
    const currentFlag = parseFlagName(current);
    if (currentFlag !== null && isSecretFlagName(currentFlag)) {
      if (current.includes('=')) {
        const eq = current.indexOf('=');
        result.push(`${current.slice(0, eq + 1)}***`);
        continue;
      }
      result.push(current);
      redactNext = true;
      continue;
    }
    result.push(redactToolPayloadText(current));
  }
  return result;
}

function capArgv(argv: readonly string[] | undefined): string[] {
  if (!Array.isArray(argv)) {
    return [];
  }
  return argv.slice(0, CONFIG_AUDIT_ARGV_CAP);
}

export function snapshotConfigAuditProcessInfo(): ConfigAuditProcessInfo {
  return {
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    argv: redactConfigAuditArgv(capArgv(process.argv)),
    execArgv: redactConfigAuditArgv(capArgv(process.execArgv)),
  };
}

const CONFIG_AUDIT_LOG_FILENAME = 'config-audit.jsonl';

export type ConfigWriteAuditResult = 'rename' | 'copy-fallback' | 'failed' | 'rejected';

type ConfigWriteAuditRecord = {
  ts: string;
  source: 'config-io';
  event: 'config.write';
  result: ConfigWriteAuditResult;
  configPath: string;
  pid: number;
  ppid: number;
  cwd: string;
  argv: string[];
  execArgv: string[];
  watchMode: boolean;
  watchSession: string | null;
  watchCommand: string | null;
  existsBefore: boolean;
  previousHash: string | null;
  nextHash: string | null;
  previousBytes: number | null;
  nextBytes: number | null;
  previousDev: string | null;
  nextDev: string | null;
  previousIno: string | null;
  nextIno: string | null;
  previousMode: number | null;
  nextMode: number | null;
  previousNlink: number | null;
  nextNlink: number | null;
  previousUid: number | null;
  nextUid: number | null;
  previousGid: number | null;
  nextGid: number | null;
  changedPathCount: number | null;
  hasMetaBefore: boolean;
  hasMetaAfter: boolean;
  gatewayModeBefore: string | null;
  gatewayModeAfter: string | null;
  suspicious: string[];
  errorCode?: string;
  errorMessage?: string;
};

export type ConfigObserveAuditRecord = {
  ts: string;
  source: 'config-io';
  event: 'config.observe';
  phase: 'read';
  configPath: string;
  pid: number;
  ppid: number;
  cwd: string;
  argv: string[];
  execArgv: string[];
  exists: boolean;
  valid: boolean;
  hash: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  ctimeMs: number | null;
  dev: string | null;
  ino: string | null;
  mode: number | null;
  nlink: number | null;
  uid: number | null;
  gid: number | null;
  hasMeta: boolean;
  gatewayMode: string | null;
  suspicious: string[];
  lastKnownGoodHash: string | null;
  lastKnownGoodBytes: number | null;
  lastKnownGoodMtimeMs: number | null;
  lastKnownGoodCtimeMs: number | null;
  lastKnownGoodDev: string | null;
  lastKnownGoodIno: string | null;
  lastKnownGoodMode: number | null;
  lastKnownGoodNlink: number | null;
  lastKnownGoodUid: number | null;
  lastKnownGoodGid: number | null;
  lastKnownGoodGatewayMode: string | null;
  backupHash: string | null;
  backupBytes: number | null;
  backupMtimeMs: number | null;
  backupCtimeMs: number | null;
  backupDev: string | null;
  backupIno: string | null;
  backupMode: number | null;
  backupNlink: number | null;
  backupUid: number | null;
  backupGid: number | null;
  backupGatewayMode: string | null;
  clobberedPath: string | null;
  restoredFromBackup: boolean;
  restoredBackupPath: string | null;
  restoreErrorCode: string | null;
  restoreErrorMessage: string | null;
};

type ConfigAuditRecord = ConfigWriteAuditRecord | ConfigObserveAuditRecord;

type ConfigAuditStatMetadata = {
  dev: string | null;
  ino: string | null;
  mode: number | null;
  nlink: number | null;
  uid: number | null;
  gid: number | null;
};

type ConfigAuditProcessInfo = {
  pid: number;
  ppid: number;
  cwd: string;
  argv: string[];
  execArgv: string[];
};

type ConfigWriteAuditRecordBase = Omit<
  ConfigWriteAuditRecord,
  | 'result'
  | 'nextDev'
  | 'nextIno'
  | 'nextMode'
  | 'nextNlink'
  | 'nextUid'
  | 'nextGid'
  | 'errorCode'
  | 'errorMessage'
> & {
  nextHash: string;
  nextBytes: number;
};

type ConfigAuditFs = {
  promises: {
    mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<unknown>;
    appendFile(
      path: string,
      data: string,
      options?: { encoding?: BufferEncoding; mode?: number },
    ): Promise<unknown>;
  };
  mkdirSync(path: string, options?: { recursive?: boolean; mode?: number }): unknown;
  appendFileSync(
    path: string,
    data: string,
    options?: { encoding?: BufferEncoding; mode?: number },
  ): unknown;
};

function normalizeAuditLabel(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveConfigAuditProcessInfo(
  processInfo?: ConfigAuditProcessInfo,
): ConfigAuditProcessInfo {
  if (processInfo) {
    return {
      ...processInfo,
      argv: redactConfigAuditArgv(capArgv(processInfo.argv)),
      execArgv: redactConfigAuditArgv(capArgv(processInfo.execArgv)),
    };
  }
  return snapshotConfigAuditProcessInfo();
}

export function resolveConfigAuditLogPath(env: NodeJS.ProcessEnv, homedir: () => string): string {
  return path.join(resolveStateDir(env, homedir), 'logs', CONFIG_AUDIT_LOG_FILENAME);
}

export function formatConfigOverwriteLogMessage(params: {
  configPath: string;
  previousHash: string | null;
  nextHash: string;
  changedPathCount?: number;
}): string {
  const changeSummary =
    typeof params.changedPathCount === 'number' ? `, changedPaths=${params.changedPathCount}` : '';
  return `Config overwrite: ${params.configPath} (sha256 ${params.previousHash ?? 'unknown'} -> ${params.nextHash}, backup=${params.configPath}.bak${changeSummary})`;
}

export function createConfigWriteAuditRecordBase(params: {
  configPath: string;
  env: NodeJS.ProcessEnv;
  existsBefore: boolean;
  previousHash: string | null;
  nextHash: string;
  previousBytes: number | null;
  nextBytes: number;
  previousMetadata: ConfigAuditStatMetadata;
  changedPathCount: number | null | undefined;
  hasMetaBefore: boolean;
  hasMetaAfter: boolean;
  gatewayModeBefore: string | null;
  gatewayModeAfter: string | null;
  suspicious: string[];
  now?: string;
  processInfo?: ConfigAuditProcessInfo;
}): ConfigWriteAuditRecordBase {
  const processSnapshot = resolveConfigAuditProcessInfo(params.processInfo);
  return {
    ts: params.now ?? new Date().toISOString(),
    source: 'config-io',
    event: 'config.write',
    configPath: params.configPath,
    pid: processSnapshot.pid,
    ppid: processSnapshot.ppid,
    cwd: processSnapshot.cwd,
    argv: processSnapshot.argv,
    execArgv: processSnapshot.execArgv,
    watchMode: params.env.OPENCLAW_WATCH_MODE === '1',
    watchSession: normalizeAuditLabel(params.env.OPENCLAW_WATCH_SESSION),
    watchCommand: normalizeAuditLabel(params.env.OPENCLAW_WATCH_COMMAND),
    existsBefore: params.existsBefore,
    previousHash: params.previousHash,
    nextHash: params.nextHash,
    previousBytes: params.previousBytes,
    nextBytes: params.nextBytes,
    previousDev: params.previousMetadata.dev,
    previousIno: params.previousMetadata.ino,
    previousMode: params.previousMetadata.mode,
    previousNlink: params.previousMetadata.nlink,
    previousUid: params.previousMetadata.uid,
    previousGid: params.previousMetadata.gid,
    changedPathCount: typeof params.changedPathCount === 'number' ? params.changedPathCount : null,
    hasMetaBefore: params.hasMetaBefore,
    hasMetaAfter: params.hasMetaAfter,
    gatewayModeBefore: params.gatewayModeBefore,
    gatewayModeAfter: params.gatewayModeAfter,
    suspicious: params.suspicious,
  };
}

export function finalizeConfigWriteAuditRecord(params: {
  base: ConfigWriteAuditRecordBase;
  result: ConfigWriteAuditResult;
  nextMetadata?: ConfigAuditStatMetadata | null;
  err?: unknown;
}): ConfigWriteAuditRecord {
  const errorCode =
    params.err &&
    typeof params.err === 'object' &&
    'code' in params.err &&
    typeof params.err.code === 'string'
      ? params.err.code
      : undefined;
  const errorMessage =
    params.err &&
    typeof params.err === 'object' &&
    'message' in params.err &&
    typeof params.err.message === 'string'
      ? params.err.message
      : undefined;
  const nextMetadata = params.nextMetadata ?? {
    dev: null,
    ino: null,
    mode: null,
    nlink: null,
    uid: null,
    gid: null,
  };
  const success = params.result !== 'failed' && params.result !== 'rejected';
  return {
    ...params.base,
    result: params.result,
    nextHash: success ? params.base.nextHash : null,
    nextBytes: success ? params.base.nextBytes : null,
    nextDev: success ? nextMetadata.dev : null,
    nextIno: success ? nextMetadata.ino : null,
    nextMode: success ? nextMetadata.mode : null,
    nextNlink: success ? nextMetadata.nlink : null,
    nextUid: success ? nextMetadata.uid : null,
    nextGid: success ? nextMetadata.gid : null,
    errorCode,
    errorMessage,
  };
}

type ConfigAuditAppendContext = {
  fs: ConfigAuditFs;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
};

type ConfigAuditAppendParams = ConfigAuditAppendContext &
  (
    | {
        record: ConfigAuditRecord;
      }
    | ConfigAuditRecord
  );

function resolveConfigAuditAppendRecord(params: ConfigAuditAppendParams): ConfigAuditRecord {
  if ('record' in params) {
    return redactSecrets(params.record);
  }
  const { fs: _fs, env: _env, homedir: _homedir, ...record } = params;
  return redactSecrets(record as ConfigAuditRecord);
}

type ConfigAuditScrubResult = {
  scanned: number;
  rewritten: number;
  skipped: number;
  // 当 scrub 检测到并发追加并拒绝替换文件时为 true。
  // 调用方应在 gateway 空闲时重跑 openclaw doctor --fix。
  // 中止时不修改磁盘内容。
  aborted: boolean;
};

type ConfigAuditScrubFs = {
  promises: {
    readFile(path: string, encoding: 'utf-8'): Promise<string>;
    stat(path: string): Promise<{ size: number }>;
    writeFile(
      path: string,
      data: string,
      options?: { encoding?: BufferEncoding; mode?: number },
    ): Promise<unknown>;
    rename(oldPath: string, newPath: string): Promise<unknown>;
    unlink(path: string): Promise<unknown>;
  };
};

// 通过 redactConfigAuditArgv 重写 config-audit.jsonl 中的每条记录，
// 使在向前 redactor 发布之前写入的历史 argv/execArgv 值与新条目以相同方式掩码。
// 幂等 —— 对已掩码条目重新应用 redactor 是无操作，因为 redactor 将 ***
// 与 --flag=*** 原样传递，因此后续 doctor 扫描不会重写文件，
// 除非仍存在真正未脱敏的条目。
// 畸形行（解析失败、非对象负载）原样保留并计入 skipped，
// 此函数从不销毁无法理解的取证内容。
// 原子写入：以 0o600 模式生成兄弟 *.scrub.tmp 文件，然后重命名覆盖审计日志。
// 任何错误路径都删除临时文件，确保部分 scrub 不留下明文。
export async function scrubConfigAuditLog(params: {
  fs: ConfigAuditScrubFs;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
  dryRun?: boolean;
}): Promise<ConfigAuditScrubResult> {
  const auditPath = resolveConfigAuditLogPath(params.env, params.homedir);
  let raw: string;
  try {
    raw = await params.fs.promises.readFile(auditPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { scanned: 0, rewritten: 0, skipped: 0, aborted: false };
    }
    throw err;
  }
  const originalByteLength = Buffer.byteLength(raw, 'utf-8');

  let scanned = 0;
  let rewritten = 0;
  let skipped = 0;
  let changed = false;
  const outLines: string[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    if (line.length === 0) {
      outLines.push(line);
      continue;
    }
    scanned += 1;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      outLines.push(line);
      skipped += 1;
      continue;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      outLines.push(line);
      skipped += 1;
      continue;
    }
    const obj = record as Record<string, unknown>;
    let mutated = false;
    for (const key of ['argv', 'execArgv'] as const) {
      const value = obj[key];
      if (!Array.isArray(value)) {
        continue;
      }
      if (!value.every((entry): entry is string => typeof entry === 'string')) {
        continue;
      }
      const redacted = redactConfigAuditArgv(value);
      let differs = false;
      for (let i = 0; i < redacted.length; i++) {
        if (redacted[i] !== value[i]) {
          differs = true;
          break;
        }
      }
      if (differs) {
        obj[key] = redacted;
        mutated = true;
      }
    }
    if (mutated) {
      rewritten += 1;
      changed = true;
      outLines.push(JSON.stringify(obj));
    } else {
      outLines.push(line);
    }
  }

  if (!changed || params.dryRun) {
    return { scanned, rewritten, skipped, aborted: false };
  }

  // 并发追加守卫：重命名前重新 stat。若 scrub 在内存中变换记录期间文件增长，
  // 表示某 appendConfigAuditRecord 调用方写入了新条目，重命名会覆盖它。
  // 中止而非静默丢弃新记录。调用方（doctor --fix）向操作员给出重试提示。
  let preRenameSize: number;
  try {
    preRenameSize = (await params.fs.promises.stat(auditPath)).size;
  } catch {
    return { scanned, rewritten, skipped, aborted: true };
  }
  if (preRenameSize !== originalByteLength) {
    return { scanned, rewritten, skipped, aborted: true };
  }

  const tmpPath = `${auditPath}.scrub.tmp`;
  try {
    await params.fs.promises.writeFile(tmpPath, outLines.join('\n'), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    let finalPreRenameSize: number;
    try {
      finalPreRenameSize = (await params.fs.promises.stat(auditPath)).size;
    } catch {
      try {
        await params.fs.promises.unlink(tmpPath);
      } catch {
        // best-effort cleanup; stat 失败已作为安全中止处理
      }
      return { scanned, rewritten, skipped, aborted: true };
    }
    if (finalPreRenameSize !== originalByteLength) {
      try {
        await params.fs.promises.unlink(tmpPath);
      } catch {
        // best-effort cleanup; 追加检测是可操作状态
      }
      return { scanned, rewritten, skipped, aborted: true };
    }
    await params.fs.promises.rename(tmpPath, auditPath);
  } catch (err) {
    try {
      await params.fs.promises.unlink(tmpPath);
    } catch {
      // best-effort cleanup; 重命名失败是可操作错误
    }
    throw err;
  }

  return { scanned, rewritten, skipped, aborted: false };
}

export async function appendConfigAuditRecord(params: ConfigAuditAppendParams): Promise<void> {
  try {
    const auditPath = resolveConfigAuditLogPath(params.env, params.homedir);
    const record = resolveConfigAuditAppendRecord(params);
    await params.fs.promises.mkdir(path.dirname(auditPath), { recursive: true, mode: 0o700 });
    await params.fs.promises.appendFile(auditPath, `${JSON.stringify(record)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // best-effort
  }
}

export function appendConfigAuditRecordSync(params: ConfigAuditAppendParams): void {
  try {
    const auditPath = resolveConfigAuditLogPath(params.env, params.homedir);
    const record = resolveConfigAuditAppendRecord(params);
    params.fs.mkdirSync(path.dirname(auditPath), { recursive: true, mode: 0o700 });
    params.fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // best-effort
  }
}
