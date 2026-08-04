// ============================================================================
// server/extension-resolve-hook.mjs — 自定义 ESM resolve 钩子
//
// 职责：
//   1. 将 openclaw/plugin-sdk/* 包导入映射到项目的 server/engine/plugin-sdk/*.ts
//   2. 当 .js 导入目标不存在时，自动回退到同名 .ts 文件
//
// 注册方式：
//   在 server/index.ts 顶部调用 module.register() 注册本文件。
//   钩子对后续所有 import() 生效，包括 ExtensionLoader 动态加载的扩展。
//
// 设计说明：
//   - 仅在 .js 文件不存在时才尝试 .ts，避免影响真正的 .js 文件解析
//   - openclaw 别名映射与 build-server.mjs 中的 esbuild alias 保持一致
//   - 钩子对生产打包（CJS bundle）同样有效，只要本文件被拷贝到 server_dist/
// ============================================================================

import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

// 项目根目录：本文件位于 server/ 下，根目录是其上一级
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 开发环境：server/extension-resolve-hook.mjs → 根目录是 ../
// 生产环境：server_dist/extension-resolve-hook.mjs → 根目录是 ../
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PLUGIN_SDK_DIR = path.join(PROJECT_ROOT, 'server', 'engine', 'plugin-sdk');

// 包别名映射表 — 与 build-server.mjs 的 esbuild alias 保持一致
// 运行时扩展加载时，Node.js 原生 ESM 无法解析这些包别名，需要钩子介入
//
// 优化：用两级 Map 索引替代线性扫描
//   - exactAliases: 精确匹配（specifier === prefix）
//   - prefixAliases: 前缀匹配（startsWith）
//   按 specifier 的首段（/ 之前的部分）分桶，避免遍历全部别名
const exactAliases = new Map();
const prefixAliases = new Map();

function addAlias({ prefix, target, exact = false }) {
  if (exact) {
    exactAliases.set(prefix, target);
  } else {
    // 按 prefix 的首段（/ 之前）分桶
    const bucket = prefix.includes('/') ? prefix.slice(0, prefix.indexOf('/')) : prefix;
    if (!prefixAliases.has(bucket)) {
      prefixAliases.set(bucket, []);
    }
    prefixAliases.get(bucket).push({ prefix, target });
  }
}

// 注册所有别名
addAlias({ prefix: 'openclaw/plugin-sdk/', target: path.join(PROJECT_ROOT, 'server', 'engine', 'plugin-sdk') });
addAlias({ prefix: 'openclaw/plugin-sdk', exact: true, target: path.join(PROJECT_ROOT, 'server', 'engine', 'plugin-sdk', 'index.ts') });
addAlias({ prefix: '@openclaw-src/plugins/', target: path.join(PROJECT_ROOT, 'openclaw', 'src', 'plugins') });
addAlias({ prefix: '@openclaw-src/', target: path.join(PROJECT_ROOT, 'openclaw', 'src') });
addAlias({ prefix: '@openclaw/media-core/', target: path.join(PROJECT_ROOT, 'packages', 'media-core', 'src') });
addAlias({ prefix: '@openclaw/media-core', exact: true, target: path.join(PROJECT_ROOT, 'packages', 'media-core', 'src', 'index.ts') });
addAlias({ prefix: '@openclaw/agent-core/', target: path.join(PROJECT_ROOT, 'packages', 'agent-core', 'src') });
addAlias({ prefix: '@openclaw/agent-core', exact: true, target: path.join(PROJECT_ROOT, 'packages', 'agent-core', 'src', 'index.ts') });
addAlias({ prefix: '@openclaw/llm-runtime/', target: path.join(PROJECT_ROOT, 'packages', 'llm-runtime', 'src') });
addAlias({ prefix: '@openclaw/llm-runtime', exact: true, target: path.join(PROJECT_ROOT, 'packages', 'llm-runtime', 'src', 'index.ts') });
addAlias({ prefix: '@openclaw/media-understanding-common/', target: path.join(PROJECT_ROOT, 'packages', 'media-understanding-common', 'src') });
addAlias({ prefix: '@cdf-know/normalization-core/', target: path.join(PROJECT_ROOT, 'packages', 'normalization-core', 'src') });
addAlias({ prefix: '@cdf-know/memory-host-sdk/', target: path.join(PROJECT_ROOT, 'packages', 'memory-host-sdk', 'src') });
addAlias({ prefix: '@cdf-know/llm-core/', target: path.join(PROJECT_ROOT, 'packages', 'llm-core', 'src') });
addAlias({ prefix: '@openclaw/net-policy/', target: path.join(PROJECT_ROOT, 'packages', 'net-policy', 'src') });
addAlias({ prefix: '@openclaw/net-policy', exact: true, target: path.join(PROJECT_ROOT, 'packages', 'net-policy', 'src', 'index.ts') });

