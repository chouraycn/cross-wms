import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  scorePublisherTrusted,
  scoreInstallCount,
  scoreAgeDays,
  scoreHasSourceCode,
  scoreHasTests,
  scoreMaliciousCodeCheck,
  scorePermissionScope,
  computeVerdictFromScores,
  getVerdictSummary,
  cacheVerdict,
  getCachedVerdict,
  clearVerdictCache,
  verifySkillSecurity,
  computeLocalVerdict,
  getSkillSecurityVerdict,
  isSkillSafeToInstall,
  type SecurityVerdict,
  type DimensionScores,
} from "../security/clawhub-verdicts.js";

describe("clawhub-verdicts", () => {
  beforeEach(() => {
    clearVerdictCache();
  });

  afterEach(() => {
    clearVerdictCache();
  });

  describe("维度评分函数", () => {
    describe("scorePublisherTrusted", () => {
      it("官方发布者应该得 100 分", () => {
        expect(scorePublisherTrusted("openclaw")).toBe(100);
        expect(scorePublisherTrusted("github")).toBe(100);
        expect(scorePublisherTrusted("makenotion")).toBe(100);
      });

      it("认证发布者应该得 70 分", () => {
        expect(scorePublisherTrusted("obsidian-community")).toBe(70);
        expect(scorePublisherTrusted("diagram-labs")).toBe(70);
      });

      it("未认证发布者应该得 30 分", () => {
        expect(scorePublisherTrusted("unknown-dev")).toBe(30);
        expect(scorePublisherTrusted("random-user")).toBe(30);
      });
    });

    describe("scoreInstallCount", () => {
      it("安装量 >10000 得 100 分", () => {
        expect(scoreInstallCount(15000)).toBe(100);
        expect(scoreInstallCount(10001)).toBe(100);
      });

      it("安装量 >1000 得 70 分", () => {
        expect(scoreInstallCount(5000)).toBe(70);
        expect(scoreInstallCount(1001)).toBe(70);
      });

      it("安装量 >100 得 40 分", () => {
        expect(scoreInstallCount(500)).toBe(40);
        expect(scoreInstallCount(101)).toBe(40);
      });

      it("安装量 <100 得 20 分", () => {
        expect(scoreInstallCount(50)).toBe(20);
        expect(scoreInstallCount(0)).toBe(20);
      });
    });

    describe("scoreAgeDays", () => {
      it("年龄 >180 天得 100 分", () => {
        expect(scoreAgeDays(200)).toBe(100);
        expect(scoreAgeDays(181)).toBe(100);
      });

      it("年龄 >90 天得 70 分", () => {
        expect(scoreAgeDays(120)).toBe(70);
        expect(scoreAgeDays(91)).toBe(70);
      });

      it("年龄 >30 天得 40 分", () => {
        expect(scoreAgeDays(60)).toBe(40);
        expect(scoreAgeDays(31)).toBe(40);
      });

      it("年龄 <30 天得 20 分", () => {
        expect(scoreAgeDays(10)).toBe(20);
        expect(scoreAgeDays(0)).toBe(20);
      });
    });

    describe("scoreHasSourceCode", () => {
      it("有源代码得 100 分", () => {
        expect(scoreHasSourceCode(true)).toBe(100);
      });

      it("无源代码得 0 分", () => {
        expect(scoreHasSourceCode(false)).toBe(0);
      });
    });

    describe("scoreHasTests", () => {
      it("有测试得 100 分", () => {
        expect(scoreHasTests(true)).toBe(100);
      });

      it("无测试得 30 分", () => {
        expect(scoreHasTests(false)).toBe(30);
      });
    });

    describe("scoreMaliciousCodeCheck", () => {
      it("通过检测得 100 分", () => {
        expect(scoreMaliciousCodeCheck("pass")).toBe(100);
      });

      it("有警告得 40 分", () => {
        expect(scoreMaliciousCodeCheck("warn")).toBe(40);
      });

      it("检测失败得 0 分", () => {
        expect(scoreMaliciousCodeCheck("fail")).toBe(0);
      });
    });

    describe("scorePermissionScope", () => {
      it("只读权限得 100 分", () => {
        expect(scorePermissionScope("read-only")).toBe(100);
      });

      it("读写权限得 60 分", () => {
        expect(scorePermissionScope("read-write")).toBe(60);
      });

      it("系统级权限得 30 分", () => {
        expect(scorePermissionScope("system")).toBe(30);
      });
    });
  });

  describe("综合裁决", () => {
    it("高分应该返回 trusted 裁决", () => {
      const scores: DimensionScores = {
        publisher_trusted: 100,
        install_count: 100,
        age_days: 100,
        has_source_code: 100,
        has_tests: 100,
        malicious_code_check: 100,
        permission_scope: 100,
      };
      const result = computeVerdictFromScores(scores);
      expect(result.decision).toBe("trusted");
      expect(result.score).toBe(100);
    });

    it("中等分数应该返回 warn 裁决", () => {
      const scores: DimensionScores = {
        publisher_trusted: 70,
        install_count: 70,
        age_days: 70,
        has_source_code: 100,
        has_tests: 30,
        malicious_code_check: 100,
        permission_scope: 60,
      };
      const result = computeVerdictFromScores(scores);
      expect(result.decision).toBe("warn");
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(80);
    });

    it("低分数应该返回 rejected 裁决", () => {
      const scores: DimensionScores = {
        publisher_trusted: 30,
        install_count: 20,
        age_days: 20,
        has_source_code: 0,
        has_tests: 30,
        malicious_code_check: 0,
        permission_scope: 30,
      };
      const result = computeVerdictFromScores(scores);
      expect(result.decision).toBe("rejected");
      expect(result.score).toBeLessThan(50);
    });

    it("应该生成合理的裁决原因", () => {
      const scores: DimensionScores = {
        publisher_trusted: 100,
        install_count: 50,
        age_days: 20,
        has_source_code: 100,
        has_tests: 30,
        malicious_code_check: 100,
        permission_scope: 100,
      };
      const result = computeVerdictFromScores(scores);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons).toContain("Trusted publisher");
      expect(result.reasons).toContain("No malicious code detected");
      expect(result.reasons).toContain("Source code available");
    });
  });

  describe("缓存机制", () => {
    it("应该能缓存和获取裁决", () => {
      const verdict: SecurityVerdict = {
        decision: "trusted",
        reasons: ["Test reason"],
        score: 90,
        details: {},
        source: "clawhub",
        slug: "test-skill",
        version: "1.0.0",
      };

      cacheVerdict("test-skill", "1.0.0", verdict);

      const cached = getCachedVerdict("test-skill", "1.0.0");
      expect(cached).not.toBeNull();
      expect(cached?.decision).toBe("trusted");
      expect(cached?.slug).toBe("test-skill");
    });

    it("应该支持清除指定技能的缓存", () => {
      const verdict1: SecurityVerdict = {
        decision: "trusted",
        reasons: [],
        score: 90,
        details: {},
        source: "clawhub",
        slug: "skill-a",
      };
      const verdict2: SecurityVerdict = {
        decision: "warn",
        reasons: [],
        score: 60,
        details: {},
        source: "clawhub",
        slug: "skill-b",
      };

      cacheVerdict("skill-a", undefined, verdict1);
      cacheVerdict("skill-b", undefined, verdict2);

      clearVerdictCache("skill-a");

      expect(getCachedVerdict("skill-a")).toBeNull();
      expect(getCachedVerdict("skill-b")).not.toBeNull();
    });

    it("应该支持清除所有缓存", () => {
      const verdict: SecurityVerdict = {
        decision: "trusted",
        reasons: [],
        score: 90,
        details: {},
        source: "clawhub",
        slug: "test-skill",
      };

      cacheVerdict("test-skill", undefined, verdict);
      clearVerdictCache();

      expect(getCachedVerdict("test-skill")).toBeNull();
    });

    it("缓存过期后应该返回 null", async () => {
      const verdict: SecurityVerdict = {
        decision: "trusted",
        reasons: [],
        score: 90,
        details: {},
        source: "clawhub",
        slug: "test-skill",
      };

      cacheVerdict("test-skill", undefined, verdict);

      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 7 * 60 * 60 * 1000);

      const cached = getCachedVerdict("test-skill");
      expect(cached).toBeNull();

      vi.restoreAllMocks();
    });
  });

  describe("ClawHub 验证", () => {
    it("官方技能应该返回 trusted 裁决", async () => {
      const verdict = await verifySkillSecurity("github");
      expect(verdict.decision).toBe("trusted");
      expect(verdict.score).toBeGreaterThanOrEqual(80);
      expect(verdict.source).toBe("clawhub");
      expect(verdict.slug).toBe("github");
    });

    it("社区技能应该返回 warn 裁决", async () => {
      const verdict = await verifySkillSecurity("weather");
      expect(verdict.decision).toBe("trusted");
      expect(verdict.source).toBe("clawhub");
    });

    it("不存在的技能应该返回 rejected 裁决", async () => {
      const verdict = await verifySkillSecurity("nonexistent-skill-12345");
      expect(verdict.decision).toBe("rejected");
      expect(verdict.score).toBe(0);
    });

    it("验证结果应该被缓存", async () => {
      const verdict1 = await verifySkillSecurity("weather");
      const verdict2 = await getCachedVerdict("weather");
      expect(verdict2).not.toBeNull();
      expect(verdict2?.decision).toBe(verdict1.decision);
    });
  });

  describe("本地扫描裁决", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawhub-verdicts-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("空技能目录应该返回 warn 或 rejected", async () => {
      const skillDir = path.join(tempDir, "empty-skill");
      await fs.mkdir(skillDir);

      const verdict = await computeLocalVerdict(skillDir);
      expect(verdict.source).toBe("local");
      expect(verdict.slug).toBe("empty-skill");
      expect(verdict.decision).toBeDefined();
    });

    it("有安全源代码的技能应该评分更高", async () => {
      const skillDir = path.join(tempDir, "safe-skill");
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, "index.ts"),
        'const greeting = "Hello, World!";\nexport function sayHello() { return greeting; }\n',
      );

      const verdict = await computeLocalVerdict(skillDir);
      expect(verdict.source).toBe("local");
      expect(verdict.details.scores).toBeDefined();
    });

    it("有恶意代码的技能应该评分更低", async () => {
      const skillDir = path.join(tempDir, "malicious-skill");
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, "evil.ts"),
        'import { exec } from "child_process";\nexec("rm -rf /");\n',
      );

      const verdict = await computeLocalVerdict(skillDir);
      expect(verdict.source).toBe("local");
      expect(verdict.score).toBeLessThan(80);
    });

    it("有测试文件的技能应该评分更高", async () => {
      const skillDir = path.join(tempDir, "tested-skill");
      await fs.mkdir(skillDir);
      await fs.writeFile(
        path.join(skillDir, "index.ts"),
        'export function add(a: number, b: number) { return a + b; }\n',
      );
      const testDir = path.join(skillDir, "__tests__");
      await fs.mkdir(testDir);
      await fs.writeFile(
        path.join(testDir, "index.test.ts"),
        'import { add } from "../index";\ndescribe("add", () => {\n  it("adds numbers", () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});\n',
      );

      const verdict = await computeLocalVerdict(skillDir);
      expect(verdict.source).toBe("local");
      const scores = verdict.details.scores as DimensionScores;
      expect(scores.has_tests).toBe(100);
    });
  });

  describe("getSkillSecurityVerdict", () => {
    it("应该返回缓存的裁决", async () => {
      const mockVerdict: SecurityVerdict = {
        decision: "trusted",
        reasons: ["Cached"],
        score: 95,
        details: { cached: true },
        source: "manual",
        slug: "weather",
      };

      cacheVerdict("weather", undefined, mockVerdict);

      const verdict = await getSkillSecurityVerdict("weather");
      expect(verdict.decision).toBe("trusted");
      expect(verdict.details.cached).toBe(true);
    });

    it("无缓存时应该从 ClawHub 获取", async () => {
      const verdict = await getSkillSecurityVerdict("github");
      expect(verdict.decision).toBe("trusted");
      expect(verdict.source).toBe("clawhub");
    });
  });

  describe("isSkillSafeToInstall", () => {
    it("trusted 裁决应该安全安装", async () => {
      const safe = await isSkillSafeToInstall("github");
      expect(safe).toBe(true);
    });

    it("warn 裁决应该允许安装", async () => {
      const safe = await isSkillSafeToInstall("spotify-player");
      expect(safe).toBe(true);
    });

    it("rejected 裁决应该阻止安装", async () => {
      const safe = await isSkillSafeToInstall("nonexistent-skill-xyz");
      expect(safe).toBe(false);
    });
  });

  describe("getVerdictSummary", () => {
    it("应该生成人类可读的裁决摘要", () => {
      const verdict: SecurityVerdict = {
        decision: "trusted",
        reasons: ["Trusted publisher", "No malicious code detected"],
        score: 92,
        details: {},
        source: "clawhub",
        slug: "weather",
        version: "1.0.0",
      };

      const summary = getVerdictSummary(verdict);
      expect(summary).toContain("TRUSTED");
      expect(summary).toContain("weather");
      expect(summary).toContain("1.0.0");
      expect(summary).toContain("92/100");
      expect(summary).toContain("clawhub");
      expect(summary).toContain("Trusted publisher");
      expect(summary).toContain("No malicious code detected");
    });

    it("trusted 裁决应该显示对勾图标", () => {
      const verdict: SecurityVerdict = {
        decision: "trusted",
        reasons: [],
        score: 90,
        details: {},
        source: "clawhub",
        slug: "test",
      };
      const summary = getVerdictSummary(verdict);
      expect(summary).toContain("✓");
    });

    it("warn 裁决应该显示警告图标", () => {
      const verdict: SecurityVerdict = {
        decision: "warn",
        reasons: [],
        score: 60,
        details: {},
        source: "clawhub",
        slug: "test",
      };
      const summary = getVerdictSummary(verdict);
      expect(summary).toContain("⚠");
    });

    it("rejected 裁决应该显示叉号图标", () => {
      const verdict: SecurityVerdict = {
        decision: "rejected",
        reasons: [],
        score: 30,
        details: {},
        source: "clawhub",
        slug: "test",
      };
      const summary = getVerdictSummary(verdict);
      expect(summary).toContain("✗");
    });

    it("没有版本号时不显示版本行", () => {
      const verdict: SecurityVerdict = {
        decision: "trusted",
        reasons: [],
        score: 90,
        details: {},
        source: "clawhub",
        slug: "test",
      };
      const summary = getVerdictSummary(verdict);
      expect(summary).not.toContain("Version:");
    });
  });
});
