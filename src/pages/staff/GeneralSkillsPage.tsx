import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
  Download,
  Play,
} from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import { DataTable, type DataTableColumn } from '../../components/staff/DataTable.js';
import { Paginator } from '../../components/staff/Paginator.js';
import { StatCard } from '../../components/staff/StatCard.js';
import CodeBlock from '../../components/staff/CodeBlock.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../../components/staff/ui/dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  OutlineActionButton,
  SearchCombo,
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
  GeneralSkillRead,
} from '../../components/staff/types/index.js';
import { ExecutionBadge, type ExecutionRuntimeResponse } from '../../components/staff/ExecutionBadge.js';
import { StatusBadge } from './scheduled-tasks/StatusBadge.js';
import type { BadgeTone } from './scheduled-tasks/shared.js';

const GENERAL_SKILL_PAGE_SIZE = 10;

/** 技能状态 → 徽章色调（与 StaffDeck-main 同款映射） */
const SKILL_STATUS_BADGE: Record<GeneralSkillRead['status'], { tone: BadgeTone; text: string }> = {
  published: { tone: 'green', text: '已启用' },
  draft: { tone: 'gray', text: '草稿' },
  archived: { tone: 'red', text: '已停用' },
};

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

//
//
//
function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <Box sx={{"height":'100%',"overflow":"auto","borderRadius":'10px',"border":"1px solid","borderColor":'divider',"bgcolor":"#fcfcfd","p":'14px',"fontSize":'13px',"lineHeight":1.7,"color":"#2b2f38"}} className="skill-md-preview [&_h1]:mb-[8px] [&_h1]:mt-[4px] [&_h1]:text-[17px] [&_h1]:font-semibold [&_h2]:mb-[6px] [&_h2]:mt-[10px] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mb-[4px] [&_h3]:mt-[8px] [&_h3]:text-[14px] [&_h3]:font-semibold [&_p]:my-[6px] [&_ul]:my-[6px] [&_ul]:list-disc [&_ul]:pl-[20px] [&_ol]:my-[6px] [&_ol]:list-decimal [&_ol]:pl-[20px] [&_li]:my-[2px] [&_a]:text-[#2563eb] [&_a]:underline [&_code]:rounded-[4px] [&_code]:bg-[#eef1f6] [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:text-[12px] [&_code]:text-[#c0392b] [&_pre]:my-[8px] [&_pre]:overflow-auto [&_pre]:rounded-[8px] [&_pre]:bg-[#1e1e1e] [&_pre]:p-[10px] [&_pre]:text-[12px] [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#d8dde8] [&_blockquote]:pl-[12px] [&_blockquote]:text-[#6b7280] [&_table]:my-[8px] [&_table]:w-full [&_th]:border [&_th]:border-[#e5e7eb] [&_th]:bg-[#f6f7fb] [&_th]:px-[8px] [&_th]:py-[4px] [&_th]:text-left [&_td]:border [&_td]:border-[#e5e7eb] [&_td]:px-[8px] [&_td]:py-[4px]">
      {markdown && markdown.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      ) : (
        <Box component="span" sx={{"fontSize":'12px',"color":"#c0c6d4"}}>在左侧编写技能文档，这里会实时预览渲染效果。</Box>
      )}
    </Box>
  );
}

//
//
//
function RunCodePanel({
  title,
  code,
  language,
  defaultOpen = false,
  className,
}: {
  title: string;
  code: string;
  language?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <Box component="details" sx={{"borderRadius":'10px',"border":'1px solid',"borderColor":'divider',"bgcolor":'background.paper'}} className={`group ${className || ''}`} open={defaultOpen}>
      <Box component="summary" sx={{"display":"flex","cursor":"pointer","listStyleType":"none","alignItems":"center","justifyContent":"space-between","px":'12px',"py":'8px',"fontSize":'12px',"fontWeight":500,"color":"#464c5e"}} className="[&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <Box component="span" sx={{"fontSize":'11px',"color":"#9aa1b2","transition":"transform 0.2s"}} className="group-open:rotate-90">▶</Box>
      </Box>
      <Box component="div" sx={{"borderTop":"1px solid","borderColor":'divider',"p":'8px'}}>
        <CodeBlock code={code} language={language}  />
      </Box>
    </Box>
  );
}

