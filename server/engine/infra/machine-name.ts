/**
 * 机器名解析 — 用于 gateway 显示的人可读机器名
 * 参考 openclaw/src/infra/machine-name.ts
 */
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { normalizeOptionalString } from "./string-coerce.js";

const execFileAsync = promisify(execFile);

// 机器显示名优先使用 macOS 的 ComputerName，回退到 hostname
// 以便确定性测试与非 macOS 主机使用。
let cachedPromise: Promise<string> | null = null;

async function tryScutil(key: "ComputerName" | "LocalHostName") {
  try {
    const { stdout } = await execFileAsync("/usr/sbin/scutil", ["--get", key], {
      timeout: 1000,
      windowsHide: true,
    });
    const value = normalizeOptionalString(stdout ?? "") ?? "";
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function fallbackHostName() {
  const trimmed = normalizeOptionalString(os.hostname()) ?? "";
  return trimmed.replace(/\.local$/i, "") || "cross-wms";
}

/** 解析当前机器的用户可见名 */
export async function getMachineDisplayName(): Promise<string> {
  if (cachedPromise) {
    return cachedPromise;
  }
  cachedPromise = (async () => {
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
      return fallbackHostName();
    }
    if (process.platform === "darwin") {
      const computerName = await tryScutil("ComputerName");
      if (computerName) {
        return computerName;
      }
      const localHostName = await tryScutil("LocalHostName");
      if (localHostName) {
        return localHostName;
      }
    }
    return fallbackHostName();
  })();
  return cachedPromise;
}

/** 重置缓存（测试用） */
export function resetMachineNameCache(): void {
  cachedPromise = null;
}
