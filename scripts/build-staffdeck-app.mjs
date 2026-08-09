/**
 * build-staffdeck-app.mjs — 构建 StaffDeck-main 原前端并嵌入 cross-wms。
 *
 * 目的：把 StaffDeck-main/frontend-enterprise
 * (shadcn/Tailwind, Teal 设计系统) 独立构建为静态产物，copy 到 dist/staffdeck-app/，
 * 供主程序通过 iframe 100% 复刻加载。
 *
 * 依赖隔离：该前端必须用独立 npm 安装在自身 node_modules（不能用 cross-wms 的 workspace，
 * 否则 tailwind v3/v4 版本冲突）。
 *
 * 注意：vite.config.ts 已改为用 @tailwindcss/postcss（绕开 vite8/rolldown 的 @layer bug）
 * 且 base=/staffdeck-app/，请勿改回原配置，否则嵌入路径错误。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const staffFrontend = path.resolve(repoRoot, 'StaffDeck-main/frontend-enterprise');
const outDir = path.resolve(repoRoot, 'dist/staffdeck-app');

/**
 * spawnSync 的健壮包装：
 * - 提前检查 cwd 存在（最常见 CI 失败根因：submodule 未下载）
 * - 区分 status=null (signal kill / ENOENT) 与正常退出码
 * - 打印错误原因后 exit(1)
 */
function run(cmd, args, cwd, label) {
  if (!fs.existsSync(cwd)) {
    console.error(
      `[staffdeck-build] FAILED: ${label} — 工作目录不存在: ${cwd}\n` +
        `  请确认 StaffDeck-main/ 目录已完整克隆，不是孤儿 submodule 或被 submodules:false 跳过。\n` +
        `  可运行: git status && ls -la StaffDeck-main/frontend-enterprise/`,
    );
    process.exit(1);
  }
  console.log(`[staffdeck-build] ${label}: ${cmd} ${args.join(' ')}  (cwd=${cwd})`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env },
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.error) {
    console.error(
      `[staffdeck-build] FAILED: ${label}\n` +
        `  spawn error: ${r.error.name} ${r.error.message}\n` +
        `  cmd=${cmd} args=${JSON.stringify(args)} cwd=${cwd}`,
    );
    process.exit(1);
  }
  if (r.status !== 0) {
    const reason =
      r.status === null
        ? `terminated by signal ${r.signal ?? 'unknown'} (可能是 SIGKILL: OOM killer)`
        : `exit code ${r.status}`;
    console.error(`[staffdeck-build] FAILED: ${label} (${reason})`);
    process.exit(1);
  }
}

// 前置条件：frontend-enterprise 必须存在并且至少包含 package.json / vite.config.ts
if (!fs.existsSync(staffFrontend)) {
  console.error(
    `[staffdeck-build] 致命错误: StaffDeck-main/frontend-enterprise 目录不存在\n` +
      `  期望路径: ${staffFrontend}\n` +
      `  StaffDeck-main 必须作为普通文件目录提交 (不能是孤儿 submodule + submodules:false)。`,
  );
  process.exit(1);
}
const mustExist = ['package.json'];
for (const f of mustExist) {
  const p = path.join(staffFrontend, f);
  if (!fs.existsSync(p)) {
    console.error(`[staffdeck-build] 缺少必需文件: ${p}`);
    process.exit(1);
  }
}

// 1) 确保依赖已安装（独立 npm，隔离于 cross-wms workspace）
if (!fs.existsSync(path.join(staffFrontend, 'node_modules/vite'))) {
  const extra = process.env.CI ? ['--no-audit', '--no-fund', '--prefer-offline'] : ['--no-audit', '--no-fund'];
  run('npm', ['install', ...extra], staffFrontend, 'npm install (staffdeck frontend)');
}

// 2) 构建
run('node', ['node_modules/vite/bin/vite.js', 'build'], staffFrontend, 'vite build');

// 3) copy 到 dist/staffdeck-app
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(path.join(staffFrontend, 'dist'), outDir, { recursive: true });
console.log(`[staffdeck-build] OK -> ${outDir}`);
