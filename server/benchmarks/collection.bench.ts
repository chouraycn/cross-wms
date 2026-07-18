/**
 * 集合操作基准测试
 *
 * 测试 Map vs Object、Set vs Array、数组排序等操作的性能。
 */
import { BenchmarkRunner } from '@cdf-know/benchmark';

const runner = new BenchmarkRunner({ defaultIterations: 10, defaultWarmup: 5 });

/**
 * Map vs Object 查找性能对比
 */
async function mapVsObjectLookup() {
  const size = 10000;
  const map = new Map<string, number>();
  const obj: Record<string, number> = {};
  const keys: string[] = [];

  for (let i = 0; i < size; i++) {
    const key = `key-${i}`;
    map.set(key, i);
    obj[key] = i;
    keys.push(key);
  }

  const lookupKeys = keys.slice(0, 1000);

  const results = [];

  const mapResult = await runner.run(
    'Map 查找 1000 次',
    () => {
      let sum = 0;
      for (const key of lookupKeys) {
        sum += map.get(key) ?? 0;
      }
      return sum;
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(mapResult);

  const objResult = await runner.run(
    'Object 查找 1000 次',
    () => {
      let sum = 0;
      for (const key of lookupKeys) {
        sum += obj[key] ?? 0;
      }
      return sum;
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(objResult);

  return results;
}

/**
 * Set vs Array 去重性能对比
 */
async function setVsArrayDedup() {
  const size = 10000;
  const arr: number[] = [];
  for (let i = 0; i < size; i++) {
    arr.push(i % 1000);
  }

  const results = [];

  const setResult = await runner.run(
    'Set 去重 (10000 条)',
    () => {
      return new Set(arr);
    },
    { iterations: 100, warmup: 10 },
  );
  results.push(setResult);

  const arrayFilterResult = await runner.run(
    'Array.filter + indexOf 去重 (10000 条)',
    () => {
      return arr.filter((item, index) => arr.indexOf(item) === index);
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(arrayFilterResult);

  const arrayIncludesResult = await runner.run(
    'Array.reduce + includes 去重 (10000 条)',
    () => {
      return arr.reduce<number[]>((acc, item) => {
        if (!acc.includes(item)) acc.push(item);
        return acc;
      }, []);
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(arrayIncludesResult);

  return results;
}

/**
 * 数组排序性能测试
 */
async function arraySorting() {
  const size = 10000;
  const arr: number[] = [];
  for (let i = 0; i < size; i++) {
    arr.push(Math.random() * 10000);
  }

  const results = [];

  const numberSortResult = await runner.run(
    '数组排序 10000 条 (数字)',
    () => {
      const copy = [...arr];
      copy.sort((a, b) => a - b);
      return copy;
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(numberSortResult);

  const objArr: Array<{ id: number; value: number; name: string }> = [];
  for (let i = 0; i < 5000; i++) {
    objArr.push({
      id: i,
      value: Math.floor(Math.random() * 5000),
      name: `item-${i}`,
    });
  }

  const objectSortResult = await runner.run(
    '数组排序 5000 条 (对象字段)',
    () => {
      const copy = [...objArr];
      copy.sort((a, b) => a.value - b.value);
      return copy;
    },
    { iterations: 50, warmup: 10 },
  );
  results.push(objectSortResult);

  return results;
}

export async function runCollectionBenchmarks() {
  console.log('\n=== 集合操作基准测试 ===\n');

  const mapObjResults = await mapVsObjectLookup();
  const setArrResults = await setVsArrayDedup();
  const sortResults = await arraySorting();
  const allResults = [...mapObjResults, ...setArrResults, ...sortResults];

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
  runCollectionBenchmarks().catch(console.error);
}
