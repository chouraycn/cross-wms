import { Plus, Search } from 'lucide-react';
import Box from '@mui/material/Box';
import { UnderlineTabs, type UnderlineTabItem } from '../../components/staff/ui/index.js';
import { notify } from '../../components/staff/ui/app-toast.js';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, TENANT_ID } from '../../components/staff/api/client.js';
import { type EnterpriseAuthUser } from '../../components/staff/auth.js';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import EmployeeAvatarEditor from '../../components/staff/EmployeeAvatarEditor.js';
import EmployeeCard from '../../components/staff/EmployeeCard.js';
import EmployeeProfileEditor from '../../components/staff/EmployeeProfileEditor.js';
import {
  canManageEmployeeAgent,
  canSelectCurrentEmployeeAgent,
  employeeDisplayName,
  employeeDisplayNameWithCreator,
  employeeProfile,
} from '../../components/staff/employee.js';
import type { AgentProfileRead } from '../../components/staff/types/index.js';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

// NOTE: 内联 agent-scope-storage 行为，避免引入额外基础设施依赖
function persistSharedAgentScope(agentId: string, _userId?: string) {
  window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, agentId);
}
function emitAgentScopeChange(agentId: string) {
  window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId } }));
}

const cardBaseSx = {
  display: 'flex',
  height: '100px',
  flex: 1,
  flexBasis: '220px',
  alignItems: 'center',
  gap: '16px',
  borderRadius: '20px',
  bgcolor: '#f6f6f6',
  px: '32px',
  py: '20px',
  textAlign: 'left',
  transition: 'box-shadow 0.15s',
};

