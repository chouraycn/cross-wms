// CLI 模块 barrel — 汇总现有模块与 openclaw 低依赖移植模块的导出。
//
// 现有模块保持原有导出；移植模块从 openclaw/src/cli/ 迁入，依赖 @openclaw/*
// 外部包的模块已降级为本地实现，详见各文件顶部注释。

// ===================== 现有模块 =====================

// cli-name.ts
export { resolveCliName, replaceCliName } from './cli-name.js';

// command-format.ts
export { formatCliCommand } from './command-format.js';

// config-recovery-hints.ts
export {
  formatInvalidConfigRecoveryHint,
  formatPluginPackagingRuntimeOutputRecoveryHint,
} from './config-recovery-hints.js';

// parse-bytes.ts
export { parseByteSize } from './parse-bytes.js';

// parse-duration.ts
export { parseDurationMs } from './parse-duration.js';
export type { DurationMsParseOptions } from './parse-duration.js';

// profile-utils.ts
export { isValidProfileName, normalizeProfileName } from './profile-utils.js';

// quote-cli-arg.ts
export { quoteCliArg } from './quote-cli-arg.js';

// ===================== openclaw 移植模块（低依赖） =====================

// error-format.ts
export {
  formatPortRangeHint,
  formatInvalidPortOption,
  formatInvalidConfigPort,
  formatUnknownChannelMessage,
  formatUnsupportedChannelActionMessage,
  formatStrictJsonParseFailure,
  formatGatewayCommandFailure,
  formatLookupMiss,
  formatMissingPluginMessage,
} from './error-format.js';

// gateway-port-option.ts
export { parseGatewayPortOption } from './gateway-port-option.js';

// gateway-rpc.types.ts
export type { GatewayRpcOpts } from './gateway-rpc.types.js';

// install-spec.ts
export { looksLikeLocalInstallSpec } from './install-spec.js';

// parse-timeout.ts
export { parseTimeoutMs, parseTimeoutMsWithFallback } from './parse-timeout.js';

// tagline.ts
export { pickTagline, DEFAULT_TAGLINE } from './tagline.js';
export type { TaglineMode, TaglineOptions } from './tagline.js';

// wait.ts
export { waitForever } from './wait.js';

// windows-argv.ts
export { normalizeWindowsArgv } from './windows-argv.js';

// startup-trace.ts
export { createGatewayStartupTrace } from './startup-trace.js';
export type { GatewayStartupTraceSource } from './startup-trace.js';

// command-path-matches.ts
export { matchesCommandPath } from './command-path-matches.js';

// command-options.ts
export { hasExplicitOptions, inheritOptionFromParent } from './command-options.js';

// requirements-test-fixtures.ts
export { createEmptyInstallChecks } from './requirements-test-fixtures.js';

// cli-root-options.ts（本地 stub，替代未移植的 infra/cli-root-options.js）
export { FLAG_TERMINATOR, isValueToken, consumeRootOptionToken } from './cli-root-options.js';

// inline-option-token.ts（本地 stub，替代未移植的 infra/inline-option-token.js）
export { parseInlineOptionToken } from './inline-option-token.js';
export type { InlineOptionToken } from './inline-option-token.js';

// root-option-forward.ts
export { forwardConsumedCliRootOption } from './root-option-forward.js';

// root-option-scan.ts
export { scanCliRootOptions } from './root-option-scan.js';

// root-option-value.ts
export { takeCliRootOptionValue } from './root-option-value.js';

// daemon-cli-compat.ts
export {
  LEGACY_DAEMON_CLI_EXPORTS,
  resolveLegacyDaemonCliRegisterAccessor,
  resolveLegacyDaemonCliRunnerAccessors,
  resolveLegacyDaemonCliAccessors,
  type LegacyDaemonCliAccessors,
} from './daemon-cli-compat.js';

// startup-metadata.ts
export { readCliStartupMetadata } from './startup-metadata.js';

// channel-options.ts
export { resolveCliChannelOptions, formatCliChannelOptions } from './channel-options.js';

// cli-utils.ts
export {
  withManager,
  runCommandWithRuntime,
  resolveOptionFromCommand,
  formatErrorMessage,
} from './cli-utils.js';

// ===================== openclaw 移植模块（中等依赖） =====================

