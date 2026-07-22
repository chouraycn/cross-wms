export { redactSensitiveText, redactObject, addRedactPattern, getDefaultRedactPatterns } from './redact.js';
export { createLogTail, LogTail } from './log-tail.js';
export { LogLevel, parseLogLevel, compareLogLevels, shouldLog, levelToString } from './levels.js';
export { createSubsystemLogger } from './subsystem.js';
export type { SubsystemLogger } from './subsystem.js';

export { EngineLogger, getLogger, getChildLogger, isFileLogLevelEnabled, resetLogger, setLoggerOverride } from './logger.js';
export type { LoggerSettings } from './logger.js';

export { readLoggingConfig, getResolvedSettings, normalizeLoggerSettings, shouldSkipMutatingLoggingConfigRead, resetLoggerConfig } from './config.js';

export {
  enableConsoleCapture,
  getConsoleSettings,
  getResolvedConsoleSettings,
  routeLogsToStderr,
  setConsoleSubsystemFilter,
  setConsoleTimestampPrefix,
  shouldLogSubsystemToConsole,
  formatConsoleTimestamp,
} from './console.js';
export type { ConsoleStyle, ConsoleLoggerSettings } from './console.js';

export { formatTimestamp, formatLocalIsoWithOffset, formatLocalDate, isValidTimeZone } from './timestamps.js';

export { loggingState } from './state.js';

export { resolveEnvLogLevelOverride } from './env-log-level.js';

export { parseLogLine, isJsonLogLine } from './parse-log-line.js';

export {
  resolveLogFilePath,
  rollingLogPathForDate,
  isRollingLogPath,
  defaultRollingLogPathForToday,
  DEFAULT_LOG_DIR,
  LOG_PREFIX,
  LOG_SUFFIX,
} from './log-file-path.js';

export {
  canUseNodeFs,
  ensureLogDir,
  getFileSize,
  appendLogLine,
  pruneOldRollingLogs,
  rotateLogFile,
} from './log-file-shared.js';

export {
  messageLifecycle,
  trackMessageStage,
  MessageLifecycleTracker,
} from './message-lifecycle.js';
export type { MessageLifecycleStage, MessageLifecycleEvent } from './message-lifecycle.js';

export { redactBounded, redactBoundedJson, clampText, truncateMiddle } from './redact-bounded.js';

export { redactIdentifiers, redactIdentifiersInObject, maskString, maskEmail } from './redact-identifier.js';

export type {
  ParsedLogLine,
  LogFileInfo,
  DiagnosticLogLevel,
  DiagnosticEvent,
  MemoryDiagnostic,
  StabilityIndicator,
  SessionStateDiagnostic,
  SupportBundle,
} from './types.js';

export * from './diagnostic/index.js';

export { TraceContext, TRACE_HEADER_KEYS } from './traceContext.js';
export {
  DiagnosticEventBus,
  defaultDiagnosticEventBus,
} from './diagnosticEvents.js';
export type {
  DiagnosticEvent as LoggingDiagnosticEvent,
  DiagnosticEventLevel,
  DiagnosticEventHandler,
} from './diagnosticEvents.js';
export { LogRotator } from './logRotation.js';

export {
  createSkillLogger,
  logSkillAction,
  logSkillExecution,
  logSkillInstallation,
  logSkillSecurity,
  logSkillDiscovery,
} from './skill-logger.js';
export type { SkillLogContext } from './skill-logger.js';
