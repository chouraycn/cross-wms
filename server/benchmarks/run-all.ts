/**
 * 运行所有基准测试并输出报告
 *
 * 快速模式：使用较小数据量，确保框架可用。
 */
import { runStorageBenchmarks } from './storage.bench.js';
import { runSerializationBenchmarks } from './serialization.bench.js';
import { runStringProcessingBenchmarks } from './string-processing.bench.js';
import { runCollectionBenchmarks } from './collection.bench.js';
import { runPlannerBenchmarks } from './planner.bench.js';
import { BenchmarkRunner, type BenchmarkResult } from '@cdf-know/benchmark';

const runner = new BenchmarkRunner();

interface BenchmarkReport {
  suite: string;
  results: BenchmarkResult[];
}

async function runAllBenchmarks(): Promise<BenchmarkReport[]> {
  console.log('========================================');
  console.log('  CrossWMS 性能基准测试（快速模式）');
  console.log('========================================');
  console.log('');

  const reports: BenchmarkReport[] = [];

  reports.push({
    suite: '存储',
    results: await runStorageBenchmarks(),
  });

  reports.push({
    suite: '序列化',
    results: await runSerializationBenchmarks(),
  });

  reports.push({
    suite: '字符串处理',
    results: await runStringProcessingBenchmarks(),
  });

  reports.push({
    suite: '集合操作',
    results: await runCollectionBenchmarks(),
  });

  reports.push({
    suite: 'Planner',
    results: await runPlannerBenchmarks(),
  });

  return reports;
}

function printSummary(reports: BenchmarkReport[]) {
  console.log('========================================');
  console.log('  性能基准测试汇总');
  console.log('========================================');
  console.log('');

  let totalTests = 0;
  let totalOps = 0;

  for (const report of reports) {
    console.log(`【${report.suite}】`);
    for (const result of report.results) {
      const formatted = runner.formatResult(result);
      console.log(`  ${formatted.name}`);
      console.log(`    ${formatted.opsPerSecond.toFixed(2)} ops/s | avg: ${formatted.avgMs.toFixed(4)}ms | P95: ${formatted.p95Ms.toFixed(4)}ms`);
      totalTests++;
      totalOps += result.opsPerSecond;
    }
    console.log('');
  }

  console.log(`总测试用例: ${totalTests}`);
  console.log('');
}

if (require.main === module) {
  runAllBenchmarks()
    .then((reports) => {
      printSummary(reports);
      console.log('✅ 所有基准测试完成');
    })
    .catch((error) => {
      console.error('❌ 基准测试失败:', error);
      process.exit(1);
    });
}

export { runAllBenchmarks, printSummary };
