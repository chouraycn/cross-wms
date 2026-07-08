/**
 * ACP Approval Classifier
 * 审批分类器 - 自动分类审批请求、风险评估
 *
 * 参考 openclaw/src/acp/approval-classifier.ts 设计
 *
 * v2.0: 新增 openclaw 分类维度（readonly_scoped/exec_capable/control_plane）+ cwd 路径限制
 */

import { homedir } from "node:os";
import path from "node:path";
import type { ApprovalRequest } from "./permissionRelay.js";

/** ACP 审批分类（openclaw 兼容） */
export type AcpApprovalClass =
  | "readonly_scoped"    // 在 cwd 内的只读操作，可自动批准
  | "readonly_search"    // 搜索类工具，可自动批准
  | "mutating"           // 变更类工具，需审批
  | "exec_capable"       // 执行类工具，必须审批
  | "control_plane"      // 控制平面工具，必须审批
  | "interactive"        // 交互式工具，需审批
  | "other"              // 其他工具，需审批
  | "unknown";           // 未知工具，拒绝

/** 审批分类结果 */
export interface AcpApprovalClassification {
  toolName?: string;
  approvalClass: AcpApprovalClass;
  autoApprove: boolean;
  /** 限制路径（对于 scoped 操作） */
  scopedPath?: string;
}

/** 传统风险等级（向后兼容） */
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalCategory = "read" | "write" | "execute" | "network" | "sensitive" | "unknown";

export interface RiskAssessment {
  level: RiskLevel;
  category: ApprovalCategory;
  factors: RiskFactor[];
  confidence: number;
}

export interface RiskFactor {
  name: string;
  score: number;
  description: string;
}

export interface ApprovalClassification {
  request: ApprovalRequest;
  risk: RiskAssessment;
  autoApprove: boolean;
  autoDeny: boolean;
  suggestedAction: "approve" | "deny" | "require_approval";
}

// ===================== 工具分类常量 =====================

const SAFE_SEARCH_TOOL_IDS = new Set(["search", "web_search", "memory_search"]);
const TRUSTED_SAFE_TOOL_ALIASES = new Set(["search"]);
const EXEC_CAPABLE_TOOL_IDS = new Set([
  "exec", "spawn", "shell", "bash", "process", "code_execution", "nodes",
]);
const CONTROL_PLANE_TOOL_IDS = new Set([
  "cron", "gateway", "sessions_spawn", "sessions_send", "session_status",
]);

const DANGEROUS_TOOLS = new Set([
  "exec", "bash", "shell", "system", "rm", "delete", "remove",
  "shutdown", "reboot", "poweroff", "format", "disk",
  "sudo", "su", "admin", "root",
]);

const SENSITIVE_TOOLS = new Set([
  "secrets", "password", "credential", "token", "auth",
  "config", "settings", "preferences",
]);

const READ_ONLY_TOOLS = new Set([
  "list", "get", "read", "search", "query",
  "status", "info", "help", "version",
]);

const WRITE_TOOLS = new Set([
  "write", "create", "update", "modify", "delete",
  "mkdir", "rename", "move", "copy",
]);

const NETWORK_TOOLS = new Set([
  "fetch", "request", "http", "api", "web",
  "download", "upload", "socket", "websocket",
]);

// ===================== 工具名解析辅助函数 =====================

function normalizeToolName(value: string): string | undefined {
  const normalized = value.toLowerCase().trim();
  if (!normalized || normalized.length > 128) {
    return undefined;
  }
  return /^[a-z0-9._-]+$/.test(normalized) ? normalized : undefined;
}

function parseToolNameFromTitle(title: string | null | undefined): string | undefined {
  if (!title) return undefined;
  const head = title.split(":", 1)[0]?.trim();
  return head ? normalizeToolName(head) : undefined;
}

function readFirstStringValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function resolveToolNameForPermission(toolCall?: {
  title?: string | null;
  _meta?: unknown;
  rawInput?: unknown;
}): string | undefined {
  const toolMeta = toolCall?.["_meta"] as Record<string, unknown> | undefined;
  const rawInput = toolCall?.rawInput as Record<string, unknown> | undefined;

  const fromMeta = readFirstStringValue(toolMeta, ["toolName", "tool_name", "name"]);
  const fromRawInput = readFirstStringValue(rawInput, ["tool", "toolName", "tool_name", "name"]);
  const fromTitle = parseToolNameFromTitle(toolCall?.title);

  const metaName = fromMeta ? normalizeToolName(fromMeta) : undefined;
  const rawInputName = fromRawInput ? normalizeToolName(fromRawInput) : undefined;
  const titleName = fromTitle;

  // 防伪造：多个来源必须一致
  if ((fromMeta && !metaName) || (fromRawInput && !rawInputName)) {
    return undefined;
  }
  if (metaName && titleName && metaName !== titleName) return undefined;
  if (rawInputName && metaName && rawInputName !== metaName) return undefined;
  if (rawInputName && titleName && rawInputName !== titleName) return undefined;

  return metaName ?? titleName ?? rawInputName;
}

