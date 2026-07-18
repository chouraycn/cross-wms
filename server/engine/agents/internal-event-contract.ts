// 内部事件判别式，由 runtime 事件生产方与 prompt 格式化方共享。
// 这些值需保持稳定，因为它们会跨越 agent runtime 边界。
export const AGENT_INTERNAL_EVENT_TYPE_TASK_COMPLETION = "task_completion" as const;

const AGENT_INTERNAL_EVENT_SOURCES = [
  "subagent",
  "cron",
  "image_generation",
  "video_generation",
  "music_generation",
] as const;

const AGENT_INTERNAL_EVENT_STATUSES = ["ok", "timeout", "error", "unknown"] as const;

export type AgentInternalEventSource = (typeof AGENT_INTERNAL_EVENT_SOURCES)[number];
export type AgentInternalEventStatus = (typeof AGENT_INTERNAL_EVENT_STATUSES)[number];
