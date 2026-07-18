/**
 * BenchmarkRunner 测试
 *
 * 验证基准测试框架的核心功能。
 */
import { describe, expect, it } from "vitest";
import { BenchmarkRunner } from "../benchmark.js";

describe("BenchmarkRunner", () => {
  const runner = new BenchmarkRunner({ defaultIterations: 10, defaultWarmup: 2 });

  it("应正常运行基准测试", async () => {
    const result = await runner.run("test", () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += i;
    });

    expect(result).toBeDefined();
    expect(result.name).toBe("test");
  });

  it("结果字段应完整", async () => {
    const result = await runner.run("complete-fields", () => {
      let x = 1;
      x += 1;
    });

    expect(typeof result.name).toBe("string");
    expect(typeof result.opsPerSecond).toBe("number");
    expect(typeof result.avgMs).toBe("number");
    expect(typeof result.p50Ms).toBe("number");
    expect(typeof result.p95Ms).toBe("number");
    expect(typeof result.p99Ms).toBe("number");
    expect(typeof result.minMs).toBe("number");
    expect(typeof result.maxMs).toBe("number");
    expect(typeof result.iterations).toBe("number");
    expect(typeof result.totalMs).toBe("number");
  });

  it("compare 方法应正确对比两个结果", async () => {
    const fast = await runner.run("fast", () => {
      let x = 0;
      x += 1;
    });

    const slow = await runner.run("slow", () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
    });

    const comparison = runner.compare(slow, fast);
    expect(comparison.baselineName).toBe("slow");
    expect(comparison.currentName).toBe("fast");
    expect(typeof comparison.speedRatio).toBe("number");
    expect(typeof comparison.diffPercent).toBe("number");
    expect(typeof comparison.isFaster).toBe("boolean");
    expect(typeof comparison.isSlower).toBe("boolean");
  });

  it("应支持 warmup 配置", async () => {
    let warmupCount = 0;
    let totalCount = 0;

    const result = await runner.run(
      "warmup-test",
      () => {
        totalCount++;
      },
      { iterations: 5, warmup: 3 },
    );

    expect(result.iterations).toBe(5);
    expect(totalCount).toBe(8);
  });

  it("迭代次数应正确", async () => {
    const result = await runner.run(
      "iterations-test",
      () => {
        let x = 0;
        x++;
      },
      { iterations: 42, warmup: 0 },
    );

    expect(result.iterations).toBe(42);
  });

  it("应支持异步函数", async () => {
    const result = await runner.run("async-test", async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    });

    expect(result).toBeDefined();
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.avgMs).toBeGreaterThan(0);
  });

  it("runSuite 应运行所有测试用例", async () => {
    const suiteResult = await runner.runSuite("test-suite", [
      {
        name: "case1",
        fn: () => {
          let x = 0;
          x++;
        },
      },
      {
        name: "case2",
        fn: () => {
          let sum = 0;
          for (let i = 0; i < 10; i++) sum += i;
        },
      },
    ]);

    expect(suiteResult.name).toBe("test-suite");
    expect(suiteResult.results.length).toBe(2);
    expect(suiteResult.results[0].name).toBe("case1");
    expect(suiteResult.results[1].name).toBe("case2");
    expect(suiteResult.totalMs).toBeGreaterThan(0);
  });

  it("formatResult 应返回格式化后的结果", async () => {
    const result = await runner.run("format-test", () => {
      let x = 0;
      x++;
    });

    const formatted = runner.formatResult(result);
    expect(formatted.name).toBe("format-test");
    expect(typeof formatted.opsPerSecond).toBe("number");
    expect(typeof formatted.avgMs).toBe("number");
    expect(formatted.iterations).toBe(result.iterations);
  });

  it("统计值应满足 min <= p50 <= p95 <= p99 <= max", async () => {
    const result = await runner.run(
      "stats-test",
      () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) sum += i;
      },
      { iterations: 50, warmup: 5 },
    );

    expect(result.minMs).toBeLessThanOrEqual(result.p50Ms);
    expect(result.p50Ms).toBeLessThanOrEqual(result.p95Ms);
    expect(result.p95Ms).toBeLessThanOrEqual(result.p99Ms);
    expect(result.p99Ms).toBeLessThanOrEqual(result.maxMs);
  });

  it("opsPerSecond 应与 avgMs 成反比关系", async () => {
    const result = await runner.run("ops-test", () => {
      let x = 0;
      x++;
    });

    const expectedOps = 1000 / result.avgMs;
    const ratio = result.opsPerSecond / expectedOps;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });
});
