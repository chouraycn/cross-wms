import { useEffect, useMemo, useState } from 'react';
import { History, List, RefreshCw, Search } from 'lucide-react';

import { api, TENANT_ID } from '../../../components/staff/api/client.js';
import { DataTable, type DataTableColumn } from '../../../components/staff/DataTable.js';
import { DetailField } from '../../../components/staff/DetailField.js';
import { Paginator } from '../../../components/staff/Paginator.js';
import { Button as UIButton } from '../../../components/staff/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../../../components/staff/ui/index.js';
import { notify } from '../../../components/staff/ui/app-toast.js';
import { Box } from '@mui/material';
import type { SxProps } from '@mui/material/styles';
import { formatDateTime } from '../../../components/staff/lib/enterprise-ui.js';
import { staffTokens } from '../../../components/staff/lib/staffTokens.js';
import type { MemoryRead } from '../../../components/staff/types/index.js';
import { StatusBadge } from '../scheduled-tasks/StatusBadge.js';
import type { BadgeTone } from '../scheduled-tasks/shared.js';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag-enterprise-agent-scope';
const MEMORY_PAGE_SIZE = 10;

type MemoryFilter = {
  username: string;
  user_id: string;
  q: string;
};

type MemoryUserGroup = {
  key: string;
  username?: string;
  user_id: string;
  memories: MemoryRead[];
  kinds: string[];
  latest_at: string;
  preview: string;
};

const EMPTY_FILTER: MemoryFilter = { username: '', user_id: '', q: '' };

const MEMORY_KIND_TONE: Record<string, BadgeTone> = {
  preference: 'blue',
  fact: 'green',
  event: 'orange',
  feedback: 'red',
};
const MEMORY_KIND_TONE_SX: Record<BadgeTone, SxProps> = {
  blue: { bgcolor: '#e8f0ff', color: '#1a71ff' },
  orange: { bgcolor: '#fff2e5', color: '#ff7f00' },
  green: { bgcolor: '#e9f7ef', color: '#2cb360' },
  red: { bgcolor: '#fce7e7', color: '#d20b0b' },
  gray: { bgcolor: '#f2f3f7', color: '#858b9c' },
};

const MEMORY_BADGE_BASE_SX: SxProps = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '9999px',
  px: '12px',
  py: '4px',
  fontSize: '12px',
  lineHeight: 'none',
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
};

const LINK_BUTTON_SX: SxProps = {
  height: 'auto',
  p: 0,
  fontSize: '12px',
  fontWeight: 400,
  color: '#1a71ff',
  textTransform: 'none',
  '&:hover': { color: '#4a8dff', textDecoration: 'none' },
};

