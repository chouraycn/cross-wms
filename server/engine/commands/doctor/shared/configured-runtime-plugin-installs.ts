// Doctor helpers for installing plugins required by configured agent runtimes.
// 移植自 openclaw/src/commands/doctor/shared/configured-runtime-plugin-installs.ts
//
// 降级说明：
//  - asOptionalRecord 来自 @openclaw/normalization-core/record-coerce
//    → cross-wms 已在 ../../../infra/record-coerce.ts 实现同源函数
//  - collectConfiguredAgentHarnessRuntimes / ConfiguredAgentHarnessRuntimeOptions
//    来自 ../../../agents/harness-runtimes.js → cross-wms 已有
//  - OpenClawConfig 来自 ../../../config/types.openclaw.js
//    → cross-wms 已在 ../../../infra/_runtime-stubs.ts 提供降级类型
//  - PluginPackageInstall 来自 ../../../plugins/manifest.js → cross-wms 已有
import { asOptionalRecord } from "../../../infra/record-coerce.js";
import {
  collectConfiguredAgentHarnessRuntimes,
  type ConfiguredAgentHarnessRuntimeOptions,
} from "../../../agents/harness-runtimes.js";
import type { OpenClawConfig } from "../../../infra/_runtime-stubs.js";
import type { PluginPackageInstall } from "../../../plugins/manifest.js";

type ConfiguredRuntimePluginInstallCandidate = {
  /** Runtime/plugin id used in config and plugin installation records. */
  pluginId: string;
  /** Human-readable plugin label for prompts and notes. */
  label: string;
  /** npm package spec for an official runtime plugin install. */
  npmSpec?: string;
  /** ClawHub install spec when the runtime plugin is sourced from ClawHub. */
  clawhubSpec?: string;
  /** True when the install source is trusted to link official runtime support. */
  trustedSourceLinkedOfficialInstall?: boolean;
  /** Default installer choice when multiple official sources are available. */
  defaultChoice?: PluginPackageInstall["defaultChoice"];
};

export const CONFIGURED_RUNTIME_PLUGIN_INSTALL_CANDIDATES: readonly ConfiguredRuntimePluginInstallCandidate[] =
  [
    {
      pluginId: "acpx",
      label: "ACPX Runtime",
      npmSpec: "@openclaw/acpx",
      trustedSourceLinkedOfficialInstall: true,
    },
    // Runtime-only configs do not have a provider/channel integration catalog entry.
    {
      pluginId: "codex",
      label: "Codex",
      npmSpec: "@openclaw/codex",
      trustedSourceLinkedOfficialInstall: true,
    },
  ];

/** Resolve the official install candidate for a configured runtime id. */
export function resolveConfiguredRuntimePluginInstallCandidate(
  runtimeId: string,
): ConfiguredRuntimePluginInstallCandidate | undefined {
  return CONFIGURED_RUNTIME_PLUGIN_INSTALL_CANDIDATES.find(
    (candidate) => candidate.pluginId === runtimeId,
  );
}

function acpxRuntimeIsConfigured(cfg: OpenClawConfig): boolean {
  const acp = asOptionalRecord(cfg.acp);
  const backend = typeof acp?.backend === "string" ? acp.backend.trim().toLowerCase() : "";
  return (
    (backend === "acpx" ||
      acp?.enabled === true ||
      asOptionalRecord(acp?.dispatch)?.enabled === true) &&
    (!backend || backend === "acpx")
  );
}

/** Collect runtime plugin ids implied by configured harness runtimes and ACPX settings. */
export function collectConfiguredRuntimePluginIds(
  cfg: OpenClawConfig,
  options?: ConfiguredAgentHarnessRuntimeOptions,
): string[] {
  const ids = new Set(collectConfiguredAgentHarnessRuntimes(cfg, options));
  if (acpxRuntimeIsConfigured(cfg)) {
    ids.add("acpx");
  }
  return [...ids].toSorted((left, right) => left.localeCompare(right));
}
