// `openclaw config set` 模式解析器；将互斥的 builder 选项排除在 action 代码之外。
// 移植自 openclaw/src/cli/config-set-parser.ts。
//
// 降级策略：原模块为纯函数与类型，无外部依赖，直接复制实现。

type ConfigSetMode = "value" | "json" | "ref_builder" | "provider_builder" | "batch";

type ConfigSetModeResolution =
  | {
      ok: true;
      mode: ConfigSetMode;
    }
  | {
      ok: false;
      error: string;
    };

/** 解析 config-set 输入模式，或返回确切的 flag 冲突错误。 */
export function resolveConfigSetMode(params: {
  hasBatchMode: boolean;
  hasRefBuilderOptions: boolean;
  hasProviderBuilderOptions: boolean;
  strictJson: boolean;
}): ConfigSetModeResolution {
  if (params.hasBatchMode) {
    if (params.hasRefBuilderOptions || params.hasProviderBuilderOptions) {
      return {
        ok: false,
        error:
          "batch mode (--batch-json/--batch-file) cannot be combined with ref builder (--ref-*) or provider builder (--provider-*) flags.",
      };
    }
    return { ok: true, mode: "batch" };
  }
  if (params.hasRefBuilderOptions && params.hasProviderBuilderOptions) {
    return {
      ok: false,
      error:
        "choose exactly one mode: ref builder (--ref-provider/--ref-source/--ref-id) or provider builder (--provider-*), not both.",
    };
  }
  if (params.hasRefBuilderOptions) {
    return { ok: true, mode: "ref_builder" };
  }
  if (params.hasProviderBuilderOptions) {
    return { ok: true, mode: "provider_builder" };
  }
  return { ok: true, mode: params.strictJson ? "json" : "value" };
}
