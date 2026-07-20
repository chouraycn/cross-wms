/**
 * Transcripts tool for viewing session transcripts.
 * Ported from openclaw/src/agents/tools/transcripts-tool.ts
 *
 * Note: Full session infrastructure not available in cross-wms.
 */

type ToolDefinition = {
  name: string;
  description: string;
  input_schema?: unknown;
};

type ToolCall = {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
};

type ToolResult = {
  toolUseId: string;
  output: string;
  isError?: boolean;
};

/** Returns the tool definition for the transcripts viewer. */
export function getTranscriptsToolDefinition(): ToolDefinition {
  return {
    name: "transcripts",
    description:
      "View the full transcript of a previous or current session, including all messages and tool calls. Returns the transcript as text.",
    input_schema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "The session ID to view. If omitted, lists recent sessions.",
        },
        format: {
          type: "string",
          enum: ["text", "json"],
          description: "Output format. Defaults to text.",
        },
      },
    },
  };
}

/** Execute the transcripts tool and return formatted output. */
export async function executeTranscriptsTool(
  _call: ToolCall,
  _options?: { sessionManager?: unknown; workspaceDir?: string },
): Promise<ToolResult> {
  // Full session infrastructure not available in cross-wms
  return {
    toolUseId: _call.toolUseId,
    output: "Transcripts tool not available in cross-wms. Session management infrastructure is not present.",
    isError: true,
  };
}

/** List available session transcripts. */
export async function listAvailableTranscripts(
  _options?: { sessionManager?: unknown; workspaceDir?: string; limit?: number },
): Promise<Array<{ sessionId: string; timestamp?: string; summary?: string }>> {
  // Full session infrastructure not available in cross-wms
  return [];
}
