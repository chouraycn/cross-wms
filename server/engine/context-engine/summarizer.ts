import { logger } from '../../logger.js';

export type SummarizationStrategy = 'extractive' | 'abstractive' | 'hybrid';

export interface SummarizerConfig {
  strategy: SummarizationStrategy;
  maxSummaryLength: number;
  minSummaryLength: number;
  compressionRatio: number;
  sentenceCount: number;
  useKeySentences: boolean;
  useNarrativeFlow: boolean;
  preserveImportantMarkers: boolean;
  importantKeywords: string[];
}

export interface SummaryResult {
  summary: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
  strategy: SummarizationStrategy;
  keyPoints: string[];
  preservedKeywords: string[];
}

export interface MessageSummary {
  id: string;
  originalRole: string;
  summary: string;
  keyPoints: string[];
  timestamp: number;
  originalTokens: number;
  summaryTokens: number;
}

const DEFAULT_CONFIG: Required<SummarizerConfig> = {
  strategy: 'extractive',
  maxSummaryLength: 500,
  minSummaryLength: 50,
  compressionRatio: 0.3,
  sentenceCount: 3,
  useKeySentences: true,
  useNarrativeFlow: true,
  preserveImportantMarkers: true,
  importantKeywords: [
    'IMPORTANT', 'TODO', 'FIXME', 'BUG', 'CRITICAL', 'WARNING',
    '重要', '关键', '必须', '注意', '紧急', '问题', '错误',
  ],
};

export class Summarizer {
  private config: Required<SummarizerConfig>;

  constructor(config: Partial<SummarizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('[Summarizer] 摘要器初始化完成');
  }

  summarize(text: string, options?: Partial<SummarizerConfig>): SummaryResult {
    const config = { ...this.config, ...options };
    const originalLength = text.length;

    if (originalLength <= config.minSummaryLength) {
      return {
        summary: text,
        originalLength,
        summaryLength: originalLength,
        compressionRatio: 1,
        strategy: config.strategy,
        keyPoints: this.extractKeyPoints(text),
        preservedKeywords: this.findImportantKeywords(text),
      };
    }

    let summary: string;
    switch (config.strategy) {
      case 'extractive':
        summary = this.extractiveSummarize(text, config);
        break;
      case 'abstractive':
        summary = this.abstractiveSummarize(text, config);
        break;
      case 'hybrid':
        summary = this.hybridSummarize(text, config);
        break;
      default:
        summary = this.extractiveSummarize(text, config);
    }

    summary = this.truncateToLength(summary, config.maxSummaryLength);

    const summaryLength = summary.length;
    const compressionRatio = summaryLength / originalLength;

    return {
      summary,
      originalLength,
      summaryLength,
      compressionRatio,
      strategy: config.strategy,
      keyPoints: this.extractKeyPoints(summary),
      preservedKeywords: this.findImportantKeywords(text),
    };
  }

  summarizeMessages(
    messages: Array<{ id: string; role: string; content: string; timestamp?: number }>,
    options?: Partial<SummarizerConfig>
  ): MessageSummary[] {
    return messages.map(msg => {
      const result = this.summarize(msg.content, options);
      return {
        id: msg.id,
        originalRole: msg.role,
        summary: result.summary,
        keyPoints: result.keyPoints,
        timestamp: msg.timestamp || Date.now(),
        originalTokens: Math.ceil(msg.content.length * 0.25),
        summaryTokens: Math.ceil(result.summaryLength * 0.25),
      };
    });
  }

  createConversationSummary(
    messages: Array<{ role: string; content: string }>,
    options?: Partial<SummarizerConfig>
  ): SummaryResult {
    const fullText = messages
      .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n');

    return this.summarize(fullText, options);
  }

  extractKeyPoints(text: string, maxPoints: number = 5): string[] {
    const sentences = this.splitSentences(text);
    const scored = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: this.scoreSentence(sentence, index, sentences.length),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored
      .slice(0, maxPoints)
      .sort((a, b) => a.index - b.index)
      .map(s => s.sentence.trim());
  }

  findImportantKeywords(text: string): string[] {
    const lowerText = text.toLowerCase();
    const found: string[] = [];

    for (const keyword of this.config.importantKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        found.push(keyword);
      }
    }

