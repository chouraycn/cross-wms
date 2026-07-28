import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, AlignJustify, Plus, Search } from 'lucide-react';

import { api, TENANT_ID } from '../../../components/staff/api/client.js';
import { ConfirmDialog } from '../../../components/staff/ConfirmDialog.js';
import { DataTable, type DataTableColumn } from '../../../components/staff/DataTable.js';
import { Paginator } from '../../../components/staff/Paginator.js';
import { StatCard } from '../../../components/staff/StatCard.js';
import { Button as UIButton } from '../../../components/staff/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../../../components/staff/ui/index.js';
import { Box } from '@mui/material';
import type { SxProps } from '@mui/material/styles';
import { notify } from '../../../components/staff/ui/app-toast.js';
import { staffTokens } from '../../../components/staff/lib/staffTokens.js';
import type { AgentProfileRead, ScheduledTaskRead, ScheduledTaskRunRead } from '../../../components/staff/types/index.js';
import { StatusBadge, TaskRunResultBadge, TaskStatusBadge } from '../scheduled-tasks/StatusBadge.js';
import { TaskActionsMenu } from '../scheduled-tasks/TaskActionsMenu.js';
import { TaskSection } from '../scheduled-tasks/TaskSection.js';
import {
  ENTERPRISE_AGENT_STORAGE_KEY,
  RUN_FILTER_TABS,
  TASK_FILTER_TABS,
  TASK_PAGE_SIZE,
  formatSchedule,
  formatTime,
  matchesRunFilter,
  matchesTaskFilter,
  type RunListFilter,
  type TaskListFilter,
} from '../scheduled-tasks/shared.js';

const MOBILE_CARD_HEAD_SX: SxProps = {
  display: 'flex',
  minWidth: 0,
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '10px',
};
const MOBILE_META_SX: SxProps = {
  mt: '12px',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  '@media (max-width:520px)': { gridTemplateColumns: '1fr' },
  '& > span': {
    minWidth: 0,
    borderRadius: '10px',
    border: '1px solid',
    borderColor: '#eef0f4',
    bgcolor: '#fafbfc',
    px: '10px',
    py: '9px',
    fontSize: '12px',
    lineHeight: 1.45,
    color: 'text.primary',
    overflowWrap: 'anywhere',
  },
  '& b': { mb: '3px', display: 'block', fontSize: '11px', fontWeight: 600, color: 'text.secondary' },
};
const MOBILE_TITLE_SX: SxProps = {
  minWidth: 0,
  wordBreak: 'break-word',
  fontSize: '14px',
  fontWeight: 600,
  color: 'text.primary',
};
const MOBILE_SUMMARY_SX: SxProps = {
  mt: '8px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontSize: '12px',
  lineHeight: 1.55,
  color: 'text.secondary',
};

const LINK_BUTTON_SX: SxProps = {
  height: 'auto',
  p: 0,
  fontSize: '12px',
  fontWeight: 400,
  color: '#1a71ff',
  textTransform: 'none',
  gap: '4px',
  '&:hover': { color: '#4a8dff', textDecoration: 'none' },
  '&:disabled': { color: '#c0c6d4', pointerEvents: 'none' },
};

function usePagination<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [resetKey]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );
  return { page, setPage, pageCount, pagedItems };
}

