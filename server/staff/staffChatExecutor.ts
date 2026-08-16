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
import { buildModelVisibleTokens } from '../engine/auditInvariant.js';
import { ExecutionMode } from '../engine/executionStrategy.js';
import { getBuiltinToolDefinitions } from '../engine/toolRegistry.js';
import { getSkillToolDefinitions } from '../engine/skillToolBridge.js';
import { TimerManager } from '../sse/timerManager.js';
import { loadModelsConfig, isLocalModel } from '../modelsStore.js';
import { autoSelectModelAsync, type ScoringInput } from '../routes/modelSelector.js';
import { estimateMessagesTokens, type ApiMessage } from '../engine/contextTruncate.js';
import { selectKey } from '../keyRotator.js';
import * as wikiStore from '../engine/wikiStore.js';
import * as agentDao from '../dao/staff/staffAgentDao.js';
import * as skillDao from '../dao/staff/staffSkillDao.js';
import * as kbDao from '../dao/staff/staffKnowledgeDao.js';
import * as modelConfigDao from '../dao/staff/staffModelConfigDao.js';
import type { McpClientManager } from '../engine/mcpClientManager.js';
import { resolveStaffSkillPermissionConfig } from './staffSkillGating.js';
import { buildStaffMcpManager } from './staffMcpClientManager.js';
import { materializeGeneralSkills } from './staffGeneralSkillMaterializer.js';
import { getStaffHttpToolDefinitions } from './staffHttpToolBridge.js';
import type { ModelConfig, ModelsFile } from '../modelsStore.js';
import { logger } from '../logger.js';
import { recordSkillCall } from './skillEvents.js';
import { recordRouteDecision, type RouteHitKind } from '../routeMetrics.js';

// ===================== 类型 =====================

/**
 * 解析员工绑定的模型配置 id。
 * 优先级：role='primary' > role='default' > 任意第一条（兜底）。
 * 返回 sd_model_configs.id；若无绑定返回 null（调用方回落全局 auto 选型）。
 */
