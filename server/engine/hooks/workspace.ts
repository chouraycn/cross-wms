/**
 * 工作区钩子发现
 *
 * 参考 openclaw/src/hooks/workspace.ts，扫描五个来源目录发现钩子条目：
 *   extraDirs → bundled → plugin → managed → workspace
 *
 * 钩子目录格式：HOOK.md（含 frontmatter）+ handler.ts/handler.js/index.ts/index.js
 * package.json 钩子声明支持：包内可声明多个钩子路径，但必须包内包含（isPathInsideWithRealpath 校验）。
 * 边界文件读取使用 openRootFileSync，防止路径穿越。
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveHookEntries } from './policy.js';
import type {
  Hook,
  HookConfig,
  HookEntry,
  HookMetadata,
  HookInvocationPolicy,
  HookSource,
  ParsedHookFrontmatter,
} from './types.js';

/** 钩子工作区配置（最小结构，用于发现钩子） */
export type HookWorkspaceConfig = {
  hooks?: {
    internal?: {
      entries?: Record<string, HookConfig>;
      load?: {
        extraDirs?: string[];
      };
    };
  };
  /** 插件钩子目录列表（pluginId + dir） */
  plugins?: Array<{ id: string; dir?: string }>;
};

/** package.json 中声明钩子的字段名 */
const HOOK_MANIFEST_KEY = 'openclaw';

type HookPackageManifest = {
  name?: string;
} & Partial<Record<typeof HOOK_MANIFEST_KEY, { hooks?: string[] }>>;

type LoadedHook = {
  hook: Hook;
  frontmatter: ParsedHookFrontmatter;
};

/**
 * 判断 resolved 路径是否位于 base 路径内部
 *
 * 同时校验词法包含与 realpath 包含，防止符号链接逃逸。
 * requireRealpath 为 true 时，realpath 解析失败则返回 false。
 */
