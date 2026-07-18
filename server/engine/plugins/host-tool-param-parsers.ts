// Parses host tool parameters supplied by plugin tool contracts.
//
// 移植自 openclaw/src/plugins/host-tool-param-parsers.ts。
//
// 降级策略：
//  - 原文件依赖 ../agents/apply-patch-paths.js 的 extractApplyPatchTargetPaths 与
//    ApplyPatchPathExtractionOptions。cross-wms 尚未移植该模块（其自身依赖
//    sandbox-paths.js 与 sandbox/fs-bridge.js 等未移植子系统）。这里内联降级
//    实现：仅处理非沙箱场景，按行扫描 *** Add/Update/Delete File: 与 *** Move to:
//    标记，提取目标路径；沙箱场景退化为相对 process.cwd() 的 path.normalize。

import path from "node:path";

// ============================================================================
// 内联降级：../agents/apply-patch-paths.js —— ApplyPatchPathExtractionOptions
// ============================================================================

/**
 * apply_patch 路径提取选项（降级占位）。
 *
 * 降级说明：openclaw 的 ApplyPatchPathExtractionOptions 还包含 `sandbox`
 * 字段（携带 SandboxFsBridge）。cross-wms 未移植沙箱子系统，这里仅保留
 * `cwd` 字段；沙箱场景的路径解析退化为相对 process.cwd() 的 path.normalize。
 */
export type ApplyPatchPathExtractionOptions = {
  /** Tool execution cwd. Defaults to process.cwd(). */
  cwd?: string;
};

const ADD_FILE_MARKER = "*** Add File: ";
const DELETE_FILE_MARKER = "*** Delete File: ";
const UPDATE_FILE_MARKER = "*** Update File: ";
const MOVE_TO_MARKER = "*** Move to: ";

function readPatchText(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input;
  }
  if (input && typeof input === "object" && "input" in input) {
    const candidate = (input as { input?: unknown }).input;
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return undefined;
}

function normalizePatchPath(
  raw: string,
  options: ApplyPatchPathExtractionOptions = {},
): string | undefined {
  if (raw.length === 0) {
    return undefined;
  }
  const cwd = options.cwd ?? process.cwd();
  try {
    const normalized = path.normalize(path.resolve(cwd, raw));
    return normalized && normalized !== "." ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function pushPath(
  target: string[],
  seen: Set<string>,
  raw: string,
  options: ApplyPatchPathExtractionOptions,
): void {
  const normalized = normalizePatchPath(raw, options);
  if (!normalized) {
    return;
  }
  if (seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  target.push(normalized);
}

function readMarkerPath(line: string | undefined, marker: string): string | undefined {
  if (line === undefined) {
    return undefined;
  }
  const startTrimmed = line.trimStart();
  if (!startTrimmed.startsWith(marker)) {
    return undefined;
  }
  return startTrimmed.slice(marker.length).trimEnd();
}

/**
 * 从 apply_patch envelope 中提取所有目标路径。
 *
 * 降级说明：openclaw 原版支持沙箱 bridge 的路径解析；这里降级为
 * 仅相对 cwd 解析路径。扫描 *** Add/Update/Delete File: 与 *** Move to: 标记，
 * 去重后按出现顺序返回。
 */
function extractApplyPatchTargetPaths(
  input: unknown,
  options: ApplyPatchPathExtractionOptions = {},
): string[] {
  const text = readPatchText(input);
  if (text === undefined || text.length === 0) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const paths: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const addPath = readMarkerPath(line, ADD_FILE_MARKER);
    if (addPath !== undefined) {
      pushPath(paths, seen, addPath, options);
      while (index + 1 < lines.length && lines[index + 1].startsWith("+")) {
        index += 1;
      }
      continue;
    }
    const deletePath = readMarkerPath(line, DELETE_FILE_MARKER);
    if (deletePath !== undefined) {
      pushPath(paths, seen, deletePath, options);
      continue;
    }
    const updatePath = readMarkerPath(line, UPDATE_FILE_MARKER);
    if (updatePath !== undefined) {
      pushPath(paths, seen, updatePath, options);
      let lookahead = index + 1;
      while (lookahead < lines.length && lines[lookahead].trim() === "") {
        lookahead += 1;
      }
      const movePath = readMarkerPath(lines[lookahead], MOVE_TO_MARKER);
      if (movePath !== undefined) {
        pushPath(paths, seen, movePath, options);
        lookahead += 1;
      }
      while (lookahead < lines.length) {
        if (lines[lookahead].trim() === "") {
          lookahead += 1;
          continue;
        }
        if (lines[lookahead].startsWith("***")) {
          break;
        }
        lookahead += 1;
      }
      index = lookahead - 1;
    }
  }
  return paths;
}

// ============================================================================
// host-tool-param-parsers 实现
// ============================================================================

/**
 * Derived metadata stamped on `before_tool_call` events for plugin handlers.
 *
 * The host owns best-effort parsing of well-known tool param shapes
 * (e.g. apply_patch). Plugins can use these fields as hints, but should still
 * parse params themselves when policy correctness depends on exact targets. The
 * host derives the initial call and re-derives only when a trusted policy
 * rewrites params. Fields are optional and additive: a missing field means
 * derivation produced nothing usable, never that it failed loudly.
 */
export type HostToolDerivedParams = {
  /** Best-effort destination path hints the tool may read or write, when discoverable. */
  derivedPaths?: readonly string[];
};

export type HostToolDerivationOptions = ApplyPatchPathExtractionOptions;

/**
 * Per-tool host-owned param derivers. Keep this map small and focused — every
 * entry runs synchronously inside the before_tool_call hot path.
 */
const HOST_TOOL_PARAM_PARSERS: Record<
  string,
  (params: unknown, options?: HostToolDerivationOptions) => HostToolDerivedParams
> = {
  apply_patch: (params, options) => {
    const paths = extractApplyPatchTargetPaths(params, options);
    return paths.length > 0 ? { derivedPaths: Object.freeze([...paths]) } : {};
  },
};

/**
 * Derive host-owned metadata for a tool call. Returns an empty object when no
 * parser is registered for the tool, which lets callers spread the result
 * unconditionally without a nullability check.
 */
export function deriveToolParams(
  toolName: string,
  params: unknown,
  options?: HostToolDerivationOptions,
): HostToolDerivedParams {
  if (!Object.hasOwn(HOST_TOOL_PARAM_PARSERS, toolName)) {
    return {};
  }
  const parser = HOST_TOOL_PARAM_PARSERS[toolName];
  return parser ? parser(params, options) : {};
}
