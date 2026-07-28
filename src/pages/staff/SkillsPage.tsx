import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import { DataTable, type DataTableColumn } from '../../components/staff/DataTable.js';
import { Paginator } from '../../components/staff/Paginator.js';
import { StatCard } from '../../components/staff/StatCard.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  OutlineActionButton,
  SearchCombo,
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
  formatDateTime,
} from '../../components/staff/lib/enterprise-ui.js';
import { staffTokens } from '../../components/staff/lib/staffTokens.js';
import {
  AGENT_SCOPE_CHANGE_EVENT,
  ENTERPRISE_AGENT_STORAGE_KEY,
} from '../../components/staff/lib/agent-scope-storage.js';
import { api, TENANT_ID } from '../../components/staff/api/client.js';
import ResourceImportDialog, {
  type ImportSourceOption,
} from '../../components/staff/ResourceImportDialog.js';
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

type SkillBranchVersion = {
  version: string;
  change_summary?: string;
  status?: string;
  created_at?: number;
};

type ImportItem = { id: string; label: string };

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
  const [rollbackTarget, setRollbackTarget] = useState<SkillRead | null>(null);
  const [rollbackVersions, setRollbackVersions] = useState<SkillBranchVersion[]>([]);
  const [rollbackVersion, setRollbackVersion] = useState('');
  const [rollingBack, setRollingBack] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSourceId, setImportSourceId] = useState('');
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importSelected, setImportSelected] = useState<string[]>([]);
  const [importLoadingItems, setImportLoadingItems] = useState(false);

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

  // ===================== Agent 分支版本化：sync / promote / rollback =====================
  async function syncFromOverall(row: SkillRead) {
    if (!scopedAgentId) return;
    try {
      await api.post(`/agents/${scopedAgentId}/skills/${row.skill_id}/sync-from-overall`, {});
      notify.success(`已同步自全局 SOP「${row.name}」`);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '同步失败');
    }
  }

  async function promoteToOverall(row: SkillRead) {
    if (!scopedAgentId) return;
    try {
      await api.post(`/agents/${scopedAgentId}/skills/${row.skill_id}/promote-to-overall`, {});
      notify.success(`已提升至全局 SOP「${row.name}」`);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '提升失败');
    }
  }

  async function openRollback(row: SkillRead) {
    if (!scopedAgentId) return;
    try {
      const versions = await api.get<SkillBranchVersion[]>(
        `/agents/${scopedAgentId}/skills/${row.skill_id}/versions`,
      );
      if (!versions.length) {
        notify.warning('该分支暂无历史版本');
        return;
      }
      setRollbackTarget(row);
      setRollbackVersions(versions);
      setRollbackVersion(versions[0]?.version || '');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载版本失败');
    }
  }

  async function confirmRollback() {
    if (!rollbackTarget || !scopedAgentId || !rollbackVersion) return;
    setRollingBack(true);
    try {
      await api.post(`/agents/${scopedAgentId}/skills/${rollbackTarget.skill_id}/rollback`, {
        version: rollbackVersion,
      });
      notify.success(`已回滚至版本 ${rollbackVersion}`);
      setRollbackTarget(null);
      setRollbackVersions([]);
      setRollbackVersion('');
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '回滚失败');
    } finally {
      setRollingBack(false);
    }
  }

  // ===================== 跨 Agent 批量导入 SOP =====================
  const importSources: ImportSourceOption[] = useMemo(() => {
    const list: ImportSourceOption[] = [{ value: 'overall', label: '全局 SOP 广场' }];
    agents
      .filter((item) => item.id !== scopedAgentId && !item.is_overall)
      .forEach((item) => list.push({ value: item.id, label: item.name || item.id }));
    return list;
  }, [agents, scopedAgentId]);

  function resetImport() {
    setImportOpen(false);
    setImportSourceId('');
    setImportItems([]);
    setImportSelected([]);
  }

  async function loadImportItems(sourceId: string) {
    setImportSourceId(sourceId);
    if (!sourceId) {
      setImportItems([]);
      return;
    }
    setImportLoadingItems(true);
    try {
      if (sourceId === 'overall') {
        const rows = await api.get<SkillRead[]>(`/skills?tenant_id=${TENANT_ID}`);
        setImportItems(rows.map((r) => ({ id: r.skill_id, label: r.name })));
      } else {
        const rows = await api.get<Array<{ skill_id: string }>>(
          `/agents/${sourceId}/skill-branches`,
        );
        setImportItems(rows.map((r) => ({ id: r.skill_id, label: r.skill_id })));
      }
      setImportSelected([]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载来源失败');
    } finally {
      setImportLoadingItems(false);
    }
  }

  async function submitImport() {
    if (!scopedAgentId || !importSourceId || !importSelected.length) return;
    setImportLoading(true);
    try {
      const res = await api.post<{ skills: number; knowledge_bases: number }>(
        `/agents/${scopedAgentId}/resources/import`,
        {
          source_agent_id: importSourceId,
          resource_types: ['skill'],
          skill_ids: importSelected,
        },
      );
      notify.success(`已导入 ${res.skills} 个 SOP 分支`);
      resetImport();
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImportLoading(false);
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
                  onSelect={() => navigate(`/enterprise/skills/new/distill?skill_id=${row.skill_id}`)}
                >
                  <Pencil className="size-[14px]" />
                  编辑
                </DropdownMenuItem>
                {scopedAgentId ? (
                  <>
                    <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASS}
                      onSelect={() => void syncFromOverall(row)}
                    >
                      <Download className="size-[14px]" />
                      同步自全局
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASS}
                      onSelect={() => void promoteToOverall(row)}
                    >
                      <Upload className="size-[14px]" />
                      提升至全局
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASS}
                      onSelect={() => void openRollback(row)}
                    >
                      <RotateCcw className="size-[14px]" />
                      回滚版本
                    </DropdownMenuItem>
                  </>
                ) : null}
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
            <OutlineActionButton
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="size-[14px]" />
              刷新
            </OutlineActionButton>
            {canManageCurrentScope && scopedAgentId ? (
              <OutlineActionButton
                type="button"
                onClick={() => setImportOpen(true)}
              >
                <Download className="size-[14px]" />
                导入
              </OutlineActionButton>
            ) : null}
            {canManageCurrentScope ? (
              <UIButton
                sx={staffTokens.primaryButton}
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
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">已启用</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="archived">已停用</SelectItem>
              </SelectContent>
            </Select>
            <SearchCombo
              value={searchText}
              onChange={setSearchText}
              placeholder="搜索 SOP 名称 / 业务域"
            />
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

      <Dialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => !rollingBack && !open && setRollbackTarget(null)}
      >
        <DialogContent className="gap-0 rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            回滚分支版本
            {rollbackTarget ? (
              <span className="ml-[6px] text-[13px] font-normal text-[#858b9c]">{rollbackTarget.name}</span>
            ) : null}
          </DialogTitle>
          <div className="flex flex-col gap-[12px] px-[24px] pb-[8px]">
            <p className="text-[12px] text-[#858b9c]">
              选择一个历史版本，将当前 Agent 分支回滚至该版本的快照。
            </p>
            <Select value={rollbackVersion} onValueChange={setRollbackVersion}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择版本" />
              </SelectTrigger>
              <SelectContent>
                {rollbackVersions.map((item) => (
                  <SelectItem key={item.version} value={item.version}>
                    {item.version}
                    {item.change_summary ? ` · ${item.change_summary}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex justify-end gap-[8px] px-[24px] py-[16px]">
            <UIButton
              className="h-[34px] rounded-[10px] bg-[#f2f3f7] px-[16px] text-[12px] text-[#18181a] hover:bg-[#e8e9ef]"
              onClick={() => setRollbackTarget(null)}
              disabled={rollingBack}
            >
              取消
            </UIButton>
            <UIButton
              sx={staffTokens.primaryButton}
              onClick={() => void confirmRollback()}
              disabled={rollingBack || !rollbackVersion}
            >
              {rollingBack ? '回滚中…' : '确认回滚'}
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResourceImportDialog
        open={importOpen}
        loading={importLoading || importLoadingItems}
        icon={<Download className="size-[14px]" />}
        title="跨 Agent 批量导入 SOP"
        sourcePlaceholder="选择复制来源"
        sources={importSources}
        sourceId={importSourceId}
        itemsLabel="选择 SOP"
        items={importItems}
        selectedIds={importSelected}
        emptyText="该来源暂无可导入的 SOP"
        note="导入将以「已同步」分支的形式复制到当前员工，可随时回滚或再次从全局同步。"
        submitText="导入"
        onSourceChange={(value) => void loadImportItems(value)}
        onSelectedChange={setImportSelected}
        onClose={resetImport}
        onSubmit={() => void submitImport()}
      />
    </div>
  );
}
