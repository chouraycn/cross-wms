// 与本地 Tailscale CLI 集成以设置 tailnet 和共享。
// 移植自 openclaw/src/infra/tailscale.ts（降级实现）。
//
// 降级说明：
//  - @openclaw/normalization-core/number-coercion 替换为 ./_runtime-stubs.js 中的 asDateTimestampMs/resolveExpiresAtMsFromDurationMs
//  - @openclaw/normalization-core/record-coerce 替换为 ./record-coerce.js 中的 asNullableObjectRecord
//  - @openclaw/normalization-core/string-coerce 替换为 ./string-coerce.js
//  - ../globals.js 的 logVerbose 降级为 console.debug（no-op 在测试环境）
//  - ../process/exec.js 的 runExec 内联实现（使用 child_process.spawn）
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  asDateTimestampMs,
  resolveExpiresAtMsFromDurationMs,
} from "./_runtime-stubs.js";
import { asNullableObjectRecord as readRecord } from "./record-coerce.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "./string-coerce.js";
import { toErrorObject } from "./errors.js";

// ============================================================================
// 降级：logVerbose 从 ../globals.js 导入，降级为 console.debug
// ============================================================================

function logVerbose(message: string): void {
  if (process.env.OPENCLAW_VERBOSE === "1" || process.env.DEBUG) {
    console.debug(message);
  }
}

// ============================================================================
// 降级：runExec 从 ../process/exec.js 导入，内联实现使用 child_process.spawn
// ============================================================================

type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

type ExecOptions = {
  timeoutMs?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

async function runExec(
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const maxBuffer = options.maxBuffer ?? 1_000_000;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGTERM");
          } catch {
            // 忽略
          }
        }, options.timeoutMs)
      : null;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > maxBuffer) {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // 忽略
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > maxBuffer) {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // 忽略
        }
      }
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        const err = new Error(`Command timed out: ${command} ${args.join(" ")}`) as Error & {
          code?: string;
          stdout?: string;
          stderr?: string;
        };
        err.code = "ETIMEDOUT";
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      if (code !== 0 && code !== null) {
        const err = new Error(
          `Command failed (${code}${signal ? `/${signal}` : ""}): ${command} ${args.join(" ")}\n${stderr}`,
        ) as Error & {
          code?: string;
          stdout?: string;
          stderr?: string;
        };
        err.code = String(code);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

// ============================================================================
// 移植实现
// ============================================================================

function parsePossiblyNoisyJsonObject(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  }
  return JSON.parse(trimmed) as Record<string, unknown>;
}

/**
 * 使用多种策略定位 Tailscale 二进制文件：
 * 1. PATH 查找（通过 which 命令）
 * 2. 已知 macOS 应用路径
 * 3. find /Applications 查找 Tailscale.app
 * 4. locate 数据库（如果可用）
 */
export async function findTailscaleBinary(): Promise<string | null> {
  const checkBinary = async (path: string): Promise<boolean> => {
    if (!path || !existsSync(path)) {
      return false;
    }
    try {
      await Promise.race([
        runExec(path, ["--version"], { timeoutMs: 3000 }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), 3000);
        }),
      ]);
      return true;
    } catch {
      return false;
    }
  };

  // 策略 1：which 命令
  try {
    const { stdout } = await runExec("which", ["tailscale"]);
    const fromPath = stdout.trim();
    if (fromPath && (await checkBinary(fromPath))) {
      return fromPath;
    }
  } catch {
    // which 失败，继续
  }

  // 策略 2：已知 macOS 应用路径
  const macAppPath = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
  if (await checkBinary(macAppPath)) {
    return macAppPath;
  }

  // 策略 3：find 命令在 /Applications 中查找
  try {
    const { stdout } = await runExec(
      "find",
      [
        "/Applications",
        "-maxdepth",
        "3",
        "-name",
        "Tailscale",
        "-path",
        "*/Tailscale.app/Contents/MacOS/Tailscale",
      ],
      { timeoutMs: 5000 },
    );
    const found = stdout.trim().split("\n")[0];
    if (found && (await checkBinary(found))) {
      return found;
    }
  } catch {
    // find 失败，继续
  }

  // 策略 4：locate 命令
  try {
    const { stdout } = await runExec("locate", ["Tailscale.app"]);
    const candidates = stdout
      .trim()
      .split("\n")
      .filter((line) => line.includes("/Tailscale.app/Contents/MacOS/Tailscale"));
    for (const candidate of candidates) {
      if (await checkBinary(candidate)) {
        return candidate;
      }
    }
  } catch {
    // locate 失败，继续
  }

  return null;
}