export default function ScheduledTasksTab() {
  const [rows, setRows] = useState<ScheduledTaskRead[]>([]);
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const [loading, setLoading] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [runRows, setRunRows] = useState<ScheduledTaskRunRead[]>([]);
  const [allRunRows, setAllRunRows] = useState<ScheduledTaskRunRead[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskListFilter>('all');
  const [runFilter, setRunFilter] = useState<RunListFilter>('all');
  const [runLoading, setRunLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const selectedAgent = agents.find((item) => item.id === agentId) || null;
  const createDisabled = !agentId || Boolean(selectedAgent?.is_overall);

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
    void loadAgents();
  }, []);

  useEffect(() => {
    if (agentId) void load();
  }, [agentId]);

  async function loadAgents() {
    try {
      const result = await api.get<AgentProfileRead[]>(`/agents?tenant_id=${TENANT_ID}`);
      setAgents(result);
    } catch {
      setAgents([]);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [result, runResult] = await Promise.all([
        api.get<ScheduledTaskRead[]>(
          `/scheduled-tasks?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(agentId)}`,
        ),
        api.get<ScheduledTaskRunRead[]>(
          `/scheduled-tasks/runs?tenant_id=${TENANT_ID}&agent_id=${encodeURIComponent(agentId)}&limit=200`,
        ),
      ]);
      setRows(result);
      setAllRunRows(runResult);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载定时任务失败');
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(row: ScheduledTaskRead) {
    if (row.status === 'archived') {
      notify.warning('已删除的定时任务不能重新启用');
      return;
    }
    if (row.status === 'completed') {
      notify.warning('已完成的定时任务可编辑后重新启用');
      return;
    }
    const nextStatus = row.status === 'active' ? 'paused' : 'active';
    try {
      await api.put<ScheduledTaskRead>(`/scheduled-tasks/${row.id}`, {
        tenant_id: TENANT_ID,
        status: nextStatus,
      });
      notify.success(nextStatus === 'active' ? '定时任务已启用' : '定时任务已暂停');
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '更新定时任务失败');
    }
  }

  async function runNow(row: ScheduledTaskRead) {
    if (row.status === 'archived') {
      notify.warning('已删除的定时任务不能运行');
      return;
    }
    try {
      const run = await api.post<ScheduledTaskRunRead>(
        `/scheduled-tasks/${row.id}/run-now?tenant_id=${TENANT_ID}`,
      );
      notify.success(run.session_id ? '已创建独立任务会话，后台开始执行' : '已触发后台执行');
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '立即执行失败');
    }
  }

  function remove(row: ScheduledTaskRead) {
    setDeleteTarget(row);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/scheduled-tasks/${deleteTarget.id}?tenant_id=${TENANT_ID}`);
      notify.success('已删除');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除定时任务失败');
    } finally {
      setDeleting(false);
    }
  }

  async function openRuns(row: ScheduledTaskRead) {
    setRunsOpen(true);
    setRunLoading(true);
    try {
      const result = await api.get<ScheduledTaskRunRead[]>(
        `/scheduled-tasks/${row.id}/runs?tenant_id=${TENANT_ID}`,
      );
      setRunRows(result);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载执行记录失败');
    } finally {
      setRunLoading(false);
    }
  }

  function openChatSession(sessionId?: string) {
    if (!sessionId) return;
    window.open(`/workspace/chat/${sessionId}`, '_blank', 'noopener,noreferrer');
  }

  const activeRows = rows.filter((item) => item.status === 'active');
  const taskRows = rows.filter((item) => item.status !== 'archived');
  const completedCount = taskRows.filter((item) => item.status === 'completed').length;
  const visibleRows = taskRows.filter((item) => matchesTaskFilter(item, taskFilter));
  const visibleRunRows = allRunRows.filter((item) => matchesRunFilter(item, runFilter));

  const taskPagination = usePagination(visibleRows, TASK_PAGE_SIZE, taskFilter);
  const runPagination = usePagination(visibleRunRows, TASK_PAGE_SIZE, runFilter);
  const runsModalPagination = usePagination(runRows, TASK_PAGE_SIZE, runRows);

  const renderTaskActions = (row: ScheduledTaskRead) => (
    <TaskActionsMenu
      task={row}
      onViewRuns={openRuns}
      onEdit={(task) => navigate(`/staff/scheduled-tasks/${task.id}/edit`)}
      onRunNow={runNow}
      onToggleStatus={toggleStatus}
      onDelete={remove}
    />
  );

  const taskColumns: DataTableColumn<ScheduledTaskRead>[] = [
    {
      key: 'title',
      title: '定时任务',
      className: 'whitespace-normal',
      render: (row) => (
        <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: '4px' }}>
          <Box component="span" sx={{ fontWeight: 500, lineHeight: '18px', color: 'text.primary' }}>{row.title}</Box>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.prompt}</Box>
        </Box>
      ),
    },
    {
      key: 'schedule',
      title: '计划',
      width: 200,
      className: 'whitespace-normal [overflow-wrap:anywhere]',
      render: (row) => formatSchedule(row),
    },
    { key: 'status', title: '状态', width: 120, render: (row) => <TaskStatusBadge status={row.status} /> },
    { key: 'next', title: '下次执行', width: 160, render: (row) => formatTime(row.next_run_at) },
    { key: 'runCount', title: '已执行', width: 120, render: (row) => `${row.run_count || 0} 次` },
    {
      key: 'lastResult',
      title: '最近结果',
      width: 120,
      render: (row) =>
        row.last_status ? (
          <TaskRunResultBadge status={row.last_status} />
        ) : (
          <Box component="span">暂无</Box>
        ),
    },
    { key: 'actions', title: '操作', width: 100, render: renderTaskActions },
  ];

  const runColumns: DataTableColumn<ScheduledTaskRunRead>[] = [
    {
      key: 'task',
      title: '定时任务',
      width: 240,
      className: 'whitespace-normal',
      render: (row) => (
        <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: '2px' }}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.task_title || row.scheduled_task_id}</Box>
          {row.task_status === 'archived' && <ArchivedTag />}
        </Box>
      ),
    },
    { key: 'status', title: '状态', width: 120, render: (row) => <TaskRunResultBadge status={row.status} /> },
    {
      key: 'scheduled',
      title: '计划时间',
      width: 160,
      render: (row) => formatTime(row.scheduled_for),
    },
    {
      key: 'finished',
      title: '完成时间',
      width: 160,
      render: (row) => formatTime(row.finished_at),
    },
    {
      key: 'result',
      title: '结果',
      className: 'whitespace-normal',
      render: (row) => (
        <Box component="span" sx={{ wordBreak: 'break-word' }}>{row.result_summary || row.error || '暂无'}</Box>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      render: (row) => (
        <UIButton
          variant="link"
          disabled={!row.session_id}
          onClick={() => openChatSession(row.session_id)}
          sx={LINK_BUTTON_SX}
        >
          查看会话
        </UIButton>
      ),
    },
  ];

  const runModalColumns: DataTableColumn<ScheduledTaskRunRead>[] = [
    {
      key: 'scheduled',
      title: '计划时间',
      width: 170,
      render: (row) => formatTime(row.scheduled_for),
    },
    { key: 'status', title: '状态', width: 100, render: (row) => <TaskRunResultBadge status={row.status} /> },
    {
      key: 'session',
      title: '会话',
      width: 200,
      className: 'whitespace-normal',
      render: (row) =>
        row.session_id ? (
          <Box
            component="button"
            type="button"
            onClick={() => openChatSession(row.session_id)}
            sx={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              color: '#1a71ff',
              transition: 'color 0.15s',
              border: 0,
              bgcolor: 'transparent',
              p: 0,
              fontFamily: 'inherit',
              fontSize: 'inherit',
              cursor: 'pointer',
              '&:hover': { color: '#4a8dff' },
            }}
          >
            {row.session_id}
          </Box>
        ) : (
          '未生成'
        ),
    },
    {
      key: 'result',
      title: '结果',
      className: 'whitespace-normal',
      render: (row) => (
        <Box component="span" sx={{ wordBreak: 'break-word' }}>{row.result_summary || row.error || '暂无'}</Box>
      ),
    },
  ];

  const renderTaskMobileCard = (row: ScheduledTaskRead) => (
    <Box component="article" sx={staffTokens.mobileCard} key={row.id}>
      <Box sx={MOBILE_CARD_HEAD_SX}>
        <Box component="strong" sx={MOBILE_TITLE_SX}>{row.title}</Box>
        <TaskStatusBadge status={row.status} />
      </Box>
      <Box component="p" sx={MOBILE_SUMMARY_SX}>{row.prompt}</Box>
      <Box sx={MOBILE_META_SX}>
        <Box component="span">
          <b>计划</b>
          {formatSchedule(row)}
        </Box>
        <Box component="span">
          <b>下次</b>
          {formatTime(row.next_run_at)}
        </Box>
        <Box component="span">
          <b>已执行</b>
          {row.run_count || 0} 次
        </Box>
        <Box component="span">
          <b>最近</b>
          {row.last_status ? <TaskRunResultBadge status={row.last_status} /> : '暂无'}
        </Box>
      </Box>
      <Box sx={{ mt: '12px', display: 'flex', justifyContent: 'flex-end' }}>{renderTaskActions(row)}</Box>
    </Box>
  );

  const renderRunMobileCard = (row: ScheduledTaskRunRead) => (
    <Box component="article" sx={staffTokens.mobileCard} key={row.id}>
      <Box sx={MOBILE_CARD_HEAD_SX}>
        <Box component="strong" sx={MOBILE_TITLE_SX}>{row.task_title || row.scheduled_task_id}</Box>
        <TaskRunResultBadge status={row.status} />
      </Box>
      {row.task_status === 'archived' && (
        <Box sx={{ mt: '10px' }}>
          <ArchivedTag />
        </Box>
      )}
      <Box sx={MOBILE_META_SX}>
        <Box component="span">
          <b>计划时间</b>
          {formatTime(row.scheduled_for)}
        </Box>
        <Box component="span">
          <b>完成时间</b>
          {formatTime(row.finished_at)}
        </Box>
      </Box>
      <Box component="p" sx={MOBILE_SUMMARY_SX}>{row.result_summary || row.error || '暂无结果'}</Box>
      <Box sx={{ mt: '12px', display: 'flex', justifyContent: 'flex-end' }}>
        <UIButton
          variant="link"
          disabled={!row.session_id}
          onClick={() => openChatSession(row.session_id)}
          sx={LINK_BUTTON_SX}
        >
          <Search size={14} />
          查看会话
        </UIButton>
      </Box>
    </Box>
  );

  const actionButtons = (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
      <UIButton
        data-guide-target="scheduled-task-create"
        onClick={() => navigate('/staff/scheduled-tasks/new')}
        disabled={createDisabled}
        sx={[staffTokens.primaryButton, { width: '100px' }] as SxProps}
      >
        <Plus size={14} />
        新增任务
      </UIButton>
    </Box>
  );

  const scheduledBody = selectedAgent?.is_overall ? (
    <Box sx={{ display: 'flex', minHeight: '200px', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', bgcolor: '#f6f6f6', fontSize: '13px', color: 'text.secondary' }}>
      请先选择一个数字员工再配置定时任务。
    </Box>
  ) : (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '20px' }} aria-label="定时任务统计">
        <StatCard label="待完成" value={activeRows.length} className="basis-[220px]" />
        <StatCard label="已完成" value={completedCount} className="basis-[220px]" />
        <StatCard label="执行记录" value={allRunRows.length} className="basis-[220px]" />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <TaskSection
          icon={<AlarmClock size={14} style={{ flexShrink: 0, color: '#858b9c' }} />}
          title="任务列表"
          filterTabs={TASK_FILTER_TABS}
          filter={taskFilter}
          onFilterChange={setTaskFilter}
          rows={visibleRows}
          pagedRows={taskPagination.pagedItems}
          columns={taskColumns}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="暂无定时任务"
          page={taskPagination.page}
          pageCount={taskPagination.pageCount}
          onPageChange={taskPagination.setPage}
          renderMobileCard={renderTaskMobileCard}
        />

        <TaskSection
          icon={<AlignJustify size={14} style={{ flexShrink: 0, color: '#858b9c' }} />}
          title="执行记录"
          filterTabs={RUN_FILTER_TABS}
          filter={runFilter}
          onFilterChange={setRunFilter}
          rows={visibleRunRows}
          pagedRows={runPagination.pagedItems}
          columns={runColumns}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="暂无执行记录"
          tableSize="compact"
          striped
          bordered
          page={runPagination.page}
          pageCount={runPagination.pageCount}
          onPageChange={runPagination.setPage}
          renderMobileCard={renderRunMobileCard}
        />
      </Box>
    </>
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
        {actionButtons}
        {scheduledBody}
      </Box>

      <Dialog open={runsOpen} onOpenChange={setRunsOpen}>
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
            '@media (min-width:640px)': { maxWidth: '920px' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
            <AlignJustify size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <DialogTitle sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1, color: 'text.secondary' }}>
              执行记录
            </DialogTitle>
          </Box>
          <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
            <DataTable
              aria-label="执行记录"
              columns={runModalColumns}
              data={runsModalPagination.pagedItems}
              rowKey={(row) => row.id}
              loading={runLoading}
              emptyText="暂无执行记录"
              size="compact"
              striped
              bordered
            />
          </Box>
          {runRows.length > 0 && (
            <Paginator
              aria-label="执行记录分页"
              page={runsModalPagination.page}
              pageCount={runsModalPagination.pageCount}
              onChange={runsModalPagination.setPage}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        loading={deleting}
        title={`删除定时任务「${deleteTarget?.title ?? ''}」？`}
        description="删除后不再唤醒该员工，历史执行记录会继续保留。"
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

function ArchivedTag() {
  return <StatusBadge tone="gray">任务已删除</StatusBadge>;
}
