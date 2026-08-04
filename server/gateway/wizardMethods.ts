/**
 * Wizard Gateway Methods — 交互式设置向导 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/wizard.ts
 * - 精简版：内存态向导会话，支持 start / next / cancel / status 四个方法
 * - 向导步骤是预定义的固定序列（生产环境应接入 WizardSession 运行时）
 */

import { randomUUID } from 'node:crypto';
import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 向导会话状态
type WizardSessionStatus = 'running' | 'completed' | 'cancelled' | 'error';

interface WizardStep {
  stepId: string;
  prompt: string;
  kind: 'choice' | 'text' | 'confirm' | 'info';
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
}

interface WizardSession {
  sessionId: string;
  mode?: string;
  workspace?: string;
  status: WizardSessionStatus;
  steps: WizardStep[];
  currentStepIndex: number;
  answers: Array<{ stepId: string; value: unknown }>;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
}

// 内存会话存储
const wizardSessions = new Map<string, WizardSession>();
const MAX_SESSIONS = 32;

// 预定义向导步骤（与 cross-wms 主要初始化流程对齐）
const DEFAULT_WIZARD_STEPS: WizardStep[] = [
  {
    stepId: 'welcome',
    prompt: '欢迎使用 cross-wms 设置向导',
    kind: 'info',
  },
  {
    stepId: 'language',
    prompt: '请选择界面语言',
    kind: 'choice',
    options: [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en-US', label: 'English' },
    ],
    defaultValue: 'zh-CN',
  },
  {
    stepId: 'model_provider',
    prompt: '请选择默认模型 provider',
    kind: 'choice',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'doubao', label: '豆包' },
      { value: 'qwen', label: '通义千问' },
    ],
  },
  {
    stepId: 'api_key',
    prompt: '请输入模型 API Key（可稍后在配置中填写）',
    kind: 'text',
    defaultValue: '',
  },
  {
    stepId: 'workspace',
    prompt: '请输入工作空间路径（默认为当前目录）',
    kind: 'text',
    defaultValue: process.cwd(),
  },
  {
    stepId: 'confirm',
    prompt: '确认开始使用 cross-wms？',
    kind: 'confirm',
    defaultValue: 'yes',
  },
];

function pruneSessions(): void {
  if (wizardSessions.size <= MAX_SESSIONS) return;
  // 按创建时间淘汰最早的会话
  const sorted = Array.from(wizardSessions.values())
    .sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = sorted.slice(0, sorted.length - MAX_SESSIONS);
  for (const s of toRemove) wizardSessions.delete(s.sessionId);
}

function findRunningSession(): WizardSession | undefined {
  for (const session of wizardSessions.values()) {
    if (session.status === 'running') return session;
  }
  return undefined;
}

function buildStepView(session: WizardSession) {
  if (session.currentStepIndex >= session.steps.length) {
    return { done: true as const };
  }
  const step = session.steps[session.currentStepIndex];
  return {
    done: false as const,
    stepId: step.stepId,
    prompt: step.prompt,
    kind: step.kind,
    ...(step.options ? { options: step.options } : {}),
    ...(step.defaultValue !== undefined ? { defaultValue: step.defaultValue } : {}),
    stepIndex: session.currentStepIndex,
    totalSteps: session.steps.length,
  };
}

// ========== Wizard Start ==========

async function wizardStart(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { mode?: string; workspace?: string };

  const running = findRunningSession();
  if (running) {
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'wizard already running',
        data: { sessionId: running.sessionId },
      },
    };
  }

  const sessionId = randomUUID();
  const now = Date.now();
  const session: WizardSession = {
    sessionId,
    mode: typeof p.mode === 'string' ? p.mode : 'default',
    workspace: typeof p.workspace === 'string' && p.workspace.trim() ? p.workspace.trim() : undefined,
    status: 'running',
    steps: DEFAULT_WIZARD_STEPS,
    currentStepIndex: 0,
    answers: [],
    createdAt: now,
    updatedAt: now,
  };
  wizardSessions.set(sessionId, session);
  pruneSessions();

  const stepView = buildStepView(session);
  if (stepView.done) {
    // 立即完成（理论上 DEFAULT_WIZARD_STEPS 至少 1 步，但兜底处理）
    session.status = 'completed';
    session.completedAt = Date.now();
    wizardSessions.delete(sessionId);
  }

  return {
    ok: true,
    sessionId,
    status: session.status,
    ...stepView,
  };
}

// ========== Wizard Next ==========

async function wizardNext(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    sessionId?: string;
    answer?: { stepId?: string; value?: unknown };
  };

  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
    };
  }

  const session = wizardSessions.get(p.sessionId);
  if (!session) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'wizard not found' },
    };
  }

  if (session.status !== 'running') {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `wizard not running (status=${session.status})` },
    };
  }

  // 接受答案（若提供）
  if (p.answer) {
    const step = session.steps[session.currentStepIndex];
    const stepId = p.answer.stepId ?? step?.stepId;
    if (stepId) {
      session.answers.push({ stepId, value: p.answer.value });
    }
  }

  session.currentStepIndex += 1;
  session.updatedAt = Date.now();

  const stepView = buildStepView(session);
  if (stepView.done) {
    session.status = 'completed';
    session.completedAt = Date.now();
    // 完成的会话立即清理，保持与 openclaw 行为一致
    wizardSessions.delete(session.sessionId);
  }

  return {
    ok: true,
    sessionId: session.sessionId,
    status: session.status,
    ...stepView,
  };
}

// ========== Wizard Cancel ==========

async function wizardCancel(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { sessionId?: string };

  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
    };
  }

  const session = wizardSessions.get(p.sessionId);
  if (!session) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'wizard not found' },
    };
  }

  session.status = 'cancelled';
  session.cancelledAt = Date.now();
  session.updatedAt = session.cancelledAt;
  wizardSessions.delete(session.sessionId);

  return {
    ok: true,
    sessionId: session.sessionId,
    status: session.status,
  };
}

// ========== Wizard Status ==========

async function wizardStatus(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { sessionId?: string };

  if (typeof p.sessionId !== 'string' || !p.sessionId.trim()) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
    };
  }

  const session = wizardSessions.get(p.sessionId);
  if (!session) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'wizard not found' },
    };
  }

  return {
    ok: true,
    sessionId: session.sessionId,
    status: session.status,
    currentStepIndex: session.currentStepIndex,
    totalSteps: session.steps.length,
    answers: session.answers,
    ...(session.error ? { error: session.error } : {}),
    ...(session.completedAt ? { completedAt: session.completedAt } : {}),
    ...(session.cancelledAt ? { cancelledAt: session.cancelledAt } : {}),
  };
}

/**
 * 注册所有 Wizard 域方法
 */
export function registerWizardMethods(registry: GatewayMethodRegistry): void {
  registry.register('wizard.start', wizardStart);
  registry.register('wizard.next', wizardNext);
  registry.register('wizard.cancel', wizardCancel);
  registry.register('wizard.status', wizardStatus);
}