// argv.ts（低级 argv 辅助）
export {
  hasHelpOrVersion,
  isHelpOrVersionInvocation,
  hasFlag,
  hasRootVersionAlias,
  isRootVersionInvocation,
  isRootHelpInvocation,
  normalizeGeneratedHelpCommandArgv,
  normalizeRootHelpTargetArgv,
  normalizeRootNoColorArgv,
  normalizeRootLogLevelArgv,
  getFlagValue,
  getVerboseFlag,
  getPositiveIntFlagValue,
  getCommandPathWithRootOptions,
  getPrimaryCommand,
  getCommandPositionalsWithRootOptions,
  buildParseArgv,
  shouldMigrateStateFromPath,
} from './argv.js';
export type {
  NormalizeRootNoColorArgvOptions,
  NormalizeRootLogLevelArgvOptions,
} from './argv.js';

// argv-invocation.ts
export { resolveCliArgvInvocation } from './argv-invocation.js';
export type { CliArgvInvocation } from './argv-invocation.js';

// container-target.ts
export {
  parseCliContainerArgs,
  resolveCliContainerTarget,
  maybeRunCliInContainer,
} from './container-target.js';

// respawn-policy.ts
export {
  isInteractiveTtyCommandArgv,
  isTerminalInteractiveRespawnArgv,
  shouldSkipRespawnForArgv,
  shouldSkipStartupEnvironmentRespawnForArgv,
} from './respawn-policy.js';

// prompt.ts
export {
  promptYesNo,
  setVerboseFlag,
  setYesFlag,
  isVerbose,
  isYes,
  PromptInputClosedError,
} from './prompt.js';

// help-format.ts
export { formatHelpExamples } from './help-format.js';
export type { HelpExample } from './help-format.js';

// log-level-option.ts
export {
  parseCliLogLevelOption,
  tryParseLogLevel,
  CLI_LOG_LEVEL_VALUES,
} from './log-level-option.js';
export type { LogLevel } from './log-level-option.js';

// dotenv.ts
export { loadCliDotEnv } from './dotenv.js';

// ===================== openclaw 移植模块（plugins-* 中依赖聚类） =====================
// 以下模块从 openclaw/src/cli/ 移植，包含 plugins 子命令注册、运行时与命令实现。
// 依赖 @openclaw/* 外部包与未移植的 openclaw 内部运行时模块的部分已降级为 stub，
// 详见各文件顶部注释。

// plugins-cli.ts（Commander 注册入口）
export { registerPluginsCli } from './plugins-cli.js';
export type {
  PluginUpdateOptions,
  PluginMarketplaceListOptions,
  PluginSearchOptions,
  PluginUninstallOptions,
  PluginRegistryOptions,
  PluginAuthoringBuildOptions,
  PluginAuthoringValidateOptions,
  PluginAuthoringInitOptions,
} from './plugins-cli.js';

// plugins-cli.runtime.ts（运行时入口）
export {
  runPluginsEnableCommand,
  runPluginsDisableCommand,
  runPluginsInstallAction,
  runPluginsRegistryCommand,
  runPluginsDoctorCommand,
  runPluginMarketplaceListCommand,
} from './plugins-cli.runtime.js';

// plugins-list-command.ts
export { runPluginsListCommand } from './plugins-list-command.js';
export type { PluginsListOptions } from './plugins-list-command.js';

// plugins-search-command.ts
export { runPluginsSearchCommand } from './plugins-search-command.js';
export type {
  PluginsSearchOptions,
  ClawHubPackageFamily,
  ClawHubPackageSearchResult,
} from './plugins-search-command.js';

// plugins-inspect-command.ts
export { runPluginsInspectCommand } from './plugins-inspect-command.js';
export type { PluginInspectOptions } from './plugins-inspect-command.js';

// plugins-install-command.ts
export {
  loadConfigForInstall,
  runPluginInstallCommand,
} from './plugins-install-command.js';

// plugins-uninstall-command.ts
export { runPluginUninstallCommand } from './plugins-uninstall-command.js';

// plugins-update-command.ts
export { runPluginUpdateCommand } from './plugins-update-command.js';