export async function getTailnetHostname(
  exec: typeof runExec = runExec,
  detectedBinary?: string,
) {
  const candidates = detectedBinary
    ? [detectedBinary]
    : ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];
  let lastError: unknown;

  for (const candidate of candidates) {
    if (candidate.startsWith("/") && !existsSync(candidate)) {
      continue;
    }
    try {
      const { stdout } = await exec(candidate, ["status", "--json"], {
        timeoutMs: 5000,
        maxBuffer: 400_000,
      });
      const parsed = stdout ? parsePossiblyNoisyJsonObject(stdout) : {};
      const self =
        typeof parsed.Self === "object" && parsed.Self !== null
          ? (parsed.Self as Record<string, unknown>)
          : undefined;
      const dns = typeof self?.DNSName === "string" ? self.DNSName : undefined;
      const ips = Array.isArray(self?.TailscaleIPs)
        ? ((parsed.Self as { TailscaleIPs?: string[] }).TailscaleIPs ?? [])
        : [];
      if (dns && dns.length > 0) {
        return dns.replace(/\.$/, "");
      }
      if (ips.length > 0) {
        return ips[0];
      }
      throw new Error("Could not determine Tailscale DNS or IP");
    } catch (err) {
      lastError = err;
    }
  }

  throw toErrorObject(
    lastError ?? new Error("Could not determine Tailscale DNS or IP"),
    "Non-Error thrown",
  );
}

let cachedTailscaleBinary: string | null = null;

export function getTestTailscaleBinaryOverride(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const forcedBinary = env.OPENCLAW_TEST_TAILSCALE_BINARY?.trim();
  if (!forcedBinary) {
    return null;
  }
  if (env.VITEST || env.NODE_ENV === "test") {
    return forcedBinary;
  }
  return null;
}

async function getTailscaleBinary(): Promise<string> {
  const forcedBinary = getTestTailscaleBinaryOverride();
  if (forcedBinary) {
    cachedTailscaleBinary = forcedBinary;
    return forcedBinary;
  }
  if (cachedTailscaleBinary) {
    return cachedTailscaleBinary;
  }
  cachedTailscaleBinary = await findTailscaleBinary();
  return cachedTailscaleBinary ?? "tailscale";
}

type ExecErrorDetails = {
  stdout?: unknown;
  stderr?: unknown;
  message?: unknown;
  code?: unknown;
};

export type TailscaleWhoisIdentity = {
  login: string;
  name?: string;
};

type TailscaleWhoisCacheEntry = {
  value: TailscaleWhoisIdentity | null;
  expiresAt: number;
};

const whoisCache = new Map<string, TailscaleWhoisCacheEntry>();

function extractExecErrorText(err: unknown) {
  const errOutput = err as ExecErrorDetails;
  const stdout = typeof errOutput.stdout === "string" ? errOutput.stdout : "";
  const stderr = typeof errOutput.stderr === "string" ? errOutput.stderr : "";
  const message = typeof errOutput.message === "string" ? errOutput.message : "";
  const code = typeof errOutput.code === "string" ? errOutput.code : "";
  return { stdout, stderr, message, code };
}

function isPermissionDeniedError(err: unknown): boolean {
  const { stdout, stderr, message, code } = extractExecErrorText(err);
  if (code.toUpperCase() === "EACCES") {
    return true;
  }
  const combined = normalizeLowercaseStringOrEmpty(`${stdout}\n${stderr}\n${message}`);
  return (
    combined.includes("permission denied") ||
    combined.includes("access denied") ||
    combined.includes("operation not permitted") ||
    combined.includes("not permitted") ||
    combined.includes("requires root") ||
    combined.includes("must be run as root") ||
    combined.includes("must be run with sudo") ||
    combined.includes("requires sudo") ||
    combined.includes("need sudo")
  );
}

