/** 诊断追踪（可能包含模型可见内容）的逐字段策略。 */
export type DiagnosticModelContentCapturePolicy = {
  /** 捕获发送给模型的聊天/消息负载。 */
  inputMessages: boolean;
  /** 捕获模型响应消息。 */
  outputMessages: boolean;
  /** 捕获工具调用参数。 */
  toolInputs: boolean;
  /** 捕获工具结果负载。 */
  toolOutputs: boolean;
  /** 捕获系统提示或指令块。 */
  systemPrompt: boolean;
  /** 捕获呈现给模型的工具模式/定义。 */
  toolDefinitions: boolean;
  /** 是否启用了任何模型可见的提示/响应/模式内容。 */
  anyModelContent: boolean;
};

const NO_MODEL_CONTENT_CAPTURE: DiagnosticModelContentCapturePolicy = Object.freeze({
  inputMessages: false,
  outputMessages: false,
  toolInputs: false,
  toolOutputs: false,
  systemPrompt: false,
  toolDefinitions: false,
  anyModelContent: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// 克隆捕获的内容，使私有诊断负载永不别名调用者持续修改的
// 实时运行时对象（工具参数/结果、模型消息）。
export function cloneDiagnosticContentValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    try {
      const serialized = JSON.stringify(value);
      return serialized === undefined ? null : (JSON.parse(serialized) as unknown);
    } catch {
      return String(value);
    }
  }
}

function withDerivedFields(
  policy: Omit<DiagnosticModelContentCapturePolicy, "anyModelContent">,
): DiagnosticModelContentCapturePolicy {
  return {
    ...policy,
    anyModelContent:
      policy.inputMessages ||
      policy.outputMessages ||
      policy.systemPrompt ||
      policy.toolDefinitions,
  };
}

/** 从配置解析模型内容诊断捕获，默认不捕获内容。 */
export function resolveDiagnosticModelContentCapturePolicy(
  config: unknown,
): DiagnosticModelContentCapturePolicy {
  if (!isRecord(config)) {
    return NO_MODEL_CONTENT_CAPTURE;
  }
  const diagnostics = config.diagnostics;
  if (!isRecord(diagnostics) || diagnostics.enabled === false) {
    return NO_MODEL_CONTENT_CAPTURE;
  }
  const otel = diagnostics.otel;
  if (!isRecord(otel) || otel.enabled !== true || otel.traces === false) {
    return NO_MODEL_CONTENT_CAPTURE;
  }

  const captureContent = otel.captureContent;
  if (captureContent === true) {
    return withDerivedFields({
      inputMessages: true,
      outputMessages: true,
      toolInputs: true,
      toolOutputs: true,
      systemPrompt: false,
      toolDefinitions: true,
    });
  }
  if (!isRecord(captureContent) || captureContent.enabled !== true) {
    return NO_MODEL_CONTENT_CAPTURE;
  }
  return withDerivedFields({
    inputMessages: captureContent.inputMessages === true,
    outputMessages: captureContent.outputMessages === true,
    toolInputs: captureContent.toolInputs === true,
    toolOutputs: captureContent.toolOutputs === true,
    systemPrompt: captureContent.systemPrompt === true,
    toolDefinitions: captureContent.toolDefinitions === true,
  });
}
