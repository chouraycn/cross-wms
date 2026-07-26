import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import { DataTable, type DataTableColumn } from '../../components/staff/DataTable.js';
import { Paginator } from '../../components/staff/Paginator.js';
import { StatCard } from '../../components/staff/StatCard.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_DANGER_CLASS,
  OUTLINE_ACTION_BUTTON_CLASS,
  SEARCH_COMBO_BUTTON_CLASS,
  SEARCH_COMBO_CLASS,
  SEARCH_COMBO_INPUT_CLASS,
  SELECT_TRIGGER_CLASS,
  formatDateTime,
} from '../../components/staff/lib/enterprise-ui.js';
import {
  AGENT_SCOPE_CHANGE_EVENT,
  ENTERPRISE_AGENT_STORAGE_KEY,
} from '../../components/staff/lib/agent-scope-storage.js';
import { api, TENANT_ID } from '../../components/staff/api/client.js';
import { isEnterpriseAdmin, type EnterpriseAuthUser } from '../../components/staff/auth.js';
import {
  canManageEmployeeAgent,
  resourceCreatorName,
  visibleEmployeeAgents,
} from '../../components/staff/employee.js';
import type {
  AgentProfileRead,
  GeneralSkillRead,
} from '../../components/staff/types/index.js';

const GENERAL_SKILL_PAGE_SIZE = 10;

