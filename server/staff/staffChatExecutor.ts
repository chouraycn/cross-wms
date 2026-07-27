/**
 * staffChatExecutor — 数字员工真实对话执行器
 *
 * 定位：把 StaffDeck 数字员工接到 CrossWMS 真实引擎（streamExecutor），
 * 同时保证「人格隔离」与「存储隔离」：
 *  - 人格隔离：不使用主程序的 Soul / Memory 系统消息，system prompt 完全由
 *    agent 的 persona + 绑定技能 SOP + 检索到的知识库上下文 组成。
 *  - 存储隔离：会话/消息写入 staff 自己的 sd_sessions / sd_messages，绝不污染主程序会话表。
 *
 * 行为：
 *  - 若已配置 API Key（或非本地模型），走 streamExecutor 真实 LLM 推流。
 *  - 若未配置 Key（桌面本地模式默认），走 mock 兜底：流式吐出一段能证明
 *    接线正确的占位回答（含 agent 名、命中的 SOP、是否有 KB 参考），便于离线 IS_PASS。
 *
 * 事件：通过 callbacks.onEvent 透传 StaffStreamEvent（type/data）给上游 SSE 写出。
 */
import { executeChat } from '../engine/streamExecutor.js';
import { ExecutionMode } from '../engine/executionStrategy.js';
import { TimerManager } from '../sse/timerManager.js';
import { loadModelsConfig, isLocalModel } from '../modelsStore.js';
import { autoSelectModelAsync } from '../routes/modelSelector.js';
import { selectKey } from '../keyRotator.js';
import * as agentDao from '../dao/staff/staffAgentDao.js';
import * as skillDao from '../dao/staff/staffSkillDao.js';
import * as kbDao from '../dao/staff/staffKnowledgeDao.js';
import type { McpClientManager } from '../engine/mcpClientManager.js';
import { resolveStaffSkillPermissionConfig } from './staffSkillGating.js';
import { buildStaffMcpManager } from './staffMcpClientManager.js';
import { materializeGeneralSkills } from './staffGeneralSkillMaterializer.js';
import type { ModelConfig, ModelsFile } from '../modelsStore.js';
import { logger } from '../logger.js';

// ===================== 类型 =====================

export interface StaffChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface StaffChatTurnInput {
  tenantId: string;
  sessionId: string;
  agentId: string;
  message: string;
  history: StaffChatHistoryItem[];
  model?: string;
}

export interface StaffChatTurnOutput {
  content: string;
  thinkingContent: string;
  mock: boolean;
}

export interface StaffChatEvent {
  type: string;
  [key: string]: unknown;
}

// ===================== Abort 注册表（支持取消） =====================

const abortRegistry = new Map<string, AbortController>();

export function registerStaffChatAbort(sessionId: string, controller: AbortController): void {
  abortRegistry.set(sessionId, controller);
}

export function abortStaffChat(sessionId: string): boolean {
  const ctrl = abortRegistry.get(sessionId);
  if (!ctrl) return false;
  ctrl.abort();
  abortRegistry.delete(sessionId);
  return true;
}

// ===================== 上下文拼装 =====================

interface SkillSop {
  name: string;
  text: string;
}

/** 把技能 content（蒸馏草稿 / 节点）转成可读文本 */
function skillContentToText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const c = content as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof c.description === 'string' && c.description.trim()) parts.push(c.description.trim());
  const nodes = Array.isArray(c.nodes) ? (c.nodes as Array<Record<string, unknown>>) : [];
  for (const n of nodes) {
    const desc = typeof n.description === 'string' ? n.description : '';
    const type = typeof n.type === 'string' ? n.type : 'step';
    const title = typeof n.title === 'string' ? n.title : '';
    const line = [title, desc].filter(Boolean).join('：');
    if (line.trim()) parts.push(`- [${type}] ${line}`);
  }
  return parts.join('\n');
}

/** 拉取 agent 绑定的技能 SOP 文本 */
function collectBoundSkills(tenantId: string, agentId: string): SkillSop[] {
  const bindings = agentDao.listAgentResourceBindings(tenantId, agentId, 'skill');
  const sops: SkillSop[] = [];
  for (const b of bindings) {
    const row = skillDao.getSkillBySkillId(tenantId, b.resource_id);
    if (!row) continue;
    let content: Record<string, unknown> = {};
    try {
      content = row.content_json ? JSON.parse(row.content_json) : {};
    } catch {
      content = {};
    }
    const text = skillContentToText(content);
    if (text.trim()) sops.push({ name: row.name, text });
  }
  return sops;
}

