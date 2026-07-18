// 当请求时将全局 dotenv 文件加载到进程环境中。
// 降级实现：从 openclaw/src/infra/dotenv-global.ts 移植，
// - 由于 `dotenv` 包未在 cross-wms 的 dependencies 中，本地实现最小 dotenv 解析器
// - createSubsystemLogger 使用本地 _runtime-stubs.ts 替代 ../logging/subsystem.js
// - resolveConfigDir 使用本地 _runtime-stubs.ts 替代 ../utils.js
// - resolveRequiredHomeDir 使用本地 _runtime-stubs.ts 替代 ./home-dir.js
// - normalizeEnvVarKey 使用本地 ./host-env-security.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSubsystemLogger,
  resolveConfigDir,
  resolveRequiredHomeDir,
} from "./_runtime-stubs.js";
import { normalizeEnvVarKey } from "./host-env-security.js";

// 全局 dotenv 加载导入 operator 级 gateway env 文件，
// 不覆盖进程环境中已存在的变量。
const logger = createSubsystemLogger("infra:dotenv");

type DotEnvEntry = {
  key: string;
  value: string;
};

type LoadedDotEnvFile = {
  filePath: string;
  entries: DotEnvEntry[];
};

type GlobalRuntimeDotEnvOptions = {
  additionalEnvPaths?: string[];
  entryFilter?: (key: string, value: string) => boolean;
  quiet?: boolean;
  stateEnvPath?: string;
};

/**
 * 最小 dotenv 解析器（降级 stub）。
 * openclaw 使用 `dotenv` 包的 parse 函数，cross-wms 未引入该依赖，
 * 这里实现一个足以满足 .env 文件加载的最小解析器。
 *
 * 支持：
 *  - KEY=VALUE 形式的键值对
 *  - # 开头的注释行
 *  - 单引号/双引号包裹的值
 *  - 可选的 export 前缀
 *  - 值中的换行符（在双引号中）
 */
