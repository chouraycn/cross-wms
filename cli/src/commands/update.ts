/**
 * CLI 自更新命令。
 *
 * 参考 openclaw/src/cli/update-cli.ts 的命令形态（check / download / install / status），
 * 在 cross-wms CLI 中提供本地版本检查、下载、安装的占位实现。
 * 实际更新流程应通过 npm 全局包或 git pull 完成。
 */
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型与常量 =====================

/** 当前 CLI 版本（与 cli/package.json 保持一致） */
export const CURRENT_VERSION = '1.0.0';

/** 包名 */
export const PACKAGE_NAME = '@cdf-know/cli';

/** 远程 registry URL（用于 check） */
export const REGISTRY_URL = 'https://registry.npmjs.org';

interface UpdateCache {
  lastCheckedAt: number;
  lastKnownVersion: string;
  lastKnownTag: string;
}

// ===================== 持久化 =====================

function resolveStateDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

function resolveUpdateCachePath(): string {
  return path.join(resolveStateDir(), 'update-cache.json');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readUpdateCache(): Promise<UpdateCache | undefined> {
  const filePath = resolveUpdateCachePath();
  if (!(await pathExists(filePath))) return undefined;
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as UpdateCache;
  } catch {
    return undefined;
  }
}

async function writeUpdateCache(cache: UpdateCache): Promise<void> {
  const filePath = resolveUpdateCachePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

// ===================== 核心操作函数 =====================

/**
 * 比较两个 semver 字符串。
 * 返回 -1 / 0 / 1。
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/**
 * 检查更新（尝试调用 npm view 获取最新版本；网络不可用时回退到 mock）。
 */
export async function checkForUpdate(options: {
  offline?: boolean;
  registry?: string;
} = {}): Promise<{
  current: string;
  latest: string;
  hasUpdate: boolean;
  registry: string;
  source: 'network' | 'cache' | 'mock';
  checkedAt: number;
}> {
  const checkedAt = Date.now();
  const registry = options.registry ?? REGISTRY_URL;
  let latest = '';
  let source: 'network' | 'cache' | 'mock' = 'mock';

  if (!options.offline) {
    try {
      // 使用 npm view 查询（超时 8 秒）
      const stdout = execSync(`npm view ${PACKAGE_NAME} version --registry ${registry}`, {
        encoding: 'utf-8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      latest = stdout.trim();
      source = 'network';
    } catch {
      // 网络不可用，尝试使用缓存
      const cache = await readUpdateCache();
      if (cache?.lastKnownVersion) {
        latest = cache.lastKnownVersion;
        source = 'cache';
      } else {
        latest = CURRENT_VERSION;
        source = 'mock';
      }
    }
  } else {
    const cache = await readUpdateCache();
    latest = cache?.lastKnownVersion ?? CURRENT_VERSION;
    source = cache?.lastKnownVersion ? 'cache' : 'mock';
  }

  await writeUpdateCache({
    lastCheckedAt: checkedAt,
    lastKnownVersion: latest,
    lastKnownTag: 'latest',
  });

  return {
    current: CURRENT_VERSION,
    latest,
    hasUpdate: compareSemver(latest, CURRENT_VERSION) > 0,
    registry,
    source,
    checkedAt,
  };
}

/**
 * 下载新版本（模拟实现：写入下载标记到缓存目录）。
 */
export async function downloadUpdate(
  targetVersion: string,
  options: { dest?: string } = {},
): Promise<{ target: string; artifact: string; bytes: number }> {
  if (!targetVersion) {
    throw new Error('目标版本不能为空');
  }
  const dest = options.dest ?? path.join(resolveStateDir(), 'downloads');
  await fs.mkdir(dest, { recursive: true });
  const artifact = path.join(dest, `${PACKAGE_NAME.replace(/[^a-z0-9-]/gi, '_')}-${targetVersion}.tgz`);
  // 模拟写入字节
  const bytes = 1024 * 256; // 256KB 模拟
  await fs.writeFile(artifact, `# simulated artifact for ${PACKAGE_NAME}@${targetVersion} (${bytes} bytes)\n`, 'utf-8');
  return { target: targetVersion, artifact, bytes };
}

/**
 * 安装新版本（实际为占位：调用 npm 全局安装）。
 */
export async function installUpdate(
  targetVersion: string,
  options: { registry?: string; global?: boolean; dryRun?: boolean } = {},
): Promise<{ target: string; dryRun: boolean; global: boolean; command: string }> {
  if (!targetVersion) {
    throw new Error('目标版本不能为空');
  }
  const registry = options.registry ?? REGISTRY_URL;
  const isGlobal = options.global ?? true;
  const cmd = isGlobal
    ? `npm install -g ${PACKAGE_NAME}@${targetVersion} --registry ${registry}`
    : `npm install ${PACKAGE_NAME}@${targetVersion} --registry ${registry}`;

  if (options.dryRun) {
    return { target: targetVersion, dryRun: true, global: isGlobal, command: cmd };
  }

  try {
    execSync(cmd, { encoding: 'utf-8', timeout: 60_000, stdio: 'inherit' });
  } catch (err) {
    throw new Error(`安装失败: ${(err as Error).message}`);
  }
  return { target: targetVersion, dryRun: false, global: isGlobal, command: cmd };
}

// ===================== Commander 子命令 =====================

export const updateCommand = new Command('update')
  .description('CLI 自更新（check / download / install）')
  .version(CURRENT_VERSION);

// check 子命令
updateCommand
  .command('check')
  .description('检查是否有新版本可用')
  .option('--offline', '仅使用本地缓存（不访问网络）', false)
  .option('--registry <url>', '指定 npm registry URL')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { offline: boolean; registry?: string; json: boolean }) => {
    const result = await checkForUpdate({
      offline: opts.offline,
      ...(opts.registry ? { registry: opts.registry } : {}),
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`当前版本: ${result.current}`);
    console.log(`最新版本: ${result.latest}`);
    console.log(`Registry: ${result.registry}`);
    console.log(`数据来源: ${result.source}`);
    console.log(`检查时间: ${new Date(result.checkedAt).toLocaleString()}`);
    if (result.hasUpdate) {
      console.log('');
      console.log(`✓ 有新版本可用: ${result.current} → ${result.latest}`);
      console.log(`运行 \`${PACKAGE_NAME} update install --version ${result.latest}\` 进行更新`);
    } else {
      console.log('');
      console.log('✓ 当前已是最新版本');
    }
  });

// download 子命令
updateCommand
  .command('download [version]')
  .description('下载指定版本（默认 latest）')
  .option('--dest <dir>', '下载目录')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (version: string | undefined, opts: { dest?: string; json: boolean }) => {
    const target = version ?? 'latest';
    let resolved = target;
    if (target === 'latest') {
      const check = await checkForUpdate();
      resolved = check.latest;
    }
    const result = await downloadUpdate(resolved, {
      ...(opts.dest ? { dest: opts.dest } : {}),
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`已下载 ${PACKAGE_NAME}@${result.target}`);
    console.log(`  文件: ${result.artifact}`);
    console.log(`  大小: ${result.bytes} 字节`);
  });

// install 子命令
updateCommand
  .command('install [version]')
  .description('安装指定版本（默认 latest）')
  .option('--registry <url>', '指定 npm registry URL')
  .option('--no-global', '不全局安装')
  .option('--dry-run', '仅打印将要执行的命令', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      version: string | undefined,
      opts: { registry?: string; global: boolean; dryRun: boolean; json: boolean },
    ) => {
      const target = version ?? 'latest';
      let resolved = target;
      if (target === 'latest') {
        const check = await checkForUpdate();
        resolved = check.latest;
      }
      const result = await installUpdate(resolved, {
        ...(opts.registry ? { registry: opts.registry } : {}),
        global: opts.global,
        dryRun: opts.dryRun,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`目标版本: ${result.target}`);
      console.log(`全局安装: ${result.global ? '是' : '否'}`);
      console.log(`预览模式: ${result.dryRun ? '是' : '否'}`);
      console.log(`命令: ${result.command}`);
      if (!result.dryRun) {
        console.log('安装完成');
      }
    },
  );

// status 子命令
updateCommand
  .command('status')
  .description('显示当前版本与最近一次检查的缓存')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { json: boolean }) => {
    const cache = await readUpdateCache();
    const data = {
      package: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION,
      cache: cache ?? null,
    };
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    console.log(`包名: ${data.package}`);
    console.log(`当前版本: ${data.currentVersion}`);
    if (cache) {
      console.log(`上次检查: ${new Date(cache.lastCheckedAt).toLocaleString()}`);
      console.log(`上次已知版本: ${cache.lastKnownVersion}`);
      console.log(`上次 tag: ${cache.lastKnownTag}`);
    } else {
      console.log('尚未执行 check；运行 `update check` 获取最新信息');
    }
  });
