import { LogLevel, parseLogLevel } from './levels.js';
import { loggingState } from './state.js';

const ALLOWED_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

export function resolveEnvLogLevelOverride(): LogLevel | undefined {
  const raw = process.env.LOG_LEVEL ?? process.env.CROSS_WMS_LOG_LEVEL;
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    loggingState.invalidEnvLogLevelValue = null;
    return undefined;
  }
  const parsed = parseLogLevel(trimmed);
  if (parsed !== undefined) {
    loggingState.invalidEnvLogLevelValue = null;
    return parsed;
  }
  if (loggingState.invalidEnvLogLevelValue !== trimmed) {
    loggingState.invalidEnvLogLevelValue = trimmed;
    process.stderr.write(
      `[cross-wms] Ignoring invalid LOG_LEVEL="${trimmed}" (allowed: ${ALLOWED_LOG_LEVELS.join('|')}).\n`,
    );
  }
  return undefined;
}
