#!/usr/bin/env node
/**
 * 升级 agents 目录下的 stub 文件为真实实现
 * 从 openclaw/src/agents/ 复制代码并处理 import 路径差异
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OPENCLAW_AGENTS = path.join(PROJECT_ROOT, 'openclaw', 'src', 'agents');
const CROSS_WMS_AGENTS = path.join(PROJECT_ROOT, 'server', 'engine', 'agents');
const CROSS_WMS_ENGINE = path.join(PROJECT_ROOT, 'server', 'engine');
const MATCHED_STUBS_FILE = '/tmp/matched_stubs.txt';

// 读取匹配列表
function readMatchedStubs() {
  const content = fs.readFileSync(MATCHED_STUBS_FILE, 'utf-8');
  const lines = content.trim().split('\n');
  const stubs = [];
  
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const stubPath = parts[0].trim().replace(/^\d+→/, '');
      const openclawPath = parts[1].trim();
      if (stubPath.startsWith('server/engine/agents/')) {
        stubs.push({
          stubPath: path.join(PROJECT_ROOT, stubPath),
          openclawPath: path.join(PROJECT_ROOT, openclawPath),
          stubRel: stubPath,
          openclawRel: openclawPath,
        });
      }
    }
  }
  
  return stubs;
}

// 检查文件是否是 stub 文件
function isStubFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes('降级 stub') || content.includes('not implemented (openclaw stub)');
}

// 检查文件是否存在于 cross-wms 的 engine 目录下
function fileExistsInEngine(relativePath) {
  const fullPath = path.join(CROSS_WMS_ENGINE, relativePath);
  return fs.existsSync(fullPath);
}

// 检查文件是否存在于 agents 目录下
function fileExistsInAgents(relativePath) {
  const fullPath = path.join(CROSS_WMS_AGENTS, relativePath);
  return fs.existsSync(fullPath);
}

// 转换 import 路径
function transformImports(content, sourceFilePath) {
  let result = content;
  const fileDir = path.dirname(sourceFilePath);
  
  // 1. 处理 @openclaw/* 包导入
  result = result.replace(
    /(import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["'])@openclaw\/([^"']+)(["'])/g,
    (match, prefix, pkgPath, suffix) => {
      const pkgName = '@openclaw/' + pkgPath;
      
      // 映射到已有的 infra stubs
      const stubMappings = {
        '@openclaw/normalization-core/string-coerce': '../infra/string-coerce.js',
        '@openclaw/normalization-core/string-normalization': '../infra/string-normalization.js',
        '@openclaw/normalization-core/number-coercion': '../infra/number-coercion.js',
        '@openclaw/normalization-core/record-coerce': '../infra/record-coerce.js',
        '@openclaw/normalization-core/boolean-coerce': '../infra/boolean-coerce.js',
        '@openclaw/model-catalog-core/provider-id': './_model-catalog-provider-id-stub.js',
        '@openclaw/fs-safe/path': '../infra/path-guards.js',
        '@openclaw/fs-safe/advanced': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/atomic': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/json': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/temp': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/secret': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/config': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/archive': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/permissions': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/store': '../infra/_fs-safe-stubs.js',
        '@openclaw/fs-safe/file-lock': '../infra/_fs-safe-stubs.js',
        '@openclaw/shared/global-singleton': '../infra/_openclaw-stubs.js',
        '@openclaw/net-policy/ip': '../infra/_openclaw-stubs.js',
      };
      
      const mappedPath = stubMappings[pkgName];
      if (mappedPath) {
        return `${prefix}${mappedPath}${suffix}`;
      }
      
      console.warn(`  ⚠️  未映射的 @openclaw 包: ${pkgName}`);
      return match;
    }
  );
  
  // 2. 处理 config/types.*.js → config/types/*.js
  result = result.replace(
    /from ["']\.\.\/config\/types\.([^.]+)\.js["']/g,
    (match, name) => {
      const newPath = `../config/types/${name}.js`;
      if (fileExistsInEngine(newPath)) {
        return `from "${newPath}"`;
      }
      const altPath = `../config/types.${name}.js`;
      if (fileExistsInEngine(altPath)) {
        return `from "${altPath}"`;
      }
      console.warn(`  ⚠️  未找到 config 类型文件: types/${name}.js 或 types.${name}.js`);
      return match;
    }
  );
  
  // 3. 处理 config/types.js → config/types/base.js
  result = result.replace(
    /from ["']\.\.\/config\/types\.js["']/g,
    () => {
      if (fileExistsInEngine('../config/types/base.js')) {
        return 'from "../config/types/base.js"';
      }
      return 'from "../config/types.js"';
    }
  );
  
  // 4. 处理 config/config.js → config/config.js (保持，但检查是否存在)
  result = result.replace(
    /from ["']\.\.\/config\/config\.js["']/g,
    () => {
      if (fileExistsInEngine('../config/config.js')) {
        return 'from "../config/config.js"';
      }
      if (fileExistsInEngine('../config/index.js')) {
        return 'from "../config/index.js"';
      }
      return 'from "../config/config.js"';
    }
  );
  
  // 5. 处理 routing/session-key.js → config/sessions/session-key.js
  result = result.replace(
    /from ["']\.\.\/routing\/session-key\.js["']/g,
    () => {
      if (fileExistsInEngine('../config/sessions/session-key.js')) {
        return 'from "../config/sessions/session-key.js"';
      }
      return 'from "../config/sessions.js"';
    }
  );
  
  // 6. 处理 infra/path-guards.js → infra/path-guards.js
  result = result.replace(
    /from ["']\.\.\/infra\/path-guards\.js["']/g,
    () => {
      if (fileExistsInEngine('../infra/path-guards.js')) {
        return 'from "../infra/path-guards.js"';
      }
      return 'from "../infra/_fs-safe-stubs.js"';
    }
  );
  
  // 7. 处理 logger.js → agents/logger.js 或 logging/logger.js
  result = result.replace(
    /from ["']\.\.\/logger\.js["']/g,
    () => {
      if (fileExistsInAgents('./logger.js')) {
        return 'from "./logger.js"';
      }
      if (fileExistsInEngine('../logging/logger.js')) {
        return 'from "../logging/logger.js"';
      }
      return 'from "../logger.js"';
    }
  );
  
  // 8. 处理 logging/redact.js → logging/redact.js
  result = result.replace(
    /from ["']\.\.\/logging\/redact\.js["']/g,
    () => {
      if (fileExistsInEngine('../logging/redact.js')) {
        return 'from "../logging/redact.js"';
      }
      if (fileExistsInAgents('../logging/redact.js')) {
        return 'from "../logging/redact.js"';
      }
      return 'from "../logging/redact.js"';
    }
  );
  
  // 9. 处理 config/group-policy.js → config/group.js
  result = result.replace(
    /from ["']\.\.\/config\/group-policy\.js["']/g,
    () => {
      if (fileExistsInEngine('../config/group.js')) {
        return 'from "../config/group.js"';
      }
      return 'from "../config/group-policy.js"';
    }
  );
  
  // 10. 处理 utils/delivery-context.types.js → 检查是否存在
  result = result.replace(
    /from ["']\.\.\/utils\/delivery-context\.types\.js["']/g,
    () => {
      if (fileExistsInEngine('../utils/delivery-context.types.js')) {
        return 'from "../utils/delivery-context.types.js"';
      }
      console.warn(`  ⚠️  未找到 utils/delivery-context.types.js`);
      return 'from "../utils/delivery-context.types.js"';
    }
  );
  
  // 11. 处理 import.meta.url - CommonJS 兼容
  if (result.includes('import.meta.url')) {
    const hasFileURLToPath = result.includes("fileURLToPath");
    const hasPathImport = result.includes("from 'node:path'") || result.includes('from "node:path"');
    const hasPathToFileURL = result.includes("pathToFileURL");
    
    let importsToAdd = '';
    if (!hasPathImport && !hasPathToFileURL) {
      importsToAdd += "import { pathToFileURL } from 'node:path';\n";
    } else if (hasPathImport && !hasPathToFileURL) {
      result = result.replace(
        /import path from ['"]node:path['"];?\n?/,
        "import path, { pathToFileURL } from 'node:path';\n"
      );
    }
    if (!hasFileURLToPath) {
      importsToAdd += "import { fileURLToPath } from 'node:url';\n";
    }
    
    if (importsToAdd) {
      result = importsToAdd + result;
    }
    
    // 在文件顶部添加 __metaUrl 变量（在第一个 import 之后）
    const metaUrlVar = "\n// @ts-expect-error - CommonJS / ESM compatibility\nconst __metaUrl = typeof __filename !== 'undefined' ? pathToFileURL(__filename).href : import.meta.url;\n";
    
    // 找到所有 import 语句之后的位置
    const lines = result.split('\n');
    let insertIndex = 0;
    let inMultilineImport = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (inMultilineImport) {
        if (line.includes('} from')) {
          inMultilineImport = false;
          insertIndex = i + 1;
        }
        continue;
      }
      
      if (line.startsWith('import ') && !line.startsWith('//')) {
        if (line.includes('{') && !line.includes('}')) {
          inMultilineImport = true;
        } else if (line.endsWith(';') || line.endsWith("'") || line.endsWith('"')) {
          insertIndex = i + 1;
        }
      } else if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*') && !line.startsWith('*/')) {
        break;
      }
    }
    
    // 替换代码中的 import.meta.url（不替换注释和字符串中的）
    // 简单方法：只替换不在单行注释和字符串中的
    let inBlockComment = false;
    let inString = false;
    let stringChar = '';
    const resultLines = result.split('\n');
    
    for (let i = 0; i < resultLines.length; i++) {
      let line = resultLines[i];
      let newLine = '';
      let j = 0;
      
      while (j < line.length) {
        if (inBlockComment) {
          const endIndex = line.indexOf('*/', j);
          if (endIndex === -1) {
            newLine += line.slice(j);
            break;
          }
          newLine += line.slice(j, endIndex + 2);
          j = endIndex + 2;
          inBlockComment = false;
          continue;
        }
        
        if (inString) {
          if (line[j] === '\\') {
            newLine += line.slice(j, j + 2);
            j += 2;
            continue;
          }
          if (line[j] === stringChar) {
            inString = false;
            stringChar = '';
          }
          newLine += line[j];
          j++;
          continue;
        }
        
        // 检查块注释开始
        if (line[j] === '/' && line[j + 1] === '*') {
          inBlockComment = true;
          newLine += '/*';
          j += 2;
          continue;
        }
        
        // 检查行注释
        if (line[j] === '/' && line[j + 1] === '/') {
          newLine += line.slice(j);
          break;
        }
        
        // 检查字符串
        if (line[j] === "'" || line[j] === '"' || line[j] === '`') {
          inString = true;
          stringChar = line[j];
          newLine += line[j];
          j++;
          continue;
        }
        
        // 检查 import.meta.url
        if (line.slice(j, j + 15) === 'import.meta.url') {
          newLine += '__metaUrl';
          j += 15;
          continue;
        }
        
        newLine += line[j];
        j++;
      }
      
      resultLines[i] = newLine;
    }
    
    result = resultLines.join('\n');
    
    // 在适当位置插入 __metaUrl 变量
    const finalLines = result.split('\n');
    finalLines.splice(insertIndex, 0, metaUrlVar);
    result = finalLines.join('\n');
  }
  
  return result;
}