// ===================== 路径解析辅助函数 =====================

function extractPathFromToolTitle(toolTitle: string | undefined, toolName: string | undefined): string | undefined {
  if (!toolTitle) return undefined;
  const separator = toolTitle.indexOf(":");
  if (separator < 0) return undefined;
  const tail = toolTitle.slice(separator + 1).trim();
  if (!tail) return undefined;

  // 尝试解析 key:value 格式
  const keyedMatch = tail.match(/(?:^|,\s*)(?:path|file_path|filePath)\s*:\s*([^,]+)/);
  if (keyedMatch?.[1]) {
    return keyedMatch[1].trim();
  }
  return toolName === "read" ? tail : undefined;
}

function resolveToolPathCandidate(
  toolCall?: { rawInput?: unknown },
  toolName?: string,
  toolTitle?: string,
): string | undefined {
  const rawInput = toolCall?.rawInput as Record<string, unknown> | undefined;
  return (
    readFirstStringValue(rawInput, ["path", "file_path", "filePath"]) ??
    extractPathFromToolTitle(toolTitle, toolName)
  );
}

function resolveAbsoluteScopedPath(value: string, cwd: string): string | undefined {
  let candidate = value.trim();
  if (!candidate) return undefined;

  // 处理 file:// URL
  if (candidate.startsWith("file://")) {
    try {
      const parsed = new URL(candidate);
      candidate = decodeURIComponent(parsed.pathname || "");
    } catch {
      return undefined;
    }
  }

  // 处理 ~ 扩展
  if (candidate === "~") {
    candidate = homedir();
  } else if (candidate.startsWith("~/")) {
    candidate = path.join(homedir(), candidate.slice(2));
  }

  return path.isAbsolute(candidate) ? path.normalize(candidate) : path.resolve(cwd, candidate);
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = path.resolve(parent);
  const normalizedChild = path.resolve(child);
  const relative = path.relative(normalizedParent, normalizedChild);
  return !relative.startsWith("..") && relative !== "";
}

function isReadToolCallScopedToCwd(
  toolCall?: { rawInput?: unknown },
  toolName?: string,
  toolTitle?: string,
  cwd?: string,
): boolean {
  if (toolName !== "read" || !cwd) return false;

  const rawPath = resolveToolPathCandidate(toolCall, toolName, toolTitle);
  if (!rawPath) return false;

  const absolutePath = resolveAbsoluteScopedPath(rawPath, cwd);
  if (!absolutePath) return false;

  return isPathInside(path.resolve(cwd), absolutePath);
}

// ===================== 分类函数 =====================

/**
 * 解析 ACP 工具审批分类（openclaw 兼容）
 *
 * 对伪造工具身份的情况采用 fail-closed 策略
 */
export function classifyAcpToolApproval(params: {
  toolCall?: {
    title?: string | null;
    _meta?: unknown;
    rawInput?: unknown;
  };
  cwd?: string;
}): AcpApprovalClassification {
  const toolName = resolveToolNameForPermission(params.toolCall);
  if (!toolName) {
    return { toolName: undefined, approvalClass: "unknown", autoApprove: false };
  }

  const isTrustedToolId = TRUSTED_SAFE_TOOL_ALIASES.has(toolName);

  // read 工具 + cwd 范围检查 → 自动批准
  if (toolName === "read" && isTrustedToolId) {
    const cwd = params.cwd || process.cwd();
    const autoApprove = isReadToolCallScopedToCwd(
      params.toolCall ? { rawInput: params.toolCall.rawInput } : undefined,
      toolName,
      params.toolCall?.title ?? undefined,
      cwd,
    );
    const scopedPath = autoApprove ? cwd : undefined;
    return {
      toolName,
      approvalClass: autoApprove ? "readonly_scoped" : "other",
      autoApprove,
      scopedPath,
    };
  }

  // 搜索类工具 → 自动批准
  if (SAFE_SEARCH_TOOL_IDS.has(toolName) && isTrustedToolId) {
    return { toolName, approvalClass: "readonly_search", autoApprove: true };
  }

  // 执行类工具 → 必须审批
  if (EXEC_CAPABLE_TOOL_IDS.has(toolName)) {
    return { toolName, approvalClass: "exec_capable", autoApprove: false };
  }

  // 控制平面工具 → 必须审批
  if (CONTROL_PLANE_TOOL_IDS.has(toolName)) {
    return { toolName, approvalClass: "control_plane", autoApprove: false };
  }

  // 变更类工具 → 需审批
  if (isMutatingToolCall(toolName, params.toolCall?.rawInput)) {
    return { toolName, approvalClass: "mutating", autoApprove: false };
  }

  return { toolName, approvalClass: "other", autoApprove: false };
}

/** 检查工具是否为变更操作 */
function isMutatingToolCall(toolName: string, rawInput?: unknown): boolean {
  if (WRITE_TOOLS.has(toolName)) return true;

  const input = rawInput as Record<string, unknown> | undefined;
  if (!input) return false;

  // 检查是否包含写操作标志
  const mode = readFirstStringValue(input, ["mode", "action", "operation"]);
  if (mode && ["write", "create", "update", "delete", "modify"].includes(mode)) {
    return true;
  }

  return false;
}