async function execWithSudoFallback(
  exec: typeof runExec,
  bin: string,
  args: string[],
  opts: { maxBuffer?: number; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec(bin, args, opts);
  } catch (err) {
    if (!isPermissionDeniedError(err)) {
      throw err;
    }
    logVerbose(`Command failed, retrying with sudo: ${bin} ${args.join(" ")}`);
    try {
      return await exec("sudo", ["-n", bin, ...args], opts);
    } catch (sudoErr) {
      const { stderr, message } = extractExecErrorText(sudoErr);
      const detail = (stderr || message).trim();
      if (detail) {
        logVerbose(`Sudo retry failed: ${detail}`);
      }
      throw err;
    }
  }
}

export async function enableTailscaleServe(
  port: number,
  exec: typeof runExec = runExec,
  serviceName?: string,
) {
  const tailscaleBin = await getTailscaleBinary();
  await execWithSudoFallback(
    exec,
    tailscaleBin,
    ["serve", ...(serviceName ? [`--service=${serviceName}`] : []), "--bg", "--yes", `${port}`],
    {
      maxBuffer: 200_000,
      timeoutMs: 15_000,
    },
  );
}

export async function hasTailscaleFunnelRouteForPort(
  port: number,
  exec: typeof runExec = runExec,
): Promise<boolean> {
  let stdout: string;
  try {
    const tailscaleBin = await getTailscaleBinary();
    const result = await exec(tailscaleBin, ["funnel", "status", "--json"], {
      maxBuffer: 200_000,
      timeoutMs: 5_000,
    });
    stdout = result.stdout;
  } catch {
    return false;
  }
  const parsed = stdout ? parsePossiblyNoisyJsonObject(stdout) : {};
  return tailscaleFunnelStatusCoversPort(parsed, port);
}

const TAILSCALE_LOOPBACK_PROXY_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function tailscaleFunnelStatusCoversPort(
  status: Record<string, unknown>,
  port: number,
): boolean {
  for (const proxy of funnelStatusBackendsForPort(status)) {
    if (tailscaleProxyMatchesLoopbackPort(proxy, port)) {
      return true;
    }
  }
  return false;
}