export default function MemoriesTab() {
  const [rows, setRows] = useState<MemoryRead[]>([]);
  const [detail, setDetail] = useState<MemoryUserGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const [filter, setFilter] = useState<MemoryFilter>(EMPTY_FILTER);
  const [page, setPage] = useState(1);

  async function load(next: MemoryFilter = filter) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tenant_id: TENANT_ID });
      if (agentId) params.set('agent_id', agentId);
      if (next.username.trim()) params.set('username', next.username.trim());
      if (next.user_id.trim()) params.set('user_id', next.user_id.trim());
      if (next.q.trim()) params.set('q', next.q.trim());
      params.set('limit', '500');
      const result = await api.get<MemoryRead[]>(`/memories?${params.toString()}`);
      setRows(result);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const nextAgentId =
        (event as CustomEvent<{ agentId?: string }>).detail?.agentId ||
        window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) ||
        '';
      setAgentId(nextAgentId);
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  useEffect(() => {
    setPage(1);
    void load(filter);
  }, [agentId]);

  const groups = useMemo(() => groupMemories(rows), [rows]);
  const pageCount = Math.max(1, Math.ceil(groups.length / MEMORY_PAGE_SIZE));
  const pagedItems = useMemo(
    () => groups.slice((page - 1) * MEMORY_PAGE_SIZE, page * MEMORY_PAGE_SIZE),
    [groups, page],
  );
  const emptyText = agentId
    ? '当前员工暂无用户记忆；新的对话记忆会按员工和用户隔离沉淀。'
    : '暂无记忆';

  function resetFilter() {
    setFilter(EMPTY_FILTER);
    void load(EMPTY_FILTER);
  }

  async function clearOwnMemories() {
    const scopeText = agentId ? '当前员工下你的长期记忆' : '当前租户下你的长期记忆';
    if (!window.confirm(`将清空${scopeText}，不会影响其他用户。确定继续？`)) {
      return;
    }
    setClearing(true);
    try {
      const params = new URLSearchParams({ tenant_id: TENANT_ID });
      if (agentId) params.set('agent_id', agentId);
      const result = await api.delete<{ deleted: number }>(`/memories/me?${params.toString()}`);
      notify.success(result.deleted > 0 ? `已清空 ${result.deleted} 条记忆` : '没有可清空的记忆');
      setDetail(null);
      await load(filter);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '清空失败');
    } finally {
      setClearing(false);
    }
  }

  const columns: DataTableColumn<MemoryUserGroup>[] = [
    {
      key: 'username',
      title: '用户名',
      width: 160,
      className: 'text-[#18181a]',
      render: (row) => <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.username || '-'}</Box>,
    },
    {
      key: 'user_id',
      title: '用户ID',
      width: 180,
      render: (row) => <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.user_id}</Box>,
    },
    {
      key: 'kinds',
      title: '类型',
      width: 120,
      render: (row) => (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {row.kinds.map((kind) => (
            <MemoryKindBadge key={kind} kind={kind} />
          ))}
        </Box>
      ),
    },
    {
      key: 'count',
      title: '记忆数',
      width: 100,
      render: (row) => `${row.memories.length} 次`,
    },
    {
      key: 'latest',
      title: '最近更新',
      width: 170,
      render: (row) => formatDateTime(row.latest_at),
    },
    {
      key: 'preview',
      title: '摘要',
      className: 'whitespace-normal',
      render: (row) => <Box component="span" sx={{ wordBreak: 'break-word' }}>{row.preview || '-'}</Box>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      render: (row) => (
        <UIButton
          variant="link"
          onClick={() => setDetail(row)}
          sx={LINK_BUTTON_SX}
        >
          查看
        </UIButton>
      ),
    },
  ];

  const renderMobileCard = (row: MemoryUserGroup) => (
    <Box component="article" sx={staffTokens.mobileCard} key={row.key}>
      <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <Box component="strong" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>
          {row.username || row.user_id}
        </Box>
        <UIButton
          variant="link"
          onClick={() => setDetail(row)}
          sx={LINK_BUTTON_SX}
        >
          查看
        </UIButton>
      </Box>
      <Box sx={{ mt: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {row.kinds.map((kind) => (
          <MemoryKindBadge key={kind} kind={kind} />
        ))}
      </Box>
      <Box component="p" sx={{ mt: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '12px', lineHeight: 1.55, color: 'text.secondary' }}>{row.preview || '-'}</Box>
      <Box sx={{ mt: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'text.secondary' }}>
        <Box component="span">{row.memories.length} 条记忆</Box>
        <Box component="span">{formatDateTime(row.latest_at)}</Box>
      </Box>
    </Box>
  );

  return (
    <>
      <Box
        component="section"
        aria-busy={loading}
        sx={{
          position: 'relative',
          mt: '-2px',
          display: 'flex',
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          flexDirection: 'column',
          gap: '24px',
          overflow: 'hidden',
          borderRadius: '18px',
          bgcolor: 'background.paper',
          p: '14px',
          boxShadow: '0 20px 42px rgba(21,26,38,0.045)',
          '& > *': { minWidth: 0 },
          '@media (min-width:521px)': { p: '18px' },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
            <History size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <Box component="span" sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1 }}>记忆查询</Box>
          </Box>

          <Box
            component="form"
            sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void load(filter);
            }}
          >
            <PrefixInput
              label="用户名"
              placeholder="如 user_demo"
              value={filter.username}
              onChange={(value) => setFilter((prev) => ({ ...prev, username: value }))}
            />
            <PrefixInput
              label="用户ID"
              placeholder="如 user_demo"
              value={filter.user_id}
              onChange={(value) => setFilter((prev) => ({ ...prev, user_id: value }))}
            />
            <PrefixInput
              label="搜索"
              placeholder="用户名、用户 ID、记忆内容"
              value={filter.q}
              onChange={(value) => setFilter((prev) => ({ ...prev, q: value }))}
            />
            <UIButton
              type="submit"
              disabled={loading}
              sx={[staffTokens.primaryButton, { width: '80px' }] as SxProps}
            >
              <Search size={14} />
              查询
            </UIButton>
            <UIButton
              type="button"
              variant="outline"
              onClick={resetFilter}
              disabled={loading}
              sx={[staffTokens.outlineActionButton, { width: '80px' }] as SxProps}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
              重置
            </UIButton>
            <UIButton
              type="button"
              variant="outline"
              onClick={clearOwnMemories}
              disabled={loading || clearing}
              sx={{
                height: '34px',
                width: '112px',
                borderRadius: '10px',
                border: '0.5px solid',
                borderColor: '#f0d3d3',
                bgcolor: 'background.paper',
                px: '16px',
                fontSize: '12px',
                fontWeight: 400,
                color: '#c43d3d',
                textTransform: 'none',
                '&:hover': { borderColor: '#e1a8a8', bgcolor: '#fff7f7', color: '#a92d2d' },
              }}
            >
              {clearing ? '清空中' : '清空我的记忆'}
            </UIButton>
          </Box>

          <Box sx={{ display: 'grid', gap: '10px', '@media (min-width:768px)': { display: 'none' } }}>
            {groups.length ? (
              pagedItems.map(renderMobileCard)
            ) : (
              <Box sx={{ py: '40px', textAlign: 'center', fontSize: '13px', color: 'text.secondary' }}>{emptyText}</Box>
            )}
          </Box>

          <Box sx={{ display: 'none', '@media (min-width:768px)': { display: 'block' } }}>
            <DataTable
              aria-label="员工记忆"
              columns={columns}
              data={pagedItems}
              rowKey={(row) => row.key}
              loading={loading}
              emptyText={emptyText}
            />
          </Box>

          {groups.length > 0 && (
            <Paginator
              aria-label="员工记忆分页"
              page={page}
              pageCount={pageCount}
              onChange={setPage}
            />
          )}
        </Box>
      </Box>

      <MemoryDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function PrefixInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        height: '34px',
        width: '260px',
        alignItems: 'center',
        overflow: 'hidden',
        borderRadius: '10px',
        border: '0.5px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        transition: 'border-color 0.15s',
        '&:focus-within': { borderColor: 'text.primary' },
        '@media (max-width:900px)': { width: '100%' },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'flex',
          height: '100%',
          width: '58px',
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '0.5px solid',
          borderColor: 'divider',
          bgcolor: '#f6f6f6',
          fontSize: '12px',
          color: 'text.secondary',
        }}
      >
        {label}
      </Box>
      <Box
        component="input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        sx={{
          height: '100%',
          minWidth: 0,
          flex: 1,
          bgcolor: 'transparent',
          px: '12px',
          fontSize: '12px',
          color: '#17191f',
          outline: 'none',
          border: 0,
          '&::placeholder': { color: '#c0c6d4' },
        }}
      />
    </Box>
  );
}

