/**
 * 字符串处理基准测试
 *
 * 测试字符串拼接、正则匹配、URL 解析等操作的性能。
 */
import { BenchmarkRunner } from '@cdf-know/benchmark';

const runner = new BenchmarkRunner({ defaultIterations: 10, defaultWarmup: 5 });

/**
 * 字符串拼接性能测试
 */
async function stringConcat() {
  const result = await runner.run(
    '字符串拼接 10000 次',
    () => {
      let str = '';
      for (let i = 0; i < 10000; i++) {
        str += i.toString();
      }
      return str;
    },
    { iterations: 10, warmup: 3 },
  );

  const result2 = await runner.run(
    '字符串数组 join 10000 次',
    () => {
      const arr: string[] = [];
      for (let i = 0; i < 10000; i++) {
        arr.push(i.toString());
      }
      return arr.join('');
    },
    { iterations: 10, warmup: 3 },
  );

  return [result, result2];
}

/**
 * 正则匹配性能测试
 */
async function regexMatching() {
  const testStrings: string[] = [];
  for (let i = 0; i < 1000; i++) {
    testStrings.push(`user${i}@example.com`);
    testStrings.push(`https://example.com/path/${i}`);
    testStrings.push(`just plain text ${i}`);
    testStrings.push(`+86-138-${String(i).padStart(8, '0')}`);
  }

  const emailRegex = /^[\w.-]+@[\w.-]+\.\w+$/;
  const urlRegex = /^https?:\/\/[\w.-]+\/[\w./-]+$/;
  const phoneRegex = /^\+\d{2}-\d{3}-\d{8}$/;

  const results = [];

  const emailResult = await runner.run(
    '正则匹配 - 邮箱 1000 次',
    () => {
      let count = 0;
      for (const str of testStrings) {
        if (emailRegex.test(str)) count++;
      }
      return count;
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(emailResult);

  const urlResult = await runner.run(
    '正则匹配 - URL 1000 次',
    () => {
      let count = 0;
      for (const str of testStrings) {
        if (urlRegex.test(str)) count++;
      }
      return count;
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(urlResult);

  const phoneResult = await runner.run(
    '正则匹配 - 手机号 1000 次',
    () => {
      let count = 0;
      for (const str of testStrings) {
        if (phoneRegex.test(str)) count++;
      }
      return count;
    },
    { iterations: 20, warmup: 5 },
  );
  results.push(phoneResult);

  return results;
}

/**
 * URL 解析性能测试
 */
async function urlParsing() {
  const urls: string[] = [];
  for (let i = 0; i < 500; i++) {
    urls.push(`https://example.com/api/v1/users/${i}?page=${i}&limit=10&sort=name`);
    urls.push(`https://api.example.org/v2/items/${i}/details?include=meta`);
    urls.push(`http://localhost:3000/path/to/resource?q=test&lang=zh`);
  }

  const result = await runner.run(
    'URL 解析 500 次 (URL 构造函数)',
    () => {
      for (const url of urls) {
        const parsed = new URL(url);
        void parsed.hostname;
        void parsed.pathname;
        void parsed.searchParams.get('page');
      }
    },
    { iterations: 10, warmup: 3 },
  );

  return [result];
}

export async function runStringProcessingBenchmarks() {
  console.log('\n=== 字符串处理基准测试 ===\n');

  const concatResults = await stringConcat();
  const regexResults = await regexMatching();
  const urlResults = await urlParsing();
  const allResults = [...concatResults, ...regexResults, ...urlResults];

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
  runStringProcessingBenchmarks().catch(console.error);
}
