import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skills-research-signals" });

export type SkillUsageSignal = {
  skillName: string;
  timestamp: number;
  messageCount: number;
  toolCalls: number;
  durationMs: number;
  successRate: number;
};

export type UsagePattern = {
  pattern: string;
  frequency: number;
  relatedSkills: string[];
};

export type SkillSuggestion = {
  type: "create" | "install" | "optimize";
  target: string;
  reason: string;
  confidence: number;
};

export type SignalAnalysisResult = {
  topSkills: SkillUsageSignal[];
  underusedSkills: string[];
  patterns: UsagePattern[];
  suggestions: SkillSuggestion[];
};

export type UsageStats = {
  totalSignals: number;
  uniqueSkills: number;
  timeRangeMs: number;
  averageDurationMs: number;
  averageSuccessRate: number;
};

let usageSignals: SkillUsageSignal[] = [];
const MAX_SIGNALS = 10000;

export function recordSkillUsage(signal: SkillUsageSignal): void {
  if (!signal.skillName) {
    logger.warn("recordSkillUsage: missing skillName");
    return;
  }

  const normalized: SkillUsageSignal = {
    skillName: signal.skillName,
    timestamp: signal.timestamp ?? Date.now(),
    messageCount: Math.max(0, signal.messageCount ?? 0),
    toolCalls: Math.max(0, signal.toolCalls ?? 0),
    durationMs: Math.max(0, signal.durationMs ?? 0),
    successRate: Math.min(1, Math.max(0, signal.successRate ?? 1)),
  };

  usageSignals.push(normalized);

  if (usageSignals.length > MAX_SIGNALS) {
    usageSignals = usageSignals.slice(-MAX_SIGNALS);
  }

  logger.debug("recorded skill usage", { skill: normalized.skillName });
}

export function analyzeUsageSignals(timeRangeMs?: number): SignalAnalysisResult {
  const filtered = timeRangeMs
    ? usageSignals.filter((s) => Date.now() - s.timestamp <= timeRangeMs)
    : [...usageSignals];

  logger.debug("analyzing usage signals", { count: filtered.length });

  const topSkills = getTopUsedSkills(10, filtered);
  const underusedSkills = getUnderusedSkills(1, filtered);
  const patterns = detectUsagePatterns(filtered);
  const suggestions = generateSkillSuggestions(filtered);

  return {
    topSkills,
    underusedSkills,
    patterns,
    suggestions,
  };
}

export function getTopUsedSkills(limit: number = 10, signals?: SkillUsageSignal[]): SkillUsageSignal[] {
  const source = signals ?? usageSignals;
  const skillMap = new Map<string, SkillUsageSignal & { count: number }>();

  for (const signal of source) {
    const existing = skillMap.get(signal.skillName);
    if (existing) {
      existing.count += 1;
      existing.messageCount += signal.messageCount;
      existing.toolCalls += signal.toolCalls;
      existing.durationMs += signal.durationMs;
      existing.successRate = (existing.successRate + signal.successRate) / 2;
    } else {
      skillMap.set(signal.skillName, { ...signal, count: 1 });
    }
  }

  const aggregated = Array.from(skillMap.values()).map((s) => ({
    skillName: s.skillName,
    timestamp: s.timestamp,
    messageCount: s.messageCount,
    toolCalls: s.toolCalls,
    durationMs: s.durationMs,
    successRate: s.successRate,
    _count: (s as SkillUsageSignal & { count: number }).count,
  }));

  aggregated.sort((a, b) => (b as any)._count - (a as any)._count);

  return aggregated.slice(0, limit).map((s) => {
    const { _count, ...rest } = s as any;
    return rest;
  });
}

export function getUnderusedSkills(threshold: number = 2, signals?: SkillUsageSignal[]): string[] {
  const source = signals ?? usageSignals;
  const skillCounts = new Map<string, number>();

  for (const signal of source) {
    skillCounts.set(signal.skillName, (skillCounts.get(signal.skillName) ?? 0) + 1);
  }

  const underused: string[] = [];
  for (const [skillName, count] of skillCounts) {
    if (count < threshold) {
      underused.push(skillName);
    }
  }

  return underused.sort();
}

