export function extractReplyToTag(
  text?: string,
  currentMessageId?: string,
): {
  cleaned: string;
  replyToId?: string;
  replyToCurrent: boolean;
  hasTag: boolean;
} {
  if (!text) return { cleaned: '', replyToCurrent: false, hasTag: false };

  const match = text.match(/(?:^|\s)\/reply-to:(\S+)/i);
  if (!match) return { cleaned: text.trim(), replyToCurrent: false, hasTag: false };

  const replyToId = match[1];
  const replyToCurrent = currentMessageId !== undefined && replyToId === currentMessageId;
  const cleaned = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { cleaned, replyToId, replyToCurrent, hasTag: true };
}
