import type { IsolatedAgentExternalContent } from "./types.js";

export async function fetchIsolatedAgentExternalContent(
  content: IsolatedAgentExternalContent,
): Promise<string | undefined> {
  if (content.content) {
    return content.content;
  }

  if (content.url) {
    try {
      const response = await fetch(content.url);
      if (!response.ok) {
        return undefined;
      }
      return response.text();
    } catch {
      return undefined;
    }
  }

  return undefined;
}