export function detectUsagePatterns(signals?: SkillUsageSignal[]): UsagePattern[] {
  const source = signals ?? usageSignals;
  const patterns: UsagePattern[] = [];

  const skillCooccurrence = new Map<string, Set<string>>();
  const timeBuckets = new Map<number, string[]>();

  for (const signal of source) {
    const bucket = Math.floor(signal.timestamp / (1000 * 60 * 5));
    if (!timeBuckets.has(bucket)) {
      timeBuckets.set(bucket, []);
    }
    timeBuckets.get(bucket)!.push(signal.skillName);
  }

  for (const skills of timeBuckets.values()) {
    const uniqueSkills = [...new Set(skills)];
    for (const skill of uniqueSkills) {
      if (!skillCooccurrence.has(skill)) {
        skillCooccurrence.set(skill, new Set());
      }
      for (const other of uniqueSkills) {
        if (other !== skill) {
          skillCooccurrence.get(skill)!.add(other);
        }
      }
    }
  }

  const totalBuckets = timeBuckets.size;
  const skillFrequency = new Map<string, number>();

  for (const skills of timeBuckets.values()) {
    const uniqueSkills = [...new Set(skills)];
    for (const skill of uniqueSkills) {
      skillFrequency.set(skill, (skillFrequency.get(skill) ?? 0) + 1);
    }
  }

  for (const [skill, related] of skillCooccurrence) {
    const freq = skillFrequency.get(skill) ?? 0;
    if (freq >= 2 && related.size >= 2) {
      patterns.push({
        pattern: `${skill}-cluster`,
        frequency: freq / totalBuckets,
        relatedSkills: [...related].sort(),
      });
    }
  }

  patterns.sort((a, b) => b.frequency - a.frequency);

  return patterns.slice(0, 10);
}

export function generateSkillSuggestions(signals?: SkillUsageSignal[]): SkillSuggestion[] {
  const source = signals ?? usageSignals;
  const suggestions: SkillSuggestion[] = [];

  const skillStats = new Map<
    string,
    { count: number; totalDuration: number; totalSuccess: number; toolCalls: number }
  >();

  for (const signal of source) {
    const existing = skillStats.get(signal.skillName);
    if (existing) {
      existing.count += 1;
      existing.totalDuration += signal.durationMs;
      existing.totalSuccess += signal.successRate;
      existing.toolCalls += signal.toolCalls;
    } else {
      skillStats.set(signal.skillName, {
        count: 1,
        totalDuration: signal.durationMs,
        totalSuccess: signal.successRate,
        toolCalls: signal.toolCalls,
      });
    }
  }

  for (const [skillName, stats] of skillStats) {
    const avgDuration = stats.totalDuration / stats.count;
    const avgSuccess = stats.totalSuccess / stats.count;

    if (stats.count >= 5 && avgSuccess < 0.6) {
      suggestions.push({
        type: "optimize",
        target: skillName,
        reason: `低成功率 (${(avgSuccess * 100).toFixed(1)}%)，建议优化技能实现`,
        confidence: 0.7,
      });
    }

    if (stats.count >= 3 && avgDuration > 30000) {
      suggestions.push({
        type: "optimize",
        target: skillName,
        reason: `平均执行时间较长 (${(avgDuration / 1000).toFixed(1)}s)，建议优化性能`,
        confidence: 0.6,
      });
    }

    if (stats.toolCalls >= 10 && stats.count >= 5) {
      suggestions.push({
        type: "create",
        target: `${skillName}-helper`,
        reason: `高频使用工具调用 (${stats.toolCalls}次)，可考虑创建辅助技能`,
        confidence: 0.5,
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions.slice(0, 10);
}

export function clearUsageSignals(): void {
  usageSignals = [];
  logger.debug("cleared all usage signals");
}

export function getUsageStats(): UsageStats {
  const totalSignals = usageSignals.length;
  const uniqueSkills = new Set(usageSignals.map((s) => s.skillName)).size;

  let timeRangeMs = 0;
  let averageDurationMs = 0;
  let averageSuccessRate = 0;

  if (totalSignals > 0) {
    const timestamps = usageSignals.map((s) => s.timestamp);
    timeRangeMs = Math.max(...timestamps) - Math.min(...timestamps);
    averageDurationMs = usageSignals.reduce((sum, s) => sum + s.durationMs, 0) / totalSignals;
    averageSuccessRate = usageSignals.reduce((sum, s) => sum + s.successRate, 0) / totalSignals;
  }

  return {
    totalSignals,
    uniqueSkills,
    timeRangeMs,
    averageDurationMs,
    averageSuccessRate,
  };
}
