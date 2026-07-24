/**
 * 钩子系统 barrel 导出
 *
 * 统一导出 cdf-know 钩子系统的全部模块，对齐 openclaw/src/hooks 架构：
 *   types → policy → workspace → loader → hooks → install → update
 *
 * 用法：
 *   import { runHooks, createHookEvent, discoverWorkspaceHooks } from './hooks/index.js';
 */

// 类型定义
export type {
  HookSource,
  HookInstallSpec,
  HookMetadata,
  HookInvocationPolicy,
  ParsedHookFrontmatter,
  Hook,
  HookEntry,
  HookConfig,
  HookEligibilityContext,
  HookPolicy,
  HookEventType,
  HookEvent,
  HookHandler,
  HookModifier,
  InternalHookEventType,
  InternalHookEvent,
  InternalHookHandler,
  AgentBootstrapHookContext,
  AgentBootstrapHookEvent,
  GatewayStartupHookContext,
  GatewayStartupHookEvent,
  MessageReceivedHookContext,
  MessageReceivedHookEvent,
  MessageSentHookContext,
  MessageSentHookEvent,
  MessageTranscribedHookContext,
  MessageTranscribedHookEvent,
  MessagePreprocessedHookContext,
  MessagePreprocessedHookEvent,
  SessionPatchHookContext,
  SessionPatchHookEvent,
  ToolCallHookContext,
  ToolCallHookEvent,
  ToolResultHookContext,
  ToolResultHookEvent,
  FireAndForgetBoundedHookOptions,
  HookStatusConfigCheck,
  HookInstallOption,
  HookStatusEntry,
  HookStatusReport,
  MailProviderType,
  MailWatcherState,
  MailWatcherErrorType,
  MailWatcherError,
  MailWatcherStatus,
} from './types.js';

// 策略与优先级合并
export {
  HOOK_SOURCE_PRIORITIES,
  isHookEnabledByDefault,
  canHookOverride,
  resolveHookConfig,
  resolveHookEnableState,
  resolveHookEntries,
} from './policy.js';
export type { HookEnableStateReason } from './policy.js';

// 工作区钩子发现
export {
  discoverWorkspaceHooks,
  loadHookEntriesFromDir,
  parseHookFrontmatter,
  resolveHookMetadata,
  resolveHookInvocationPolicy,
  isPathInsideWithRealpath,
  openRootFileSync,
} from './workspace.js';
export type { HookWorkspaceConfig } from './workspace.js';

// 动态加载器
export {
  loadHookHandler,
  loadLegacyHookHandler,
  buildImportUrl,
  resolveExistingRealpath,
  resetHookRegistrations,
  loadedHookRegistrations,
  registerBuiltinHooks,
} from './loader.js';
export type { LoadedHookRegistration } from './loader.js';

// 公共 API 门面
export {
  createHookEvent,
  isAgentBootstrapEvent,
  hasHookListeners,
  runHooks,
  runHooksAround,
} from './hooks.js';

// 安装管理
export {
  installHook,
  uninstallHook,
  updateHook,
  resolveSafeInstallDir,
  dirExistsSync,
} from './install.js';
export type { InstallHookResult, InstallHookOptions } from './install.js';

// 更新
export {
  checkHookUpdate,
  performHookUpdate,
  compareVersions,
  readInstalledPackageVersion,
} from './update.js';
export type { HookUpdateStatus, HookUpdateOutcome } from './update.js';

// 内置钩子
export {
  commandLoggerHook,
  commandLoggerBootstrapHook,
  commandLoggerNewHook,
  commandLoggerCompleteHook,
  sessionMemoryHook,
  sessionMemoryCommandHook,
  sessionMemoryMessageHook,
  getSessionEntry,
  listActiveSessions,
  getSessionCount,
  cleanupInactiveSessions,
  getSessionMemoryConfig,
  startAutoSaveTimer,
  stopAutoSaveTimer,
  triggerSessionMemorySave,
} from './builtin/index.js';

// Frontmatter 解析
export {
  parseFrontmatter,
  extractBody,
  serializeFrontmatter,
} from './frontmatter.js';
export type { HookFrontmatter } from './frontmatter.js';

// 模块加载器
export {
  ModuleLoader,
  defaultModuleLoader,
} from './module-loader.js';
export type { ModuleLoaderOptions } from './module-loader.js';

// 内部钩子管理
export {
  registerInternalHook,
  registerInternalModifier,
  unregisterInternalHook,
  unregisterInternalModifier,
  clearInternalHooks,
  runInternalHooks,
  runInternalModifiers,
  triggerInternalHook,
  setInternalHooksEnabled,
  areInternalHooksEnabled,
  getRegisteredEventKeys,
  hasInternalHookListeners,
  createInternalHookEvent,
  isAgentBootstrapEvent as isInternalAgentBootstrapEvent,
  isGatewayStartupEvent,
  isMessageReceivedEvent,
  isMessageSentEvent,
  isMessageTranscribedEvent,
  isMessagePreprocessedEvent,
  isSessionPatchEvent,
  isToolCallEvent,
  isToolResultEvent,
} from './internal-hooks.js';

// LLM Slug 生成器
export {
  generateSlug,
  generateSlugFromLLM,
} from './llm-slug-generator.js';
export type { SlugGeneratorOptions } from './llm-slug-generator.js';