/**
 * 将包别名映射到项目内实际 .ts 文件路径。
 * 与 build-server.mjs 中的 esbuild alias 保持一致。
 * 优化：用 Map 索引替代线性扫描，按首段分桶。
 */
function resolvePackageAlias(specifier) {
  // 1. 精确匹配（O(1)）
  const exact = exactAliases.get(specifier);
  if (exact) return exact;

  // 2. 前缀匹配：按首段分桶，避免遍历全部别名
  const bucket = specifier.includes('/') ? specifier.slice(0, specifier.indexOf('/')) : specifier;
  const bucketAliases = prefixAliases.get(bucket);
  if (bucketAliases) {
    for (const alias of bucketAliases) {
      if (specifier.startsWith(alias.prefix)) {
        const subPath = specifier.slice(alias.prefix.length);
        return path.join(alias.target, subPath);
      }
    }
  }

  // 3. 特殊情况：openclaw/plugin-sdk 既精确又前缀，需检查 openclaw 桶
  //    （因 openclaw/plugin-sdk 的首段是 "openclaw"，而前缀别名注册在 "openclaw" 桶）
  //    上面的 bucket 查找已覆盖此情况

  return null;
}

/**
 * 尝试将 .js 扩展名替换为 .ts，返回存在的 .ts 文件路径。
 * 仅当原始 .js 文件不存在时才回退。
 */
function tryTsFallback(absPath) {
  if (!absPath.endsWith('.js')) return null;
  const tsPath = absPath.slice(0, -3) + '.ts';
  if (existsSync(tsPath) && statSync(tsPath).isFile()) {
    return tsPath;
  }
  return null;
}

/**
 * 尝试解析目录下的 index 文件（index.ts / index.js）。
 */
function tryDirectoryIndex(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  for (const indexFile of ['index.ts', 'index.js']) {
    const indexPath = path.join(dir, indexFile);
    if (existsSync(indexPath) && statSync(indexPath).isFile()) {
      return indexPath;
    }
  }
  return null;
}

/**
 * 标准 resolve：检查文件是否存在，尝试 .ts 回退，尝试目录 index。
 */
function resolveWithFallbacks(absPath) {
  // 1. 原始路径存在
  if (existsSync(absPath) && statSync(absPath).isFile()) {
    return absPath;
  }

  // 2. .js → .ts 回退
  const tsFallback = tryTsFallback(absPath);
  if (tsFallback) return tsFallback;

  // 3. 目录 → index 文件
  const dirIndex = tryDirectoryIndex(absPath);
  if (dirIndex) return dirIndex;

  // 4. 无扩展名 → 尝试 .ts / .js
  if (!path.extname(absPath)) {
    for (const ext of ['.ts', '.js']) {
      const candidate = absPath + ext;
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }
    const dirIdx = tryDirectoryIndex(absPath);
    if (dirIdx) return dirIdx;
  }

  return null;
}

/**
 * 自定义 resolve 钩子。
 *
 * Node.js ESM loader hooks 协议（Node 22+）：
 *   export async function resolve(specifier, context, nextResolve)
 */
export async function resolve(specifier, context, nextResolve) {
  // 1. 处理包别名（openclaw/plugin-sdk/*、@openclaw-src/*、@openclaw/*、@cdf-know/* 等）
  const aliasMapped = resolvePackageAlias(specifier);
  if (aliasMapped) {
    const resolved = resolveWithFallbacks(aliasMapped);
    if (resolved) {
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      };
    }
  }

  // 2. 对于相对路径导入，在默认 resolve 失败时尝试 .js→.ts 回退
  if (context.parentURL && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    try {
      // 先尝试默认解析
      return await nextResolve(specifier, context);
    } catch {
      // 默认解析失败，尝试 .js→.ts 回退
      const parentPath = fileURLToPath(context.parentURL);
      const parentDir = path.dirname(parentPath);
      const absPath = path.resolve(parentDir, specifier);

      const resolved = resolveWithFallbacks(absPath);
      if (resolved) {
        return {
          url: pathToFileURL(resolved).href,
          shortCircuit: true,
        };
      }
      throw new Error(`Cannot resolve '${specifier}' from '${context.parentURL}' (tried .js→.ts fallback)`);
    }
  }

  // 3. 其他情况走默认解析
  return nextResolve(specifier, context);
}
