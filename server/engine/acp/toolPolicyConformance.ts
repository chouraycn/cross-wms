export const POLICY_TOOL_GROUPS: Record<string, readonly string[]> = {
  "group:openclaw": [
    "code_execution",
    "web_search",
    "web_fetch",
    "x_search",
    "memory_search",
    "memory_get",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "sessions_yield",
    "subagents",
    "session_status",
    "browser",
    "message",
    "heartbeat_respond",
    "cron",
    "gateway",
    "nodes",
    "agents_list",
    "update_plan",
    "image",
    "image_generate",
    "music_generate",
    "video_generate",
    "tts",
  ],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:runtime": ["exec", "process", "code_execution"],
  "group:web": ["web_search", "web_fetch", "x_search"],
  "group:memory": ["memory_search", "memory_get"],
  "group:sessions": [
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "sessions_yield",
    "subagents",
    "session_status",
  ],
  "group:ui": ["browser", "canvas"],
  "group:messaging": ["message"],
  "group:automation": ["heartbeat_respond", "cron", "gateway"],
  "group:nodes": ["nodes"],
  "group:agents": ["agents_list", "update_plan"],
  "group:media": ["image", "image_generate", "music_generate", "video_generate", "tts"],
} as const;

export type ToolGroupId = keyof typeof POLICY_TOOL_GROUPS;

export function getToolGroups(): readonly ToolGroupId[] {
  return Object.keys(POLICY_TOOL_GROUPS) as ToolGroupId[];
}

export function getToolsInGroup(groupId: ToolGroupId): readonly string[] {
  return POLICY_TOOL_GROUPS[groupId] ?? [];
}

export function getGroupsForTool(toolName: string): readonly ToolGroupId[] {
  const groups: ToolGroupId[] = [];
  for (const [groupId, tools] of Object.entries(POLICY_TOOL_GROUPS)) {
    if (tools.includes(toolName)) {
      groups.push(groupId as ToolGroupId);
    }
  }
  return groups;
}

export function isToolInGroup(toolName: string, groupId: ToolGroupId): boolean {
  return POLICY_TOOL_GROUPS[groupId]?.includes(toolName) ?? false;
}

export function validateToolGroupId(groupId: string): groupId is ToolGroupId {
  return groupId in POLICY_TOOL_GROUPS;
}