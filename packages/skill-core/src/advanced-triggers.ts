export type AdvancedTriggerType = 'semantic' | 'fuzzy' | 'contextual' | 'composite' | 'ai-classifier';

export interface SemanticTrigger {
  type: 'semantic';
  description: string;
  examples: string[];
  threshold?: number;
  embeddingModel?: string;
}

export interface FuzzyTrigger {
  type: 'fuzzy';
  pattern: string;
  maxDistance?: number;
  caseSensitive?: boolean;
}

export interface ContextualTrigger {
  type: 'contextual';
  requiredContext: string[];
  forbiddenContext?: string[];
  weight?: number;
}

export interface CompositeTrigger {
  type: 'composite';
  operator: 'AND' | 'OR' | 'NOT';
  triggers: Array<KeywordTrigger | RegexTrigger | CommandTrigger | SemanticTrigger | FuzzyTrigger | ContextualTrigger>;
}

export interface AiClassifierTrigger {
  type: 'ai-classifier';
  prompt: string;
  examples: Array<{ input: string; matches: boolean; confidence: number }>;
  model?: string;
}

export interface KeywordTrigger {
  type: 'keyword';
  keywords: string[];
}

export interface RegexTrigger {
  type: 'regex';
  pattern: string;
}

export interface CommandTrigger {
  type: 'command';
  command: string;
}

export type AdvancedTrigger =
  | KeywordTrigger
  | RegexTrigger
  | CommandTrigger
  | SemanticTrigger
  | FuzzyTrigger
  | ContextualTrigger
  | CompositeTrigger
  | AiClassifierTrigger;

export interface AdvancedMatch {
  trigger: AdvancedTrigger;
  confidence: number;
  matchedText?: string;
  context?: Record<string, unknown>;
  extractedParams?: Record<string, unknown>;
}

export interface AdvancedTriggerOptions {
  fuzzyMatcher?: (input: string, pattern: string) => number;
  contextProvider?: () => Record<string, unknown>;
  aiClassifier?: (input: string, prompt: string) => Promise<{ matches: boolean; confidence: number }>;
  semanticMatcher?: (input: string, description: string, threshold?: number) => Promise<number>;
}

export class AdvancedTriggerEngine {
  private options: AdvancedTriggerOptions;

  constructor(options: AdvancedTriggerOptions = {}) {
    this.options = options;
  }

