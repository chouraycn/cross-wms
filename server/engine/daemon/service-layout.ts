/**
 * 服务布局摘要 - 汇总已安装服务命令路径和包布局。
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayServiceCommandConfig } from "./service-types.js";
import { formatExecStart, resolveGatewayEntrypoint, resolvePackageRoot } from "./gateway-entrypoint.js";

export type GatewayServiceLayoutSummary = {
  execStart: string;
  sourcePath?: string;
  sourcePathReal?: string;
  sourceScope?: "user" | "system";
  entrypoint?: string;
  entrypointReal?: string;
  packageRoot?: string;
  packageRootReal?: string;
  packageVersion?: string;
  entrypointSourceCheckout?: boolean;
};

function resolveSystemdScopeFromServicePath(
  sourcePath: string | undefined,
): "user" | "system" | undefined {
  const normalized = sourcePath?.replaceAll("\\", "/") ?? "";
  if (!normalized.endsWith(".service")) {
    return undefined;
  }
  if (
    normalized.startsWith("/etc/systemd/") ||
    normalized.startsWith("/usr/lib/systemd/") ||
    normalized.startsWith("/lib/systemd/")
  ) {
    return "system";
  }
  return "user";
}

async function tryRealpath(value: string | undefined): Promise<string | undefined> {
  if (!value) {
    return undefined;
  }
  const resolved = path.resolve(value);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

async function isSourceCheckoutRoot(candidate: string): Promise<boolean> {
  try {
    await fs.access(path.join(candidate, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion(packageRoot: string): Promise<string | undefined> {
  try {
    const packageJsonPath = path.join(packageRoot, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(content);
    return pkg.version;
  } catch {
    return undefined;
  }
}

export async function summarizeGatewayServiceLayout(
  command: GatewayServiceCommandConfig | null,
): Promise<GatewayServiceLayoutSummary | undefined> {
  if (!command) {
    return undefined;
  }
  const sourcePath = command.sourcePath?.trim() || undefined;
  const entrypoint = resolveGatewayEntrypoint(command.programArguments);
  const [sourcePathReal, entrypointReal] = await Promise.all([
    tryRealpath(sourcePath),
    tryRealpath(entrypoint),
  ]);
  const packageRoot = entrypointReal ? resolvePackageRoot(entrypointReal) : undefined;
  const packageRootReal = await tryRealpath(packageRoot);
  const packageVersion = packageRoot ? await readPackageVersion(packageRoot) : undefined;
  const entrypointSourceCheckout = packageRootReal
    ? await isSourceCheckoutRoot(packageRootReal)
    : undefined;

  return {
    execStart: formatExecStart(command.programArguments),
    ...(sourcePath ? { sourcePath } : {}),
    ...(sourcePathReal ? { sourcePathReal } : {}),
    ...(sourcePath ? { sourceScope: resolveSystemdScopeFromServicePath(sourcePath) } : {}),
    ...(entrypoint ? { entrypoint } : {}),
    ...(entrypointReal ? { entrypointReal } : {}),
    ...(packageRoot ? { packageRoot } : {}),
    ...(packageRootReal ? { packageRootReal } : {}),
    ...(packageVersion ? { packageVersion } : {}),
    ...(entrypointSourceCheckout !== undefined ? { entrypointSourceCheckout } : {}),
  };
}
