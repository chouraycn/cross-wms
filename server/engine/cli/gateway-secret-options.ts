// Gateway auth option parser: supports direct values and file-backed secrets with CLI warnings.
// 移植自 openclaw/src/cli/gateway-secret-options.ts。
//
// 降级策略：
//  - 原模块依赖 @openclaw/normalization-core/string-coerce 的 normalizeOptionalString。
//    降级内联实现。
//  - 原模块依赖 ../acp/secret-file.js 的 readSecretFromFile。降级内联实现。
//  - 原模块依赖 ../runtime.js 的 defaultRuntime。降级内联实现。

// ===== 内联 normalizeOptionalString stub =====
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
// ===== stub 结束 =====

// ===== 内联 readSecretFromFile stub =====
function readSecretFromFile(filePath: string, label: string): string {
  // 降级：openclaw 的 acp/secret-file.js 未移植；直接抛出错误。
  throw new Error(`Reading ${label} from file is not supported in stub mode: ${filePath}`);
}
// ===== stub 结束 =====

// ===== 内联 defaultRuntime stub =====
const defaultRuntime = {
  error(message: string) {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.error(message);
  },
};
// ===== defaultRuntime 结束 =====

function resolveGatewaySecretOption(params: {
  direct?: unknown;
  file?: unknown;
  directFlag: string;
  fileFlag: string;
  label: string;
}): string | undefined {
  const direct = normalizeOptionalString(params.direct);
  const file = normalizeOptionalString(params.file);
  if (direct && file) {
    throw new Error(`Use either ${params.directFlag} or ${params.fileFlag} for ${params.label}.`);
  }
  if (file) {
    return readSecretFromFile(file, params.label);
  }
  return direct || undefined;
}

function warnGatewaySecretCliFlag(flag: "--token" | "--password"): void {
  defaultRuntime.error(
    `Warning: ${flag} can be exposed via process listings. Prefer ${flag}-file or environment variables.`,
  );
}

/** Normalize gateway token/password options and reject ambiguous direct+file pairs. */
export function resolveGatewayAuthOptions(opts: {
  token?: unknown;
  tokenFile?: unknown;
  password?: unknown;
  passwordFile?: unknown;
}): {
  gatewayToken?: string;
  gatewayPassword?: string;
} {
  const gatewayToken = resolveGatewaySecretOption({
    direct: opts.token,
    file: opts.tokenFile,
    directFlag: "--token",
    fileFlag: "--token-file",
    label: "Gateway token",
  });
  const gatewayPassword = resolveGatewaySecretOption({
    direct: opts.password,
    file: opts.passwordFile,
    directFlag: "--password",
    fileFlag: "--password-file",
    label: "Gateway password",
  });
  if (opts.token) {
    warnGatewaySecretCliFlag("--token");
  }
  if (opts.password) {
    warnGatewaySecretCliFlag("--password");
  }
  return { gatewayToken, gatewayPassword };
}
