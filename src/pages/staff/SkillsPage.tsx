import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
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

  //
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

  //
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
        <Box component="div" sx={{"display":"flex","minWidth":0,"flexDirection":"column","gap":'2px'}}>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>{row.name}</Box>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{row.skill_id}</Box>
        </Box>
      ),
    },
    {
      key: 'description',
      title: '描述',
      render: (row) => (
        <Box component="span" sx={{"display":"-webkit-box","WebkitBoxOrient":"vertical","WebkitLineClamp":2,"overflow":"hidden","fontSize":'12px',"color":"#858b9c"}}>
          {row.description || '暂无描述'}
        </Box>
      ),
    },
    {
      key: 'business_domain',
      title: '业务域',
      width: 120,
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.business_domain || '-'}</Box>
      ),
    },
    {
      key: 'version',
      title: '版本',
      width: 80,
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.version}</Box>,
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>
          {row.status === 'published' ? '已启用' : row.status === 'draft' ? '草稿' : '已停用'}
        </Box>
      ),
    },
    {
      key: 'call_count',
      title: '调用次数',
      width: 100,
      align: 'right',
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.call_count}</Box>
      ),
    },
    {
      key: 'updated_at',
      title: '更新时间',
      width: 160,
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#858b9c"}}>{formatDateTime(row.updated_at)}</Box>,
    },
    {
      key: 'actions',
      title: '',
      width: 80,
      align: 'right',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Box component="button"
              type="button"
             
              aria-label="更多操作"
             sx={{"ml":"auto","display":"flex","width":'24px',"height":'24px',"alignItems":"center","justifyContent":"center","borderRadius":'6px',"color":"#858b9c","&:hover":{"bgcolor":"#f2f3f7","color":"#18181a"}}}>
              <MoreHorizontal  size={14} />
            </Box>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={MENU_CONTENT_CLASS} align="end">
            <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => setViewTarget(row)}>
              <Eye  size={14} />
              查看
            </DropdownMenuItem>
            {canManageCurrentScope ? (
              <>
                <DropdownMenuItem
                  className={MENU_ITEM_CLASS}
                  onSelect={() => navigate(`/enterprise/skills/new/distill?skill_id=${row.skill_id}`)}
                >
                  <Pencil  size={14} />
                  编辑
                </DropdownMenuItem>
                {scopedAgentId ? (
                  <>
                    <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASS}
                      onSelect={() => void syncFromOverall(row)}
                    >
                      <Download  size={14} />
                      同步自全局
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASS}
                      onSelect={() => void promoteToOverall(row)}
                    >
                      <Upload  size={14} />
                      提升至全局
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASS}
                      onSelect={() => void openRollback(row)}
                    >
                      <RotateCcw  size={14} />
                      回滚版本
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
                <DropdownMenuItem
                  className={MENU_ITEM_DANGER_CLASS}
                  onSelect={() => setDeleteTarget(row)}
                >
                  <Trash2  size={14} />
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
    <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title={pageTitle}
        description="管理可复用的业务 SOP 与执行规范。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
            <OutlineActionButton
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw  size={14} />
              刷新
            </OutlineActionButton>
            {canManageCurrentScope && scopedAgentId ? (
              <OutlineActionButton
                type="button"
                onClick={() => setImportOpen(true)}
              >
                <Download  size={14} />
                导入
              </OutlineActionButton>
            ) : null}
            {canManageCurrentScope ? (
              <UIButton
                sx={staffTokens.primaryButton}
                onClick={() => navigate('/staff/skills/new/distill')}
              >
                <Plus  size={14} />
                新增 SOP
              </UIButton>
            ) : null}
          </Box>
        }
       />

      <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'12px'}}>
        <StatCard value={stats.total} label="SOP 总数"  />
        <StatCard value={stats.published} label="已启用" tone="green"  />
        <StatCard value={stats.draft} label="草稿"  />
        <StatCard value={stats.archived} label="已停用" tone="red"  />
      </Box>

      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px'}}>
        <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","justifyContent":"space-between","gap":'12px'}}>
          <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>{listLabel}</Box>
          <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","gap":'8px'}}>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as SkillStatusFilter)}
            >
              <SelectTrigger sx={{"width":'140px'}}>
                <SelectValue placeholder="全部状态"  />
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
          </Box>
        </Box>

        <DataTable
          columns={columns}
          data={pagedRows}
          rowKey={(row) => row.skill_id}
          loading={loading}
          emptyText="暂无 SOP，点击「新增」创建一个吧"
          aria-label={listLabel}
         />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage}  />
        ) : null}
      </Box>

      <Dialog open={viewTarget !== null} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent sx={{"gap":0,"overflow":"hidden","borderRadius":'16px',"p":0,"position":'relative'}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            {viewTarget?.name || 'SOP 详情'}
          </DialogTitle>
          {viewTarget ? (
            <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'16px',"px":'24px',"pb":'20px'}}>
              <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px',"fontSize":'12px'}}>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>Skill ID：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{viewTarget.skill_id}</Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>版本：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{viewTarget.version}</Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>业务域：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{viewTarget.business_domain || '-'}</Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>状态：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>
                    {viewTarget.status === 'published'
                      ? '已启用'
                      : viewTarget.status === 'draft'
                        ? '草稿'
                        : '已停用'}
                  </Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>调用次数：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{viewTarget.call_count}</Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>正面反馈：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{viewTarget.positive_feedback_count}</Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>负面反馈：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{viewTarget.negative_feedback_count}</Box>
                </div>
                <div>
                  <Box component="span" sx={{"color":"#858b9c"}}>更新时间：</Box>
                  <Box component="span" sx={{"color":"#18181a"}}>{formatDateTime(viewTarget.updated_at)}</Box>
                </div>
              </Box>
              {viewTarget.description ? (
                <Box component="div" sx={{"borderRadius":'10px',"border":"1px solid","borderColor":'divider',"bgcolor":"#fafbfc","p":'12px',"fontSize":'13px',"color":"#18181a"}}>
                  {viewTarget.description}
                </Box>
              ) : null}
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={
          deleteTarget ? (
            <>
              删除 SOP <Box component="strong" sx={{"ml":'4px'}}>{deleteTarget.name}</Box>
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
        <DialogContent sx={{"gap":0,"borderRadius":'16px',"p":0,"position":'relative'}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            回滚分支版本
            {rollbackTarget ? (
              <Box component="span" sx={{"ml":'6px',"fontSize":'13px',"fontWeight":400,"color":"#858b9c"}}>{rollbackTarget.name}</Box>
            ) : null}
          </DialogTitle>
          <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'12px',"px":'24px',"pb":'8px'}}>
            <Box component="p" sx={{"fontSize":'12px',"color":"#858b9c"}}>
              选择一个历史版本，将当前 Agent 分支回滚至该版本的快照。
            </Box>
            <Select value={rollbackVersion} onValueChange={setRollbackVersion}>
              <SelectTrigger sx={{"width":'100%'}}>
                <SelectValue placeholder="选择版本"  />
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
          </Box>
          <DialogFooter sx={{"display":"flex","justifyContent":"flex-end","gap":'8px',"px":'24px',"py":'16px'}}>
            <UIButton
              sx={{"height":'34px',"borderRadius":'10px',"bgcolor":'divider',"px":'16px',"fontSize":'12px',"color":"#18181a","&:hover":{"bgcolor":"#e8e9ef"}}}
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
        icon={<Download  size={14} />}
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
    </Box>
  );
}
