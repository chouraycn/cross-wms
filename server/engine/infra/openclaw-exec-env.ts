/** 标记子命令为 OpenClaw CLI 启动的进程 env 键。 */
export const OPENCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";

/** 用于 OpenClaw 启动的子进程检测的稳定标记值。 */
export const OPENCLAW_CLI_ENV_VALUE = "1";

/** 返回带 OpenClaw CLI 标记的克隆 env 对象。 */
export function markOpenClawExecEnv<T extends Record<string, string | undefined>>(
  /** 添加子进程标记前要克隆的源环境。 */
  env: T,
): T {
  return {
    ...env,
    [OPENCLAW_CLI_ENV_VAR]: OPENCLAW_CLI_ENV_VALUE,
  };
}

/** 修改现有进程 env 对象，使当前进程的子进程继承该标记。 */
export function ensureOpenClawExecMarkerOnProcess(
  /** 要修改的进程 env 对象；默认为当前进程环境。 */
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[OPENCLAW_CLI_ENV_VAR] = OPENCLAW_CLI_ENV_VALUE;
  return env;
}
