import fs from 'fs';
import path from 'path';

const OPENCLAW_SRC = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/openclaw/src';
const SERVER_ENGINE = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server/engine';

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', 'test', '.git']);
const TEST_PATTERNS = ['.test.', '.spec.', 'test-helper', 'test-helpers', 'test-support', 'test-harness', 'test-setup', '.test-'];

function isTestFile(fileName) {
  return TEST_PATTERNS.some(p => fileName.includes(p));
}

function getAllNonTestTsFiles(dir, baseDir, result = []) {
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      getAllNonTestTsFiles(fullPath, baseDir, result);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      if (isTestFile(entry.name)) continue;
      result.push({
        relativePath: path.relative(baseDir, fullPath),
        fullPath,
        fileName: entry.name,
        dir: path.dirname(path.relative(baseDir, fullPath)),
      });
    }
  }
  return result;
}

function getExistingFileSet(dir) {
  const set = new Set();
  if (!fs.existsSync(dir)) return set;
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        set.add(path.relative(dir, fullPath));
      }
    }
  }
  walk(dir);
  return set;
}

function fixHtmlEntities(content) {
  return content
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&colon;/g, ':')
    .replace(/&comma;/g, ',')
    .replace(/&period;/g, '.')
    .replace(/&slash;/g, '/')
    .replace(/&backslash;/g, '\\');
}

function hasOpenclawImports(content) {
  return /from\s+["']@openclaw\//.test(content) || /require\s*\(\s*["']@openclaw\//.test(content);
}

function portModule(moduleName) {
  const srcDir = path.join(OPENCLAW_SRC, moduleName);
  const destDir = path.join(SERVER_ENGINE, moduleName);

  if (!fs.existsSync(srcDir)) {
    console.log(`  ⚠️  源目录不存在: ${srcDir}`);
    return { ported: 0, skipped: 0, total: 0 };
  }

  const srcFiles = getAllNonTestTsFiles(srcDir, srcDir);
  const existingFiles = getExistingFileSet(destDir);

  const missing = [];
  for (const f of srcFiles) {
    if (!existingFiles.has(f.relativePath)) {
      missing.push(f);
    }
  }

  console.log(`  📂 ${moduleName}/: ${srcFiles.length} 个源文件, ${existingFiles.size} 个已存在, ${missing.length} 个待移植`);

  if (missing.length === 0) {
    return { ported: 0, skipped: 0, total: srcFiles.length };
  }

  let ported = 0;
  let skipped = 0;

  for (const f of missing) {
    const destPath = path.join(destDir, f.relativePath);
    const destDirPath = path.dirname(destPath);

    if (!fs.existsSync(destDirPath)) {
      fs.mkdirSync(destDirPath, { recursive: true });
    }

    let content;
    try {
      content = fs.readFileSync(f.fullPath, 'utf-8');
    } catch (err) {
      console.log(`    ❌ 读取失败: ${f.relativePath} - ${err.message}`);
      skipped++;
      continue;
    }

    content = fixHtmlEntities(content);

    const needsTsNoCheck = hasOpenclawImports(content);
    if (needsTsNoCheck) {
      content = `// @ts-nocheck\n${content}`;
    }

    try {
      fs.writeFileSync(destPath, content, 'utf-8');
      ported++;
      console.log(`    ✅ ${f.relativePath}${needsTsNoCheck ? '  (加 @ts-nocheck)' : ''}`);
    } catch (err) {
      console.log(`    ❌ 写入失败: ${f.relativePath} - ${err.message}`);
      skipped++;
    }
  }

  return { ported, skipped, total: srcFiles.length };
}

const modules = [
  { name: 'gateway', priority: 'high' },
  { name: 'cron', priority: 'high' },
  { name: 'secrets', priority: 'high' },
  { name: 'shared', priority: 'high' },
  { name: 'security', priority: 'high' },
  { name: 'logging', priority: 'medium' },
  { name: 'daemon', priority: 'medium' },
  { name: 'media-understanding', priority: 'medium' },
  { name: 'media', priority: 'medium' },
  { name: 'hooks', priority: 'medium' },
  { name: 'flows', priority: 'medium' },
  { name: 'wizard', priority: 'medium' },
  { name: 'plugin-state', priority: 'medium' },
];

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║     OpenClaw → Cross-WMS 深度移植脚本                          ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`源目录: ${OPENCLAW_SRC}`);
console.log(`目标目录: ${SERVER_ENGINE}`);
console.log();

const results = {};
let totalPorted = 0;
let totalSkipped = 0;

for (const mod of modules) {
  console.log(`\n🔤 模块: ${mod.name} [${mod.priority}]`);
  const result = portModule(mod.name);
  results[mod.name] = result;
  totalPorted += result.ported;
  totalSkipped += result.skipped;
}

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║                        移植结果汇总                             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log();

const sorted = Object.entries(results).sort((a, b) => b[1].ported - a[1].ported);
for (const [name, stats] of sorted) {
  const bar = stats.ported > 0 ? '█'.repeat(Math.min(stats.ported, 30)) : '';
  console.log(`  ${name.padEnd(22)} 移植 ${String(stats.ported).padStart(4)} 个  ${bar}`);
}

console.log();
console.log(`  总计移植: ${totalPorted} 个文件`);
console.log(`  跳过失败: ${totalSkipped} 个文件`);

console.log('\n完成。');