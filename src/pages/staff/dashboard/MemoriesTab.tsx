import { useEffect, useMemo, useState } from 'react';
import { History, List, RefreshCw, Search } from 'lucide-react';

import { api, TENANT_ID } from '../../../components/staff/api/client.js';
import { DataTable, type DataTableColumn } from '../../../components/staff/DataTable.js';
import { DetailField } from '../../../components/staff/DetailField.js';
import { Paginator } from '../../../components/staff/Paginator.js';
import { Button as UIButton } from '../../../components/staff/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../../../components/staff/ui/index.js';
import { notify } from '../../../components/staff/ui/app-toast.js';
import { cn } from '../../../components/staff/lib/utils.js';
import { MOBILE_CARD_CLASS, formatDateTime } from '../../../components/staff/lib/enterprise-ui.js';
import type { MemoryRead } from '../../../components/staff/types/index.js';
import { StatusBadge } from '../scheduled-tasks/StatusBadge.js';
import type { BadgeTone } from '../scheduled-tasks/shared.js';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';
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
const MEMORY_KIND_TONE_CLASS: Record<BadgeTone, string> = {
  blue: 'bg-[#e8f0ff] text-[#1a71ff]',
  orange: 'bg-[#fff2e5] text-[#ff7f00]',
  green: 'bg-[#e9f7ef] text-[#2cb360]',
  red: 'bg-[#fce7e7] text-[#d20b0b]',
  gray: 'bg-[#f2f3f7] text-[#858b9c]',
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
      render: (row) => <span className="truncate">{row.username || '-'}</span>,
    },
    {
      key: 'user_id',
      title: '用户ID',
      width: 180,
      render: (row) => <span className="block truncate">{row.user_id}</span>,
    },
    {
      key: 'kinds',
      title: '类型',
      width: 120,
      render: (row) => (
        <div className="flex flex-wrap gap-[4px]">
          {row.kinds.map((kind) => (
            <MemoryKindBadge key={kind} kind={kind} />
          ))}
        </div>
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
      render: (row) => <span className="wrap-break-word">{row.preview || '-'}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      render: (row) => (
        <UIButton
          variant="link"
          onClick={() => setDetail(row)}
          className="h-auto p-0 text-[12px] font-normal text-[#1a71ff] hover:text-[#4a8dff] hover:no-underline"
        >
          查看
        </UIButton>
      ),
    },
  ];

  const renderMobileCard = (row: MemoryUserGroup) => (
    <article className={MOBILE_CARD_CLASS} key={row.key}>
      <div className="flex min-w-0 items-start justify-between gap-[10px]">
        <strong className="min-w-0 truncate text-[14px] font-semibold text-[#18181a]">
          {row.username || row.user_id}
        </strong>
        <UIButton
          variant="link"
          onClick={() => setDetail(row)}
          className="h-auto shrink-0 p-0 text-[12px] font-normal text-[#1a71ff] hover:text-[#4a8dff] hover:no-underline"
        >
          查看
        </UIButton>
      </div>
      <div className="mt-[8px] flex flex-wrap gap-[4px]">
        {row.kinds.map((kind) => (
          <MemoryKindBadge key={kind} kind={kind} />
        ))}
      </div>
      <p className="mt-[8px] line-clamp-2 text-[12px] leading-[1.55] text-[#858b9c]">{row.preview || '-'}</p>
      <div className="mt-[10px] flex items-center justify-between text-[12px] text-[#858b9c]">
        <span>{row.memories.length} 条记忆</span>
        <span>{formatDateTime(row.latest_at)}</span>
      </div>
    </article>
  );

  return (
    <>
      <section
        aria-busy={loading}
        className="relative mt-[-2px] flex w-full min-w-0 max-w-full flex-col gap-[24px] overflow-hidden rounded-[18px] bg-white p-[14px] shadow-[0_20px_42px_rgba(21,26,38,0.045)] min-[521px]:p-[18px]"
      >
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-[6px] px-[12px] text-[#757f9c]">
            <History className="size-[14px] shrink-0" />
            <span className="text-[14px] font-normal leading-none">记忆查询</span>
          </div>

          <form
            className="flex flex-wrap items-center gap-[16px]"
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
              className="h-[34px] w-[80px] gap-[4px] rounded-[10px] bg-[#18181a] px-[20px] text-[12px] font-normal text-white hover:bg-[#303030]"
            >
              <Search className="size-[14px]" />
              查询
            </UIButton>
            <UIButton
              type="button"
              variant="outline"
              onClick={resetFilter}
              disabled={loading}
              className="h-[34px] w-[80px] gap-[4px] rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white px-[20px] text-[12px] font-normal text-[#757f9c] hover:border-[#cbd3e6] hover:bg-white hover:text-[#18181a]"
            >
              <RefreshCw className={cn('size-[14px]', loading && 'animate-spin')} />
              重置
            </UIButton>
            <UIButton
              type="button"
              variant="outline"
              onClick={clearOwnMemories}
              disabled={loading || clearing}
              className="h-[34px] w-[112px] rounded-[10px] border-[0.5px] border-[#f0d3d3] bg-white px-[16px] text-[12px] font-normal text-[#c43d3d] hover:border-[#e1a8a8] hover:bg-[#fff7f7] hover:text-[#a92d2d]"
            >
              {clearing ? '清空中' : '清空我的记忆'}
            </UIButton>
          </form>

          <div className="grid gap-[10px] md:hidden">
            {groups.length ? (
              pagedItems.map(renderMobileCard)
            ) : (
              <div className="py-[40px] text-center text-[13px] text-[#858b9c]">{emptyText}</div>
            )}
          </div>

          <div className="hidden md:block">
            <DataTable
              aria-label="员工记忆"
              columns={columns}
              data={pagedItems}
              rowKey={(row) => row.key}
              loading={loading}
              emptyText={emptyText}
            />
          </div>

          {groups.length > 0 && (
            <Paginator
              aria-label="员工记忆分页"
              className="mt-0 mb-[6px]"
              page={page}
              pageCount={pageCount}
              onChange={setPage}
            />
          )}
        </div>
      </section>

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
    <label className="flex h-[34px] w-[260px] items-center overflow-hidden rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white transition-colors focus-within:border-[#18181a] max-[900px]:w-full">
      <span className="flex h-full w-[58px] shrink-0 items-center justify-center border-r-[0.5px] border-[#e3e7f1] bg-[#f6f6f6] text-[12px] text-[#858b9c]">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent px-[12px] text-[12px] text-[#17191f] outline-none placeholder:text-[#c0c6d4]"
      />
    </label>
  );
}

function MemoryKindBadge({ kind }: { kind: string }) {
  const tone = MEMORY_KIND_TONE[kind] ?? 'gray';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-[12px] py-[4px] text-[12px] leading-none capitalize whitespace-nowrap',
        MEMORY_KIND_TONE_CLASS[tone],
      )}
    >
      {kind}
    </span>
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
        className="flex max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] flex-col gap-[16px] overflow-hidden rounded-[14px] px-[20px] py-[16px] sm:max-w-[720px]"
      >
        <div className="flex items-center gap-[6px] px-[12px] text-[#757f9c]">
          <List className="size-[14px] shrink-0" />
          <DialogTitle className="text-[14px] font-normal leading-none text-[#757f9c]">
            员工记忆详情
          </DialogTitle>
        </div>

        {detail && (
          <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[12px]">
            <div className="grid grid-cols-2 gap-[10px] max-[520px]:grid-cols-1">
              <DetailField label="用户名">{detail.username || '-'}</DetailField>
              <DetailField label="用户ID">{detail.user_id}</DetailField>
              <DetailField label="记忆数">{detail.memories.length} 条</DetailField>
              <DetailField label="类型">
                <div className="flex flex-wrap gap-[4px]">
                  {detail.kinds.map((kind) => (
                    <MemoryKindBadge key={kind} kind={kind} />
                  ))}
                </div>
              </DetailField>
            </div>

            <div className="flex flex-col gap-[12px]">
              {detail.memories.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[12px] border border-[#eef0f4] bg-[#fafbfc] px-[16px] py-[12px]"
                >
                  <div className="flex flex-wrap items-center gap-[8px] text-[12px] text-[#858b9c]">
                    <StatusBadge tone={MEMORY_KIND_TONE[item.kind] ?? 'gray'}>{item.kind}</StatusBadge>
                    <span>重要度 {item.importance}</span>
                    <span>·</span>
                    <span>{formatDateTime(item.created_at)}</span>
                  </div>
                  <p className="mt-[8px] text-[13px] leading-[1.6] text-[#18181a] [word-break:break-word]">
                    {item.content}
                  </p>
                </article>
              ))}
            </div>
          </div>
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
