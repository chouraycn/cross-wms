import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, FlaskConical, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';

import { api, TENANT_ID } from '../../components/staff/api/client.js';
import type { EnterpriseAuthUser } from '../../components/staff/auth.js';
import AppHeader from '../../components/staff/AppHeader.js';
import { DataTable, type DataTableColumn } from '../../components/staff/DataTable.js';
import { Paginator } from '../../components/staff/Paginator.js';
import { StatCard } from '../../components/staff/StatCard.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '../../components/staff/ui/index.js';
import { Button as UIButton } from '../../components/staff/ui/button.js';
import { notify } from '../../components/staff/ui/app-toast.js';
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from '../../components/staff/lib/enterprise-ui.js';
import { staffTokens } from '../../components/staff/lib/staffTokens.js';
import { Box } from '@mui/material';
import type { SxProps } from '@mui/material/styles';
import { StatusBadge } from './scheduled-tasks/StatusBadge.js';
import type { ModelConfigRead } from '../../components/staff/types/index.js';

// NOTE: 与 QuickStartGuide 约定的事件名保持一致
const OPEN_MODEL_CREATE_EVENT = 'ultrarag-enterprise-open-model-create';
const MODEL_CONFIGS_UPDATED_EVENT = 'ultrarag-enterprise-model-configs-updated';
const MODEL_PAGE_SIZE = 8;

type ModelForm = {
  name: string;
  api_protocol: 'openai_chat_completions' | 'anthropic_messages' | 'gemini_generate_content';
  base_url: string;
  model: string;
  api_key: string;
  temperature: string;
  max_output_tokens: string;
  extra_body: string;
  is_default: boolean;
  enabled: boolean;
};

const BLANK_MODEL_FORM: ModelForm = {
  name: '',
  api_protocol: 'openai_chat_completions',
  base_url: '',
  model: '',
  api_key: '',
  temperature: '0.2',
  max_output_tokens: '8192',
  extra_body: '{}',
  is_default: false,
  enabled: true,
};