function tailscaleProxyMatchesLoopbackPort(proxy: string, port: number): boolean {
  const stripped = proxy.replace(/^[a-z][a-z0-9+\-.]*:\/\//i, "").replace(/\/.*$/, "");
  if (stripped === String(port)) {
    return true;
  }
  const sep = stripped.lastIndexOf(":");
  if (sep < 0) {
    return false;
  }
  const host = stripped.slice(0, sep);
  const portStr = stripped.slice(sep + 1);
  if (portStr !== String(port)) {
    return false;
  }
  return TAILSCALE_LOOPBACK_PROXY_HOSTS.has(host);
}

function funnelStatusBackendsForPort(status: Record<string, unknown>): Set<string> {
  const backends = new Set<string>();
  const allowFunnel = (status as { AllowFunnel?: Record<string, unknown> }).AllowFunnel ?? {};
  const enabledHosts = new Set(
    Object.entries(allowFunnel)
      .filter(([, value]) => value === true)
      .map(([host]) => host),
  );
  if (enabledHosts.size === 0) {
    return backends;
  }
  const web = (status as { Web?: Record<string, unknown> }).Web;
  if (!web || typeof web !== "object") {
    return backends;
  }
  for (const [host, handlers] of Object.entries(web)) {
    if (!enabledHosts.has(host)) {
      continue;
    }
    if (!handlers || typeof handlers !== "object") {
      continue;
    }
    const handlerEntries = (handlers as { Handlers?: Record<string, unknown> }).Handlers;
    if (!handlerEntries || typeof handlerEntries !== "object") {
      continue;
    }
    for (const handler of Object.values(handlerEntries)) {
      const proxy = (handler as { Proxy?: unknown })?.Proxy;
      if (typeof proxy === "string" && proxy.length > 0) {
        backends.add(proxy);
      }
    }
  }
  return backends;
}

export async function disableTailscaleServe(
  exec: typeof runExec = runExec,
  serviceName?: string,
) {
  const tailscaleBin = await getTailscaleBinary();
  await execWithSudoFallback(
    exec,
    tailscaleBin,
    serviceName ? ["serve", "clear", serviceName] : ["serve", "reset"],
    {
      maxBuffer: 200_000,
      timeoutMs: 15_000,
    },
  );
}

export async function enableTailscaleFunnel(port: number, exec: typeof runExec = runExec) {
  const tailscaleBin = await getTailscaleBinary();
  await execWithSudoFallback(exec, tailscaleBin, ["funnel", "--bg", "--yes", `${port}`], {
    maxBuffer: 200_000,
    timeoutMs: 15_000,
  });
}

export async function disableTailscaleFunnel(exec: typeof runExec = runExec) {
  const tailscaleBin = await getTailscaleBinary();
  await execWithSudoFallback(exec, tailscaleBin, ["funnel", "reset"], {
    maxBuffer: 200_000,
    timeoutMs: 15_000,
  });
}

function parseWhoisIdentity(payload: Record<string, unknown>): TailscaleWhoisIdentity | null {
  const userProfile =
    readRecord(payload.UserProfile) ?? readRecord(payload.userProfile) ?? readRecord(payload.User);
  const login =
    normalizeOptionalString(userProfile?.LoginName) ??
    normalizeOptionalString(userProfile?.Login) ??
    normalizeOptionalString(userProfile?.login) ??
    normalizeOptionalString(payload.LoginName) ??
    normalizeOptionalString(payload.login);
  if (!login) {
    return null;
  }
  const name =
    normalizeOptionalString(userProfile?.DisplayName) ??
    normalizeOptionalString(userProfile?.Name) ??
    normalizeOptionalString(userProfile?.displayName) ??
    normalizeOptionalString(payload.DisplayName) ??
    normalizeOptionalString(payload.name);
  return { login, name };
}

function readCachedWhois(ip: string, now: number): TailscaleWhoisIdentity | null | undefined {
  const validNow = asDateTimestampMs(now);
  if (validNow === undefined) {
    return undefined;
  }
  const cached = whoisCache.get(ip);
  if (!cached) {
    return undefined;
  }
  const expiresAt = asDateTimestampMs(cached.expiresAt);
  if (expiresAt === undefined || expiresAt <= validNow) {
    whoisCache.delete(ip);
    return undefined;
  }
  return cached.value;
}

function writeCachedWhois(ip: string, value: TailscaleWhoisIdentity | null, ttlMs: number): void {
  const expiresAt = resolveExpiresAtMsFromDurationMs(ttlMs);
  if (expiresAt !== undefined) {
    whoisCache.set(ip, { value, expiresAt });
  }
}

export async function readTailscaleWhoisIdentity(
  ip: string,
  exec: typeof runExec = runExec,
  opts?: { timeoutMs?: number; cacheTtlMs?: number; errorTtlMs?: number },
): Promise<TailscaleWhoisIdentity | null> {
  const normalized = ip.trim();
  if (!normalized) {
    return null;
  }
  const now = Date.now();
  const cached = readCachedWhois(normalized, now);
  if (cached !== undefined) {
    return cached;
  }

  const cacheTtlMs = opts?.cacheTtlMs ?? 60_000;
  const errorTtlMs = opts?.errorTtlMs ?? 5_000;
  try {
    const tailscaleBin = await getTailscaleBinary();
    const result = await exec(tailscaleBin, ["whois", "--json", normalized], {
      timeoutMs: opts?.timeoutMs ?? 5_000,
      maxBuffer: 200_000,
    });
    const parsed = result.stdout ? parsePossiblyNoisyJsonObject(result.stdout) : {};
    const identity = parseWhoisIdentity(parsed);
    writeCachedWhois(normalized, identity, cacheTtlMs);
    return identity;
  } catch {
    writeCachedWhois(normalized, null, errorTtlMs);
    return null;
  }
}
