import { describe, it, expect, beforeEach } from "vitest";
import {
  recordSkillUsage,
  analyzeUsageSignals,
  getTopUsedSkills,
  getUnderusedSkills,
  detectUsagePatterns,
  generateSkillSuggestions,
  clearUsageSignals,
  getUsageStats,
  captureConversation,
  summarizeCapturedConversations,
  detectPotentialSkillNeeds,
  getCapturedConversations,
  clearCapturedConversations,
  extractKeywords,
  detectIntent,
  extractToolMentions,
  computeTextSimilarity,
  tokenize,
} from "../research/index.js";
import type { SkillUsageSignal, CapturedMessage } from "../research/index.js";

describe("research/signals", () => {
  beforeEach(() => {
    clearUsageSignals();
  });

  describe("recordSkillUsage", () => {
    it("应该成功记录技能使用信号", () => {
      const signal: SkillUsageSignal = {
        skillName: "test-skill",
        timestamp: Date.now(),
        messageCount: 5,
        toolCalls: 3,
        durationMs: 2000,
        successRate: 0.9,
      };

      recordSkillUsage(signal);
      const stats = getUsageStats();

      expect(stats.totalSignals).toBe(1);
      expect(stats.uniqueSkills).toBe(1);
    });

    it("应该忽略缺少 skillName 的信号", () => {
      const signal = {
        timestamp: Date.now(),
        messageCount: 5,
        toolCalls: 3,
        durationMs: 2000,
        successRate: 0.9,
      } as SkillUsageSignal;

      recordSkillUsage(signal);
      const stats = getUsageStats();

      expect(stats.totalSignals).toBe(0);
    });

    it("应该规范化数值范围", () => {
      const signal: SkillUsageSignal = {
        skillName: "test-skill",
        timestamp: Date.now(),
        messageCount: -5,
        toolCalls: -3,
        durationMs: -100,
        successRate: 1.5,
      };

      recordSkillUsage(signal);
      const topSkills = getTopUsedSkills(1);

      expect(topSkills[0].messageCount).toBe(0);
      expect(topSkills[0].toolCalls).toBe(0);
      expect(topSkills[0].durationMs).toBe(0);
      expect(topSkills[0].successRate).toBeLessThanOrEqual(1);
    });
  });

  describe("getTopUsedSkills", () => {
    it("应该按使用频率排序返回技能", () => {
      for (let i = 0; i < 5; i++) {
        recordSkillUsage({
          skillName: "skill-a",
          timestamp: Date.now(),
          messageCount: i,
          toolCalls: i,
          durationMs: 1000,
          successRate: 0.8,
        });
      }
      for (let i = 0; i < 3; i++) {
        recordSkillUsage({
          skillName: "skill-b",
          timestamp: Date.now(),
          messageCount: i,
          toolCalls: i,
          durationMs: 2000,
          successRate: 0.9,
        });
      }

      const topSkills = getTopUsedSkills(5);

      expect(topSkills.length).toBe(2);
      expect(topSkills[0].skillName).toBe("skill-a");
      expect(topSkills[1].skillName).toBe("skill-b");
    });

    it("应该遵守 limit 参数", () => {
      for (let i = 0; i < 3; i++) {
        recordSkillUsage({
          skillName: `skill-${i}`,
          timestamp: Date.now(),
          messageCount: 1,
          toolCalls: 1,
          durationMs: 100,
          successRate: 1,
        });
      }

      const topSkills = getTopUsedSkills(2);
      expect(topSkills.length).toBe(2);
    });
  });

  describe("getUnderusedSkills", () => {
    it("应该返回使用次数低于阈值的技能", () => {
      recordSkillUsage({
        skillName: "frequent-skill",
        timestamp: Date.now(),
        messageCount: 1,
        toolCalls: 1,
        durationMs: 100,
        successRate: 1,
      });
      recordSkillUsage({
        skillName: "frequent-skill",
        timestamp: Date.now(),
        messageCount: 1,
        toolCalls: 1,
        durationMs: 100,
        successRate: 1,
      });
      recordSkillUsage({
        skillName: "rare-skill",
        timestamp: Date.now(),
        messageCount: 1,
        toolCalls: 1,
        durationMs: 100,
        successRate: 1,
      });

      const underused = getUnderusedSkills(2);

      expect(underused).toContain("rare-skill");
      expect(underused).not.toContain("frequent-skill");
    });
  });

  describe("analyzeUsageSignals", () => {
    it("应该返回完整的分析结果", () => {
      const now = Date.now();
      for (let i = 0; i < 6; i++) {
        recordSkillUsage({
          skillName: "buggy-skill",
          timestamp: now - i * 1000,
          messageCount: 2,
          toolCalls: 5,
          durationMs: 45000,
          successRate: 0.4,
        });
      }

      const result = analyzeUsageSignals();

      expect(result.topSkills).toBeDefined();
      expect(result.underusedSkills).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });

    it("应该按时间范围过滤信号", () => {
      const now = Date.now();
      recordSkillUsage({
        skillName: "old-skill",
        timestamp: now - 24 * 60 * 60 * 1000,
        messageCount: 1,
        toolCalls: 1,
        durationMs: 100,
        successRate: 1,
      });
      recordSkillUsage({
        skillName: "new-skill",
        timestamp: now,
        messageCount: 1,
        toolCalls: 1,
        durationMs: 100,
        successRate: 1,
      });

      const result = analyzeUsageSignals(60 * 60 * 1000);

      const skillNames = result.topSkills.map((s) => s.skillName);
      expect(skillNames).toContain("new-skill");
      expect(skillNames).not.toContain("old-skill");
    });
  });

  describe("generateSkillSuggestions", () => {
    it("应该为低成功率技能生成优化建议", () => {
      for (let i = 0; i < 6; i++) {
        recordSkillUsage({
          skillName: "low-success-skill",
          timestamp: Date.now(),
          messageCount: 1,
          toolCalls: 1,
          durationMs: 1000,
          successRate: 0.3,
        });
      }

      const suggestions = generateSkillSuggestions();

      const optimizeSuggestion = suggestions.find(
        (s) => s.type === "optimize" && s.target === "low-success-skill",
      );
      expect(optimizeSuggestion).toBeDefined();
      expect(optimizeSuggestion?.reason).toContain("成功率");
    });

    it("应该为长执行时间技能生成优化建议", () => {
      for (let i = 0; i < 4; i++) {
        recordSkillUsage({
          skillName: "slow-skill",
          timestamp: Date.now(),
          messageCount: 1,
          toolCalls: 1,
          durationMs: 60000,
          successRate: 0.9,
        });
      }

      const suggestions = generateSkillSuggestions();

      const optimizeSuggestion = suggestions.find(
        (s) => s.type === "optimize" && s.target === "slow-skill",
      );
      expect(optimizeSuggestion).toBeDefined();
      expect(optimizeSuggestion?.reason).toContain("执行时间");
    });
  });

  describe("detectUsagePatterns", () => {
    it("应该检测到共同出现的技能模式", () => {
      const baseTime = Date.now();
      for (let i = 0; i < 3; i++) {
        const bucketTime = baseTime + i * 5 * 60 * 1000;
        recordSkillUsage({
          skillName: "skill-x",
          timestamp: bucketTime,
          messageCount: 1,
          toolCalls: 1,
          durationMs: 100,
          successRate: 1,
        });
        recordSkillUsage({
          skillName: "skill-y",
          timestamp: bucketTime + 1000,
          messageCount: 1,
          toolCalls: 1,
          durationMs: 100,
          successRate: 1,
        });
        recordSkillUsage({
          skillName: "skill-z",
          timestamp: bucketTime + 2000,
          messageCount: 1,
          toolCalls: 1,
          durationMs: 100,
          successRate: 1,
        });
      }

      const patterns = detectUsagePatterns();

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].relatedSkills.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getUsageStats", () => {
    it("空数据时应该返回零值统计", () => {
      const stats = getUsageStats();

      expect(stats.totalSignals).toBe(0);
      expect(stats.uniqueSkills).toBe(0);
      expect(stats.timeRangeMs).toBe(0);
      expect(stats.averageDurationMs).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
    });

    it("有数据时应该返回正确的统计", () => {
      const now = Date.now();
      recordSkillUsage({
        skillName: "skill-a",
        timestamp: now - 5000,
        messageCount: 2,
        toolCalls: 1,
        durationMs: 2000,
        successRate: 0.8,
      });
      recordSkillUsage({
        skillName: "skill-b",
        timestamp: now,
        messageCount: 3,
        toolCalls: 2,
        durationMs: 4000,
        successRate: 1,
      });

      const stats = getUsageStats();

      expect(stats.totalSignals).toBe(2);
      expect(stats.uniqueSkills).toBe(2);
      expect(stats.timeRangeMs).toBeGreaterThan(0);
      expect(stats.averageDurationMs).toBe(3000);
      expect(stats.averageSuccessRate).toBe(0.9);
    });
  });
});

describe("research/text", () => {
  describe("tokenize", () => {
    it("应该对英文文本进行分词", () => {
      const tokens = tokenize("Hello World test");
      expect(tokens).toContain("hello");
      expect(tokens).toContain("world");
      expect(tokens).toContain("test");
    });

    it("应该处理空字符串", () => {
      const tokens = tokenize("");
      expect(tokens).toEqual([]);
    });

    it("应该处理非字符串输入", () => {
      const tokens = tokenize(null as unknown as string);
      expect(tokens).toEqual([]);
    });
  });

  describe("extractKeywords", () => {
    it("应该提取关键词", () => {
      const text = "JavaScript programming language JavaScript code development JavaScript";
      const keywords = extractKeywords(text, 5);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords[0]).toBe("javascript");
    });

    it("应该过滤停用词", () => {
      const text = "the quick brown fox jumps over the lazy dog";
      const keywords = extractKeywords(text, 10);

      expect(keywords).not.toContain("the");
      expect(keywords).toContain("quick");
      expect(keywords).toContain("brown");
    });

    it("应该遵守 limit 参数", () => {
      const text = "a b c d e f g h i j k l m n o p";
      const keywords = extractKeywords(text, 5);

      expect(keywords.length).toBeLessThanOrEqual(5);
    });
  });

  describe("detectIntent", () => {
    it("应该检测代码生成意图", () => {
      const intents = detectIntent("Create a new function to process data");
      expect(intents).toContain("code-generation");
    });

    it("应该检测调试意图", () => {
      const intents = detectIntent("There is a bug in the code, need to fix the error");
      expect(intents).toContain("debugging");
    });

    it("应该检测文档意图", () => {
      const intents = detectIntent("Please explain how this function works");
      expect(intents).toContain("documentation");
    });

    it("未知意图应该返回 general", () => {
      const intents = detectIntent("今天天气怎么样");
      expect(intents).toContain("general");
    });
  });

  describe("extractToolMentions", () => {
    it("应该提取工具提及", () => {
      const tools = extractToolMentions("Use the git tool to commit changes");
      expect(tools.length).toBeGreaterThan(0);
    });

    it("应该从反引号中提取工具名", () => {
      const tools = extractToolMentions("Run `npm install` to install dependencies");
      expect(tools).toContain("npm");
    });
  });

  describe("computeTextSimilarity", () => {
    it("相同文本相似度应为 1", () => {
      const similarity = computeTextSimilarity("hello world", "hello world");
      expect(similarity).toBe(1);
    });

    it("完全不同文本相似度应为 0", () => {
      const similarity = computeTextSimilarity("hello world", "xyz abc");
      expect(similarity).toBe(0);
    });

    it("部分相似文本相似度应在 0 到 1 之间", () => {
      const similarity = computeTextSimilarity("hello world test", "hello world example");
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it("空文本相似度应为 0", () => {
      const similarity = computeTextSimilarity("", "hello");
      expect(similarity).toBe(0);
    });
  });
});

describe("research/autocapture", () => {
  beforeEach(() => {
    clearCapturedConversations();
  });

  describe("captureConversation", () => {
    it("应该捕获会话并生成摘要", () => {
      const messages: CapturedMessage[] = [
        { role: "user", content: "How to create a new React component?" },
        { role: "assistant", content: "You can use the following code...", tools: ["write"] },
      ];

      const conv = captureConversation(messages, "test-session");

      expect(conv.id).toBe("test-session");
      expect(conv.messages.length).toBe(2);
      expect(conv.summary).toBeDefined();
      expect(conv.summary.length).toBeGreaterThan(0);
      expect(conv.detectedIntent.length).toBeGreaterThan(0);
    });

    it("没有 sessionId 时应该自动生成", () => {
      const messages: CapturedMessage[] = [
        { role: "user", content: "Hello" },
      ];

      const conv = captureConversation(messages);

      expect(conv.id).toBeDefined();
      expect(conv.id.startsWith("conv-")).toBe(true);
    });
  });

  describe("getCapturedConversations", () => {
    it("应该返回捕获的会话（最新的在前）", () => {
      const messages1: CapturedMessage[] = [{ role: "user", content: "First message" }];
      const messages2: CapturedMessage[] = [{ role: "user", content: "Second message" }];

      captureConversation(messages1, "session-1");
      captureConversation(messages2, "session-2");

      const conversations = getCapturedConversations(10);

      expect(conversations.length).toBe(2);
      expect(conversations[0].id).toBe("session-2");
    });
  });

  describe("summarizeCapturedConversations", () => {
    it("应该返回会话归纳摘要", () => {
      for (let i = 0; i < 5; i++) {
        const messages: CapturedMessage[] = [
          { role: "user", content: `How to debug JavaScript code issue ${i}` },
        ];
        captureConversation(messages, `session-${i}`);
      }

      const summary = summarizeCapturedConversations(10);

      expect(summary.total).toBe(5);
      expect(summary.conversations.length).toBe(5);
      expect(summary.commonTopics.length).toBeGreaterThan(0);
      expect(summary.commonIntents.length).toBeGreaterThan(0);
    });
  });

  describe("detectPotentialSkillNeeds", () => {
    it("应该检测到重复工具使用的潜在技能需求", () => {
      for (let i = 0; i < 3; i++) {
        const messages: CapturedMessage[] = [
          { role: "user", content: `Process data ${i}` },
          { role: "assistant", content: "Processing...", tools: ["data-processor", "file-reader"] },
        ];
        captureConversation(messages, `conv-${i}`);
      }

      const needs = detectPotentialSkillNeeds();

      expect(needs.length).toBeGreaterThan(0);
    });
  });
});
