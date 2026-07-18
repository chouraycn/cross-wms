import { Command } from 'commander';
import { promises as fs, statfs as statfsCb } from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';
import path from 'path';
import { UnifiedPluginRegistry } from '@cdf-know/plugin-sdk';

// fs.promises.statfs 在 @types/node 20 中缺少 promise 重载，回退到 promisify
const statfs = promisify(statfsCb);

/**
 * Doctor 命令：执行一系列健康检查并输出报告。
 *
 * 特性：
 *  - 集成 server/engine/crestodian 探针（如可安全导入）
 *  - 支持 ANSI 颜色输出、--json、--verbose
 *  - 包含磁盘空间、node_modules、.env、TypeScript 编译等轻量级检查
 *  - 输出总耗时统计
 */

// ANSI 转义码（轻量级颜色，避免引入额外依赖）
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/** 是否启用颜色（--no-color 或 NO_COLOR 环境变量时关闭） */
const useColor = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY);
})();

/** 包装文本，添加 ANSI 颜色（无 TTY 时自动降级） */
function colorize(text: string, color: keyof typeof ANSI): string {
  if (!useColor) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

/** 检查项结果 */
interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  detail?: string;
  durationMs?: number;
}

/** Crestodian 探针结果（仅类型参考，不直接依赖） */
interface CrestodianLikeResult {
  name: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  message: string;
  durationMs: number;
}

/** Crestodian 集成（动态导入，安全降级） */
interface CrestodianIntegration {
  available: boolean;
  reason?: string;
  runProbes?: (probes: unknown[]) => Promise<CrestodianLikeResult[]>;
  getDefaultProbes?: () => unknown[];
}

/**
 * 动态加载 Crestodian 模块；如不可用则降级。
 *
 * 使用动态 import 防止 TS 编译时静态解析失败；并使用相对路径加 .js 后缀，
 * 匹配 cli 的 NodeNext 模块解析规则。
 */
async function loadCrestodian(): Promise<CrestodianIntegration> {
  const candidates = [
    '../../../server/engine/crestodian/index.js',
    '../../server/engine/crestodian/index.js',
  ];
  for (const spec of candidates) {
    try {
      const mod: unknown = await import(spec);
      const m = mod as {
        runProbes?: CrestodianIntegration['runProbes'];
        getDefaultProbes?: CrestodianIntegration['getDefaultProbes'];
      };
      if (typeof m.runProbes === 'function' && typeof m.getDefaultProbes === 'function') {
        return { available: true, runProbes: m.runProbes, getDefaultProbes: m.getDefaultProbes };
      }
    } catch (err) {
      // 继续尝试下一个候选路径
      if (!candidates.length) {
        return { available: false, reason: (err as Error).message };
      }
    }
  }
  return { available: false, reason: 'Crestodian module not importable from CLI context' };
}

// ===== 检查项实现 =====

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = Number.parseInt(version.slice(1), 10);
  if (major >= 22) {
    return { name: 'Node.js version', status: 'ok', message: version };
  }
  if (major >= 20) {
    return {
      name: 'Node.js version',
      status: 'warning',
      message: version,
      detail: 'Recommended Node.js >= 22',
    };
  }
  return {
    name: 'Node.js version',
    status: 'error',
    message: version,
    detail: 'Requires Node.js >= 20',
  };
}

async function checkConfigFile(): Promise<CheckResult> {
  const configPath = path.join(process.cwd(), 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as unknown;
    return {
      name: 'Config file',
      status: 'ok',
      message: `Found at ${configPath}`,
      detail: `Keys: ${Object.keys(config as Record<string, unknown>).join(', ')}`,
    };
  } catch (error) {
    return {
      name: 'Config file',
      status: 'warning',
      message: 'Not found or invalid',
      detail: (error as Error).message,
    };
  }
}

function checkEnvironment(): CheckResult {
  const required = ['PORT', 'CROSS_WMS_MODELS_DEFAULT'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length === 0) {
    return { name: 'Environment', status: 'ok', message: 'Required variables present' };
  }
  return {
    name: 'Environment',
    status: 'warning',
    message: `Missing optional variables: ${missing.join(', ')}`,
  };
}

function checkPlugins(): CheckResult {
  try {
    const registry = UnifiedPluginRegistry.getInstance();
    const health = registry.getHealth();
    return {
      name: 'Plugins',
      status: 'ok',
      message: `${health.total} registered, ${health.activated} active`,
    };
  } catch (error) {
    return {
      name: 'Plugins',
      status: 'error',
      message: 'Failed to inspect plugins',
      detail: (error as Error).message,
    };
  }
}

