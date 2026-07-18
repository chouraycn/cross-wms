// 检测 Windows Subsystem for Linux 环境
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";

let wslCached: boolean | null = null;

/** 在隔离测试之间清除缓存的 WSL 异步检测结果。 */
export function resetWSLStateForTests(): void {
  wslCached = null;
}

/** 仅从环境变量检测 WSL，不触碰文件系统。 */
export function isWSLEnv(env: Record<string, string | undefined> = process.env): boolean {
  if (env.WSL_INTEROP || env.WSL_DISTRO_NAME || env.WSLENV) {
    return true;
  }
  return false;
}

/**
 * 同步检测 WSL：先看环境变量，再看 `/proc/version`。
 */
export function isWSLSync(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  if (isWSLEnv()) {
    return true;
  }
  try {
    const release = normalizeLowercaseStringOrEmpty(readFileSync("/proc/version", "utf8"));
    return release.includes("microsoft") || release.includes("wsl");
  } catch {
    return false;
  }
}

/**
 * 在 WSL 检测后，从内核版本标记同步检测 WSL2。
 */
export function isWSL2Sync(): boolean {
  if (!isWSLSync()) {
    return false;
  }
  try {
    const version = normalizeLowercaseStringOrEmpty(readFileSync("/proc/version", "utf8"));
    return version.includes("wsl2") || version.includes("microsoft-standard");
  } catch {
    return false;
  }
}

/** 从环境变量与 `/proc/sys/kernel/osrelease` 异步检测 WSL，带进程缓存。 */
export async function isWSL(): Promise<boolean> {
  if (wslCached !== null) {
    return wslCached;
  }
  if (process.platform !== "linux") {
    wslCached = false;
    return wslCached;
  }
  if (isWSLEnv()) {
    wslCached = true;
    return wslCached;
  }
  try {
    const release = normalizeLowercaseStringOrEmpty(
      await fs.readFile("/proc/sys/kernel/osrelease", "utf8"),
    );
    wslCached = release.includes("microsoft") || release.includes("wsl");
  } catch {
    wslCached = false;
  }
  return wslCached;
}
