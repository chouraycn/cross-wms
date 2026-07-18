export const HEARTBEAT_TOKEN = 'HEARTBEAT_OK';
export const DEFAULT_HEARTBEAT_EVERY = '30m';
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

export const HEARTBEAT_PROMPT =
  'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.';

export type HeartbeatTask = {
  name: string;
  interval: string;
  prompt: string;
};

export type StripHeartbeatResult = {
  shouldSkip: boolean;
  text: string;
  didStrip: boolean;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTokenAtEdges(raw: string): { text: string; didStrip: boolean } {
  let text = raw.trim();
  if (!text) return { text: '', didStrip: false };

  const token = HEARTBEAT_TOKEN;
  const tokenAtEndPattern = new RegExp(`${escapeRegExp(token)}[^\\w]{0,4}$`);
  if (!text.includes(token)) return { text, didStrip: false };

  let didStrip = false;
  let changed = true;

  while (changed) {
    changed = false;
    const next = text.trim();

    if (next.startsWith(token)) {
      const after = next.slice(token.length).trimStart();
      text = after;
      didStrip = true;
      changed = true;
      continue;
    }

    if (tokenAtEndPattern.test(next)) {
      const idx = next.lastIndexOf(token);
      const before = next.slice(0, idx).trimEnd();
      if (!before) {
        text = '';
      } else {
        const after = next.slice(idx + token.length).trimStart();
        text = `${before}${after}`.trimEnd();
      }
      didStrip = true;
      changed = true;
    }
  }

  const collapsed = text.replace(/\s+/g, ' ').trim();
  return { text: collapsed, didStrip };
}

function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/^[*`~_]+/, '')
    .replace(/[*`~_]+$/, '');
}

export function stripHeartbeatToken(
  raw?: string,
  opts: { mode?: 'heartbeat' | 'message'; maxAckChars?: number } = {},
): StripHeartbeatResult {
  if (!raw) return { shouldSkip: true, text: '', didStrip: false };
  const trimmed = raw.trim();
  if (!trimmed) return { shouldSkip: true, text: '', didStrip: false };

  const mode = opts.mode ?? 'message';
  const maxAckChars = Math.max(
    0,
    typeof opts.maxAckChars === 'number' && Number.isFinite(opts.maxAckChars)
      ? opts.maxAckChars
      : DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  );

  const trimmedNormalized = stripMarkup(trimmed);
  const hasToken =
    trimmed.includes(HEARTBEAT_TOKEN) || trimmedNormalized.includes(HEARTBEAT_TOKEN);
  if (!hasToken) return { shouldSkip: false, text: trimmed, didStrip: false };

  const strippedOriginal = stripTokenAtEdges(trimmed);
  const strippedNormalized = stripTokenAtEdges(trimmedNormalized);
  const picked =
    strippedOriginal.didStrip && strippedOriginal.text ? strippedOriginal : strippedNormalized;

  if (!picked.didStrip) return { shouldSkip: false, text: trimmed, didStrip: false };
  if (!picked.text) return { shouldSkip: true, text: '', didStrip: true };

  const rest = picked.text.trim();
  if (mode === 'heartbeat' && rest.length <= maxAckChars) {
    return { shouldSkip: true, text: '', didStrip: true };
  }

  return { shouldSkip: false, text: rest, didStrip: true };
}

export function isHeartbeatContentEffectivelyEmpty(
  content: string | undefined | null,
): boolean {
  if (content === undefined || content === null) return false;
  if (typeof content !== 'string') return false;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^<!--.*-->$/.test(trimmed)) continue;
    if (/^#+(\s|$)/.test(trimmed)) continue;
    if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)) continue;
    if (/^```[A-Za-z0-9_-]*$/.test(trimmed)) continue;
    return false;
  }
  return true;
}

function stripHtmlComments(lines: string[]): string[] {
  const result: string[] = [];
  let inComment = false;
  for (const line of lines) {
    let remaining = line;
    while (inComment || remaining.trimStart().startsWith('<!--')) {
      const searchText = inComment ? remaining : remaining.trimStart();
      const commentEnd = searchText.indexOf('-->');
      if (commentEnd === -1) {
        inComment = true;
        remaining = '';
        break;
      }
      inComment = false;
      if (searchText === remaining) {
        remaining = remaining.slice(commentEnd + 3);
      } else {
        const leadingWidth = remaining.length - searchText.length;
        remaining = remaining.slice(0, leadingWidth) + searchText.slice(commentEnd + 3);
      }
    }
    result.push(remaining);
  }
  return result;
}

export function parseHeartbeatTasks(content: string): HeartbeatTask[] {
  const tasks: HeartbeatTask[] = [];
  const lines = stripHtmlComments(content.split('\n'));
  let inTasksBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === 'tasks:') {
      inTasksBlock = true;
      continue;
    }

    if (!inTasksBlock) continue;

    const isTaskField =
      trimmed.startsWith('interval:') ||
      trimmed.startsWith('prompt:') ||
      trimmed.startsWith('- name:');

    if (
      !isTaskField &&
      !trimmed.startsWith(' ') &&
      !trimmed.startsWith('\t') &&
      trimmed &&
      !trimmed.startsWith('-')
    ) {
      inTasksBlock = false;
      continue;
    }

    if (trimmed.startsWith('- name:')) {
      const name = trimmed
        .replace('- name:', '')
        .trim()
        .replace(/^["']|["']$/g, '');
      let interval = '';
      let prompt = '';

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();

        if (nextTrimmed.startsWith('- name:')) break;

        if (
          nextTrimmed.startsWith('interval:') &&
          (nextLine.startsWith(' ') || nextLine.startsWith('\t'))
        ) {
          interval = nextTrimmed
            .replace('interval:', '')
            .trim()
            .replace(/^["']|["']$/g, '');
        } else if (
          nextTrimmed.startsWith('prompt:') &&
          (nextLine.startsWith(' ') || nextLine.startsWith('\t'))
        ) {
          prompt = nextTrimmed
            .replace('prompt:', '')
            .trim()
            .replace(/^["']|["']$/g, '');
        } else if (
          !nextTrimmed.startsWith(' ') &&
          !nextTrimmed.startsWith('\t') &&
          nextTrimmed
        ) {
          inTasksBlock = false;
          break;
        }
      }

      if (name && interval && prompt) {
        tasks.push({ name, interval, prompt });
      }
    }
  }

  return tasks;
}

export function resolveHeartbeatPrompt(raw?: string): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed || HEARTBEAT_PROMPT;
}

function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value * 60 * 1000;
  }
}

export function isTaskDue(
  lastRunMs: number | undefined,
  interval: string,
  nowMs: number,
): boolean {
  if (lastRunMs === undefined) return true;
  try {
    const intervalMs = parseDurationMs(interval);
    return nowMs - lastRunMs >= intervalMs;
  } catch {
    return false;
  }
}
