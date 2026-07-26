import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  GitBranch,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '../../components/staff/ui/index.js';
import { Button as UIButton } from '../../components/staff/ui/button.js';
import { notify } from '../../components/staff/ui/app-toast.js';
import { cn } from '../../components/staff/lib/utils.js';
import {
  AGENT_SCOPE_CHANGE_EVENT,
  ENTERPRISE_AGENT_STORAGE_KEY,
} from '../../components/staff/lib/agent-scope-storage.js';
import {
  SELECT_TRIGGER_CLASS,
} from '../../components/staff/lib/enterprise-ui.js';
import {
  CHAT_ACTIONS_CLASS,
  CHAT_ACTIONS_GROUP_CLASS,
  CHAT_BUBBLE_ASSISTANT_CLASS,
  CHAT_BUBBLE_BASE_CLASS,
  CHAT_BUBBLE_USER_CLASS,
  CHAT_CARD_BODY_CLASS,
  CHAT_COMPOSER_CLASS,
  CHAT_COMPOSER_SHELL_CLASS,
  CHAT_MESSAGES_CLASS,
  CHAT_PANEL_CLASS,
  CHAT_ROW_BASE_CLASS,
  CHAT_ROW_USER_CLASS,
  CHAT_TEXTAREA_CLASS,
  DISTILL_ACTIONS_CLASS,
  DISTILL_CARD_BODY_CLASS,
  DISTILL_CARD_CLASS,
  DISTILL_PAGE_CLASS,
  PRIMARY_BUTTON_CLASS,
  RETURN_BUTTON_CLASS,
  SECTION_CARD_TITLE_CLASS,
  SOURCE_CARD_CLASS,
  SOURCE_EMPTY_STATE_CLASS,
  SOURCE_EMPTY_TEXT_CLASS,
  SOURCE_TOOLBAR_CLASS,
  WORKBENCH_CLASS,
} from './distillPageStyles.js';
import { api, TENANT_ID } from '../../components/staff/api/client.js';
import type { EnterpriseAuthUser } from '../../components/staff/auth.js';
import type {
  SkillRead,
  SkillCard,
  ToolRead,
  ModelConfigRead,
} from '../../components/staff/types/index.js';

const DISTILL_REWRITE_MODEL_STORAGE_KEY = 'distill-rewrite-model';

type DistillPageProps = {
  active?: boolean;
  searchParamsOverride?: URLSearchParams | null;
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

type ChatItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
};

const DEFAULT_MESSAGES: ChatItem[] = [
  {
    id: 'assistant-welcome',
    role: 'assistant',
    content:
      '你好，我是 SOP 蒸馏助手。请告诉我希望 SOP 解决什么场景、涉及哪些角色、需要哪些字段或工具，我将协助你起草一份结构化的 SOP。',
  },
];

const DEFAULT_DRAFT: SkillCard = {
  skill_id: '',
  name: '',
  version: '0.1.0',
  business_domain: '',
  description: '',
  trigger_intents: [],
  user_utterance_examples: [],
  goal: [],
  required_info: [],
  nodes: [],
  edges: [],
  start_node_id: '',
  terminal_node_ids: [],
  interruption_policy: {},
  response_rules: [],
};

type ViewMode = 'source' | 'flow';