function MemoryKindBadge({ kind }: { kind: string }) {
  const tone = MEMORY_KIND_TONE[kind] ?? 'gray';
  return (
    <Box
      component="span"
      sx={[MEMORY_BADGE_BASE_SX, MEMORY_KIND_TONE_SX[tone]] as SxProps}
    >
      {kind}
    </Box>
  );
}

function MemoryDetailDialog({
  detail,
  onClose,
}: {
  detail: MemoryUserGroup | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        sx={{
          display: 'flex',
          maxHeight: 'calc(100dvh - 4rem)',
          width: 'calc(100% - 2rem)',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
          borderRadius: '14px',
          px: '20px',
          py: '16px',
          '@media (min-width:640px)': { maxWidth: '720px' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
          <List size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
          <DialogTitle sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1, color: 'text.secondary' }}>
            员工记忆详情
          </DialogTitle>
        </Box>

        {detail && (
          <Box sx={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', px: '12px' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', '@media (max-width:520px)': { gridTemplateColumns: '1fr' } }}>
              <DetailField label="用户名">{detail.username || '-'}</DetailField>
              <DetailField label="用户ID">{detail.user_id}</DetailField>
              <DetailField label="记忆数">{detail.memories.length} 条</DetailField>
              <DetailField label="类型">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {detail.kinds.map((kind) => (
                    <MemoryKindBadge key={kind} kind={kind} />
                  ))}
                </Box>
              </DetailField>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {detail.memories.map((item) => (
                <Box
                  key={item.id}
                  sx={{ borderRadius: '12px', border: '1px solid', borderColor: '#eef0f4', bgcolor: '#fafbfc', px: '16px', py: '12px' }}
                >
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'text.secondary' }}>
                    <StatusBadge tone={MEMORY_KIND_TONE[item.kind] ?? 'gray'}>{item.kind}</StatusBadge>
                    <Box component="span">重要度 {item.importance}</Box>
                    <Box component="span">·</Box>
                    <Box component="span">{formatDateTime(item.created_at)}</Box>
                  </Box>
                  <Box component="p" sx={{ mt: '8px', fontSize: '13px', lineHeight: 1.6, color: 'text.primary', wordBreak: 'break-word' }}>
                    {item.content}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

function groupMemories(rows: MemoryRead[]): MemoryUserGroup[] {
  const map = new Map<string, MemoryUserGroup>();
  for (const row of rows) {
    const key = `${row.user_id}::${row.username || ''}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        username: row.username,
        user_id: row.user_id,
        memories: [],
        kinds: [],
        latest_at: row.updated_at || row.created_at,
        preview: row.content,
      };
      map.set(key, group);
    }
    group.memories.push(row);
    if (!group.kinds.includes(row.kind)) group.kinds.push(row.kind);
    const ts = row.updated_at || row.created_at;
    if (ts && ts > group.latest_at) {
      group.latest_at = ts;
      group.preview = row.content;
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.latest_at < b.latest_at ? 1 : -1));
}
