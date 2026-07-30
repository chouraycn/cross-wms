/**
 * build-staffdeck-app.mjs — 构建 StaffDeck-main 原前端并嵌入 cross-wms。
 *
 * 目的：把 /Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/StaffDeck-main/frontend-enterprise
 * (shadcn/Tailwind, Teal 设计系统) 独立构建为静态产物，copy 到 dist/staffdeck-app/，
 * 供主程序通过 iframe 100% 复刻加载。
 *
 * 依赖隔离：该前端必须用独立 npm 安装在自身 node_modules（不能用 cross-wms 的 pnpm
 * workspace，否则 tailwind v3/v4 版本冲突）。依赖已在开发环境预装，这里仅构建。
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

function run(cmd, args, cwd, label) {
  console.log(`[staffdeck-build] ${label}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`[staffdeck-build] FAILED: ${label} (exit ${r.status})`);
    process.exit(1);
  }
}

// 1) 确保依赖已安装（独立 npm，隔离于 cross-wms pnpm workspace）
if (!fs.existsSync(path.join(staffFrontend, 'node_modules/vite'))) {
  run('npm', ['install', '--no-audit', '--no-fund'], staffFrontend, 'npm install (staffdeck frontend)');
}

// 2) 构建
run('node', ['node_modules/vite/bin/vite.js', 'build'], staffFrontend, 'vite build');

// 3) copy 到 dist/staffdeck-app
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(path.join(staffFrontend, 'dist'), outDir, { recursive: true });
console.log(`[staffdeck-build] OK -> ${outDir}`);
