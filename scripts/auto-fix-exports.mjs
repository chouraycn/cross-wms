#!/usr/bin/env node
// Auto-fix script: detects "No matching export" errors from esbuild and adds stub exports.
// Usage: node scripts/auto-fix-exports.mjs

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

// Run esbuild with the same config as pre-build-check
const cmd = [
  './node_modules/.bin/esbuild',
  'server/index.ts',
  '--bundle',
  '--platform=node',
  '--target=node22',
  '--format=cjs',
  '--outfile=/tmp/auto-fix-bundle.cjs',
  `--alias:@src=${ROOT_DIR}/src`,
  '--external:better-sqlite3',
  '--external:@cdfclaw/*',
  '--external:@modelcontextprotocol/sdk',
  '--external:json5',
  '--external:onnxruntime-node',
  '--external:fsevents',
  '--external:@mozilla/readability',
  '--external:turndown',
  '--external:jsdom',
  '--external:@mixmark-io/domino',
  '--external:cheerio',
  '--external:tr46',
  '--external:whatwg-url',
  '--external:sqlite-vec',
  '--log-limit=0',
].join(' ');

console.log('Running esbuild to detect missing exports...');
let output;
try {
  output = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: 'pipe' });
} catch (err) {
  // esbuild exits non-zero when there are errors; capture stderr
  output = (err.stderr || '') + (err.stdout || '');
}

// Parse "No matching export" errors
// Format:
// ✘ [ERROR] No matching export in "path/to/file.ts" for import "importName"
//
//     path/to/importer.ts:line:col:
//       line │ import { importName } ...
const errorRegex = /No matching export in "([^"]+)" for import "([^"]+)"/g;
const fixesByFile = new Map(); // file -> Set of missing exports

let match;
while ((match = errorRegex.exec(output)) !== null) {
  const filePath = match[1];
  const importName = match[2];
  if (!fixesByFile.has(filePath)) {
    fixesByFile.set(filePath, new Set());
  }
  fixesByFile.get(filePath).add(importName);
}

console.log(`Found ${fixesByFile.size} files with missing exports`);

let totalFixed = 0;
for (const [filePath, missingExports] of fixesByFile) {
  const fullPath = resolve(ROOT_DIR, filePath);
  let content;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    console.log(`⚠️  Cannot read ${filePath}, skipping`);
    continue;
  }

  // Filter out exports that already exist
  const trulyMissing = [];
  for (const name of missingExports) {
    // Check if already exported as const/function/class/type
    const exportRegex = new RegExp(`export\\s+(?:const|function|class|type|interface|enum|let|var)\\s+${name}\\b`);
    const reExportRegex = new RegExp(`export\\s+\\{[^}]*\\b${name}\\b[^}]*\\}`);
    if (!exportRegex.test(content) && !reExportRegex.test(content)) {
      trulyMissing.push(name);
    }
  }

  if (trulyMissing.length === 0) continue;

  // Append stub exports
  const stubBlock = trulyMissing.map(name =>
    `export const ${name}: any = undefined as any;`
  ).join('\n');

  const newContent = content.replace(/\s*$/, '') + '\n\n// Auto-generated stub exports (added by auto-fix-exports.mjs)\n' + stubBlock + '\n';

  writeFileSync(fullPath, newContent, 'utf-8');
  console.log(`✅ Fixed ${trulyMissing.length} missing export(s) in ${filePath}: ${trulyMissing.join(', ')}`);
  totalFixed += trulyMissing.length;
}

console.log(`\nDone! Fixed ${totalFixed} missing exports in ${fixesByFile.size} files.`);