//
//
//
function ClawHubDialog({
  open,
  loading,
  source,
  onSourceChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  source: string;
  onSourceChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent sx={{"position":"relative","display":"flex","width":'100%',"maxWidth":'560px',"flexDirection":"column","gap":'16px',"overflow":"hidden","borderRadius":'14px',"bgcolor":'background.paper',"px":'20px',"py":'16px',"boxShadow":"0 20px 25px rgba(0,0,0,0.15)"}}>
        <DialogHeader>
          <DialogTitle sx={{"display":"flex","alignItems":"center","gap":'6px',"fontSize":'14px',"fontWeight":400,"lineHeight":1,"color":"#757f9c"}}>
            <Download  size={14} style={{ flexShrink: 0 }} />
            从开源平台导入技能
          </DialogTitle>
        </DialogHeader>
        <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'12px'}}>
          <Box component="p" sx={{"fontSize":'12px',"lineHeight":1.6,"color":"#858b9c"}}>
            支持开源平台地址、GitHub repo/tree/raw SKILL.md 或 owner/repo 形式。提交后将真实抓取并创建为草稿技能。
          </Box>
          <Input
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
            placeholder="例如 alchaincyf/nuwa-skill 或 https://github.com/owner/repo/tree/main/skill"
            sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'12px',"color":"#17191f","outline":"none","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
        <DialogFooter sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px'}}>
          <DialogClose asChild>
            <UIButton
              variant="outline"
              disabled={loading}
              sx={{"height":'32px',"width":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"fontWeight":400,"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
            >
              取消
            </UIButton>
          </DialogClose>
          <UIButton
            disabled={loading}
            onClick={onSubmit}
            sx={staffTokens.primaryButton}
          >
            {loading ? '导入中…' : '新增'}
          </UIButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  const [runtimeConnected, setRuntimeConnected] = useState<Record<string, boolean>>({});
  const [clawhubModalOpen, setClawhubModalOpen] = useState(false);
  const [clawhubSource, setClawhubSource] = useState('');
  const [clawhubLoading, setClawhubLoading] = useState(false);

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
      connected: rows.filter((row) => !!runtimeConnected[row.slug]).length,
    }),
    [rows, runtimeConnected],
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
      //
      try {
        const rt = await api.get<ExecutionRuntimeResponse>(`/execution-runtime?tenant_id=${TENANT_ID}`);
        setRuntimeConnected(rt?.data?.generalSkills || {});
      } catch {
        setRuntimeConnected({});
      }
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

  function openClawHubImport() {
    setClawhubSource('');
    setClawhubModalOpen(true);
  }

  async function importClawHubSource() {
    setClawhubLoading(true);
    try {
      const result = await api.post<{
        implemented?: boolean;
        imported?: boolean;
        skill?: { name?: string };
        message?: string;
        error?: string;
      }>(`/general-skills/import-skillhub`, { tenant_id: TENANT_ID, source: clawhubSource });
      if (result?.implemented === false) {
        notify.warning(result.message || 'SkillHub 导入尚未实现');
      } else if (result?.imported === false) {
        notify.warning(result.error || result.message || '导入失败');
      } else {
        notify.success('已导入技能：' + (result?.skill?.name ?? ''));
        await load();
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setClawhubLoading(false);
      setClawhubModalOpen(false);
    }
  }

  const pageTitle = isOverallAgent ? '技能广场' : '技能';
  const listLabel = isOverallAgent ? '技能广场列表' : '技能列表';

  const columns: DataTableColumn<GeneralSkillRead>[] = [
    {
      key: 'name',
      title: '技能',
      render: (row) => (
        <Box component="div" sx={{"display":"flex","minWidth":0,"flexDirection":"column","gap":'2px'}}>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>{row.name}</Box>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{row.slug}</Box>
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
      key: 'homepage',
      title: '来源',
      width: 100,
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>
          {row.homepage ? '外部' : '内置'}
        </Box>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => {
        const preset = SKILL_STATUS_BADGE[row.status] || { tone: 'gray' as BadgeTone, text: row.status };
        return <StatusBadge tone={preset.tone}>{preset.text}</StatusBadge>;
      },
    },
    {
      key: 'execution',
      title: '执行链路',
      width: 170,
      render: (row) => {
        const connected = !!runtimeConnected[row.slug];
        if (connected) return <ExecutionBadge connected={true}  />;
        return (
          <Box
            component="button"
            type="button"
            onClick={() => navigate(`/staff/general-skills/${row.slug}`)}
            title="未接入执行链路：需发布且技能文档非空。点击前往编辑技能。"
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
              <DropdownMenuItem
                className={MENU_ITEM_CLASS}
                onSelect={async () => {
                  try {
                    const result = await api.post<SkillRunResult>(
                      `/general-skills/${row.slug}/run?tenant_id=${TENANT_ID}`,
                      { query: '' },
                    );
                    if (result?.success === false) {
                      notify.warning(result.error || '技能未发布或无指令内容');
                    } else {
                      notify.success('已运行通用技能');
                    }
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : '运行失败');
                  }
                }}
              >
                <Wrench  size={14} />
                运行
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
        description="管理可复用的通用技能（浏览器、MCP、查询工具等）。"
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
            {canManageCurrentScope ? (
              <>
                <OutlineActionButton
                  type="button"
                  onClick={openClawHubImport}
                >
                  <Download  size={14} />
                  导入技能
                </OutlineActionButton>
                <UIButton
                  sx={staffTokens.primaryButton}
                  onClick={() => navigate('/staff/general-skills/new')}
                >
                  <Plus  size={14} />
                  新增技能
                </UIButton>
              </>
            ) : null}
          </Box>
        }
       />

      <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'12px'}}>
        <StatCard value={stats.total} label="技能总数"  />
        <StatCard value={stats.published} label="已启用" tone="green"  />
        <StatCard value={stats.draft} label="草稿"  />
        <StatCard value={stats.archived} label="已停用" tone="red"  />
        <StatCard value={stats.connected} label="已接入执行链路" tone="green"  />
      </Box>

      {stats.total > 0 ? (
        <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px',"borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":"#fafbfc","px":'14px',"py":'10px',"fontSize":'12px',"color":"#464c5e"}}>
          <Box component="span"  sx={{"width":'6px',"height":'6px',"borderRadius":'50%',"bgcolor":"#12b76a"}} />
          {stats.connected > 0
            ? `已有 ${stats.connected} 个通用技能接入员工执行链路，员工会话中可被真实调用。`
            : '暂无通用技能接入执行链路；发布且填写技能文档的技能会自动接入。'}
        </Box>
      ) : null}

      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px'}}>
        <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","justifyContent":"space-between","gap":'12px'}}>
          <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>{listLabel}</Box>
          <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","gap":'8px'}}>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as 'all' | GeneralSkillRead['status'])}
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
              placeholder="搜索技能名称 / Slug"
             />
          </Box>
        </Box>

        <DataTable
          columns={columns}
          data={pagedRows}
          rowKey={(row) => row.slug}
          loading={loading}
          emptyText="暂无技能，点击「新增」创建一个吧"
          aria-label={listLabel}
         />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage}  />
        ) : null}
      </Box>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={
          deleteTarget ? (
            <>
              删除技能 <Box component="strong" sx={{"ml":'4px'}}>{deleteTarget.name}</Box>
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

      <ClawHubDialog
        open={clawhubModalOpen}
        loading={clawhubLoading}
        source={clawhubSource}
        onSourceChange={setClawhubSource}
        onClose={() => setClawhubModalOpen(false)}
        onSubmit={() => void importClawHubSource()}
       />
    </Box>
  );
}

