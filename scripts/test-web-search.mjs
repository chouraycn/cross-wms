/**
 * 测试国内搜索引擎
 */

import { webSearch } from '../server/engine/web-search-new.ts';

async function main() {
  console.log('\n=== 测试国内搜索引擎 ===\n');

  const queries = [
    'React 教程',
    'Node.js 最新版本',
    '仓库管理系统 开源',
    'TypeScript 类型系统',
  ];

  for (const query of queries) {
    try {
      const r = await webSearch({ query, maxResults: 5 });
      console.log(`Query: ${query}`);
      console.log(`  Provider: ${r.provider}`);
      console.log(`  Results: ${r.count}`);
      if (r.results.length > 0) {
        console.log(`  First: ${r.results[0].title}`);
      }
      console.log();
    } catch (e) {
      console.error(`搜索失败: ${query}`, e.message);
    }
  }
}

main();