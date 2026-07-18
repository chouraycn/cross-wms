// 缓存的启动元数据读取器，用于预计算根 help 与子命令 help 文本。
// 移植自 openclaw/src/cli/root-help-metadata.ts。
//
// 适配说明：原 openclaw 版本使用 `import.meta.url` 传给 `readCliStartupMetadata`，
// 由于 server/tsconfig.json 配置 `module: "commonjs"`，`import.meta` 不可用（TS1343）。
// 这里改为使用 commonjs 全局变量 `__filename`，与已移植的 startup-metadata.ts 一致。

import { readCliStartupMetadata } from "./startup-metadata.js";

export type PrecomputedSubcommandHelpName =
  | "doctor"
  | "gateway"
  | "models"
  | "plugins"
  | "sessions"
  | "tasks";

let precomputedRootHelpText: string | null | undefined;
let precomputedBrowserHelpText: string | null | undefined;
let precomputedSecretsHelpText: string | null | undefined;
let precomputedNodesHelpText: string | null | undefined;
let precomputedSubcommandHelpText:
  | Partial<Record<PrecomputedSubcommandHelpName, string | null>>
  | undefined;

type PrecomputedHelpTextKey =
  | "rootHelpText"
  | "browserHelpText"
  | "secretsHelpText"
  | "nodesHelpText";

function loadPrecomputedHelpText(
  key: PrecomputedHelpTextKey,
  cache: string | null | undefined,
  setCache: (value: string | null) => void,
): string | null {
  // 源码检出时元数据缺失是预期行为；回退到动态 Commander help。
  if (cache !== undefined) {
    return cache;
  }
  try {
    const parsed = readCliStartupMetadata(__filename);
    if (parsed) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0) {
        setCache(value);
        return value;
      }
    }
  } catch {
    // 回退到动态 help 渲染。
  }
  setCache(null);
  return null;
}

function loadPrecomputedSubcommandHelpText(commandName: string): string | null {
  if (!isPrecomputedSubcommandHelpName(commandName)) {
    return null;
  }
  const cache = precomputedSubcommandHelpText?.[commandName];
  if (cache !== undefined) {
    return cache;
  }
  try {
    const parsed = readCliStartupMetadata(__filename);
    const subcommandHelpText = parsed?.subcommandHelpText;
    if (isSubcommandHelpTextRecord(subcommandHelpText)) {
      const value = subcommandHelpText[commandName];
      if (typeof value === "string" && value.length > 0) {
        setPrecomputedSubcommandHelpText(commandName, value);
        return value;
      }
    }
  } catch {
    // 回退到动态 help 渲染。
  }
  setPrecomputedSubcommandHelpText(commandName, null);
  return null;
}

export function outputPrecomputedRootHelpText(): boolean {
  const rootHelpText = loadPrecomputedHelpText("rootHelpText", precomputedRootHelpText, (value) => {
    precomputedRootHelpText = value;
  });
  if (!rootHelpText) {
    return false;
  }
  process.stdout.write(rootHelpText);
  return true;
}

export function outputPrecomputedBrowserHelpText(): boolean {
  const browserHelpText = loadPrecomputedHelpText(
    "browserHelpText",
    precomputedBrowserHelpText,
    (value) => {
      precomputedBrowserHelpText = value;
    },
  );
  if (!browserHelpText) {
    return false;
  }
  process.stdout.write(browserHelpText);
  return true;
}

export function outputPrecomputedSecretsHelpText(): boolean {
  const secretsHelpText = loadPrecomputedHelpText(
    "secretsHelpText",
    precomputedSecretsHelpText,
    (value) => {
      precomputedSecretsHelpText = value;
    },
  );
  if (!secretsHelpText) {
    return false;
  }
  process.stdout.write(secretsHelpText);
  return true;
}

export function outputPrecomputedNodesHelpText(): boolean {
  const nodesHelpText = loadPrecomputedHelpText(
    "nodesHelpText",
    precomputedNodesHelpText,
    (value) => {
      precomputedNodesHelpText = value;
    },
  );
  if (!nodesHelpText) {
    return false;
  }
  process.stdout.write(nodesHelpText);
  return true;
}

export function outputPrecomputedSubcommandHelpText(commandName: string): boolean {
  const helpText = loadPrecomputedSubcommandHelpText(commandName);
  if (!helpText) {
    return false;
  }
  process.stdout.write(helpText);
  return true;
}

function isPrecomputedSubcommandHelpName(
  commandName: string,
): commandName is PrecomputedSubcommandHelpName {
  return (
    commandName === "doctor" ||
    commandName === "gateway" ||
    commandName === "models" ||
    commandName === "plugins" ||
    commandName === "sessions" ||
    commandName === "tasks"
  );
}

function isSubcommandHelpTextRecord(
  value: unknown,
): value is Partial<Record<PrecomputedSubcommandHelpName, unknown>> {
  return typeof value === "object" && value !== null;
}

function setPrecomputedSubcommandHelpText(
  commandName: PrecomputedSubcommandHelpName,
  value: string | null,
): void {
  precomputedSubcommandHelpText = {
    ...precomputedSubcommandHelpText,
    [commandName]: value,
  };
}