export default function AgentsPage({
  currentUser,
  isAdmin: _isAdmin = false,
  onCreateAgent,
  onLogout,
}: {
  currentUser?: EnterpriseAuthUser;
  isAdmin?: boolean;
  onCreateAgent?: () => void;
  onLogout?: () => void;
} = {}) {
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [avatarAgent, setAvatarAgent] = useState<AgentProfileRead | null>(null);
  const [profileAgent, setProfileAgent] = useState<AgentProfileRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentProfileRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectingAgentId, setSelectingAgentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'online' | 'offline' | 'pending'>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY),
  );
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const rows = await api.get<AgentProfileRead[]>(`/agents?tenant_id=${TENANT_ID}`);
      setAgents(rows);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载员工失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      setSelectedAgentId(detail?.agentId ?? window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY));
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', handler);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', handler);
  }, []);

  const employees = useMemo(
    () => agents.filter((item) => !item.is_overall && canManageEmployeeAgent(item, currentUser)),
    [agents, currentUser],
  );
  const offlineEmployees = employees.filter((item) => item.status !== 'active');
  const onlineEmployees = employees.filter((item) => item.status === 'active');
  const pendingEmployees = employees.filter((item) => {
    const metadata = item.metadata || {};
    return item.status === 'pending'
      || metadata.review_status === 'pending'
      || metadata.approval_status === 'pending'
      || metadata.audit_status === 'pending';
  });
  const filteredEmployees = employees.filter((item) => {
    const profile = employeeProfile(item);
    const keyword = searchTerm.trim().toLowerCase();
    const matchesFilter = employeeFilter === 'all'
      || (employeeFilter === 'online' && item.status === 'active')
      || (employeeFilter === 'offline' && item.status !== 'active')
      || (employeeFilter === 'pending' && pendingEmployees.includes(item));
    if (!matchesFilter) return false;
    if (!keyword) return true;
    return [
      employeeDisplayName(item),
      employeeDisplayNameWithCreator(item),
      profile.roleName,
      item.description || '',
      profile.workStyles.join(' '),
    ].some((value) => value.toLowerCase().includes(keyword));
  });

  async function selectEmployee(row: AgentProfileRead) {
    if (selectingAgentId) return;
    setSelectingAgentId(row.id);
    try {
      let selectedRow = row;
      if (!canSelectCurrentEmployeeAgent(row, currentUser, { activeOnly: true })) {
        selectedRow = await api.post<AgentProfileRead>(
          `/chat/agents/${encodeURIComponent(row.id)}/use?tenant_id=${TENANT_ID}`,
          {},
        );
        updateAgentInList(selectedRow);
      }
      setSelectedAgentId(selectedRow.id);
      persistSharedAgentScope(selectedRow.id, currentUser?.id);
      emitAgentScopeChange(selectedRow.id);
      navigate('/enterprise/dashboard');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载员工失败');
    } finally {
      setSelectingAgentId(null);
    }
  }

  function startEmployeeChat(row: AgentProfileRead) {
    navigate(`/enterprise/agents/${row.id}/chat`);
  }

  async function updateStatus(row: AgentProfileRead, status: 'active' | 'archived') {
    try {
      await api.put<AgentProfileRead>(`/agents/${row.id}`, {
        tenant_id: TENANT_ID,
        status,
        metadata: row.metadata || {},
      });
      notify.success(status === 'active' ? '员工已上线' : '员工已下线');
      await load();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '更新员工状态失败');
    }
  }

  async function updateGalleryState(row: AgentProfileRead, published: boolean) {
    try {
      const metadata = {
        ...(row.metadata || {}),
        published_to_gallery: published,
        gallery_published_at: published ? new Date().toISOString() : undefined,
        gallery_published_by: published ? currentUser?.username : undefined,
      };
      await api.put<AgentProfileRead>(`/agents/${row.id}`, {
        tenant_id: TENANT_ID,
        metadata,
      });
      notify.success(published ? '已发布到广场' : '已从广场下架');
      await load();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '更新广场状态失败');
    }
  }

  async function confirmDelete() {
    const row = deleteTarget;
    if (!row) return;
    setDeleting(true);
    try {
      await api.delete(`/agents/${row.id}?tenant_id=${TENANT_ID}`);
      if (window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) === row.id) {
        const nextAgent = employees.find((item) => item.id !== row.id && item.status === 'active')
          || employees.find((item) => item.id !== row.id);
        if (nextAgent) {
          window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, nextAgent.id);
          window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId: nextAgent.id } }));
        } else {
          window.localStorage.removeItem(ENTERPRISE_AGENT_STORAGE_KEY);
          window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId: '' } }));
        }
      }
      notify.success('员工已删除');
      setDeleteTarget(null);
      await load();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除员工失败');
    } finally {
      setDeleting(false);
    }
  }

  function updateAgentInList(row: AgentProfileRead) {
    setAgents((current) => current.map((item) => (item.id === row.id ? row : item)));
  }

  const employeeTabs: UnderlineTabItem<typeof employeeFilter>[] = [
    { value: 'all', label: '全部员工' },
    { value: 'online', label: '在线员工' },
    { value: 'offline', label: '下线员工' },
  ];

  const summaryStats: { key: typeof employeeFilter; value: number; label: string; sub: string }[] = [
    { key: 'all', value: employees.length, label: '员工总数', sub: `${onlineEmployees.length}位在线` },
    { key: 'offline', value: offlineEmployees.length, label: '下线员工', sub: '0位在线' },
    {
      key: 'pending',
      value: pendingEmployees.length,
      label: '待审批',
      sub: `${pendingEmployees.filter((item) => item.status === 'active').length}位在线`,
    },
  ];

  return (
    <Box
      sx={{
        minHeight: '100%',
        boxSizing: 'border-box',
        px: '48px',
        pt: '32px',
        pb: '43px',
        '@media (max-width: 900px)': { px: '16px' },
      }}
      aria-busy={loading}
    >
      <AppHeader
        onLogout={onLogout}
        userName={currentUser?.username}
        left={(
          <Box
            sx={{
              display: 'flex',
              height: '50px',
              width: '100%',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '20px',
              bgcolor: 'background.paper',
              px: '20px',
              color: '#757F9C',
              boxShadow: '0 0 6px rgba(0,0,0,0.05)',
            }}
          >
            <Search size={20} style={{ flexShrink: 0 }} />
            <Box
              component="input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索"
              aria-label="搜索员工"
              sx={{
                minWidth: 0,
                flex: 1,
                border: 0,
                bgcolor: 'transparent',
                fontSize: '14px',
                color: '#18181A',
                outline: 'none',
                '&::placeholder': { color: '#757F9C' },
              }}
            />
          </Box>
        )}
      />


      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '20px', my: '36px' }} aria-label="数字员工统计">
        {summaryStats.map((stat) => (
          <Box
            key={stat.key}
            component="button"
            type="button"
            aria-pressed={employeeFilter === stat.key}
            onClick={() => setEmployeeFilter(stat.key)}
            sx={cardBaseSx}
          >
            <Box component="span" sx={{ flexShrink: 0, fontSize: '34px', fontWeight: 600, lineHeight: 'none', color: '#18181A' }}>{stat.value}</Box>
            <Box component="span" sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: '4px' }}>
              <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: '14px', color: '#464C5E' }}>{stat.label}</Box>
              <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#757F9C' }}>{stat.sub}</Box>
            </Box>
          </Box>
        ))}
        <Box
          component="button"
          type="button"
          data-guide-target="agents-create"
          onClick={onCreateAgent}
          sx={{ ...cardBaseSx, '&:hover': { boxShadow: '0 16px 30px 0 rgba(0,0,0,0.10)' } }}
        >
          <Box component="span" sx={{ display: 'grid', width: '38px', height: '38px', flexShrink: 0, placeItems: 'center', color: '#18181A' }}>
            <Plus size={38} />
          </Box>
          <Box component="span" sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: '4px' }}>
            <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: '14px', color: '#464C5E' }}>创建新员工</Box>
            <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#757F9C' }}>几步搭好你的数字员工</Box>
          </Box>
        </Box>
      </Box>

      <UnderlineTabs
        sx={{ mb: '16px' }}
        aria-label="数字员工分类"
        value={employeeFilter}
        onChange={setEmployeeFilter}
        items={employeeTabs}
      />

      <Box
        sx={{
          display: 'grid',
          gridAutoRows: 'minmax(262px,auto)',
          gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
          alignContent: 'start',
          gap: '32px',
          '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
          '@media (min-width: 1024px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
          '@media (min-width: 1536px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
          '@media (max-width: 900px)': { gap: '18px' },
        }}
      >
        {filteredEmployees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            busy={selectingAgentId === employee.id}
            canManage={canManageEmployeeAgent(employee, currentUser)}
            selected={employee.id === selectedAgentId}
            onOpen={() => void selectEmployee(employee)}
            onStatus={(status) => void updateStatus(employee, status)}
            onGallery={(published) => void updateGalleryState(employee, published)}
            onDelete={() => setDeleteTarget(employee)}
            onAvatar={() => setAvatarAgent(employee)}
            onEdit={() => setProfileAgent(employee)}
            onChat={() => startEmployeeChat(employee)}
          />
        ))}
        {!filteredEmployees.length && (
          <AgentsEmptyState />
        )}
      </Box>
      <EmployeeAvatarEditor
        agent={avatarAgent}
        open={Boolean(avatarAgent)}
        onClose={() => setAvatarAgent(null)}
        onSaved={updateAgentInList}
      />
      <EmployeeProfileEditor
        agent={profileAgent}
        open={Boolean(profileAgent)}
        currentUser={currentUser}
        onClose={() => setProfileAgent(null)}
        onSaved={updateAgentInList}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        loading={deleting}
        title={`删除员工「${deleteTarget ? employeeDisplayName(deleteTarget) : ''}」？`}
        description="删除后该员工的所有配置将一并移除，操作不可撤销。"
        onConfirm={() => void confirmDelete()}
      />
    </Box>
  );
}

function AgentsEmptyState() {
  return (
    <Box
      sx={{
        display: 'flex',
        height: '262px',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '20px',
        border: '1px dashed #e4e9f2',
        bgcolor: '#fbfcfe',
        px: '24px',
        textAlign: 'center',
      }}
    >
      <Box sx={{ display: 'flex', maxWidth: '210px', flexDirection: 'column', alignItems: 'center' }}>
        <Box
          sx={{
            display: 'grid',
            width: '34px',
            height: '34px',
            placeItems: 'center',
            borderRadius: '12px',
            bgcolor: 'background.paper',
            color: '#98a2b3',
            boxShadow: '0 0 0 1px #edf1f6, 0 1px 8px rgba(70,76,94,0.06)',
          }}
        >
          <Search size={16} />
        </Box>
        <Box component="p" sx={{ mt: '12px', fontSize: '14px', fontWeight: 500, lineHeight: '20px', color: '#7f879a' }}>
          没有匹配的数字员工
        </Box>
        <Box component="p" sx={{ mt: '4px', fontSize: '11px', lineHeight: '17px', color: '#a7adbb' }}>
          调整筛选条件，或换个关键词再试试
        </Box>
      </Box>
    </Box>
  );
}
