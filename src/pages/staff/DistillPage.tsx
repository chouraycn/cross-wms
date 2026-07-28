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

import Box from '@mui/material/Box';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/staff/ui/index.js';
import { notify } from '../../components/staff/ui/app-toast.js';
import {
  AGENT_SCOPE_CHANGE_EVENT,
  ENTERPRISE_AGENT_STORAGE_KEY,
} from '../../components/staff/lib/agent-scope-storage.js';
import { api, TENANT_ID, streamPost } from '../../components/staff/api/client.js';
import type { StreamEvent } from '../../components/staff/api/client.js';
import type { EnterpriseAuthUser } from '../../components/staff/auth.js';
import type {
  SkillRead,
  SkillCard,
  ToolRead,
  ModelConfigRead,
} from '../../components/staff/types/index.js';
import { distillTokens } from './distillTokens.js';

const REWRITE_MODEL_STORAGE_KEY = 'distill-rewrite-model';

const dialogInputSx = {
  width: '100%',
  minWidth: 0,
  height: '34px',
  borderRadius: '10px',
  border: '0.5px solid',
  borderColor: '#e3e7f1',
  bgcolor: '#fff',
  px: '10px',
  fontSize: '14px',
  color: '#18181a',
  boxShadow: 'none',
  outline: 'none',
  '&:focus-visible': { borderColor: '#18181a', boxShadow: 'none' },
};

const dialogCancelButtonSx = {
  height: '32px',
  minWidth: '80px',
  borderRadius: '10px',
  border: '1px solid',
  borderColor: '#e3e7f1',
  bgcolor: '#fff',
  px: '12px',
  fontSize: '14px',
  color: '#464c5e',
  cursor: 'pointer',
  textTransform: 'none',
  '&:hover': { borderColor: '#e3e7f1', bgcolor: '#f6f6f6', color: '#464c5e' },
};

