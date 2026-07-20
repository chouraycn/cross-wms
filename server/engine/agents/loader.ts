/**
 * 移植自 openclaw/src/agents/sessions/extensions/loader.ts
 *
 * Extension loader — loads TypeScript extension modules using jiti.
 * cross-wms 简化实现：提供基本的扩展发现和加载框架。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizeUnicodeSpaces(str: string): string {
  return str.replace(UNICODE_SPACES, " ");
}

function expandPath(p: string): string {
  const normalized = normalizeUnicodeSpaces(p);
  if (normalized.startsWith("~/")) {
    return path.join(os.homedir(), normalized.slice(2));
  }
  if (normalized.startsWith("~")) {
    return path.join(os.homedir(), normalized.slice(1));
  }
  return normalized;
}

function resolvePath(extPath: string, cwd: string): string {
  const expanded = expandPath(extPath);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(cwd, expanded);
}

interface ResourceManifest {
  extensions?: string[];
}

function readResourceManifest(packageJsonPath: string): ResourceManifest | null {
  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    if (pkg.openclaw && typeof pkg.openclaw === "object") {
      return pkg.openclaw as ResourceManifest;
    }
    return null;
  } catch {
    return null;
  }
}

function isExtensionFile(name: string): boolean {
  return name.endsWith(".ts") || name.endsWith(".js");
}

/** Resolve extension entry points from a directory. */
function resolveExtensionEntries(dir: string): string[] | null {
  const packageJsonPath = path.join(dir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const manifest = readResourceManifest(packageJsonPath);
    if (manifest?.extensions?.length) {
      const entries: string[] = [];
      for (const extPath of manifest.extensions) {
        const resolvedExtPath = path.resolve(dir, extPath);
        if (fs.existsSync(resolvedExtPath)) {
          entries.push(resolvedExtPath);
        }
      }
      if (entries.length > 0) {
        return entries;
      }
    }
  }
  const indexTs = path.join(dir, "index.ts");
  const indexJs = path.join(dir, "index.js");
  if (fs.existsSync(indexTs)) {
    return [indexTs];
  }
  if (fs.existsSync(indexJs)) {
    return [indexJs];
  }
  return null;
}

/** Discover extensions in a directory. */
function discoverExtensionsInDir(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const discovered: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if ((entry.isFile() || entry.isSymbolicLink()) && isExtensionFile(entry.name)) {
        discovered.push(entryPath);
        continue;
      }
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const entriesLocal = resolveExtensionEntries(entryPath);
        if (entriesLocal) {
          discovered.push(...entriesLocal);
        }
      }
    }
  } catch {
    return [];
  }
  return discovered;
}

export type ExtensionRuntime = {
  sendMessage: (...args: unknown[]) => void;
  sendUserMessage: (...args: unknown[]) => void;
  appendEntry: (...args: unknown[]) => void;
  setSessionName: (name: string) => void;
  getSessionName: () => string | undefined;
  setLabel: (entryId: string, label: string | undefined) => void;
  getActiveTools: () => string[];
  getAllTools: () => unknown[];
  setActiveTools: (toolNames: string[]) => void;
  refreshTools: () => void;
  getCommands: () => unknown[];
  setModel: (model: string) => Promise<void>;
  getThinkingLevel: () => unknown;
  setThinkingLevel: (level: unknown) => void;
  flagValues: Map<string, unknown>;
  pendingProviderRegistrations: Array<{ name: string; config: unknown; extensionPath: string }>;
  assertActive: () => void;
  invalidate: (message?: string) => void;
  registerProvider: (name: string, config: unknown, extensionPath?: string) => void;
  unregisterProvider: (name: string) => void;
};

export type Extension = {
  path: string;
  resolvedPath: string;
  sourceInfo: unknown;
  handlers: Map<string, Array<(...args: unknown[]) => Promise<unknown>>>;
  tools: Map<string, unknown>;
  messageRenderers: Map<string, unknown>;
  commands: Map<string, unknown>;
  flags: Map<string, unknown>;
  shortcuts: Map<string, unknown>;
};

