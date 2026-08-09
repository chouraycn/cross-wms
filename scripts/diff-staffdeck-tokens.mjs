#!/usr/bin/env node
/**
 * diff-staffdeck-tokens.mjs
 *
 * 对比「员工完整 CSS（canonical）」与仓库员工 CSS 的 :root token 集，
 * 找出值级漂移 / 缺失，辅助把仓库员工 CSS 对齐到 StaffDeck-main 设计系统。
 *
 * 用法：
 *   node scripts/diff-staffdeck-tokens.mjs
 *
 * 设计要点：
 * - 解析前先剥离 CSS 注释（避免注释里的 `}` 破坏花括号配对）。
 * - canonical 取含 `--primary` 的 :root（即 teal 主主题）。
 * - 仓库文件取「主 teal 主题」：第一个同时含 --accent 且值非 #111111 的 :root；
 *   裸的中性 :root（--accent:#111111）会被标记为「覆盖块」，不参与主主题比较。
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CANON = 'StaffDeck-main/frontend-enterprise/src/styles.css';
const FILES = [
  'src/styles/staffdeck.css',
  'src/styles/staffdeck-source.css',
];

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractRoots(rel) {
  const abs = path.join(ROOT, rel);
  const raw = fs.readFileSync(abs, 'utf8');
  const s = stripComments(raw);
  const roots = [];
  let i = 0;
  while ((i = s.indexOf(':root', i)) !== -1) {
    const ob = s.indexOf('{', i);
    if (ob === -1) break;
    let depth = 0, j = ob;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) break; }
    }
    const body = s.slice(ob + 1, j);
    const toks = {};
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
      if (m) toks[m[1]] = m[2].trim();
    }
    roots.push(toks);
    i = j + 1;
  }
  return roots;
}

function pickPrimary(roots) {
  // 主 teal 主题：含 --primary 且 --accent 不是中性 #111111
  for (const r of roots) {
    if (r['--primary'] && r['--accent'] && r['--accent'] !== '#111111') return r;
  }
  // 退而求其次：含 --primary 的第一个
  for (const r of roots) if (r['--primary']) return r;
  return roots[0] || {};
}

function pickNeutralOverride(roots) {
  for (const r of roots) {
    if (r['--accent'] === '#111111') return r;
  }
  return null;
}

const canonRoots = extractRoots(CANON);
const can = pickPrimary(canonRoots);

console.log('canonical :root blocks =', canonRoots.length, '| primary token count =', Object.keys(can).length);
console.log('');

for (const f of FILES) {
  const roots = extractRoots(f);
  const primary = pickPrimary(roots);
  const neutral = pickNeutralOverride(roots);
  console.log('=== ' + f + ' ===');
  console.log('  primary :root token count =', Object.keys(primary).length);
  if (neutral) {
    console.log('  ⚠ 检测到裸中性 :root 覆盖块（--accent:#111111）→ 全局覆写主主题，属漂移');
  }

  const all = new Set([...Object.keys(can), ...Object.keys(primary)]);
  let diffs = 0, missing = 0, extra = 0;
  for (const k of [...all].sort()) {
    const cv = can[k], wv = primary[k];
    if (cv === undefined) { console.log('    EXTRA   ' + k + ' = ' + wv); extra++; continue; }
    if (wv === undefined) { console.log('    MISSING ' + k + ' (canonical=' + cv + ')'); missing++; continue; }
    if (cv !== wv) { console.log('    DIFF    ' + k + ': canonical=' + cv + ' | warehouse=' + wv); diffs++; }
  }
  console.log('  -> ' + diffs + ' value diffs, ' + missing + ' missing, ' + extra + ' extra\n');
}
