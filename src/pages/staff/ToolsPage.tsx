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
  ToolRead,
  MCPServerRead,
  MCPTransport,
} from '../../components/staff/types/index.js';

const TOOL_PAGE_SIZE = 10;
const ENTERPRISE_AGENT_STORAGE_KEY_LOCAL = ENTERPRISE_AGENT_STORAGE_KEY;

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
    }),
    [visibleRows, bucketStats],
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
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-[13px] font-medium text-[#18181a]">
            {row.display_name || row.name}
          </span>
          <span className="truncate text-[12px] text-[#858b9c]">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'bucket',
      title: '分桶',
      width: 120,
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.bucket || '未分桶'}</span>,
    },
    {
      key: 'tool_type',
      title: '类型',
      width: 80,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">
          {row.tool_type === 'mcp' ? 'MCP' : 'HTTP'}
        </span>
      ),
    },
    {
      key: 'method',
      title: '调用',
      width: 140,
      render: (row) => <span className="truncate text-[12px] text-[#464c5e]">{row.method} {row.url}</span>,
    },
    {
      key: 'enabled',
      title: '状态',
      width: 80,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">{row.enabled ? '已启用' : '已停用'}</span>
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
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEdit(row)}>
                <Pencil className="size-[14px]" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                className={MENU_ITEM_CLASS}
                onSelect={() => navigate(`/staff/tools/${row.id}/test`)}
              >
                <Wrench className="size-[14px]" />
                测试
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
        description="管理 HTTP 工具与 MCP 服务器。"
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
                onClick={openCreate}
              >
                <Plus className="size-[14px]" />
                新增工具
              </UIButton>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-[12px]">
        <StatCard value={stats.total} label="工具总数" />
        <StatCard value={stats.enabled} label="已启用" tone="green" />
        <StatCard value={stats.buckets} label="分桶数" />
      </div>

      <section className="flex flex-col gap-[16px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h3 className="text-[14px] font-medium text-[#18181a]">工具列表</h3>
          <div className="flex flex-wrap items-center gap-[8px]">
            <Select value={bucketFilter} onValueChange={setBucketFilter}>
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[160px]`}>
                <SelectValue placeholder="全部分桶" />
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
            <div className={SEARCH_COMBO_CLASS}>
              <Input
                className={SEARCH_COMBO_INPUT_CLASS}
                placeholder="搜索工具名称 / URL"
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
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="暂无工具，点击「新增」创建一个吧"
          aria-label="工具列表"
        />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage} />
        ) : null}
      </section>

      <Dialog open={createOpen} onOpenChange={(open) => !saving && setCreateOpen(open)}>
        <DialogContent className="gap-0 overflow-hidden rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            {editingTool ? '编辑工具' : '新建工具'}
          </DialogTitle>
          <div className="flex max-h-[60vh] flex-col gap-[16px] overflow-y-auto px-[24px] pb-[20px]">
            <div className="grid grid-cols-2 gap-[12px]">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[#464c5e]">名称</span>
                <Input
                  value={formValues.name}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
                  className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
                />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[#464c5e]">显示名</span>
                <Input
                  value={formValues.display_name}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, display_name: e.target.value }))}
                  className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
                />
              </label>
            </div>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">描述</span>
              <Textarea
                value={formValues.description}
                onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                className="rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <div className="grid grid-cols-2 gap-[12px]">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[#464c5e]">分桶</span>
                <Input
                  value={formValues.bucket}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, bucket: e.target.value }))}
                  className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
                />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[#464c5e]">类型</span>
                <Select
                  value={formValues.tool_type}
                  onValueChange={(value) =>
                    setFormValues((prev) => ({ ...prev, tool_type: value as 'http' | 'mcp' }))
                  }
                >
                  <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP 工具</SelectItem>
                    <SelectItem value="mcp">MCP 工具</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-[12px]">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[#464c5e]">HTTP 方法</span>
                <Select
                  value={formValues.method}
                  onValueChange={(value) => setFormValues((prev) => ({ ...prev, method: value }))}
                >
                  <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                    <SelectValue placeholder="选择方法" />
                  </SelectTrigger>
                  <SelectContent>
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-[#464c5e]">URL</span>
                <Input
                  value={formValues.url}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, url: e.target.value }))}
                  className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
                />
              </label>
            </div>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">请求头 (JSON)</span>
              <Textarea
                value={formValues.headers}
                onChange={(e) => setFormValues((prev) => ({ ...prev, headers: e.target.value }))}
                rows={3}
                className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">Input Schema (JSON)</span>
              <Textarea
                value={formValues.input_schema}
                onChange={(e) => setFormValues((prev) => ({ ...prev, input_schema: e.target.value }))}
                rows={3}
                className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">Output Schema (JSON)</span>
              <Textarea
                value={formValues.output_schema}
                onChange={(e) => setFormValues((prev) => ({ ...prev, output_schema: e.target.value }))}
                rows={3}
                className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex items-center gap-[8px]">
              <Switch
                checked={formValues.enabled}
                onCheckedChange={(checked) => setFormValues((prev) => ({ ...prev, enabled: checked }))}
              />
              <span className="text-[12px] text-[#464c5e]">启用工具</span>
            </label>
          </div>
          <DialogFooter className="flex items-center justify-end gap-[8px] border-t border-[#f2f3f7] px-[24px] py-[12px]">
            <UIButton
              variant="outline"
              className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={deleteTarget ? <>删除工具 <strong className="ml-[4px]">{deleteTarget.name}</strong></> : '删除工具'}
        description="删除后该工具将无法被员工调用。"
        confirmText="删除"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub pages: ToolEditorPage (new/edit), McpServerEditorPage, ToolTestPage
// ---------------------------------------------------------------------------

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
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]" aria-busy={loading}>
      <AppHeader
        title={isEdit ? '编辑工具' : '新建工具'}
        description="配置 HTTP 工具的调用地址、参数与 schema。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <button
            type="button"
            className={OUTLINE_ACTION_BUTTON_CLASS}
            onClick={() => navigate('/staff/tools')}
          >
            返回列表
          </button>
        }
      />
      <ToolForm
        values={values}
        onChange={setValues}
        onCancel={() => navigate('/staff/tools')}
        onSave={() => void save()}
        saving={saving}
      />
    </div>
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
          <span className="text-[12px] text-[#464c5e]">显示名</span>
          <Input
            value={values.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
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
      <div className="grid grid-cols-2 gap-[12px]">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">分桶</span>
          <Input
            value={values.bucket}
            onChange={(e) => set('bucket', e.target.value)}
            className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
          />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">类型</span>
          <Select
            value={values.tool_type}
            onValueChange={(value) => set('tool_type', value as 'http' | 'mcp')}
          >
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP 工具</SelectItem>
              <SelectItem value="mcp">MCP 工具</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-[12px]">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">HTTP 方法</span>
          <Select value={values.method} onValueChange={(value) => set('method', value)}>
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">URL</span>
          <Input
            value={values.url}
            onChange={(e) => set('url', e.target.value)}
            className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
          />
        </label>
      </div>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-[#464c5e]">Input Schema (JSON)</span>
        <Textarea
          value={values.input_schema}
          onChange={(e) => set('input_schema', e.target.value)}
          rows={4}
          className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
        />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-[#464c5e]">Output Schema (JSON)</span>
        <Textarea
          value={values.output_schema}
          onChange={(e) => set('output_schema', e.target.value)}
          rows={4}
          className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
        />
      </label>
      <label className="flex items-center gap-[8px]">
        <Switch checked={values.enabled} onCheckedChange={(checked) => set('enabled', checked)} />
        <span className="text-[12px] text-[#464c5e]">启用工具</span>
      </label>
      <div className="flex items-center justify-end gap-[8px]">
        <UIButton
          variant="outline"
          className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
          onClick={onCancel}
        >
          取消
        </UIButton>
        <UIButton
          className="h-[32px] min-w-[80px] rounded-[10px] bg-[#18181a] px-[12px] text-[14px] text-white hover:bg-[#303030]"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </UIButton>
      </div>
    </section>
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
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]" aria-busy={loading}>
      <AppHeader
        title={isEdit ? '编辑 MCP 服务器' : '新建 MCP 服务器'}
        description="连接 MCP Server 并自动同步工具集。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <button
            type="button"
            className={OUTLINE_ACTION_BUTTON_CLASS}
            onClick={() => navigate('/staff/tools')}
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
            <span className="text-[12px] text-[#464c5e]">显示名</span>
            <Input
              value={values.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
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
        <div className="grid grid-cols-2 gap-[12px]">
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-[#464c5e]">分桶</span>
            <Input
              value={values.bucket}
              onChange={(e) => set('bucket', e.target.value)}
              className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-[#464c5e]">传输方式</span>
            <Select
              value={values.transport}
              onValueChange={(value) => set('transport', value as MCPTransport)}
            >
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
                <SelectItem value="stdio">Stdio</SelectItem>
                <SelectItem value="builtin">内置 Demo</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {values.transport === 'stdio' ? (
          <div className="grid grid-cols-2 gap-[12px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">命令</span>
              <Input
                value={values.command}
                onChange={(e) => set('command', e.target.value)}
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">参数（空格分隔）</span>
              <Input
                value={values.args}
                onChange={(e) => set('args', e.target.value)}
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
          </div>
        ) : (
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-[#464c5e]">URL</span>
            <Input
              value={values.url}
              onChange={(e) => set('url', e.target.value)}
              className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
            />
          </label>
        )}
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] text-[#464c5e]">环境变量 (JSON)</span>
          <Textarea
            value={values.env}
            onChange={(e) => set('env', e.target.value)}
            rows={4}
            className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
          />
        </label>
        <label className="flex items-center gap-[8px]">
          <Switch checked={values.enabled} onCheckedChange={(checked) => set('enabled', checked)} />
          <span className="text-[12px] text-[#464c5e]">启用 MCP 服务器</span>
        </label>
        <div className="flex items-center justify-end gap-[8px]">
          <UIButton
            variant="outline"
            className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
            onClick={() => navigate('/staff/tools')}
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

export function ToolNewPage(props: ToolPageProps = {}) {
  return <ToolEditorPage mode="new" {...props} />;
}

export function ToolEditPage(props: ToolPageProps = {}) {
  return <ToolEditorPage mode="edit" {...props} />;
}

export function McpServerNewPage(props: ToolPageProps = {}) {
  return <McpServerEditorPage mode="new" {...props} />;
}

export function McpServerEditPage(props: ToolPageProps = {}) {
  return <McpServerEditorPage mode="edit" {...props} />;
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
        `/tools/${tool.id}/probe?tenant_id=${TENANT_ID}`,
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
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]" aria-busy={loading}>
      <AppHeader
        title="工具测试"
        description="用测试参数直接调用已保存工具。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <button
            type="button"
            className={OUTLINE_ACTION_BUTTON_CLASS}
            onClick={() => navigate('/staff/tools')}
          >
            返回列表
          </button>
        }
      />
      {tool ? (
        <div className="grid grid-cols-1 gap-[20px] xl:grid-cols-2">
          <section className="flex flex-col gap-[12px] rounded-[14px] border border-[#f2f3f7] bg-white p-[20px]">
            <div className="flex items-center gap-[8px]">
              <Wrench className="size-[16px] text-[#858b9c]" />
              <h3 className="text-[14px] font-medium text-[#18181a]">{tool.display_name || tool.name}</h3>
            </div>
            <p className="text-[12px] text-[#858b9c]">{tool.description || '暂无描述'}</p>
            <div className="flex flex-wrap gap-[8px] text-[12px] text-[#464c5e]">
              <span>分桶：{tool.bucket || '未分桶'}</span>
              <span>·</span>
              <span>类型：{tool.tool_type === 'mcp' ? 'MCP' : 'HTTP'}</span>
              <span>·</span>
              <span>调用：{tool.method} {tool.url}</span>
            </div>
          </section>
          <section className="flex flex-col gap-[12px] rounded-[14px] border border-[#f2f3f7] bg-white p-[20px]">
            <h3 className="text-[14px] font-medium text-[#18181a]">测试参数 (JSON)</h3>
            <Textarea
              value={argumentsText}
              onChange={(e) => setArgumentsText(e.target.value)}
              rows={6}
              className="font-mono rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[12px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
            />
            <button
              type="button"
              className="h-[34px] self-end rounded-[10px] bg-[#18181a] px-[16px] text-[12px] text-white hover:bg-[#303030] disabled:opacity-50"
              onClick={() => void runTest()}
              disabled={testing}
            >
              {testing ? '测试中…' : '运行测试'}
            </button>
            {resultText ? (
              <pre className="max-h-[300px] overflow-auto rounded-[10px] bg-[#f6f6f6] p-[12px] font-mono text-[12px] text-[#18181a]">
                {resultText}
              </pre>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="rounded-[14px] border border-[#f2f3f7] bg-white p-[24px] text-center text-[12px] text-[#858b9c]">
          {loading ? '加载中…' : '工具不存在或已删除'}
        </div>
      )}
    </div>
  );
}
