import type {
  ThinkLevel,
  VerboseLevel,
  TraceLevel,
  ElevatedLevel,
  ReasoningLevel,
  FastMode,
} from './types.js';

type ExtractedLevel<T> = {
  cleaned: string;
  level?: T;
  rawLevel?: string;
  hasDirective: boolean;
};

function compileDirectivePattern(names: readonly string[], suffix = ''): RegExp {
  const namePattern = names.map(escapeRegExp).join('|');
  return new RegExp(`(?:^|\\s)\\/(?:${namePattern})(?=$|\\s|:)${suffix}`, 'i');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const THINK_DIRECTIVE_PATTERN = compileDirectivePattern(['thinking', 'think', 't']);
const VERBOSE_DIRECTIVE_PATTERN = compileDirectivePattern(['verbose', 'v']);
const TRACE_DIRECTIVE_PATTERN = compileDirectivePattern(['trace']);
const FAST_DIRECTIVE_PATTERN = compileDirectivePattern(['fast']);
const ELEVATED_DIRECTIVE_PATTERN = compileDirectivePattern(['elevated', 'elev']);
const REASONING_DIRECTIVE_PATTERN = compileDirectivePattern(['reasoning', 'reason']);
const STATUS_DIRECTIVE_PATTERN = compileDirectivePattern(['status'], `(?:\\s*:\\s*)?`);

function matchLevelDirective(
  body: string,
  pattern: RegExp,
): { start: number; end: number; rawLevel?: string } | null {
  const match = body.match(pattern);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  let end = match.index + match[0].length;
  let i = end;
  while (i < body.length && /\s/.test(body[i])) i += 1;
  if (body[i] === ':') {
    i += 1;
    while (i < body.length && /\s/.test(body[i])) i += 1;
  }
  const argStart = i;
  while (i < body.length && /[A-Za-z-]/.test(body[i])) i += 1;
  const rawLevel = i > argStart ? body.slice(argStart, i) : undefined;
  end = i;
  return { start, end, rawLevel };
}

function extractLevelDirective<T>(
  body: string,
  pattern: RegExp,
  normalize: (raw?: string) => T | undefined,
): ExtractedLevel<T> {
  const match = matchLevelDirective(body, pattern);
  if (!match) return { cleaned: body.trim(), hasDirective: false };
  const rawLevel = match.rawLevel;
  const level = normalize(rawLevel);
  const cleaned = body.slice(0, match.start).concat(' ').concat(body.slice(match.end)).replace(/\s+/g, ' ').trim();
  return { cleaned, level, rawLevel, hasDirective: true };
}

function extractSimpleDirective(
  body: string,
  pattern: RegExp,
): { cleaned: string; hasDirective: boolean } {
  const match = body.match(pattern);
  const cleaned = match ? body.replace(match[0], ' ').replace(/\s+/g, ' ').trim() : body.trim();
  return { cleaned, hasDirective: Boolean(match) };
}

function normalizeThinkLevel(raw?: string): ThinkLevel | undefined {
  if (!raw) return 'medium';
  const lower = raw.toLowerCase();
  const levels: ThinkLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  return levels.includes(lower as ThinkLevel) ? lower as ThinkLevel : undefined;
}

function normalizeVerboseLevel(raw?: string): VerboseLevel | undefined {
  if (!raw) return 'on';
  const lower = raw.toLowerCase();
  if (lower === 'on' || lower === 'true' || lower === '1') return 'on';
  if (lower === 'off' || lower === 'false' || lower === '0') return 'off';
  return undefined;
}

function normalizeTraceLevel(raw?: string): TraceLevel | undefined {
  if (!raw) return 'on';
  const lower = raw.toLowerCase();
  if (lower === 'on' || lower === 'true') return 'on';
  if (lower === 'detailed') return 'detailed';
  if (lower === 'off' || lower === 'false') return 'off';
  return undefined;
}

function normalizeElevatedLevel(raw?: string): ElevatedLevel | undefined {
  if (!raw) return 'on';
  const lower = raw.toLowerCase();
  if (lower === 'on' || lower === 'true') return 'on';
  if (lower === 'off' || lower === 'false') return 'off';
  return undefined;
}

function normalizeReasoningLevel(raw?: string): ReasoningLevel | undefined {
  if (!raw) return 'medium';
  const lower = raw.toLowerCase();
  const levels: ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'max'];
  return levels.includes(lower as ReasoningLevel) ? lower as ReasoningLevel : undefined;
}

function normalizeFastMode(raw?: string): FastMode | undefined {
  if (!raw) return 'fast';
  const lower = raw.toLowerCase();
  if (lower === 'fast' || lower === 'on' || lower === 'true') return 'fast';
  if (lower === 'faster') return 'faster';
  if (lower === 'off' || lower === 'false') return 'off';
  return undefined;
}

export function extractThinkDirective(body?: string): ExtractedLevel<ThinkLevel> {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractLevelDirective(body, THINK_DIRECTIVE_PATTERN, normalizeThinkLevel);
}

export function extractVerboseDirective(body?: string): ExtractedLevel<VerboseLevel> {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractLevelDirective(body, VERBOSE_DIRECTIVE_PATTERN, normalizeVerboseLevel);
}

export function extractTraceDirective(body?: string): ExtractedLevel<TraceLevel> {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractLevelDirective(body, TRACE_DIRECTIVE_PATTERN, normalizeTraceLevel);
}

export function extractElevatedDirective(body?: string): ExtractedLevel<ElevatedLevel> {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractLevelDirective(body, ELEVATED_DIRECTIVE_PATTERN, normalizeElevatedLevel);
}

export function extractReasoningDirective(body?: string): ExtractedLevel<ReasoningLevel> {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractLevelDirective(body, REASONING_DIRECTIVE_PATTERN, normalizeReasoningLevel);
}

export function extractStatusDirective(body?: string): { cleaned: string; hasDirective: boolean } {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractSimpleDirective(body, STATUS_DIRECTIVE_PATTERN);
}

export function extractFastDirective(body?: string): ExtractedLevel<FastMode> {
  if (!body) return { cleaned: '', hasDirective: false };
  return extractLevelDirective(body, FAST_DIRECTIVE_PATTERN, normalizeFastMode);
}
