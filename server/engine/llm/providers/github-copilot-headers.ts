// GitHub Copilot header helpers build request headers for Copilot-backed providers.
// Local type placeholder: openclaw Message shape (user/assistant/toolResult with content blocks).
/** Minimal message shape required by Copilot header helpers. */
type CopilotContentBlock = { type: string };
type CopilotMessage = {
  role: "user" | "assistant" | "toolResult" | string;
  content: string | CopilotContentBlock[];
};

// Copilot expects X-Initiator to indicate whether the request is user-initiated
// or agent-initiated (e.g. follow-up after assistant/tool messages).
export function inferCopilotInitiator(messages: CopilotMessage[]): "user" | "agent" {
  const last = messages[messages.length - 1];
  return last && last.role !== "user" ? "agent" : "user";
}

// Copilot requires Copilot-Vision-Request header when sending images
export function hasCopilotVisionInput(messages: CopilotMessage[]): boolean {
  return messages.some((msg) => {
    if (msg.role === "user" && Array.isArray(msg.content)) {
      return msg.content.some((c) => c.type === "image");
    }
    if (msg.role === "toolResult" && Array.isArray(msg.content)) {
      return msg.content.some((c) => c.type === "image");
    }
    return false;
  });
}

export function buildCopilotDynamicHeaders(params: {
  messages: CopilotMessage[];
  hasImages: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Initiator": inferCopilotInitiator(params.messages),
    "Openai-Intent": "conversation-edits",
  };

  if (params.hasImages) {
    headers["Copilot-Vision-Request"] = "true";
  }

  return headers;
}
