#!/usr/bin/env node
/**
 * P2/P3 渐进治理 codemod（DRY_RUN 模式，不会修改文件）
 *
 * 三个能力：
 *   A. console.log/warn/error/info/debug/trace → log.{level} / logger.{level}
 *        （有 logger 或 log import 的文件才改写，否则不动）
 *   B. catch {} → catch (e) { logger.debug("swallowed", e); }
 *   C. @ts-ignore → @ts-expect-error + "FIXME: <原内容行号参考>"
 *
 * 用法：
 *   node scripts/security/codemod-p2-p3.cjs --apply       # 真正修改文件
 *   node scripts/security/codemod-p2-p3.cjs               # DRY_RUN 只打印预览
 *   node scripts/security/codemod-p2-p3.cjs --scope server/engine/workflow
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = !process.argv.includes('--apply');
const SCOPE_ARG = process.argv.find((a) => a.startsWith('--scope='));
const SCOPE = SCOPE_ARG ? SCOPE_ARG.slice('--scope='.length) : '.';

const TARGET_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.workbuddy',
  'StaffDeck-main',
  'openclaw',
]);

let stats = {
  filesScanned: 0,
  consoleRewrites: 0,
  catchRewrites: 0,
  tsIgnoreRewrites: 0,
  filesChanged: new Set(),
};

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && TARGET_EXT.has(path.extname(entry.name))) {
      processFile(full);
    }
  }
}

function consoleRewrite(src, file) {
  // 判断文件是否已导入 logger / log
  const hasLoggerImport = /import\s+.*\blogger\b.*from/.test(src);
  const hasLogImport = /import\s+.*\blog\b.*from/.test(src) || /\b(log\s*=|const\s+log\b)/.test(src);
  if (!hasLoggerImport && !hasLogImport) {
    return { src, changed: false, count: 0 };
  }
  // 优先用 logger，其次用 log
  const target = hasLoggerImport ? 'logger' : 'log';

  let count = 0;
  const newSrc = src.replace(
    /\bconsole\.(log|warn|error|info|debug|trace)\b/g,
    (match, level) => {
      count++;
      // 同级别 1:1 映射
      return `${target}.${level}`;
    },
  );
  return { src: newSrc, changed: count > 0, count };
}

function catchRewrite(src) {
  let count = 0;
  // 空 catch 模式： catch\s*\(\s*\)\s*\{\s*\}   或   catch\s*\{
  const newSrc = src.replace(
    /catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\}/g,
    () => {
      count++;
      // 统一用 console.debug（前端没有 logger、后端 server 常导入 log/logger 两种命名）
      // 这样不论在哪种代码路径都能保证引用存在，避免 tsc 报 Cannot find name 'logger'
      return 'catch (e) { console.debug("[compat-swallowed]", e); }';
    },
  );
  return { src: newSrc, changed: count > 0, count };
}

function tsIgnoreRewrite(src) {
  let count = 0;
  // 替换 // @ts-ignore [optional comment] 为 // @ts-expect-error FIXME: ...
  const newSrc = src.replace(
    /(^|\s+)\/\/\s*@ts-ignore(?:\s*(.*))?$/gm,
    (_m, prefix, rest) => {
      count++;
      const note = rest && rest.trim() ? rest.trim() : 'legacy suppression, needs investigation';
      return `${prefix}// @ts-expect-error FIXME: ${note}`;
    },
  );
  return { src: newSrc, changed: count > 0, count };
}

function processFile(file) {
  stats.filesScanned++;
  let src = fs.readFileSync(file, 'utf8');
  let total = 0;

  const a = consoleRewrite(src, file);
  if (a.changed) {
    src = a.src;
    total += a.count;
    stats.consoleRewrites += a.count;
  }

  const b = catchRewrite(src);
  if (b.changed) {
    src = b.src;
    total += b.count;
    stats.catchRewrites += b.count;
  }

  const c = tsIgnoreRewrite(src);
  if (c.changed) {
    src = c.src;
    total += c.count;
    stats.tsIgnoreRewrites += c.count;
  }

  if (total > 0) {
    stats.filesChanged.add(file);
    if (DRY_RUN) {
      console.log(`[DRY] ${file}  →  console:${a.count}  catch:${b.count}  ts-ignore:${c.count}`);
    } else {
      fs.writeFileSync(file, src, 'utf8');
      console.log(`[APPLY] ${file}  →  console:${a.count}  catch:${b.count}  ts-ignore:${c.count}`);
    }
  }
}

console.log(`\n=== P2/P3 codemod  (DRY_RUN=${DRY_RUN}, scope="${SCOPE}") ===\n`);
walk(path.resolve(SCOPE));

console.log(`
Scan complete:
  files scanned:           ${stats.filesScanned}
  files w/ changes:        ${stats.filesChanged.size}
  console.* → logger.*:    ${stats.consoleRewrites}
  empty catch {} → log:    ${stats.catchRewrites}
  @ts-ignore → @ts-expect: ${stats.tsIgnoreRewrites}
`);

if (DRY_RUN) {
  console.log('\n[DRY_RUN] 如确认结果无误，请加上 --apply 参数真正修改文件。\n');
}
