import { logger } from '../../logger.js';
import type { SecurityFinding, SecurityLevel } from './types.js';

type QuantifierRead = {
  consumed: number;
  minRepeat: number;
  maxRepeat: number | null;
};

type TokenState = {
  containsRepetition: boolean;
  hasAmbiguousAlternation: boolean;
  minLength: number;
  maxLength: number;
};

type ParseFrame = {
  lastToken: TokenState | null;
  containsRepetition: boolean;
  hasAlternation: boolean;
  branchMinLength: number;
  branchMaxLength: number;
  altMinLength: number | null;
  altMaxLength: number | null;
};

type PatternToken =
  | { kind: 'simple-token' }
  | { kind: 'group-open' }
  | { kind: 'group-close' }
  | { kind: 'alternation' }
  | { kind: 'quantifier'; quantifier: QuantifierRead };

const SAFE_REGEX_CACHE_MAX = 256;
const SAFE_REGEX_TEST_WINDOW = 2048;

export type SafeRegexRejectReason =
  | 'empty'
  | 'unsafe-nested-repetition'
  | 'invalid-regex'
  | 'too-long'
  | 'unsafe-pattern';

export type SafeRegexCompileResult =
  | {
      regex: RegExp;
      source: string;
      flags: string;
      reason: null;
    }
  | {
      regex: null;
      source: string;
      flags: string;
      reason: SafeRegexRejectReason;
      detail?: string;
    };

const safeRegexCache = new Map<string, SafeRegexCompileResult>();

const DANGEROUS_PATTERNS = [
  { pattern: /\(.*\)[*+]/, name: 'group repetition' },
  { pattern: /\[.*\][*+].*\[.*\][*+]/, name: 'multiple character class repetition' },
  { pattern: /\.\*.*\.\*/, name: 'multiple wildcard repetition' },
  { pattern: /\(.*\|.*\)[*+]/, name: 'alternation with repetition' },
];

function createParseFrame(): ParseFrame {
  return {
    lastToken: null,
    containsRepetition: false,
    hasAlternation: false,
    branchMinLength: 0,
    branchMaxLength: 0,
    altMinLength: null,
    altMaxLength: null,
  };
}

function addLength(left: number, right: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return Number.POSITIVE_INFINITY;
  }
  return left + right;
}

function multiplyLength(length: number, factor: number): number {
  if (!Number.isFinite(length)) {
    return factor === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return length * factor;
}

function recordAlternative(frame: ParseFrame): void {
  if (frame.altMinLength === null || frame.altMaxLength === null) {
    frame.altMinLength = frame.branchMinLength;
    frame.altMaxLength = frame.branchMaxLength;
    return;
  }
  frame.altMinLength = Math.min(frame.altMinLength, frame.branchMinLength);
  frame.altMaxLength = Math.max(frame.altMaxLength, frame.branchMaxLength);
}

function readQuantifier(source: string, index: number): QuantifierRead | null {
  const ch = source[index];
  const consumed = source[index + 1] === '?' ? 2 : 1;
  if (ch === '*') {
    return { consumed, minRepeat: 0, maxRepeat: null };
  }
  if (ch === '+') {
    return { consumed, minRepeat: 1, maxRepeat: null };
  }
  if (ch === '?') {
    return { consumed, minRepeat: 0, maxRepeat: 1 };
  }
  if (ch !== '{') {
    return null;
  }

  let i = index + 1;
  while (i < source.length && /\d/.test(source[i])) {
    i += 1;
  }
  if (i === index + 1) {
    return null;
  }

  const minRepeat = Number.parseInt(source.slice(index + 1, i), 10);
  let maxRepeat: number | null = minRepeat;
  if (source[i] === ',') {
    i += 1;
    const maxStart = i;
    while (i < source.length && /\d/.test(source[i])) {
      i += 1;
    }
    maxRepeat = i === maxStart ? null : Number.parseInt(source.slice(maxStart, i), 10);
  }

  if (source[i] !== '}') {
    return null;
  }
  i += 1;
  if (source[i] === '?') {
    i += 1;
  }
  if (maxRepeat !== null && maxRepeat < minRepeat) {
    return null;
  }

  return { consumed: i - index, minRepeat, maxRepeat };
}

function tokenizePattern(source: string): PatternToken[] {
  const tokens: PatternToken[] = [];
  let inCharClass = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inCharClass) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === ']') {
        inCharClass = false;
      }
      continue;
    }

    if (ch === '\\') {
      i += 1;
      tokens.push({ kind: 'simple-token' });
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      tokens.push({ kind: 'simple-token' });
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'group-open' });
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'group-close' });
      continue;
    }

    if (ch === '|') {
      tokens.push({ kind: 'alternation' });
      continue;
    }

    const quantifier = readQuantifier(source, i);
    if (quantifier) {
      tokens.push({ kind: 'quantifier', quantifier });
      i += quantifier.consumed - 1;
      continue;
    }

    tokens.push({ kind: 'simple-token' });
  }

  return tokens;
}