// 升级单个文件
function upgradeFile(stubInfo, force = false) {
  const { stubPath, openclawPath, stubRel, openclawRel } = stubInfo;
  
  if (!force && !isStubFile(stubPath)) {
    return { skipped: true, reason: 'not-a-stub' };
  }
  
  if (!fs.existsSync(openclawPath)) {
    console.warn(`  ⚠️  源文件不存在: ${openclawRel}`);
    return { skipped: true, reason: 'source-not-found' };
  }
  
  let sourceContent = fs.readFileSync(openclawPath, 'utf-8');
  const transformedContent = transformImports(sourceContent, stubPath);
  
  fs.writeFileSync(stubPath, transformedContent);
  
  return { upgraded: true };
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitArg = args.find(a => !a.startsWith('--'));
  const limit = limitArg ? parseInt(limitArg, 10) : null;
  
  console.log('🚀 开始升级 agents stub 文件...\n');
  
  const stubs = readMatchedStubs();
  const stubsToProcess = limit ? stubs.slice(0, limit) : stubs;
  
  console.log(`📋 总共 ${stubs.length} 个 stub 文件，本次处理 ${stubsToProcess.length} 个`);
  console.log(`🔧 强制模式: ${force ? '开启' : '关闭'}\n`);
  
  let upgraded = 0;
  let skipped = 0;
  let errors = 0;
  const errorFiles = [];
  
  for (let i = 0; i < stubsToProcess.length; i++) {
    const stub = stubsToProcess[i];
    const progress = `[${i + 1}/${stubsToProcess.length}]`;
    
    try {
      const result = upgradeFile(stub, force);
      if (result.upgraded) {
        upgraded++;
        console.log(`${progress} ✅ ${stub.stubRel.replace('server/engine/agents/', '')}`);
      } else {
        skipped++;
        console.log(`${progress} ⏭️  ${stub.stubRel.replace('server/engine/agents/', '')} (${result.reason})`);
      }
    } catch (error) {
      errors++;
      errorFiles.push({ file: stub.stubRel, error: error.message });
      console.error(`${progress} ❌ ${stub.stubRel.replace('server/engine/agents/', '')}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 升级完成统计:');
  console.log(`  成功升级: ${upgraded}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  错误: ${errors}`);
  
  if (errorFiles.length > 0) {
    console.log('\n❌ 错误详情:');
    for (const err of errorFiles) {
      console.log(`  - ${err.file}: ${err.error}`);
    }
  }
  
  console.log('='.repeat(60));
}

main();
