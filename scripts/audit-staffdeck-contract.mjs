#!/usr/bin/env node
/**
 * StaffDeck 前后端契约对拍审计
 *
 * 背景：cross-wms 从 StaffDeck 移植时多次出现「字段级漏搬」——
 *   数据在库里齐全，但 cross-wms 后端序列化函数比原版少返回字段，
 *   导致嵌入前端读到 undefined，UI 显示为 0 / 空。
 *   已发生案例：document_count/bucket_count/chunk_count（知识库）、tool_count（MCP 服务器）。
 *
 * 本脚本以 StaffDeck 原版前端 `types/index.ts` 的接口定义为契约基准，
 * 与 cross-wms 后端 `server/types/staff.ts` 的同名接口做字段差集比对。
 *
 * 用法：
 *   node scripts/audit-staffdeck-contract.mjs            # 报告模式
 *   node scripts/audit-staffdeck-contract.mjs --strict   # CI 模式，有漏搬则退出码 1
 *   node scripts/audit-staffdeck-contract.mjs --json     # 机器可读输出
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FRONTEND_TYPES = path.join(
  ROOT,
  'StaffDeck-main/frontend-enterprise/src/types/index.ts',
);
const BACKEND_TYPES = path.join(ROOT, 'server/types/staff.ts');
const FRONTEND_SRC = path.join(ROOT, 'StaffDeck-main/frontend-enterprise/src');

const STRICT = process.argv.includes('--strict');
const AS_JSON = process.argv.includes('--json');

/**
 * 已知豁免：这些字段确认无需后端返回。
 * key = `接口名.字段名`，value = 豁免原因（必须写清楚，避免变成垃圾桶）
 */
const ALLOWLIST = {
  // 纯前端本地态，后端不产出
  'ChatMessage.streaming': '前端流式渲染中间态',
  'ChatMessage.pending': '前端乐观更新中间态',
};

// ---------------------------------------------------------------- 解析

/** 接口名归一化：忽略大小写差异（后端 McpServerRead vs 前端 MCPServerRead） */
function normalizeName(name) {
  return name.toLowerCase().replace(/_/g, '');
}

/**
 * 从 TS 源码中抽取类型定义的字段名。
 * 同时支持两种声明形式：
 *   - `interface X { ... }`（cross-wms 后端风格）
 *   - `type X = { ... }`（StaffDeck 前端风格）
 * 采用括号配平扫描，能正确处理嵌套对象字面量字段。
 */
function parseInterfaces(source) {
  const result = new Map(); // normalizedName -> { name, fields:Set }
  const re = /(?:export\s+)?(?:interface\s+([A-Za-z0-9_]+)[^{=]*|type\s+([A-Za-z0-9_]+)\s*=\s*)\{/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = m[1] || m[2];
    const bodyStart = re.lastIndex;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    const body = source.slice(bodyStart, i - 1);
    const key = normalizeName(name);
    // 同名归一化冲突时合并字段（例如 Row + Read 不会冲突，但保守处理）
    const prev = result.get(key);
    if (prev) {
      for (const f of extractTopLevelFields(body)) prev.fields.add(f);
    } else {
      result.set(key, { name, fields: extractTopLevelFields(body) });
    }
  }
  return result;
}

/** 抽取接口体中的顶层字段名（跳过嵌套层、注释、字符串） */
function extractTopLevelFields(body) {
  const fields = new Set();
  let depth = 0;
  let line = '';
  const flush = () => {
    const text = line.trim();
    line = '';
    if (!text || text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return;
    const fm = /^([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:/.exec(text);
    if (fm) fields.add(fm[1]);
  };
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;

    if (depth === 0 && (ch === ';' || ch === '\n')) {
      flush();
      continue;
    }
    // 嵌套层内容整体忽略（其字段不是顶层契约字段）
    if (depth === 0) line += ch;
    else if (line.trim() === '' && depth > 0) {
      // 嵌套开始前的字段名已在 line 中，保留
      line += ch;
    } else {
      line += ch;
    }
  }
  flush();
  return fields;
}

/** 统计某字段在前端源码中被实际引用的次数（排除类型定义文件本身） */
function countFrontendUsage(field) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        if (p === FRONTEND_TYPES) continue;
        const text = fs.readFileSync(p, 'utf8');
        const re = new RegExp(`\\b${field}\\b`, 'g');
        const hits = text.match(re);
        if (hits) count += hits.length;
      }
    }
  };
  if (fs.existsSync(FRONTEND_SRC)) walk(FRONTEND_SRC);
  return count;
}

// ---------------------------------------------------------------- 主流程

function main() {
  for (const f of [FRONTEND_TYPES, BACKEND_TYPES]) {
    if (!fs.existsSync(f)) {
      console.error(`[audit] 找不到契约文件: ${f}`);
      process.exit(2);
    }
  }

  const feIfaces = parseInterfaces(fs.readFileSync(FRONTEND_TYPES, 'utf8'));
  const beIfaces = parseInterfaces(fs.readFileSync(BACKEND_TYPES, 'utf8'));

  const findings = [];
  const shared = [];
  const usageCache = new Map();

  for (const [key, fe] of feIfaces) {
    const be = beIfaces.get(key);
    if (!be) continue; // 后端没有对应接口 → 不在本脚本比对范围
    shared.push(fe.name);
    for (const field of fe.fields) {
      if (be.fields.has(field)) continue;
      if (ALLOWLIST[`${fe.name}.${field}`]) continue;
      if (!usageCache.has(field)) usageCache.set(field, countFrontendUsage(field));
      const usage = usageCache.get(field);
      if (usage === 0) continue; // 前端声明了但从未使用 → 不算漏搬
      findings.push({ iface: fe.name, backendIface: be.name, field, frontendUsage: usage });
    }
  }

  findings.sort((a, b) => b.frontendUsage - a.frontendUsage);

  if (AS_JSON) {
    console.log(JSON.stringify({ comparedInterfaces: shared, findings }, null, 2));
  } else {
    console.log('StaffDeck 前后端契约对拍审计');
    console.log(`  基准（前端）: ${path.relative(ROOT, FRONTEND_TYPES)}`);
    console.log(`  对照（后端）: ${path.relative(ROOT, BACKEND_TYPES)}`);
    console.log(`  同名接口数  : ${shared.length}`);
    console.log('');
    if (findings.length === 0) {
      console.log('  ✅ 未发现字段级漏搬');
    } else {
      console.log(`  ❌ 发现 ${findings.length} 个疑似漏搬字段：`);
      for (const f of findings) {
        console.log(
          `     ${f.iface}.${f.field}`.padEnd(52) +
            `前端引用 ${f.frontendUsage} 次 / 后端未定义`,
        );
      }
    }
  }

  if (STRICT && findings.length > 0) process.exit(1);
}

main();
