#!/usr/bin/env node
/**
 * cdf-cli — 跨平台 CLI 入口（包装 server/cli 的 runCLI）
 *
 * 通过 tsx 的 ESM API 直接加载 TypeScript 入口，无需预编译。
 * 适用于 `npm link` / `npm i -g` 后的全局调用：
 *   cdf-cli --help
 *   cdf-cli status
 *   cdf-cli doctor
 */
import { tsImport } from 'tsx/esm/api';

async function main() {
  // 加载 server/cli/program.ts 并取出 runCLI（通过 cli/index.ts 的 barrel 导出同样可用）
  const { runCLI } = await tsImport('../server/cli/program.ts', import.meta.url);
  const code = await runCLI(process.argv.slice(2));
  process.exit(typeof code === 'number' ? code : 0);
}

main().catch((error) => {
  console.error('[cdf-cli] 启动失败:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