type GeneralSkillPageProps = {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

type SkillFormValues = {
  slug: string;
  name: string;
  description: string;
  homepage: string;
  skill_markdown: string;
  status: 'draft' | 'published' | 'archived';
  enabled: boolean;
};

const EMPTY_FORM: SkillFormValues = {
  slug: '',
  name: '',
  description: '',
  homepage: '',
  skill_markdown: '# 技能说明\n\n在这里编写技能文档。',
  status: 'draft',
  enabled: true,
};

function effectiveAgentId(rows: AgentProfileRead[], agentId: string): string {
  const agent = rows.find((item) => item.id === agentId);
  return agent && !agent.is_overall ? agent.id : '';
}

function resolveAgentScope(
  rows: AgentProfileRead[],
  currentUser: EnterpriseAuthUser | undefined,
  currentAgentId: string,
): string {
  const currentAgent = rows.find((item) => item.id === currentAgentId);
  if (currentAgent) {
    if (!currentAgent.is_overall || isEnterpriseAdmin(currentUser)) return currentAgent.id;
  }
  if (isEnterpriseAdmin(currentUser)) return '';
  return visibleEmployeeAgents(rows, currentUser, { activeOnly: true })[0]?.id || '';
}

export default function GeneralSkillsPage({
  currentUser,
  onLogout,
}: GeneralSkillPageProps = {}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GeneralSkillRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | GeneralSkillRead['status']>('all');
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentScopeLoaded, setAgentScopeLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<GeneralSkillRead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentAgent = useMemo(() => agents.find((item) => item.id === agentId), [agents, agentId]);
  const isOverallAgent = !currentAgent || currentAgent.is_overall;
  const canManageCurrentScope = currentAgent
    ? canManageEmployeeAgent(currentAgent, currentUser)
    : isEnterpriseAdmin(currentUser);
  const scopedAgentId = effectiveAgentId(agents, agentId);
  const agentQuery = scopedAgentId ? `&agent_id=${encodeURIComponent(scopedAgentId)}` : '';

  const filteredRows = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!text) return true;
      return [row.name, row.slug, row.description, row.homepage, resourceCreatorName(row)]
        .some((value) => (value || '').toLowerCase().includes(text));
    });
  }, [rows, statusFilter, searchText]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      published: rows.filter((row) => row.status === 'published').length,
      draft: rows.filter((row) => row.status === 'draft').length,
      archived: rows.filter((row) => row.status === 'archived').length,
    }),
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / GENERAL_SKILL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * GENERAL_SKILL_PAGE_SIZE;
    return filteredRows.slice(start, start + GENERAL_SKILL_PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter]);

  useEffect(() => {
    void loadAgentScope();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!agentScopeLoaded) return;
    const resolvedAgentId = resolveAgentScope(agents, currentUser, agentId);
    if (resolvedAgentId !== agentId) {
      applyResolvedAgentScope(resolvedAgentId);
      return;
    }
    void load();
  }, [agentScopeLoaded, agentId, agents, currentUser?.id]);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      setAgentId(detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, []);

  function applyResolvedAgentScope(nextAgentId: string) {
    if (nextAgentId === agentId) return;
    if (nextAgentId) {
      window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, nextAgentId);
    } else {
      window.localStorage.removeItem(ENTERPRISE_AGENT_STORAGE_KEY);
    }
    setAgentId(nextAgentId);
    window.dispatchEvent(new CustomEvent(AGENT_SCOPE_CHANGE_EVENT, { detail: { agentId: nextAgentId } }));
  }

  async function loadAgentScope() {
    setAgentScopeLoaded(false);
    try {
      const agentRows = await api.get<AgentProfileRead[]>(`/agents?tenant_id=${TENANT_ID}`);
      setAgents(agentRows);
      const resolvedAgentId = resolveAgentScope(agentRows, currentUser, agentId);
      if (resolvedAgentId !== agentId) {
        applyResolvedAgentScope(resolvedAgentId);
      }
      setAgentScopeLoaded(true);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载员工失败');
    }
  }

  async function load() {
    if (!agentScopeLoaded) return;
    setLoading(true);
    try {
      const rowsData = await api.get<GeneralSkillRead[]>(
        `/general-skills?tenant_id=${TENANT_ID}${agentQuery}`,
      );
      setRows(rowsData);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载技能失败');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/general-skills/${deleteTarget.slug}?tenant_id=${TENANT_ID}${agentQuery}`);
      notify.success('已删除技能');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  const pageTitle = isOverallAgent ? '技能广场' : '技能';
  const listLabel = isOverallAgent ? '技能广场列表' : '技能列表';

  const columns: DataTableColumn<GeneralSkillRead>[] = [
    {
      key: 'name',
      title: '技能',
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-[13px] font-medium text-[#18181a]">{row.name}</span>
          <span className="truncate text-[12px] text-[#858b9c]">{row.slug}</span>
        </div>
      ),
    },
    {
      key: 'description',
      title: '描述',
      render: (row) => (
        <span className="line-clamp-2 text-[12px] text-[#858b9c]">
          {row.description || '暂无描述'}
        </span>
      ),
    },
    {
      key: 'homepage',
      title: '来源',
      width: 100,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">
          {row.homepage ? '外部' : '内置'}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">
          {row.status === 'published' ? '已启用' : row.status === 'draft' ? '草稿' : '已停用'}
        </span>
      ),
    },
    {
      key: 'updated_at',
      title: '更新时间',
      width: 160,
      render: (row) => <span className="text-[12px] text-[#858b9c]">{formatDateTime(row.updated_at)}</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 80,
      align: 'right',
      render: (row) =>
        canManageCurrentScope ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-auto flex size-[24px] items-center justify-center rounded-[6px] text-[#858b9c] hover:bg-[#f2f3f7] hover:text-[#18181a]"
                aria-label="更多操作"
              >
                <MoreHorizontal className="size-[14px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={MENU_CONTENT_CLASS} align="end">
              <DropdownMenuItem
                className={MENU_ITEM_CLASS}
                onSelect={() => navigate(`/staff/general-skills/${row.slug}/edit`)}
              >
                <Pencil className="size-[14px]" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                className={MENU_ITEM_CLASS}
                onSelect={() => navigate(`/staff/general-skills/${row.slug}/run`)}
              >
                <Wrench className="size-[14px]" />
                运行
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
              <DropdownMenuItem
                className={MENU_ITEM_DANGER_CLASS}
                onSelect={() => setDeleteTarget(row)}
              >
                <Trash2 className="size-[14px]" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]">
      <AppHeader
        title={pageTitle}
        description="管理可复用的通用技能（浏览器、MCP、查询工具等）。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="size-[14px]" />
              刷新
            </button>
            {canManageCurrentScope ? (
              <UIButton
                className="h-[34px] gap-[4px] rounded-[10px] bg-[#18181a] px-[16px] text-[12px] text-white hover:bg-[#303030]"
                onClick={() => navigate('/staff/general-skills/new')}
              >
                <Plus className="size-[14px]" />
                新增技能
              </UIButton>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-[12px]">
        <StatCard value={stats.total} label="技能总数" />
        <StatCard value={stats.published} label="已启用" tone="green" />
        <StatCard value={stats.draft} label="草稿" />
        <StatCard value={stats.archived} label="已停用" tone="red" />
      </div>

      <section className="flex flex-col gap-[16px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h3 className="text-[14px] font-medium text-[#18181a]">{listLabel}</h3>
          <div className="flex flex-wrap items-center gap-[8px]">
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as 'all' | GeneralSkillRead['status'])}
            >
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[140px]`}>
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">已启用</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="archived">已停用</SelectItem>
              </SelectContent>
            </Select>
            <div className={SEARCH_COMBO_CLASS}>
              <Input
                className={SEARCH_COMBO_INPUT_CLASS}
                placeholder="搜索技能名称 / Slug"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <button type="button" className={SEARCH_COMBO_BUTTON_CLASS} aria-label="搜索">
                <Search className="size-[14px]" />
              </button>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={pagedRows}
          rowKey={(row) => row.slug}
          loading={loading}
          emptyText="暂无技能，点击「新增」创建一个吧"
          aria-label={listLabel}
        />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage} />
        ) : null}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={
          deleteTarget ? (
            <>
              删除技能 <strong className="ml-[4px]">{deleteTarget.name}</strong>
            </>
          ) : (
            '删除技能'
          )
        }
        description="删除后该技能将无法被员工调用。"
        confirmText="删除"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor page (new / edit)
// ---------------------------------------------------------------------------

type EditorProps = {
  mode: 'new' | 'edit';
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

function GeneralSkillEditorPage({ mode, currentUser, onLogout }: EditorProps) {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const isEdit = mode === 'edit';
  const [values, setValues] = useState<SkillFormValues>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      setAgentId(detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setValues({ ...EMPTY_FORM });
      return;
    }
    if (!slug) return;
    setLoading(true);
    api
      .get<GeneralSkillRead>(
        `/general-skills/${slug}?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`,
      )
      .then((row) => {
        setValues({
          slug: row.slug,
          name: row.name,
          description: row.description || '',
          homepage: row.homepage || '',
          skill_markdown: row.skill_markdown || EMPTY_FORM.skill_markdown,
          status: row.status,
          enabled: row.status !== 'archived',
        });
      })
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载技能失败'))
      .finally(() => setLoading(false));
  }, [isEdit, slug, agentId]);

  async function save() {
    const name = values.name.trim();
    if (!name) {
      notify.warning('请填写技能名称');
      return;
    }
    const slugValue = values.slug.trim() || name.toLowerCase().replace(/\s+/g, '-');
    if (!slugValue) {
      notify.warning('请填写 Slug');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: TENANT_ID,
        agent_id: agentId || undefined,
        slug: slugValue,
        name,
        description: values.description.trim() || undefined,
        homepage: values.homepage.trim() || undefined,
        skill_markdown: values.skill_markdown,
        skill_files: [],
        metadata: {},
        permissions: {},
        runtime_config: {},
        status: values.enabled ? 'published' : 'archived',
      };
      if (isEdit && slug) {
        await api.put<GeneralSkillRead>(`/general-skills/${slug}`, payload);
        notify.success('技能已更新');
      } else {
        await api.post<GeneralSkillRead>(`/general-skills`, payload);
        notify.success('技能已创建');
      }
      navigate('/staff/general-skills');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof SkillFormValues>(key: K, value: SkillFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]" aria-busy={loading}>
      <AppHeader
        title={isEdit ? '编辑技能' : '新建技能'}
        description="编写技能文档，配置 Slug 与状态。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <button
            type="button"
            className={OUTLINE_ACTION_BUTTON_CLASS}
            onClick={() => navigate('/staff/general-skills')}
          >
            返回列表
          </button>
        }
      />
      <section className="flex flex-col gap-[16px] rounded-[14px] border border-[#f2f3f7] bg-white p-[20px]">
        <div className="grid grid-cols-2 gap-[12px]">
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-[#464c5e]">名称</span>
            <Input
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-[#464c5e]">Slug</span>
            <Input
              value={values.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="留空将自动生成"
              disabled={isEdit}
              className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0 disabled:opacity-60"
            />
          </label>
        </div>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">描述</span>
          <Textarea
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            className="rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">主页 URL（可选）</span>
          <Input
            value={values.homepage}
            onChange={(e) => set('homepage', e.target.value)}
            className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">技能文档 (Markdown)</span>
          <Textarea
            value={values.skill_markdown}
            onChange={(e) => set('skill_markdown', e.target.value)}
            rows={12}
            className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
          />
        </label>
        <label className="flex items-center gap-[8px]">
          <Switch
            checked={values.enabled}
            onCheckedChange={(checked) => set('enabled', checked)}
          />
          <span className="text-[12px] text-[#464c5e]">启用技能</span>
        </label>
        <div className="flex items-center justify-end gap-[8px]">
          <UIButton
            variant="outline"
            className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
            onClick={() => navigate('/staff/general-skills')}
          >
            取消
          </UIButton>
          <UIButton
            className="h-[32px] min-w-[80px] rounded-[10px] bg-[#18181a] px-[12px] text-[14px] text-white hover:bg-[#303030]"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? '保存中…' : '保存'}
          </UIButton>
        </div>
      </section>
    </div>
  );
}

export function GeneralSkillNewPage(props: GeneralSkillPageProps = {}) {
  return <GeneralSkillEditorPage mode="new" {...props} />;
}

export function GeneralSkillEditPage(props: GeneralSkillPageProps = {}) {
  return <GeneralSkillEditorPage mode="edit" {...props} />;
}
