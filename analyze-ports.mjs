import fs from 'fs';
import path from 'path';

const OPENCLAW_SRC = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/openclaw/src';
const CROSS_WMS_SERVER = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server';
const CROSS_WMS_SRC = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/src';

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', 'test', '.git']);

function getAllTsFiles(dir, baseDir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      getAllTsFiles(fullPath, baseDir, result);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lineCount = content.split('\n').length;
      result.push({
        relativePath,
        fullPath,
        fileName: entry.name,
        lineCount,
        dir: path.dirname(relativePath)
      });
    }
  }
  return result;
}

function getFileNames(dir) {
  const names = new Set();
  const paths = new Set();
  function walk(d, base) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      const relativePath = path.relative(base, fullPath);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        walk(fullPath, base);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        names.add(entry.name);
        paths.add(relativePath);
        paths.add(entry.name);
      }
    }
  }
  if (fs.existsSync(dir)) {
    walk(dir, dir);
  }
  return { names, paths };
}

function main() {
  console.log('=== OpenClaw 未移植文件分析 ===\n');
  
  const openclawFiles = getAllTsFiles(OPENCLAW_SRC, OPENCLAW_SRC);
  const serverFiles = getFileNames(CROSS_WMS_SERVER);
  const srcFiles = getFileNames(CROSS_WMS_SRC);
  
  const allPortedNames = new Set([...serverFiles.names, ...srcFiles.names]);
  const allPortedPaths = new Set([...serverFiles.paths, ...srcFiles.paths]);
  
  const notPorted = [];
  const ported = [];
  
  for (const file of openclawFiles) {
    const fileName = file.fileName;
    const relativePath = file.relativePath;
    
    let isPorted = false;
    
    if (allPortedPaths.has(relativePath)) {
      isPorted = true;
    }
    if (allPortedNames.has(fileName)) {
      isPorted = true;
    }
    
    if (isPorted) {
      ported.push(file);
    } else {
      notPorted.push(file);
    }
  }
  
  const totalLines = openclawFiles.reduce((sum, f) => sum + f.lineCount, 0);
  const notPortedLines = notPorted.reduce((sum, f) => sum + f.lineCount, 0);
  const portedLines = ported.reduce((sum, f) => sum + f.lineCount, 0);
  
  console.log('【总体统计】');
  console.log(`OpenClaw src/ 总 .ts 文件数: ${openclawFiles.length}`);
  console.log(`已移植文件数: ${ported.length} (${(ported.length / openclawFiles.length * 100).toFixed(1)}%)`);
  console.log(`未移植文件数: ${notPorted.length} (${(notPorted.length / openclawFiles.length * 100).toFixed(1)}%)`);
  console.log(`总代码行数: ${totalLines.toLocaleString()}`);
  console.log(`已移植行数: ${portedLines.toLocaleString()} (${(portedLines / totalLines * 100).toFixed(1)}%)`);
  console.log(`未移植行数: ${notPortedLines.toLocaleString()} (${(notPortedLines / totalLines * 100).toFixed(1)}%)`);
  console.log();
  
  const dirStats = {};
  for (const file of notPorted) {
    const topDir = file.dir.split(path.sep)[0] || '(root)';
    if (!dirStats[topDir]) {
      dirStats[topDir] = { count: 0, lines: 0, files: [] };
    }
    dirStats[topDir].count++;
    dirStats[topDir].lines += file.lineCount;
    dirStats[topDir].files.push(file);
  }
  
  console.log('【按目录统计 - 未移植文件】');
  console.log('-' * 80);
  console.log('目录'.padEnd(25) + '文件数'.padStart(10) + '行数'.padStart(15));
  console.log('-' * 80);
  
  const sortedDirs = Object.entries(dirStats).sort((a, b) => b[1].lines - a[1].lines);
  for (const [dir, stats] of sortedDirs) {
    console.log(dir.padEnd(25) + String(stats.count).padStart(10) + String(stats.lines.toLocaleString()).padStart(15));
  }
  console.log();
  
  console.log('【Top 20 最大未移植文件】');
  console.log('-' * 100);
  console.log('行数'.padStart(8) + '  文件路径');
  console.log('-' * 100);
  
  const sortedByLines = [...notPorted].sort((a, b) => b.lineCount - a.lineCount);
  const top20 = sortedByLines.slice(0, 20);
  for (const file of top20) {
    console.log(String(file.lineCount).padStart(8) + '  ' + file.relativePath);
  }
  console.log();
  
  console.log('【重点关注目录详细分析】');
  const focusDirs = ['tasks', 'config', 'llm', 'agents', 'plugin-sdk', 'media', 'tools', 'cron', 'gateway', 'hooks', 'secrets', 'flows', 'acp'];
  for (const dir of focusDirs) {
    if (dirStats[dir]) {
      const stats = dirStats[dir];
      console.log(`\n📁 ${dir}/ (${stats.count} 个文件, ${stats.lines.toLocaleString()} 行)`);
      const topFiles = [...stats.files].sort((a, b) => b.lineCount - a.lineCount).slice(0, 5);
      for (const f of topFiles) {
        console.log(`   ${f.lineCount.toString().padStart(6)}  ${f.relativePath}`);
      }
    }
  }
  
  console.log('\n\n【优先级建议】');
  console.log('='.repeat(80));
  
  console.log('\n🔴 高优先级 (核心功能模块):');
  const highPriority = ['agents', 'llm', 'config', 'tools', 'media'];
  for (const dir of highPriority) {
    if (dirStats[dir]) {
      console.log(`   - ${dir}/: ${dirStats[dir].count} 个文件, ${dirStats[dir].lines.toLocaleString()} 行`);
    }
  }
  
  console.log('\n🟡 中优先级 (重要支撑模块):');
  const mediumPriority = ['cron', 'gateway', 'hooks', 'plugin-sdk', 'channels', 'secrets', 'flows', 'acp'];
  for (const dir of mediumPriority) {
    if (dirStats[dir]) {
      console.log(`   - ${dir}/: ${dirStats[dir].count} 个文件, ${dirStats[dir].lines.toLocaleString()} 行`);
    }
  }
  
  console.log('\n🟢 低优先级 (工具/基础设施):');
  const lowPriority = ['infra', 'logging', 'tui', 'cli', 'process', 'daemon', 'talk', 'shared', 'utils', 'test-utils', 'types'];
  for (const dir of lowPriority) {
    if (dirStats[dir]) {
      console.log(`   - ${dir}/: ${dirStats[dir].count} 个文件, ${dirStats[dir].lines.toLocaleString()} 行`);
    }
  }
  
  console.log('\n📊 详细数据已生成。');
}

main();
