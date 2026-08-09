import { User } from './icons.js';
import { X as XIcon, Sparkles, Cpu, Check, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  Button as UIButton,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  notify,
} from './ui/index.js';
import Box from '@mui/material/Box';
import { staffTokens } from './lib/staffTokens.js';
import { api, TENANT_ID } from './api/client.js';
import type { EnterpriseAuthUser } from './auth.js';
import { employeeDisplayName, employeeProfile } from './employee.js';
import type { AgentProfileRead } from './types/index.js';
import EmployeeAvatar from './EmployeeAvatar.js';

// ===================== 模型提示类型（对应后端 GET /agents/:id/model-hints） =====================

type DimensionScores = {
  media: number;
  contextLength: number;
  intent: number;
  code: number;
  toolCall: number;
  intentMethod?: string;
};

/** 仅取数值维度，排除 intentMethod 字符串字段 */
type NumericDimensionKey = 'media' | 'contextLength' | 'intent' | 'code' | 'toolCall';

type ModelRecommendation = {
  modelId: string;
  modelName: string;
  reason: string;
  reasonType: 'tier1' | 'tier2' | 'tier3' | 'vision' | 'code' | 'fallback';
  scores?: DimensionScores;
  totalScore?: number;
  matchedStaffModelConfigId?: string | null;
};

type CurrentBinding = {
  id: string;
  role: string;
  model_config_id: string;
  model_name: string | null;
  model_ref: string | null;
  enabled: boolean;
};

type AvailableModel = {
  id: string;
  name: string;
  model: string;
  api_protocol: string;
  is_default: boolean;
};

type ModelHintData = {
  recommendation: ModelRecommendation | null;
  currentBindings: CurrentBinding[];
  availableModels: AvailableModel[];
  simulatedMessage: string;
};

const DIMENSION_LABELS: Array<{ key: NumericDimensionKey; label: string; weight: string }> = [
  { key: 'media', label: '媒体类型', weight: '10%' },
  { key: 'contextLength', label: '上下文长度', weight: '30%' },
  { key: 'intent', label: '意图', weight: '40%' },
  { key: 'code', label: '代码特征', weight: '20%' },
  { key: 'toolCall', label: '工具调用', weight: '额外' },
];

const REASON_TYPE_LABELS: Record<ModelRecommendation['reasonType'], string> = {
  tier1: '轻量层',
  tier2: '均衡层',
  tier3: '强推理层',
  vision: '多模态层',
  code: '代码专用层',
  fallback: '默认兜底',
};

type EmployeeProfileFormValues = {
  name: string;
  roleName: string;
  onboardedAt: string;
  description: string;
  personaPrompt: string;
  systemPromptSummary: string;
  workStyles: string[];
  expertiseTags: string[];
  workModes: string[];
  status: 'active' | 'archived';
  publishedToGallery: boolean;
};

const STYLE_OPTIONS = ['目标明确', '证据优先', '动作可追溯', '事实先行', '流程推进', '风险克制', '及时追问'];
const EXPERTISE_OPTIONS = ['业务问答', 'SOP 执行', '工具调用', '代码检索', '报销核对', '事务跟进', '资料维护'];
const WORK_MODE_OPTIONS = ['识别意图', '补齐信息', '调用 SOP', '查询资料', '执行并复盘', '确认后执行', '必要时转人工'];

const BLANK_FORM: EmployeeProfileFormValues = {
  name: '',
  roleName: '',
  onboardedAt: '',
  description: '',
  personaPrompt: '',
  systemPromptSummary: '',
  workStyles: [],
  expertiseTags: [],
  workModes: [],
  status: 'active',
  publishedToGallery: false,
};

export type EmployeeProfileEditorProps = {
  agent?: AgentProfileRead | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (agent: AgentProfileRead) => void;
  currentUser?: EnterpriseAuthUser;
};

