/**
 * 序列化基准测试
 *
 * 测试 JSON 序列化/反序列化、深拷贝等操作的性能。
 */
import { BenchmarkRunner } from '@cdf-know/benchmark';

const runner = new BenchmarkRunner({ defaultIterations: 100, defaultWarmup: 10 });

/**
 * 生成指定大小的对象
 */
function generateLargeObject(kbSize: number): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: 'test-object',
    name: `Large Object ${kbSize}KB`,
    timestamp: Date.now(),
    nested: {
      level1: {
        level2: {
          level3: {
            value: 'deeply nested value',
          },
        },
      },
    },
    array: [],
  };

  const targetBytes = kbSize * 1024;
  let currentBytes = JSON.stringify(obj).length;

  let i = 0;
  while (currentBytes < targetBytes) {
    (obj.array as unknown[]).push({
      index: i,
      data: `item-${i}-${'x'.repeat(Math.min(100, Math.floor((targetBytes - currentBytes) / 10)))}`,
      tags: [`tag-${i % 10}`, `category-${i % 5}`],
      metadata: {
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i + 100,
      },
    });
    i++;
    currentBytes = JSON.stringify(obj).length;
  }

  return obj;
}

/**
 * JSON 序列化/反序列化测试
 */
async function jsonBenchmarks() {
  const obj100kb = generateLargeObject(10);
  const obj1mb = generateLargeObject(100);

  const results = [];

  const jsonStringify100kb = await runner.run(
    'JSON.stringify 小对象 (~10KB)',
    () => {
      JSON.stringify(obj100kb);
    },
    { iterations: 100, warmup: 10 },
  );
  results.push(jsonStringify100kb);

  const jsonStr = JSON.stringify(obj100kb);
  const jsonParse100kb = await runner.run(
    'JSON.parse 小对象 (~10KB)',
    () => {
      JSON.parse(jsonStr);
    },
    { iterations: 100, warmup: 10 },
  );
  results.push(jsonParse100kb);

  const jsonStringify1mb = await runner.run(
    'JSON.stringify 大对象 (~100KB)',
    () => {
      JSON.stringify(obj1mb);
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(jsonStringify1mb);

  const jsonStrBig = JSON.stringify(obj1mb);
  const jsonParse1mb = await runner.run(
    'JSON.parse 大对象 (~100KB)',
    () => {
      JSON.parse(jsonStrBig);
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(jsonParse1mb);

  return results;
}

/**
 * 深拷贝性能对比
 */
function deepCloneJson(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj));
}

function deepCloneRecursive(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCloneRecursive(item));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    result[key] = deepCloneRecursive((obj as Record<string, unknown>)[key]);
  }
  return result;
}

async function deepCloneBenchmarks() {
  const obj = generateLargeObject(20);
  const results = [];

  const jsonClone = await runner.run(
    '深拷贝 - JSON.parse(JSON.stringify)',
    () => {
      deepCloneJson(obj);
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(jsonClone);

  const recursiveClone = await runner.run(
    '深拷贝 - 递归实现',
    () => {
      deepCloneRecursive(obj);
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(recursiveClone);

  const structuredCloneResult = await runner.run(
    '深拷贝 - structuredClone',
    () => {
      structuredClone(obj);
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(structuredCloneResult);

  return results;
}

export async function runSerializationBenchmarks() {
  console.log('\n=== 序列化基准测试 ===\n');

  const jsonResults = await jsonBenchmarks();
  const cloneResults = await deepCloneBenchmarks();
  const allResults = [...jsonResults, ...cloneResults];

  for (const r of allResults) {
    const formatted = runner.formatResult(r);
    console.log(`${formatted.name}:`);
    console.log(`  每秒操作: ${formatted.opsPerSecond.toFixed(2)} ops/s`);
    console.log(`  平均耗时: ${formatted.avgMs.toFixed(4)} ms`);
    console.log('');
  }

  return allResults;
}

if (require.main === module) {
  runSerializationBenchmarks().catch(console.error);
}
