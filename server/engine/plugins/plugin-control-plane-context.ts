/**
 * Tracks control-plane plugin metadata context during registry and status operations.
 * 移植自 openclaw/src/plugins/plugin-control-plane-context.ts。
 * 降级策略：
 *  - hashJson / resolveInstalledPluginIndexPolicyHash 直接复用已移植模块。
 *  - manifest-registry-installed.ts 未移植，resolveInstalledManifestRegistryIndexFingerprint
 *    降级为返回 undefined。
 *  - roots.ts 的 resolvePluginCacheInputs / PluginSourceRoots 在 cross-wms 未导出该 API，
 *    降级为本地占位结构。
 *  - OpenClawConfig 降级为宽松 unknown 占位。
 */
import { hashJson } from "./installed-plugin-index-hash.js";
import { resolveInstalledPluginIndexPolicyHash } from "./installed-plugin-index-policy.js";
import type { InstalledPluginIndex } from "./installed-plugin-index-types.js";

/** OpenClaw 配置的宽松占位类型。 */
type OpenClawConfig = {
  plugins?: {
    load?: { paths?: readonly string[] };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** 插件源根目录集合（本地降级占位）。 */
export type PluginSourceRoots = {
  global?: string;
  workspace?: string;
  stock?: string;
};

/** 插件发现上下文。 */
export type PluginDiscoveryContext = {
  roots: PluginSourceRoots;
  loadPaths: readonly string[];
};

/** 插件控制面指纹上下文。 */
export type PluginControlPlaneContext = {
  discovery: PluginDiscoveryContext;
  policyFingerprint: string;
  inventoryFingerprint?: string;
  activationFingerprint?: string;
};

/** 解析插件发现上下文的参数。 */
export type ResolvePluginDiscoveryContextParams = {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  loadPaths?: readonly string[];
};

/** 解析插件控制面上下文的参数。 */
export type ResolvePluginControlPlaneContextParams = ResolvePluginDiscoveryContextParams & {
  activationFingerprint?: string;
  index?: InstalledPluginIndex;
  inventoryFingerprint?: string;
  policyHash?: string;
};

/** 占位：解析已安装 manifest 注册表的索引指纹（模块未移植）。 */
function resolveInstalledManifestRegistryIndexFingerprint(
  _index: InstalledPluginIndex,
): string | undefined {
  return undefined;
}

function resolveConfiguredPluginLoadPaths(
  config: OpenClawConfig | undefined,
): readonly string[] | undefined {
  const paths = config?.plugins?.load?.paths;
  return Array.isArray(paths) ? paths : undefined;
}

/** 占位：解析插件缓存输入（cross-wms roots.ts 仅维护 PluginRoot 列表，无对应 API）。 */
function resolvePluginCacheInputs(params: {
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  loadPaths?: readonly string[];
}): { roots: PluginSourceRoots; loadPaths: readonly string[] } {
  void params;
  return {
    roots: {},
    loadPaths: [],
  };
}

/** Resolves plugin discovery roots and load paths for cache/fingerprint callers. */
export function resolvePluginDiscoveryContext(
  params: ResolvePluginDiscoveryContextParams = {},
): PluginDiscoveryContext {
  return resolvePluginCacheInputs({
    env: params.env ?? process.env,
    workspaceDir: params.workspaceDir,
    loadPaths: [...(params.loadPaths ?? resolveConfiguredPluginLoadPaths(params.config) ?? [])],
  });
}

/** Resolves a stable fingerprint for plugin discovery inputs. */
export function resolvePluginDiscoveryFingerprint(
  params: ResolvePluginDiscoveryContextParams = {},
): string {
  return fingerprintPluginDiscoveryContext(resolvePluginDiscoveryContext(params));
}

/** Hashes an already resolved plugin discovery context. */
export function fingerprintPluginDiscoveryContext(context: PluginDiscoveryContext): string {
  return hashJson(context);
}

/** Resolves all inputs that determine plugin control-plane activation state. */
export function resolvePluginControlPlaneContext(
  params: ResolvePluginControlPlaneContextParams = {},
): PluginControlPlaneContext {
  const inventoryFingerprint =
    params.inventoryFingerprint ??
    (params.index ? resolveInstalledManifestRegistryIndexFingerprint(params.index) : undefined);
  return {
    discovery: resolvePluginDiscoveryContext(params),
    policyFingerprint: params.policyHash ?? resolveInstalledPluginIndexPolicyHash(params.config as never),
    ...(inventoryFingerprint ? { inventoryFingerprint } : {}),
    ...(params.activationFingerprint
      ? { activationFingerprint: params.activationFingerprint }
      : {}),
  };
}

/** Resolves a stable fingerprint for plugin control-plane activation state. */
export function resolvePluginControlPlaneFingerprint(
  params: ResolvePluginControlPlaneContextParams = {},
): string {
  return fingerprintPluginControlPlaneContext(resolvePluginControlPlaneContext(params));
}

function fingerprintPluginControlPlaneContext(context: PluginControlPlaneContext): string {
  return hashJson(context);
}