export default function EmployeeProfileEditor({
  agent,
  open,
  onClose,
  onSaved,
  currentUser,
}: EmployeeProfileEditorProps) {
  const [form, setForm] = useState<EmployeeProfileFormValues>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const profile = useMemo(() => employeeProfile(agent), [agent]);

  // 模型提示相关状态
  const [hintData, setHintData] = useState<ModelHintData | null>(null);
  const [loadingHints, setLoadingHints] = useState(false);
  // 待保存的模型绑定：role -> model_config_id（空串表示清除）
  const [pendingBindings, setPendingBindings] = useState<Record<string, string>>({});
  const [bindingsDirty, setBindingsDirty] = useState(false);

  const update = (patch: Partial<EmployeeProfileFormValues>) => setForm((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!open || !agent) return;
    setForm({
      name: employeeDisplayName(agent),
      roleName: profile.roleName === '待补充岗位' ? '' : profile.roleName,
      onboardedAt: profile.onboardedAt === '-' ? new Date().toISOString().slice(0, 10) : profile.onboardedAt,
      description: agent.description || '',
      personaPrompt: agent.persona_prompt || '',
      systemPromptSummary: typeof agent.metadata?.system_prompt_summary === 'string' ? agent.metadata.system_prompt_summary : '',
      workStyles: profile.workStyles,
      expertiseTags: profile.expertiseTags,
      workModes: profile.workModes,
      status: agent.status === 'archived' ? 'archived' : 'active',
      publishedToGallery: agent.metadata?.published_to_gallery === true,
    });
    // 拉取模型提示
    setLoadingHints(true);
    setHintData(null);
    setBindingsDirty(false);
    api
      .get<ModelHintData>(`/agents/${agent.id}/model-hints`)
      .then((data) => {
        setHintData(data);
        // 初始化 pendingBindings：从 currentBindings 取 primary/default
        const init: Record<string, string> = {};
        for (const b of data.currentBindings) {
          if (b.role === 'primary' || b.role === 'default') {
            init[b.role] = b.model_config_id;
          }
        }
        setPendingBindings(init);
      })
      .catch(() => {
        // 模型提示加载失败不阻断编辑（可能后端无模型配置）
        setHintData(null);
      })
      .finally(() => setLoadingHints(false));
  }, [agent, open, profile]);

  async function save() {
    if (!agent) return;
    if (!form.name.trim()) {
      notify.error('请输入数字员工姓名');
      return;
    }
    setSaving(true);
    try {
      const wasPublished = agent.metadata?.published_to_gallery === true;
      const metadata: Record<string, any> = {
        ...(agent.metadata || {}),
        blank_onboarding: false,
        role_name: form.roleName.trim() || '待补充岗位',
        onboarded_at: form.onboardedAt || new Date().toISOString().slice(0, 10),
        system_prompt_summary: form.systemPromptSummary.trim(),
        work_styles: compactTags(form.workStyles),
        expertise_tags: compactTags(form.expertiseTags),
        work_modes: compactTags(form.workModes),
        published_to_gallery: form.publishedToGallery,
      };
      if (form.publishedToGallery && !wasPublished) {
        metadata.gallery_published_at = new Date().toISOString();
        metadata.gallery_published_by = currentUser?.username;
      }
      if (!form.publishedToGallery) {
        delete metadata.gallery_published_at;
        delete metadata.gallery_published_by;
      }

      // 调用 api.put 更新员工档案（api 已带 /api/staffdeck 前缀，路径用 /agents/:id）
      const saved = await api.put<AgentProfileRead>(`/agents/${agent.id}`, {
        tenant_id: TENANT_ID,
        name: form.name.trim(),
        description: form.description.trim(),
        persona_prompt: form.personaPrompt.trim(),
        status: form.status,
        metadata,
      });

      // 若模型绑定有变更，同步保存（PUT /agents/:id/models）
      if (bindingsDirty) {
        const bindings: Array<{ role: string; model_config_id: string }> = [];
        for (const role of ['primary', 'default']) {
          const cfgId = pendingBindings[role];
          if (cfgId) {
            bindings.push({ role, model_config_id: cfgId });
          }
        }
        // 只有有绑定项时才调用，避免空数组清空所有绑定（如需清除可单独处理）
        if (bindings.length > 0) {
          await api.put(`/agents/${agent.id}/models`, { tenant_id: TENANT_ID, bindings });
        }
        setBindingsDirty(false);
      }

      notify.success('数字员工档案已更新');
      onSaved?.(saved);
      onClose();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存数字员工档案失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="employee-profile-modal"
        sx={{
          position: 'relative',
          display: 'flex',
          maxHeight: 'calc(100dvh - 4rem)',
          width: 'calc(100% - 2rem)',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
          borderRadius: '14px',
          px: '20px',
          py: '16px',
          '@media (min-width: 640px)': { maxWidth: '860px' },
        }}
      >
        <DialogTitle sx={{ px: '12px', fontSize: '14px', fontWeight: 400, lineHeight: 'none', color: 'var(--muted-foreground)' }}>
          {agent ? `编辑数字员工档案：${employeeDisplayName(agent)}` : '编辑数字员工档案'}
        </DialogTitle>

        <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto', px: '12px' }}>
          <div className="employee-profile-editor">
            <div className="employee-profile-preview">
              <EmployeeAvatar agent={agent} size={92} />
              <div>
                <Box
                  component="span"
                  sx={{ margin: 0, display: 'block', fontSize: '12px', color: 'var(--muted-foreground)' }}
                >
                  数字员工档案
                </Box>
                <Box
                  component="h4"
                  sx={{ mt: '4px', mb: '6px', fontSize: '18px', fontWeight: 600, color: 'var(--foreground)' }}
                >
                  {agent ? employeeDisplayName(agent) : '数字员工'}
                </Box>
                <Box
                  component="span"
                  sx={{ margin: 0, display: 'block', fontSize: '12px', color: 'var(--muted-foreground)' }}
                >
                  {profile.roleName}
                </Box>
              </div>
              <span className="employee-profile-preview-icon">
                <Box component={User} sx={{ width: '100%', height: '100%' }} />
              </span>
            </div>

            <Box
              className="employee-profile-form"
              sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div className="employee-profile-form-grid">
                <LabeledField label="数字员工姓名">
                  <Input value={form.name} placeholder="例如：默认员工" onChange={(event) => update({ name: event.target.value })} />
                </LabeledField>
                <LabeledField label="岗位">
                  <Input value={form.roleName} placeholder="例如：研发" onChange={(event) => update({ roleName: event.target.value })} />
                </LabeledField>
                <LabeledField label="入职时间">
                  <Input type="date" value={form.onboardedAt} onChange={(event) => update({ onboardedAt: event.target.value })} />
                </LabeledField>
                <LabeledField label="工作状态">
                  <Select value={form.status} onValueChange={(value) => update({ status: value as 'active' | 'archived' })}>
                    <SelectTrigger sx={{ width: '100%' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">在线</SelectItem>
                      <SelectItem value="archived">下线</SelectItem>
                    </SelectContent>
                  </Select>
                </LabeledField>
              </div>

              <LabeledField label="岗位描述">
                <Textarea rows={3} value={form.description} placeholder="概括这个数字员工的岗位边界、服务风格和执行重点" onChange={(event) => update({ description: event.target.value })} />
              </LabeledField>
              <LabeledField label="看板摘要">
                <Textarea rows={2} value={form.systemPromptSummary} placeholder="用于数字员工档案页顶部展示的 system prompt 摘要" onChange={(event) => update({ systemPromptSummary: event.target.value })} />
              </LabeledField>
              <LabeledField label="岗位执行约束">
                <Textarea rows={4} value={form.personaPrompt} placeholder="员工在对话中的角色、人设、回复风格和执行边界" onChange={(event) => update({ personaPrompt: event.target.value })} />
              </LabeledField>

              {/* 模型配置区块 — 整合 5 维度评分模型提示能力 */}
              <ModelConfigSection
                loading={loadingHints}
                hintData={hintData}
                pendingBindings={pendingBindings}
                onBindingChange={(role, cfgId) => {
                  setPendingBindings((prev) => ({ ...prev, [role]: cfgId }));
                  setBindingsDirty(true);
                }}
                onApplyRecommendation={(cfgId) => {
                  setPendingBindings((prev) => ({ ...prev, primary: cfgId }));
                  setBindingsDirty(true);
                  notify.success('已应用推荐模型到主模型，保存后生效');
                }}
              />

              <div className="employee-profile-form-grid is-tags">
                <LabeledField label="掌握方向">
                  <TagsField value={form.expertiseTags} options={EXPERTISE_OPTIONS} placeholder="输入后回车添加" onChange={(next) => update({ expertiseTags: next })} />
                </LabeledField>
                <LabeledField label="工作风格">
                  <TagsField value={form.workStyles} options={STYLE_OPTIONS} placeholder="输入后回车添加" onChange={(next) => update({ workStyles: next })} />
                </LabeledField>
                <LabeledField label="工作模式">
                  <TagsField value={form.workModes} options={WORK_MODE_OPTIONS} placeholder="输入后回车添加" onChange={(next) => update({ workModes: next })} />
                </LabeledField>
              </div>

              <div className="employee-profile-publish">
                <div>
                  <Box component="strong" sx={{ fontSize: '13px', color: 'var(--foreground)' }}>
                    发布到广场
                  </Box>
                  <Box
                    component="p"
                    sx={{ margin: 0, mt: '4px', fontSize: '12px', color: 'var(--muted-foreground)' }}
                  >
                    开启后，其他账号可以在对话端和数字员工广场中选择这个员工。
                  </Box>
                </div>
                <Switch checked={form.publishedToGallery} onCheckedChange={(next) => update({ publishedToGallery: next })} />
              </div>
            </Box>
          </div>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', px: '12px' }}>
          <UIButton
            variant="outline"
            disabled={saving}
            onClick={onClose}
            sx={staffTokens.dialogCancelButton}
          >
            取消
          </UIButton>
          <UIButton
            disabled={saving}
            onClick={() => void save()}
            sx={staffTokens.dialogPrimaryButton}
          >
            保存
          </UIButton>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Box component="span" sx={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink-soft)' }}>
        {label}
      </Box>
      {children}
    </Box>
  );
}

function TagsField({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string[];
  options: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const addTags = (raw: string) => {
    const parts = raw.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])));
    setDraft('');
  };
  const removeTag = (tag: string) => onChange(value.filter((item) => item !== tag));
  const suggestions = options.filter((item) => !value.includes(item));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Box
        sx={{
          display: 'flex',
          minHeight: '34px',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '10px',
          border: '0.5px solid',
          borderColor: 'var(--border)',
          bgcolor: '#fff',
          px: '8px',
          py: '5px',
          transition: 'background-color 0.15s, color 0.15s',
          '&:focus-within': { borderColor: 'var(--foreground)' },
        }}
      >
        {value.map((tag) => (
          <Box
            component="span"
            key={tag}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '6px',
              bgcolor: 'var(--surface-muted)',
              px: '8px',
              py: '2px',
              fontSize: '12px',
              color: 'var(--foreground)',
            }}
          >
            {tag}
            <Box
              component="button"
              type="button"
              aria-label={`移除 ${tag}`}
              onClick={() => removeTag(tag)}
              sx={{
                display: 'grid',
                placeItems: 'center',
                color: '#858b9c',
                '&:hover': { color: 'var(--foreground)' },
              }}
            >
              <Box component={XIcon} sx={{ width: '12px', height: '12px' }} />
            </Box>
          </Box>
        ))}
        <Box
          component="input"
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
              event.preventDefault();
              addTags(draft);
            } else if (event.key === 'Backspace' && !draft && value.length) {
              removeTag(value[value.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && addTags(draft)}
          sx={{
            height: '22px',
            minWidth: '80px',
            flex: 1,
            bgcolor: 'transparent',
            fontSize: '12px',
            color: '#17191f',
            outline: 'none',
            border: 0,
            '&::placeholder': { color: '#c0c6d4' },
          }}
        />
      </Box>
      {suggestions.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {suggestions.map((item) => (
            <Box
              component="button"
              type="button"
              key={item}
              onClick={() => addTags(item)}
              sx={{
                borderRadius: '6px',
                border: '0.5px solid',
                borderColor: 'var(--border)',
                px: '8px',
                py: '2px',
                fontSize: '12px',
                color: '#858b9c',
                '&:hover': { borderColor: 'var(--foreground)', color: 'var(--foreground)' },
              }}
            >
              + {item}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function compactTags(values: string[] | undefined): string[] {
  return Array.from(new Set((values || []).map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

// ===================== 模型配置区块 =====================

function ModelConfigSection({
  loading,
  hintData,
  pendingBindings,
  onBindingChange,
  onApplyRecommendation,
}: {
  loading: boolean;
  hintData: ModelHintData | null;
  pendingBindings: Record<string, string>;
  onBindingChange: (role: string, cfgId: string) => void;
  onApplyRecommendation: (cfgId: string) => void;
}) {
  // 无可绑定模型时，整块隐藏（后端可能未配置 sd_model_configs）
  const hasAvailable = (hintData?.availableModels?.length ?? 0) > 0;
  if (!loading && !hintData) return null;
  if (!loading && hintData && !hasAvailable) return null;

  const rec = hintData?.recommendation ?? null;
  const scores = rec?.scores;
  const totalScore = rec?.totalScore;

  return (
    <Box
      sx={{
        borderRadius: '10px',
        border: '0.5px solid',
        borderColor: 'var(--border)',
        bgcolor: 'var(--surface-muted, #fafafa)',
        p: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Box component={Cpu} sx={{ width: '14px', height: '14px', color: 'var(--foreground)' }} />
        <Box component="span" sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
          模型配置
        </Box>
        <Box component="span" sx={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
          为该员工绑定专属模型，未绑定时自动回落全局智能选型
        </Box>
      </Box>

      {/* 智能推荐卡片 */}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          <Box component={RefreshCw} sx={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />
          正在基于员工 persona 与技能分析推荐模型…
        </Box>
      ) : rec ? (
        <Box
          sx={{
            borderRadius: '8px',
            border: '0.5px solid var(--border)',
            bgcolor: '#fff',
            p: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Box component={Sparkles} sx={{ width: '13px', height: '13px', color: '#7c3aed' }} />
            <Box component="span" sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
              智能推荐：{rec.modelName}
            </Box>
            <Box
              component="span"
              sx={{
                fontSize: '10px',
                px: '5px',
                py: '1px',
                borderRadius: '4px',
                bgcolor: '#e0ebff',
                color: '#1e3a8a',
                whiteSpace: 'nowrap',
              }}
            >
              {REASON_TYPE_LABELS[rec.reasonType] ?? rec.reasonType}
            </Box>
            {typeof totalScore === 'number' && (
              <Box component="span" sx={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                总评分 {totalScore.toFixed(1)}/10
              </Box>
            )}
          </Box>

          <Box component="p" sx={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            {rec.reason}
          </Box>

          {/* 5 维度评分条 */}
          {scores && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {DIMENSION_LABELS.map(({ key, label, weight }) => {
                const v = scores[key] ?? 0;
                return (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Box component="span" sx={{ fontSize: '10px', color: 'var(--muted-foreground)', width: '72px', flexShrink: 0 }}>
                      {label}
                      <Box component="span" sx={{ ml: '2px', color: '#c0c6d4' }}>{weight}</Box>
                    </Box>
                    <Box
                      sx={{
                        flex: 1,
                        height: '4px',
                        borderRadius: '2px',
                        bgcolor: '#f0f0f0',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${Math.min(100, (v / 10) * 100)}%`,
                          height: '100%',
                          bgcolor: v >= 7 ? '#059669' : v >= 4 ? '#ea580c' : '#9ca3af',
                          transition: 'width 0.3s',
                        }}
                      />
                    </Box>
                    <Box component="span" sx={{ fontSize: '10px', color: 'var(--foreground)', width: '24px', textAlign: 'right' }}>
                      {v.toFixed(1)}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* 一键应用推荐 */}
          {rec.matchedStaffModelConfigId && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Box
                component="button"
                type="button"
                onClick={() => onApplyRecommendation(rec.matchedStaffModelConfigId!)}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: '#1e3a8a',
                  border: '0.5px solid #c7d2fe',
                  borderRadius: '6px',
                  px: '8px',
                  py: '3px',
                  cursor: 'pointer',
                  bgcolor: '#fff',
                  '&:hover': { bgcolor: '#e0ebff' },
                }}
              >
                <Box component={Check} sx={{ width: '11px', height: '11px' }} />
                设为主模型
              </Box>
            </Box>
          )}
        </Box>
      ) : null}

      {/* 模型绑定下拉（primary / default） */}
      {hintData && hasAvailable && (
        <div className="employee-profile-form-grid">
          <BindingSelectField
            label="主模型（primary）"
            tooltip="对话执行时优先使用此模型"
            value={pendingBindings.primary ?? ''}
            options={hintData.availableModels}
            onChange={(cfgId) => onBindingChange('primary', cfgId)}
          />
          <BindingSelectField
            label="默认模型（default）"
            tooltip="主模型不可用时回落到此模型"
            value={pendingBindings.default ?? ''}
            options={hintData.availableModels}
            onChange={(cfgId) => onBindingChange('default', cfgId)}
          />
        </div>
      )}
    </Box>
  );
}

function BindingSelectField({
  label,
  tooltip,
  value,
  options,
  onChange,
}: {
  label: string;
  tooltip: string;
  value: string;
  options: AvailableModel[];
  onChange: (cfgId: string) => void;
}) {
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Box component="span" sx={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink-soft)' }}>
        {label}
        <Box component="span" sx={{ ml: '4px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
          {tooltip}
        </Box>
      </Box>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger sx={{ width: '100%' }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">未绑定（跟随全局）</SelectItem>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
              {m.is_default ? '（默认）' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Box>
  );
}
