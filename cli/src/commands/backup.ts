/**
 * 数据备份/恢复 CLI。
 *
 * 参考 openclaw/src/commands/backup.ts 的命令形态，
 * 在 cross-wms CLI 中提供配置、状态、会话、ACP 代理等本地数据的备份与恢复。
 * 备份输出为 tar.gz 格式（使用 tar 命令，无原生依赖）。
 */
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型 =====================

export interface BackupOptions {
  /** 备份输出目录 */
  outputDir?: string;
  /** 备份名称（不含扩展名） */
  name?: string;
  /** 是否包含会话历史 */
  includeHistory?: boolean;
  /** 是否包含 ACP 日志 */
  includeAcpLogs?: boolean;
  /** 备份完成后进行完整性验证 */
  verify?: boolean;
  /** 仅生成元数据，不执行实际打包 */
  dryRun?: boolean;
  /** 额外要纳入备份的目录（绝对路径列表） */
  extraPaths?: string[];
}

export interface BackupResult {
  archivePath: string;
  size: number;
  createdAt: number;
  files: number;
  verified: boolean;
  manifest: BackupManifest;
  dryRun: boolean;
}

export interface BackupManifest {
  version: string;
  createdAt: number;
  host: string;
  cwd: string;
  files: string[];
  includes: {
    config: boolean;
    history: boolean;
    acpLogs: boolean;
    extras: string[];
  };
}

export interface RestoreOptions {
  /** 备份文件路径 */
  archive: string;
  /** 恢复目标根目录（默认 ~/.crosswms） */
  targetDir?: string;
  /** 仅显示备份内容，不执行恢复 */
  dryRun?: boolean;
  /** 遇到冲突时强制覆盖 */
  force?: boolean;
}

export interface RestoreResult {
  archive: string;
  target: string;
  extractedFiles: string[];
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
}

// ===================== 工具函数 =====================

function resolveStateDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 获取要备份的默认目录列表 */
function resolveDefaultIncludes(options: BackupOptions): {
  config: string;
  history?: string;
  acpLogs?: string;
  extras: string[];
} {
  const stateDir = resolveStateDir();
  return {
    config: stateDir,
    history: options.includeHistory === false ? undefined : path.join(stateDir, 'clawbot-history.json'),
    acpLogs: options.includeAcpLogs === false ? undefined : path.join(stateDir, 'acp-logs'),
    extras: options.extraPaths ?? [],
  };
}

/** 收集所有要打包的文件（递归） */
async function collectFiles(roots: Array<{ root: string; base: string }>): Promise<string[]> {
  const out: string[] = [];
  for (const { root, base } of roots) {
    if (!(await pathExists(root))) continue;
    const stat = await fs.stat(root);
    if (stat.isFile()) {
      out.push(root);
      continue;
    }
    // 递归遍历
    const stack: string[] = [root];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: import('fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          // 仅记录相对于 base 的相对路径
          const rel = path.relative(base, full);
          if (!rel.startsWith('..')) {
            out.push(full);
          }
        }
      }
    }
  }
  return Array.from(new Set(out));
}

/** 生成备份文件名 */
function generateBackupName(customName?: string): string {
  if (customName) return customName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `crosswms-backup-${ts}`;
}

// ===================== 核心操作 =====================

/**
 * 创建备份。
 * 实际打包逻辑使用系统 tar 命令；不存在则降级为 zip 风格清单写入。
 */