async function checkExtensions(): Promise<CheckResult> {
  try {
    const extDir = path.join(process.cwd(), 'extensions');
    const entries = await fs.readdir(extDir, { withFileTypes: true });
    let discovered = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await fs.access(path.join(extDir, entry.name, 'extension.json'));
        discovered++;
      } catch {
        // skip directories without an extension manifest
      }
    }
    return {
      name: 'Extensions',
      status: 'ok',
      message: `${discovered} discovered`,
    };
  } catch (error) {
    return {
      name: 'Extensions',
      status: 'error',
      message: 'Failed to inspect extensions',
      detail: (error as Error).message,
    };
  }
}

function checkAgents(): CheckResult {
  try {
    return {
      name: 'Agents',
      status: 'ok',
      message: 'Agent core available',
      detail: '0 active runs tracked',
    };
  } catch (error) {
    return {
      name: 'Agents',
      status: 'error',
      message: 'Failed to inspect agents',
      detail: (error as Error).message,
    };
  }
}

async function checkLogDirectory(): Promise<CheckResult> {
  const logDir = path.join(process.cwd(), 'logs');
  try {
    await fs.mkdir(logDir, { recursive: true });
    const testFile = path.join(logDir, '.doctor-write-test');
    await fs.writeFile(testFile, '', 'utf-8');
    await fs.unlink(testFile);
    return { name: 'Log directory', status: 'ok', message: `Writable at ${logDir}` };
  } catch (error) {
    return {
      name: 'Log directory',
      status: 'error',
      message: `Not writable at ${logDir}`,
      detail: (error as Error).message,
    };
  }
}

/** 磁盘空间检查（使用 fs.statfs，Node 18.15+） */
async function checkDiskSpace(): Promise<CheckResult> {
  try {
    const target = process.cwd();
    const stats = await statfs(target);
    // bsize / blocks / bfree 在不同平台上是 number | bigint，做统一处理
    const bsize = Number(stats.bsize);
    const blocks = Number(stats.blocks);
    const bfree = Number(stats.bfree);
    if (!Number.isFinite(bsize) || !Number.isFinite(blocks) || !Number.isFinite(bfree)) {
      return {
        name: 'Disk space',
        status: 'warning',
        message: 'Unable to interpret statfs output',
      };
    }
    const totalBytes = bsize * blocks;
    const freeBytes = bsize * bfree;
    const usedRatio = totalBytes > 0 ? 1 - freeBytes / totalBytes : 0;
    const freeGB = (freeBytes / 1024 ** 3).toFixed(2);
    const totalGB = (totalBytes / 1024 ** 3).toFixed(2);
    if (usedRatio > 0.95) {
      return {
        name: 'Disk space',
        status: 'error',
        message: `Only ${freeGB}GB free of ${totalGB}GB`,
        detail: `Used ratio: ${(usedRatio * 100).toFixed(1)}%`,
      };
    }
    if (usedRatio > 0.85) {
      return {
        name: 'Disk space',
        status: 'warning',
        message: `${freeGB}GB free of ${totalGB}GB`,
        detail: `Used ratio: ${(usedRatio * 100).toFixed(1)}%`,
      };
    }
    return {
      name: 'Disk space',
      status: 'ok',
      message: `${freeGB}GB free of ${totalGB}GB`,
      detail: `Used ratio: ${(usedRatio * 100).toFixed(1)}%`,
    };
  } catch (error) {
    return {
      name: 'Disk space',
      status: 'warning',
      message: 'statfs unsupported on this platform',
      detail: (error as Error).message,
    };
  }
}

/** node_modules 完整性检查（关键依赖是否存在） */
async function checkNodeModules(): Promise<CheckResult> {
  const keyDeps = ['commander', '@cdf-know/plugin-sdk'];
  const missing: string[] = [];
  const found: string[] = [];
  for (const dep of keyDeps) {
    try {
      await fs.access(path.join(process.cwd(), 'node_modules', dep));
      found.push(dep);
    } catch {
      missing.push(dep);
    }
  }
  if (missing.length > 0) {
    return {
      name: 'node_modules',
      status: 'error',
      message: `Missing ${missing.length} critical dep(s)`,
      detail: `Missing: ${missing.join(', ')}`,
    };
  }
  return {
    name: 'node_modules',
    status: 'ok',
    message: `All ${found.length} critical deps present`,
    detail: `Verified: ${found.join(', ')}`,
  };
}