//
//
//

type EditorProps = {
  mode: 'new' | 'edit';
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

type SkillRunResult = {
  slug: string;
  implemented: boolean;
  success?: boolean;
  error?: string | null;
  output?: { type?: string; instructions?: string[]; params?: Record<string, unknown> } | null;
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

  //
  const [runQuery, setRunQuery] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<SkillRunResult | null>(null);

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

  async function save(opts?: { keepOpen?: boolean }) {
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
      if (!opts?.keepOpen) navigate('/staff/general-skills');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function runSkill() {
    if (!slug) {
      notify.warning('请先保存技能再运行');
      return;
    }
    if (!runQuery.trim()) {
      notify.warning('请输入测试问题');
      return;
    }
    setRunLoading(true);
    setRunResult(null);
    try {
      const result = await api.post<SkillRunResult>(`/general-skills/${slug}/run`, {
        tenant_id: TENANT_ID,
        agent_id: agentId || undefined,
        query: runQuery,
      });
      setRunResult(result ?? null);
      if (result?.success) notify.success('运行完成');
      else if (result?.success === false) notify.warning(result.error || '运行失败');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '运行失败');
    } finally {
      setRunLoading(false);
    }
  }

  const set = <K extends keyof SkillFormValues>(key: K, value: SkillFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const runInstructions = runResult?.output?.instructions || [];
  const runConnected = isEdit && values.enabled && (values.skill_markdown || '').trim().length > 0;

  return (
    <Box component="div" aria-busy={loading} sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title={isEdit ? '编辑技能' : '新建技能'}
        description="编写技能文档，配置 Slug 与状态，并可调试运行。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <OutlineActionButton
            type="button"
            onClick={() => navigate('/staff/general-skills')}
          >
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
            <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>Slug</Box>
            <Input
              value={values.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="留空将自动生成"
              disabled={isEdit}
              sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"},"&:disabled":{"opacity":0.6}}}
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
        <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>主页 URL（可选）</Box>
          <Input
            value={values.homepage}
            onChange={(e) => set('homepage', e.target.value)}
            sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
        </Box>
        <Box component="label" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
          <Switch
            checked={values.enabled}
            onCheckedChange={(checked) => set('enabled', checked)}
           />
          <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>启用技能（发布后接入员工执行链路）</Box>
        </Box>
      </Box>

      {/* 技能文档：编辑 + 实时预览 分栏 */}
      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'10px',"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'20px'}}>
        <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"space-between"}}>
          <Box component="span" sx={{"fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>技能文档 (Markdown)</Box>
          <Box component="span" sx={{"fontSize":'11px',"color":"#9aa1b2"}}>左侧编辑 · 右侧实时预览</Box>
        </Box>
        <Box component="div" sx={{"display":"grid","minHeight":'320px',"gridTemplateColumns":"repeat(1, minmax(0,1fr))","gap":'12px',"lg":{"gridTemplateColumns":"repeat(2, minmax(0,1fr))"}}}>
          <Textarea
            value={values.skill_markdown}
            onChange={(e) => set('skill_markdown', e.target.value)}
            sx={{"minHeight":'320px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'12px',"fontFamily":"monospace","fontSize":'12px',"lineHeight":1.6,"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
          <MarkdownPreview markdown={values.skill_markdown}  />
        </Box>
      </Box>

      {/* 调试运行面板 */}
      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'12px',"borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'20px'}}>
        <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
          <Play  size={14} color="#757f9c" />
          <Box component="span" sx={{"fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>调试运行</Box>
          {isEdit ? (
            runConnected ? (
              <Box component="span" sx={{"display":"inline-flex","alignItems":"center","gap":'4px',"borderRadius":'50%',"bgcolor":"#eafbf0","px":'8px',"py":'1px',"fontSize":'11px',"fontWeight":500,"color":"#018434"}}>
                已接入执行链路
              </Box>
            ) : (
              <Box component="span" sx={{"display":"inline-flex","alignItems":"center","gap":'4px',"borderRadius":'50%',"bgcolor":"#f2f3f7","px":'8px',"py":'1px',"fontSize":'11px',"fontWeight":500,"color":"#858b9c"}}>
                未接入（需发布且文档非空）
              </Box>
            )
          ) : (
            <Box component="span" sx={{"display":"inline-flex","alignItems":"center","gap":'4px',"borderRadius":'50%',"bgcolor":"#f2f3f7","px":'8px',"py":'1px',"fontSize":'11px',"fontWeight":500,"color":"#858b9c"}}>
              保存后可运行
            </Box>
          )}
        </Box>
        <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'8px'}}>
          <Textarea
            value={runQuery}
            onChange={(e) => setRunQuery(e.target.value)}
            placeholder="输入测试问题，例如：帮我查询最近一笔退款订单的状态"
            rows={2}
            sx={{"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'12px',"fontSize":'13px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
           />
          <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end"}}>
            <UIButton
              sx={staffTokens.primaryButton}
              onClick={() => void runSkill()}
              disabled={runLoading || !isEdit}
            >
              <Play  size={13} />
              {runLoading ? '运行中…' : '运行'}
            </UIButton>
          </Box>
        </Box>

        {runResult ? (
          <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'10px'}}>
            {runResult.success ? (
              <RunCodePanel
                title="生成的技能指令 (prompt)"
                code={(runInstructions.length ? runInstructions.join('\n\n') : '（无指令内容）')}
                language="markdown"
                defaultOpen
               />
            ) : (
              <Box component="div" sx={{"borderRadius":'10px',"border":"1px solid","borderColor":"#fce3e3","bgcolor":"#fff5f5","px":'12px',"py":'10px',"fontSize":'12px',"color":"#d20b0b"}}>
                {runResult.error || '运行失败'}
              </Box>
            )}
          </Box>
        ) : (
          <Box component="div" sx={{"borderRadius":'10px',"border":"1px solid","borderStyle":"dashed","borderColor":'divider',"bgcolor":"#fafbfc","px":'12px',"py":'16px',"textAlign":"center","fontSize":'12px',"color":"#aab0bf"}}>
            运行后将在这里显示生成的技能指令与结果
          </Box>
        )}
      </Box>

      <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px'}}>
        <UIButton
          variant="outline"
          sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
          onClick={() => navigate('/staff/general-skills')}
        >
          取消
        </UIButton>
        <UIButton
          sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
          onClick={() => void save({ keepOpen: true })}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存并继续'}
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
  );
}

export function GeneralSkillNewPage(props: GeneralSkillPageProps = {}) {
  return <GeneralSkillEditorPage mode="new" {...props}  />;
}

export function GeneralSkillEditPage(props: GeneralSkillPageProps = {}) {
  return <GeneralSkillEditorPage mode="edit" {...props}  />;
}