function analyzeTokensForNestedRepetition(tokens: PatternToken[]): boolean {
  const frames: ParseFrame[] = [createParseFrame()];

  const emitToken = (token: TokenState) => {
    const frame = frames[frames.length - 1];
    frame.lastToken = token;
    if (token.containsRepetition) {
      frame.containsRepetition = true;
    }
    frame.branchMinLength = addLength(frame.branchMinLength, token.minLength);
    frame.branchMaxLength = addLength(frame.branchMaxLength, token.maxLength);
  };

  const emitSimpleToken = () => {
    emitToken({
      containsRepetition: false,
      hasAmbiguousAlternation: false,
      minLength: 1,
      maxLength: 1,
    });
  };

  for (const token of tokens) {
    if (token.kind === 'simple-token') {
      emitSimpleToken();
      continue;
    }

    if (token.kind === 'group-open') {
      frames.push(createParseFrame());
      continue;
    }

    if (token.kind === 'group-close') {
      if (frames.length > 1) {
        const frame = frames.pop() as ParseFrame;
        if (frame.hasAlternation) {
          recordAlternative(frame);
        }
        const groupMinLength = frame.hasAlternation
          ? (frame.altMinLength ?? 0)
          : frame.branchMinLength;
        const groupMaxLength = frame.hasAlternation
          ? (frame.altMaxLength ?? 0)
          : frame.branchMaxLength;
        emitToken({
          containsRepetition: frame.containsRepetition,
          hasAmbiguousAlternation:
            frame.hasAlternation &&
            frame.altMinLength !== null &&
            frame.altMaxLength !== null &&
            frame.altMinLength !== frame.altMaxLength,
          minLength: groupMinLength,
          maxLength: groupMaxLength,
        });
      }
      continue;
    }

    if (token.kind === 'alternation') {
      const frame = frames[frames.length - 1];
      frame.hasAlternation = true;
      recordAlternative(frame);
      frame.branchMinLength = 0;
      frame.branchMaxLength = 0;
      frame.lastToken = null;
      continue;
    }

    const frame = frames[frames.length - 1];
    const previousToken = frame.lastToken;
    if (!previousToken) {
      continue;
    }
    if (previousToken.containsRepetition) {
      return true;
    }
    if (previousToken.hasAmbiguousAlternation && token.quantifier.maxRepeat === null) {
      return true;
    }

    const previousMinLength = previousToken.minLength;
    const previousMaxLength = previousToken.maxLength;
    previousToken.minLength = multiplyLength(previousToken.minLength, token.quantifier.minRepeat);
    previousToken.maxLength =
      token.quantifier.maxRepeat === null
        ? Number.POSITIVE_INFINITY
        : multiplyLength(previousToken.maxLength, token.quantifier.maxRepeat);
    previousToken.containsRepetition = true;
    frame.containsRepetition = true;
    frame.branchMinLength = frame.branchMinLength - previousMinLength + previousToken.minLength;

    const branchMaxBase =
      Number.isFinite(frame.branchMaxLength) && Number.isFinite(previousMaxLength)
        ? frame.branchMaxLength - previousMaxLength
        : Number.POSITIVE_INFINITY;
    frame.branchMaxLength = addLength(branchMaxBase, previousToken.maxLength);
  }

  return false;
}

export function hasNestedRepetition(source: string): boolean {
  return analyzeTokensForNestedRepetition(tokenizePattern(source));
}

