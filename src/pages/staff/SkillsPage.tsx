import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  SkillRead,
} from '../../components/staff/types/index.js';

const SKILL_PAGE_SIZE = 10;

type SkillsPageProps = {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

type SkillStatusFilter = 'all' | SkillRead['status'];

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

export default function SkillsPage({ currentUser, onLogout }: SkillsPageProps = {}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SkillRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<SkillStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentScopeLoaded, setAgentScopeLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewTarget, setViewTarget] = useState<SkillRead | null>(null);

  const currentAgent = useMemo(() => agents.find((item) => item.id === agentId), [agents, agentId]);
  const isOverallAgent = !currentAgent || currentAgent.is_overall;
  const canManageCurrentScope = currentAgent
    ? canManageEmployeeAgent(currentAgent, currentUser)
    : isEnterpriseAdmin(currentUser);
  const scopedAgentId = effectiveAgentId(agents, agentId);
  const agentQuery = scopedAgentId ? `&agent_id=${encodeURIComponent(scopedAgentId)}` : '';

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!keyword) return true;
      return [
        row.name,
        row.skill_id,
        row.description || '',
        row.business_domain || '',
        resourceCreatorName(row),
      ].some((value) => value.toLowerCase().includes(keyword));
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

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / SKILL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * SKILL_PAGE_SIZE;
    return filteredRows.slice(start, start + SKILL_PAGE_SIZE);
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
      const suffix = scopedAgentId ? `&agent_id=${encodeURIComponent(scopedAgentId)}` : '';
      const result = await api.get<SkillRead[]>(`/skills?tenant_id=${TENANT_ID}${suffix}`);
      setRows(result);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载 SOP 失败');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/skills/${deleteTarget.skill_id}?tenant_id=${TENANT_ID}${agentQuery}`);
      notify.success('已删除 SOP');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  const pageTitle = isOverallAgent ? 'SOP 广场' : '业务 SOP';
  const listLabel = isOverallAgent ? 'SOP 广场列表' : 'SOP 列表';

  const columns: DataTableColumn<SkillRead>[] = [
    {
      key: 'name',
      title: 'SOP',
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-[13px] font-medium text-[#18181a]">{row.name}</span>
          <span className="truncate text-[12px] text-[#858b9c]">{row.skill_id}</span>
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
      key: 'business_domain',
      title: '业务域',
      width: 120,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">{row.business_domain || '-'}</span>
      ),
    },
    {
      key: 'version',
      title: '版本',
      width: 80,
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.version}</span>,
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
      key: 'call_count',
      title: '调用次数',
      width: 100,
      align: 'right',
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">{row.call_count}</span>
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
      render: (row) => (
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
            <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => setViewTarget(row)}>
              <Eye className="size-[14px]" />
              查看
            </DropdownMenuItem>
            {canManageCurrentScope ? (
              <>
                <DropdownMenuItem
                  className={MENU_ITEM_CLASS}
                  onSelect={() => navigate(`/staff/skills/${row.skill_id}/distill`)}
                >
                  <Pencil className="size-[14px]" />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
                <DropdownMenuItem
                  className={MENU_ITEM_DANGER_CLASS}
                  onSelect={() => setDeleteTarget(row)}
                >
                  <Trash2 className="size-[14px]" />
                  删除
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]">
      <AppHeader
        title={pageTitle}
        description="管理可复用的业务 SOP 与执行规范。"
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
                onClick={() => navigate('/staff/skills/new/distill')}
              >
                <Plus className="size-[14px]" />
                新增 SOP
              </UIButton>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-[12px]">
        <StatCard value={stats.total} label="SOP 总数" />
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
              onValueChange={(value) => setStatusFilter(value as SkillStatusFilter)}
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
                placeholder="搜索 SOP 名称 / 业务域"
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
          rowKey={(row) => row.skill_id}
          loading={loading}
          emptyText="暂无 SOP，点击「新增」创建一个吧"
          aria-label={listLabel}
        />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage} />
        ) : null}
      </section>

      <Dialog open={viewTarget !== null} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="gap-0 overflow-hidden rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            {viewTarget?.name || 'SOP 详情'}
          </DialogTitle>
          {viewTarget ? (
            <div className="flex flex-col gap-[16px] px-[24px] pb-[20px]">
              <div className="grid grid-cols-2 gap-[12px] text-[12px]">
                <div>
                  <span className="text-[#858b9c]">Skill ID：</span>
                  <span className="text-[#18181a]">{viewTarget.skill_id}</span>
                </div>
                <div>
                  <span className="text-[#858b9c]">版本：</span>
                  <span className="text-[#18181a]">{viewTarget.version}</span>
                </div>
                <div>
                  <span className="text-[#858b9c]">业务域：</span>
                  <span className="text-[#18181a]">{viewTarget.business_domain || '-'}</span>
                </div>
                <div>
                  <span className="text-[#858b9c]">状态：</span>
                  <span className="text-[#18181a]">
                    {viewTarget.status === 'published'
                      ? '已启用'
                      : viewTarget.status === 'draft'
                        ? '草稿'
                        : '已停用'}
                  </span>
                </div>
                <div>
                  <span className="text-[#858b9c]">调用次数：</span>
                  <span className="text-[#18181a]">{viewTarget.call_count}</span>
                </div>
                <div>
                  <span className="text-[#858b9c]">正面反馈：</span>
                  <span className="text-[#18181a]">{viewTarget.positive_feedback_count}</span>
                </div>
                <div>
                  <span className="text-[#858b9c]">负面反馈：</span>
                  <span className="text-[#18181a]">{viewTarget.negative_feedback_count}</span>
                </div>
                <div>
                  <span className="text-[#858b9c]">更新时间：</span>
                  <span className="text-[#18181a]">{formatDateTime(viewTarget.updated_at)}</span>
                </div>
              </div>
              {viewTarget.description ? (
                <div className="rounded-[10px] border border-[#f2f3f7] bg-[#fafbfc] p-[12px] text-[13px] text-[#18181a]">
                  {viewTarget.description}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={
          deleteTarget ? (
            <>
              删除 SOP <strong className="ml-[4px]">{deleteTarget.name}</strong>
            </>
          ) : (
            '删除 SOP'
          )
        }
        description="删除后该 SOP 将无法被员工调用。"
        confirmText="删除"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