function resolveBoundModelConfigId(tenantId: string, agentId: string): string | null {
  try {
    const bindings = agentDao.listAgentModelBindings(tenantId, agentId);
    if (bindings.length === 0) return null;
    const byRole = new Map(bindings.map((b) => [b.role, b.model_config_id]));
    return byRole.get('primary') ?? byRole.get('default') ?? bindings[0].model_config_id ?? null;
  } catch (err) {
    logger.warn('[StaffChatExecutor] 读取员工模型绑定失败:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

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
  /** 可选执行模式偏好；缺省走 ExecutionMode.REACT（保持历史默认行为） */
  executionMode?: ExecutionMode;
  /** v9.4: 启用反思/动态重规划（透传到 reactExecutor planningMode='dynamic'） */
  enableReflection?: boolean;
}

export interface StaffChatTurnOutput {
  content: string;
  thinkingContent: string;
  mock: boolean;
}

export interface StaffChatEvent {
  type: string;
  [key: string]: any;
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
function skillContentToText(content: any): string {
  if (!content || typeof content !== 'object') return '';
  const c = content as Record<string, any>;
  const parts: string[] = [];
  if (typeof c.description === 'string' && c.description.trim()) parts.push(c.description.trim());
  const nodes = Array.isArray(c.nodes) ? (c.nodes as Array<Record<string, any>>) : [];
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
    let content: Record<string, any> = {};
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

/** 拉取 agent 绑定的知识库，并就用户问题检索相关 chunk，拼成上下文。
 *  同时检索 Wiki 向量索引，将 Wiki 命中与知识库 chunk 合并按 score 排序。 */
async function collectKnowledgeContext(tenantId: string, agentId: string, query: string): Promise<string> {
  const seen = new Set<string>();
  const scored: Array<{ score: number; block: string }> = [];

  // 1. 知识库 RAG 检索（tenant 隔离）
  const bindings = agentDao.listAgentResourceBindings(tenantId, agentId, 'knowledge_base');
  for (const b of bindings) {
    try {
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
        // knowledge chunks 的 score 是 cosineSimilarity (0-1)
        const score = typeof h.score === 'number' ? h.score : 0.5;
        scored.push({ score, block: `【来源：${src}】\n${content}` });
      }
    } catch {
      // 单个知识库检索失败不阻断其他检索
    }
  }

  // 2. Wiki 向量检索（全局共享，无 tenant 隔离）
  try {
    const wikiHits = await wikiStore.vectorSearch(query, 5);
    for (const w of wikiHits) {
      const content = w.summary || '';
      if (!content || seen.has(content)) continue;
      seen.add(content);
      // wiki similarity = 1 - distance，也是 0-1 的余弦相似度，与 knowledge chunks 可比
      scored.push({ score: w.similarity, block: `【来源：Wiki - ${w.title}】\n${content}` });
    }
  } catch {
    // Wiki 检索失败静默降级（不影响知识库检索结果）
  }

  // 3. 按 score 降序合并，取 top 8
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((s) => s.block).join('\n\n');
}

/** 组装 system prompt */
function buildSystemPrompt(
  agent: { name: string; description: string | null; persona_prompt: string | null },
  sops: SkillSop[],
  kbContext: string,
): string {
  const lines: string[] = [];
  lines.push(`你是企业数字员工「${agent.name}」，由 CDFKnow 调度。`);
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

// ===================== 模型决策（A1：员工绑定 vs Auto Model 冲突仲裁 + 审计日志） =====================

/** 模型决策来源：前端显式选择 > 员工绑定 > Auto Model */
export type StaffModelDecisionSource = 'explicit' | 'binding' | 'auto';

export interface StaffModelDecision {
  /** 决策来源 */
  source: StaffModelDecisionSource;
  /** 最终采用的 model id（models.json 原生 id） */
  modelId: string;
  /** 最终采用的模型显示名 */
  modelName: string;
  /** 如果 source=binding：采用的绑定角色 primary/default；source=auto：返回空 */
  bindingRole?: 'primary' | 'default' | 'fallback';
  /** 如果 source=auto：autoSelect 返回的 reason */
  autoReason?: string;
  /** 被「更高优先级」命中从而被忽略的来源（用于审计说明） */
  overriddenSources?: StaffModelDecisionSource[];
  /** 降级标记：绑定存在但 model_configs.model 为空 → 回落 auto */
  bindingMissedFallback?: boolean;
  /** 调试/审计说明 */
  details: string;
}

/**
 * 模型决策统一裁决：
 *  1) 调用方显式传 model 且 != 'auto'  → explicit （直接通过前端切换而来，优先级最高）
 *  2) 员工绑定（primary > default > 第一条）→ binding
 *  3) 全局 CDF Auto Model → auto
 * 返回结构化 decision，调用方可通过 SSE/logger 输出审计。
 */
async function resolveStaffChatModelDecision(
  input: StaffChatTurnInput,
  sops: SkillSop[],
): Promise<{
  modelsConfig: ModelsFile | null;
  decision: StaffModelDecision | null;
}> {
  const { tenantId, agentId, model: explicitModel, message, history } = input;
  try {
    const modelsConfig = await loadModelsConfig();
    const overriddenSources: StaffModelDecisionSource[] = [];

    // ----- 1) 显式选择（前端切换非 auto） -----
    if (explicitModel && explicitModel !== 'auto') {
      overriddenSources.push('binding', 'auto');
      const cfg = modelConfigDao.getModelConfigById(tenantId, explicitModel);
      if (cfg && cfg.model) {
        return {
          modelsConfig,
          decision: {
            source: 'explicit',
            modelId: cfg.model,
            modelName: cfg.name || cfg.model,
            overriddenSources,
            details: `用户/前端显式指定模型配置 id=${explicitModel}，解析为 model=${cfg.model}。覆盖：binding + auto`,
          },
        };
      }
      // 兜底：把 explicitModel 视为 models.json 原生 id
      const raw = modelsConfig.models.find((m) => m.id === explicitModel);
      return {
        modelsConfig,
        decision: {
          source: 'explicit',
          modelId: explicitModel,
          modelName: raw?.name || explicitModel,
          overriddenSources,
          details: `用户显式指定 models.json 原生 id=${explicitModel}（sd_model_configs 无匹配）。覆盖：binding + auto`,
        },
      };
    }

    // ----- 2) 员工绑定 -----
    const boundConfigId = resolveBoundModelConfigId(tenantId, agentId);
    if (boundConfigId) {
      const cfg = modelConfigDao.getModelConfigById(tenantId, boundConfigId);
      if (cfg && cfg.model) {
        overriddenSources.push('auto');
        const bindings = agentDao.listAgentModelBindings(tenantId, agentId);
        const byRole = new Map(bindings.map((b) => [b.role, b.model_config_id]));
        const role: 'primary' | 'default' | 'fallback' =
          byRole.get('primary') === boundConfigId
            ? 'primary'
            : byRole.get('default') === boundConfigId
            ? 'default'
            : 'fallback';
        return {
          modelsConfig,
          decision: {
            source: 'binding',
            bindingRole: role,
            modelId: cfg.model,
            modelName: cfg.name || cfg.model,
            overriddenSources,
            details: `员工绑定命中(${role} 角色)：model_config_id=${boundConfigId} → model=${cfg.model}。覆盖：auto`,
          },
        };
      }
      // 绑定存在但 model_configs.model 为空 → 降级 auto（记审计）
      overriddenSources.push('binding');
      logger.info(
        `[ModelDecision] 员工绑定 model_config_id=${boundConfigId} 存在但 model 字段为空，降级 auto。tenant=${tenantId} agent=${agentId}`,
      );
    }

    // ----- 3) CDF Auto Model -----
    const historyMsgs: ApiMessage[] = history.map((h) => ({ role: h.role, content: h.content }));
    const contextTokenCount = historyMsgs.length > 0 ? estimateMessagesTokens(historyMsgs) : 0;
    const activeSkillCount = sops.length;
    const scoringInput: Partial<ScoringInput> = { contextTokenCount, activeSkillCount };
    const auto = await autoSelectModelAsync(message, modelsConfig, false, scoringInput);
    return {
      modelsConfig,
      decision: {
        source: 'auto',
        modelId: auto.modelId,
        modelName: auto.modelName,
        autoReason: auto.reason,
        overriddenSources: boundConfigId ? ['binding'] : [],
        bindingMissedFallback: !!boundConfigId,
        details: boundConfigId
          ? `员工绑定解析失败（绑定 id=${boundConfigId} 但 model 为空），降级 Auto Model：${auto.reason}`
          : `员工无模型绑定，采用 CDF Auto Model：${auto.reason}`,
      },
    };
  } catch (err) {
    logger.warn('[StaffChatExecutor] 模型决策解析失败，走 mock 兜底:', err instanceof Error ? err.message : String(err));
    return { modelsConfig: null, decision: null };
  }
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

  // ===== 模型决策（A1：显式 > 员工绑定 > CDF Auto Model；统一审计 + SSE） =====
  const { modelsConfig, decision } = await resolveStaffChatModelDecision(
    { tenantId, sessionId, agentId, message, history, model: input.model, executionMode: input.executionMode, enableReflection: input.enableReflection },
    sops,
  );
  const effectiveModel = decision?.modelId ?? '';
  const effectiveModelName = decision?.modelName ?? '';
  if (decision) {
    // A2：路由命中率计数 + 冷启动 fallback 告警
    const missKind: RouteHitKind =
      decision.source === 'binding' ? 'hit_binding' :
      decision.source === 'explicit' ? 'hit_explicit' :
      'miss_fallback';
    recordRouteDecision(tenantId, agentId, decision.source, missKind, decision.details);

    // 冷启动 / 绑定配置缺失时，额外 emit SSE 告警 route.miss 给前端顶部 banner
    if (decision.source === 'auto') {
      emit({
        type: 'route.miss',
        data: {
          reason: decision.bindingMissedFallback ? '绑定配置为空，已回落 Auto Model' : '员工无绑定，已回落 Auto Model',
          bindingMissedFallback: !!decision.bindingMissedFallback,
          modelId: decision.modelId,
          modelName: decision.modelName,
          autoReason: decision.autoReason ?? null,
          details: decision.details,
        },
      });
    }

    // 结构化审计日志（供运营/问题排查）
    logger.info('[ModelDecision] 员工对话模型裁决结果', {
      tenantId,
      agentId,
      agentName: agent.name,
      sessionId,
      source: decision.source,
      bindingRole: decision.bindingRole ?? null,
      bindingMissedFallback: decision.bindingMissedFallback ?? false,
      overriddenSources: decision.overriddenSources ?? [],
      modelId: decision.modelId,
      modelName: decision.modelName,
      autoReason: decision.autoReason ?? null,
      details: decision.details,
    });
    // SSE 事件：把决策理由传给前端，供 AI 对话框顶部徽章/下拉说明
    emit({ type: 'model.decision', data: decision });
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

  // 隔离 MCP：优先使用数字员工自己的 MCP 配置（核心 mcp_servers 表，tenant_id 隔离，per-call 实例），
  // 与全局 mcpClientManager 解耦，保证租户/员工隔离。
  staffMcpManager = await buildStaffMcpManager(tenantId);
  // 把 sd_general_skills 的 markdown 物化为「指令型」引擎技能定义，
  // 让模型在 REACT 路径中能真正看到并调用它们（否则只是死数据）。
  const { definitions: extraSkills, executor: extraSkillExecutor } = materializeGeneralSkills(tenantId);
  // 加载 sd_tools 表中 tool_type='http' 的工具，注册到 staffHttpToolBridge registry
  // 并返回 ToolDefinition[] 供 LLM 在对话中调用
  const staffHttpTools = getStaffHttpToolDefinitions(tenantId);

  // 真实工具计数（供预算/可观测）：builtin + 全局技能工具 + 物化通用技能
  // （员工隔离 MCP 工具在运行时合并，数量动态，这里用可见静态工具集近似）
  const builtinCount = getBuiltinToolDefinitions().length;
  const globalSkillToolCount = getSkillToolDefinitions().length;
  const estimatedToolsCount = Math.max(
    1,
    builtinCount + globalSkillToolCount + (extraSkills?.length || 0) + staffHttpTools.length,
  );

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
      // 审计不变量：history 来自 chatDao.listMessages（DB），当前 message 由豁免逻辑覆盖
      auditTokens: buildModelVisibleTokens(history as unknown as Array<{ role?: string; content?: unknown; toolCalls?: string | null }>),
      executionMode: input.executionMode ?? ExecutionMode.REACT,
      timerManager,
      signal: abortController.signal,
      modelCapabilities: modelConfig.capabilities,
      ctxWindow: (modelConfig as ModelConfig).contextWindow || 128000,
      ctxMaxTokens: Math.min((modelConfig as ModelConfig).maxTokens || 8192, 8192),
      estimatedToolsCount,
      skillPermissionConfig,
      staffMcpManager: staffMcpManager ?? undefined,
      extraSkills,
      extraSkillExecutor,
      staffHttpTools,
      onSkillExecuted: (p: { sessionId: string; skillId: string }) => {
        try {
          recordSkillCall(tenantId, sessionId, p.skillId);
        } catch (evtErr) {
          logger.warn('[StaffChatExecutor] 记录技能调用事件失败（非阻塞）:', evtErr instanceof Error ? evtErr.message : String(evtErr));
        }
      },
      callbacks: {
        onChunk: (chunk: string) => emitText(chunk),
        onThinking: (t: string) => emitThinking(t),
        onToolCall: (tc, res) => emitTool(tc.function.name, tc.function.arguments, typeof res === 'string' ? res : String(res ?? '')),
        onEvent: (e: Record<string, any>) => {
          const t = e.type as string;
          if (t === 'thinking.complete') emitThinkingEnd();
          else if (t === 'done') emitTextEnd();
        },
      },
      // v9.4: 透传 enableReflection 到 executeChat → reactExecutor
      enableReflection: input.enableReflection,
    });

    emitThinkingEnd();
    emitTextEnd();
    // 可观测：累计员工对话用量（写入 sd_agent_usages，闭合最小运营统计）
    try {
      agentDao.upsertAgentUsage(tenantId, 'staff-runtime', agentId, {
        incrementChat: true,
        model: effectiveModel,
      });
    } catch (usageErr) {
      logger.warn('[StaffChatExecutor] 写入用量统计失败（非阻塞）:', usageErr instanceof Error ? usageErr.message : String(usageErr));
    }
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
