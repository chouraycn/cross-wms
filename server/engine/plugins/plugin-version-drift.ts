/**
 * Detects plugin version drift between config, manifests, and installs.
 * 移植自 openclaw/src/plugins/plugin-version-drift.ts。
 * 降级策略：
 *  - OpenClawConfig / PluginInstallRecord 降级为本地宽松类型。
 *  - parseClawHubPluginSpec / parseRegistryNpmSpec 降级为返回 undefined（未移植）。
 *  - normalizePluginsConfig / resolveEffectiveEnableState 降级为本地实现，与
 *    installed-plugin-index.ts 内联实现一致。
 *  - resolveTrustedSourceLinkedOfficialClawHubInstall /
 *    resolveTrustedSourceLinkedOfficialNpmSpec 降级为返回 undefined（未移植）。
 */

/** OpenClaw 配置的宽松占位类型。 */
type OpenClawConfig = {
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** 插件安装记录源类型。 */
type PluginInstallRecordSource = "bundled" | "npm" | "clawhub" | "git" | "local";

/** 插件安装记录（降级占位）。 */
type PluginInstallRecord = {
  source: PluginInstallRecordSource;
  version?: string;
  resolvedVersion?: string;
  resolvedName?: string;
  spec?: string;
};

export type PluginVersionDriftEntry = {
  pluginId: string;
  installedVersion: string;
  gatewayVersion: string;
  source: PluginInstallRecord["source"];
  packageName?: string;
  spec?: string;
};

export type PluginVersionDriftReport = {
  gatewayVersion: string;
  drifts: PluginVersionDriftEntry[];
};

/** 占位：解析 clawhub 插件 spec（模块未移植）。 */
function parseClawHubPluginSpec(_spec: string): { version?: string } | undefined {
  return undefined;
}

/** 占位：解析 npm registry spec（模块未移植）。 */
function parseRegistryNpmSpec(_spec: string):
  | { selectorKind?: "exact-version" | "range" | "tag"; name?: string }
  | undefined {
  return undefined;
}

/** 占位：解析可信官方 clawhub 安装记录（模块未移植）。 */
function resolveTrustedSourceLinkedOfficialClawHubInstall(_params: {
  pluginId: string;
  record: PluginInstallRecord;
}):
  | { clawhubSpec?: string; npmSpec?: string }
  | undefined {
  return undefined;
}

/** 占位：解析可信官方 npm spec（模块未移植）。 */
function resolveTrustedSourceLinkedOfficialNpmSpec(_params: {
  pluginId: string;
  record: PluginInstallRecord;
}): string | undefined {
  return undefined;
}

function resolveExactNpmPinPackageName(entry: PluginVersionDriftEntry): string | undefined {
  if (entry.source !== "npm" || !entry.spec) {
    return undefined;
  }
  const parsed = parseRegistryNpmSpec(entry.spec);
  if (parsed?.selectorKind !== "exact-version") {
    return undefined;
  }
  return parsed.name;
}

/** Exact npm pins need a package@version target; id-only updates preserve the old pin. */
export function resolvePluginVersionDriftUpdateCommand(entry: PluginVersionDriftEntry): string {
  const exactNpmPackageName = resolveExactNpmPinPackageName(entry);
  if (exactNpmPackageName) {
    const exactNpmTarget = `${exactNpmPackageName}@${entry.gatewayVersion}`;
    if (parseRegistryNpmSpec(exactNpmTarget)?.selectorKind === "exact-version") {
      return `openclaw plugins update ${exactNpmTarget}`;
    }
  }
  return `openclaw plugins update ${entry.pluginId}`;
}

function normalizeVersion(value: string): string {
  return value.replace(/-\d+$/, "");
}

function isPluginEnabled(config: OpenClawConfig | undefined, pluginId: string): boolean {
  void config;
  void pluginId;
  // 降级：默认所有插件启用，与 installed-plugin-index.ts 内联实现一致。
  return true;
}

function shouldCompareOfficialInstallToGateway(params: {
  pluginId: string;
  record: PluginInstallRecord;
}): boolean {
  const officialNpmSpec = resolveTrustedSourceLinkedOfficialNpmSpec(params);
  if (officialNpmSpec) {
    return parseRegistryNpmSpec(officialNpmSpec)?.selectorKind !== "exact-version";
  }
  const officialClawHubInstall = resolveTrustedSourceLinkedOfficialClawHubInstall(params);
  if (officialClawHubInstall) {
    if (officialClawHubInstall.clawhubSpec) {
      return !parseClawHubPluginSpec(officialClawHubInstall.clawhubSpec)?.version;
    }
    return (
      parseRegistryNpmSpec(officialClawHubInstall.npmSpec ?? "")?.selectorKind !== "exact-version"
    );
  }
  return false;
}

/**
 * Compare active official external plugin installs against the running gateway
 * version and return any mismatches.
 */
export function detectPluginVersionDrift(params: {
  gatewayVersion: string;
  installRecords: Record<string, PluginInstallRecord>;
  config?: OpenClawConfig;
}): PluginVersionDriftReport {
  const { gatewayVersion, installRecords, config } = params;
  const normalizedGateway = normalizeVersion(gatewayVersion);
  const drifts: PluginVersionDriftEntry[] = [];

  for (const [pluginId, record] of Object.entries(installRecords)) {
    if (!record) {
      continue;
    }
    if (!isPluginEnabled(config, pluginId)) {
      continue;
    }
    if (
      !shouldCompareOfficialInstallToGateway({
        pluginId,
        record,
      })
    ) {
      continue;
    }
    const installedVersion = record.resolvedVersion ?? record.version;
    if (!installedVersion) {
      continue;
    }
    if (normalizeVersion(installedVersion) === normalizedGateway) {
      continue;
    }
    drifts.push({
      pluginId,
      installedVersion,
      gatewayVersion,
      source: record.source,
      ...(record.resolvedName ? { packageName: record.resolvedName } : {}),
      ...(record.spec ? { spec: record.spec } : {}),
    });
  }

  drifts.sort((a, b) => a.pluginId.localeCompare(b.pluginId));

  return {
    gatewayVersion,
    drifts,
  };
}
