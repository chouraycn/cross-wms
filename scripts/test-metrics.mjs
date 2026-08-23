#!/usr/bin/env node
/**
 * test-metrics.mjs — 测试度量地基
 *
 * 聚合一个或多个 vitest JSON 报告（--reporter=json --outputFile=*.json 产出），
 * 生成统一的 test-metrics.json，便于在 CI 中持久化、跨次对比、趋势追踪。
 *
 * 用法：
 *   node scripts/test-metrics.mjs report-a.json report-b.json
 *   # 不传参则默认读取 ./test-unit.json 与 ./e2e-metrics.json（若存在）
 *
 * 输出 test-metrics.json：
 * {
 *   "generatedAt": ISOString,
 *   "totals": { files, tests, pass, fail, skip, durationMs },
 *   "suites": [ { name, source, tests, pass, fail, skip, durationMs } ]
 * }
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DEFAULT_INPUTS = ['test-unit.json', 'e2e-metrics.json'];

function parseReport(path) {
  if (!existsSync(path)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.warn(`⚠️  无法解析 ${path}: ${e.message}`);
    return null;
  }
  const numTotal = data.numTotalTests ?? 0;
  const numPassed = data.numPassedTests ?? 0;
  const numFailed = data.numFailedTests ?? 0;
  const numPending =
    (data.numPendingTests ?? 0) + (data.numSkippedTests ?? 0) + (data.numTodoTests ?? 0);
  const results = Array.isArray(data.testResults) ? data.testResults : [];
  const suites = results.map((tr) => {
    const asserts = Array.isArray(tr.assertionResults) ? tr.assertionResults : [];
    return {
      name: tr.name,
      tests: asserts.length,
      pass: asserts.filter((a) => a.status === 'passed').length,
      fail: asserts.filter((a) => a.status === 'failed').length,
      skip: asserts.filter((a) => a.status === 'pending' || a.status === 'skipped').length,
      durationMs: Number(tr.duration) || 0,
    };
  });
  const span = (data.endTime ?? 0) - (data.startTime ?? 0);
  const durationMs = span > 0 ? span : Math.max(0, suites.reduce((s, x) => s + x.durationMs, 0));
  return {
    files: data.numTotalTestSuites ?? suites.length,
    tests: numTotal,
    pass: numPassed,
    fail: numFailed,
    skip: numPending,
    durationMs,
    suites,
  };
}

const argv = process.argv.slice(2);
const inputs = argv.length > 0 ? argv : DEFAULT_INPUTS;

const totals = { files: 0, tests: 0, pass: 0, fail: 0, skip: 0, durationMs: 0 };
const suites = [];

for (const input of inputs) {
  const rep = parseReport(input);
  if (!rep) continue;
  console.log(
    `📊 ${input}: ${rep.pass}/${rep.tests} passed, ${rep.fail} failed, ${rep.skip} skipped (${rep.files} files)`
  );
  totals.files += rep.files;
  totals.tests += rep.tests;
  totals.pass += rep.pass;
  totals.fail += rep.fail;
  totals.skip += rep.skip;
  totals.durationMs += rep.durationMs;
  for (const s of rep.suites) suites.push({ ...s, source: input });
}

const report = { generatedAt: new Date().toISOString(), totals, suites };

const outPath = process.env.TEST_METRICS_OUT || 'test-metrics.json';
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

const rate = totals.tests > 0 ? ((totals.pass / totals.tests) * 100).toFixed(2) : '0.00';
console.log('\n=== Test Metrics Summary ===');
console.log(`Files : ${totals.files}`);
console.log(`Tests : ${totals.tests}`);
console.log(`Pass  : ${totals.pass} (${rate}%)`);
console.log(`Fail  : ${totals.fail}`);
console.log(`Skip  : ${totals.skip}`);
console.log(`Time  : ${(totals.durationMs / 1000).toFixed(1)}s`);
console.log(`\n✅ Written to ${outPath}`);

// 非零退出：若失败数 > 0，方便 CI 软门禁用（但本脚本仅聚合，不判失败）
process.exit(0);
