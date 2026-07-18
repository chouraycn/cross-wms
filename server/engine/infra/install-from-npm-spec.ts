// 移植自 openclaw/src/infra/install-from-npm-spec.ts（降级实现）
// 从 npm spec 安装。
import { resolveNpmPackageInstallDir } from "./npm-managed-root.js";
import { parseRegistryNpmSpec, type ParsedRegistryNpmSpec } from "./npm-registry-spec.js";

export type InstallFromNpmSpecOptions = {
  spec: string;
  env?: NodeJS.ProcessEnv;
};

export type InstallFromNpmSpecResult = {
  ok: boolean;
  installPath?: string;
  spec?: ParsedRegistryNpmSpec;
  reason?: string;
};

/**
 * 从 npm spec 安装包。
 * 降级实现：不执行实际安装，返回失败。
 */
export async function installFromNpmSpec(_options: InstallFromNpmSpecOptions): Promise<InstallFromNpmSpecResult> {
  return {
    ok: false,
    reason: "installFromNpmSpec stub: npm install not ported",
  };
}

/** 解析 npm spec */
export function resolveNpmSpec(spec: string): ParsedRegistryNpmSpec | null {
  return parseRegistryNpmSpec(spec);
}

/** 解析安装目标目录 */
export function resolveInstallTargetDir(params: {
  spec: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const parsed = parseRegistryNpmSpec(params.spec);
  const packageName = parsed?.name ?? params.spec;
  return resolveNpmPackageInstallDir({ packageName, env: params.env });
}

export type { ParsedRegistryNpmSpec };
