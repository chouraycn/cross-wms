import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import {
  Download,
  Folder,
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
  Input,
  OutlineActionButton,
  SearchCombo,
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
  formatDateTime,
} from '../../components/staff/lib/enterprise-ui.js';
import { staffTokens } from '../../components/staff/lib/staffTokens.js';
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

  //
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

  //
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

  //
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
        <Box component="div" sx={{"display":"flex","minWidth":0,"flexDirection":"column","gap":'2px'}}>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>{row.name}</Box>
          {row.description ? (
            <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{row.description}</Box>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'version',
      title: '版本',
      width: 100,
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.version || '-'}</Box>,
    },
    {
      key: 'document_count',
      title: '文档',
      width: 80,
      align: 'right',
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.document_count}</Box>,
    },
    {
      key: 'bucket_count',
      title: '目录',
      width: 80,
      align: 'right',
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.bucket_count}</Box>,
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>
          {row.status === 'active' ? '启用' : row.status === 'archived' ? '归档' : row.status}
        </Box>
      ),
    },
    {
      key: 'created_at',
      title: '创建时间',
      width: 160,
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#858b9c"}}>{formatDateTime(row.created_at)}</Box>,
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
              <Box component="button"
                type="button"
               
                aria-label="更多操作"
               sx={{"ml":"auto","display":"flex","width":'24px',"height":'24px',"alignItems":"center","justifyContent":"center","borderRadius":'6px',"color":"#858b9c","&:hover":{"bgcolor":"#f2f3f7","color":"#18181a"}}}>
                <MoreHorizontal  size={14} />
              </Box>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={MENU_CONTENT_CLASS} align="end">
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEditKb(row)}>
                <Pencil  size={14} />
                编辑
              </DropdownMenuItem>
              {effectiveAgentId ? (
                <>
                  <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onSelect={() => void syncKbFromOverall(row)}
                  >
                    <Download  size={14} />
                    同步自全局
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onSelect={() => void promoteKbToOverall(row)}
                  >
                    <Upload  size={14} />
                    提升至全局
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onSelect={() => void openRollbackKb(row)}
                  >
                    <RotateCcw  size={14} />
                    回滚版本
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
              <DropdownMenuItem
                className={MENU_ITEM_DANGER_CLASS}
                onSelect={() => setDeleteKbTarget(row)}
              >
                <Trash2  size={14} />
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
        <Box component="div" sx={{"display":"flex","minWidth":0,"flexDirection":"column","gap":'2px'}}>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>
            {row.title || row.filename}
          </Box>
          <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{row.filename}</Box>
        </Box>
      ),
    },
    {
      key: 'file_type',
      title: '类型',
      width: 80,
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.file_type}</Box>,
    },
    {
      key: 'chunk_count',
      title: '切片',
      width: 80,
      align: 'right',
      render: (row) => <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>{row.chunk_count}</Box>,
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (row) => (
        <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>
          {row.status === 'ready' ? '就绪' : row.status === 'archived' ? '归档' : row.status}
        </Box>
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
      width: 60,
      align: 'right',
      render: (row) =>
        canManageCurrentScope ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Box component="button"
                type="button"
               
                aria-label="文档操作"
               sx={{"ml":"auto","display":"flex","width":'24px',"height":'24px',"alignItems":"center","justifyContent":"center","borderRadius":'6px',"color":"#858b9c","&:hover":{"bgcolor":"#f2f3f7","color":"#18181a"}}}>
                <MoreHorizontal  size={14} />
              </Box>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={MENU_CONTENT_CLASS} align="end">
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEditDocument(row)}>
                <Pencil  size={14} />
                编辑
              </DropdownMenuItem>
              <DropdownMenuSeparator sx={{"my":'2px',"bgcolor":'divider'}}  />
              <DropdownMenuItem
                className={MENU_ITEM_DANGER_CLASS}
                onSelect={() => deleteDocument(row)}
              >
                <Trash2  size={14} />
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
    <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
      <AppHeader
        title={pageTitle}
        description="管理知识库、文档与引用来源。"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        right={
          <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
            <OutlineActionButton
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw  size={14} />
              刷新
            </OutlineActionButton>
            {canManageCurrentScope && effectiveAgentId ? (
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
                onClick={openCreateKb}
              >
                <Plus  size={14} />
                新增知识库
              </UIButton>
            ) : null}
          </Box>
        }
       />

      <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'12px'}}>
        <StatCard value={stats.total} label="知识库总数"  />
        <StatCard value={stats.active} label="启用" tone="green"  />
        <StatCard value={stats.archived} label="归档" tone="red"  />
        <StatCard value={stats.documents} label="文档"  />
      </Box>

      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'12px',"borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'16px'}}>
        <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"space-between"}}>
          <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>语义检索</Box>
          <Box component="span" sx={{"fontSize":'12px',"color":"#858b9c"}}>跨知识库向量检索（all-MiniLM-L6-v2）</Box>
        </Box>
        <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","gap":'8px'}}>
          <SearchCombo
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={() => void runKnowledgeSearch()}
            placeholder="输入问题，检索相关文档片段…"
           />
          <UIButton
            sx={staffTokens.primaryButton}
            onClick={() => void runKnowledgeSearch()}
            disabled={searchLoading}
          >
            {searchLoading ? '检索中…' : '检索'}
          </UIButton>
        </Box>
        {searchError ? <Box component="p" sx={{"fontSize":'12px',"color":"#d4380d"}}>{searchError}</Box> : null}
        {hasSearched && !searchLoading && searchHits.length === 0 && !searchError ? (
          <Box component="p" sx={{"fontSize":'12px',"color":"#858b9c"}}>未检索到相关片段。</Box>
        ) : null}
        {searchHits.length > 0 ? (
          <Box component="ul" sx={{"display":"flex","flexDirection":"column","gap":'8px'}}>
            {searchHits.map((hit, index) => (
              <Box component="li" key={index} sx={{"borderRadius":'10px',"border":"1px solid","borderColor":'divider',"bgcolor":"#fafafa","p":'12px'}}>
                <Box component="div" sx={{"mb":'4px',"display":"flex","alignItems":"center","justifyContent":"space-between","gap":'8px'}}>
                  <Box component="span" sx={{"fontSize":'12px',"fontWeight":500,"color":"#18181a"}}>
                    {hit.document?.title || hit.document?.filename || hit.bucket?.title || '未知来源'}
                  </Box>
                  <Box component="span" sx={{"fontSize":'11px',"color":"#858b9c"}}>相似度 {hit.score.toFixed(3)}</Box>
                </Box>
                <Box component="p" sx={{"whiteSpace":"pre-wrap","fontSize":'12px',"lineHeight":1.6,"color":"#4b5160"}}>{hit.chunk.content}</Box>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>

      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px'}}>
        <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","justifyContent":"space-between","gap":'12px'}}>
          <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>{listLabel}</Box>
          <Box component="div" sx={{"display":"flex","flexWrap":"wrap","alignItems":"center","gap":'8px'}}>
            <Select value={knowledgeBaseFilter} onValueChange={selectKnowledgeBase}>
              <SelectTrigger sx={{"width":'180px'}}>
                <SelectValue placeholder="全部知识库"  />
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
            <SearchCombo
              value={documentSearch}
              onChange={setDocumentSearch}
              placeholder="搜索知识库名称 / 描述"
             />
            {canManageCurrentScope ? (
              <UIButton
                sx={staffTokens.primaryButton}
                onClick={() => {
                  setDocKbId(knowledgeBaseFilter !== '__all__' ? knowledgeBaseFilter : '');
                  setDocTitle('');
                  setDocContent('');
                  setCreateDocOpen(true);
                }}
              >
                <Plus  size={14} />
                新增文档
              </UIButton>
            ) : null}
          </Box>
        </Box>

        <DataTable
          columns={kbColumns}
          data={pagedKnowledgeBases}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText={listEmptyText}
          aria-label={listLabel}
         />

        {totalPages > 1 ? (
          <Paginator page={currentPage} pageCount={totalPages} onChange={setPage}  />
        ) : null}
      </Box>

      <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'16px'}}>
        <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"space-between"}}>
          <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>文档列表</Box>
          <Box component="span" sx={{"fontSize":'12px',"color":"#858b9c"}}>共 {scopedDocuments.length} 个文档</Box>
        </Box>
        <DataTable
          columns={documentColumns}
          data={scopedDocuments}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="暂无文档"
          onRowClick={(row) => void loadBuckets(row)}
          aria-label="文档列表"
         />
      </Box>

      {selectedDocument ? (
        <Box component="section" sx={{"display":"flex","flexDirection":"column","gap":'12px'}}>
          <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"space-between"}}>
            <Box component="h3" sx={{"fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>
              引用来源 — {selectedDocument.title || selectedDocument.filename}
            </Box>
            <Box component="span" sx={{"fontSize":'12px',"color":"#858b9c"}}>共 {buckets.length} 个目录</Box>
          </Box>
          <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(1, minmax(0,1fr))","gap":'12px',"md":{"gridTemplateColumns":"repeat(2, minmax(0,1fr))"},"xl":{"gridTemplateColumns":"repeat(3, minmax(0,1fr))"}}}>
            {buckets.length === 0 ? (
              <Box component="div" sx={{"gridColumn":"1 / -1","borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"px":'16px',"py":'24px',"textAlign":"center","fontSize":'12px',"color":"#858b9c"}}>
                暂无引用来源
              </Box>
            ) : (
              buckets.map((bucket) => (
                <Box component="div"
                  key={bucket.id}
                 
                 sx={{"display":"flex","flexDirection":"column","gap":'8px',"borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'14px'}}>
                  <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'6px'}}>
                    <Folder  size={14} color="#858b9c" />
                    <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>
                      {bucket.title || bucket.bucket_key}
                    </Box>
                  </Box>
                  {bucket.summary ? (
                    <Box component="p" sx={{"display":"-webkit-box","WebkitBoxOrient":"vertical","WebkitLineClamp":2,"overflow":"hidden","fontSize":'12px',"color":"#858b9c"}}>{bucket.summary}</Box>
                  ) : null}
                  <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'12px',"fontSize":'12px',"color":"#858b9c"}}>
                    <span>{bucket.chunk_count} 切片</span>
                    <span>{formatDateTime(bucket.updated_at)}</span>
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
      ) : null}

      <Dialog open={createKbOpen} onOpenChange={(open) => !savingKb && setCreateKbOpen(open)}>
        <DialogContent sx={{"gap":0,"overflow":"hidden","borderRadius":'16px',"p":0,"position":'relative'}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            {editingKnowledgeBase ? '编辑知识库' : '新建知识库'}
          </DialogTitle>
          <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'16px',"px":'24px',"pb":'20px'}}>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>名称</Box>
              <Input
                value={knowledgeBaseDraft.name}
                onChange={(event) =>
                  setKnowledgeBaseDraft((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="请输入知识库名称"
                sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>描述</Box>
              <Textarea
                value={knowledgeBaseDraft.description}
                onChange={(event) =>
                  setKnowledgeBaseDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="请输入描述（可选）"
                rows={3}
                sx={{"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>状态</Box>
              <Select
                value={knowledgeBaseDraft.status}
                onValueChange={(value) =>
                  setKnowledgeBaseDraft((prev) => ({ ...prev, status: value as 'active' | 'archived' }))
                }
              >
                <SelectTrigger sx={{"width":'100%'}}>
                  <SelectValue placeholder="请选择状态"  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="archived">归档</SelectItem>
                </SelectContent>
              </Select>
            </Box>
          </Box>
          <DialogFooter sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px',"borderTop":"1px solid","borderColor":'divider',"px":'24px',"py":'12px'}}>
            <UIButton
              variant="outline"
              sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
              onClick={() => setCreateKbOpen(false)}
              disabled={savingKb}
            >
              取消
            </UIButton>
            <UIButton
              sx={staffTokens.primaryButton}
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
        <DialogContent sx={{"gap":0,"overflow":"hidden","borderRadius":'16px',"p":0,"position":'relative'}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            编辑文档
          </DialogTitle>
          <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'16px',"px":'24px',"pb":'20px'}}>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>标题</Box>
              <Input
                value={documentDraft.title}
                onChange={(event) =>
                  setDocumentDraft((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="请输入文档标题"
                sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>状态</Box>
              <Select
                value={documentDraft.status}
                onValueChange={(value) =>
                  setDocumentDraft((prev) => ({ ...prev, status: value as 'ready' | 'archived' }))
                }
              >
                <SelectTrigger sx={{"width":'100%'}}>
                  <SelectValue placeholder="请选择状态"  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ready">就绪</SelectItem>
                  <SelectItem value="archived">归档</SelectItem>
                </SelectContent>
              </Select>
            </Box>
          </Box>
          <DialogFooter sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px',"borderTop":"1px solid","borderColor":'divider',"px":'24px',"py":'12px'}}>
            <UIButton
              variant="outline"
              sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
              onClick={() => setEditingDocument(null)}
            >
              取消
            </UIButton>
            <UIButton
              sx={staffTokens.primaryButton}
              onClick={() => void saveDocument()}
            >
              保存
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDocOpen} onOpenChange={(open) => !savingDoc && setCreateDocOpen(open)}>
        <DialogContent sx={{"gap":0,"overflow":"hidden","borderRadius":'16px',"p":0,"position":'relative'}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            新增文档（文本入库）
          </DialogTitle>
          <Box component="div" sx={{"display":"flex","maxHeight":'60vh',"flexDirection":"column","gap":'16px',"overflowY":"auto","px":'24px',"pb":'20px'}}>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>目标知识库</Box>
              <Select value={docKbId} onValueChange={setDocKbId}>
                <SelectTrigger sx={{"width":'100%'}}>
                  <SelectValue placeholder="请选择知识库"  />
                </SelectTrigger>
                <SelectContent>
                  {visibleKnowledgeBases.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>标题</Box>
              <Input
                value={docTitle}
                onChange={(event) => setDocTitle(event.target.value)}
                placeholder="请输入文档标题"
                sx={{"height":'34px',"borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'14px',"color":"#18181a","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
            <Box component="label" sx={{"display":"flex","flexDirection":"column","gap":'6px'}}>
              <Box component="span" sx={{"fontSize":'12px',"color":"#464c5e"}}>知识文本（将自动切分并向量化）</Box>
              <textarea
                value={docContent}
                onChange={(event) => setDocContent(event.target.value)}
                placeholder="粘贴或输入知识内容，例如产品说明、FAQ、流程文档…"
                sx={{"height":'200px',"resize":"vertical","borderRadius":'10px',"border":"0.5px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'12px',"fontSize":'14px',"lineHeight":1.6,"color":"#18181a","outline":"none","&:focus-visible":{"borderColor":"#18181a","boxShadow":"none"}}}
               />
            </Box>
          </Box>
          <DialogFooter sx={{"display":"flex","alignItems":"center","justifyContent":"flex-end","gap":'8px',"borderTop":"1px solid","borderColor":'divider',"px":'24px',"py":'12px'}}>
            <UIButton
              variant="outline"
              sx={{"height":'32px',"minWidth":'80px',"borderRadius":'10px',"borderColor":'divider',"bgcolor":'background.paper',"px":'12px',"fontSize":'14px',"color":"#464c5e","&:hover":{"bgcolor":"#f6f6f6"}}}
              onClick={() => setCreateDocOpen(false)}
            >
              取消
            </UIButton>
            <UIButton
              sx={staffTokens.primaryButton}
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
              删除知识库 <Box component="strong" sx={{"ml":'4px'}}>{deleteKbTarget.name}</Box>
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
        <DialogContent sx={{"gap":0,"borderRadius":'16px',"p":0,"position":'relative'}}>
          <DialogTitle sx={{"px":'24px',"pt":'20px',"pb":'12px',"fontSize":'16px',"fontWeight":500,"color":"#18181a"}}>
            回滚知识库版本
            {rollbackKbTarget ? (
              <Box component="span" sx={{"ml":'6px',"fontSize":'13px',"fontWeight":400,"color":"#858b9c"}}>{rollbackKbTarget.name}</Box>
            ) : null}
          </DialogTitle>
          <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'12px',"px":'24px',"pb":'8px'}}>
            <Box component="p" sx={{"fontSize":'12px',"color":"#858b9c"}}>选择一个历史版本，将知识库回滚至该版本的快照。</Box>
            <Select value={rollbackKbVersion} onValueChange={setRollbackKbVersion}>
              <SelectTrigger sx={{"width":'100%'}}>
                <SelectValue placeholder="选择版本"  />
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
          </Box>
          <DialogFooter sx={{"display":"flex","justifyContent":"flex-end","gap":'8px',"px":'24px',"py":'16px'}}>
            <UIButton
              sx={{"height":'34px',"borderRadius":'10px',"bgcolor":'divider',"px":'16px',"fontSize":'12px',"color":"#18181a","&:hover":{"bgcolor":"#e8e9ef"}}}
              onClick={() => setRollbackKbTarget(null)}
              disabled={rollingBackKb}
            >
              取消
            </UIButton>
            <UIButton
              sx={staffTokens.primaryButton}
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
        icon={<Download  size={14} />}
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
    </Box>
  );
}