function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  let currentKey = "";
  let currentValue = "";
  let inQuotes: "single" | "double" | null = null;
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      if (inQuotes === "double" && line.endsWith('"')) {
        currentValue += "\n" + line.slice(0, -1);
        result[currentKey] = currentValue;
        inMultiline = false;
        inQuotes = null;
        currentKey = "";
        currentValue = "";
      } else if (inQuotes === "single" && line.endsWith("'")) {
        currentValue += "\n" + line.slice(0, -1);
        result[currentKey] = currentValue;
        inMultiline = false;
        inQuotes = null;
        currentKey = "";
        currentValue = "";
      } else {
        currentValue += "\n" + line;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // 去除可选的 export 前缀
    const exportMatch = /^\s*export\s+/.exec(line);
    const lineWithoutExport = exportMatch ? line.slice(exportMatch[0].length) : line;
    const eqIndex = lineWithoutExport.indexOf("=");
    if (eqIndex < 0) {
      continue;
    }
    const key = lineWithoutExport.slice(0, eqIndex).trim();
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = lineWithoutExport.slice(eqIndex + 1).trim();

    // 处理引号包裹的值
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
      // 处理双引号中的转义字符
      value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      result[key] = value;
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      result[key] = value.slice(1, -1);
    } else if (value.startsWith('"') && !value.endsWith('"')) {
      // 多行双引号值
      currentKey = key;
      currentValue = value.slice(1);
      inMultiline = true;
      inQuotes = "double";
    } else if (value.startsWith("'") && !value.endsWith("'")) {
      // 多行单引号值
      currentKey = key;
      currentValue = value.slice(1);
      inMultiline = true;
      inQuotes = "single";
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function readDotEnvFile(params: {
  entryFilter?: (key: string, value: string) => boolean;
  filePath: string;
  quiet?: boolean;
}): LoadedDotEnvFile | null {
  let content: string;
  try {
    content = fs.readFileSync(params.filePath, "utf8");
  } catch (error) {
    if (!params.quiet) {
      const code =
        error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
      if (code !== "ENOENT") {
        logger.warn(`Failed to read ${params.filePath}: ${String(error)}`, { error });
      }
    }
    return null;
  }

  let parsed: Record<string, string>;
  try {
    parsed = parseDotEnv(content);
  } catch (error) {
    if (!params.quiet) {
      logger.warn(`Failed to parse ${params.filePath}: ${String(error)}`, { error });
    }
    return null;
  }
  const entries: DotEnvEntry[] = [];
  for (const [rawKey, value] of Object.entries(parsed)) {
    const key = normalizeEnvVarKey(rawKey, { portable: true });
    if (key && (params.entryFilter?.(key, value) ?? true)) {
      entries.push({ key, value });
    }
  }
  return { filePath: params.filePath, entries };
}

function loadParsedDotEnvFiles(files: LoadedDotEnvFile[]): Map<string, string[]> {
  const preExistingKeys = new Set(Object.keys(process.env));
  const conflicts = new Map<string, { keptPath: string; ignoredPath: string; keys: Set<string> }>();
  const firstSeen = new Map<string, { value: string; filePath: string }>();
  const appliedKeysByFile = new Map<string, string[]>();

  for (const file of files) {
    for (const { key, value } of file.entries) {
      if (preExistingKeys.has(key)) {
        continue;
      }
      const previous = firstSeen.get(key);
      if (previous) {
        if (previous.value !== value) {
          // 第一个文件胜出以确保确定性启动；冲突在解析后记录一次，
          // 这样敏感值不会被打印。
          const conflictKey = `${previous.filePath}\u0000${file.filePath}`;
          const existing = conflicts.get(conflictKey);
          if (existing) {
            existing.keys.add(key);
          } else {
            conflicts.set(conflictKey, {
              keptPath: previous.filePath,
              ignoredPath: file.filePath,
              keys: new Set([key]),
            });
          }
        }
        continue;
      }
      firstSeen.set(key, { value, filePath: file.filePath });
      if (process.env[key] === undefined) {
        process.env[key] = value;
        const appliedKeys = appliedKeysByFile.get(file.filePath);
        if (appliedKeys) {
          appliedKeys.push(key);
        } else {
          appliedKeysByFile.set(file.filePath, [key]);
        }
      }
    }
  }

  for (const conflict of conflicts.values()) {
    const keys = [...conflict.keys].toSorted();
    if (keys.length === 0) {
      continue;
    }
    logger.warn(
      `Conflicting values in ${conflict.keptPath} and ${conflict.ignoredPath} for ${keys.join(", ")}; keeping ${conflict.keptPath}.`,
      { keptPath: conflict.keptPath, ignoredPath: conflict.ignoredPath, keys },
    );
  }
  return appliedKeysByFile;
}

/** 以 first-wins 优先级将全局运行时 dotenv 文件加载到 `process.env` 中。 */
export function loadGlobalRuntimeDotEnvFiles(opts?: GlobalRuntimeDotEnvOptions) {
  const quiet = opts?.quiet ?? true;
  const stateEnvPath = opts?.stateEnvPath ?? path.join(resolveConfigDir(process.env), ".env");
  const globalEnvPaths = [...new Set([stateEnvPath, ...(opts?.additionalEnvPaths ?? [])])];
  const defaultStateEnvPath = path.join(
    resolveRequiredHomeDir(process.env, os.homedir),
    ".openclaw",
    ".env",
  );
  const hasExplicitNonDefaultStateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() !== undefined &&
    path.resolve(stateEnvPath) !== path.resolve(defaultStateEnvPath);
  const globalEnvs = globalEnvPaths.map((filePath) =>
    readDotEnvFile({ entryFilter: opts?.entryFilter, filePath, quiet }),
  );
  const parsedFiles = [...globalEnvs];
  let gatewayEnv: LoadedDotEnvFile | null = null;
  if (!hasExplicitNonDefaultStateDir) {
    gatewayEnv = readDotEnvFile({
      entryFilter: opts?.entryFilter,
      filePath: path.join(
        resolveRequiredHomeDir(process.env, os.homedir),
        ".config",
        "openclaw",
        "gateway.env",
      ),
      quiet,
    });
    parsedFiles.push(gatewayEnv);
  }
  const parsed = parsedFiles.filter((file): file is LoadedDotEnvFile => file !== null);
  const appliedKeysByFile = loadParsedDotEnvFiles(parsed);
  return {
    stateEnvAppliedKeys: globalEnvs.flatMap((file) =>
      file ? (appliedKeysByFile.get(file.filePath) ?? []) : [],
    ),
    gatewayEnvAppliedKeys: gatewayEnv ? (appliedKeysByFile.get(gatewayEnv.filePath) ?? []) : [],
  };
}
