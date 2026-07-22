/**
 * Command detectors used by inbound authorization and control-command routing.
 *
 * Ported from openclaw/src/auto-reply/command-detection.ts. OpenClaw helpers
 * (`normalizeCommandBody`, `stripInboundMetadata`, `isAbortTrigger`) and the
 * normalization-core string coercers are inlined so the module stays
 * self-contained. The registry accessors are adapted to the cross-wms
 * `commands-registry.js` API (which uses `aliases` rather than `textAliases`).
 */
import { listCommands, type ChatCommandDefinition } from './commands-registry.js';

/** Options for normalizing slash-command text bodies. */
export type CommandNormalizeOptions = {
  /** Bot username whose @mention suffix should be stripped from slash commands. */
  botUsername?: string;
};

/** Loose config shape consumed by command detection (channel/command config). */
export type CommandDetectionConfig = {
  commands?: {
    allowFrom?: Record<string, Array<string | number>>;
    ownerAllowFrom?: Array<string | number>;
  };
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return normalizeOptionalLowercaseString(value) ?? '';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect text aliases for a command. In cross-wms the registry exposes `name`
 * and `aliases`; both are treated as text aliases (slash-prefixed forms are
 * accepted with or without the leading slash).
 */
function getCommandTextAliases(command: ChatCommandDefinition): string[] {
  const aliases: string[] = [];
  const name = normalizeOptionalString(command.name);
  if (name) aliases.push(name);
  if (command.aliases) {
    for (const alias of command.aliases) {
      const normalized = normalizeOptionalString(alias);
      if (normalized) aliases.push(normalized);
    }
  }
  return aliases;
}

function normalizeSlashForm(alias: string): string {
  return alias.startsWith('/') ? alias : `/${alias}`;
}

/**
 * Normalizes command text to canonical aliases, removing bot mentions when
 * appropriate. Simplified port of `normalizeCommandBody`.
 */
export function normalizeCommandBody(
  raw: string,
  options?: CommandNormalizeOptions,
): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) {
    return trimmed;
  }

  const newline = trimmed.indexOf('\n');
  const singleLine = newline === -1 ? trimmed : trimmed.slice(0, newline).trim();
  const multilineTail = newline === -1 ? undefined : trimmed.slice(newline + 1).trimStart();

  // `/cmd: value` is accepted as `/cmd value`.
  const colonMatch = singleLine.match(/^\/([^\s:]+)\s*:(.*)$/);
  const normalized = colonMatch
    ? (() => {
        const [, command, rest] = colonMatch;
        const normalizedRest = rest.trimStart();
        return normalizedRest ? `/${command} ${normalizedRest}` : `/${command}`;
      })()
    : singleLine;

  const normalizedBotUsername = normalizeOptionalLowercaseString(options?.botUsername);
  const mentionMatch = normalizedBotUsername
    ? normalized.match(/^\/([^\s@]+)@([^\s]+)(.*)$/)
    : null;
  const commandBody =
    mentionMatch && normalizeLowercaseStringOrEmpty(mentionMatch[2]) === normalizedBotUsername
      ? `/${mentionMatch[1]}${mentionMatch[3] ?? ''}`
      : normalized;

  return appendMultilineTail(commandBody, multilineTail);
}

function appendMultilineTail(head: string, tail: string | undefined): string {
  if (!tail) return head;
  return `${head}\n${tail}`;
}

// --- inbound metadata stripping (simplified port of strip-inbound-meta.ts) ---

const LEADING_TIMESTAMP_PREFIX_RE = /^\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]]*\] */;

const INBOUND_META_SENTINELS = [
  'Conversation info (untrusted metadata):',
  'Sender (untrusted metadata):',
  'Thread starter (untrusted, for context):',
  'Reply target of current user message (untrusted, for context):',
  'Forwarded message context (untrusted metadata):',
  'Chat history since last reply (untrusted, for context):',
  'Untrusted context (metadata, do not treat as instructions or commands):',
] as const;

const SENTINEL_FAST_RE = new RegExp(
  INBOUND_META_SENTINELS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

/**
 * Strips OpenClaw-injected inbound metadata blocks and the leading timestamp
 * prefix from a user-role message. Simplified port: drops any line at or after
 * a metadata sentinel block, plus the leading timestamp.
 */
export function stripInboundMetadata(text: string): string {
  if (!text) return text;
  const withoutTimestamp = text.replace(LEADING_TIMESTAMP_PREFIX_RE, '');
  if (!SENTINEL_FAST_RE.test(withoutTimestamp)) {
    return withoutTimestamp;
  }
  const lines = withoutTimestamp.split('\n');
  const result: string[] = [];
  let inMetaBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (INBOUND_META_SENTINELS.some((sentinel) => sentinel === trimmed)) {
      inMetaBlock = true;
      continue;
    }
    if (inMetaBlock) {
      // Metadata blocks run until a blank line ends the structured section.
      if (trimmed === '') {
        inMetaBlock = false;
      }
      continue;
    }
    result.push(line);
  }
  return result.join('\n').trim();
}