export default function ModelsPage({
  currentUser,
  onLogout,
}: {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
} = {}) {
  const [rows, setRows] = useState<ModelConfigRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selected, setSelected] = useState<ModelConfigRead | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const testingModelIdsRef = useRef(new Set<string>());
  const [testingModelIds, setTestingModelIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<ModelForm>(BLANK_MODEL_FORM);
  const [availableProtocols, setAvailableProtocols] = useState<ModelForm['api_protocol'][]>(['openai_chat_completions']);
  const [page, setPage] = useState(1);

  const updateForm = <K extends keyof ModelForm>(key: K, value: ModelForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    return api
      .get<ModelConfigRead[]>(`/model-configs?tenant_id=${TENANT_ID}`)
      .then((items) => {
        setRows(items);
        window.dispatchEvent(new CustomEvent(MODEL_CONFIGS_UPDATED_EVENT, { detail: { models: items } }));
      })
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载模型失败'))
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  };

  useEffect(() => {
    void load();
    void api
      .get<{ protocols: ModelForm['api_protocol'][] }>(`/model-configs/protocols?tenant_id=${TENANT_ID}`)
      .then((result) => setAvailableProtocols(result.protocols));
  }, []);

  useEffect(() => {
    const openCreate = () => createBlank();
    window.addEventListener(OPEN_MODEL_CREATE_EVENT, openCreate);
    return () => window.removeEventListener(OPEN_MODEL_CREATE_EVENT, openCreate);
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.name, row.model, row.api_protocol, row.base_url || ''].some((value) =>
        (value || '').toLowerCase().includes(keyword),
      ),
    );
  }, [rows, searchText]);

  useEffect(() => {
    setPage(1);
  }, [searchText]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / MODEL_PAGE_SIZE));
  const pagedItems = useMemo(
    () => filteredRows.slice((page - 1) * MODEL_PAGE_SIZE, page * MODEL_PAGE_SIZE),
    [filteredRows, page],
  );

  const enabledCount = rows.filter((item) => item.enabled).length;
  const defaultRow = rows.find((item) => item.is_default);
  const providerCount = new Set(rows.map((item) => item.api_protocol).filter(Boolean)).size;

  function edit(row: ModelConfigRead) {
    setSelected(row);
    setForm({
      name: row.name,
      api_protocol: row.api_protocol,
      base_url: row.base_url || '',
      model: row.model,
      api_key: '',
      temperature: String(row.temperature),
      max_output_tokens: String(row.max_output_tokens),
      extra_body: JSON.stringify(row.extra_body || {}, null, 2),
      is_default: row.is_default,
      enabled: row.enabled,
    });
    setEditorOpen(true);
  }

  function createBlank() {
    setSelected(null);
    setForm(BLANK_MODEL_FORM);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setSelected(null);
  }

  async function save() {
    const name = form.name.trim();
    const model = form.model.trim();
    if (!name || !model) {
      notify.error('请填写名称和 Model');
      return;
    }
    const temperature = Number(form.temperature);
    const maxOutputTokens = Number(form.max_output_tokens);
    if (Number.isNaN(temperature) || Number.isNaN(maxOutputTokens)) {
      notify.error('Temperature 与 Max Tokens 必须是数字');
      return;
    }
    let extraBody: Record<string, unknown>;
    try {
      const parsed = JSON.parse(form.extra_body.trim() || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      extraBody = parsed as Record<string, unknown>;
    } catch {
      notify.error('额外参数必须是合法的 JSON 对象');
      return;
    }
    const payload = {
      tenant_id: TENANT_ID,
      name,
      api_protocol: form.api_protocol,
      base_url: form.base_url.trim() || undefined,
      model,
      temperature,
      max_output_tokens: maxOutputTokens,
      extra_body: extraBody,
      is_default: form.is_default,
      enabled: form.enabled,
      api_key: form.api_key || undefined,
    };
    setSaving(true);
    try {
      if (selected) {
        await api.put(`/model-configs/${selected.id}`, payload);
      } else {
        await api.post('/model-configs', payload);
      }
      notify.success('已保存');
      setEditorOpen(false);
      setSelected(null);
      setForm(BLANK_MODEL_FORM);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(row: ModelConfigRead) {
    try {
      await api.post(`/model-configs/${row.id}/set-default?tenant_id=${TENANT_ID}`);
      notify.success('已设为默认');
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '设为默认失败');
    }
  }

  async function test(row: ModelConfigRead) {
    if (testingModelIdsRef.current.has(row.id)) return;
    testingModelIdsRef.current.add(row.id);
    setTestingModelIds(new Set(testingModelIdsRef.current));
    try {
      const result = await api.post<{ success: boolean; message: string; output?: string; activated: boolean }>(
        `/model-configs/${row.id}/test?tenant_id=${TENANT_ID}&activate_if_initial=true`,
      );
      if (result.success) {
        notify.success(
          result.activated
            ? '测试通过，已启用并设为默认模型'
            : result.output || result.message,
        );
      } else if (result.message === 'MODEL_VERIFICATION_STALE') {
        notify.warning('模型配置或测试状态已发生变化，本次结果未生效，请刷新后重新测试');
      } else {
        notify.error(result.message);
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '测试失败');
    } finally {
      await load(false);
      testingModelIdsRef.current.delete(row.id);
      setTestingModelIds(new Set(testingModelIdsRef.current));
    }
  }

  function renderActions(row: ModelConfigRead) {
    const isTesting = testingModelIds.has(row.id);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Box
            component="button"
            type="button"
            aria-label={isTesting ? `${row.name} 正在测试` : '模型操作'}
            sx={{
              ml: 'auto',
              display: 'grid',
              width: '28px',
              height: '28px',
              placeItems: 'center',
              borderRadius: '8px',
              color: '#1a71ff',
              transition: 'background-color 0.15s',
              outline: 'none',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.05)', color: '#4a8dff' },
              '&:focus-visible': { bgcolor: 'rgba(0,0,0,0.05)' },
            }}
          >
            {isTesting ? <LoaderCircle size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
          </Box>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={MENU_CONTENT_CLASS}>
          <DropdownMenuItem className={MENU_ITEM_CLASS} disabled={isTesting} onSelect={() => edit(row)}>
            <Pencil />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            className={MENU_ITEM_CLASS}
            disabled={isTesting || row.is_default}
            onSelect={() => void setDefault(row)}
          >
            <Check />
            {row.is_default ? '已默认' : '设为默认'}
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM_CLASS} disabled={isTesting} onSelect={() => void test(row)}>
            {isTesting ? <LoaderCircle className="animate-spin" /> : <FlaskConical />}
            {isTesting ? '正在测试' : '测试'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: DataTableColumn<ModelConfigRead>[] = [
    {
      key: 'name',
      title: '名称',
      width: 240,
      className: 'text-[#18181a]',
      render: (row) => (
        <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: '2px' }}>
          <Box component="span" sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '6px' }}>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, lineHeight: '18px', color: 'text.primary' }}>{row.name}</Box>
            {row.is_default && <StatusBadge tone="green">默认</StatusBadge>}
          </Box>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: 'text.secondary' }}>
            {row.enabled ? '已启用' : '已停用'} · {row.api_protocol}
          </Box>
        </Box>
      ),
    },
    { key: 'model', title: '模型', width: 180, render: (row) => <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.model}</Box> },
    {
      key: 'base_url',
      title: 'Base URL',
      className: 'whitespace-normal',
      render: (row) => (
        <Box component="span" sx={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', fontSize: '12px', color: 'text.secondary' }}>
          {row.base_url || '-'}
        </Box>
      ),
    },
    {
      key: 'api_key',
      title: 'API Key',
      width: 180,
      render: (row) => (
        <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px', color: 'text.secondary' }}>
          {row.api_key_masked || '-'}
        </Box>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 70,
      align: 'right',
      render: (row) => renderActions(row),
    },
  ];

  const renderMobileCard = (row: ModelConfigRead) => (
    <Box component="article" sx={staffTokens.mobileCard} key={row.id}>
      <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '6px' }}>
            <Box component="strong" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>{row.name}</Box>
            {row.is_default && <StatusBadge tone="green">默认</StatusBadge>}
          </Box>
          <Box component="span" sx={{ mt: '2px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: 'text.secondary' }}>
            {row.enabled ? '已启用' : '已停用'} · {row.api_protocol}
          </Box>
        </Box>
        {renderActions(row)}
      </Box>
      <Box component="p" sx={{ mt: '8px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', fontSize: '12px', color: 'text.secondary' }}>{row.model}</Box>
      <Box component="p" sx={{ mt: '4px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: '12px', color: 'text.secondary' }}>
        {row.api_key_masked || '-'}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100%', boxSizing: 'border-box', px: '48px', pt: '32px', pb: '43px', '@media (max-width:900px)': { px: '16px' } }}>
      <AppHeader onLogout={onLogout} userName={currentUser?.username} title="模型" />

      <Box sx={{ mt: '20px', mb: '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
        <UIButton
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          sx={staffTokens.outlineActionButton}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          刷新
        </UIButton>
        <UIButton
          data-guide-target="models-create"
          onClick={createBlank}
          sx={staffTokens.primaryButton}
        >
          <Plus size={14} />
          新建模型
        </UIButton>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px', borderRadius: '20px 20px 0 0', bgcolor: 'background.paper', padding: '18px 18px 24px 18px', boxShadow: '0 -4px 16px 0 rgba(0,0,0,0.05)' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '20px' }} aria-label="模型统计">
          <StatCard label="模型" value={rows.length} />
          <StatCard label="已启用" value={enabledCount} tone="green" />
          <StatCard label="默认模型" value={defaultRow?.name || '-'} valueClassName="text-[18px]" />
          <StatCard label="API 协议" value={providerCount} />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
            <FlaskConical size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <Box component="span" sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1 }}>模型列表</Box>
          </Box>

          <Box
            component="label"
            sx={{
              display: 'flex',
              height: '34px',
              width: '300px',
              alignItems: 'center',
              gap: '8px',
              overflow: 'hidden',
              borderRadius: '10px',
              border: '0.5px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              px: '12px',
              transition: 'border-color 0.15s',
              '&:focus-within': { borderColor: 'text.primary' },
              '@media (max-width:900px)': { width: '100%' },
            }}
          >
            <Search size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <Box
              component="input"
              value={searchText}
              placeholder="搜索名称、模型、API 协议或 Base URL"
              onChange={(event) => setSearchText(event.target.value)}
              sx={{
                height: '100%',
                minWidth: 0,
                flex: 1,
                bgcolor: 'transparent',
                px: '14px',
                fontSize: '12px',
                color: '#17191f',
                outline: 'none',
                border: 0,
                '&::placeholder': { color: '#c0c6d4' },
              }}
            />
            {searchText && (
              <Box
                component="button"
                type="button"
                aria-label="清除搜索"
                onClick={() => setSearchText('')}
                sx={{
                  display: 'grid',
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                  placeItems: 'center',
                  color: '#c0c6d4',
                  cursor: 'pointer',
                  border: 0,
                  bgcolor: 'transparent',
                  '&:hover': { color: '#858b9c' },
                }}
              >
                <X size={14} />
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'grid', gap: '10px', '@media (min-width:768px)': { display: 'none' } }}>
            {filteredRows.length ? (
              pagedItems.map(renderMobileCard)
            ) : (
              <Box sx={{ py: '40px', textAlign: 'center', fontSize: '13px', color: 'text.secondary' }}>暂无模型</Box>
            )}
          </Box>

          <Box sx={{ display: 'none', '@media (min-width:768px)': { display: 'block' } }}>
            <DataTable
              aria-label="模型列表"
              columns={columns}
              data={pagedItems}
              rowKey={(row) => row.id}
              loading={loading}
              emptyText="暂无模型，点击「新建模型」添加一个吧"
            />
          </Box>

          {filteredRows.length > 0 && (
            <Paginator
              aria-label="模型分页"
              page={page}
              pageCount={pageCount}
              onChange={setPage}
            />
          )}
        </Box>
      </Box>

      <Dialog open={editorOpen} onOpenChange={(next) => !next && closeEditor()}>
        <DialogContent
          aria-describedby={undefined}
          sx={{
            display: 'flex',
            maxHeight: 'calc(100dvh - 4rem)',
            width: 'calc(100% - 2rem)',
            flexDirection: 'column',
            gap: '16px',
            overflow: 'hidden',
            borderRadius: '14px',
            px: '20px',
            py: '16px',
            '@media (min-width:640px)': { maxWidth: '640px' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
            <FlaskConical size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <DialogTitle sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 400, lineHeight: 'none', color: 'text.secondary' }}>
              {selected ? `编辑模型：${selected.name}` : '新建模型'}
            </DialogTitle>
          </Box>

          <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto', px: '12px' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', '@media (min-width:640px)': { gridTemplateColumns: '1fr 1fr' } }}>
              <LabeledField label="名称">
                <Input value={form.name} placeholder="例如 GPT-4o" onChange={(event) => updateForm('name', event.target.value)} />
              </LabeledField>
              <LabeledField label="API 协议">
                <Select
                  value={form.api_protocol}
                  onValueChange={(value) => updateForm('api_protocol', value as ModelForm['api_protocol'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableProtocols.includes('openai_chat_completions') && (
                      <SelectItem value="openai_chat_completions">OpenAI Chat Completions</SelectItem>
                    )}
                    {availableProtocols.includes('anthropic_messages') && (
                      <SelectItem value="anthropic_messages">Anthropic Messages</SelectItem>
                    )}
                    {availableProtocols.includes('gemini_generate_content') && (
                      <SelectItem value="gemini_generate_content">Gemini Generate Content</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </LabeledField>
              <LabeledField label="Base URL">
                <Input
                  value={form.base_url}
                  placeholder={form.api_protocol === 'openai_chat_completions'
                    ? 'https://llm-center.modelbest.cn/llm/v1'
                    : 'https://llm-center.modelbest.cn/llm'}
                  onChange={(event) => updateForm('base_url', event.target.value)}
                />
              </LabeledField>
              <LabeledField label="Model">
                <Input value={form.model} placeholder="例如 gpt-4o" onChange={(event) => updateForm('model', event.target.value)} />
              </LabeledField>
              <LabeledField label="API Key">
                <Input
                  type="password"
                  value={form.api_key}
                  placeholder={selected ? '不修改请留空' : 'sk-...'}
                  onChange={(event) => updateForm('api_key', event.target.value)}
                />
              </LabeledField>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <LabeledField label="Temperature">
                  <Input
                    type="number"
                    min={0}
                    max={form.api_protocol === 'anthropic_messages' ? 1 : 2}
                    step={0.1}
                    value={form.temperature}
                    onChange={(event) => updateForm('temperature', event.target.value)}
                  />
                </LabeledField>
                <LabeledField label="Max Tokens">
                  <Input
                    type="number"
                    min={128}
                    max={32000}
                    value={form.max_output_tokens}
                    onChange={(event) => updateForm('max_output_tokens', event.target.value)}
                  />
                </LabeledField>
              </Box>
              {form.api_protocol === 'openai_chat_completions' && (
                <Box sx={{ '@media (min-width:640px)': { gridColumn: 'span 2' } }}>
                  <LabeledField label="额外请求参数（extra_body JSON）">
                    <Textarea
                      rows={5}
                      value={form.extra_body}
                      placeholder={'{\n  "thinking": {\n    "type": "disabled"\n  }\n}'}
                      sx={{ minHeight: '116px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                      onChange={(event) => updateForm('extra_body', event.target.value)}
                    />
                  </LabeledField>
                </Box>
              )}
            </Box>
            <Box sx={{ mt: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px' }}>
              <Box component="label" sx={{ display: 'flex', cursor: 'pointer', alignItems: 'center', gap: '8px' }}>
                <Switch checked={form.is_default} onCheckedChange={(next) => updateForm('is_default', next)} />
                <Box component="span" sx={{ fontSize: '12px', fontWeight: 500, color: 'text.primary' }}>设为默认</Box>
              </Box>
              <Box component="label" sx={{ display: 'flex', cursor: 'pointer', alignItems: 'center', gap: '8px' }}>
                <Switch checked={form.enabled} onCheckedChange={(next) => updateForm('enabled', next)} />
                <Box component="span" sx={{ fontSize: '12px', fontWeight: 500, color: 'text.primary' }}>启用</Box>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', px: '12px' }}>
            <UIButton
              variant="outline"
              disabled={saving}
              onClick={closeEditor}
              sx={staffTokens.dialogCancelButton}
            >
              取消
            </UIButton>
            <UIButton
              disabled={saving}
              onClick={() => void save()}
              sx={[staffTokens.primaryButton, { width: '80px' }] as SxProps}
            >
              保存
            </UIButton>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Box component="span" sx={{ fontSize: '12px', fontWeight: 500, color: 'text.primary' }}>{label}</Box>
      {children}
    </Box>
  );
}