export function detectRedoSrisks(source: string): string[] {
  const risks: string[] = [];

  if (hasNestedRepetition(source)) {
    risks.push('Nested repetition detected - potential catastrophic backtracking');
  }

  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.pattern.test(source)) {
      risks.push(`Potential ReDoS pattern: ${dangerous.name}`);
    }
  }

  return risks;
}

export function compileSafeRegexDetailed(
  source: string,
  flags = '',
): SafeRegexCompileResult {
  const trimmed = source.trim();
  if (!trimmed) {
    return { regex: null, source: trimmed, flags, reason: 'empty' };
  }

  if (trimmed.length > 4096) {
    return {
      regex: null,
      source: trimmed,
      flags,
      reason: 'too-long',
      detail: 'Pattern exceeds maximum length of 4096 characters',
    };
  }

  const cacheKey = `${flags}::${trimmed}`;
  if (safeRegexCache.has(cacheKey)) {
    return (
      safeRegexCache.get(cacheKey) ?? {
        regex: null,
        source: trimmed,
        flags,
        reason: 'invalid-regex',
      }
    );
  }

  let result: SafeRegexCompileResult;

  const redoSrisks = detectRedoSrisks(trimmed);
  if (redoSrisks.length > 0) {
    result = {
      regex: null,
      source: trimmed,
      flags,
      reason: 'unsafe-nested-repetition',
      detail: redoSrisks.join('; '),
    };
  } else {
    try {
      result = { regex: new RegExp(trimmed, flags), source: trimmed, flags, reason: null };
    } catch (err) {
      result = {
        regex: null,
        source: trimmed,
        flags,
        reason: 'invalid-regex',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  safeRegexCache.set(cacheKey, result);
  if (safeRegexCache.size > SAFE_REGEX_CACHE_MAX) {
    const oldestKey = safeRegexCache.keys().next().value;
    if (oldestKey) {
      safeRegexCache.delete(oldestKey);
    }
  }

  if (result.reason) {
    logger.debug(`[Security:SafeRegex] Rejected pattern: ${result.reason}`, result.detail);
  }

  return result;
}

export function compileSafeRegex(source: string, flags = ''): RegExp | null {
  return compileSafeRegexDetailed(source, flags).regex;
}

export function testRegexWithBoundedInput(
  regex: RegExp,
  input: string,
  maxWindow = SAFE_REGEX_TEST_WINDOW,
): boolean {
  if (maxWindow <= 0) {
    return false;
  }
  if (input.length <= maxWindow) {
    regex.lastIndex = 0;
    return regex.test(input);
  }
  const head = input.slice(0, maxWindow);
  regex.lastIndex = 0;
  if (regex.test(head)) {
    return true;
  }
  regex.lastIndex = 0;
  return regex.test(input.slice(-maxWindow));
}

export function auditRegexPattern(pattern: string, patternId: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const result = compileSafeRegexDetailed(pattern);

  if (result.reason === 'unsafe-nested-repetition') {
    const severity: SecurityLevel = 'high';
    findings.push({
      id: `regex-redos-${patternId}`,
      title: `Potential ReDoS vulnerability in pattern: ${patternId}`,
      severity,
      category: 'regex',
      description: `Regular expression pattern may be vulnerable to Regular Expression Denial of Service (ReDoS) attacks. ${result.detail ?? ''}`,
      recommendation: 'Rewrite the pattern to avoid nested repetition and catastrophic backtracking. Use compileSafeRegex to validate patterns before use.',
      metadata: { patternId, pattern, detail: result.detail },
    });
  }

  if (result.reason === 'too-long') {
    findings.push({
      id: `regex-too-long-${patternId}`,
      title: `Regex pattern too long: ${patternId}`,
      severity: 'medium',
      category: 'regex',
      description: result.detail ?? 'Pattern exceeds maximum safe length',
      recommendation: 'Simplify the regular expression pattern or split it into multiple smaller patterns.',
      metadata: { patternId, patternLength: pattern.length },
    });
  }

  if (result.reason === 'invalid-regex') {
    findings.push({
      id: `regex-invalid-${patternId}`,
      title: `Invalid regex pattern: ${patternId}`,
      severity: 'low',
      category: 'regex',
      description: result.detail ?? 'Pattern is not a valid regular expression',
      recommendation: 'Fix the regular expression syntax errors.',
      metadata: { patternId },
    });
  }

  return findings;
}