export default function DistillPage({
  active = true,
  searchParamsOverride,
  currentUser,
  onLogout,
}: DistillPageProps = {}) {
  const navigate = useNavigate();
  const [routerSearchParams] = useSearchParams();
  const searchParams = searchParamsOverride || routerSearchParams;
  const skillId = searchParams.get('skill_id') || '';
  const _mode = searchParams.get('mode') || '';
  const [selectedAgentId, setSelectedAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const activeAgentId = searchParams.get('agent_id') || selectedAgentId;
  const agentQuery = activeAgentId ? `&agent_id=${encodeURIComponent(activeAgentId)}` : '';

  const [draft, setDraft] = useState<SkillCard | null>(null);
  const [loadedSkill, setLoadedSkill] = useState<SkillRead | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>(DEFAULT_MESSAGES);
  const [input, setInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('source');
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<ToolRead[]>([]);
  const [modelConfigs, setModelConfigs] = useState<ModelConfigRead[]>([]);
  const [selectedRewriteModelId, setSelectedRewriteModelId] = useState(
    () => window.localStorage.getItem(`${DISTILL_REWRITE_MODEL_STORAGE_KEY}:${TENANT_ID}`) || '',
  );
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDomain, setSaveDomain] = useState('');
  const [saveVersion, setSaveVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      const next = detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '';
      setSelectedAgentId(next);
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void loadSkill();
    void loadModelConfigs();
    void loadTools();
  }, [active, skillId, activeAgentId]);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  async function loadSkill() {
    if (!skillId) {
      setDraft({ ...DEFAULT_DRAFT });
      setLoadedSkill(null);
      return;
    }
    setLoading(true);
    try {
      const skill = await api.get<SkillRead>(
        `/skills/${skillId}?tenant_id=${TENANT_ID}${agentQuery}`,
      );
      setLoadedSkill(skill);
      setDraft(skill.content || { ...DEFAULT_DRAFT, skill_id: skill.skill_id, name: skill.name, version: skill.version, business_domain: skill.business_domain || '', description: skill.description || '' });
      setSaveName(skill.name);
      setSaveDomain(skill.business_domain || '');
      setSaveVersion(skill.version);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载 SOP 失败');
      setDraft({ ...DEFAULT_DRAFT });
    } finally {
      setLoading(false);
    }
  }

  async function loadModelConfigs() {
    try {
      const rows = await api.get<ModelConfigRead[]>(`/model-configs?tenant_id=${TENANT_ID}`);
      const enabled = rows.filter((item) => item.enabled);
      setModelConfigs(enabled);
      setSelectedRewriteModelId((current) => {
        if (current && enabled.some((item) => item.id === current)) return current;
        const fallback = enabled.find((item) => item.is_default)?.id || enabled[0]?.id || '';
        if (fallback) {
          window.localStorage.setItem(`${DISTILL_REWRITE_MODEL_STORAGE_KEY}:${TENANT_ID}`, fallback);
        }
        return fallback;
      });
    } catch {
      setModelConfigs([]);
    }
  }

  async function loadTools() {
    try {
      const rows = await api.get<ToolRead[]>(`/tools?tenant_id=${TENANT_ID}${agentQuery}`);
      setTools(rows.filter((item) => item.enabled));
    } catch {
      setTools([]);
    }
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const userMessage: ChatItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const assistantPlaceholder: ChatItem = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '正在生成 SOP 草稿…',
      pending: true,
    };
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput('');

    // NOTE: 简化版 — 实际蒸馏流程应通过 SSE 调用 /api/enterprise/skills/distill/stream
    // 这里仅生成一个简单的占位草稿，供 UI 框架验证使用。
    setTimeout(() => {
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && last.pending) {
          next[next.length - 1] = {
            ...last,
            content: `已收到你的需求：\n\n${text}\n\n（简化版未连接蒸馏后端，请接入 /skills/distill/stream 获取完整结果。）`,
            pending: false,
          };
        }
        return next;
      });
      setDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          description: text.slice(0, 200),
          goal: [...(prev.goal || []), text.slice(0, 80)],
        };
      });
    }, 600);
  }

  function openSaveDialog() {
    if (!draft) return;
    setSaveName(draft.name || loadedSkill?.name || '');
    setSaveDomain(draft.business_domain || loadedSkill?.business_domain || '');
    setSaveVersion(draft.version || loadedSkill?.version || '0.1.0');
    setSaveOpen(true);
  }

  async function confirmSave() {
    if (!draft) return;
    const name = saveName.trim();
    if (!name) {
      notify.warning('请填写 SOP 名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: TENANT_ID,
        agent_id: activeAgentId || undefined,
        skill_id: skillId || undefined,
        name,
        version: saveVersion.trim() || '0.1.0',
        business_domain: saveDomain.trim() || undefined,
        description: draft.description,
        content: { ...draft, name, version: saveVersion.trim() || '0.1.0', business_domain: saveDomain.trim() },
        status: 'draft',
      };
      if (skillId && loadedSkill) {
        await api.put<SkillRead>(`/skills/${skillId}`, payload);
        notify.success('SOP 已保存');
      } else {
        const created = await api.post<SkillRead>(`/skills`, payload);
        notify.success('SOP 已创建');
        navigate(`/staff/skills/${created.skill_id}/distill`);
      }
      setSaveOpen(false);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmClear() {
    setClearing(true);
    try {
      setDraft({ ...DEFAULT_DRAFT });
      setMessages(DEFAULT_MESSAGES);
      setInput('');
      notify.success('已清空当前会话');
      setClearConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  const isEmptyDraft = useMemo(() => {
    if (!draft) return true;
    return !draft.nodes || draft.nodes.length === 0;
  }, [draft]);

  return (
    <div className={DISTILL_PAGE_CLASS} aria-busy={loading}>
      <AppHeader
        title={skillId ? `编辑 SOP：${loadedSkill?.name || skillId}` : '新建 SOP（蒸馏）'}
        description="通过对话引导生成结构化 SOP，并编辑节点 / 边 / 字段。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <button
            type="button"
            className={RETURN_BUTTON_CLASS}
            onClick={() => navigate('/staff/skills')}
          >
            <ArrowLeft className="size-[14px]" />
            返回列表
          </button>
        }
      />

      <div className={DISTILL_ACTIONS_CLASS}>
        <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
          <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[140px]`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="source">字段视图</SelectItem>
            <SelectItem value="flow">流程视图</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={selectedRewriteModelId}
          onValueChange={(value) => {
            setSelectedRewriteModelId(value);
            window.localStorage.setItem(`${DISTILL_REWRITE_MODEL_STORAGE_KEY}:${TENANT_ID}`, value);
          }}
        >
          <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[200px]`}>
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {modelConfigs.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          className={RETURN_BUTTON_CLASS}
          onClick={() => setClearConfirmOpen(true)}
        >
          <Trash2 className="size-[14px]" />
          清空会话
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          onClick={openSaveDialog}
          disabled={!draft}
        >
          <Save className="size-[14px]" />
          保存 SOP
        </button>
      </div>

      <div className={WORKBENCH_CLASS}>
        <section className={cn(DISTILL_CARD_CLASS, 'chat-card')} aria-label="蒸馏对话">
          <header className="flex shrink-0 items-center justify-between gap-[12px] px-[6px]">
            <h3 className={SECTION_CARD_TITLE_CLASS}>
              <Sparkles className="mr-[6px] inline size-[14px] text-[#04756f]" />
              蒸馏助手
            </h3>
            <span className="text-[12px] text-[#858b9c]">{messages.length} 条消息</span>
          </header>
          <div className={CHAT_CARD_BODY_CLASS}>
            <div className={CHAT_PANEL_CLASS}>
              <div ref={chatMessagesRef} className={CHAT_MESSAGES_CLASS}>
                {messages.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      CHAT_ROW_BASE_CLASS,
                      item.role === 'user' ? CHAT_ROW_USER_CLASS : '',
                    )}
                  >
                    <div
                      className={cn(
                        CHAT_BUBBLE_BASE_CLASS,
                        item.role === 'user'
                          ? CHAT_BUBBLE_USER_CLASS
                          : cn(CHAT_BUBBLE_ASSISTANT_CLASS, item.pending && 'opacity-70'),
                      )}
                    >
                      {item.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className={CHAT_COMPOSER_SHELL_CLASS}>
                <div className={CHAT_COMPOSER_CLASS}>
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="描述你想要的 SOP 场景，回车发送，Shift+Enter 换行"
                    className={CHAT_TEXTAREA_CLASS}
                    rows={4}
                  />
                  <div className={CHAT_ACTIONS_CLASS}>
                    <span className="text-[12px] text-[#858b9c]">
                      {tools.length} 个工具可调用 · {modelConfigs.length} 个可用模型
                    </span>
                    <div className={CHAT_ACTIONS_GROUP_CLASS}>
                      <button
                        type="button"
                        className={RETURN_BUTTON_CLASS}
                        onClick={() => setInput('')}
                        disabled={!input}
                      >
                        清空
                      </button>
                      <button
                        type="button"
                        className={PRIMARY_BUTTON_CLASS}
                        onClick={sendMessage}
                        disabled={!input.trim()}
                      >
                        <Send className="size-[14px]" />
                        发送
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={SOURCE_CARD_CLASS} aria-label="SOP 草稿">
          <header className="flex shrink-0 items-center justify-between gap-[12px] px-[6px]">
            <h3 className={SECTION_CARD_TITLE_CLASS}>
              {viewMode === 'source' ? (
                <Eye className="mr-[6px] inline size-[14px] text-[#04756f]" />
              ) : (
                <GitBranch className="mr-[6px] inline size-[14px] text-[#04756f]" />
              )}
              {viewMode === 'source' ? '字段视图' : '流程视图'}
            </h3>
            <div className="flex items-center gap-[8px] text-[12px] text-[#858b9c]">
              <span>{draft?.nodes?.length || 0} 节点</span>
              <span>·</span>
              <span>{draft?.edges?.length || 0} 边</span>
            </div>
          </header>
          <div className={DISTILL_CARD_BODY_CLASS}>
            <div className={SOURCE_TOOLBAR_CLASS}>
              <span className="text-[12px] text-[#464c5e]">
                {draft?.name || '未命名 SOP'}
              </span>
              <span className="text-[12px] text-[#858b9c]">
                {draft?.version || '0.1.0'}
              </span>
            </div>
            {isEmptyDraft ? (
              <div className={SOURCE_EMPTY_STATE_CLASS}>
                <Plus className="size-[24px] text-[#858b9c]" />
                <p className={SOURCE_EMPTY_TEXT_CLASS}>
                  暂无 SOP 草稿。在左侧描述你的需求，蒸馏助手将自动生成节点与字段。
                </p>
              </div>
            ) : viewMode === 'source' ? (
              <SourceView draft={draft!} />
            ) : (
              <FlowView draft={draft!} />
            )}
          </div>
        </section>
      </div>

      <Dialog open={saveOpen} onOpenChange={(open) => !saving && setSaveOpen(open)}>
        <DialogContent className="gap-0 overflow-hidden rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            保存 SOP
          </DialogTitle>
          <div className="flex flex-col gap-[16px] px-[24px] pb-[20px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">名称</span>
              <Input
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">业务域</span>
              <Input
                value={saveDomain}
                onChange={(event) => setSaveDomain(event.target.value)}
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">版本</span>
              <Input
                value={saveVersion}
                onChange={(event) => setSaveVersion(event.target.value)}
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
          </div>
          <DialogFooter className="flex items-center justify-end gap-[8px] border-t border-[#f2f3f7] px-[24px] py-[12px]">
            <UIButton
              variant="outline"
              className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              取消
            </UIButton>
            <UIButton
              className="h-[32px] min-w-[80px] rounded-[10px] bg-[#18181a] px-[12px] text-[14px] text-white hover:bg-[#303030]"
              onClick={() => void confirmSave()}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => !clearing && setClearConfirmOpen(open)}
        title="清空当前会话"
        description="将清空左侧对话与右侧草稿，无法恢复。"
        confirmText="清空"
        loading={clearing}
        onConfirm={() => void confirmClear()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source view (字段视图) — 渲染 SOP 字段
// ---------------------------------------------------------------------------

function SourceView({ draft }: { draft: SkillCard }) {
  const fields = useMemo(() => {
    return [
      { label: 'Skill ID', value: draft.skill_id || '-' },
      { label: '名称', value: draft.name || '-' },
      { label: '版本', value: draft.version || '-' },
      { label: '业务域', value: draft.business_domain || '-' },
      { label: '描述', value: draft.description || '-' },
      { label: '触发意图', value: draft.trigger_intents.join('、') || '-' },
      { label: '用户示例', value: draft.user_utterance_examples.join('；') || '-' },
      { label: '目标', value: draft.goal.join('；') || '-' },
      { label: '必填信息', value: draft.required_info.join('、') || '-' },
      { label: '响应规则', value: draft.response_rules.join('；') || '-' },
    ];
  }, [draft]);

  return (
    <div className="grid min-h-0 flex-1 content-start gap-[14px] overflow-y-auto pr-[8px]">
      {fields.map((field) => (
        <div
          key={field.label}
          className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-[10px] rounded-[10px] border border-[#eceef1] bg-white p-[12px]"
        >
          <span className="text-[12px] font-semibold text-[#858b9c]">{field.label}</span>
          <span className="min-w-0 whitespace-pre-wrap text-[13px] text-[#18181a]">
            {field.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow view (流程视图) — 渲染节点与边
// ---------------------------------------------------------------------------

function FlowView({ draft }: { draft: SkillCard }) {
  if (!draft.nodes || draft.nodes.length === 0) {
    return (
      <div className={SOURCE_EMPTY_STATE_CLASS}>
        <GitBranch className="size-[24px] text-[#858b9c]" />
        <p className={SOURCE_EMPTY_TEXT_CLASS}>暂无节点</p>
      </div>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 gap-[12px] overflow-y-auto pr-[8px]">
      {draft.nodes.map((node, index) => {
        const nodeId = String(node.id || `node-${index}`);
        const title = String(node.title || node.label || nodeId);
        const summary = String(node.summary || node.description || '');
        const isStart = draft.start_node_id === nodeId;
        const isTerminal = draft.terminal_node_ids?.includes(nodeId) ?? false;
        return (
          <div
            key={nodeId}
            className="rounded-[10px] border border-[#eceef1] bg-white p-[14px]"
          >
            <div className="flex items-center gap-[6px]">
              <span className="text-[13px] font-medium text-[#18181a]">{title}</span>
              {isStart ? (
                <span className="rounded-full bg-[#e9f7ef] px-[8px] py-px text-[11px] text-[#2cb360]">
                  起点
                </span>
              ) : null}
              {isTerminal ? (
                <span className="rounded-full bg-[#fce7e7] px-[8px] py-px text-[11px] text-[#d20b0b]">
                  终点
                </span>
              ) : null}
            </div>
            {summary ? (
              <p className="mt-[4px] text-[12px] text-[#858b9c]">{summary}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
