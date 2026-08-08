/** Visit object-shaped content blocks in an assistant/user message payload. */
export function visitObjectContentBlocks(
  message: any,
  visitor: (block: Record<string, any>) => void,
): void {
  if (!message || typeof message !== "object") {
    return;
  }
  const content = (message as { content?: any }).content;
  if (!Array.isArray(content)) {
    return;
  }
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    visitor(block as Record<string, any>);
  }
}
