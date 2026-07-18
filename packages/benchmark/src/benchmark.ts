/**
 * BenchmarkRunner — 性能基准测试运行器
 *
 * 提供基准测试的核心能力，包括：
 * - 单次函数基准测试
 * - 基准测试套件运行
 * - 结果对比
 * - 结果格式化输出
 */

/** 基准测试结果 */
export interface BenchmarkResult {
  /** 基准测试名称 */
  name: string;
  /** 每秒操作次数 */
  opsPerSecond: number;
  /** 平均单次执行耗时（毫秒） */
  avgMs: number;
  /** 第 50 百分位耗时（毫秒） */
  p50Ms: number;
  /** 第 95 百分位耗时（毫秒） */
  p95Ms: number;
  /** 第 99 百分位耗时（毫秒） */
  p99Ms: number;
  /** 最小耗时（毫秒） */
  minMs: number;
  /** 最大耗时（毫秒） */
  maxMs: number;
  /** 迭代次数 */
  iterations: number;
  /** 总耗时（毫秒） */
  totalMs: number;
}

/** 基准测试用例 */
export interface BenchmarkCase {
  /** 用例名称 */
  name: string;
  /** 测试函数 */
  fn: () => unknown | Promise<unknown>;
  /** 可选配置 */
  options?: {
    /** 迭代次数 */
    iterations?: number;
    /** 预热次数 */
    warmup?: number;
  };
}

/** 基准测试套件结果 */
export interface BenchmarkSuiteResult {
  /** 套件名称 */
  name: string;
  /** 各用例结果 */
  results: BenchmarkResult[];
  /** 套件总耗时（毫秒） */
  totalMs: number;
}

/** 对比结果 */
export interface ComparisonResult {
  /** 基线名称 */
  baselineName: string;
  /** 当前名称 */
  currentName: string;
  /** 速度倍率（当前 / 基线，>1 表示更快） */
  speedRatio: number;
  /** 耗时差异百分比（负数表示更快） */
  diffPercent: number;
  /** 是否更快 */
  isFaster: boolean;
  /** 是否更慢 */
  isSlower: boolean;
}

/** 基准测试运行器配置 */
export interface BenchmarkRunnerOptions {
  /** 默认迭代次数 */
  defaultIterations?: number;
  /** 默认预热次数 */
  defaultWarmup?: number;
}

/**
 * 计算百分位数
 *
 * @param sortedArr - 已排序的数组（升序）
 * @param percentile - 百分位数（0-100）
 */
function percentile(sortedArr: number[], percentile: number): number {
  if (sortedArr.length === 0) return 0;
  const index = (percentile / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedArr[lower];
  const weight = index - lower;
  return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
}

/**
 * 基准测试运行器
 */
export class BenchmarkRunner {
  private defaultIterations: number;
  private defaultWarmup: number;

  constructor(options: BenchmarkRunnerOptions = {}) {
    this.defaultIterations = options.defaultIterations ?? 100;
    this.defaultWarmup = options.defaultWarmup ?? 10;
  }

  /**
   * 运行单个基准测试
   *
   * @param name - 基准测试名称
   * @param fn - 测试函数
   * @param options - 配置选项
   * @returns 基准测试结果
   */
  async run(
    name: string,
    fn: () => unknown | Promise<unknown>,
    options?: { iterations?: number; warmup?: number },
  ): Promise<BenchmarkResult> {
    const iterations = options?.iterations ?? this.defaultIterations;
    const warmup = options?.warmup ?? this.defaultWarmup;

    // 预热阶段
    for (let i = 0; i < warmup; i++) {
      await fn();
    }

    // 正式测试阶段
    const times: number[] = new Array(iterations);
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      await fn();
      const iterEnd = performance.now();
      times[i] = iterEnd - iterStart;
    }

    const endTime = performance.now();
    const totalMs = endTime - startTime;

    // 计算统计数据
    times.sort((a, b) => a - b);
    const avgMs = times.reduce((sum, t) => sum + t, 0) / iterations;
    const minMs = times[0];
    const maxMs = times[iterations - 1];
    const p50Ms = percentile(times, 50);
    const p95Ms = percentile(times, 95);
    const p99Ms = percentile(times, 99);
    const opsPerSecond = iterations / (totalMs / 1000);

    return {
      name,
      opsPerSecond,
      avgMs,
      p50Ms,
      p95Ms,
      p99Ms,
      minMs,
      maxMs,
      iterations,
      totalMs,
    };
  }

  /**
   * 运行基准测试套件
   *
   * @param name - 套件名称
   * @param cases - 测试用例数组
   * @returns 套件结果
   */
  async runSuite(name: string, cases: BenchmarkCase[]): Promise<BenchmarkSuiteResult> {
    const results: BenchmarkResult[] = [];
    const suiteStart = performance.now();

    for (const testCase of cases) {
      const result = await this.run(testCase.name, testCase.fn, testCase.options);
      results.push(result);
    }

    const suiteEnd = performance.now();

    return {
      name,
      results,
      totalMs: suiteEnd - suiteStart,
    };
  }

  /**
   * 对比两个基准测试结果
   *
   * @param baseline - 基线结果
   * @param current - 当前结果
   * @returns 对比结果
   */
  compare(baseline: BenchmarkResult, current: BenchmarkResult): ComparisonResult {
    const speedRatio = current.opsPerSecond / baseline.opsPerSecond;
    const diffPercent = ((current.avgMs - baseline.avgMs) / baseline.avgMs) * 100;

    return {
      baselineName: baseline.name,
      currentName: current.name,
      speedRatio,
      diffPercent,
      isFaster: speedRatio > 1,
      isSlower: speedRatio < 1,
    };
  }

  /**
   * 格式化基准测试结果
   *
   * @param result - 基准测试结果
   * @returns 格式化后的结果对象
   */
  formatResult(result: BenchmarkResult): {
    name: string;
    opsPerSecond: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    minMs: number;
    maxMs: number;
    iterations: number;
    totalMs: number;
  } {
    return {
      name: result.name,
      opsPerSecond: Math.round(result.opsPerSecond * 100) / 100,
      avgMs: Math.round(result.avgMs * 10000) / 10000,
      p50Ms: Math.round(result.p50Ms * 10000) / 10000,
      p95Ms: Math.round(result.p95Ms * 10000) / 10000,
      p99Ms: Math.round(result.p99Ms * 10000) / 10000,
      minMs: Math.round(result.minMs * 10000) / 10000,
      maxMs: Math.round(result.maxMs * 10000) / 10000,
      iterations: result.iterations,
      totalMs: Math.round(result.totalMs * 100) / 100,
    };
  }
}
