import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  ENTERPRISE_AGENT_STORAGE_KEY,
  AGENT_SCOPE_CHANGE_EVENT,
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
  KnowledgeBaseRead,
  KnowledgeDocumentRead,
  KnowledgeBucketRead,
} from '../../components/staff/types/index.js';

const KNOWLEDGE_PAGE_SIZE = 10;

type KnowledgeBaseDraft = {
  name: string;
  description: string;
  status: 'active' | 'archived';
};

type DocumentDraft = {
  title: string;
  status: 'ready' | 'archived';
};

type KbVersion = {
  version: string;
  name?: string;
  status?: string;
  created_at?: number;
};

type ImportItem = { id: string; label: string };

type KnowledgePageProps = {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

function isEmptyDefaultKnowledgeBase(kb: KnowledgeBaseRead): boolean {
  return (
    (kb.status === 'active' || kb.status === 'ready')
    && kb.document_count === 0
    && kb.bucket_count === 0
    && kb.chunk_count === 0
    && (!kb.name || /^(默认|default)/i.test(kb.name))
  );
}

function effectiveKnowledgeAgentId(rows: AgentProfileRead[], agentId: string): string {
  const agent = rows.find((item) => item.id === agentId);
  return agent && !agent.is_overall ? agent.id : '';
}

function resolveKnowledgeAgentScope(
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

export default function KnowledgeManagePage({ currentUser, onLogout }: KnowledgePageProps = {}) {
  const [documents, setDocuments] = useState<KnowledgeDocumentRead[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocumentRead | null>(null);
  const [buckets, setBuckets] = useState<KnowledgeBucketRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentScopeLoaded, setAgentScopeLoaded] = useState(false);
  const [knowledgeBaseDraft, setKnowledgeBaseDraft] = useState<KnowledgeBaseDraft>({
    name: '',
    description: '',
    status: 'active',
  });
  const [editingKnowledgeBase, setEditingKnowledgeBase] = useState<KnowledgeBaseRead | null>(null);
  const [createKbOpen, setCreateKbOpen] = useState(false);
  const [savingKb, setSavingKb] = useState(false);
  const [deleteKbTarget, setDeleteKbTarget] = useState<KnowledgeBaseRead | null>(null);
  const [deletingKb, setDeletingKb] = useState(false);
  const [rollbackKbTarget, setRollbackKbTarget] = useState<KnowledgeBaseRead | null>(null);
  const [rollbackKbVersions, setRollbackKbVersions] = useState<KbVersion[]>([]);
  const [rollbackKbVersion, setRollbackKbVersion] = useState('');
  const [rollingBackKb, setRollingBackKb] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSourceId, setImportSourceId] = useState('');
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importSelected, setImportSelected] = useState<string[]>([]);
  const [importLoadingItems, setImportLoadingItems] = useState(false);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>({
    title: '',
    status: 'ready',
  });
  const [editingDocument, setEditingDocument] = useState<KnowledgeDocumentRead | null>(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docKbId, setDocKbId] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  // 语义检索面板状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<
    Array<{
      chunk: { content: string; source_ref?: string | null };
      bucket?: { title: string } | null;
      document?: { title?: string | null; filename: string } | null;
      score: number;
    }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const currentAgent = useMemo(() => agents.find((item) => item.id === agentId), [agents, agentId]);
  const isOverallAgent = !currentAgent || currentAgent.is_overall;
  const canManageCurrentScope = currentAgent
    ? canManageEmployeeAgent(currentAgent, currentUser)
    : isEnterpriseAdmin(currentUser);
  const effectiveAgentId = currentAgent && !currentAgent.is_overall ? agentId : '';

  const visibleKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => !isEmptyDefaultKnowledgeBase(item)),
    [knowledgeBases],
  );

  const filteredKnowledgeBases = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    if (!query) return visibleKnowledgeBases;
    return visibleKnowledgeBases.filter((item) => {
      const searchable = [item.name, item.description, item.status, item.version, resourceCreatorName(item)]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [documentSearch, visibleKnowledgeBases]);

  const stats = useMemo(
    () => ({
      total: visibleKnowledgeBases.length,
      active: visibleKnowledgeBases.filter((item) => item.status === 'active' || item.status === 'published').length,
      archived: visibleKnowledgeBases.filter((item) => item.status === 'archived').length,
      documents: visibleKnowledgeBases.reduce((sum, item) => sum + (item.document_count || 0), 0),
    }),
    [visibleKnowledgeBases],
  );

  const totalPages = Math.max(1, Math.ceil(filteredKnowledgeBases.length / KNOWLEDGE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedKnowledgeBases = useMemo(() => {
    const start = (currentPage - 1) * KNOWLEDGE_PAGE_SIZE;
    return filteredKnowledgeBases.slice(start, start + KNOWLEDGE_PAGE_SIZE);
  }, [filteredKnowledgeBases, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [documentSearch, knowledgeBaseFilter]);

  useEffect(() => {
    void loadAgentScope();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!agentScopeLoaded) return;
    const resolvedAgentId = resolveKnowledgeAgentScope(agents, currentUser, agentId);
    if (resolvedAgentId !== agentId) {
      clearKnowledgeViewState();
      applyResolvedAgentScope(resolvedAgentId);
      return;
    }
    if (!isEnterpriseAdmin(currentUser) && !resolvedAgentId) {
      clearKnowledgeViewState();
      return;
    }
    void refresh(effectiveKnowledgeAgentId(agents, resolvedAgentId));
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

  function clearKnowledgeViewState() {
    setDocuments([]);
    setKnowledgeBases([]);
    setSelectedDocument(null);
    setBuckets([]);
  }

  async function loadAgentScope() {
    setAgentScopeLoaded(false);
    try {
      const agentRows = await api.get<AgentProfileRead[]>(`/agents?tenant_id=${TENANT_ID}`);
      setAgents(agentRows);
      const resolvedAgentId = resolveKnowledgeAgentScope(agentRows, currentUser, agentId);
      if (resolvedAgentId !== agentId) {
        clearKnowledgeViewState();
        applyResolvedAgentScope(resolvedAgentId);
      }
      setAgentScopeLoaded(true);
    } catch (error) {
      clearKnowledgeViewState();
      notify.error(error instanceof Error ? error.message : '加载员工失败');
    }
  }

  async function refresh(scopedAgentId = effectiveAgentId) {
    if (!agentScopeLoaded) return;
    if (!isEnterpriseAdmin(currentUser) && !scopedAgentId) {
      clearKnowledgeViewState();
      return;
    }
    setLoading(true);
    try {
      const suffix = scopedAgentId ? `&agent_id=${encodeURIComponent(scopedAgentId)}` : '';
      const [docRows, kbRows] = await Promise.all([
        api.get<KnowledgeDocumentRead[]>(`/knowledge/documents?tenant_id=${TENANT_ID}${suffix}`),
        api.get<KnowledgeBaseRead[]>(`/knowledge-bases?tenant_id=${TENANT_ID}${suffix}`),
      ]);
      setDocuments(docRows);
      setKnowledgeBases(kbRows);
      const scopedDocRows =
        knowledgeBaseFilter === '__all__'
          ? docRows
          : docRows.filter((item) => item.knowledge_base_id === knowledgeBaseFilter);
      const current = selectedDocument
        ? scopedDocRows.find((item) => item.id === selectedDocument.id) || scopedDocRows[0] || null
        : scopedDocRows[0] || null;
      setSelectedDocument(current);
      if (current) {
        await loadBuckets(current, false);
      } else {
        setBuckets([]);
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '刷新知识库失败');
    } finally {
      setLoading(false);
    }
  }

  async function runKnowledgeSearch() {
    const query = searchQuery.trim();
    if (!query) {
      notify.warning('请输入检索内容');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setHasSearched(true);
    try {
      const result = await api.post<{
        code: number;
        data?: { hits?: typeof searchHits; total?: number };
        message?: string;
      }>('/knowledge/search', { query, limit: 10, tenant_id: TENANT_ID });
      setSearchHits(result?.data?.hits ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '知识检索失败';
      setSearchError(msg);
      notify.error(msg);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadBuckets(document: KnowledgeDocumentRead, select = true) {
    if (select) setSelectedDocument(document);
    setBuckets([]);
    try {
      const rows = await api.get<KnowledgeBucketRead[]>(
        `/knowledge/documents/${document.id}/buckets?tenant_id=${TENANT_ID}${effectiveAgentId ? `&agent_id=${encodeURIComponent(effectiveAgentId)}` : ''}`,
      );
      setBuckets(rows);
    } catch (error) {
      setBuckets([]);
      notify.error(error instanceof Error ? error.message : '加载内部索引失败');
    }
  }

  function selectKnowledgeBase(knowledgeBaseId: string) {
    setKnowledgeBaseFilter(knowledgeBaseId);
    const nextDocument =
      knowledgeBaseId === '__all__'
        ? documents[0] || null
        : documents.find((item) => item.knowledge_base_id === knowledgeBaseId) || null;
    if (nextDocument) {
      void loadBuckets(nextDocument);
      return;
    }
    setSelectedDocument(null);
    setBuckets([]);
  }

  function openCreateKb() {
    setEditingKnowledgeBase(null);
    setKnowledgeBaseDraft({ name: '', description: '', status: 'active' });
    setCreateKbOpen(true);
  }

  function openEditKb(kb: KnowledgeBaseRead) {
    setEditingKnowledgeBase(kb);
    setKnowledgeBaseDraft({
      name: kb.name,
      description: kb.description || '',
      status: kb.status === 'archived' ? 'archived' : 'active',
    });
    setCreateKbOpen(true);
  }

  async function saveKb() {
    const name = knowledgeBaseDraft.name.trim();
    if (!name) {
      notify.warning('请输入知识库名称');
      return;
    }
    setSavingKb(true);
    try {
      const payload = {
        tenant_id: TENANT_ID,
        agent_id: effectiveAgentId || undefined,
        name,
        description: knowledgeBaseDraft.description.trim(),
        status: knowledgeBaseDraft.status,
      };
      if (editingKnowledgeBase) {
        await api.put<KnowledgeBaseRead>(`/knowledge-bases/${editingKnowledgeBase.id}`, payload);
        notify.success('知识库已更新');
      } else {
        await api.post<KnowledgeBaseRead>(`/knowledge-bases`, payload);
        notify.success('知识库已创建');
      }
      setCreateKbOpen(false);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingKb(false);
    }
  }

  async function deleteKb() {
    if (!deleteKbTarget) return;
    setDeletingKb(true);
    try {
      await api.delete(`/knowledge-bases/${deleteKbTarget.id}`);
      notify.success('知识库已删除');
      setDeleteKbTarget(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeletingKb(false);
    }
  }

  // ===================== 知识库分支版本化：sync / promote / rollback =====================
  async function syncKbFromOverall(kb: KnowledgeBaseRead) {
    if (!effectiveAgentId) return;
    try {
      await api.post(`/knowledge-bases/${kb.id}/sync-from-overall?agent_id=${encodeURIComponent(effectiveAgentId)}`, {});
      notify.success(`已同步自全局知识库「${kb.name}」`);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '同步失败');
    }
  }

  async function promoteKbToOverall(kb: KnowledgeBaseRead) {
    if (!effectiveAgentId) return;
    try {
      await api.post(`/knowledge-bases/${kb.id}/promote-to-overall?agent_id=${encodeURIComponent(effectiveAgentId)}`, {});
      notify.success(`已提升至全局知识库「${kb.name}」`);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '提升失败');
    }
  }

  async function openRollbackKb(kb: KnowledgeBaseRead) {
    try {
      const versions = await api.get<KbVersion[]>(`/knowledge-bases/${kb.id}/versions`);
      if (!versions.length) {
        notify.warning('该知识库暂无历史版本');
        return;
      }
      setRollbackKbTarget(kb);
      setRollbackKbVersions(versions);
      setRollbackKbVersion(versions[0]?.version || '');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载版本失败');
    }
  }

  async function confirmRollbackKb() {
    if (!rollbackKbTarget || !rollbackKbVersion) return;
    setRollingBackKb(true);
    try {
      await api.post(`/knowledge-bases/${rollbackKbTarget.id}/rollback`, { version: rollbackKbVersion });
      notify.success(`已回滚至版本 ${rollbackKbVersion}`);
      setRollbackKbTarget(null);
      setRollbackKbVersions([]);
      setRollbackKbVersion('');
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '回滚失败');
    } finally {
      setRollingBackKb(false);
    }
  }

  // ===================== 跨 Agent 批量导入知识库 =====================
  const importSources: ImportSourceOption[] = useMemo(() => {
    const list: ImportSourceOption[] = [{ value: 'overall', label: '全局知识库' }];
    agents
      .filter((item) => item.id !== effectiveAgentId && !item.is_overall)
      .forEach((item) => list.push({ value: item.id, label: item.name || item.id }));
    return list;
  }, [agents, effectiveAgentId]);

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
        const rows = await api.get<KnowledgeBaseRead[]>(`/knowledge-bases?tenant_id=${TENANT_ID}`);
        setImportItems(rows.map((r) => ({ id: r.id, label: r.name })));
      } else {
        const rows = await api.get<Array<{ knowledge_base_id: string }>>(
          `/agents/${sourceId}/knowledge-branches`,
        );
        setImportItems(rows.map((r) => ({ id: r.knowledge_base_id, label: r.knowledge_base_id })));
      }
      setImportSelected([]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载来源失败');
    } finally {
      setImportLoadingItems(false);
    }
  }

  async function submitImport() {
    if (!effectiveAgentId || !importSourceId || !importSelected.length) return;
    setImportLoading(true);
    try {
      const res = await api.post<{ skills: number; knowledge_bases: number }>(
        `/agents/${effectiveAgentId}/resources/import`,
        {
          source_agent_id: importSourceId,
          resource_types: ['knowledge_base'],
          knowledge_base_ids: importSelected,
        },
      );
      notify.success(`已导入 ${res.knowledge_bases} 个知识库分支`);
      resetImport();
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  }

  function openEditDocument(document: KnowledgeDocumentRead) {
    setEditingDocument(document);
    setDocumentDraft({
      title: document.title || document.filename,
      status: document.status === 'archived' ? 'archived' : 'ready',
    });
  }

  async function saveDocument() {
    if (!editingDocument) return;
    const title = documentDraft.title.trim();
    if (!title) {
      notify.warning('请输入文档标题');
      return;
    }
    try {
      await api.put<KnowledgeDocumentRead>(
        `/knowledge/documents/${editingDocument.id}`,
        {
          tenant_id: TENANT_ID,
          title,
          status: documentDraft.status,
        },
      );
      notify.success('文档已更新');
      setEditingDocument(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存文档失败');
    }
  }

  async function deleteDocument(document: KnowledgeDocumentRead) {
    try {
      await api.delete(`/knowledge/documents/${document.id}`);
      notify.success('文档已删除');
      if (selectedDocument?.id === document.id) {
        setSelectedDocument(null);
        setBuckets([]);
      }
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除文档失败');
    }
  }

  const pageTitle = isOverallAgent ? '知识库广场' : '知识库';
  const listLabel = isOverallAgent ? '知识库广场列表' : '知识库列表';
  const listEmptyText = isOverallAgent ? '暂无知识库，点击「新增」创建一个吧' : '当前员工暂无知识库';

  const kbColumns: DataTableColumn<KnowledgeBaseRead>[] = [
    {
      key: 'name',
      title: '知识库',
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-[13px] font-medium text-[#18181a]">{row.name}</span>
          {row.description ? (
            <span className="truncate text-[12px] text-[#858b9c]">{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'version',
      title: '版本',
      width: 100,
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.version || '-'}</span>,
    },
    {
      key: 'document_count',
      title: '文档',
      width: 80,
      align: 'right',
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.document_count}</span>,
    },
    {
      key: 'bucket_count',
      title: '目录',
      width: 80,
      align: 'right',
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.bucket_count}</span>,
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">
          {row.status === 'active' ? '启用' : row.status === 'archived' ? '归档' : row.status}
        </span>
      ),
    },
    {
      key: 'created_at',
      title: '创建时间',
      width: 160,
      render: (row) => <span className="text-[12px] text-[#858b9c]">{formatDateTime(row.created_at)}</span>,
    },
    {
      key: 'actions',
      title: '',
      width: 60,
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
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEditKb(row)}>
                <Pencil className="size-[14px]" />
                编辑
              </DropdownMenuItem>
              {effectiveAgentId ? (
                <>
                  <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onSelect={() => void syncKbFromOverall(row)}
                  >
                    <Download className="size-[14px]" />
                    同步自全局
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onSelect={() => void promoteKbToOverall(row)}
                  >
                    <Upload className="size-[14px]" />
                    提升至全局
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onSelect={() => void openRollbackKb(row)}
                  >
                    <RotateCcw className="size-[14px]" />
                    回滚版本
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
              <DropdownMenuItem
                className={MENU_ITEM_DANGER_CLASS}
                onSelect={() => setDeleteKbTarget(row)}
              >
                <Trash2 className="size-[14px]" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const documentColumns: DataTableColumn<KnowledgeDocumentRead>[] = [
    {
      key: 'filename',
      title: '文档',
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-[13px] font-medium text-[#18181a]">
            {row.title || row.filename}
          </span>
          <span className="truncate text-[12px] text-[#858b9c]">{row.filename}</span>
        </div>
      ),
    },
    {
      key: 'file_type',
      title: '类型',
      width: 80,
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.file_type}</span>,
    },
    {
      key: 'chunk_count',
      title: '切片',
      width: 80,
      align: 'right',
      render: (row) => <span className="text-[12px] text-[#464c5e]">{row.chunk_count}</span>,
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => (
        <span className="text-[12px] text-[#464c5e]">
          {row.status === 'ready' ? '就绪' : row.status === 'archived' ? '归档' : row.status}
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
      width: 60,
      align: 'right',
      render: (row) =>
        canManageCurrentScope ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-auto flex size-[24px] items-center justify-center rounded-[6px] text-[#858b9c] hover:bg-[#f2f3f7] hover:text-[#18181a]"
                aria-label="文档操作"
              >
                <MoreHorizontal className="size-[14px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={MENU_CONTENT_CLASS} align="end">
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEditDocument(row)}>
                <Pencil className="size-[14px]" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-[2px] bg-[#f2f3f7]" />
              <DropdownMenuItem
                className={MENU_ITEM_DANGER_CLASS}
                onSelect={() => deleteDocument(row)}
              >
                <Trash2 className="size-[14px]" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const scopedDocuments = useMemo(() => {
    if (knowledgeBaseFilter === '__all__') return documents;
    return documents.filter((item) => item.knowledge_base_id === knowledgeBaseFilter);
  }, [documents, knowledgeBaseFilter]);

  return (
    <div className="flex flex-col gap-[20px] px-[24px] py-[20px]">
      <AppHeader
        title={pageTitle}
        description="管理知识库、文档与引用来源。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className="size-[14px]" />
              刷新
            </button>
            {canManageCurrentScope && effectiveAgentId ? (
              <button
                type="button"
                className={OUTLINE_ACTION_BUTTON_CLASS}
                onClick={() => setImportOpen(true)}
              >
                <Download className="size-[14px]" />
                导入
              </button>
            ) : null}
            {canManageCurrentScope ? (
              <UIButton
                className="h-[34px] gap-[4px] rounded-[10px] bg-[#18181a] px-[16px] text-[12px] text-white hover:bg-[#303030]"
                onClick={openCreateKb}
              >
                <Plus className="size-[14px]" />
                新增知识库
              </UIButton>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-[12px]">
        <StatCard value={stats.total} label="知识库总数" />
        <StatCard value={stats.active} label="启用" tone="green" />
        <StatCard value={stats.archived} label="归档" tone="red" />
        <StatCard value={stats.documents} label="文档" />
      </div>

      <section className="flex flex-col gap-[12px] rounded-[12px] border border-[#ebedf0] bg-white p-[16px]">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-medium text-[#18181a]">语义检索</h3>
          <span className="text-[12px] text-[#858b9c]">跨知识库向量检索（all-MiniLM-L6-v2）</span>
        </div>
        <div className="flex flex-wrap items-center gap-[8px]">
          <div className={SEARCH_COMBO_CLASS}>
            <Input
              className={SEARCH_COMBO_INPUT_CLASS}
              placeholder="输入问题，检索相关文档片段…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runKnowledgeSearch();
              }}
            />
            <button
              type="button"
              className={SEARCH_COMBO_BUTTON_CLASS}
              aria-label="检索"
              onClick={() => void runKnowledgeSearch()}
            >
              <Search className="size-[14px]" />
            </button>
          </div>
          <UIButton
            className="h-[34px] gap-[4px] rounded-[10px] bg-[#18181a] px-[16px] text-[12px] text-white hover:bg-[#303030]"
            onClick={() => void runKnowledgeSearch()}
            disabled={searchLoading}
          >
            {searchLoading ? '检索中…' : '检索'}
          </UIButton>
        </div>
        {searchError ? <p className="text-[12px] text-[#d4380d]">{searchError}</p> : null}
        {hasSearched && !searchLoading && searchHits.length === 0 && !searchError ? (
          <p className="text-[12px] text-[#858b9c]">未检索到相关片段。</p>
        ) : null}
        {searchHits.length > 0 ? (
          <ul className="flex flex-col gap-[8px]">
            {searchHits.map((hit, index) => (
              <li key={index} className="rounded-[10px] border border-[#ebedf0] bg-[#fafafa] p-[12px]">
                <div className="mb-[4px] flex items-center justify-between gap-[8px]">
                  <span className="text-[12px] font-medium text-[#18181a]">
                    {hit.document?.title || hit.document?.filename || hit.bucket?.title || '未知来源'}
                  </span>
                  <span className="text-[11px] text-[#858b9c]">相似度 {hit.score.toFixed(3)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-[1.6] text-[#4b5160]">{hit.chunk.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-[16px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h3 className="text-[14px] font-medium text-[#18181a]">{listLabel}</h3>
          <div className="flex flex-wrap items-center gap-[8px]">
            <Select value={knowledgeBaseFilter} onValueChange={selectKnowledgeBase}>
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[180px]`}>
                <SelectValue placeholder="全部知识库" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部知识库</SelectItem>
                {visibleKnowledgeBases.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className={SEARCH_COMBO_CLASS}>
              <Input
                className={SEARCH_COMBO_INPUT_CLASS}
                placeholder="搜索知识库名称 / 描述"
                value={documentSearch}
                onChange={(event) => setDocumentSearch(event.target.value)}
              />
              <button type="button" className={SEARCH_COMBO_BUTTON_CLASS} aria-label="搜索">
                <Search className="size-[14px]" />
              </button>
            </div>
            {canManageCurrentScope ? (
              <UIButton
                className="h-[34px] gap-[4px] rounded-[10px] bg-[#18181a] px-[16px] text-[12px] text-white hover:bg-[#303030]"
                onClick={() => {
                  setDocKbId(knowledgeBaseFilter !== '__all__' ? knowledgeBaseFilter : '');
                  setDocTitle('');
                  setDocContent('');
                  setCreateDocOpen(true);
                }}
              >
                <Plus className="size-[14px]" />
                新增文档
              </UIButton>
            ) : null}
          </div>
        </div>

        <DataTable
          columns={kbColumns}
          data={pagedKnowledgeBases}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText={listEmptyText}
          aria-label={listLabel}
        />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage} />
        ) : null}
      </section>

      <section className="flex flex-col gap-[16px]">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-medium text-[#18181a]">文档列表</h3>
          <span className="text-[12px] text-[#858b9c]">共 {scopedDocuments.length} 个文档</span>
        </div>
        <DataTable
          columns={documentColumns}
          data={scopedDocuments}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="暂无文档"
          onRowClick={(row) => void loadBuckets(row)}
          aria-label="文档列表"
        />
      </section>

      {selectedDocument ? (
        <section className="flex flex-col gap-[12px]">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-medium text-[#18181a]">
              引用来源 — {selectedDocument.title || selectedDocument.filename}
            </h3>
            <span className="text-[12px] text-[#858b9c]">共 {buckets.length} 个目录</span>
          </div>
          <div className="grid grid-cols-1 gap-[12px] md:grid-cols-2 xl:grid-cols-3">
            {buckets.length === 0 ? (
              <div className="col-span-full rounded-[12px] border border-[#f2f3f7] bg-white px-[16px] py-[24px] text-center text-[12px] text-[#858b9c]">
                暂无引用来源
              </div>
            ) : (
              buckets.map((bucket) => (
                <div
                  key={bucket.id}
                  className="flex flex-col gap-[8px] rounded-[12px] border border-[#f2f3f7] bg-white p-[14px]"
                >
                  <div className="flex items-center gap-[6px]">
                    <Folder className="size-[14px] text-[#858b9c]" />
                    <span className="truncate text-[13px] font-medium text-[#18181a]">
                      {bucket.title || bucket.bucket_key}
                    </span>
                  </div>
                  {bucket.summary ? (
                    <p className="line-clamp-2 text-[12px] text-[#858b9c]">{bucket.summary}</p>
                  ) : null}
                  <div className="flex items-center gap-[12px] text-[12px] text-[#858b9c]">
                    <span>{bucket.chunk_count} 切片</span>
                    <span>{formatDateTime(bucket.updated_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <Dialog open={createKbOpen} onOpenChange={(open) => !savingKb && setCreateKbOpen(open)}>
        <DialogContent className="gap-0 overflow-hidden rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            {editingKnowledgeBase ? '编辑知识库' : '新建知识库'}
          </DialogTitle>
          <div className="flex flex-col gap-[16px] px-[24px] pb-[20px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">名称</span>
              <Input
                value={knowledgeBaseDraft.name}
                onChange={(event) =>
                  setKnowledgeBaseDraft((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="请输入知识库名称"
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">描述</span>
              <Textarea
                value={knowledgeBaseDraft.description}
                onChange={(event) =>
                  setKnowledgeBaseDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="请输入描述（可选）"
                rows={3}
                className="rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">状态</span>
              <Select
                value={knowledgeBaseDraft.status}
                onValueChange={(value) =>
                  setKnowledgeBaseDraft((prev) => ({ ...prev, status: value as 'active' | 'archived' }))
                }
              >
                <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="archived">归档</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter className="flex items-center justify-end gap-[8px] border-t border-[#f2f3f7] px-[24px] py-[12px]">
            <UIButton
              variant="outline"
              className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
              onClick={() => setCreateKbOpen(false)}
              disabled={savingKb}
            >
              取消
            </UIButton>
            <UIButton
              className="h-[32px] min-w-[80px] rounded-[10px] bg-[#18181a] px-[12px] text-[14px] text-white hover:bg-[#303030]"
              onClick={() => void saveKb()}
              disabled={savingKb}
            >
              {savingKb ? '保存中…' : '保存'}
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingDocument !== null}
        onOpenChange={(open) => !open && setEditingDocument(null)}
      >
        <DialogContent className="gap-0 overflow-hidden rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            编辑文档
          </DialogTitle>
          <div className="flex flex-col gap-[16px] px-[24px] pb-[20px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">标题</span>
              <Input
                value={documentDraft.title}
                onChange={(event) =>
                  setDocumentDraft((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="请输入文档标题"
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">状态</span>
              <Select
                value={documentDraft.status}
                onValueChange={(value) =>
                  setDocumentDraft((prev) => ({ ...prev, status: value as 'ready' | 'archived' }))
                }
              >
                <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ready">就绪</SelectItem>
                  <SelectItem value="archived">归档</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter className="flex items-center justify-end gap-[8px] border-t border-[#f2f3f7] px-[24px] py-[12px]">
            <UIButton
              variant="outline"
              className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
              onClick={() => setEditingDocument(null)}
            >
              取消
            </UIButton>
            <UIButton
              className="h-[32px] min-w-[80px] rounded-[10px] bg-[#18181a] px-[12px] text-[14px] text-white hover:bg-[#303030]"
              onClick={() => void saveDocument()}
            >
              保存
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDocOpen} onOpenChange={(open) => !savingDoc && setCreateDocOpen(open)}>
        <DialogContent className="gap-0 overflow-hidden rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            新增文档（文本入库）
          </DialogTitle>
          <div className="flex max-h-[60vh] flex-col gap-[16px] overflow-y-auto px-[24px] pb-[20px]">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">目标知识库</span>
              <Select value={docKbId} onValueChange={setDocKbId}>
                <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                  <SelectValue placeholder="请选择知识库" />
                </SelectTrigger>
                <SelectContent>
                  {visibleKnowledgeBases.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">标题</span>
              <Input
                value={docTitle}
                onChange={(event) => setDocTitle(event.target.value)}
                placeholder="请输入文档标题"
                className="h-[34px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white text-[14px] text-[#18181a] focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] text-[#464c5e]">知识文本（将自动切分并向量化）</span>
              <textarea
                value={docContent}
                onChange={(event) => setDocContent(event.target.value)}
                placeholder="粘贴或输入知识内容，例如产品说明、FAQ、流程文档…"
                className="h-[200px] resize-y rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white p-[12px] text-[14px] leading-[1.6] text-[#18181a] outline-none focus-visible:border-[#18181a] focus-visible:ring-0"
              />
            </label>
          </div>
          <DialogFooter className="flex items-center justify-end gap-[8px] border-t border-[#f2f3f7] px-[24px] py-[12px]">
            <UIButton
              variant="outline"
              className="h-[32px] min-w-[80px] rounded-[10px] border-[#e3e7f1] bg-white px-[12px] text-[14px] text-[#464c5e] hover:bg-[#f6f6f6]"
              onClick={() => setCreateDocOpen(false)}
            >
              取消
            </UIButton>
            <UIButton
              className="h-[32px] min-w-[80px] rounded-[10px] bg-[#18181a] px-[12px] text-[14px] text-white hover:bg-[#303030]"
              onClick={async () => {
                const title = docTitle.trim();
                const text = docContent.trim();
                const kbId = docKbId || (knowledgeBaseFilter !== '__all__' ? knowledgeBaseFilter : '');
                if (!kbId) {
                  notify.warning('请选择目标知识库');
                  return;
                }
                if (!text) {
                  notify.warning('请输入知识文本');
                  return;
                }
                setSavingDoc(true);
                try {
                  await api.post(`/knowledge/documents`, {
                    tenant_id: TENANT_ID,
                    knowledge_base_id: kbId,
                    filename: title || `文档-${Date.now()}`,
                    file_type: 'text',
                    title: title || undefined,
                    content: text,
                  });
                  notify.success('文档已入库（已向量化）');
                  setCreateDocOpen(false);
                  await refresh();
                } catch (error) {
                  notify.error(error instanceof Error ? error.message : '保存失败');
                } finally {
                  setSavingDoc(false);
                }
              }}
            >
              入库
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteKbTarget !== null}
        onOpenChange={(open) => !deletingKb && !open && setDeleteKbTarget(null)}
        title={
          deleteKbTarget ? (
            <>
              删除知识库 <strong className="ml-[4px]">{deleteKbTarget.name}</strong>
            </>
          ) : (
            '删除知识库'
          )
        }
        description="删除后知识库下的文档与引用来源将一并移除，且无法恢复。"
        confirmText="删除"
        loading={deletingKb}
        onConfirm={() => void deleteKb()}
      />

      <Dialog
        open={rollbackKbTarget !== null}
        onOpenChange={(open) => !rollingBackKb && !open && setRollbackKbTarget(null)}
      >
        <DialogContent className="gap-0 rounded-[16px] p-0">
          <DialogTitle className="px-[24px] pt-[20px] pb-[12px] text-[16px] font-medium text-[#18181a]">
            回滚知识库版本
            {rollbackKbTarget ? (
              <span className="ml-[6px] text-[13px] font-normal text-[#858b9c]">{rollbackKbTarget.name}</span>
            ) : null}
          </DialogTitle>
          <div className="flex flex-col gap-[12px] px-[24px] pb-[8px]">
            <p className="text-[12px] text-[#858b9c]">选择一个历史版本，将知识库回滚至该版本的快照。</p>
            <Select value={rollbackKbVersion} onValueChange={setRollbackKbVersion}>
              <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-full`}>
                <SelectValue placeholder="选择版本" />
              </SelectTrigger>
              <SelectContent>
                {rollbackKbVersions.map((item) => (
                  <SelectItem key={item.version} value={item.version}>
                    {item.version}
                    {item.name ? ` · ${item.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex justify-end gap-[8px] px-[24px] py-[16px]">
            <UIButton
              className="h-[34px] rounded-[10px] bg-[#f2f3f7] px-[16px] text-[12px] text-[#18181a] hover:bg-[#e8e9ef]"
              onClick={() => setRollbackKbTarget(null)}
              disabled={rollingBackKb}
            >
              取消
            </UIButton>
            <UIButton
              className="h-[34px] rounded-[10px] bg-[#18181a] px-[16px] text-[12px] text-white hover:bg-[#303030]"
              onClick={() => void confirmRollbackKb()}
              disabled={rollingBackKb || !rollbackKbVersion}
            >
              {rollingBackKb ? '回滚中…' : '确认回滚'}
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResourceImportDialog
        open={importOpen}
        loading={importLoading || importLoadingItems}
        icon={<Download className="size-[14px]" />}
        title="跨 Agent 批量导入知识库"
        sourcePlaceholder="选择复制来源"
        sources={importSources}
        sourceId={importSourceId}
        itemsLabel="选择知识库"
        items={importItems}
        selectedIds={importSelected}
        emptyText="该来源暂无可导入的知识库"
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