  async match(input: string, triggers: AdvancedTrigger[]): Promise<AdvancedMatch[]> {
    const matches: AdvancedMatch[] = [];

    for (const trigger of triggers) {
      const match = await this.matchSingle(input, trigger);
      if (match && match.confidence > 0) {
        matches.push(match);
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private async matchSingle(input: string, trigger: AdvancedTrigger): Promise<AdvancedMatch | null> {
    switch (trigger.type) {
      case 'keyword':
        return this.matchKeyword(input, trigger);
      case 'regex':
        return this.matchRegex(input, trigger);
      case 'command':
        return this.matchCommand(input, trigger);
      case 'semantic':
        return this.matchSemantic(input, trigger);
      case 'fuzzy':
        return this.matchFuzzy(input, trigger);
      case 'contextual':
        return this.matchContextual(input, trigger);
      case 'composite':
        return this.matchComposite(input, trigger);
      case 'ai-classifier':
        return this.matchAiClassifier(input, trigger);
      default:
        return null;
    }
  }

  private matchKeyword(input: string, trigger: KeywordTrigger): AdvancedMatch | null {
    const lowerInput = input.toLowerCase();
    const matched = trigger.keywords.filter(k => lowerInput.includes(k.toLowerCase()));
    if (matched.length === 0) return null;

    return {
      trigger,
      confidence: matched.length / trigger.keywords.length,
      matchedText: matched.join(', '),
    };
  }

  private matchRegex(input: string, trigger: RegexTrigger): AdvancedMatch | null {
    try {
      const regex = new RegExp(trigger.pattern, 'i');
      const match = input.match(regex);
      if (!match) return null;

      return {
        trigger,
        confidence: 0.9,
        matchedText: match[0],
        extractedParams: match.groups ? { ...match.groups } : undefined,
      };
    } catch {
      return null;
    }
  }

  private matchCommand(input: string, trigger: CommandTrigger): AdvancedMatch | null {
    if (input.startsWith(`/${trigger.command}`)) {
      return {
        trigger,
        confidence: 1.0,
        matchedText: trigger.command,
      };
    }
    return null;
  }

  private async matchSemantic(input: string, trigger: SemanticTrigger): Promise<AdvancedMatch | null> {
    if (!this.options.semanticMatcher) return null;

    const threshold = trigger.threshold ?? 0.7;
    const score = await this.options.semanticMatcher(input, trigger.description, threshold);

    if (score < threshold) return null;

    return {
      trigger,
      confidence: score,
      context: { description: trigger.description, examples: trigger.examples },
    };
  }

  private async matchFuzzy(input: string, trigger: FuzzyTrigger): Promise<AdvancedMatch | null> {
    if (!this.options.fuzzyMatcher) {
      return this.levenshteinMatch(input, trigger);
    }

    const distance = this.options.fuzzyMatcher(input, trigger.pattern);
    const maxDistance = trigger.maxDistance ?? 3;

    if (distance > maxDistance) return null;

    return {
      trigger,
      confidence: 1 - (distance / Math.max(input.length, trigger.pattern.length)),
      matchedText: trigger.pattern,
    };
  }

  private levenshteinMatch(input: string, trigger: FuzzyTrigger): AdvancedMatch | null {
    const lowerInput = trigger.caseSensitive ? input : input.toLowerCase();
    const lowerPattern = trigger.caseSensitive ? trigger.pattern : trigger.pattern.toLowerCase();
    const maxDistance = trigger.maxDistance ?? 3;

    let minDistance = Infinity;
    for (let i = 0; i <= lowerInput.length - lowerPattern.length; i++) {
      const substring = lowerInput.substring(i, i + lowerPattern.length);
      const distance = this.levenshteinDistance(substring, lowerPattern);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    if (minDistance > maxDistance) return null;

    return {
      trigger,
      confidence: 1 - (minDistance / Math.max(lowerInput.length, lowerPattern.length)),
      matchedText: trigger.pattern,
    };
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private async matchContextual(input: string, trigger: ContextualTrigger): Promise<AdvancedMatch | null> {
    if (!this.options.contextProvider) return null;

    const context = this.options.contextProvider();
    const required = trigger.requiredContext || [];
    const forbidden = trigger.forbiddenContext || [];

    const hasAllRequired = required.every(key => Boolean(context[key]));
    const hasForbidden = forbidden.some(key => Boolean(context[key]));

    if (!hasAllRequired || hasForbidden) return null;

    return {
      trigger,
      confidence: trigger.weight ?? 0.8,
      context: { ...context },
    };
  }

  private async matchComposite(input: string, trigger: CompositeTrigger): Promise<AdvancedMatch | null> {
    const subMatches = await Promise.all(
      trigger.triggers.map(t => this.matchSingle(input, t))
    );
    const validMatches = subMatches.filter((m): m is AdvancedMatch => m !== null);

    let matched = false;
    switch (trigger.operator) {
      case 'AND':
        matched = validMatches.length === trigger.triggers.length;
        break;
      case 'OR':
        matched = validMatches.length > 0;
        break;
      case 'NOT':
        matched = validMatches.length === 0;
        break;
    }

    if (!matched) return null;

    const avgConfidence = validMatches.length > 0
      ? validMatches.reduce((sum, m) => sum + m.confidence, 0) / validMatches.length
      : 0;

    return {
      trigger,
      confidence: avgConfidence,
      matchedText: validMatches.map(m => m.matchedText).filter(Boolean).join(', '),
    };
  }

  private async matchAiClassifier(input: string, trigger: AiClassifierTrigger): Promise<AdvancedMatch | null> {
    if (!this.options.aiClassifier) return null;

    try {
      const result = await this.options.aiClassifier(input, trigger.prompt);
      if (!result.matches) return null;

      return {
        trigger,
        confidence: result.confidence,
        context: { examples: trigger.examples },
      };
    } catch {
      return null;
    }
  }
}

export const advancedTriggerEngine = new AdvancedTriggerEngine();