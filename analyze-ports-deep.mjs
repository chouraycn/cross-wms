import fs from 'fs';
import path from 'path';

const OPENCLAW_SRC = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/openclaw/src';
const CROSS_WMS_SERVER = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server';
const CROSS_WMS_SRC = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/src';

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', 'test', '.git']);
const TEST_FILE_PATTERNS = ['.test.', '.spec.', 'test-helper', 'test-helpers', 'test-support', 'test-harness', 'test-setup', '.test-'];

function isTestFile(fileName) {
  return TEST_FILE_PATTERNS.some(pattern => fileName.includes(pattern));
}

function getAllTsFiles(dir, baseDir, includeTests = false, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      getAllTsFiles(fullPath, baseDir, includeTests, result);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      if (!includeTests && isTestFile(entry.name)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lineCount = content.split('\n').length;
      result.push({
        relativePath,
        fullPath,
        fileName: entry.name,
        lineCount,
        dir: path.dirname(relativePath),
        topDir: relativePath.split(path.sep)[0] || '(root)'
      });
    }
  }
  return result;
}

function getFileMap(dir) {
  const nameToPaths = {};
  const allPaths = new Set();
  function walk(d, base) {
    if (!fs.existsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      const relativePath = path.relative(base, fullPath);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        walk(fullPath, base);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        if (!nameToPaths[entry.name]) {
          nameToPaths[entry.name] = [];
        }
        nameToPaths[entry.name].push(relativePath);
        allPaths.add(relativePath);
        allPaths.add(entry.name);
      }
    }
  }
  walk(dir, dir);
  return { nameToPaths, allPaths };
}

