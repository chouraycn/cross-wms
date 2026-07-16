export function extractExecDirective(body?: string): {
  cleaned: string;
  execRequested: boolean;
  rawCommand?: string;
  hasDirective: boolean;
} {
  if (!body) return { cleaned: '', execRequested: false, hasDirective: false };

  const match = body.match(/(?:^|\s)\/exec(?=$|\s|:)\s*:?\s*([\s\S]+)?/i);
  if (!match) return { cleaned: body.trim(), execRequested: false, hasDirective: false };

  const rawCommand = match[1]?.trim();
  const cleaned = body.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { cleaned, execRequested: true, rawCommand, hasDirective: true };
}
