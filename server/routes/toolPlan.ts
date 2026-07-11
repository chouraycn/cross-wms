/**
 * Tool Plan API Routes — 工具规划引擎 REST 接口
 *
 * 挂载路径: /api/tool-plan
 *
 * 接口列表：
 * - POST /api/tool-plan/plan           — 规划工具序列（planner.buildToolPlan）
 * - POST /api/tool-plan/check-permission — 检查工具权限（tool-permissions）
 * - POST /api/tool-plan/security-filter  — 安全扫描（security-filter）
 * - GET  /api/tool-plan/capabilities     — 暴露引擎能力清单
 *
 * 所有计算均为纯内存操作，不需要持久化（无 db 依赖）。
 */

import { Router, type Request, type Response } from 'express';
import {
  buildToolPlan,
  toToolProtocolDescriptors,
  defineToolDescriptor,
  SecurityFilter,
  SemanticRouter,
  ToolPermissionManager,
  isToolPlanContractError,
  type ToolDescriptor,
  type ToolPlanContext,
  type ToolCategory,
  type PermissionRule,
  type PermissionLevel,
  type SecurityRiskType,
  type ScanContext,
  type SecurityFilterConfig,
} from '../engine/tool-plan/index.js';
import { logger } from '../logger.js';

const router = Router();

// 工具分类（来自 SemanticRouter 的 ToolCategory union 取值）
const TOOL_CATEGORIES: ToolCategory[] = [
  'file', 'code', 'web', 'data', 'system',
  'communication', 'media', 'search', 'utility',
];

const PERMISSION_LEVELS: PermissionLevel[] = [
  'public', 'elevated', 'restricted', 'dangerous',
];

const SECURITY_RISK_TYPES: SecurityRiskType[] = [
  'pii', 'secret', 'path-traversal', 'command-injection', 'xss',
  'sql-injection', 'prompt-injection', 'sensitive-url', 'dangerous-code',
];

// ===================== POST /api/tool-plan/plan =====================

/**
 * 根据工具描述符 + 可用性上下文规划工具序列
 *
 * Body: {
 *   descriptors: ToolDescriptor[];   // 工具描述符列表
 *   context?: ToolPlanContext;       // 规划上下文（authProviders/enabledPlugins/configValues/contextValues）
 * }
 */
router.post('/plan', (req: Request, res: Response) => {
  try {
    const { descriptors, context } = req.body as {
      descriptors?: ToolDescriptor[];
      context?: ToolPlanContext;
    };

    if (!Array.isArray(descriptors)) {
      res.status(400).json({ success: false, error: 'descriptors is required and must be an array' });
      return;
    }

    const plan = buildToolPlan(descriptors, context ?? {});
    const protocol = toToolProtocolDescriptors(plan.visible.map((e) => e));

    res.json({
      success: true,
      data: {
        visible: plan.visible,
        hidden: plan.hidden,
        protocolDescriptors: protocol,
      },
    });
  } catch (e) {
    if (isToolPlanContractError(e)) {
      res.status(400).json({ success: false, error: (e as unknown as Error).message });
      return;
    }
    logger.error('[ToolPlan API] plan error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== POST /api/tool-plan/check-permission =====================

/**
 * 检查工具调用权限
 *
 * Body: {
 *   toolName: string;
 *   toolOwner: 'core' | 'plugin' | 'channel' | 'mcp';
 *   args?: unknown;
 *   defaultLevel?: PermissionLevel;
 *   requireApproval?: boolean;
 *   rules?: PermissionRule[];
 * }
 */
router.post('/check-permission', async (req: Request, res: Response) => {
  try {
    const {
      toolName,
      toolOwner,
      args,
      defaultLevel,
      requireApproval,
      rules,
    } = req.body as {
      toolName?: string;
      toolOwner?: 'core' | 'plugin' | 'channel' | 'mcp';
      args?: unknown;
      defaultLevel?: PermissionLevel;
      requireApproval?: boolean;
      rules?: PermissionRule[];
    };

    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ success: false, error: 'toolName is required' });
      return;
    }
    if (!toolOwner) {
      res.status(400).json({ success: false, error: 'toolOwner is required' });
      return;
    }

    const manager = new ToolPermissionManager({
      ...(defaultLevel ? { defaultLevel } : {}),
      ...(requireApproval !== undefined ? { requireApproval } : {}),
      ...(Array.isArray(rules) ? { rules } : {}),
    });

    const result = await manager.checkPermission(toolName, toolOwner, args);

    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[ToolPlan API] check-permission error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== POST /api/tool-plan/security-filter =====================

/**
 * 对输入/输出内容做安全扫描
 *
 * Body: {
 *   content: string;                 // 待扫描内容
 *   scanType?: 'input' | 'output';  // 默认 input
 *   context?: ScanContext;          // { toolName?, inputSource?, sessionId? }
 *   autoSanitize?: boolean;         // 命中后自动脱敏
 *   maskChar?: string;              // 脱敏掩码字符（默认 '*'）
 *   customSensitiveWords?: string[];// 自定义敏感词
 * }
 */
router.post('/security-filter', (req: Request, res: Response) => {
  try {
    const {
      content,
      scanType,
      context,
      autoSanitize,
      maskChar,
      customSensitiveWords,
    } = req.body as {
      content?: string;
      scanType?: 'input' | 'output';
      context?: ScanContext;
      autoSanitize?: boolean;
      maskChar?: string;
      customSensitiveWords?: string[];
    };

    if (typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'content is required and must be a string' });
      return;
    }

    const config: Partial<SecurityFilterConfig> = {
      ...(autoSanitize !== undefined ? { autoSanitize } : {}),
      ...(maskChar !== undefined ? { maskChar } : {}),
      ...(Array.isArray(customSensitiveWords) ? { customSensitiveWords } : {}),
    };

    const filter = new SecurityFilter(config);

    const result = scanType === 'output'
      ? filter.scanOutput(content, context)
      : filter.scanInput(content, context);

    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[ToolPlan API] security-filter error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ===================== GET /api/tool-plan/capabilities =====================

/**
 * 暴露引擎能力清单（无需参数）
 */
router.get('/capabilities', (_req: Request, res: Response) => {
  try {
    // 用 SemanticRouter 实例探测其可用性（不修改状态）
    const _probe = new SemanticRouter();

    res.json({
      success: true,
      data: {
        modules: [
          'planner',
          'semantic-router',
          'tool-permissions',
          'security-filter',
          'protocol',
        ],
        toolCategories: TOOL_CATEGORIES,
        permissionLevels: PERMISSION_LEVELS,
        securityRiskTypes: SECURITY_RISK_TYPES,
        defaultEnabledSecurityChecks: SECURITY_RISK_TYPES,
        helpers: {
          defineToolDescriptor: typeof defineToolDescriptor === 'function',
          buildToolPlan: typeof buildToolPlan === 'function',
          toToolProtocolDescriptors: typeof toToolProtocolDescriptors === 'function',
        },
      },
    });
  } catch (e) {
    logger.error('[ToolPlan API] capabilities error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