const dialogSaveButtonSx = {
  height: '32px',
  minWidth: '80px',
  borderRadius: '10px',
  bgcolor: '#18181a',
  px: '12px',
  fontSize: '14px',
  color: '#fff',
  border: 0,
  cursor: 'pointer',
  textTransform: 'none',
  '&:hover': { bgcolor: '#303030' },
};

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
    () => window.localStorage.getItem(`${REWRITE_MODEL_STORAGE_KEY}:${TENANT_ID}`) || '',
  );
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDomain, setSaveDomain] = useState('');
  const [saveVersion, setSaveVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string>('');

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
          window.localStorage.setItem(`${REWRITE_MODEL_STORAGE_KEY}:${TENANT_ID}`, fallback);
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

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    setInput('');
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamPost(
        '/skills/distill/stream',
        {
          tenant_id: TENANT_ID,
          agent_id: activeAgentId || undefined,
          prompt: text,
          model_config_id: selectedRewriteModelId || undefined,
        },
        (item: StreamEvent) => {
          if (item.event === 'job_attached') {
            jobIdRef.current = (item.data.job_id as string) || '';
            return;
          }
          if (item.event === 'status' || item.event === 'chunk') {
            const delta = (item.data.text as string) || (item.data.content as string) || '';
            setMessages((prev) => {
              const next = prev.slice();
              const last = next[next.length - 1];
              if (last && last.id === assistantId) {
                next[next.length - 1] = { ...last, content: last.content + delta };
              }
              return next;
            });
            return;
          }
          if (item.event === 'chunk_reset') {
            setMessages((prev) => {
              const next = prev.slice();
              const last = next[next.length - 1];
              if (last && last.id === assistantId) next[next.length - 1] = { ...last, content: '' };
              return next;
            });
            return;
          }
          if (item.event === 'complete') {
            if (item.data.draft_skill) setDraft(item.data.draft_skill as SkillCard);
            setMessages((prev) => {
              const next = prev.slice();
              const last = next[next.length - 1];
              if (last && last.id === assistantId) next[next.length - 1] = { ...last, pending: false };
              return next;
            });
            return;
          }
          if (item.event === 'job_complete') {
            setMessages((prev) => {
              const next = prev.slice();
              const last = next[next.length - 1];
              if (last && last.id === assistantId) next[next.length - 1] = { ...last, pending: false };
              return next;
            });
            if ((item.data.status as string) === 'failed') {
              notify.error((item.data.error as string) || '蒸馏失败');
            }
          }
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        notify.error(error instanceof Error ? error.message : '蒸馏请求失败');
      }
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && last.id === assistantId) {
          next[next.length - 1] = { ...last, pending: false, content: last.content || '（蒸馏中断）' };
        }
        return next;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    if (jobIdRef.current) {
      api.post(`/skills/jobs/${jobIdRef.current}/cancel`, {}).catch(() => {});
    }
    abortRef.current?.abort();
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
    <Box sx={distillTokens.PAGE_CLASS} aria-busy={loading}>
      <AppHeader
        title={skillId ? `编辑 SOP：${loadedSkill?.name || skillId}` : '新建 SOP（蒸馏）'}
        description="通过对话引导生成结构化 SOP，并编辑节点 / 边 / 字段。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <Box
            component="button"
            type="button"
            sx={distillTokens.RETURN_BUTTON_CLASS}
            onClick={() => navigate('/staff/skills')}
          >
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            返回列表
          </Box>
        }
      />

      <Box sx={distillTokens.ACTIONS_CLASS}>
        <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
          <SelectTrigger style={{ width: '140px' }}>
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
            window.localStorage.setItem(`${REWRITE_MODEL_STORAGE_KEY}:${TENANT_ID}`, value);
          }}
        >
          <SelectTrigger style={{ width: '200px' }}>
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
        <Box
          component="button"
          type="button"
          sx={distillTokens.RETURN_BUTTON_CLASS}
          onClick={() => setClearConfirmOpen(true)}
        >
          <Trash2 style={{ width: '14px', height: '14px' }} />
          清空会话
        </Box>
        <Box
          component="button"
          type="button"
          sx={distillTokens.PRIMARY_BUTTON_CLASS}
          onClick={openSaveDialog}
          disabled={!draft}
        >
          <Save style={{ width: '14px', height: '14px' }} />
          保存 SOP
        </Box>
      </Box>

      <Box sx={distillTokens.WORKBENCH_CLASS}>
        <Box component="section" className="chat-card" sx={distillTokens.CARD_CLASS} aria-label="蒸馏对话">
          <Box
            component="header"
            sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: '12px', px: '6px' }}
          >
            <Box component="h3" sx={distillTokens.SECTION_CARD_TITLE_CLASS}>
              <Sparkles style={{ marginRight: '6px', display: 'inline', width: '14px', height: '14px', color: '#04756f' }} />
              蒸馏助手
            </Box>
            <Box component="span" sx={{ fontSize: '12px', color: '#858b9c' }}>{messages.length} 条消息</Box>
          </Box>
          <Box sx={distillTokens.CHAT_CARD_BODY_CLASS}>
            <Box sx={distillTokens.CHAT_PANEL_CLASS}>
              <Box ref={chatMessagesRef} sx={distillTokens.CHAT_MESSAGES_CLASS}>
                {messages.map((item) => (
                  <Box
                    key={item.id}
                    sx={[distillTokens.CHAT_ROW_BASE_CLASS, item.role === 'user' ? distillTokens.CHAT_ROW_USER_CLASS : {}]}
                  >
                    <Box
                      sx={[
                        distillTokens.CHAT_BUBBLE_BASE_CLASS,
                        item.role === 'user'
                          ? distillTokens.CHAT_BUBBLE_USER_CLASS
                          : distillTokens.CHAT_BUBBLE_ASSISTANT_CLASS,
                        item.role !== 'user' && item.pending ? { opacity: 0.7 } : {},
                      ]}
                    >
                      {item.content}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box sx={distillTokens.CHAT_COMPOSER_SHELL_CLASS}>
                <Box sx={distillTokens.CHAT_COMPOSER_CLASS}>
                  <Box
                    component="textarea"
                    value={input}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="描述你想要的 SOP 场景，回车发送，Shift+Enter 换行"
                    sx={distillTokens.CHAT_TEXTAREA_CLASS}
                    rows={4}
                  />
                  <Box sx={distillTokens.CHAT_ACTIONS_CLASS}>
                    <Box component="span" sx={{ fontSize: '12px', color: '#858b9c' }}>
                      {tools.length} 个工具可调用 · {modelConfigs.length} 个可用模型
                    </Box>
                    <Box sx={distillTokens.CHAT_ACTIONS_GROUP_CLASS}>
                      <Box
                        component="button"
                        type="button"
                        sx={distillTokens.RETURN_BUTTON_CLASS}
                        onClick={() => setInput('')}
                        disabled={!input || streaming}
                      >
                        清空
                      </Box>
                      {streaming ? (
                        <Box
                          component="button"
                          type="button"
                          sx={distillTokens.RETURN_BUTTON_CLASS}
                          onClick={stopStreaming}
                        >
                          停止
                        </Box>
                      ) : (
                        <Box
                          component="button"
                          type="button"
                          sx={distillTokens.PRIMARY_BUTTON_CLASS}
                          onClick={sendMessage}
                          disabled={!input.trim()}
                        >
                          <Send style={{ width: '14px', height: '14px' }} />
                          发送
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        <Box component="section" className="source-card" sx={distillTokens.SOURCE_CARD_CLASS} aria-label="SOP 草稿">
          <Box
            component="header"
            sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: '12px', px: '6px' }}
          >
            <Box component="h3" sx={distillTokens.SECTION_CARD_TITLE_CLASS}>
              {viewMode === 'source' ? (
                <Eye style={{ marginRight: '6px', display: 'inline', width: '14px', height: '14px', color: '#04756f' }} />
              ) : (
                <GitBranch style={{ marginRight: '6px', display: 'inline', width: '14px', height: '14px', color: '#04756f' }} />
              )}
              {viewMode === 'source' ? '字段视图' : '流程视图'}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#858b9c' }}>
              <Box component="span">{draft?.nodes?.length || 0} 节点</Box>
              <Box component="span">·</Box>
              <Box component="span">{draft?.edges?.length || 0} 边</Box>
            </Box>
          </Box>
          <Box sx={distillTokens.CARD_BODY_CLASS}>
            <Box sx={distillTokens.SOURCE_TOOLBAR_CLASS}>
              <Box component="span" sx={{ fontSize: '12px', color: '#464c5e' }}>
                {draft?.name || '未命名 SOP'}
              </Box>
              <Box component="span" sx={{ fontSize: '12px', color: '#858b9c' }}>
                {draft?.version || '0.1.0'}
              </Box>
            </Box>
            {isEmptyDraft ? (
              <Box sx={distillTokens.SOURCE_EMPTY_STATE_CLASS}>
                <Plus style={{ width: '24px', height: '24px', color: '#858b9c' }} />
                <Box component="p" sx={distillTokens.SOURCE_EMPTY_TEXT_CLASS}>
                  暂无 SOP 草稿。在左侧描述你的需求，蒸馏助手将自动生成节点与字段。
                </Box>
              </Box>
            ) : viewMode === 'source' ? (
              <SourceView draft={draft!} />
            ) : (
              <FlowView draft={draft!} />
            )}
          </Box>
        </Box>
      </Box>

      <Dialog open={saveOpen} onOpenChange={(open) => !saving && setSaveOpen(open)}>
        <DialogContent style={{ overflow: 'hidden', borderRadius: '16px' }} sx={{ p: 0 }}>
          <DialogTitle
            sx={{ m: 0, px: '24px', pt: '20px', pb: '12px', fontSize: '16px', fontWeight: 500, color: '#18181a' }}
          >
            保存 SOP
          </DialogTitle>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px', px: '24px', pb: '20px' }}>
            <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="span" sx={{ fontSize: '12px', color: '#464c5e' }}>名称</Box>
              <Box
                component="input"
                type="text"
                value={saveName}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSaveName(event.target.value)}
                sx={dialogInputSx}
              />
            </Box>
            <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="span" sx={{ fontSize: '12px', color: '#464c5e' }}>业务域</Box>
              <Box
                component="input"
                type="text"
                value={saveDomain}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSaveDomain(event.target.value)}
                sx={dialogInputSx}
              />
            </Box>
            <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="span" sx={{ fontSize: '12px', color: '#464c5e' }}>版本</Box>
              <Box
                component="input"
                type="text"
                value={saveVersion}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSaveVersion(event.target.value)}
                sx={dialogInputSx}
              />
            </Box>
          </Box>
          <DialogFooter
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              borderTop: '1px solid',
              borderColor: '#f2f3f7',
              px: '24px',
              py: '12px',
            }}
          >
            <Box
              component="button"
              type="button"
              sx={dialogCancelButtonSx}
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              取消
            </Box>
            <Box
              component="button"
              type="button"
              sx={dialogSaveButtonSx}
              onClick={() => void confirmSave()}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </Box>
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
    </Box>
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
    <Box sx={{ display: 'grid', minHeight: 0, flex: 1, alignContent: 'flex-start', gap: '14px', overflowY: 'auto', pr: '8px' }}>
      {fields.map((field) => (
        <Box
          key={field.label}
          sx={{
            display: 'grid',
            gridTemplateColumns: '132px minmax(0,1fr)',
            alignItems: 'flex-start',
            gap: '10px',
            borderRadius: '10px',
            border: '1px solid',
            borderColor: '#eceef1',
            bgcolor: '#fff',
            p: '12px',
          }}
        >
          <Box component="span" sx={{ fontSize: '12px', fontWeight: 600, color: '#858b9c' }}>{field.label}</Box>
          <Box component="span" sx={{ minWidth: 0, whiteSpace: 'pre-wrap', fontSize: '13px', color: '#18181a' }}>
            {field.value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Flow view (流程视图) — 渲染节点与边
// ---------------------------------------------------------------------------

function FlowView({ draft }: { draft: SkillCard }) {
  if (!draft.nodes || draft.nodes.length === 0) {
    return (
      <Box sx={distillTokens.SOURCE_EMPTY_STATE_CLASS}>
        <GitBranch style={{ width: '24px', height: '24px', color: '#858b9c' }} />
        <Box component="p" sx={distillTokens.SOURCE_EMPTY_TEXT_CLASS}>暂无节点</Box>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'grid', minHeight: 0, flex: 1, gap: '12px', overflowY: 'auto', pr: '8px' }}>
      {draft.nodes.map((node, index) => {
        const nodeId = String(node.id || `node-${index}`);
        const title = String(node.title || node.label || nodeId);
        const summary = String(node.summary || node.description || '');
        const isStart = draft.start_node_id === nodeId;
        const isTerminal = draft.terminal_node_ids?.includes(nodeId) ?? false;
        return (
          <Box
            key={nodeId}
            sx={{
              borderRadius: '10px',
              border: '1px solid',
              borderColor: '#eceef1',
              bgcolor: '#fff',
              p: '14px',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Box component="span" sx={{ fontSize: '13px', fontWeight: 600, color: '#18181a' }}>{title}</Box>
              {isStart ? (
                <Box component="span" sx={{ borderRadius: '9999px', bgcolor: '#e9f7ef', px: '8px', py: '1px', fontSize: '11px', color: '#2cb360' }}>
                  起点
                </Box>
              ) : null}
              {isTerminal ? (
                <Box component="span" sx={{ borderRadius: '9999px', bgcolor: '#fce7e7', px: '8px', py: '1px', fontSize: '11px', color: '#d20b0b' }}>
                  终点
                </Box>
              ) : null}
            </Box>
            {summary ? (
              <Box component="p" sx={{ mt: '4px', fontSize: '12px', color: '#858b9c' }}>{summary}</Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
