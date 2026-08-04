// ============================================================================
// scripts/check-db-types.ts — Kysely 类型 lint 守卫
//
// 检查项：
//   1. server/types/db-types.ts 是否存在（不存在则失败，提示生成）
//   2. 类型文件是否过期（任一 schema 文件比 db-types.ts 更新则失败，提示重新生成）
//   3. 扫描 server/ 下直接拼接 SQL 字符串的 db.exec / db.prepare 调用（裸 SQL），
//      作为渐进迁移提示输出（不阻断，仅警告）
//
// 退出码：0 = 通过；1 = 类型缺失或过期（需重新生成）
// 用法：npm run db:kysely:check
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const TYPES_FILE = path.join(ROOT, 'server', 'types', 'db-types.ts');
const SERVER_DIR = path.join(ROOT, 'server');
const MIGRATIONS_DIR = path.join(ROOT, 'server', 'migrations');

const errors: string[] = [];
const warnings: string[] = [];

// 1) 类型文件存在性
if (!fs.existsSync(TYPES_FILE)) {
  errors.push(
    `❌ 缺少 Kysely 类型文件: server/types/db-types.ts\n` +
    `   请运行: npm run db:kysely:gen`
  );
} else {
  // 2) 过期检查：若任一 schema 文件比类型文件新，提示重新生成
  const typeMtime = fs.statSync(TYPES_FILE).mtimeMs;
  const schemaFiles = collectSchemaFiles(SERVER_DIR);
  const stale = schemaFiles.filter(f => fs.statSync(f).mtimeMs > typeMtime);
  if (stale.length > 0) {
    errors.push(
      `❌ 类型文件已过期（以下 schema 文件比 db-types.ts 更新）:\n` +
      stale.map(f => `   - ${path.relative(ROOT, f)}`).join('\n') +
      `\n   请运行: npm run db:kysely:gen`
    );
  }
}

// 3) 裸 SQL 扫描：db.exec(`...`) / db.prepare(`...`) 内联模板字符串
const bareSqlHits = scanBareSql(SERVER_DIR);
if (bareSqlHits.length > 0) {
  warnings.push(
    `⚠️  检测到 ${bareSqlHits.length} 处裸 SQL 查询（db.exec/db.prepare 内联字符串）。\n` +
    `   建议逐步迁移到 Kysely 类型化查询。示例位置:\n` +
    bareSqlHits.slice(0, 10).map(h => `   - ${path.relative(ROOT, h.file)}:${h.line}`).join('\n') +
    (bareSqlHits.length > 10 ? `\n   ...（共 ${bareSqlHits.length} 处）` : '')
  );
}

for (const w of warnings) console.log(w);
for (const e of errors) console.log(e);

if (errors.length > 0) {
  process.exit(1);
}
// 裸 SQL 为历史遗留，渐进迁移，仅警告不阻断
process.exit(0);

// ---------------------------------------------------------------------------
function collectSchemaFiles(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'migrations' || name === 'dist' || name === 'dist-server') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      result.push(...collectSchemaFiles(full));
    } else if (/^db-.*\.ts$/.test(name) || /Tables\.ts$/.test(name)) {
      result.push(full);
    }
  }
  return result;
}

interface Hit { file: string; line: number; }

function scanBareSql(dir: string): Hit[] {
  const hits: Hit[] = [];
  if (!fs.existsSync(dir)) return hits;
  walk(dir, (file) => {
    if (!file.endsWith('.ts')) return;
    // 跳过迁移目录（迁移本身需要原生 SQL）
    if (file.startsWith(MIGRATIONS_DIR)) return;
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      // 匹配 db.exec(`...`) 或 db.prepare(`...`) 中的内联模板字符串
      if (/db\.(exec|prepare)\(\s*`/.test(line)) {
        hits.push({ file, line: idx + 1 });
      }
    });
  });
  return hits;
}

function walk(dir: string, cb: (file: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-server') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, cb);
    else cb(full);
  }
}