/** 拉取 agent 绑定的知识库，并就用户问题检索相关 chunk，拼成上下文 */
async function collectKnowledgeContext(tenantId: string, agentId: string, query: string): Promise<string> {
  const bindings = agentDao.listAgentResourceBindings(tenantId, agentId, 'knowledge_base');
  if (bindings.length === 0) return '';
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const b of bindings) {
    const hits = await kbDao.searchKnowledge({
      tenant_id: tenantId,
      knowledge_base_id: b.resource_id,
      query,
      limit: 3,
    });
    for (const h of hits) {
      const content = h.chunk?.content;
      if (!content || seen.has(content)) continue;
      seen.add(content);
      const src = h.document?.title || h.bucket?.title || '知识库';
      blocks.push(`【来源：${src}】\n${content}`);
    }
  }
  return blocks.slice(0, 8).join('\n\n');
}

/** 组装 system prompt */
function buildSystemPrompt(
  agent: { name: string; description: string | null; persona_prompt: string | null },
  sops: SkillSop[],
  kbContext: string,
): string {
  const lines: string[] = [];
  lines.push(`你是企业数字员工「${agent.name}」，由 CrossWMS 调度。`);
  if (agent.description) lines.push(agent.description);
  lines.push('');
  if (agent.persona_prompt && agent.persona_prompt.trim()) {
    lines.push('【角色设定】');
    lines.push(agent.persona_prompt.trim());
    lines.push('');
  }
  if (sops.length > 0) {
    lines.push('【你遵循的 SOP / 标准作业流程】');
    for (const s of sops) {
      lines.push(`### ${s.name}`);
      lines.push(s.text);
      lines.push('');
    }
  }
  if (kbContext.trim()) {
    lines.push('【知识库参考资料（检索命中）】');
    lines.push(kbContext.trim());
    lines.push('');
  }
  lines.push(
    '请严格基于上述角色设定、SOP 与知识库参考资料回答用户。若参考资料中没有相关信息，请明确说明「暂无相关依据」，不要编造事实或数据。',
  );
  return lines.join('\n');
}

// ===================== Mock 兜底 =====================

function generateStaffMockResponse(
  agent: { name: string },
  message: string,
  sopNames: string[],
  hasKb: boolean,
): string {
  const sopPart = sopNames.length > 0 ? `已加载 SOP：${sopNames.join('、')}。` : '暂未绑定 SOP。';
  const kbPart = hasKb ? '已从绑定知识库检索到参考资料。' : '暂未命中知识库内容。';
  return (
    `（演示模式 · 未配置 API Key）我是数字员工「${agent.name}」，已收到你的问题：${message}\n\n` +
    `${sopPart}${kbPart}\n\n` +
    `配置有效 API Key 后，我将基于角色设定与知识库给出正式回答。当前返回为离线占位，用于验证对话链路已接通。`
  );
}

// ===================== 主入口 =====================