/** .env 配置文件检查 */
async function checkEnvFile(): Promise<CheckResult> {
  const envPath = path.join(process.cwd(), '.env');
  try {
    const stat = await fs.stat(envPath);
    return {
      name: '.env file',
      status: 'ok',
      message: `Present (${stat.size} bytes)`,
      detail: envPath,
    };
  } catch {
    return {
      name: '.env file',
      status: 'warning',
      message: 'Not found at workspace root',
      detail: `Expected at: ${envPath}`,
    };
  }
}

/** TypeScript 编译检查（执行 tsc --noEmit） */
async function checkTypeScript(): Promise<CheckResult> {
  const started = Date.now();
  // 测试环境 / 显式禁用时跳过，避免 npx 启动开销拖慢 CLI
  if (process.env.VITEST || process.env.CROSSWMS_DOCTOR_SKIP_TSC === '1') {
    return {
      name: 'TypeScript',
      status: 'ok',
      message: 'Skipped (test env or CROSSWMS_DOCTOR_SKIP_TSC=1)',
      detail: 'Set env to enable tsc --noEmit check',
      durationMs: Date.now() - started,
    };
  }
  // 优先查找 cli 目录的 tsconfig
  const tsconfigCandidates = [
    path.join(process.cwd(), 'cli', 'tsconfig.json'),
    path.join(process.cwd(), 'tsconfig.json'),
  ];
  let tsconfig: string | undefined;
  for (const candidate of tsconfigCandidates) {
    try {
      await fs.access(candidate);
      tsconfig = candidate;
      break;
    } catch {
      // try next
    }
  }
  if (!tsconfig) {
    return {
      name: 'TypeScript',
      status: 'warning',
      message: 'No tsconfig.json found',
      detail: 'Skipped tsc check',
    };
  }
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['--no-install', 'tsc', '--noEmit', '-p', tsconfig as string],
      { cwd: process.cwd(), timeout: 60_000 },
      (error, _stdout, stderr) => {
        const durationMs = Date.now() - started;
        if (error) {
          resolve({
            name: 'TypeScript',
            status: 'error',
            message: 'tsc --noEmit failed',
            detail: (stderr || error.message).split('\n').slice(0, 3).join(' | '),
            durationMs,
          });
          return;
        }
        resolve({
          name: 'TypeScript',
          status: 'ok',
          message: `Clean (${path.relative(process.cwd(), tsconfig as string)})`,
          durationMs,
        });
      }
    );
  });
}

/** Crestodian 探针检查（动态加载模块） */
async function checkCrestodian(integration: CrestodianIntegration): Promise<CheckResult> {
  const started = Date.now();
  if (!integration.available || !integration.runProbes || !integration.getDefaultProbes) {
    return {
      name: 'Crestodian',
      status: 'warning',
      message: 'Crestodian module not importable',
      detail: integration.reason ?? 'Falling back to local checks',
      durationMs: Date.now() - started,
    };
  }
  try {
    const probes = integration.getDefaultProbes();
    const results = await integration.runProbes(probes);
    const summary = results.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const critical = (summary.critical ?? 0) + (summary.unknown ?? 0);
    const degraded = summary.degraded ?? 0;
    let status: CheckResult['status'] = 'ok';
    if (critical > 0) status = 'error';
    else if (degraded > 0) status = 'warning';
    return {
      name: 'Crestodian',
      status,
      message: `Ran ${results.length} probe(s) [${results
        .map((r) => {
          if (r.status === 'healthy') return '[OK]';
          if (r.status === 'degraded') return '[WARN]';
          return '[FAIL]';
        })
        .join(' ')}]`,
      detail: results
        .map((r) => `${r.name}: ${r.status} (${r.message})`)
        .join('; '),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      name: 'Crestodian',
      status: 'error',
      message: 'Probe execution failed',
      detail: (error as Error).message,
      durationMs: Date.now() - started,
    };
  }
}

// ===== 输出渲染 =====

function statusTag(status: CheckResult['status']): string {
  if (status === 'ok') return colorize('[OK]', 'green');
  if (status === 'warning') return colorize('[WARN]', 'yellow');
  return colorize('[FAIL]', 'red');
}

