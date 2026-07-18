// 移植自 openclaw/src/config/io.invalid-config.ts
// 配置读取与变更失败的共享 invalid-config 格式化、日志与错误助手。
// 所有面向终端的文本在此净化，以便调用方复用相同的失败表面。
//
// 降级说明：源文件依赖 ../../packages/terminal-core/src/safe-text.js 的
// sanitizeTerminalText。此处内联一个基础实现（去除控制字符）。

/** 内联降级实现：去除终端不安全控制字符。 */
function sanitizeTerminalText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** 从 schema 与变更校验路径接受的最小校验问题形态。 */
type ConfigValidationIssueLike = {
  path: string;
  message: string;
};

/** 将校验问题格式化为终端安全的 bullet 行，用于配置加载失败。 */
export function formatInvalidConfigDetails(issues: ConfigValidationIssueLike[]): string {
  return issues
    .map(
      (issue) =>
        // 校验路径/消息可能包含用户配置文本；终端输出前净化。
        `- ${sanitizeTerminalText(issue.path || '<root>')}: ${sanitizeTerminalText(issue.message)}`,
    )
    .join('\n');
}

/** 构建单行 invalid-config 前缀以及预格式化的校验详情。 */
export function formatInvalidConfigLogMessage(configPath: string, details: string): string {
  return `Invalid config at ${configPath}:\n${details}`;
}

/** 在加载序列中每个路径只记录一次 invalid-config 消息。 */
export function logInvalidConfigOnce(params: {
  configPath: string;
  details: string;
  logger: Pick<typeof console, 'error'>;
  loggedConfigPaths: Set<string>;
}): void {
  if (params.loggedConfigPaths.has(params.configPath)) {
    // 多个调用方观察同一路径时避免重复输出相同的 invalid-config 块。
    return;
  }
  params.loggedConfigPaths.add(params.configPath);
  params.logger.error(formatInvalidConfigLogMessage(params.configPath, params.details));
}

/** 创建被 catch 后仍需详情的调用方使用的带标记错误形态。 */
export function createInvalidConfigError(configPath: string, details: string): Error {
  const error = new Error(`Invalid config at ${configPath}:\n${details}`);
  // 元数据保持非 class 形态，跨模块调用方可检查普通 Error 实例。
  (error as { code?: string; details?: string }).code = 'INVALID_CONFIG';
  (error as { code?: string; details?: string }).details = details;
  return error;
}

/** 记录并抛出校验结果对应的标准 invalid-config 错误。 */
export function throwInvalidConfig(params: {
  configPath: string;
  issues: ConfigValidationIssueLike[];
  logger: Pick<typeof console, 'error'>;
  loggedConfigPaths: Set<string>;
}): never {
  const details = formatInvalidConfigDetails(params.issues);
  logInvalidConfigOnce({
    configPath: params.configPath,
    details,
    logger: params.logger,
    loggedConfigPaths: params.loggedConfigPaths,
  });
  throw createInvalidConfigError(params.configPath, details);
}
