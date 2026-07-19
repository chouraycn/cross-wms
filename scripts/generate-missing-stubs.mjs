#!/usr/bin/env node
/**
 * 自动生成缺失模块的 stub 文件
 * 分析 TypeScript 编译错误，为缺失的模块创建最小 stub
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CROSS_WMS_AGENTS = path.join(PROJECT_ROOT, 'server', 'engine', 'agents');
const CROSS_WMS_ENGINE = path.join(PROJECT_ROOT, 'server', 'engine');
const SERVER_DIR = path.join(PROJECT_ROOT, 'server');

// 运行 TypeScript 编译，获取错误信息
function getTsErrors() {
  try {
    const output = execSync('npx tsc --noEmit 2>&1', {
      cwd: SERVER_DIR,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return output;
  } catch (error) {
    return error.stdout + error.stderr;
  }
}

// 解析 TS2307 错误（找不到模块）
function parseMissingModules(errorOutput) {
  const missingModules = new Map();
  const lines = errorOutput.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^engine\/agents\/(.+)\.ts\(\d+,\d+\): error TS2307: Cannot find module ['"]([^'"]+)['"]/);
    if (match) {
      const sourceFile = match[1] + '.ts';
      const modulePath = match[2];
      
      if (!missingModules.has(modulePath)) {
        missingModules.set(modulePath, new Set());
      }
      missingModules.get(modulePath).add(sourceFile);
    }
  }
  
  return missingModules;
}

// 解析 TS2305 错误（模块没有导出成员）
function parseMissingExports(errorOutput) {
  const missingExports = new Map();
  const lines = errorOutput.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^engine\/agents\/(.+)\.ts\(\d+,\d+\): error TS2305: Module ['"]([^'"]+)['"] has no exported member ['"]([^'"]+)['"]/);
    if (match) {
      const modulePath = match[2];
      const exportName = match[3];
      
      if (!missingExports.has(modulePath)) {
        missingExports.set(modulePath, new Set());
      }
      missingExports.get(modulePath).add(exportName);
    }
    
    // TS2724: Module has no exported member named 'X'. Did you mean 'Y'?
    const match2 = line.match(/^engine\/agents\/(.+)\.ts\(\d+,\d+\): error TS2724: ['"]([^'"]+)['"] has no exported member named ['"]([^'"]+)['"]/);
    if (match2) {
      const modulePath = match2[2];
      const exportName = match2[3];
      
      if (!missingExports.has(modulePath)) {
        missingExports.set(modulePath, new Set());
      }
      missingExports.get(modulePath).add(exportName);
    }
  }
  
  return missingExports;
}

// 解析源文件中的 import 语句，获取类型信息
function parseImportsFromSource(sourceFile, modulePath) {
  const fullPath = path.join(CROSS_WMS_AGENTS, sourceFile);
  if (!fs.existsSync(fullPath)) return { named: new Map(), default: false, namespace: false };
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  const named = new Map(); // name -> isType
  let hasDefault = false;
  let hasNamespace = false;
  
  // 转义正则特殊字符
  const escapedModule = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 匹配 import type { a, b, c } from 'module'
  const typeNamedRegex = new RegExp(`import\\s+type\\s+\\{([^}]+)\\}\\s+from\\s+['"]${escapedModule}['"]`, 'g');
  let match;
  while ((match = typeNamedRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
    for (const name of names) {
      if (name) named.set(name, true);
    }
  }
  
  // 匹配 import { type a, b, type c } from 'module'
  const mixedNamedRegex = new RegExp(`import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${escapedModule}['"]`, 'g');
  while ((match = mixedNamedRegex.exec(content)) !== null) {
    const items = match[1].split(',').map(s => s.trim());
    for (const item of items) {
      if (!item) continue;
      const isType = item.startsWith('type ');
      const name = isType ? item.slice(5).trim().split(/\s+as\s+/)[0].trim() : item.split(/\s+as\s+/)[0].trim();
      if (name) {
        // 如果已经标记为类型，保持类型；否则根据 isType 判断
        if (!named.has(name)) {
          named.set(name, isType);
        }
      }
    }
  }
  
  // 匹配 import X from 'module'
  const defaultRegex = new RegExp(`import\\s+\\w+\\s+from\\s+['"]${escapedModule}['"]`, 'g');
  if (defaultRegex.test(content)) {
    hasDefault = true;
  }
  
  // 匹配 import * as X from 'module'
  const namespaceRegex = new RegExp(`import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+['"]${escapedModule}['"]`, 'g');
  if (namespaceRegex.test(content)) {
    hasNamespace = true;
  }
  
  return { named, default: hasDefault, namespace: hasNamespace };
}

// 生成 stub 文件内容
function generateStub(modulePath, allExports) {
  const lines = [];
  lines.push('/**');
  lines.push(` * Auto-generated stub for ${modulePath}`);
  lines.push(' * 降级实现：仅保留类型签名，运行时抛出 "not implemented"');
  lines.push(' */');
  lines.push('');
  
  // 处理命名导出
  for (const [exportName, isType] of allExports) {
    if (isType) {
      // 类型导出
      lines.push(`export type ${exportName} = unknown;`);
    } else if (exportName.charAt(0) === exportName.charAt(0).toUpperCase() && !exportName.startsWith('is') && !exportName.startsWith('get') && !exportName.startsWith('find')) {
      // 可能是类型或接口
      lines.push(`export interface ${exportName} {}`);
    } else {
      // 可能是函数
      lines.push(`export function ${exportName}(...args: unknown[]): unknown {`);
      lines.push(`  throw new Error("${exportName} not implemented (auto-generated stub)");`);
      lines.push(`}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// 解析模块路径，确定目标文件位置
function resolveTargetFile(sourceFile, modulePath) {
  const sourceDir = path.dirname(path.join(CROSS_WMS_AGENTS, sourceFile));
  let resolvedPath = path.resolve(sourceDir, modulePath);
  
  // 如果是目录，找 index.ts
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    resolvedPath = path.join(resolvedPath, 'index.ts');
  } else if (!resolvedPath.endsWith('.ts')) {
    resolvedPath = resolvedPath.replace(/\.js$/, '.ts');
    if (!resolvedPath.endsWith('.ts')) {
      resolvedPath += '.ts';
    }
  }
  
  // 检查是否在 agents 目录内
  if (!resolvedPath.startsWith(CROSS_WMS_AGENTS)) {
    return null; // 不在 agents 目录内，跳过
  }
  
  return resolvedPath;
}

// 主函数
function main() {
  console.log('🔍 运行 TypeScript 编译，分析错误...\n');
  
  const errorOutput = getTsErrors();
  const missingModules = parseMissingModules(errorOutput);
  const missingExports = parseMissingExports(errorOutput);
  
  console.log(`📊 统计结果:`);
  console.log(`  - 缺失模块: ${missingModules.size} 个`);
  console.log(`  - 缺失导出: ${missingExports.size} 个模块\n`);
  
  // 只处理 agents 目录内的缺失模块
  const agentsMissingModules = new Map();
  
  for (const [modulePath, sourceFiles] of missingModules) {
    if (!modulePath.startsWith('./') && !modulePath.startsWith('../')) {
      continue; // 跳过非相对路径（如 @openclaw/*、node 模块等）
    }
    
    // 找一个源文件来解析路径
    const sourceFile = Array.from(sourceFiles)[0];
    const targetFile = resolveTargetFile(sourceFile, modulePath);
    
    if (targetFile) {
      agentsMissingModules.set(modulePath, { targetFile, sourceFiles });
    }
  }
  
  console.log(`📋 agents 目录内缺失的模块: ${agentsMissingModules.size} 个\n`);
  
  // 收集所有需要的导出
  const moduleExports = new Map();
  
  for (const [modulePath, { targetFile, sourceFiles }] of agentsMissingModules) {
    const allExports = new Map(); // name -> isType
    
    for (const sourceFile of sourceFiles) {
      const { named } = parseImportsFromSource(sourceFile, modulePath);
      for (const [name, isType] of named) {
        if (!allExports.has(name)) {
          allExports.set(name, isType);
        } else if (isType) {
          // 如果有一个地方说是类型，那就认为是类型
          allExports.set(name, true);
        }
      }
    }
    
    moduleExports.set(modulePath, { targetFile, exports: allExports });
  }
  
  // 生成 stub 文件
  let created = 0;
  
  for (const [modulePath, { targetFile, exports: modExports }] of moduleExports) {
    if (fs.existsSync(targetFile)) {
      continue; // 文件已存在，跳过
    }
    
    const stubContent = generateStub(modulePath, modExports);
    const targetDir = path.dirname(targetFile);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.writeFileSync(targetFile, stubContent);
    console.log(`✅ 创建 stub: ${path.relative(CROSS_WMS_AGENTS, targetFile)} (${modExports.size} 个导出)`);
    created++;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Stub 生成统计:');
  console.log(`  创建的 stub 文件: ${created}`);
  console.log('='.repeat(60));
}

main();
