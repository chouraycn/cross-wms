import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skills-research-text" });

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "must", "ought", "used",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further",
  "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so",
  "than", "too", "very", "just", "because", "but", "and", "or",
  "if", "while", "although", "though", "that", "this", "these",
  "those", "it", "its", "i", "me", "my", "myself", "we", "our",
  "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself",
  "they", "them", "their", "theirs", "themselves", "what", "which",
  "who", "whom", "whose", "about", "up", "down", "also", "until",
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人",
  "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
  "你", "会", "着", "没有", "看", "好", "自己", "这", "那",
  "他", "她", "它", "们", "这个", "那个", "这些", "那些",
  "什么", "怎么", "为什么", "哪里", "如何", "可以", "能",
  "已经", "还", "就是", "但", "但是", "而", "而且", "或",
  "或者", "因为", "所以", "如果", "虽然", "不过", "然后",
]);

const TOOL_PATTERNS = [
  /\b(?:use|using|run|execute|call|invoke)\s+(\w+[-_]?\w*)\s*(?:tool|command|function)?\b/gi,
  /\b(\w+[-_]?\w*)\s*(?:tool|command|function|utility)\b/gi,
];

export function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  const tokens: string[] = [];

  const englishWords = text.match(/[a-zA-Z][a-zA-Z0-9_-]*/g) ?? [];
  tokens.push(...englishWords.map((w) => w.toLowerCase()));

  const chineseChars = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const segment of chineseChars) {
    if (segment.length <= 4) {
      tokens.push(segment);
    } else {
      for (let i = 0; i < segment.length - 1; i++) {
        tokens.push(segment.slice(i, i + 2));
      }
    }
  }

  return tokens;
}

export function extractKeywords(text: string, limit: number = 10): string[] {
  if (!text) {
    return [];
  }

  const tokens = tokenize(text);
  const wordFreq = new Map<string, number>();

  for (const token of tokens) {
    if (token.length < 2) continue;
    if (STOP_WORDS.has(token.toLowerCase())) continue;

    wordFreq.set(token, (wordFreq.get(token) ?? 0) + 1);
  }

  const sorted = Array.from(wordFreq.entries())
    .sort((a, b) => {
      const freqDiff = b[1] - a[1];
      if (freqDiff !== 0) return freqDiff;
      return b[0].length - a[0].length;
    })
    .slice(0, limit)
    .map(([word]) => word);

  return sorted;
}

export function detectIntent(text: string): string[] {
  if (!text) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const intents: string[] = [];

  const intentPatterns: Record<string, RegExp[]> = {
    "code-generation": [
      /\b(?:create|generate|write|build|develop|implement)\s*(?:code|function|class|component|script)?\b/i,
      /\b(?:new|add)\s+(?:feature|functionality|module|component)\b/i,
    ],
    "code-review": [
      /\b(?:review|check|analyze|audit)\s*(?:code|pr|pull request|merge request)?\b/i,
      /\bcodereview\b/i,
    ],
    "debugging": [
      /\b(?:debug|fix|error|bug|issue|problem|crash|fail(?:ed|ure)?)\b/i,
      /\b(?:not working|doesn't work|can't|cannot|unable)\b/i,
    ],
    "documentation": [
      /\b(?:document|documentation|docs|comment|explain|description)\b/i,
      /\b(?:how to|how do|what is|explain me)\b/i,
    ],
    "testing": [
      /\b(?:test|testing|unit test|integration test|spec|coverage)\b/i,
      /\b(?:assert|mock|stub)\b/i,
    ],
    "deployment": [
      /\b(?:deploy|deployment|release|publish|push|ci|cd|pipeline)\b/i,
      /\b(?:build|compile|package|dist)\b/i,
    ],
    "search": [
      /\b(?:search|find|look for|lookup|query)\b/i,
      /\b(?:where is|how to find)\b/i,
    ],
    "optimization": [
      /\b(?:optimize|improve|performance|speed|fast(?:er)?|slow(?:er)?)\b/i,
      /\b(?:refactor|clean up|restructure)\b/i,
    ],
    "learning": [
      /\b(?:learn|study|tutorial|guide|example|sample)\b/i,
      /\b(?:how does|what does|understand|explain)\b/i,
    ],
    "automation": [
      /\b(?:automate|automatic|auto|script|batch|cron|schedule)\b/i,
      /\b(?:workflow|pipeline|process)\b/i,
    ],
  };

  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) {
        intents.push(intent);
        break;
      }
    }
  }

  if (intents.length === 0) {
    intents.push("general");
  }

  logger.debug("detected intent", { intents, textLength: text.length });

  return intents;
}

export function extractToolMentions(text: string): string[] {
  if (!text) {
    return [];
  }

  const tools = new Set<string>();

  for (const pattern of TOOL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const toolName = match[1]?.toLowerCase();
      if (toolName && toolName.length >= 2 && !STOP_WORDS.has(toolName)) {
        tools.add(toolName);
      }
    }
  }

  const backtickPattern = /`([^`]+)`/g;
  const backtickMatches = text.matchAll(backtickPattern);
  for (const match of backtickMatches) {
    const content = match[1]?.trim();
    if (content) {
      const firstWord = content.split(/\s+/)[0]?.toLowerCase();
      if (firstWord && firstWord.length >= 2 && !STOP_WORDS.has(firstWord)) {
        tools.add(firstWord);
      }
    }
  }

  const result = [...tools].sort();

  logger.debug("extracted tool mentions", { count: result.length });

  return result;
}

export function computeTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) {
    return 0;
  }

  const tokens1 = new Set(tokenize(text1).filter((t) => !STOP_WORDS.has(t.toLowerCase())));
  const tokens2 = new Set(tokenize(text2).filter((t) => !STOP_WORDS.has(t.toLowerCase())));

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  const union = tokens1.size + tokens2.size - intersection;

  if (union === 0) {
    return 0;
  }

  return intersection / union;
}
