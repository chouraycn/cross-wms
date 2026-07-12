import { logger } from '../logger.js';

export type ToolReviewDecision = 'allow' | 'ask' | 'deny';
export type ToolRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface ToolCallReviewResult {
  decision: ToolReviewDecision;
  riskLevel: ToolRiskLevel;
  rationale: string;
  reviewedParams?: Record<string, unknown>;
}

export interface ToolCallReviewInput {
  toolName: string;
  args: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
}

const HIGH_RISK_TOOLS = new Set([
  'shell_exec',
  'file_writeFile',
  'file_deleteFile',
  'file_moveFile',
  'file_generateFile',
]);

const DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+~/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/i,
  /mkfs\./i,
  /dd\s+if=\/dev\/zero/i,
  /chmod\s+777\s+\//i,
  />\s*\/dev\/sda/i,
  /curl\s+.*\|\s*sh/i,
  /wget\s+.*\|\s*sh/i,
];

const DANGEROUS_PATH_PATTERNS = [
  /^\/etc\//i,
  /^\/var\/log\//i,
  /^\/root\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  /^~\/\.ssh\//i,
];

function checkCommandSafety(command: string): { safe: boolean; risk: ToolRiskLevel; reason: string } {
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, risk: 'critical', reason: `危险命令模式: ${pattern.source}` };
    }
  }
  return { safe: true, risk: 'low', reason: '' };
}

function checkPathSafety(path: string): { safe: boolean; risk: ToolRiskLevel; reason: string } {
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(path)) {
      return { safe: false, risk: 'high', reason: `敏感路径: ${path}` };
    }
  }
  return { safe: true, risk: 'safe', reason: '' };
}

export class ToolCallReviewer {
  private enabled: boolean;
  private reviewCount: number = 0;
  private denyCount: number = 0;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getStats(): { total: number; denied: number } {
    return { total: this.reviewCount, denied: this.denyCount };
  }

  review(input: ToolCallReviewInput): ToolCallReviewResult {
    if (!this.enabled) {
      return { decision: 'allow', riskLevel: 'safe', rationale: 'reviewer disabled' };
    }

    this.reviewCount++;
    const { toolName, args } = input;

    // shell_exec 安全审查
    if (toolName === 'shell_exec' || toolName === 'shell') {
      const command = (args.command as string) || '';
      const cwd = (args.cwd as string) || '';

      const cmdSafety = checkCommandSafety(command);
      if (!cmdSafety.safe) {
        this.denyCount++;
        logger.warn(`[ToolCallReviewer] Dangerous command blocked: ${cmdSafety.reason}`);
        return {
          decision: 'deny',
          riskLevel: cmdSafety.risk,
          rationale: cmdSafety.reason,
        };
      }

      if (cwd) {
        const cwdSafety = checkPathSafety(cwd);
        if (!cwdSafety.safe) {
          this.denyCount++;
          return {
            decision: 'ask',
            riskLevel: cwdSafety.risk,
            rationale: cwdSafety.reason,
          };
        }
      }

      return { decision: 'allow', riskLevel: cmdSafety.risk, rationale: 'command reviewed' };
    }

    // file_writeFile / file_deleteFile 安全审查
    if (toolName === 'file_writeFile' || toolName === 'file_deleteFile' || toolName === 'file_moveFile') {
      const path = (args.path as string) || '';
      if (path) {
        const pathSafety = checkPathSafety(path);
        if (!pathSafety.safe) {
          this.denyCount++;
          return {
            decision: 'ask',
            riskLevel: pathSafety.risk,
            rationale: pathSafety.reason,
          };
        }
      }
      return { decision: 'allow', riskLevel: 'safe', rationale: 'path reviewed' };
    }

    // 高风险工具默认 ask
    if (HIGH_RISK_TOOLS.has(toolName)) {
      return { decision: 'allow', riskLevel: 'low', rationale: 'high-risk tool reviewed' };
    }

    return { decision: 'allow', riskLevel: 'safe', rationale: 'no review needed' };
  }
}

export const toolCallReviewer = new ToolCallReviewer();