function isFilePorted(file, serverMap, srcMap) {
  const fileName = file.fileName;
  const relativePath = file.relativePath;
  const basename = path.basename(fileName, '.ts');
  
  if (serverMap.allPaths.has(relativePath)) return true;
  if (srcMap.allPaths.has(relativePath)) return true;
  
  if (serverMap.nameToPaths[fileName] || srcMap.nameToPaths[fileName]) {
    return true;
  }
  
  const variantNames = [
    fileName,
    `${basename}.ts`,
    `${basename}.runtime.ts`,
    `${basename}.service.ts`,
    `${basename}.store.ts`,
  ];
  
  for (const name of variantNames) {
    if (serverMap.nameToPaths[name] || srcMap.nameToPaths[name]) {
      return true;
    }
  }
  
  return false;
}

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         OpenClaw → Cross-WMS 未移植文件深度分析                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
  
  const openclawFiles = getAllTsFiles(OPENCLAW_SRC, OPENCLAW_SRC, false);
  const openclawFilesWithTests = getAllTsFiles(OPENCLAW_SRC, OPENCLAW_SRC, true);
  const serverMap = getFileMap(CROSS_WMS_SERVER);
  const srcMap = getFileMap(CROSS_WMS_SRC);
  
  const notPorted = [];
  const ported = [];
  
  for (const file of openclawFiles) {
    if (isFilePorted(file, serverMap, srcMap)) {
      ported.push(file);
    } else {
      notPorted.push(file);
    }
  }
  
  const totalLines = openclawFiles.reduce((sum, f) => sum + f.lineCount, 0);
  const notPortedLines = notPorted.reduce((sum, f) => sum + f.lineCount, 0);
  const portedLines = ported.reduce((sum, f) => sum + f.lineCount, 0);
  
  console.log('📊 【总体统计】(排除测试文件)');
  console.log('─'.repeat(70));
  console.log(`OpenClaw src/ 核心 .ts 文件: ${openclawFiles.length.toLocaleString()} 个`);
  console.log(`含测试文件总计: ${openclawFilesWithTests.length.toLocaleString()} 个`);
  console.log();
  console.log(`✅ 已移植: ${ported.length.toLocaleString()} 个文件 (${(ported.length / openclawFiles.length * 100).toFixed(1)}%)`);
  console.log(`   ${portedLines.toLocaleString()} 行 (${(portedLines / totalLines * 100).toFixed(1)}%)`);
  console.log();
  console.log(`❌ 未移植: ${notPorted.length.toLocaleString()} 个文件 (${(notPorted.length / openclawFiles.length * 100).toFixed(1)}%)`);
  console.log(`   ${notPortedLines.toLocaleString()} 行 (${(notPortedLines / totalLines * 100).toFixed(1)}%)`);
  console.log();
  
  const dirStats = {};
  for (const file of notPorted) {
    const topDir = file.topDir;
    if (!dirStats[topDir]) {
      dirStats[topDir] = { count: 0, lines: 0, files: [] };
    }
    dirStats[topDir].count++;
    dirStats[topDir].lines += file.lineCount;
    dirStats[topDir].files.push(file);
  }
  
  console.log('📁 【按目录统计 - 未移植文件】按行数排序');
  console.log('─'.repeat(70));
  console.log('  目录                  文件数        行数     占比');
  console.log('─'.repeat(70));
  
  const sortedDirs = Object.entries(dirStats).sort((a, b) => b[1].lines - a[1].lines);
  let rank = 1;
  for (const [dir, stats] of sortedDirs) {
    const pct = (stats.lines / notPortedLines * 100).toFixed(1) + '%';
    console.log(`${String(rank++).padStart(2)}. ${dir.padEnd(20)} ${String(stats.count).padStart(6)} ${String(stats.lines.toLocaleString()).padStart(10)} ${pct.padStart(7)}`);
  }
  console.log();
  
  console.log('🏆 【Top 20 最大未移植文件】');
  console.log('─'.repeat(70));
  console.log('  行数     文件路径');
  console.log('─'.repeat(70));
  
  const sortedByLines = [...notPorted].sort((a, b) => b.lineCount - a.lineCount);
  const top20 = sortedByLines.slice(0, 20);
  for (let i = 0; i < top20.length; i++) {
    const file = top20[i];
    console.log(`${String(i + 1).padStart(2)}. ${String(file.lineCount).padStart(6)}  ${file.relativePath}`);
  }
  console.log();
  
  console.log('🎯 【重点关注模块深度分析】');
  console.log('═'.repeat(70));
  
  const focusModules = [
    { key: 'auto-reply', label: '自动回复 (消息处理核心)', icon: '🤖' },
    { key: 'commands', label: 'CLI 命令集', icon: '💻' },
    { key: 'plugin-sdk', label: '插件 SDK', icon: '🔌' },
    { key: 'tasks', label: '任务系统', icon: '📋' },
    { key: 'llm', label: 'LLM 提供商', icon: '🧠' },
    { key: 'config', label: '配置/Zod Schema', icon: '⚙️' },
    { key: 'agents', label: 'Agent 核心', icon: '👤' },
    { key: 'secrets', label: '密钥管理', icon: '🔐' },
    { key: 'acp', label: 'ACP 协议', icon: '📡' },
    { key: 'flows', label: '工作流', icon: '🔄' },
    { key: 'media-understanding', label: '媒体理解', icon: '🖼️' },
    { key: 'cron', label: '定时任务', icon: '⏰' },
    { key: 'gateway', label: '网关服务', icon: '🌉' },
    { key: 'hooks', label: '钩子系统', icon: '🪝' },
    { key: 'plugins', label: '插件系统', icon: '🧩' },
  ];
  
  for (const mod of focusModules) {
    if (dirStats[mod.key]) {
      const stats = dirStats[mod.key];
      console.log(`\n${mod.icon} ${mod.label} (${mod.key}/)`);
      console.log(`   ${stats.count} 个文件, ${stats.lines.toLocaleString()} 行`);
      console.log(`   ── 最大的 5 个文件 ──`);
      const topFiles = [...stats.files].sort((a, b) => b.lineCount - a.lineCount).slice(0, 5);
      for (const f of topFiles) {
        const shortPath = f.relativePath.replace(mod.key + '/', '');
        console.log(`   ${String(f.lineCount).padStart(6)}  ${shortPath}`);
      }
    }
  }
  
  console.log('\n');
  console.log('🚨 【优先级建议】');
  console.log('═'.repeat(70));
  
  console.log('\n🔴 高优先级 - 核心业务能力 (建议优先移植)');
  const highPriority = [
    { key: 'auto-reply', reason: '消息自动回复核心引擎，对话系统的关键路径' },
    { key: 'llm', reason: 'LLM 提供商适配，AI 能力的基础层' },
    { key: 'agents', reason: 'Agent 运行核心，智能体执行逻辑' },
    { key: 'config', reason: 'Zod Schema 配置体系，系统配置基础设施' },
    { key: 'tasks', reason: '任务系统，异步任务处理核心' },
    { key: 'media-understanding', reason: '媒体理解能力，多模态支持' },
  ];
  for (const mod of highPriority) {
    if (dirStats[mod.key]) {
      const s = dirStats[mod.key];
      console.log(`   • ${mod.key.padEnd(20)} ${String(s.count).padStart(4)} 文件 ${String(s.lines.toLocaleString()).padStart(8)} 行  - ${mod.reason}`);
    }
  }
  
  console.log('\n🟡 中优先级 - 重要支撑模块');
  const mediumPriority = [
    { key: 'plugin-sdk', reason: '插件开发 SDK，生态扩展基础 (量大，可按需移植)' },
    { key: 'acp', reason: 'ACP 协议层，Agent 通信协议' },
    { key: 'secrets', reason: '密钥管理系统，安全基础设施' },
    { key: 'flows', reason: '工作流/健康检查，运维诊断能力' },
    { key: 'commands', reason: 'CLI 命令集，命令行接口 (部分可能不需要)' },
    { key: 'cron', reason: '定时任务调度' },
    { key: 'gateway', reason: '网关服务，通信层 (可能已有替代)' },
    { key: 'hooks', reason: '钩子系统，事件扩展机制' },
  ];
  for (const mod of mediumPriority) {
    if (dirStats[mod.key]) {
      const s = dirStats[mod.key];
      console.log(`   • ${mod.key.padEnd(20)} ${String(s.count).padStart(4)} 文件 ${String(s.lines.toLocaleString()).padStart(8)} 行  - ${mod.reason}`);
    }
  }
  
  console.log('\n🟢 低优先级 - 工具/基础设施/测试');
  const lowPriority = [
    { key: 'plugins', reason: '插件加载器 (可能已有自有实现)' },
    { key: 'infra', reason: '底层基础设施工具' },
    { key: 'daemon', reason: '守护进程管理' },
    { key: 'tui', reason: '终端 UI' },
    { key: 'cli', reason: 'CLI 框架 (部分可复用)' },
    { key: 'security', reason: '安全审计' },
    { key: 'talk', reason: 'Talk 会话 (可能已有替代)' },
    { key: 'tts', reason: '语音合成 (部分可复用)' },
    { key: 'logging', reason: '日志系统' },
    { key: 'utils', reason: '工具函数' },
  ];
  for (const mod of lowPriority) {
    if (dirStats[mod.key]) {
      const s = dirStats[mod.key];
      console.log(`   • ${mod.key.padEnd(20)} ${String(s.count).padStart(4)} 文件 ${String(s.lines.toLocaleString()).padStart(8)} 行  - ${mod.reason}`);
    }
  }
  
  console.log('\n');
  console.log('📌 【核心文件推荐清单 - 建议第一批移植】');
  console.log('─'.repeat(70));
  
  const mustHaveFiles = [
    ...sortedByLines.filter(f => f.topDir === 'auto-reply').slice(0, 5),
    ...sortedByLines.filter(f => f.topDir === 'llm').slice(0, 5),
    ...sortedByLines.filter(f => f.topDir === 'tasks').slice(0, 3),
    ...sortedByLines.filter(f => f.topDir === 'config' && f.fileName.includes('zod-schema')).slice(0, 5),
    ...sortedByLines.filter(f => f.topDir === 'media-understanding').slice(0, 3),
  ].sort((a, b) => b.lineCount - a.lineCount).slice(0, 15);
  
  for (let i = 0; i < mustHaveFiles.length; i++) {
    const f = mustHaveFiles[i];
    console.log(`${String(i + 1).padStart(2)}. ${String(f.lineCount).padStart(6)}  ${f.relativePath}`);
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('分析完成。');
}

main();
