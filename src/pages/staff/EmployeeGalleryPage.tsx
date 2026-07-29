import { Search } from 'lucide-react';
import Box from '@mui/material/Box';
import { UnderlineTabs, type UnderlineTabItem } from '../../components/staff/ui/index.js';
import { notify } from '../../components/staff/ui/app-toast.js';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, TENANT_ID } from '../../components/staff/api/client.js';
import { isGalleryEmployee, type EnterpriseAuthUser } from '../../components/staff/auth.js';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import EmployeeAvatarEditor from '../../components/staff/EmployeeAvatarEditor.js';
import EmployeeCard from '../../components/staff/EmployeeCard.js';
import EmployeeProfileEditor from '../../components/staff/EmployeeProfileEditor.js';
import {
  canManageEmployeeAgent,
  employeeDisplayName,
  employeeDisplayNameWithCreator,
  employeeProfile,
  isMyEmployeeAgent,
  visibleEmployeeAgents,
} from '../../components/staff/employee.js';
import type { AgentProfileRead } from '../../components/staff/types/index.js';
import { staffdeckContent } from '../../assets/staffdeck-assets';

const SD1_SHOWCASE: Array<{ src: string; label: string }> = [
  { src: staffdeckContent.sd1CardLogs, label: '对话日志' },
  { src: staffdeckContent.sd1CardScheduled, label: '定时任务' },
  { src: staffdeckContent.sd1CardTools, label: '工具调用' },
  { src: staffdeckContent.sd1Node18360, label: '执行节点' },
  { src: staffdeckContent.sd1Node18409, label: '检索节点' },
  { src: staffdeckContent.sd1Node18506, label: '技能节点' },
  { src: staffdeckContent.sd1Node18604, label: '反思节点' },
  { src: staffdeckContent.sd1Node18627, label: '生成节点' },
  { src: staffdeckContent.sd1Node18645, label: '结果节点' },
];

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

type GalleryScope = 'all' | 'mine' | 'gallery';

export default function EmployeeGalleryPage({
  currentUser,
  isAdmin: _isAdmin = false,
  onStartChat,
  onLogout,
}: {
  currentUser?: EnterpriseAuthUser;
  isAdmin?: boolean;
  onStartChat?: (agent: AgentProfileRead) => void | Promise<void>;
  onLogout?: () => void;
} = {}) {
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [avatarAgent, setAvatarAgent] = useState<AgentProfileRead | null>(null);
  const [profileAgent, setProfileAgent] = useState<AgentProfileRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentProfileRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingAgentId, setStartingAgentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState<GalleryScope>('all');
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

  const availableAgents = useMemo(
    () => visibleEmployeeAgents(agents, currentUser, { activeOnly: true }),
    [agents, currentUser],
  );
  const myEmployees = useMemo(
    () => availableAgents.filter((item) => isMyEmployeeAgent(item, currentUser)),
    [availableAgents, currentUser],
  );
  const galleryEmployees = useMemo(() => {
    const myIds = new Set(myEmployees.map((item) => item.id));
    return availableAgents.filter((item) => isGalleryEmployee(item) && !myIds.has(item.id));
  }, [availableAgents, myEmployees]);

  const scopedEmployees = scope === 'mine'
    ? myEmployees
    : scope === 'gallery'
      ? galleryEmployees
      : availableAgents;

  const filteredEmployees = scopedEmployees.filter((item) => {
    const profile = employeeProfile(item);
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return true;
    return [
      employeeDisplayName(item),
      employeeDisplayNameWithCreator(item),
      profile.roleName,
      item.description || '',
      profile.workStyles.join(' '),
      profile.expertiseTags.join(' '),
    ].some((value) => value.toLowerCase().includes(keyword));
  });

  async function startEmployeeChat(row: AgentProfileRead) {
    if (startingAgentId) return;
    setStartingAgentId(row.id);
    try {
      if (onStartChat) {
        await onStartChat(row);
        return;
      }
      navigate(`/enterprise/agents/${row.id}/chat`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '发起对话失败');
    } finally {
      setStartingAgentId(null);
    }
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
        const nextAgent = availableAgents.find((item) => item.id !== row.id && item.status === 'active')
          || availableAgents.find((item) => item.id !== row.id);
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

  const galleryTabs: UnderlineTabItem<GalleryScope>[] = [
    { value: 'all', label: '所有员工' },
    { value: 'mine', label: '我的数字员工' },
    { value: 'gallery', label: '数字员工广场' },
  ];

  const hasSearchTerm = Boolean(searchTerm.trim());
  const emptyText = hasSearchTerm ? '没有匹配的数字员工' : '暂无数字员工';
  const emptyDescription = hasSearchTerm
    ? '换个关键词，或切换员工分类再试试'
    : '当前分类还没有可用员工';

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
              aria-label="搜索数字员工"
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

      <UnderlineTabs
        sx={{ mt: '36px', mb: '16px', '@media (max-width: 560px)': { width: '100%' } }}
        aria-label="数字员工分类"
        value={scope}
        onChange={setScope}
        items={galleryTabs}
        tabClassName="max-[560px]:min-h-[54px] max-[560px]:w-auto max-[560px]:flex-1 max-[560px]:px-[6px] max-[560px]:text-[12px] max-[560px]:leading-[16px]"
      />

      <Box sx={{ mb: '28px' }}>
        <Box component="h2" sx={{ m: 0, mb: '12px', fontSize: '16px', fontWeight: 600, color: '#18181a' }}>能力演示</Box>
        <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(200px, 1fr)', gap: '14px', overflowX: 'auto', pb: '6px' }}>
          {SD1_SHOWCASE.map((shot) => (
            <Box
              key={shot.label}
              sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden', flexShrink: 0 }}
            >
              <Box component="img" src={shot.src} alt={shot.label} sx={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block', bgcolor: '#f3f4f6' }} />
              <Box component="span" sx={{ display: 'block', px: '10px', py: '8px', fontSize: '12px', color: '#464c5e' }}>{shot.label}</Box>
            </Box>
          ))}
        </Box>
      </Box>

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
            busy={startingAgentId === employee.id}
            canManage={canManageEmployeeAgent(employee, currentUser)}
            showMenu={false}
            onOpen={() => void startEmployeeChat(employee)}
            onStatus={(status) => void updateStatus(employee, status)}
            onGallery={(published) => void updateGalleryState(employee, published)}
            onDelete={() => setDeleteTarget(employee)}
            onAvatar={() => setAvatarAgent(employee)}
            onEdit={() => setProfileAgent(employee)}
            onChat={() => void startEmployeeChat(employee)}
          />
        ))}
        {!filteredEmployees.length && (
          <EmployeeGalleryEmptyState title={emptyText} description={emptyDescription} />
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

function EmployeeGalleryEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
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
          {title}
        </Box>
        <Box component="p" sx={{ mt: '4px', fontSize: '11px', lineHeight: '17px', color: '#a7adbb' }}>
          {description}
        </Box>
      </Box>
    </Box>
  );
}