export function isPathInsideWithRealpath(
  base: string,
  resolved: string,
  opts?: { requireRealpath?: boolean },
): boolean {
  // 词法包含校验
  const relative = path.relative(base, resolved);
  if (relative === '' || relative === '.' ) {
    return true;
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  // realpath 包含校验：解析两条路径的真实路径后再次比较
  if (opts?.requireRealpath) {
    try {
      const baseReal = fs.realpathSync.native(base);
      const resolvedReal = fs.realpathSync.native(resolved);
      const rel = path.relative(baseReal, resolvedReal);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * 边界文件读取：在 rootPath 边界内以 fd 读取文件内容
 *
 * 防止路径穿越：absolutePath 必须位于 rootPath 内部，否则返回 null。
 */
export function openRootFileSync(params: {
  absolutePath: string;
  rootPath: string;
  boundaryLabel?: string;
}): { ok: true; fd: number; path: string } | { ok: false } {
  const { absolutePath, rootPath } = params;
  // 词法校验
  const relative = path.relative(rootPath, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false };
  }
  try {
    const fd = fs.openSync(absolutePath, 'r');
    return { ok: true, fd, path: absolutePath };
  } catch {
    return { ok: false };
  }
}

/** 在边界内读取文件 UTF-8 内容，失败返回 null */
function readRootFileUtf8(params: {
  absolutePath: string;
  rootPath: string;
  boundaryLabel: string;
}): string | null {
  const opened = openRootFileSync(params);
  if (!opened.ok) {
    return null;
  }
  try {
    return fs.readFileSync(opened.fd, 'utf-8');
  } catch {
    return null;
  } finally {
    fs.closeSync(opened.fd);
  }
}

/** 在边界内解析并返回文件路径（用于 handler 候选校验），越界返回 null */
function resolveRootFilePath(params: {
  absolutePath: string;
  rootPath: string;
  boundaryLabel: string;
}): string | null {
  const opened = openRootFileSync(params);
  if (!opened.ok) {
    return null;
  }
  fs.closeSync(opened.fd);
  return opened.path;
}

/**
 * 解析 HOOK.md 的 YAML frontmatter 块
 *
 * 仅支持扁平的 `key: value` 与 `key: [a, b]` 列表语法，返回字符串键值对。
 */
export function parseHookFrontmatter(content: string): ParsedHookFrontmatter {
  const result: ParsedHookFrontmatter = {};
  // 匹配 --- 包裹的 frontmatter 块
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) {
    return result;
  }
  const body = match[1];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) {
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    // 去除引号包裹
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

/** 从 frontmatter 解析字符串列表（如 events: [a, b] 或 events: a, b） */
function parseStringList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const cleaned = value.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 从 frontmatter 解析布尔值，默认返回 fallback */
function parseFrontmatterBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  return fallback;
}

/** 从 frontmatter 字符串值解析为字符串（undefined 时返回 undefined） */
function readStringValue(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

/** 从 frontmatter 解析钩子元数据 */
export function resolveHookMetadata(frontmatter: ParsedHookFrontmatter): HookMetadata | undefined {
  const events = parseStringList(frontmatter.events);
  // 没有任何可识别字段时返回 undefined
  if (
    events.length === 0 &&
    !frontmatter.name &&
    !frontmatter.export &&
    !frontmatter.hookKey &&
    !frontmatter.os &&
    !frontmatter.requires
  ) {
    // 仍返回带空 events 的元数据，因为 frontmatter 可能只有 name
  }
  const osRaw = parseStringList(frontmatter.os);
  return {
    always: frontmatter.always ? parseFrontmatterBool(frontmatter.always, false) : undefined,
    emoji: readStringValue(frontmatter.emoji),
    homepage: readStringValue(frontmatter.homepage),
    hookKey: readStringValue(frontmatter.hookKey),
    export: readStringValue(frontmatter.export),
    os: osRaw.length > 0 ? osRaw : undefined,
    events: events.length > 0 ? events : [],
    requires: frontmatter.requires
      ? { bins: parseStringList(frontmatter.bins), config: parseStringList(frontmatter.config) }
      : undefined,
  };
}

/** 从 frontmatter 解析调用策略 */
export function resolveHookInvocationPolicy(
  frontmatter: ParsedHookFrontmatter,
): HookInvocationPolicy {
  return {
    enabled: parseFrontmatterBool(frontmatter.enabled, true),
  };
}

/** 读取并解析钩子包的 package.json 清单 */
function readHookPackageManifest(dir: string): HookPackageManifest | null {
  const manifestPath = path.join(dir, 'package.json');
  const raw = readRootFileUtf8({
    absolutePath: manifestPath,
    rootPath: dir,
    boundaryLabel: 'hook package directory',
  });
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as HookPackageManifest;
  } catch {
    return null;
  }
}

/** 从清单中解析钩子路径列表 */
function resolvePackageHooks(manifest: HookPackageManifest): string[] {
  const hooks = manifest[HOOK_MANIFEST_KEY]?.hooks;
  if (!Array.isArray(hooks)) {
    return [];
  }
  return hooks.map((h) => (typeof h === 'string' ? h.trim() : '')).filter((h) => h.length > 0);
}

/** 解析包内子目录，确保其位于包目录内部（realpath 校验） */
function resolveContainedDir(baseDir: string, targetDir: string): string | null {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, targetDir);
  if (!isPathInsideWithRealpath(base, resolved, { requireRealpath: true })) {
    return null;
  }
  return resolved;
}

/** 从单个钩子目录加载钩子（HOOK.md + handler 文件） */
function loadHookFromDir(params: {
  hookDir: string;
  source: HookSource;
  pluginId?: string;
  nameHint?: string;
}): LoadedHook | null {
  const hookMdPath = path.join(params.hookDir, 'HOOK.md');
  const content = readRootFileUtf8({
    absolutePath: hookMdPath,
    rootPath: params.hookDir,
    boundaryLabel: 'hook directory',
  });
  if (content === null) {
    return null;
  }
  try {
    const frontmatter = parseHookFrontmatter(content);
    const name = frontmatter.name || params.nameHint || path.basename(params.hookDir);
    const description = frontmatter.description || '';

    // 按优先级查找 handler 文件
    const handlerCandidates = ['handler.ts', 'handler.js', 'index.ts', 'index.js'];
    let handlerPath: string | undefined;
    for (const candidate of handlerCandidates) {
      const candidatePath = path.join(params.hookDir, candidate);
      const safeCandidatePath = resolveRootFilePath({
        absolutePath: candidatePath,
        rootPath: params.hookDir,
        boundaryLabel: 'hook directory',
      });
      if (safeCandidatePath) {
        handlerPath = safeCandidatePath;
        break;
      }
    }

    if (!handlerPath) {
      logger.warn(`[hooks/workspace] 钩子 "${name}" 有 HOOK.md 但缺少 handler 文件: ${params.hookDir}`);
      return null;
    }

    // 优先使用 realpath 作为 baseDir
    let baseDir = params.hookDir;
    try {
      baseDir = fs.realpathSync.native(params.hookDir);
    } catch {
      // realpath 不可用时保留发现路径
    }

    return {
      hook: {
        name,
        description,
        source: params.source,
        pluginId: params.pluginId,
        filePath: hookMdPath,
        baseDir,
        handlerPath,
      },
      frontmatter,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[hooks/workspace] 从 ${params.hookDir} 加载钩子失败: ${message}`);
    return null;
  }
}

/** 扫描目录下的所有钩子子目录（每个子目录含 HOOK.md 或 package.json 钩子声明） */
function loadHooksFromDir(params: {
  dir: string;
  source: HookSource;
  pluginId?: string;
}): LoadedHook[] {
  const { dir, source, pluginId } = params;
  if (!fs.existsSync(dir)) {
    return [];
  }
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    return [];
  }

  const hooks: LoadedHook[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const hookDir = path.join(dir, entry.name);
    const manifest = readHookPackageManifest(hookDir);
    const packageHooks = manifest ? resolvePackageHooks(manifest) : [];

    if (packageHooks.length > 0) {
      // package.json 声明了多个钩子路径，逐个加载（必须包内包含）
      for (const hookPath of packageHooks) {
        const resolvedHookDir = resolveContainedDir(hookDir, hookPath);
        if (!resolvedHookDir) {
          logger.warn(
            `[hooks/workspace] 忽略包外钩子路径 "${hookPath}"（位于 ${hookDir}，必须在包目录内）`,
          );
          continue;
        }
        const hook = loadHookFromDir({
          hookDir: resolvedHookDir,
          source,
          pluginId,
          nameHint: path.basename(resolvedHookDir),
        });
        if (hook) {
          hooks.push(hook);
        }
      }
      continue;
    }

    // 无 package.json 声明：直接作为单个钩子目录加载
    const hook = loadHookFromDir({ hookDir, source, pluginId, nameHint: entry.name });
    if (hook) {
      hooks.push(hook);
    }
  }

  return hooks;
}

/** 从目录加载并构造 HookEntry 列表（含元数据与调用策略） */
export function loadHookEntriesFromDir(params: {
  dir: string;
  source: HookSource;
  pluginId?: string;
}): HookEntry[] {
  const hooks = loadHooksFromDir({
    dir: params.dir,
    source: params.source,
    pluginId: params.pluginId,
  });
  return hooks.map(({ hook, frontmatter }) => {
    const entry: HookEntry = {
      hook: {
        ...hook,
        source: params.source,
        pluginId: params.pluginId,
      },
      frontmatter,
      metadata: resolveHookMetadata(frontmatter),
      invocation: resolveHookInvocationPolicy(frontmatter),
    };
    return entry;
  });
}

/**
 * 发现工作区全部钩子条目（五源扫描）
 *
 * 扫描顺序：extraDirs → bundled → plugin → managed → workspace
 * 随后通过 resolveHookEntries 按优先级与覆盖规则合并。
 */
export function discoverWorkspaceHooks(
  workspaceDir: string,
  opts?: {
    config?: HookWorkspaceConfig;
    /** 受管钩子目录（默认 <configDir>/hooks） */
    managedHooksDir?: string;
    /** 内置钩子目录 */
    bundledHooksDir?: string;
    /** 用户配置目录（默认 process.env.HOME/.config/cdf-know） */
    configDir?: string;
  },
): HookEntry[] {
  const configDir = opts?.configDir ?? path.join(process.env.HOME ?? '~', '.config', 'cdf-know');
  const managedHooksDir = opts?.managedHooksDir ?? path.join(configDir, 'hooks');
  const workspaceHooksDir = path.join(workspaceDir, 'hooks');
  const bundledHooksDir = opts?.bundledHooksDir ?? null;
  const extraDirsRaw = opts?.config?.hooks?.internal?.load?.extraDirs ?? [];
  const extraDirs = extraDirsRaw.map((d) => d.trim()).filter((d) => d.length > 0);

  // 插件钩子目录
  const pluginHookDirs = (opts?.config?.plugins ?? [])
    .filter((p) => p.dir)
    .map((p) => ({ dir: p.dir as string, pluginId: p.id }));

  // 1. extraDirs → managed 源
  const extraHooks = extraDirs.flatMap((dir) =>
    loadHookEntriesFromDir({ dir, source: 'managed' }),
  );

  // 2. bundled 源
  const bundledHooks = bundledHooksDir
    ? loadHookEntriesFromDir({ dir: bundledHooksDir, source: 'bundled' })
    : [];

  // 3. plugin 源
  const pluginHooks = pluginHookDirs.flatMap(({ dir, pluginId }) =>
    loadHookEntriesFromDir({ dir, source: 'plugin', pluginId }),
  );

  // 4. managed 源
  const managedHooks = loadHookEntriesFromDir({ dir: managedHooksDir, source: 'managed' });

  // 5. workspace 源
  const workspaceHooks = loadHookEntriesFromDir({ dir: workspaceHooksDir, source: 'workspace' });

  const all = [...extraHooks, ...bundledHooks, ...pluginHooks, ...managedHooks, ...workspaceHooks];

  return resolveHookEntries(all, {
    onCollisionIgnored: ({ name, kept, ignored }) => {
      logger.warn(
        `[hooks/workspace] 忽略 ${ignored.hook.source} 钩子 "${name}"，因其无法覆盖 ${kept.hook.source} 钩子`,
      );
    },
  });
}
