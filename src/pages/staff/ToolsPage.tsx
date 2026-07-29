import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box } from '@mui/material';
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
  Dialog,
  DialogContent,
  DialogFooter,
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
  Switch,
  Textarea,
  OutlineActionButton,
  SearchCombo,
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
import { isEnterpriseAdmin, type EnterpriseAuthUser } from '../../components/staff/auth.js';
import {
  canManageEmployeeAgent,
  resourceCreatorName,
  visibleEmployeeAgents,
} from '../../components/staff/employee.js';
import type {
  AgentProfileRead,
  ToolRead,
  MCPServerRead,
  MCPTransport,
} from '../../components/staff/types/index.js';
import { ExecutionBadge, type ExecutionRuntimeResponse } from '../../components/staff/ExecutionBadge.js';
import { StatusBadge } from './scheduled-tasks/StatusBadge.js';
import type { BadgeTone } from './scheduled-tasks/shared.js';

const TOOL_PAGE_SIZE = 10;

/** 工具启用状态 → 徽章色调（与 StaffDeck-main 同款映射） */
const TOOL_STATUS_BADGE: Record<'enabled' | 'disabled', { tone: BadgeTone; text: string }> = {
  enabled: { tone: 'green', text: '已启用' },
  disabled: { tone: 'gray', text: '已停用' },
};
const ENTERPRISE_AGENT_STORAGE_KEY_LOCAL = ENTERPRISE_AGENT_STORAGE_KEY;

/** 工具是否已接入员工执行链路：MCP 工具需父服务器 enabled 且自身 enabled；其余看 enabled */
function toolConnected(row: ToolRead, mcpRuntime: Record<string, boolean>): boolean {
  if (row.tool_type === 'mcp') {
    return row.enabled && !!row.mcp_server_id && mcpRuntime[row.mcp_server_id] === true;
  }
  return row.enabled;
}