export async function runStaffChatTurn(
  input: StaffChatTurnInput,
  emit: (event: StaffChatEvent) => void,
): Promise<StaffChatTurnOutput> {
  const { tenantId, sessionId, agentId, message, history, model } = input;

  const agent = agentDao.getAgentById(tenantId, agentId);
  if (!agent) {
    throw new Error(`数字员工（agent）不存在: ${agentId}`);
  }

  // 程序技能门控：仅当员工工具目录中存在 tool_type='skill' 的工具时才生效，
  // 且只放行已启用的程序技能（opt-in）。
  const skillPermissionConfig = resolveStaffSkillPermissionConfig(tenantId);
  // 数字员工隔离 MCP manager（per-call），在真实 LLM 路径内建立，finally 断开
  let staffMcpManager: McpClientManager | null = null;

  const sops = collectBoundSkills(tenantId, agentId);
  const kbContext = await collectKnowledgeContext(tenantId, agentId, message);
  const systemPrompt = buildSystemPrompt(agent, sops, kbContext);

  // ===== 模型解析（失败则降级 mock） =====
  let modelsConfig: ModelsFile | null = null;
  let effectiveModel = '';
  let effectiveModelName = '';
  try {
    modelsConfig = await loadModelsConfig();
    if (model && model !== 'auto') {
      effectiveModel = model;
      effectiveModelName = modelsConfig.models.find((m) => m.id === model)?.name || model;
    } else {
      const auto = await autoSelectModelAsync(message, modelsConfig, false);
      effectiveModel = auto.modelId;
      effectiveModelName = auto.modelName;
    }
  } catch (err) {
    logger.warn('[StaffChatExecutor] 模型配置加载失败，走 mock 兜底:', err instanceof Error ? err.message : String(err));
    modelsConfig = null;
  }

  const emitThinking = (text: string) => emit({ type: 'thinking.delta', data: { text } });
  const emitThinkingEnd = () => emit({ type: 'thinking.end', data: {} });
  const emitText = (text: string) => emit({ type: 'text.delta', data: { text } });
  const emitTextEnd = () => emit({ type: 'text.end', data: {} });
  const emitTool = (toolName: string, args: string, result: string) =>
    emit({ type: 'tool.call', data: { toolName, args, result } });

  // ===== Mock 兜底：无可用模型或 API Key =====
  const modelConfig: ModelConfig | undefined = modelsConfig?.models.find((m) => m.id === effectiveModel);
  const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
  const effectiveApiKey = modelConfig ? (selectKey(modelConfig)?.key || modelConfig.apiKey || '') : '';

  if (!modelsConfig || !modelConfig || (!effectiveApiKey && !isLocal)) {
    const mock = generateStaffMockResponse(agent, message, sops.map((s) => s.name), kbContext.trim().length > 0);
    emitThinking('（演示模式）生成占位回答…');
    emitThinkingEnd();
    // 流式吐出 mock（模拟真实节奏）
    const chunkSize = 12;
    for (let i = 0; i < mock.length; i += chunkSize) {
      emitText(mock.slice(i, i + chunkSize));
      await new Promise((r) => setTimeout(r, 8));
    }
    emitTextEnd();
    return { content: mock, thinkingContent: '', mock: true };
  }

  // ===== 真实 LLM 路径 =====
  const finalModelConfig = {
    ...modelConfig,
    apiKey: effectiveApiKey,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    thinkingLevel: modelConfig.defaultThinkingLevel,
  };

  const apiMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  // 隔离 MCP：优先使用数字员工自己的 sd_mcp_servers（per-call 实例），
  // 与全局 mcpClientManager 解耦，保证租户/员工隔离。
  staffMcpManager = await buildStaffMcpManager(tenantId);
  // 把 sd_general_skills 的 markdown 物化为「指令型」引擎技能定义，
  // 让模型在 REACT 路径中能真正看到并调用它们（否则只是死数据）。
  const { definitions: extraSkills, executor: extraSkillExecutor } = materializeGeneralSkills(tenantId);

  const timerManager = new TimerManager();
  const abortController = new AbortController();
  registerStaffChatAbort(sessionId, abortController);

  try {
    const result = await executeChat({
      sessionId,
      message,
      model: effectiveModel,
      modelName: effectiveModelName,
      modelConfig: finalModelConfig as ModelConfig & { apiKey: string },
      apiMessages: apiMessages as Array<{ role: string; content: string; tool_calls?: never; tool_call_id?: string }>,
      executionMode: ExecutionMode.REACT,
      timerManager,
      signal: abortController.signal,
      modelCapabilities: modelConfig.capabilities,
      ctxWindow: (modelConfig as ModelConfig).contextWindow || 128000,
      ctxMaxTokens: Math.min((modelConfig as ModelConfig).maxTokens || 8192, 8192),
      estimatedToolsCount: 30,
      skillPermissionConfig,
      staffMcpManager: staffMcpManager ?? undefined,
      extraSkills,
      extraSkillExecutor,
      callbacks: {
        onChunk: (chunk: string) => emitText(chunk),
        onThinking: (t: string) => emitThinking(t),
        onToolCall: (tc, res) => emitTool(tc.function.name, tc.function.arguments, typeof res === 'string' ? res : String(res ?? '')),
        onEvent: (e: Record<string, unknown>) => {
          const t = e.type as string;
          if (t === 'thinking.complete') emitThinkingEnd();
          else if (t === 'done') emitTextEnd();
        },
      },
    });

    emitThinkingEnd();
    emitTextEnd();
    return {
      content: result.content,
      thinkingContent: result.thinkingContent,
      mock: false,
    };
  } finally {
    timerManager.stopAll();
    abortRegistry.delete(sessionId);
    // 断开数字员工隔离 MCP 连接，释放底层 transport（避免句柄泄漏）
    if (staffMcpManager) {
      await staffMcpManager.disconnectAll().catch(() => undefined);
    }
  }
}