// 消息钩子映射器
export {
  // 现有 MessageHookMapper API
  DEFAULT_MESSAGE_MAPPERS,
  MessageHookMapperManager,
  messageHookMapperManager,
  createMessageToEmailMapper,
  createEmailToMessageMapper,
  // openclaw Canonical Context API
  deriveInboundMessageHookContext,
  buildCanonicalSentMessageHookContext,
  toPluginMessageContext,
  toPluginInboundClaimContext,
  toPluginInboundClaimEvent,
  toPluginMessageReceivedEvent,
  toPluginMessageSentEvent,
  toInternalMessageReceivedContext,
  toInternalMessageTranscribedContext,
  toInternalMessagePreprocessedContext,
  toInternalMessageSentContext,
  registerMessageHookChannelPlugin,
  clearMessageHookChannelPlugins,
} from './message-hook-mappers.js';
export type {
  MessageHookMapper,
  FinalizedMsgContext,
  CanonicalInboundMessageHookContext,
  CanonicalSentMessageHookContext,
} from './message-hook-mappers.js';

// 插件钩子集成
export {
  registerPluginHooks,
  getPluginHooks,
  getAllPluginHooks,
  unregisterPluginHooks,
  unregisterAllPluginHooks,
  registerPluginHookHandler,
  getPluginHookHandlers,
  unregisterPluginHookHandler,
} from './plugin-hooks.js';
export type { PluginHookInfo, PluginHookRegistration } from './plugin-hooks.js';

// Fire-and-Forget 异步触发
export {
  fireAndForgetHook,
  fireAndForgetBoundedHook,
  formatHookErrorForLog,
  getFireAndForgetQueueSize,
  getFireAndForgetActiveCount,
  resetFireAndForgetStateForTest,
} from './fire-and-forget.js';

// 钩子状态管理
export {
  buildHookStatusReport,
  filterLoadableHooks,
  filterHooksBySource,
  getHookStatusByName,
  getHookStatusByKey,
  summarizeHookStatus,
} from './hooks-status.js';
export type { BuildHookStatusOptions } from './hooks-status.js';

// 导入 URL 工具
export {
  buildImportUrl as buildHookImportUrl,
  isImmutableSource,
  parseImportUrl,
  invalidateImportCache,
  buildImportUrlWithCacheBust,
  hasImportUrlChanged,
} from './import-url.js';

// 邮件提供商配置
export {
  MAIL_PROVIDERS,
  getMailProvider,
  getMailProviderByEmail,
  getProviderAuthInstructions,
  isChineseProvider,
} from './mail-providers.js';
export type { MailProviderId, MailProviderConfig } from './mail-providers.js';

// 邮件集成
export {
  DEFAULT_MAIL_LABEL,
  DEFAULT_MAIL_MAX_BYTES,
  DEFAULT_MAIL_RENEW_MINUTES,
  DEFAULT_MAIL_CHECK_INTERVAL_MS,
  generateHookToken,
  resolveMailHookRuntimeConfig,
  buildDefaultHookUrl,
} from './mail.js';
export type {
  MailAuthType,
  MailOAuth2Config,
  MailAccountConfig,
  MailHookOverrides,
  MailHookRuntimeConfig,
} from './mail.js';

// 邮件客户端
export { MailClient } from './mail-client.js';
export type { MailAttachment, MailMessage, MailSearchFilter } from './mail-client.js';

// 邮件操作
export {
  setupMailAccount,
  sendMail,
  fetchEmails,
  searchEmails,
  markEmailAsRead,
  markEmailAsUnread,
  flagEmail,
  deleteEmail,
  getUnreadCount,
  runMailService,
} from './mail-ops.js';
export type {
  MailSetupOptions,
  MailRunOptions,
  MailSendOptions,
  MailSearchOptions,
} from './mail-ops.js';

// 邮件观察器
export {
  startMailWatcher,
  stopMailWatcher,
  setMailWatcherCallback,
  clearMailWatcherCallback,
} from './mail-watcher.js';
export type { MailWatcherStartResult, MailWatcherStartOptions } from './mail-watcher.js';

// 邮件 watcher 错误处理
export {
  isAddressInUseError,
  isAuthenticationError,
  isConnectionError,
  isTimeoutError,
  isRateLimitError,
  classifyMailWatcherError,
  getErrorUserMessage,
  getProviderSpecificTroubleshooting,
} from './gmail-watcher-errors.js';

// 邮件 watcher 生命周期
export {
  getMailWatcherStatus,
  setMailWatcherState,
  setMailWatcherAccount,
  recordMailWatcherError,
  recordMailWatcherSuccess,
  recordMessageProcessed,
  startMailWatcherStatusTracking,
  stopMailWatcherStatusTracking,
  subscribeToMailWatcherStatus,
  resetMailWatcherStatusForTest,
  startMailWatcherWithLogs,
} from './gmail-watcher-lifecycle.js';
export type { MailWatcherLog } from './gmail-watcher-lifecycle.js';

// 邮件设置工具
export {
  validateMailAccountConfig,
  buildIMAPConfig,
  buildSMTPConfig,
  generateMailHookToken,
  validateMailHookToken,
  ensureMailConfigDir,
  getMailConfigPath,
  saveMailAccountConfig,
  loadMailAccountConfig,
  listMailAccounts,
  deleteMailAccountConfig,
  detectMailProviderFromEmail,
  getMailSetupChecklist,
} from './gmail-setup-utils.js';
export type { MailSetupValidationResult } from './gmail-setup-utils.js';
