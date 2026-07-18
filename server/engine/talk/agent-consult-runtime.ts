// Agent consult runtime starts agent consultation flows from talk sessions.
// 自包含实现，参考 openclaw/src/talk/agent-consult-runtime.ts。
// 用注入的 consult 回调替代 openclaw 的 embedded-agent-runner，保持可测试。
import {
  buildRealtimeVoiceAgentConsultPrompt,
  collectRealtimeVoiceAgentConsultVisibleText,
  type RealtimeVoiceAgentConsultTranscriptEntry,
} from "./agent-consult-tool.js";

/**
 * 单次代理咨询的输入参数。
 * 自包含版本，替代 openclaw 的 RunEmbeddedAgentParams 子集。
 */
export type RealtimeVoiceAgentConsultRunParams = {
  /** 委托给代理的提示文本。 */
  prompt: string;
  /** 语音会话标识。 */
  sessionKey: string;
  /** 可选超时（毫秒）。 */
  timeoutMs?: number;
  /** 工具白名单。 */
  toolsAllow?: string[];
  /** 额外系统提示。 */
  extraSystemPrompt?: string;
};

/**
 * 代理运行产出的流式载荷条目。
 */
export type RealtimeVoiceAgentConsultRunPayload = {
  text?: unknown;
  isError?: boolean;
  isReasoning?: boolean;
};

/**
 * 代理运行结果。
 */
export type RealtimeVoiceAgentConsultRunResult = {
  payloads?: RealtimeVoiceAgentConsultRunPayload[];
  meta?: { aborted?: boolean };
};

/**
 * Agent runtime surface used by realtime voice consults.
 * 自包含版本：调用方注入 consult 实现，避免依赖完整 agent 运行时。
 */
export type RealtimeVoiceAgentConsultRuntime = {
  consult(params: RealtimeVoiceAgentConsultRunParams): Promise<RealtimeVoiceAgentConsultRunResult>;
};

/**
 * Speakable text returned to the realtime voice bridge after an agent consult.
 */
export type RealtimeVoiceAgentConsultResult = { text: string };

/**
 * Controls whether voice consults run in a fresh session or fork context from the requester.
 */
export type RealtimeVoiceAgentConsultContextMode = "isolated" | "fork";

export {
  resolveRealtimeVoiceAgentConsultTools,
  resolveRealtimeVoiceAgentConsultToolsAllow,
} from "./agent-consult-tool.js";

/** 运行咨询所需的最小 logger 接口。 */
type ConsultLogger = {
  warn?: (message: string) => void;
};

/**
 * Runs an agent consult and returns concise speakable text for realtime voice playback.
 * 自包含版本：通过注入的 agentRuntime.consult 执行委托，不依赖完整 agent 基础设施。
 */
export async function consultRealtimeVoiceAgent(params: {
  agentRuntime: RealtimeVoiceAgentConsultRuntime;
  logger: ConsultLogger;
  sessionKey: string;
  args: unknown;
  transcript: RealtimeVoiceAgentConsultTranscriptEntry[];
  surface: string;
  userLabel: string;
  assistantLabel?: string;
  questionSourceLabel?: string;
  timeoutMs?: number;
  toolsAllow?: string[];
  extraSystemPrompt?: string;
  fallbackText?: string;
}): Promise<RealtimeVoiceAgentConsultResult> {
  const prompt = buildRealtimeVoiceAgentConsultPrompt({
    args: params.args,
    transcript: params.transcript,
    surface: params.surface,
    userLabel: params.userLabel,
    assistantLabel: params.assistantLabel,
    questionSourceLabel: params.questionSourceLabel,
  });

  const result = await params.agentRuntime.consult({
    prompt,
    sessionKey: params.sessionKey,
    timeoutMs: params.timeoutMs,
    toolsAllow: params.toolsAllow,
    extraSystemPrompt:
      params.extraSystemPrompt ??
      "You are the configured agent receiving delegated requests from a live voice bridge. Act on behalf of the user, use available tools when appropriate, and return a brief speakable result.",
  });

  const text = collectRealtimeVoiceAgentConsultVisibleText(result.payloads ?? []);
  if (!text) {
    const reason = result.meta?.aborted ? "agent run aborted" : "agent returned no speakable text";
    params.logger.warn?.(`[talk] agent consult produced no answer: ${reason}`);
    return { text: params.fallbackText ?? "I need a moment to verify that before answering." };
  }
  return { text };
}