function renderTable(results: CheckResult[], verbose: boolean): void {
  // 表头
  const nameWidth = Math.max(4, ...results.map((r) => r.name.length));
  const statusWidth = 6;
  const header = [
    'NAME'.padEnd(nameWidth),
    'STATUS'.padEnd(statusWidth),
    'MESSAGE',
  ].join('  ');
  console.log(colorize(header, 'bold'));
  console.log(colorize('-'.repeat(header.length), 'gray'));
  for (const r of results) {
    const line = [
      r.name.padEnd(nameWidth),
      statusTag(r.status).padEnd(statusWidth + (useColor ? 9 : 0)),
      r.message,
    ].join('  ');
    console.log(line);
    if (verbose) {
      if (r.detail) {
        console.log(colorize(`  └─ ${r.detail}`, 'gray'));
      }
      if (typeof r.durationMs === 'number') {
        console.log(colorize(`  └─ 耗时: ${r.durationMs}ms`, 'gray'));
      }
    } else if (r.status !== 'ok' && r.detail) {
      // 默认仅对非 OK 项展开 detail
      console.log(colorize(`  └─ ${r.detail}`, 'gray'));
    }
  }
}

function renderJson(report: DoctorReport): void {
  console.log(JSON.stringify(report, null, 2));
}

interface DoctorReport {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  summary: { total: number; ok: number; warnings: number; errors: number };
  checks: CheckResult[];
}

function buildReport(results: CheckResult[], startedAt: Date, endedAt: Date): DoctorReport {
  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    warnings: results.filter((r) => r.status === 'warning').length,
    errors: results.filter((r) => r.status === 'error').length,
  };
  return {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    summary,
    checks: results,
  };
}

function printBanner(startedAt: Date): void {
  const stamp = startedAt.toISOString();
  console.log(colorize('=== cdf-know Doctor ===', 'cyan') + colorize(` (${stamp})`, 'gray'));
  console.log('');
}

// ===== Commander 命令 =====

export const doctorCommand = new Command('doctor')
  .description('运行系统健康检查（Node 环境、配置、插件、扩展、磁盘、TypeScript 等）')
  .version('1.0.0')
  .option('--json', '以 JSON 格式输出报告而非表格', false)
  .option('--verbose', '显示每个检查的详细信息', false)
  .option('--no-color', '禁用 ANSI 颜色输出')
  .action(async (options: { json?: boolean; verbose?: boolean; color?: boolean }) => {
    const startedAt = new Date();
    const effectiveColor = options.color !== false && useColor;

    // 准备 Crestodian 集成（异步，不阻塞表格头打印）
    const integrationPromise = loadCrestodian();

    // 收集结果
    const results: CheckResult[] = [];
    const collect = async (item: CheckResult | Promise<CheckResult>) => {
      const r = await item;
      results.push(r);
      if (!options.json) {
        // 实时输出单行进度
        const line = `${statusTag(r.status).padEnd(useColor ? 15 : 6)}  ${r.name}: ${r.message}`;
        console.log(line);
      }
    };

    printBanner(startedAt);

    await collect(Promise.resolve(checkNodeVersion()));
    await collect(checkConfigFile());
    await collect(Promise.resolve(checkEnvironment()));
    await collect(Promise.resolve(checkPlugins()));
    await collect(checkExtensions());
    await collect(Promise.resolve(checkAgents()));
    await collect(checkLogDirectory());
    await collect(checkDiskSpace());
    await collect(checkNodeModules());
    await collect(checkEnvFile());

    // Crestodian 探针
    const integration = await integrationPromise;
    await collect(checkCrestodian(integration));

    // TypeScript 编译放在最后（最慢）
    await collect(checkTypeScript());

    const endedAt = new Date();
    const report = buildReport(results, startedAt, endedAt);

    if (options.json) {
      renderJson(report);
    } else {
      console.log('');
      console.log(colorize('--- Summary ---', 'bold'));
      console.log(`Total: ${report.summary.total}`);
      console.log(
        `OK: ${colorize(String(report.summary.ok), 'green')}` +
          `  Warnings: ${colorize(String(report.summary.warnings), 'yellow')}` +
          `  Errors: ${colorize(String(report.summary.errors), 'red')}`
      );
      console.log(`Duration: ${report.durationMs}ms`);

      if (options.verbose) {
        console.log('');
        console.log(colorize('--- Detailed table ---', 'bold'));
        renderTable(results, true);
      }
    }

    // 设置退出码
    if (report.summary.errors > 0) {
      process.exitCode = 1;
    }
    // 避免未使用变量警告
    void effectiveColor;
  });
