// CLI dotenv 加载器，在全局运行时 fallback 之前保留 workspace 覆盖。
// 移植自 openclaw/src/cli/dotenv.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/paths.js` 中的 `resolveStateDir`，cross-wms 的
//    `config/paths.ts` 未导出该函数。这里内联一个简化版 `resolveStateDir`，
//    尊重 `OPENCLAW_STATE_DIR` 环境变量，否则默认 `~/.openclaw`。
//  - 原模块依赖 `../infra/dotenv.js` 中的 `loadGlobalRuntimeDotEnvFiles`/
//    `loadWorkspaceDotEnvFile`，cross-wms 的 `infra/dotenv.ts` 仅导出
//    `parseDotenv`/`loadDotenv` 等基础函数。这里内联简化版的
//    `loadWorkspaceDotEnvFile` 与 `loadGlobalRuntimeDotEnvFiles`，复用
//    cross-wms 已有的 `parseDotenv`，跳过已设置的 env 变量。
//  - 此处直接迁移实现，仅调整依赖为内联降级版本。

import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseDotenv } from "../infra/dotenv.js";

// ===== 内联 resolveStateDir（替代未移植的 config/paths.js#resolveStateDir）=====
/**
 * 解析可变数据状态目录（sessions、logs、caches）。
 * 可通过 OPENCLAW_STATE_DIR 覆盖。默认：~/.openclaw
 */
function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(homedir(), ".openclaw");
}
// ===== resolveStateDir 结束 =====

// ===== 内联 dotenv 加载函数（替代未移植的 infra/dotenv.js 高级函数）=====
/** 读取 .env 文件并填充 process.env，跳过已设置的变量。 */
function loadWorkspaceDotEnvFile(filePath: string, opts?: { quiet?: boolean }): void {
  const quiet = opts?.quiet ?? true;
  if (!existsSync(filePath)) {
    return;
  }
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    if (!quiet) {
      // eslint-disable-next-line no-console -- CLI dotenv 加载器需要向用户报告配置读取失败。
      console.warn(`Failed to read .env at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  const parsed = parseDotenv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = value;
  }
}

/** 加载全局运行时 .env fallback 文件，不覆盖已设置的 env 变量。 */
function loadGlobalRuntimeDotEnvFiles(params: {
  quiet?: boolean;
  stateEnvPath?: string;
}): void {
  const quiet = params.quiet ?? true;
  const stateEnvPath = params.stateEnvPath ?? path.join(resolveStateDir(process.env), ".env");
  loadWorkspaceDotEnvFile(stateEnvPath, { quiet });
}
// ===== dotenv 加载函数结束 =====

/** 为普通 CLI 命令加载 `.env` 文件，不覆盖已存在的 process env。 */
export function loadCliDotEnv(opts?: { loadGlobalEnv?: boolean; quiet?: boolean }) {
  const quiet = opts?.quiet ?? true;
  const cwdEnvPath = path.join(process.cwd(), ".env");
  loadWorkspaceDotEnvFile(cwdEnvPath, { quiet });

  if (opts?.loadGlobalEnv === false) {
    return;
  }
  // 然后加载全局 fallback 集合，不覆盖任何已设置或从 CWD 加载的 env 变量。
  // 这包括 Ubuntu 全新安装 gateway.env 的兼容路径。
  loadGlobalRuntimeDotEnvFiles({
    quiet,
    stateEnvPath: path.join(resolveStateDir(process.env), ".env"),
  });
}