export async function createBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const outputDir = options.outputDir ?? path.join(resolveStateDir(), 'backups');
  await fs.mkdir(outputDir, { recursive: true });

  const includes = resolveDefaultIncludes(options);
  const stateDir = resolveStateDir();
  const roots: Array<{ root: string; base: string }> = [
    { root: includes.config, base: stateDir },
  ];
  if (includes.history) roots.push({ root: includes.history, base: stateDir });
  if (includes.acpLogs) roots.push({ root: includes.acpLogs, base: stateDir });
  for (const extra of includes.extras) {
    roots.push({ root: extra, base: path.dirname(extra) });
  }

  const files = await collectFiles(roots);
  const archiveName = generateBackupName(options.name);
  const archivePath = path.join(outputDir, `${archiveName}.tar.gz`);
  const manifest: BackupManifest = {
    version: '1.0.0',
    createdAt: Date.now(),
    host: os.hostname(),
    cwd: process.cwd(),
    files,
    includes: {
      config: true,
      history: Boolean(includes.history),
      acpLogs: Boolean(includes.acpLogs),
      extras: includes.extras,
    },
  };

  if (options.dryRun) {
    return {
      archivePath,
      size: 0,
      createdAt: manifest.createdAt,
      files: files.length,
      verified: false,
      manifest,
      dryRun: true,
    };
  }

  // 写入 manifest 临时文件
  const manifestPath = path.join(outputDir, `${archiveName}.manifest.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  let size = 0;
  let verified = false;
  if (files.length > 0) {
    try {
      // 使用 tar 打包为 .tar.gz；包含 manifest 与所有文件
      const allPaths = [manifestPath, ...files];
      const cmd = `tar -czf "${archivePath}" ${allPaths.map((p) => `"${p}"`).join(' ')}`;
      execSync(cmd, { stdio: 'ignore' });
      const stat = await fs.stat(archivePath);
      size = stat.size;
    } catch (err) {
      throw new Error(`打包失败: ${(err as Error).message}`);
    }
  } else {
    // 无文件可打包：写入空归档
    await fs.writeFile(archivePath, '# empty backup (no files matched)\n', 'utf-8');
    const stat = await fs.stat(archivePath);
    size = stat.size;
  }

  if (options.verify) {
    verified = await verifyBackup(archivePath);
  }

  return {
    archivePath,
    size,
    createdAt: manifest.createdAt,
    files: files.length,
    verified,
    manifest,
    dryRun: false,
  };
}

/** 验证备份文件完整性 */
export async function verifyBackup(archivePath: string): Promise<boolean> {
  if (!(await pathExists(archivePath))) return false;
  try {
    // 列出归档内容以验证可读
    execSync(`tar -tzf "${archivePath}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 列出备份内容（不解压） */
export async function listBackup(archivePath: string): Promise<string[]> {
  if (!(await pathExists(archivePath))) {
    throw new Error(`备份文件不存在: ${archivePath}`);
  }
  try {
    const stdout = execSync(`tar -tzf "${archivePath}"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** 从备份恢复 */
export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  if (!options.archive) {
    throw new Error('archive 不能为空');
  }
  if (!(await pathExists(options.archive))) {
    throw new Error(`备份文件不存在: ${options.archive}`);
  }
  const startedAt = Date.now();
  const target = options.targetDir ?? resolveStateDir();
  await fs.mkdir(target, { recursive: true });

  // 列出归档
  const entries = await listBackup(options.archive);

  if (options.dryRun) {
    return {
      archive: options.archive,
      target,
      extractedFiles: entries,
      dryRun: true,
      startedAt,
      finishedAt: Date.now(),
    };
  }

  try {
    execSync(`tar -xzf "${options.archive}" -C "${target}"`, { stdio: 'ignore' });
  } catch (err) {
    throw new Error(`解压失败: ${(err as Error).message}`);
  }

  return {
    archive: options.archive,
    target,
    extractedFiles: entries,
    dryRun: false,
    startedAt,
    finishedAt: Date.now(),
  };
}

// ===================== Commander 子命令 =====================

export const backupCommand = new Command('backup')
  .description('数据备份/恢复（create / list / restore / verify）')
  .version('1.0.0');

// create 子命令
backupCommand
  .command('create')
  .description('创建一份本地数据备份')
  .option('-o, --output <dir>', '备份输出目录')
  .option('-n, --name <name>', '备份名称（不含扩展名）')
  .option('--no-history', '不包含 clawbot 会话历史')
  .option('--no-acp-logs', '不包含 ACP 子代理日志')
  .option('--extra <path>', '额外要备份的目录（可多次传入）', (value: string, prev: string[] = []) => [...prev, value], [] as string[])
  .option('--verify', '备份完成后验证完整性', false)
  .option('--dry-run', '仅显示将要备份的内容，不写入', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (opts: {
      output?: string;
      name?: string;
      history: boolean;
      acpLogs: boolean;
      extra: string[];
      verify: boolean;
      dryRun: boolean;
      json: boolean;
    }) => {
      const result = await createBackup({
        ...(opts.output ? { outputDir: opts.output } : {}),
        ...(opts.name ? { name: opts.name } : {}),
        includeHistory: opts.history,
        includeAcpLogs: opts.acpLogs,
        extraPaths: opts.extra,
        verify: opts.verify,
        dryRun: opts.dryRun,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.dryRun) {
        console.log(`[dry-run] 即将备份 ${result.files} 个文件`);
        console.log(`  目标: ${result.archivePath}`);
        return;
      }
      console.log(`备份已创建:`);
      console.log(`  路径: ${result.archivePath}`);
      console.log(`  大小: ${result.size} 字节`);
      console.log(`  文件数: ${result.files}`);
      console.log(`  验证: ${result.verified ? '✓' : '✗'}`);
    },
  );

// list 子命令（列出某备份文件的内容）
backupCommand
  .command('list <archive>')
  .description('列出备份归档中的内容')
  .option('--limit <n>', '最多显示行数', '100')
  .action(async (archive: string, opts: { limit: string }) => {
    const entries = await listBackup(archive);
    const limit = Number.parseInt(opts.limit, 10) || 100;
    console.log(`备份 ${archive} 包含 ${entries.length} 个条目:`);
    console.log('');
    for (const entry of entries.slice(0, limit)) {
      console.log(`  ${entry}`);
    }
    if (entries.length > limit) {
      console.log(`  ... 还有 ${entries.length - limit} 个条目未显示`);
    }
  });

// verify 子命令
backupCommand
  .command('verify <archive>')
  .description('验证备份文件完整性')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (archive: string, opts: { json: boolean }) => {
    const ok = await verifyBackup(archive);
    if (opts.json) {
      console.log(JSON.stringify({ archive, valid: ok }, null, 2));
      return;
    }
    if (ok) {
      console.log(`✓ 备份 ${archive} 完整可读`);
    } else {
      console.log(`✗ 备份 ${archive} 校验失败或不可读`);
      process.exitCode = 1;
    }
  });

// restore 子命令
backupCommand
  .command('restore <archive>')
  .description('从备份恢复数据')
  .option('-t, --target <dir>', '恢复目标根目录（默认 ~/.crosswms）')
  .option('--dry-run', '仅显示归档内容，不实际解压', false)
  .option('--force', '强制覆盖目标（当前实现默认即覆盖）', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      archive: string,
      opts: { target?: string; dryRun: boolean; force: boolean; json: boolean },
    ) => {
      const result = await restoreBackup({
        archive,
        ...(opts.target ? { targetDir: opts.target } : {}),
        dryRun: opts.dryRun,
        force: opts.force,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.dryRun) {
        console.log(`[dry-run] 即将从 ${result.archive} 恢复 ${result.extractedFiles.length} 个文件到 ${result.target}`);
        return;
      }
      console.log(`恢复完成:`);
      console.log(`  源: ${result.archive}`);
      console.log(`  目标: ${result.target}`);
      console.log(`  文件数: ${result.extractedFiles.length}`);
      console.log(`  耗时: ${result.finishedAt - result.startedAt} ms`);
    },
  );
