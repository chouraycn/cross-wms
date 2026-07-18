// `openclaw config set` dry-run 校验结果类型定义。
// 移植自 openclaw/src/cli/config-set-dryrun.ts。
//
// 降级策略：原模块仅包含类型定义，无外部依赖，直接复制实现。

/** Config-set 输入模式（产生此次模拟操作的来源）。 */
export type ConfigSetDryRunInputMode = "value" | "json" | "builder" | "unset";

/** dry-run 处理期间发现的一条校验错误。 */
export type ConfigSetDryRunError = {
  kind: "missing-path" | "schema" | "resolvability";
  message: string;
  ref?: string;
};

/** config-set 命令处理器与测试返回的 dry-run 摘要。 */
export type ConfigSetDryRunResult = {
  ok: boolean;
  operations: number;
  configPath: string;
  inputModes: ConfigSetDryRunInputMode[];
  checks: {
    schema: boolean;
    resolvability: boolean;
    resolvabilityComplete: boolean;
  };
  refsChecked: number;
  skippedExecRefs: number;
  errors?: ConfigSetDryRunError[];
};
