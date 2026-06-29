#!/usr/bin/env node
/**
 * One-time migration script: replaces console.log/error/warn with logger calls.
 *
 * Rules:
 *   console.error( → logger.error(
 *   console.warn(  → logger.warn(
 *   console.log(   → logger.debug(  (hot-path files: engine/, aiClient, keyRotator, chat.ts)
 *   console.log(   → logger.info(   (everything else)
 *
 * Also:
 *   - Adds `import { logger } from '<relative>/logger.js'` after the last existing import
 *   - Removes `/* eslint-disable no-console *\` line if present
 *   - Does NOT touch files that have zero console.* calls
 */

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const LOGGER_REL = 'logger.js'; // relative from server root

// Hot-path files: per-request / per-message execution → logger.debug
const HOT_PATH_PATTERNS = [
  /\/engine\//,
  /\/aiClient\.ts$/,
  /\/keyRotator\.ts$/,
  /\/routes\/chat\.ts$/,
];

function isHotPath(filePath) {
  return HOT_PATH_PATTERNS.some((p) => p.test(filePath));
}

function findTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      results.push(...findTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function getImportPath(filePath) {
  const fileDir = path.dirname(filePath);
  const rel = path.relative(fileDir, path.join(SERVER_DIR, LOGGER_REL));
  // Ensure .js extension for ESM-style imports (even though we use commonjs)
  return rel.replace(/\.ts$/, '.js').replace(/\\/g, '/');
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(SERVER_DIR, filePath);
  const hasConsole = /\bconsole\.(log|error|warn|info|debug)\b/.test(content);

  if (!hasConsole) return { changed: false, consoleCount: 0, reason: 'no console calls' };

  // Count console calls
  const consoleMatches = content.match(/\bconsole\.(log|error|warn|info|debug)\b/g) || [];
  const consoleCount = consoleMatches.length;

  // Remove eslint-disable no-console comment line
  content = content.replace(/\/\*\s*eslint-disable\s+no-console\s*\*\/\s*\n?/g, '');

  const hotPath = isHotPath(relativePath);
  const logReplacement = hotPath ? 'logger.debug(' : 'logger.info(';

  // Replace console calls
  content = content.replace(/\bconsole\.error\(/g, 'logger.error(');
  content = content.replace(/\bconsole\.warn\(/g, 'logger.warn(');
  content = content.replace(/\bconsole\.log\(/g, logReplacement);
  // console.info/debug are rare but handle them
  content = content.replace(/\bconsole\.info\(/g, 'logger.info(');
  content = content.replace(/\bconsole\.debug\(/g, 'logger.debug(');

  // Check if logger import already exists
  const hasLoggerImport = /import\s*\{[^}]*logger[^}]*\}\s*from\s*['"][^'"]*logger\.js['"]/.test(content);

  if (!hasLoggerImport) {
    const importPath = getImportPath(filePath);
    const importLine = `import { logger } from '${importPath}';\n`;

    // Find the last import line to insert after
    const importRegex = /^import\s+.*$/gm;
    let lastImportMatch = null;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastImportMatch = match;
    }

    if (lastImportMatch) {
      const insertPos = lastImportMatch.index + lastImportMatch[0].length + 1; // +1 for newline
      content = content.slice(0, insertPos) + importLine + content.slice(insertPos);
    } else {
      // No imports found, add at top
      content = importLine + '\n' + content;
    }
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return { changed: true, consoleCount, hotPath };
}

// Main
const files = findTsFiles(SERVER_DIR);
let totalReplaced = 0;
let filesChanged = 0;
const results = [];

for (const file of files) {
  const result = processFile(file);
  if (result.changed) {
    filesChanged++;
    totalReplaced += result.consoleCount;
    results.push({
      file: path.relative(SERVER_DIR, file),
      ...result,
    });
  }
}

console.log(`\n=== Logger Migration Complete ===`);
console.log(`Files modified: ${filesChanged}`);
console.log(`Console calls replaced: ${totalReplaced}`);
console.log(`\nDetails:`);
for (const r of results.sort((a, b) => b.consoleCount - a.consoleCount)) {
  console.log(`  ${r.hotPath ? '[HOT]' : '     '} ${r.consoleCount.toString().padStart(3)}  ${r.file}`);
}
