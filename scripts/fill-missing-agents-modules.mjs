#!/usr/bin/env node
/**
 * 补充 agents 目录内缺失的子目录文件
 * 从 openclaw/src/agents/ 复制缺失的文件并处理 import 路径
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OPENCLAW_AGENTS = path.join(PROJECT_ROOT, 'openclaw', 'src', 'agents');
const CROSS_WMS_AGENTS = path.join(PROJECT_ROOT, 'server', 'engine', 'agents');
const CROSS_WMS_ENGINE = path.join(PROJECT_ROOT, 'server', 'engine');

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

// 转换 import 路径（从 upgrade-agents-stubs.mjs 复用）
function transformImports(content, sourceFilePath) {
  let result = content;
  const fileDir = path.dirname(sourceFilePath);
  
  // 1. 处理 @openclaw/* 包导入
  result = result.replace(
    /(import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["'])@openclaw\/([^"']+)(["'])/g,
    (match, prefix, pkgPath, suffix) => {
      const pkgName = '@openclaw/' + pkgPath;
      
      const stubMappings = {
        '@openclaw/normalization-core/string-coerce': '../infra/string-coerce.js',
        '@openclaw/normalization-core/string-normalization': '../infra/string-normalization.js',
        '@openclaw/normalization-core/number-coercion': '../infra/number-coercion.js',
        '@openclaw/normalization-core/record-coerce': '../infra/record-coerce.js',
        '@openclaw/normalization-core/boolean-coerce': '../infra/boolean-coerce.js',
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
  
  // 4. 处理 logger.js → agents/logger.js 或 logging/logger.js
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
  
  // 5. 处理 import.meta.url - CommonJS 兼容
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
    
    const metaUrlVar = "\n// @ts-expect-error - CommonJS / ESM compatibility\nconst __metaUrl = typeof __filename !== 'undefined' ? pathToFileURL(__filename).href : import.meta.url;\n";
    
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
        
        if (line[j] === '/' && line[j + 1] === '*') {
          inBlockComment = true;
          newLine += '/*';
          j += 2;
          continue;
        }
        
        if (line[j] === '/' && line[j + 1] === '/') {
          newLine += line.slice(j);
          break;
        }
        
        if (line[j] === "'" || line[j] === '"' || line[j] === '`') {
          inString = true;
          stringChar = line[j];
          newLine += line[j];
          j++;
          continue;
        }
        
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
    
    const finalLines = result.split('\n');
    finalLines.splice(insertIndex, 0, metaUrlVar);
    result = finalLines.join('\n');
  }
  
  return result;
}

// 获取 TypeScript 编译错误中的缺失模块
function getMissingAgentsModules() {
  // 我们通过扫描已升级文件的 import 来找出缺失的模块
  const missingModules = new Set();
  
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["'](\.[^"']+)["']/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1];
          if (importPath.startsWith('./')) {
            const resolvedPath = path.resolve(path.dirname(fullPath), importPath.replace(/\.js$/, '.ts'));
            const relativePath = path.relative(CROSS_WMS_AGENTS, resolvedPath);
            
            if (!fs.existsSync(resolvedPath) && !fs.existsSync(resolvedPath.replace(/\.ts$/, '/index.ts'))) {
              const openclawPath = path.join(OPENCLAW_AGENTS, relativePath);
              if (fs.existsSync(openclawPath) || fs.existsSync(openclawPath.replace(/\.ts$/, '/index.ts'))) {
                missingModules.add(relativePath);
              }
            }
          }
        }
      }
    }
  }
  
  scanDir(CROSS_WMS_AGENTS);
  return Array.from(missingModules).sort();
}

// 复制并转换单个文件
function copyAndTransform(relativePath) {
  const openclawPath = path.join(OPENCLAW_AGENTS, relativePath);
  const crossWmsPath = path.join(CROSS_WMS_AGENTS, relativePath);
  
  if (!fs.existsSync(openclawPath)) {
    return { skipped: true, reason: 'source-not-found' };
  }
  
  const sourceContent = fs.readFileSync(openclawPath, 'utf-8');
  const transformedContent = transformImports(sourceContent, crossWmsPath);
  
  const targetDir = path.dirname(crossWmsPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  fs.writeFileSync(crossWmsPath, transformedContent);
  return { copied: true };
}

// 主函数
function main() {
  console.log('🔍 扫描缺失的 agents 子目录文件...\n');
  
  const missingModules = getMissingAgentsModules();
  console.log(`📋 找到 ${missingModules.length} 个缺失的模块\n`);
  
  let copied = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const modPath of missingModules) {
    try {
      const result = copyAndTransform(modPath);
      if (result.copied) {
        copied++;
        console.log(`✅ ${modPath}`);
      } else {
        skipped++;
        console.log(`⏭️  ${modPath} (${result.reason})`);
      }
    } catch (error) {
      errors++;
      console.error(`❌ ${modPath}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 补充完成统计:');
  console.log(`  成功复制: ${copied}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  错误: ${errors}`);
  console.log('='.repeat(60));
}

main();
