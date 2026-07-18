// 为 safe-bin 命令参数应用语义验证器
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.js";

type SafeBinSemanticValidationParams = {
  binName?: string;
  positional: readonly string[];
};

type SafeBinSemanticRule = {
  validate?: (params: SafeBinSemanticValidationParams) => boolean;
  configWarning?: string;
};

const JQ_ENV_FILTER_PATTERN = /(^|[^.$A-Za-z0-9_])env([^A-Za-z0-9_]|$)/;
const JQ_ENV_VARIABLE_PATTERN = /\$ENV\b/;
const ALWAYS_DENY_SAFE_BIN_SEMANTICS = () => false;

const UNSAFE_SAFE_BIN_WARNINGS = {
  awk: "awk-family 解释器可以执行命令、访问 ENVIRON 并写入文件，建议使用显式白名单条目或审批门控运行代替 safeBins。",
  jq: "jq 支持广泛的 jq 程序和内置函数（例如 `env`），建议使用显式白名单条目或审批门控运行代替 safeBins。",
  sed: "sed 脚本可以执行命令并写入文件，建议使用显式白名单条目或审批门控运行代替 safeBins。",
} as const;

const SAFE_BIN_SEMANTIC_RULES: Readonly<Record<string, SafeBinSemanticRule>> = {
  jq: {
    validate: ({ positional }) =>
      !positional.some(
        (token) => JQ_ENV_FILTER_PATTERN.test(token) || JQ_ENV_VARIABLE_PATTERN.test(token),
      ),
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.jq,
  },
  awk: {
    validate: ALWAYS_DENY_SAFE_BIN_SEMANTICS,
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.awk,
  },
  gawk: {
    validate: ALWAYS_DENY_SAFE_BIN_SEMANTICS,
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.awk,
  },
  mawk: {
    validate: ALWAYS_DENY_SAFE_BIN_SEMANTICS,
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.awk,
  },
  nawk: {
    validate: ALWAYS_DENY_SAFE_BIN_SEMANTICS,
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.awk,
  },
  sed: {
    validate: ALWAYS_DENY_SAFE_BIN_SEMANTICS,
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.sed,
  },
  gsed: {
    validate: ALWAYS_DENY_SAFE_BIN_SEMANTICS,
    configWarning: UNSAFE_SAFE_BIN_WARNINGS.sed,
  },
};

/** 将配置的 safe-bin 条目规范化为不带 Windows 后缀的可执行 basename */
export function normalizeSafeBinName(raw: string): string {
  const trimmed = normalizeLowercaseStringOrEmpty(raw);
  if (!trimmed) {
    return "";
  }
  const tail = trimmed.split(/[\\/]/).at(-1);
  const normalized = tail ?? trimmed;
  return normalized.replace(/\.(?:exe|cmd|bat|com)$/i, "");
}

function getSafeBinSemanticRule(binName?: string): SafeBinSemanticRule | undefined {
  const normalized = typeof binName === "string" ? normalizeSafeBinName(binName) : "";
  return normalized ? SAFE_BIN_SEMANTIC_RULES[normalized] : undefined;
}

/** 为作为广泛 safeBins 有风险的可执行文件应用命令特定语义门控 */
export function validateSafeBinSemantics(params: SafeBinSemanticValidationParams): boolean {
  return getSafeBinSemanticRule(params.binName)?.validate?.(params) ?? true;
}

/** 列出需要操作员警告的已配置 safeBins，因为它们的语义过于宽泛 */
export function listRiskyConfiguredSafeBins(entries: Iterable<string>): Array<{
  bin: string;
  warning: string;
}> {
  const hits = new Map<string, string>();
  for (const entry of entries) {
    const normalized = normalizeSafeBinName(entry);
    if (!normalized || hits.has(normalized)) {
      continue;
    }
    const warning = getSafeBinSemanticRule(normalized)?.configWarning;
    if (!warning) {
      continue;
    }
    hits.set(normalized, warning);
  }
  return Array.from(hits.entries())
    .map(([bin, warning]) => ({ bin, warning }))
    .toSorted((a, b) => a.bin.localeCompare(b.bin));
}