// plugins-authoring-command.ts
export {
  runPluginsBuildCommand,
  runPluginsValidateCommand,
  runPluginsInitCommand,
  loadToolPlugin,
  buildToolPluginManifest,
  buildToolPluginPackageManifest,
  validateToolPluginProject,
} from './plugins-authoring-command.js';
export type {
  PluginsBuildOptions,
  PluginsValidateOptions,
  PluginsInitOptions,
} from './plugins-authoring-command.js';

// plugins-location-bridges.ts
export {
  listPersistedBundledPluginLocationBridges,
  listPersistedBundledPluginRecoveryLocations,
} from './plugins-location-bridges.js';
export type {
  ExternalizedBundledPluginBridge,
  PersistedBundledPluginRecoveryLocation,
} from './plugins-location-bridges.js';

// ===================== openclaw 移植模块（program/plugin/run-main 聚类） =====================
// 以下模块从 openclaw/src/cli/ 移植，包含 program barrel、plugin-registry loader、
// plugin install plan/policy、run-main 入口编排等。
// 依赖未移植子系统（program/build-program、plugins/runtime/runtime-registry-loader、
// config/types.openclaw、infra/npm-registry-spec、plugins/bundled-sources 等）的部分
// 已降级为 stub，详见各文件顶部注释。

// program.ts（barrel：forceFreePort + buildProgram stub）
export { forceFreePort } from './program.js';
export { buildProgram } from './program.js';

// program.nodes-test-helpers.ts（测试固件，无外部依赖）
export { IOS_NODE, createIosNodeListResponse } from './program.nodes-test-helpers.js';

// plugin-registry.ts（barrel：ensurePluginRegistryLoaded stub）
export {
  ensurePluginRegistryLoaded,
  testing as pluginRegistryTesting,
} from './plugin-registry.js';
export type { PluginRegistryScope } from './plugin-registry.js';

// plugin-registry-loader.ts（ensureCliPluginRegistryLoaded 降级 stub）
export { ensureCliPluginRegistryLoaded } from './plugin-registry-loader.js';

// plugin-install-config-policy.ts（插件安装预动作策略降级 stub）
export {
  resolvePluginInstallRequestContext,
  resolvePluginInstallPreactionRequest,
  resolvePluginInstallInvalidConfigPolicy,
} from './plugin-install-config-policy.js';
export type { PluginInstallRequestContext } from './plugin-install-config-policy.js';

// plugin-install-plan.ts（插件安装计划助手，依赖回调，保持原始逻辑）
export {
  resolveBundledInstallPlanForCatalogEntry,
  resolveBundledInstallPlanBeforeNpm,
  resolveOfficialExternalInstallPlanBeforeNpm,
  resolveOfficialExternalNpmPackageTrust,
  resolveBundledInstallPlanForNpmFailure,
} from './plugin-install-plan.js';
export type { BundledPluginSource } from './plugin-install-plan.js';

// run-main.ts（主 CLI 入口编排降级 stub）
export {
  resolvePrecomputedSubcommandHelpFastPath as resolvePrecomputedSubcommandHelpFastPathFromRunMain,
  rewriteUpdateFlagArgv as rewriteUpdateFlagArgvFromRunMain,
  shouldEnsureCliPath as shouldEnsureCliPathFromRunMain,
  shouldStartCrestodianForBareRoot as shouldStartCrestodianForBareRootFromRunMain,
  shouldStartCrestodianForModernOnboard as shouldStartCrestodianForModernOnboardFromRunMain,
  shouldStartProxyForCli as shouldStartProxyForCliFromRunMain,
  shouldUseBrowserHelpFastPath as shouldUseBrowserHelpFastPathFromRunMain,
  shouldUseNodesHelpFastPath as shouldUseNodesHelpFastPathFromRunMain,
  shouldUseRootHelpFastPath as shouldUseRootHelpFastPathFromRunMain,
  shouldUseSecretsHelpFastPath as shouldUseSecretsHelpFastPathFromRunMain,
  shouldUseSetupOnboardConfigureHelpFastPath as shouldUseSetupOnboardConfigureHelpFastPathFromRunMain,
  resolveMissingPluginCommandMessage as resolveMissingPluginCommandMessageFromRunMain,
  isGatewayRunFastPathArgv,
  shouldStartOnboardingForFreshInstall,
  runCli,
} from './run-main.js';