type ToolPageProps = {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

type ToolFormValues = {
  name: string;
  display_name: string;
  description: string;
  bucket: string;
  tool_type: 'http' | 'mcp';
  method: string;
  url: string;
  enabled: boolean;
  headers: string;
  input_schema: string;
  output_schema: string;
};

const TOOL_FORM_INITIAL: ToolFormValues = {
  name: '',
  display_name: '',
  description: '',
  bucket: '未分桶',
  tool_type: 'http',
  method: 'POST',
  url: '',
  enabled: true,
  headers: '{}',
  input_schema: '{}',
  output_schema: '{}',
};

type McpFormValues = {
  name: string;
  display_name: string;
  description: string;
  bucket: string;
  transport: MCPTransport;
  url: string;
  command: string;
  args: string;
  env: string;
  enabled: boolean;
};

const MCP_FORM_INITIAL: McpFormValues = {
  name: '',
  display_name: '',
  description: '',
  bucket: '未分桶',
  transport: 'streamable_http',
  url: '',
  command: '',
  args: '',
  env: '{}',
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

export default function ToolsPage({ currentUser, onLogout }: ToolPageProps = {}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ToolRead[]>([]);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL) || '',
  );
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentScopeLoaded, setAgentScopeLoaded] = useState(false);
  const [bucketFilter, setBucketFilter] = useState('__all__');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ToolRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolRead | null>(null);
  const [formValues, setFormValues] = useState<ToolFormValues>({ ...TOOL_FORM_INITIAL });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mcpRuntime, setMcpRuntime] = useState<Record<string, boolean>>({});

  const currentAgent = useMemo(() => agents.find((item) => item.id === agentId), [agents, agentId]);
  const isOverallAgent = !currentAgent || currentAgent.is_overall;
  const canManageCurrentScope = currentAgent
    ? canManageEmployeeAgent(currentAgent, currentUser)
    : isEnterpriseAdmin(currentUser);
  const scopedAgentId = effectiveAgentId(agents, agentId);
  const agentQuery = scopedAgentId ? `&agent_id=${encodeURIComponent(scopedAgentId)}` : '';

  const visibleRows = useMemo(
    () => (isOverallAgent ? rows : rows.filter((row) => row.enabled)),
    [isOverallAgent, rows],
  );

  const bucketStats = useMemo(() => {
    const map = new Map<string, number>();
    visibleRows.forEach((row) => {
      const bucket = row.bucket || '未分桶';
      map.set(bucket, (map.get(bucket) || 0) + 1);
    });
    return Array.from(map.entries()).map(([bucket, total]) => ({ bucket, total }));
  }, [visibleRows]);

  const filteredRows = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return visibleRows.filter((row) => {
      const bucketMatch = bucketFilter === '__all__' || (row.bucket || '未分桶') === bucketFilter;
      if (!bucketMatch) return false;
      if (!text) return true;
      return [row.name, row.display_name || '', row.description || '', row.bucket || '', row.url, resourceCreatorName(row)]
        .some((value) => value.toLowerCase().includes(text));
    });
  }, [bucketFilter, searchText, visibleRows]);

  const stats = useMemo(
    () => ({
      total: visibleRows.length,
      enabled: visibleRows.filter((row) => row.enabled).length,
      buckets: bucketStats.length,
      connected: visibleRows.filter((row) => toolConnected(row, mcpRuntime)).length,
    }),
    [visibleRows, bucketStats, mcpRuntime],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / TOOL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * TOOL_PAGE_SIZE;
    return filteredRows.slice(start, start + TOOL_PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [searchText, bucketFilter]);

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
      setAgentId(detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL) || '');
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, []);

  function applyResolvedAgentScope(nextAgentId: string) {
    if (nextAgentId === agentId) return;
    if (nextAgentId) {
      window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL, nextAgentId);
    } else {
      window.localStorage.removeItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL);
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
    if (!isEnterpriseAdmin(currentUser) && !scopedAgentId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const rowsData = await api.get<ToolRead[]>(`/tools?tenant_id=${TENANT_ID}${agentQuery}`);
      setRows(rowsData);
      //
      try {
        const rt = await api.get<ExecutionRuntimeResponse>(`/execution-runtime?tenant_id=${TENANT_ID}`);
        const map: Record<string, boolean> = {};
        (rt?.data?.mcpServers || []).forEach((s: { id: string; connected: boolean }) => {
          map[s.id] = s.connected;
        });
        setMcpRuntime(map);
      } catch {
        setMcpRuntime({});
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载工具失败');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingTool(null);
    setFormValues({ ...TOOL_FORM_INITIAL });
    setCreateOpen(true);
  }

  async function syncProgramSkills() {
    if (!canManageCurrentScope) return;
    setSyncing(true);
    try {
      const res = await api.post<{ data?: { imported?: number; updated?: number; total?: number } }>(
        `/program-skills/sync?tenant_id=${TENANT_ID}`,
      );
      const data = res?.data;
      if (data && typeof data.total === 'number') {
        notify.success(
          `已同步程序技能：${data.imported ?? 0} 新增 / ${data.updated ?? 0} 更新 / 共 ${data.total} 个`,
        );
      } else {
        notify.success('程序技能已同步到工具目录');
      }
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '同步程序技能失败');
    } finally {
      setSyncing(false);
    }
  }

  function openEdit(tool: ToolRead) {
    setEditingTool(tool);
    setFormValues({
      name: tool.name,
      display_name: tool.display_name || '',
      description: tool.description || '',
      bucket: tool.bucket || '未分桶',
      tool_type: (tool.tool_type === 'mcp' ? 'mcp' : 'http'),
      method: tool.method,
      url: tool.url,
      enabled: tool.enabled,
      headers: JSON.stringify(tool.headers || {}, null, 2),
      input_schema: JSON.stringify(tool.input_schema || {}, null, 2),
      output_schema: JSON.stringify(tool.output_schema || {}, null, 2),
    });
    setCreateOpen(true);
  }

  async function save() {
    const name = formValues.name.trim();
    if (!name) {
      notify.warning('请填写工具名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: TENANT_ID,
        agent_id: scopedAgentId || undefined,
        name,
        display_name: formValues.display_name.trim() || undefined,
        description: formValues.description.trim() || undefined,
        bucket: formValues.bucket.trim() || '未分桶',
        tool_type: formValues.tool_type,
        method: formValues.method,
        url: formValues.url,
        enabled: formValues.enabled,
        headers: safeParse(formValues.headers, {}),
        input_schema: safeParse(formValues.input_schema, {}),
        output_schema: safeParse(formValues.output_schema, {}),
        allowed_skills: [],
      };
      if (editingTool) {
        await api.put<ToolRead>(`/tools/${editingTool.id}`, payload);
        notify.success('工具已更新');
      } else {
        await api.post<ToolRead>(`/tools`, payload);
        notify.success('工具已创建');
      }
      setCreateOpen(false);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/tools/${deleteTarget.id}?tenant_id=${TENANT_ID}${agentQuery}`);
      notify.success('已删除工具');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  function safeParse(text: string, fallback: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return fallback;
    }
  }

  const pageTitle = isOverallAgent ? '工具广场' : '工具';

  const columns: DataTableColumn<ToolRead>[] = [
    {
      key: 'name',
      title: '工具',
      render: (row) => (
        <Box component="div" sx={{"display":"flex","minWidth":0,"flexDirection":"column","gap":'2px'}}>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>
            {row.display_name || row.name}
          </Box>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{row.name}</Box>
        </Box>
      ),
    },
    {
      key: 'bucket',
      title: '分桶',
      width: 120,
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.bucket || '未分桶'}</Box>,
    },
    {
      key: 'tool_type',
      title: '类型',
      width: 80,
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>
          {row.tool_type === 'skill' ? '程序技能' : row.tool_type === 'mcp' ? 'MCP' : 'HTTP'}
        </Box>
      ),
    },
    {
      key: 'method',
      title: '调用',
      width: 140,
      render: (row) => <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#464c5e"}}>{row.method} {row.url}</Box>,
    },
    {
      key: 'enabled',
      title: '状态',
      width: 80,
      render: (row) => {
        const preset = TOOL_STATUS_BADGE[row.enabled ? 'enabled' : 'disabled'];
        return <StatusBadge tone={preset.tone}>{preset.text}</StatusBadge>;
      },
    },
    {
      key: 'execution',
      title: '执行链路',
      width: 170,
      render: (row) => {
        const connected = toolConnected(row, mcpRuntime);
        if (connected) return <ExecutionBadge connected={true}  />;
        const reason = row.tool_type === 'mcp' ? '父 MCP 服务器未启用' : '工具未启用';
        return (
          <Box
            component="button"
            type="button"
            onClick={() => navigate(`/staff/tools/${row.id}/test`)}
            title={`未接入执行链路：${reason}。点击前往工具页处理。`}
            sx={{"display":"inline-flex","cursor":"pointer","alignItems":"center","gap":'4px',"borderRadius":'50%',"bgcolor":'divider',"px":'8px',"py":'2px',"fontSize":'11px',"fontWeight":500,"color":"#858b9c","transition":"background-color 0.2s","&:hover":{"bgcolor":"#eaf2ff","color":"#2563eb"},"&:hover .reveal":{"opacity":1}}} className="group"
          >
            <Box component="span"  sx={{"width":'5px',"height":'5px',"borderRadius":'50%',"bgcolor":"#cbd2e0"}} />
            未接入
            <Box component="span" className="reveal" sx={{"opacity":0,"transition":"opacity 0.2s"}}>· 去处理</Box>
          </Box>
        );
      },
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
      render: (row) =>
        canManageCurrentScope ? (
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
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEdit(row)}>
                <Pencil  size={14} />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                className={MENU_ITEM_CLASS}
                onSelect={() => navigate(`/staff/tools/${row.id}/test`)}
              >
                <Wrench  size={14} />
                测试
              </DropdownMenuItem>
              <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
              <DropdownMenuItem
                className={MENU_ITEM_DANGER_CLASS}
                onSelect={() => setDeleteTarget(row)}
              >
                <Trash2  size={14} />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title={pageTitle}
        description="管理 HTTP 工具、MCP 服务器与程序技能。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
            <OutlineActionButton type="button" onClick={() => void load()} disabled={loading}>
              <RefreshCw  size={14} />
              刷新
            </OutlineActionButton>
            {canManageCurrentScope ? (
            <OutlineActionButton type="button" onClick={() => void syncProgramSkills()} disabled={syncing || loading}>
              <RefreshCw  size={14} />
              {syncing ? '同步中…' : '同步程序技能'}
            </OutlineActionButton>
            ) : null}
            {canManageCurrentScope ? (
              <UIButton
                sx={staffTokens.primaryButton}
                onClick={openCreate}
              >
                <Plus  size={14} />
                新增工具
              </UIButton>
            ) : null}
          </Box>
        }
       />

      <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'12px'}}>
        <StatCard value={stats.total} label="工具总数"  />
        <StatCard value={stats.enabled} label="已启用" tone="green"  />
        <StatCard value={stats.buckets} label="分桶数"  />
        <StatCard value={stats.connected} label="已接入执行链路" tone="green"  />
      </Box>

      <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px',"borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":"#fafbfc","px":'14px',"py":'10px',"fontSize":'12px',"color":"#464c5e"}}>
        <Box component="span"  sx={{"width":'6px',"height":'6px',"borderRadius":'50%',"bgcolor":"#12b76a"}} />
        {stats.connected > 0
          ? `已有 ${stats.connected} 个工具接入员工执行链路（启用且员工 MCP 服务器已激活的工具可真实调用，隔离于主程序 MCP）。`
          : '暂无工具接入执行链路；启用工具并确保其员工 MCP 服务器已启用即可接入。'}
      </Box>

      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px'}}>
        <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","justifyContent":"space-between","gap":'12px'}}>
          <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>工具列表</Box>
          <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","gap":'8px'}}>
            <Select value={bucketFilter} onValueChange={setBucketFilter}>
              <SelectTrigger sx={{"width":'160px'}}>
                <SelectValue placeholder="全部分桶"  />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部分桶</SelectItem>
                {bucketStats.map((item) => (
                  <SelectItem key={item.bucket} value={item.bucket}>
                    {item.bucket} ({item.total})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchCombo
              value={searchText}
              onChange={setSearchText}
              placeholder="搜索工具名称 / URL"
             />
          </Box>
        </Box>

        <DataTable
          columns={columns}
          data={pagedRows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="暂无工具，点击「新增」创建一个吧"
          aria-label="工具列表"
         />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage}  />
        ) : null}
      </Box>

      <Dialog open={createOpen} onOpenChange={(open) => !saving && setCreateOpen(open)}>
        <DialogContent sx={{"position":"relative","gap":0,"overflow":"hidden","borderRadius":'16px',"p":0}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            {editingTool ? '编辑工具' : '新建工具'}
          </DialogTitle>
          <Box component="div" sx={{"display":"flex","maxHeight":'60vh',"flexDirection":"column","gap":'16px',"overflowY":"auto","px":'24px',"pb":'20px'}}>
            <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
              <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
                <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>名称</Box>
                <Input
                  value={formValues.name}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
                  sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
                 />
              </Box>
              <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
                <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>显示名</Box>
                <Input
                  value={formValues.display_name}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, display_name: e.target.value }))}
                  sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
                 />
              </Box>
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>描述</Box>
              <Textarea
                value={formValues.description}
                onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                sx={{"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
              <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
                <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>分桶</Box>
                <Input
                  value={formValues.bucket}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, bucket: e.target.value }))}
                  sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
                 />
              </Box>
              <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
                <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>类型</Box>
                <Select
                  value={formValues.tool_type}
                  onValueChange={(value) =>
                    setFormValues((prev) => ({ ...prev, tool_type: value as 'http' | 'mcp' }))
                  }
                >
                  <SelectTrigger sx={{"width":'100%'}}>
                    <SelectValue placeholder="选择类型"  />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP 工具</SelectItem>
                    <SelectItem value="mcp">MCP 工具</SelectItem>
                  </SelectContent>
                </Select>
              </Box>
            </Box>
            <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
              <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
                <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>HTTP 方法</Box>
                <Select
                  value={formValues.method}
                  onValueChange={(value) => setFormValues((prev) => ({ ...prev, method: value }))}
                >
                  <SelectTrigger sx={{"width":'100%'}}>
                    <SelectValue placeholder="选择方法"  />
                  </SelectTrigger>
                  <SelectContent>
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Box>
              <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
                <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>URL</Box>
                <Input
                  value={formValues.url}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, url: e.target.value }))}
                  sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
                 />
              </Box>
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>请求头 (JSON)</Box>
              <Textarea
                value={formValues.headers}
                onChange={(e) => setFormValues((prev) => ({ ...prev, headers: e.target.value }))}
                rows={3}
                sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>Input Schema (JSON)</Box>
              <Textarea
                value={formValues.input_schema}
                onChange={(e) => setFormValues((prev) => ({ ...prev, input_schema: e.target.value }))}
                rows={3}
                sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>Output Schema (JSON)</Box>
              <Textarea
                value={formValues.output_schema}
                onChange={(e) => setFormValues((prev) => ({ ...prev, output_schema: e.target.value }))}
                rows={3}
                sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
              <Switch
                checked={formValues.enabled}
                onCheckedChange={(checked) => setFormValues((prev) => ({ ...prev, enabled: checked }))}
               />
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>启用工具</Box>
            </Box>
          </Box>
          <DialogFooter sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px',"borderTop":"1px solid","borderColor":'divider',"px":'24px',"py":'12px'}}>
            <UIButton
              variant="outline"
              sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              取消
            </UIButton>
            <UIButton
              sx={staffTokens.primaryButton}
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={deleteTarget ? <>删除工具 <Box component="strong" sx={{"ml":'4px'}}>{deleteTarget.name}</Box></> : '删除工具'}
        description="删除后该工具将无法被员工调用。"
        confirmText="删除"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
       />
    </Box>
  );
}

//
//
//

type ToolEditorProps = {
  mode: 'new' | 'edit';
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

function ToolEditorPage({ mode, currentUser, onLogout }: ToolEditorProps) {
  const navigate = useNavigate();
  const { toolId } = useParams<{ toolId?: string }>();
  const isEdit = mode === 'edit';
  const [values, setValues] = useState<ToolFormValues>({ ...TOOL_FORM_INITIAL });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL) || '',
  );

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      setAgentId(detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL) || '');
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setValues({ ...TOOL_FORM_INITIAL });
      return;
    }
    if (!toolId) return;
    setLoading(true);
    api
      .get<ToolRead>(`/tools/${toolId}?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`)
      .then((row) => {
        setValues({
          name: row.name,
          display_name: row.display_name || '',
          description: row.description || '',
          bucket: row.bucket || '未分桶',
          tool_type: (row.tool_type === 'mcp' ? 'mcp' : 'http'),
          method: row.method,
          url: row.url,
          enabled: row.enabled,
          headers: JSON.stringify(row.headers || {}, null, 2),
          input_schema: JSON.stringify(row.input_schema || {}, null, 2),
          output_schema: JSON.stringify(row.output_schema || {}, null, 2),
        });
      })
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载工具失败'))
      .finally(() => setLoading(false));
  }, [isEdit, toolId, agentId]);

  async function save() {
    const name = values.name.trim();
    if (!name) {
      notify.warning('请填写工具名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: TENANT_ID,
        agent_id: agentId || undefined,
        name,
        display_name: values.display_name.trim() || undefined,
        description: values.description.trim() || undefined,
        bucket: values.bucket.trim() || '未分桶',
        tool_type: values.tool_type,
        method: values.method,
        url: values.url,
        enabled: values.enabled,
        headers: safeParseJson(values.headers, {}),
        input_schema: safeParseJson(values.input_schema, {}),
        output_schema: safeParseJson(values.output_schema, {}),
        allowed_skills: [],
      };
      if (isEdit && toolId) {
        await api.put<ToolRead>(`/tools/${toolId}`, payload);
        notify.success('工具已更新');
      } else {
        await api.post<ToolRead>(`/tools`, payload);
        notify.success('工具已创建');
      }
      navigate('/staff/tools');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box component="div" aria-busy={loading} sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title={isEdit ? '编辑工具' : '新建工具'}
        description="配置 HTTP 工具的调用地址、参数与 schema。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <OutlineActionButton type="button" onClick={() => navigate('/staff/tools')}>
            返回列表
          </OutlineActionButton>
        }
       />
      <ToolForm
        values={values}
        onChange={setValues}
        onCancel={() => navigate('/staff/tools')}
        onSave={() => void save()}
        saving={saving}
       />
    </Box>
  );
}

function safeParseJson(text: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

type ToolFormProps = {
  values: ToolFormValues;
  onChange: (next: ToolFormValues) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
};

function ToolForm({ values, onChange, onCancel, onSave, saving }: ToolFormProps) {
  const set = <K extends keyof ToolFormValues>(key: K, value: ToolFormValues[K]) =>
    onChange({ ...values, [key]: value });
  return (
    <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px',"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'20px'}}>
      <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>名称</Box>
          <Input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>显示名</Box>
          <Input
            value={values.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
      </Box>
      <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>描述</Box>
        <Textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          sx={{"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
         />
      </Box>
      <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>分桶</Box>
          <Input
            value={values.bucket}
            onChange={(e) => set('bucket', e.target.value)}
            sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>类型</Box>
          <Select
            value={values.tool_type}
            onValueChange={(value) => set('tool_type', value as 'http' | 'mcp')}
          >
            <SelectTrigger sx={{"width":'100%'}}>
              <SelectValue  />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP 工具</SelectItem>
              <SelectItem value="mcp">MCP 工具</SelectItem>
            </SelectContent>
          </Select>
        </Box>
      </Box>
      <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>HTTP 方法</Box>
          <Select value={values.method} onValueChange={(value) => set('method', value)}>
            <SelectTrigger sx={{"width":'100%'}}>
              <SelectValue  />
            </SelectTrigger>
            <SelectContent>
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>URL</Box>
          <Input
            value={values.url}
            onChange={(e) => set('url', e.target.value)}
            sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
      </Box>
      <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>Input Schema (JSON)</Box>
        <Textarea
          value={values.input_schema}
          onChange={(e) => set('input_schema', e.target.value)}
          rows={4}
          sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
         />
      </Box>
      <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>Output Schema (JSON)</Box>
        <Textarea
          value={values.output_schema}
          onChange={(e) => set('output_schema', e.target.value)}
          rows={4}
          sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
         />
      </Box>
      <Box component="label" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
        <Switch checked={values.enabled} onCheckedChange={(checked) => set('enabled', checked)}  />
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>启用工具</Box>
      </Box>
      <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px'}}>
        <UIButton
          variant="outline"
          sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
          onClick={onCancel}
        >
          取消
        </UIButton>
        <UIButton
          sx={staffTokens.primaryButton}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </UIButton>
      </Box>
    </Box>
  );
}

type McpEditorProps = {
  mode: 'new' | 'edit';
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

function McpServerEditorPage({ mode, currentUser, onLogout }: McpEditorProps) {
  const navigate = useNavigate();
  const { toolId } = useParams<{ toolId?: string }>();
  const isEdit = mode === 'edit';
  const [values, setValues] = useState<McpFormValues>({ ...MCP_FORM_INITIAL });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL) || '',
  );

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      setAgentId(detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY_LOCAL) || '');
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setValues({ ...MCP_FORM_INITIAL });
      return;
    }
    if (!toolId) return;
    setLoading(true);
    api
      .get<MCPServerRead>(`/mcp-servers/${toolId}?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`)
      .then((row) => {
        setValues({
          name: row.name,
          display_name: row.display_name || '',
          description: row.description || '',
          bucket: row.bucket || '未分桶',
          transport: row.connection.transport,
          url: row.connection.url || '',
          command: row.connection.command || '',
          args: row.connection.args.join(' '),
          env: JSON.stringify(row.connection.env || {}, null, 2),
          enabled: row.enabled,
        });
      })
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载 MCP 服务器失败'))
      .finally(() => setLoading(false));
  }, [isEdit, toolId, agentId]);

  const [syncing, setSyncing] = useState(false);
  async function syncNow() {
    if (!toolId) return;
    setSyncing(true);
    try {
      type McpSyncData = {
        implemented: boolean;
        success: boolean;
        imported: string[];
        updated: string[];
        removed: string[];
        tools: number;
        error?: string;
      };
      const res = await api.post<McpSyncData>(
        `/mcp-servers/${toolId}/sync?tenant_id=${TENANT_ID}`,
      );
      const data = res;
      if (data?.implemented === false) {
        notify.warning(data.error || 'MCP 工具同步尚未实现');
        return;
      }
      if (!data?.success) {
        notify.error(data?.error || 'MCP 工具同步失败');
        return;
      }
      notify.success(
        `同步完成：新增 ${data.imported.length} / 更新 ${data.updated.length} / 移除 ${data.removed.length}（共 ${data.tools} 个工具）`,
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }

  async function save() {
    const name = values.name.trim();
    if (!name) {
      notify.warning('请填写 MCP 服务器名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: TENANT_ID,
        agent_id: agentId || undefined,
        name,
        display_name: values.display_name.trim() || undefined,
        description: values.description.trim() || undefined,
        bucket: values.bucket.trim() || '未分桶',
        connection: {
          transport: values.transport,
          url: values.url || undefined,
          command: values.command || undefined,
          args: values.args.split(/\s+/).filter(Boolean),
          env: safeParseJson(values.env, {}),
          headers: {},
        },
        enabled: values.enabled,
      };
      if (isEdit && toolId) {
        await api.put<MCPServerRead>(`/mcp-servers/${toolId}`, payload);
        notify.success('MCP 服务器已更新');
      } else {
        await api.post<MCPServerRead>(`/mcp-servers`, payload);
        notify.success('MCP 服务器已创建');
      }
      navigate('/staff/tools');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof McpFormValues>(key: K, value: McpFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Box component="div" aria-busy={loading} sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title={isEdit ? '编辑 MCP 服务器' : '新建 MCP 服务器'}
        description="配置 MCP Server 连接信息，保存后可「发现并同步工具」将远端工具导入数字员工工具目录。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <OutlineActionButton type="button" onClick={() => navigate('/staff/tools')}>
            返回列表
          </OutlineActionButton>
        }
       />
      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px',"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'20px'}}>
        <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
          <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
            <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>名称</Box>
            <Input
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
             />
          </Box>
          <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
            <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>显示名</Box>
            <Input
              value={values.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
             />
          </Box>
        </Box>
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>描述</Box>
          <Textarea
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            sx={{"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
        <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
          <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
            <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>分桶</Box>
            <Input
              value={values.bucket}
              onChange={(e) => set('bucket', e.target.value)}
              sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
             />
          </Box>
          <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
            <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>传输方式</Box>
            <Select
              value={values.transport}
              onValueChange={(value) => set('transport', value as MCPTransport)}
            >
              <SelectTrigger sx={{"width":'100%'}}>
                <SelectValue  />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
                <SelectItem value="stdio">Stdio</SelectItem>
                <SelectItem value="builtin">内置 Demo</SelectItem>
              </SelectContent>
            </Select>
          </Box>
        </Box>
        {values.transport === 'stdio' ? (
          <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(2, minmax(0,1fr))","gap":'12px'}}>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>命令</Box>
              <Input
                value={values.command}
                onChange={(e) => set('command', e.target.value)}
                sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>参数（空格分隔）</Box>
              <Input
                value={values.args}
                onChange={(e) => set('args', e.target.value)}
                sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
          </Box>
        ) : (
          <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
            <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>URL</Box>
            <Input
              value={values.url}
              onChange={(e) => set('url', e.target.value)}
              sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
             />
          </Box>
        )}
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>环境变量 (JSON)</Box>
          <Textarea
            value={values.env}
            onChange={(e) => set('env', e.target.value)}
            rows={4}
            sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
        <Box component="label" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
          <Switch checked={values.enabled} onCheckedChange={(checked) => set('enabled', checked)}  />
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>启用 MCP 服务器</Box>
        </Box>
        <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px'}}>
          {isEdit && toolId ? (
            <UIButton
              variant="outline"
              sx={{"height":'32px',"minWidth":'120px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
              onClick={() => void syncNow()}
              disabled={syncing || saving}
            >
              {syncing ? '同步中…' : '发现并同步工具'}
            </UIButton>
          ) : null}
          <UIButton
            variant="outline"
            sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
            onClick={() => navigate('/staff/tools')}
          >
            取消
          </UIButton>
          <UIButton
            sx={staffTokens.primaryButton}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? '保存中…' : '保存'}
          </UIButton>
        </Box>
      </Box>
    </Box>
  );
}

export function ToolNewPage(props: ToolPageProps = {}) {
  return <ToolEditorPage mode="new" {...props}  />;
}

export function ToolEditPage(props: ToolPageProps = {}) {
  return <ToolEditorPage mode="edit" {...props}  />;
}

export function McpServerNewPage(props: ToolPageProps = {}) {
  return <McpServerEditorPage mode="new" {...props}  />;
}

export function McpServerEditPage(props: ToolPageProps = {}) {
  return <McpServerEditorPage mode="edit" {...props}  />;
}

export function ToolTestPage({ currentUser, onLogout }: ToolPageProps = {}) {
  const navigate = useNavigate();
  const { toolId } = useParams<{ toolId?: string }>();
  const [tool, setTool] = useState<ToolRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [argumentsText, setArgumentsText] = useState('{}');
  const [resultText, setResultText] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!toolId) return;
    setLoading(true);
    api
      .get<ToolRead>(`/tools/${toolId}?tenant_id=${TENANT_ID}`)
      .then(setTool)
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载工具失败'))
      .finally(() => setLoading(false));
  }, [toolId]);

  async function runTest() {
    if (!tool) return;
    setTesting(true);
    try {
      const args = safeParseJson(argumentsText, {});
      const result = await api.post<{ data?: unknown; error?: string }>(
        `/tools/${tool.id}/test?tenant_id=${TENANT_ID}`,
        { arguments: args },
      );
      setResultText(JSON.stringify(result, null, 2));
    } catch (error) {
      setResultText(error instanceof Error ? error.message : '测试失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Box component="div" aria-busy={loading} sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title="工具测试"
        description="用测试参数直接调用已保存工具。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <OutlineActionButton type="button" onClick={() => navigate('/staff/tools')}>
            返回列表
          </OutlineActionButton>
        }
       />
      {tool ? (
        <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(1, minmax(0,1fr))","gap":'20px',"xl":{"gridTemplateColumns":"repeat(2, minmax(0,1fr))"}}}>
          <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'12px',"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'20px'}}>
            <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
              <Wrench  size={16} color="#858b9c" />
              <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>{tool.display_name || tool.name}</Box>
            </Box>
            <Box component="p" sx={{"fontSize":'12px',"color":"#858b9c"}}>{tool.description || '暂无描述'}</Box>
            <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'8px',"fontSize":'12px',"color":"#464c5e"}}>
              <span>分桶：{tool.bucket || '未分桶'}</span>
              <span>·</span>
              <span>类型：{tool.tool_type === 'mcp' ? 'MCP' : 'HTTP'}</span>
              <span>·</span>
              <span>调用：{tool.method} {tool.url}</span>
            </Box>
          </Box>
          <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'12px',"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'20px'}}>
            <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>测试参数 (JSON)</Box>
            <Textarea
              value={argumentsText}
              onChange={(e) => setArgumentsText(e.target.value)}
              rows={6}
              sx={{"fontFamily":"monospace","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
             />
            <UIButton
              type="button"
              sx={{ ...staffTokens.primaryButton, minWidth: '80px', gap: '6px', px: '12px', '&:disabled': { opacity: 0.5 } }}
              onClick={() => void runTest()}
              disabled={testing}
            >
              {testing ? '测试中…' : '运行测试'}
            </UIButton>
            {resultText ? (
              <Box component="pre" sx={{"maxHeight":'300px',"overflow":"auto","borderRadius":'10px',"bgcolor":"#f6f6f6","p":'12px',"fontFamily":"monospace","fontSize":'12px',"color":"#18181a"}}>
                {resultText}
              </Box>
            ) : null}
          </Box>
        </Box>
      ) : (
        <Box component="div" sx={{"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'24px',"textAlign":"center","fontSize":'12px',"color":"#858b9c"}}>
          {loading ? '加载中…' : '工具不存在或已删除'}
        </Box>
      )}
    </Box>
  );
}
