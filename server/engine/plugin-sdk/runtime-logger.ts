/**
 * @deprecated Compatibility subpath. Import logger/runtime helpers from
 * `openclaw/plugin-sdk/runtime` instead.
 *
 * 移植自 openclaw/src/plugin-sdk/runtime-logger.ts
 * 降级策略：openclaw 的 ../runtime.js 未移植，这里本地定义 RuntimeEnv
 * 与 OutputRuntimeEnv 类型（按 openclaw 原始结构），避免与 cross-wms
 * 现有的同名但不同含义的 RuntimeEnv 类型（infra/runtime-guard.js 中的
 * 进程运行时检测接口、plugins/_parent__runtime.ts 中的 node env 接口）冲突。
 */

import { format } from "node:util";

/**
 * 运行时环境接口（本地降级定义，匹配 openclaw 原始结构）。
 * 注意：cross-wms 中存在多个名为 RuntimeEnv 的不同类型，
 * 此处仅用于本模块的 logger-backed runtime 适配，不对外泄露。
 */
type RuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
};

/** 输出运行时环境接口（本地降级定义，匹配 openclaw 原始结构）。 */
type OutputRuntimeEnv = RuntimeEnv & {
  writeStdout: (value: string) => void;
  writeJson: (value: unknown, space?: number) => void;
};

/** Minimal logger contract accepted by runtime-adapter helpers. */
type LoggerLike = {
  info: (message: string) => void;
  error: (message: string) => void;
};

/** @deprecated Import from `openclaw/plugin-sdk/runtime` instead. */
export function createLoggerBackedRuntime(params: {
  logger: LoggerLike;
  exitError?: (code: number) => Error;
}): OutputRuntimeEnv {
  return {
    log: (...args) => {
      params.logger.info(format(...args));
    },
    error: (...args) => {
      params.logger.error(format(...args));
    },
    writeStdout: (value) => {
      params.logger.info(value);
    },
    writeJson: (value, space = 2) => {
      params.logger.info(JSON.stringify(value, null, space > 0 ? space : undefined));
    },
    exit: (code: number): never => {
      throw params.exitError?.(code) ?? new Error(`exit ${code}`);
    },
  };
}

/** @deprecated Import from `openclaw/plugin-sdk/runtime` instead. */
export function resolveRuntimeEnv(params: {
  runtime: RuntimeEnv;
  logger: LoggerLike;
  exitError?: (code: number) => Error;
}): RuntimeEnv;
/** @deprecated Import from `openclaw/plugin-sdk/runtime` instead. */
export function resolveRuntimeEnv(params: {
  runtime?: undefined;
  logger: LoggerLike;
  exitError?: (code: number) => Error;
}): OutputRuntimeEnv;
export function resolveRuntimeEnv(params: {
  runtime?: RuntimeEnv;
  logger: LoggerLike;
  exitError?: (code: number) => Error;
}): RuntimeEnv | OutputRuntimeEnv {
  return params.runtime ?? createLoggerBackedRuntime(params);
}

/** @deprecated Import from `openclaw/plugin-sdk/runtime` instead. */
export function resolveRuntimeEnvWithUnavailableExit(params: {
  runtime: RuntimeEnv;
  logger: LoggerLike;
  unavailableMessage?: string;
}): RuntimeEnv;
/** @deprecated Import from `openclaw/plugin-sdk/runtime` instead. */
export function resolveRuntimeEnvWithUnavailableExit(params: {
  runtime?: undefined;
  logger: LoggerLike;
  unavailableMessage?: string;
}): OutputRuntimeEnv;
export function resolveRuntimeEnvWithUnavailableExit(params: {
  runtime?: RuntimeEnv;
  logger: LoggerLike;
  unavailableMessage?: string;
}): RuntimeEnv | OutputRuntimeEnv {
  if (params.runtime) {
    return resolveRuntimeEnv({
      runtime: params.runtime,
      logger: params.logger,
      exitError: () => new Error(params.unavailableMessage ?? "Runtime exit not available"),
    });
  }
  return resolveRuntimeEnv({
    logger: params.logger,
    exitError: () => new Error(params.unavailableMessage ?? "Runtime exit not available"),
  });
}
