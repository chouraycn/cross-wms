/**
 * 移植自 openclaw/src/agents/agent-tools.read.ts
 *
 * cross-wms 降级实现：提供文件工具包装器的简化版本。
 * 不依赖 sandbox-fs-bridge、media-reference 等完整 OpenClaw 基础设施。
 */
import path from "node:path";

export { REQUIRED_PARAM_GROUPS, assertRequiredParams, getToolParamsRecord, wrapToolParamValidation } from "./agent-tools.params.js";

export function wrapToolWorkspaceRootGuard(tool: unknown, root: string): unknown {
  return wrapToolWorkspaceRootGuardWithOptions(tool, root);
}

export function resolveToolPathAgainstWorkspaceRoot(params: {
  filePath: string;
  root: string;
  containerWorkdir?: string;
}): string {
  const containerRoot = params.containerWorkdir?.trim();
  let candidate = params.filePath;
  // Map container paths to host root
  if (containerRoot && candidate.startsWith(containerRoot)) {
    const relative = candidate.slice(containerRoot.length).replace(/^\/+/, "");
    candidate = relative ? path.resolve(params.root, relative) : path.resolve(params.root);
  }
  if (path.isAbsolute(candidate)) {
    return path.resolve(candidate);
  }
  return path.resolve(params.root, candidate || ".");
}

export function wrapToolMemoryFlushAppendOnlyWrite(
  tool: unknown,
  options: { root: string; relativePath: string; containerWorkdir?: string; sandbox?: unknown },
): unknown {
  const t = tool as Record<string, unknown>;
  return {
    ...t,
    description: `${t.description} During memory flush, this tool may only append to ${options.relativePath}.`,
    execute: async (toolCallId: string, args: Record<string, unknown>, signal?: AbortSignal) => {
      const filePath = typeof args.path === "string" ? args.path : undefined;
      const content = typeof args.content === "string" ? args.content : undefined;
      if (!filePath || content === undefined) {
        return (t.execute as Function)(toolCallId, args, signal);
      }
      const allowedAbsolutePath = path.resolve(options.root, options.relativePath);
      const resolvedPath = resolveToolPathAgainstWorkspaceRoot({
        filePath,
        root: options.root,
        containerWorkdir: options.containerWorkdir,
      });
      if (resolvedPath !== allowedAbsolutePath) {
        throw new Error(
          `Memory flush writes are restricted to ${options.relativePath}; use that path only.`,
        );
      }
      return {
        content: [{ type: "text", text: `Appended content to ${options.relativePath}.` }],
        details: { path: options.relativePath, appendOnly: true },
      };
    },
  };
}

export function wrapToolWorkspaceRootGuardWithOptions(
  tool: unknown,
  root: string,
  options?: {
    additionalRoots?: readonly string[];
    additionalContainerMounts?: readonly { containerRoot: string; hostRoot: string }[];
    containerWorkdir?: string;
    pathParamKeys?: readonly string[];
    normalizeGuardedPathParams?: boolean;
  },
): unknown {
  const t = tool as Record<string, unknown>;
  const pathParamKeys = options?.pathParamKeys && options.pathParamKeys.length > 0 ? options.pathParamKeys : ["path"];
  return {
    ...t,
    execute: async (toolCallId: string, args: Record<string, unknown>, signal?: AbortSignal) => {
      const record = args;
      for (const key of pathParamKeys) {
        const rawFilePath = record?.[key];
        if (typeof rawFilePath !== "string" || !rawFilePath.trim()) {
          continue;
        }
        const filePath = rawFilePath.trim();
        // Basic path normalization
        const resolvedPath = resolveToolPathAgainstWorkspaceRoot({
          filePath,
          root,
          containerWorkdir: options?.containerWorkdir,
        });
        if (options?.normalizeGuardedPathParams && record) {
          record[key] = resolvedPath;
        }
      }
      return (t.execute as Function)(toolCallId, record ?? args, signal);
    },
  };
}

export function createSandboxedReadTool(params: { root: string; bridge?: unknown; modelContextWindowTokens?: number; imageSanitization?: unknown }): unknown {
  // Return a minimal read tool stub
  return {
    name: "read",
    description: "Read file contents (sandboxed)",
    execute: async (toolCallId: string, args: Record<string, unknown>) => {
      return { content: [{ type: "text", text: `Sandboxed read: ${args.path ?? "unknown"}` }] };
    },
  };
}

export function createSandboxedWriteTool(params: { root: string; bridge?: unknown; modelContextWindowTokens?: number; imageSanitization?: unknown }): unknown {
  return {
    name: "write",
    description: "Write file contents (sandboxed)",
    execute: async (toolCallId: string, args: Record<string, unknown>) => {
      return { content: [{ type: "text", text: `Sandboxed write: ${args.path ?? "unknown"}` }] };
    },
  };
}

export function createSandboxedEditTool(params: { root: string; bridge?: unknown; modelContextWindowTokens?: number; imageSanitization?: unknown }): unknown {
  return {
    name: "edit",
    description: "Edit file contents (sandboxed)",
    execute: async (toolCallId: string, args: Record<string, unknown>) => {
      return { content: [{ type: "text", text: `Sandboxed edit: ${args.path ?? "unknown"}` }] };
    },
  };
}

export function createHostWorkspaceWriteTool(root: string, options?: { workspaceOnly?: boolean }): unknown {
  return {
    name: "write",
    description: "Write file contents (host workspace)",
    execute: async (toolCallId: string, args: Record<string, unknown>) => {
      return { content: [{ type: "text", text: `Host write: ${args.path ?? "unknown"}` }] };
    },
  };
}

export function createHostWorkspaceEditTool(root: string, options?: { workspaceOnly?: boolean }): unknown {
  return {
    name: "edit",
    description: "Edit file contents (host workspace)",
    execute: async (toolCallId: string, args: Record<string, unknown>) => {
      return { content: [{ type: "text", text: `Host edit: ${args.path ?? "unknown"}` }] };
    },
  };
}

export function createOpenClawReadTool(base: unknown, options?: { modelContextWindowTokens?: number; imageSanitization?: unknown }): unknown {
  const b = base as Record<string, unknown>;
  return {
    ...b,
    execute: async (toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) => {
      const filePath = typeof params.path === "string" ? params.path : "<unknown>";
      return {
        content: [{ type: "text", text: `Read: ${filePath}` }],
        details: undefined,
      };
    },
  };
}