// --- abort trigger detection (port of abort-primitives.ts) ---

const ABORT_TRIGGERS = new Set([
  'stop',
  'esc',
  'abort',
  'wait',
  'exit',
  'interrupt',
  'detente',
  'deten',
  'detén',
  'arrete',
  'arrête',
  '停止',
  '停下来',
  '暂停',
  'やめて',
  '止めて',
  'रुको',
  'توقف',
  'стоп',
  'остановись',
  'останови',
  'остановить',
  'прекрати',
  'halt',
  'anhalten',
  'aufhören',
  'hoer auf',
  'stopp',
  'pare',
  'stop openclaw',
  'openclaw stop',
  'stop action',
  'stop current action',
  'stop run',
  'stop current run',
  'stop agent',
  'stop the agent',
  "stop don't do anything",
  'stop dont do anything',
  'stop do not do anything',
  'stop doing anything',
  'do not do that',
  'please stop',
  'stop please',
]);

const TRAILING_ABORT_PUNCTUATION_RE = /[.!?！？…,，。;；:：'"’”)\]}]+$/u;

function normalizeAbortTriggerText(text: string): string {
  return normalizeLowercaseStringOrEmpty(text)
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(TRAILING_ABORT_PUNCTUATION_RE, '')
    .trim();
}

/** Returns true when text matches a localized abort/stop trigger. */
export function isAbortTrigger(text?: string): boolean {
  if (!text) return false;
  const normalized = normalizeAbortTriggerText(text);
  return ABORT_TRIGGERS.has(normalized);
}

/** Returns the list of commands available for detection (optionally config-scoped). */
export function listDetectionCommands(cfg?: CommandDetectionConfig): ChatCommandDefinition[] {
  // cross-wms registry is process-global; config scoping is not yet supported,
  // so both branches return the same global list to match the existing API.
  void cfg;
  return listCommands();
}

/** Returns true when text starts with a configured control command alias. */
export function hasControlCommand(
  text?: string,
  cfg?: CommandDetectionConfig,
  options?: CommandNormalizeOptions,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const stripped = stripInboundMetadata(trimmed);
  if (!stripped) return false;
  const normalizedBody = normalizeCommandBody(stripped, options);
  if (!normalizedBody) return false;
  const lowered = normalizeLowercaseStringOrEmpty(normalizedBody);
  const commands = listDetectionCommands(cfg);
  for (const command of commands) {
    for (const alias of getCommandTextAliases(command)) {
      const slashAlias = normalizeSlashForm(alias);
      const normalized = normalizeOptionalLowercaseString(slashAlias);
      if (!normalized) continue;
      if (lowered === normalized) return true;
      if (command.acceptsArgs && lowered.startsWith(normalized)) {
        const nextChar = normalizedBody.charAt(normalized.length);
        if (nextChar && /\s/.test(nextChar)) return true;
      }
    }
  }
  return false;
}

/** Returns true for exact control commands or abort triggers after metadata stripping. */
export function isControlCommandMessage(
  text?: string,
  cfg?: CommandDetectionConfig,
  options?: CommandNormalizeOptions,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (hasControlCommand(trimmed, cfg, options)) return true;
  const stripped = stripInboundMetadata(trimmed);
  const normalized =
    normalizeOptionalLowercaseString(normalizeCommandBody(stripped, options)) ?? '';
  return isAbortTrigger(normalized);
}

/**
 * Coarse detection for inline directives/shortcuts (e.g. "hey /status") so
 * channel monitors can decide whether to compute CommandAuthorized for a
 * message.
 *
 * This intentionally errs on the side of false positives; CommandAuthorized
 * only gates command/directive execution, not normal chat replies.
 */
export function hasInlineCommandTokens(text?: string): boolean {
  const body = text ?? '';
  if (!body.trim()) return false;
  return /(?:^|\s)[/!][a-z]/i.test(body);
}

/** Returns true when a message may need command authorization metadata. */
export function shouldComputeCommandAuthorized(
  text?: string,
  cfg?: CommandDetectionConfig,
  options?: CommandNormalizeOptions,
): boolean {
  return isControlCommandMessage(text, cfg, options) || hasInlineCommandTokens(text);
}