export type LoadExtensionsResult = {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
  runtime: ExtensionRuntime;
};

/** Create a runtime with throwing stubs for action methods. */
export function createExtensionRuntime(): ExtensionRuntime {
  const notInitialized = () => {
    throw new Error(
      "Extension runtime not initialized. Action methods cannot be called during extension loading.",
    );
  };
  const state: { staleMessage?: string } = {};
  const assertActive = () => {
    if (state.staleMessage) {
      throw new Error(state.staleMessage);
    }
  };
  const runtime: ExtensionRuntime = {
    sendMessage: notInitialized,
    sendUserMessage: notInitialized,
    appendEntry: notInitialized,
    setSessionName: notInitialized,
    getSessionName: notInitialized,
    setLabel: notInitialized,
    getActiveTools: notInitialized,
    getAllTools: notInitialized,
    setActiveTools: notInitialized,
    refreshTools: () => {},
    getCommands: notInitialized,
    setModel: () => Promise.reject(new Error("Extension runtime not initialized")),
    getThinkingLevel: notInitialized,
    setThinkingLevel: notInitialized,
    flagValues: new Map(),
    pendingProviderRegistrations: [],
    assertActive,
    invalidate: (message) => {
      state.staleMessage ??=
        message ??
        "This extension ctx is stale after session replacement or reload.";
    },
    registerProvider: (name, config, extensionPath = "<unknown>") => {
      runtime.pendingProviderRegistrations.push({ name, config, extensionPath });
    },
    unregisterProvider: (name) => {
      runtime.pendingProviderRegistrations = runtime.pendingProviderRegistrations.filter(
        (r) => r.name !== name,
      );
    },
  };
  return runtime;
}

function createExtension(extensionPath: string, resolvedPath: string): Extension {
  return {
    path: extensionPath,
    resolvedPath,
    sourceInfo: { source: "local", baseDir: path.dirname(resolvedPath) },
    handlers: new Map(),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}

/** Load extensions from paths — simplified in cross-wms (no jiti). */
export async function loadExtensions(
  paths: string[],
  _cwd: string,
): Promise<LoadExtensionsResult> {
  const extensions: Extension[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const runtime = createExtensionRuntime();

  for (const extPath of paths) {
    try {
      const resolvedPath = resolvePath(extPath, _cwd);
      if (!fs.existsSync(resolvedPath)) {
        errors.push({ path: extPath, error: `Extension file not found: ${resolvedPath}` });
        continue;
      }
      const extension = createExtension(extPath, resolvedPath);
      extensions.push(extension);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ path: extPath, error: `Failed to load extension: ${message}` });
    }
  }

  return { extensions, errors, runtime };
}

/** Discover and load extensions from standard locations. */
export async function discoverAndLoadExtensions(
  configuredPaths: string[],
  cwd: string,
  agentDir?: string,
): Promise<LoadExtensionsResult> {
  const allPaths: string[] = [];
  const seen = new Set<string>();

  const addPaths = (paths: string[]) => {
    for (const p of paths) {
      const resolved = path.resolve(p);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        allPaths.push(p);
      }
    }
  };

  const configDirName = ".openclaw";
  const localExtDir = path.join(cwd, configDirName, "extensions");
  addPaths(discoverExtensionsInDir(localExtDir));

  const globalExtDir = path.join(agentDir ?? path.join(os.homedir(), configDirName), "extensions");
  addPaths(discoverExtensionsInDir(globalExtDir));

  for (const p of configuredPaths) {
    const resolved = resolvePath(p, cwd);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const entries = resolveExtensionEntries(resolved);
      if (entries) {
        addPaths(entries);
        continue;
      }
      addPaths(discoverExtensionsInDir(resolved));
      continue;
    }
    addPaths([resolved]);
  }

  return loadExtensions(allPaths, cwd);
}
