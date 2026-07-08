/**
 * ACP Permission Resolver
 * 权限请求解析器 - 将 ACP 权限请求转换为允许/拒绝选项
 *
 * 参考 openclaw/src/acp/client-helpers.ts 设计
 */

import * as readline from "node:readline";
import { classifyAcpToolApproval, type AcpApprovalClass } from "./approvalClassifier.js";

export interface RequestPermissionRequest {
  toolCall?: {
    title?: string | null;
    _meta?: unknown;
    rawInput?: unknown;
  };
  options?: PermissionOption[];
}

export interface PermissionOption {
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  optionId: string;
}

export interface RequestPermissionResponse {
  outcome: {
    outcome: "selected" | "cancelled";
    optionId?: string;
  };
}

type PermissionResolverDeps = {
  prompt?: (toolName: string | undefined, toolTitle?: string) => Promise<boolean>;
  log?: (line: string) => void;
  cwd?: string;
};

function resolveToolKindForPermission(
  toolName: string | undefined,
  approvalClass: AcpApprovalClass,
): string | undefined {
  if (!toolName && approvalClass === "unknown") {
    return undefined;
  }
  if (approvalClass === "readonly_scoped") {
    return "readonly_scoped";
  }
  if (approvalClass === "readonly_search") {
    return "readonly_search";
  }
  return approvalClass;
}

function pickOption(
  options: PermissionOption[],
  kinds: PermissionOption["kind"][],
): PermissionOption | undefined {
  for (const kind of kinds) {
    const match = options.find((option) => option.kind === kind);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function selectedPermission(optionId: string): RequestPermissionResponse {
  return { outcome: { outcome: "selected", optionId } };
}

function cancelledPermission(): RequestPermissionResponse {
  return { outcome: { outcome: "cancelled" } };
}

function promptUserPermission(toolName: string | undefined, toolTitle?: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    console.error(`[permission denied] ${toolName ?? "unknown"}: non-interactive terminal`);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    const finish = (approved: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      rl.close();
      resolve(approved);
    };

    const timeout = setTimeout(() => {
      console.error(`\n[permission timeout] denied: ${toolName ?? "unknown"}`);
      finish(false);
    }, 30_000);

    const label = toolTitle
      ? toolName
        ? `${toolTitle} (${toolName})`
        : toolTitle
      : (toolName ?? "unknown tool");
    rl.question(`\n[permission] Allow "${label}"? (y/N) `, (answer) => {
      const approved = answer.trim().toLowerCase() === "y";
      console.error(`[permission ${approved ? "approved" : "denied"}] ${toolName ?? "unknown"}`);
      finish(approved);
    });
  });
}

export async function resolvePermissionRequest(
  params: RequestPermissionRequest,
  deps: PermissionResolverDeps = {},
): Promise<RequestPermissionResponse> {
  const log = deps.log ?? ((line: string) => console.error(line));
  const prompt = deps.prompt ?? promptUserPermission;
  const cwd = deps.cwd ?? process.cwd();
  const options = params.options ?? [];
  const toolTitle = params.toolCall?.title ?? "tool";
  const classification = classifyAcpToolApproval({ toolCall: params.toolCall, cwd });
  const toolName = classification.toolName;
  const toolKind = resolveToolKindForPermission(toolName, classification.approvalClass);

  if (options.length === 0) {
    log(`[permission cancelled] ${toolName ?? "unknown"}: no options available`);
    return cancelledPermission();
  }

  const allowOption = pickOption(options, ["allow_once", "allow_always"]);
  const rejectOption = pickOption(options, ["reject_once", "reject_always"]);
  const promptRequired = !classification.autoApprove;

  if (!promptRequired) {
    if (!allowOption) {
      log(`[permission cancelled] ${toolName ?? "unknown"}: missing allow option`);
      return cancelledPermission();
    }
    log(`[permission auto-approved] ${toolName} (${toolKind ?? "unknown"})`);
    return selectedPermission(allowOption.optionId);
  }

  log(
    `\n[permission requested] ${toolTitle}${toolName ? ` (${toolName})` : ""}${toolKind ? ` [${toolKind}]` : ""}`,
  );
  const approved = await prompt(toolName, toolTitle);

  if (approved && allowOption) {
    return selectedPermission(allowOption.optionId);
  }
  if (!approved && rejectOption) {
    return selectedPermission(rejectOption.optionId);
  }

  log(
    `[permission cancelled] ${toolName ?? "unknown"}: missing ${approved ? "allow" : "reject"} option`,
  );
  return cancelledPermission();
}