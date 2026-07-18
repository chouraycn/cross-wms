// Minimal dotenv loader for gateway-dispatched CLI commands.
// 移植自 openclaw/src/cli/gateway-dispatch-dotenv.ts。
//
// 降级策略：
//  - 原模块依赖 ../config/paths.js 的 resolveStateDir、
//    ../infra/dotenv-global.js 的 loadGlobalRuntimeDotEnvFiles。
//    cross-wms 均未移植；降级为调用已移植的 loadCliDotEnv。

import fs from "node:fs";
import path from "node:path";

/** Load only the env files needed before dispatching a command through the gateway. */
export async function loadGatewayDispatchCliDotEnv(opts?: { quiet?: boolean }): Promise<void> {
  const quiet = opts?.quiet ?? true;
  const cwdEnvPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(cwdEnvPath)) {
    const { loadCliDotEnv } = await import("./dotenv.js");
    loadCliDotEnv({ quiet });
    return;
  }
  // 降级：openclaw 的 infra/dotenv-global.js 与 config/paths.js 未移植；
  // 此处仅加载 cwd 下的 .env，跳过 state 目录下的全局 env。
}
