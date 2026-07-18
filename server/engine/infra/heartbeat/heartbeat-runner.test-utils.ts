// 移植自 openclaw/src/infra/heartbeat-runner.test-utils.ts
// 为 infra 测试提供共享的心跳 runner fixtures。
//
// 降级策略：源文件依赖 vitest、../../test/helpers/ 中的 channel plugin fixtures、
// ../config/sessions.js、../plugins/runtime.js、../test-utils/channel-plugins.js、
// 以及 ./heartbeat-runner.js 的 HeartbeatDeps 类型。cross-wms 未移植这些模块。
// 此处提供降级 stub，所有函数抛出 "not implemented" 错误或返回降级值。
// 注意：这不是测试文件，而是测试辅助模块（供 openclaw 测试套件使用）。

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { OpenClawConfig } from "../_runtime-stubs.js";

type HeartbeatSessionSeed = {
  sessionId?: string;
  updatedAt?: number;
  lastChannel: string;
  lastProvider: string;
  lastTo: string;
  pendingFinalDelivery?: boolean;
  pendingFinalDeliveryText?: string;
  pendingFinalDeliveryCreatedAt?: number;
  pendingFinalDeliveryAttemptCount?: number;
  pendingFinalDeliveryLastError?: string | null;
  agentHarnessId?: string;
  agentRuntimeOverride?: string;
  model?: string;
  modelProvider?: string;
};

/** 心跳回复函数的 spy 类型（降级：使用简单函数类型） */
export type HeartbeatReplySpy = ((...args: unknown[]) => Promise<{ text: string }>) & {
  mockResolvedValue: (value: { text: string }) => void;
  mockReset: () => void;
};

/** 创建心跳回复 spy。降级实现：返回总是解析为 { text: "ok" } 的函数。 */
export function createHeartbeatReplySpy(): HeartbeatReplySpy {
  let resolvedValue: { text: string } = { text: "ok" };
  const fn = (async () => resolvedValue) as HeartbeatReplySpy;
  fn.mockResolvedValue = (value: { text: string }) => {
    resolvedValue = value;
  };
  fn.mockReset = () => {
    resolvedValue = { text: "ok" };
  };
  return fn;
}

/** 将单个心跳会话条目写入 JSON session store。 */
export async function seedSessionStore(
  storePath: string,
  sessionKey: string,
  session: HeartbeatSessionSeed,
): Promise<void> {
  let existingStore: Record<string, unknown>;
  try {
    existingStore = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<string, unknown>;
  } catch {
    existingStore = {};
  }
  await fs.writeFile(
    storePath,
    JSON.stringify({
      ...existingStore,
      [sessionKey]: {
        sessionId: session.sessionId ?? "sid",
        updatedAt: session.updatedAt ?? Date.now(),
        ...session,
      },
    }),
  );
}

/** 种子化配置的 main session 并返回其 session key。降级实现：使用 "main" 作为 key。 */
export async function seedMainSessionStore(
  storePath: string,
  _cfg: OpenClawConfig,
  session: HeartbeatSessionSeed,
): Promise<string> {
  const sessionKey = "main";
  await seedSessionStore(storePath, sessionKey, session);
  return sessionKey;
}

/** 在临时 prompt/session-store 沙箱中运行心跳测试。 */
export async function withTempHeartbeatSandbox<T>(
  fn: (ctx: { tmpDir: string; storePath: string; replySpy: HeartbeatReplySpy }) => Promise<T>,
  options?: {
    prefix?: string;
    unsetEnvVars?: string[];
  },
): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), options?.prefix ?? "openclaw-hb-"));
  await fs.writeFile(path.join(tmpDir, "HEARTBEAT.md"), "- Check status\n", "utf-8");
  const storePath = path.join(tmpDir, "sessions.json");
  const replySpy = createHeartbeatReplySpy();
  const previousEnv = new Map<string, string | undefined>();
  for (const envName of options?.unsetEnvVars ?? []) {
    previousEnv.set(envName, process.env[envName]);
    process.env[envName] = "";
  }
  try {
    return await fn({ tmpDir, storePath, replySpy });
  } finally {
    replySpy.mockReset();
    for (const [envName, previousValue] of previousEnv.entries()) {
      if (previousValue === undefined) {
        delete process.env[envName];
      } else {
        process.env[envName] = previousValue;
      }
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** 在移除 Telegram 凭据的临时沙箱中运行 Telegram 心跳测试。 */
export async function withTempTelegramHeartbeatSandbox<T>(
  fn: (ctx: { tmpDir: string; storePath: string; replySpy: HeartbeatReplySpy }) => Promise<T>,
  options?: {
    prefix?: string;
  },
): Promise<T> {
  return withTempHeartbeatSandbox(fn, {
    prefix: options?.prefix,
    unsetEnvVars: ["TELEGRAM_BOT_TOKEN"],
  });
}

/** 仅在活动测试 registry 中安装 Telegram 心跳 plugin。降级实现：空操作。 */
export function setupTelegramHeartbeatPluginRuntimeForTests(): void {
  // 降级 stub：cross-wms 未移植 setActivePluginRegistry 与 channel plugin fixtures。
}