// ===================== 传统分类器（向后兼容） =====================

export class ApprovalClassifier {
  /**
   * 使用 openclaw 分类逻辑
   */
  classifyAcp(params: {
    toolCall?: {
      title?: string | null;
      _meta?: unknown;
      rawInput?: unknown;
    };
    cwd?: string;
  }): AcpApprovalClassification {
    return classifyAcpToolApproval(params);
  }

  /**
   * 传统分类方法（向后兼容）
   */
  classify(request: ApprovalRequest): ApprovalClassification {
    const risk = this.assessRisk(request);

    let autoApprove = false;
    let autoDeny = false;
    let suggestedAction: "approve" | "deny" | "require_approval" = "require_approval";

    if (risk.level === "low") {
      autoApprove = true;
      suggestedAction = "approve";
    } else if (risk.level === "critical") {
      autoDeny = true;
      suggestedAction = "deny";
    } else if (risk.level === "high") {
      suggestedAction = "require_approval";
    } else {
      suggestedAction = "require_approval";
    }

    return {
      request,
      risk,
      autoApprove,
      autoDeny,
      suggestedAction,
    };
  }

  assessRisk(request: ApprovalRequest): RiskAssessment {
    const factors: RiskFactor[] = [];
    const toolName = request.toolName.toLowerCase();

    let riskLevel: RiskLevel = "low";
    let category: ApprovalCategory = "unknown";
    let totalScore = 0;

    const matchesSet = (set: Set<string>, name: string): boolean => {
      for (const keyword of set) {
        if (name === keyword || name.startsWith(keyword) || name.includes(keyword)) {
          return true;
        }
      }
      return false;
    };

    if (matchesSet(DANGEROUS_TOOLS, toolName)) {
      factors.push({
        name: "DangerousTool",
        score: 100,
        description: `${toolName} is a dangerous tool that can cause system damage`,
      });
      riskLevel = "critical";
      category = "execute";
      totalScore += 100;
    } else if (matchesSet(SENSITIVE_TOOLS, toolName)) {
      factors.push({
        name: "SensitiveTool",
        score: 70,
        description: `${toolName} accesses sensitive data`,
      });
      riskLevel = "high";
      category = "sensitive";
      totalScore += 70;
    } else if (matchesSet(WRITE_TOOLS, toolName)) {
      factors.push({
        name: "WriteOperation",
        score: 40,
        description: `${toolName} performs write operations`,
      });
      riskLevel = "medium";
      category = "write";
      totalScore += 40;
    } else if (matchesSet(NETWORK_TOOLS, toolName)) {
      factors.push({
        name: "NetworkAccess",
        score: 30,
        description: `${toolName} accesses network resources`,
      });
      riskLevel = "medium";
      category = "network";
      totalScore += 30;
    } else if (matchesSet(READ_ONLY_TOOLS, toolName)) {
      factors.push({
        name: "ReadOnly",
        score: 10,
        description: `${toolName} is read-only`,
      });
      riskLevel = "low";
      category = "read";
      totalScore += 10;
    } else {
      factors.push({
        name: "UnknownTool",
        score: 25,
        description: `${toolName} has unknown risk profile`,
      });
      riskLevel = "medium";
      category = "unknown";
      totalScore += 25;
    }

    const inputRisk = this.assessInputRisk(request.input);
    if (inputRisk > 0) {
      factors.push({
        name: "InputRisk",
        score: inputRisk,
        description: "Input contains potentially dangerous content",
      });
      totalScore += inputRisk;
    }

    const confidence = Math.min(100, Math.round((factors.length / 5) * 100));

    return {
      level: riskLevel,
      category,
      factors,
      confidence,
    };
  }

  private assessInputRisk(input: unknown): number {
    if (!input) return 0;

    let score = 0;
    const inputStr = typeof input === "string" ? input : JSON.stringify(input);
    const lowerInput = inputStr.toLowerCase();

    const dangerousPatterns = [
      { pattern: /rm -rf/i, score: 100 },
      { pattern: /format\s+/i, score: 100 },
      { pattern: /shutdown/i, score: 100 },
      { pattern: /sudo/i, score: 80 },
      { pattern: /password/i, score: 50 },
      { pattern: /secret/i, score: 40 },
      { pattern: /token/i, score: 40 },
      { pattern: /api.?key/i, score: 40 },
    ];

    for (const { pattern, score: patternScore } of dangerousPatterns) {
      if (pattern.test(lowerInput)) {
        score = Math.max(score, patternScore);
      }
    }

    return score;
  }

  canAutoApprove(request: ApprovalRequest): boolean {
    return this.classify(request).autoApprove;
  }

  canAutoDeny(request: ApprovalRequest): boolean {
    return this.classify(request).autoDeny;
  }

  getSuggestedAction(request: ApprovalRequest): "approve" | "deny" | "require_approval" {
    return this.classify(request).suggestedAction;
  }
}

export const approvalClassifier = new ApprovalClassifier();