    return found;
  }

  extractiveSummarize(text: string, config: Required<SummarizerConfig>): string {
    const sentences = this.splitSentences(text);
    if (sentences.length <= config.sentenceCount) {
      return text;
    }

    const scoredSentences = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: this.scoreSentence(sentence, index, sentences.length),
    }));

    scoredSentences.sort((a, b) => b.score - a.score);

    const topSentences = scoredSentences
      .slice(0, config.sentenceCount)
      .sort((a, b) => a.index - b.index)
      .map(s => s.sentence);

    return topSentences.join(' ');
  }

  private abstractiveSummarize(text: string, config: Required<SummarizerConfig>): string {
    const keyPoints = this.extractKeyPoints(text, Math.ceil(config.sentenceCount * 1.5));
    const importantKeywords = this.findImportantKeywords(text);

    let summary = `对话摘要：${keyPoints.length} 个关键要点。`;

    if (importantKeywords.length > 0) {
      summary += ` 包含关键词: ${importantKeywords.join(', ')}。`;
    }

    summary += '\n\n要点：\n';
    keyPoints.forEach((point, i) => {
      summary += `${i + 1}. ${point}\n`;
    });

    return summary;
  }

  private hybridSummarize(text: string, config: Required<SummarizerConfig>): string {
    const extractive = this.extractiveSummarize(text, config);
    const keyPoints = this.extractKeyPoints(text, config.sentenceCount);
    const importantKeywords = this.findImportantKeywords(text);

    let result = extractive;

    if (importantKeywords.length > 0) {
      result += `\n\n[重要标记: ${importantKeywords.join(', ')}]`;
    }

    if (keyPoints.length > 0 && config.useKeySentences) {
      result += `\n\n[关键要点: ${keyPoints.length} 个]`;
    }

    return result;
  }

  private scoreSentence(sentence: string, index: number, total: number): number {
    let score = 0;

    const positionBonus = 1 - index / total;
    score += positionBonus * 0.3;

    const length = sentence.length;
    if (length > 20 && length < 200) {
      score += 0.2;
    }

    const lowerSentence = sentence.toLowerCase();
    for (const keyword of this.config.importantKeywords) {
      if (lowerSentence.includes(keyword.toLowerCase())) {
        score += 0.3;
        break;
      }
    }

    const numbers = sentence.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      score += 0.1;
    }

    if (sentence.includes('结论') || sentence.includes('总结') || sentence.includes('因此') ||
        sentence.includes('conclusion') || sentence.includes('summary') || sentence.includes('therefore')) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  private splitSentences(text: string): string[] {
    const sentences: string[] = [];
    const chinesePattern = /[^。！？!?]+[。！？!?]+/g;
    const englishPattern = /[^.!?]+[.!?]+/g;

    let remaining = text;
    const allMatches: Array<{ start: number; end: number; text: string }> = [];

    let match;
    const chineseRegex = new RegExp(chinesePattern);
    while ((match = chineseRegex.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }

    const englishRegex = new RegExp(englishPattern);
    while ((match = englishRegex.exec(text)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlap = allMatches.some(m => start < m.end && end > m.start);
      if (!overlap) {
        allMatches.push({ start, end, text: match[0] });
      }
    }

    allMatches.sort((a, b) => a.start - b.start);

    let lastEnd = 0;
    for (const m of allMatches) {
      if (m.start > lastEnd) {
        const gap = text.slice(lastEnd, m.start).trim();
        if (gap.length > 0) {
          sentences.push(gap);
        }
      }
      sentences.push(m.text.trim());
      lastEnd = m.end;
    }

    if (lastEnd < text.length) {
      const remainder = text.slice(lastEnd).trim();
      if (remainder.length > 0) {
        sentences.push(remainder);
      }
    }

    if (sentences.length === 0 && text.trim().length > 0) {
      sentences.push(text.trim());
    }

    return sentences.filter(s => s.length > 0);
  }

  private truncateToLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const sentences = this.splitSentences(text);
    let result = '';

    for (const sentence of sentences) {
      if (result.length + sentence.length + 1 <= maxLength - 3) {
        result += (result.length > 0 ? ' ' : '') + sentence;
      } else {
        break;
      }
    }

    if (result.length === 0) {
      result = text.slice(0, maxLength - 3);
    }

    return result + '...';
  }
}
