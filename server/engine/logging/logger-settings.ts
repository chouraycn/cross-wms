// Minimal resolved logger-settings stub for the log-tail module.
//
// Migrated from openclaw/src/logging.ts (getResolvedLoggerSettings). The original returns the
// active logger configuration including the log file path. cross-wms uses Pino which logs to
// stdout by default; this stub exposes a LOG_FILE env override so log-tail can still locate a
// file sink when one is configured.
export type LoggerSettings = {
  file: string;
};

/** Returns resolved logger settings, honoring a LOG_FILE override for file-based logging. */
export function getResolvedLoggerSettings(): LoggerSettings {
  return { file: process.env.LOG_FILE ?? "" };
}
