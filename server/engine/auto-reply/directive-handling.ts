import {
  extractThinkDirective,
  extractVerboseDirective,
  extractTraceDirective,
  extractElevatedDirective,
  extractReasoningDirective,
  extractFastDirective,
} from './directives.js';
import { extractModelDirective } from './model.js';
import { extractExecDirective } from './exec.js';
import { extractQueueDirective } from './queue.js';
import type {
  ThinkLevel,
  VerboseLevel,
  TraceLevel,
  ElevatedLevel,
  ReasoningLevel,
  FastMode,
} from './types.js';
import type { QueueMode } from './queue.js';

export type DirectiveLevels = {
  think?: ThinkLevel;
  verbose?: VerboseLevel;
  trace?: TraceLevel;
  elevated?: ElevatedLevel;
  reasoning?: ReasoningLevel;
  fast?: FastMode;
};

export type DirectiveModel = {
  model?: string;
  profile?: string;
  runtime?: string;
};

export type DirectiveExec = {
  requested: boolean;
  command?: string;
};

export type ParsedDirectives = {
  levels: DirectiveLevels;
  model: DirectiveModel;
  exec: DirectiveExec;
  queueMode?: QueueMode;
  hasDirectives: boolean;
  cleanedText: string;
  rawDirectives: string[];
};

export type DirectiveParseOptions = {
  modelAliases?: string[];
};

export function parseDirectives(
  text: string,
  options: DirectiveParseOptions = {},
): ParsedDirectives {
  let cleaned = text;
  const rawDirectives: string[] = [];
  const levels: DirectiveLevels = {};
  const model: DirectiveModel = {};
  const exec: DirectiveExec = { requested: false };
  let queueMode: QueueMode | undefined;

  const thinkResult = extractThinkDirective(cleaned);
  if (thinkResult.hasDirective) {
    levels.think = thinkResult.level;
    rawDirectives.push(`/think${thinkResult.rawLevel ? `:${thinkResult.rawLevel}` : ''}`);
    cleaned = thinkResult.cleaned;
  }

  const verboseResult = extractVerboseDirective(cleaned);
  if (verboseResult.hasDirective) {
    levels.verbose = verboseResult.level;
    rawDirectives.push(`/verbose${verboseResult.rawLevel ? `:${verboseResult.rawLevel}` : ''}`);
    cleaned = verboseResult.cleaned;
  }

  const traceResult = extractTraceDirective(cleaned);
  if (traceResult.hasDirective) {
    levels.trace = traceResult.level;
    rawDirectives.push(`/trace${traceResult.rawLevel ? `:${traceResult.rawLevel}` : ''}`);
    cleaned = traceResult.cleaned;
  }

  const elevatedResult = extractElevatedDirective(cleaned);
  if (elevatedResult.hasDirective) {
    levels.elevated = elevatedResult.level;
    rawDirectives.push(`/elevated${elevatedResult.rawLevel ? `:${elevatedResult.rawLevel}` : ''}`);
    cleaned = elevatedResult.cleaned;
  }

  const reasoningResult = extractReasoningDirective(cleaned);
  if (reasoningResult.hasDirective) {
    levels.reasoning = reasoningResult.level;
    rawDirectives.push(`/reasoning${reasoningResult.rawLevel ? `:${reasoningResult.rawLevel}` : ''}`);
    cleaned = reasoningResult.cleaned;
  }

  const fastResult = extractFastDirective(cleaned);
  if (fastResult.hasDirective) {
    levels.fast = fastResult.level;
    rawDirectives.push(`/fast${fastResult.rawLevel ? `:${fastResult.rawLevel}` : ''}`);
    cleaned = fastResult.cleaned;
  }

  const modelResult = extractModelDirective(cleaned, { aliases: options.modelAliases });
  if (modelResult.hasDirective) {
    model.model = modelResult.rawModel;
    model.profile = modelResult.rawProfile;
    model.runtime = modelResult.rawRuntime;
    rawDirectives.push(
      `/model${modelResult.rawModel ? `:${modelResult.rawModel}` : ''}${modelResult.rawRuntime ? ` --runtime ${modelResult.rawRuntime}` : ''}`,
    );
    cleaned = modelResult.cleaned;
  }

  const execResult = extractExecDirective(cleaned);
  if (execResult.hasDirective) {
    exec.requested = true;
    exec.command = execResult.rawCommand;
    rawDirectives.push(`/exec${execResult.rawCommand ? `:${execResult.rawCommand}` : ''}`);
    cleaned = execResult.cleaned;
  }

  const queueResult = extractQueueDirective(cleaned);
  if (queueResult.hasDirective) {
    queueMode = queueResult.queueMode;
    rawDirectives.push(`/queue${queueResult.queueMode ? `:${queueResult.queueMode}` : ''}`);
    cleaned = queueResult.cleaned;
  }

  return {
    levels,
    model,
    exec,
    queueMode,
    hasDirectives: rawDirectives.length > 0,
    cleanedText: cleaned,
    rawDirectives,
  };
}

export function hasDirective(text: string, directiveName: string): boolean {
  const pattern = new RegExp(`(?:^|\\s)\\/${directiveName}(?=$|\\s|:)`, 'i');
  return pattern.test(text);
}

export function extractAllDirectiveNames(text: string): string[] {
  const matches = text.match(/(?:^|\s)\/([a-z-]+)(?=$|\s|:)/gi);
  if (!matches) return [];
  return matches.map((m) => m.trim().slice(1).toLowerCase());
}

export function normalizeThinkLevel(raw?: string): ThinkLevel | undefined {
  if (!raw) return 'medium';
  const lower = raw.toLowerCase();
  const levels: ThinkLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  return levels.includes(lower as ThinkLevel) ? (lower as ThinkLevel) : undefined;
}

export function normalizeVerboseLevel(raw?: string): VerboseLevel | undefined {
  if (!raw) return 'on';
  const lower = raw.toLowerCase();
  if (lower === 'on' || lower === 'true' || lower === '1') return 'on';
  if (lower === 'off' || lower === 'false' || lower === '0') return 'off';
  return undefined;
}

export function normalizeTraceLevel(raw?: string): TraceLevel | undefined {
  if (!raw) return 'on';
  const lower = raw.toLowerCase();
  if (lower === 'on' || lower === 'true') return 'on';
  if (lower === 'detailed') return 'detailed';
  if (lower === 'off' || lower === 'false') return 'off';
  return undefined;
}

export function normalizeFastMode(raw?: string): FastMode | undefined {
  if (!raw) return 'fast';
  const lower = raw.toLowerCase();
  if (lower === 'fast' || lower === 'on' || lower === 'true') return 'fast';
  if (lower === 'faster') return 'faster';
  if (lower === 'off' || lower === 'false') return 'off';
  return undefined;
}
