import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, FileSearch, GitBranch, RefreshCw, Workflow, Wrench } from 'lucide-react';

import { api, TENANT_ID } from '../../../components/staff/api/client.js';
import { DataTable, type DataTableColumn } from '../../../components/staff/DataTable.js';
import { DetailField } from '../../../components/staff/DetailField.js';
import { Paginator } from '../../../components/staff/Paginator.js';
import { StatCard } from '../../../components/staff/StatCard.js';
import { Button as UIButton } from '../../../components/staff/ui/button.js';
import { Dialog, DialogContent, DialogTitle, UnderlineTabs, type UnderlineTabItem } from '../../../components/staff/ui/index.js';
import { notify } from '../../../components/staff/ui/app-toast.js';
import { Box } from '@mui/material';
import { formatDateTime } from '../../../components/staff/lib/enterprise-ui.js';
import { staffTokens } from '../../../components/staff/lib/staffTokens.js';
import { employeeDisplayNameWithCreator } from '../../../components/staff/employee.js';
import { StatusBadge } from '../scheduled-tasks/StatusBadge.js';
import type { BadgeTone } from '../scheduled-tasks/shared.js';
import type {
  AgentProfileRead,
  EnterpriseChatSessionRead,
  EnterpriseSessionDetailRead,
  FeedbackAnalysisRead,
  FeedbackMessageRead,
  FeedbackSessionDetailRead,
  FeedbackSessionRead,
  FeedbackSummaryRead,
  TraceLineRead,
  TurnTraceRead,
} from '../../../components/staff/types/index.js';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';
const FEEDBACK_PAGE_SIZE = 10;

type LogFilter = 'all' | 'up' | 'down' | 'unrated' | 'ability' | 'tool' | 'knowledge' | 'sop';

type ConversationLogRow = EnterpriseChatSessionRead & {
  downFeedback?: FeedbackSessionRead;
  upFeedback?: FeedbackSessionRead;
};

type ConversationDetail = {
  session: Record<string, unknown>;
  messages: FeedbackMessageRead[];
  feedback: Array<Record<string, unknown>>;
  events: EnterpriseSessionDetailRead['events'];
  traces: TurnTraceRead[];
};

const FILTER_TABS: UnderlineTabItem<LogFilter>[] = [
  { label: '全部', value: 'all' },
  { label: '好评', value: 'up' },
  { label: '差评', value: 'down' },
  { label: '未评价', value: 'unrated' },
  { label: '能力不足', value: 'ability' },
  { label: '工具问题', value: 'tool' },
  { label: '知识缺失', value: 'knowledge' },
  { label: 'SOP 问题', value: 'sop' },
];

export default function ConversationLogsTab() {
  const [searchParams] = useSearchParams();
  const [scopedAgentId, setScopedAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const agentId = searchParams.get('agent_id') || scopedAgentId;
  const [sessions, setSessions] = useState<EnterpriseChatSessionRead[]>([]);
  const [downRows, setDownRows] = useState<FeedbackSessionRead[]>([]);
  const [upRows, setUpRows] = useState<FeedbackSessionRead[]>([]);
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [summary, setSummary] = useState<FeedbackSummaryRead | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      setScopedAgentId(
        (event as CustomEvent<{ agentId?: string }>).detail?.agentId ||
          window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) ||
          '',
      );
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  const load = async () => {
    setLoading(true);
    const agentQuery = agentId ? `&agent_id=${encodeURIComponent(agentId)}` : '';
    const [sessionResult, downResult, upResult, summaryResult, agentResult] = await Promise.allSettled([
      api.get<EnterpriseChatSessionRead[]>(`/sessions?tenant_id=${TENANT_ID}${agentQuery}`),
      api.get<FeedbackSessionRead[]>(`/feedback/sessions?tenant_id=${TENANT_ID}&rating=down${agentQuery}`),
      api.get<FeedbackSessionRead[]>(`/feedback/sessions?tenant_id=${TENANT_ID}&rating=up${agentQuery}`),
      api.get<FeedbackSummaryRead>(`/feedback/summary?tenant_id=${TENANT_ID}${agentQuery}`),
      api.get<AgentProfileRead[]>(`/agents?tenant_id=${TENANT_ID}`),
    ]);
    if (sessionResult.status === 'fulfilled') setSessions(sessionResult.value);
    if (downResult.status === 'fulfilled') setDownRows(downResult.value);
    if (upResult.status === 'fulfilled') setUpRows(upResult.value);
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    if (agentResult.status === 'fulfilled') setAgents(agentResult.value);
    const failure = [sessionResult, downResult, upResult, summaryResult, agentResult].find(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );
    if (failure) {
      notify.error(failure.reason instanceof Error ? failure.reason.message : '部分对话日志数据加载失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [agentId]);

  const rows = useMemo<ConversationLogRow[]>(() => {
    const downBySession = new Map(downRows.map((item) => [item.session_id, item]));
    const upBySession = new Map(upRows.map((item) => [item.session_id, item]));
    return sessions
      .filter((session) => !agentId || session.agent_id === agentId)
      .map((session) => ({
        ...session,
        downFeedback: downBySession.get(session.id),
        upFeedback: upBySession.get(session.id),
      }));
  }, [agentId, downRows, sessions, upRows]);

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const agentLabelFromId = (rowAgentId?: string | null): string => {
    if (!rowAgentId) return '-';
    const agent = agentsById.get(rowAgentId);
    return agent ? employeeDisplayNameWithCreator(agent) : rowAgentId;
  };

  const agentLabel = (row: ConversationLogRow): string => agentLabelFromId(row.agent_id);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === 'up') return Boolean(row.upFeedback);
        if (filter === 'down') return Boolean(row.downFeedback);
        if (filter === 'unrated') return !row.upFeedback && !row.downFeedback;
        if (filter === 'ability') return row.downFeedback?.primary_bucket === 'model_issue';
        if (filter === 'tool') return row.downFeedback?.primary_bucket === 'tool_or_system_issue';
        if (filter === 'sop') return row.downFeedback?.primary_bucket === 'skill_issue';
        if (filter === 'knowledge') return row.downFeedback?.primary_bucket === 'unknown';
        return true;
      }),
    [filter, rows],
  );

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / FEEDBACK_PAGE_SIZE));
  const pagedItems = useMemo(
    () => filteredRows.slice((page - 1) * FEEDBACK_PAGE_SIZE, page * FEEDBACK_PAGE_SIZE),
    [filteredRows, page],
  );

  const openDetail = async (row: ConversationLogRow) => {
    setDetailLoading(true);
    try {
      const [sessionDetail, traces] = await Promise.all([
        api.get<EnterpriseSessionDetailRead>(`/sessions/${row.id}?tenant_id=${TENANT_ID}`),
        api
          .get<TurnTraceRead[]>(`/chat/sessions/${row.id}/trace?tenant_id=${TENANT_ID}`)
          .catch(() => [] as TurnTraceRead[]),
      ]);
      let feedbackDetail: FeedbackSessionDetailRead | null = null;
      if (row.downFeedback || row.upFeedback) {
        try {
          feedbackDetail = await api.get<FeedbackSessionDetailRead>(
            `/feedback/sessions/${row.id}?tenant_id=${TENANT_ID}`,
          );
        } catch {
          feedbackDetail = null;
        }
      }
      setDetail({
        session: feedbackDetail?.session || sessionDetail.session,
        messages: feedbackDetail?.messages || sessionDetail.messages,
        feedback: feedbackDetail?.feedback || [],
        events: sessionDetail.events || [],
        traces,
      });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载对话详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadCurrentDetail = async () => {
    const sessionId = String(detail?.session?.id || detail?.session?.session_id || '');
    if (!sessionId) return;
    const row = rows.find((item) => item.id === sessionId);
    if (row) await openDetail(row);
  };

  const reanalyzeFeedback = async (feedbackId: string) => {
    setReanalyzingId(feedbackId);
    try {
      const result = await api.post<{
        code: number;
        data?: { implemented?: boolean; analysis_status?: string; message?: string };
      }>(`/feedback/${feedbackId}/reanalyze?tenant_id=${TENANT_ID}`);
      const implemented = result?.data?.implemented;
      if (implemented === false) {
        notify.warning('分析未完成：当前未配置可用模型，无法执行真实归因分析');
      } else {
        notify.success('已重新提交后台分析');
      }
      await reloadCurrentDetail();
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '重新分析失败');
    } finally {
      setReanalyzingId(null);
    }
  };

  const columns: DataTableColumn<ConversationLogRow>[] = [
    {
      key: 'title',
      title: '对话任务',
      width: 200,
      render: (row) => (
        <Box
          component="span"
          sx={{
            color: '#18181a',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 1,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {row.title || row.summary || row.last_agent_question || row.id}
        </Box>
      ),
    },
    {
      key: 'agent',
      title: '数字员工',
      width: 180,
      render: (row) => (
        <Box
          component="span"
          title={agentLabel(row)}
          sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {agentLabel(row)}
        </Box>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 120,
      render: (row) => (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {row.downFeedback && <StatusBadge tone="red">差评</StatusBadge>}
          {row.upFeedback && <StatusBadge tone="green">好评</StatusBadge>}
          {!row.upFeedback && !row.downFeedback && <StatusBadge tone="blue">未评价</StatusBadge>}
        </Box>
      ),
    },
    {
      key: 'attribution',
      title: '问题归因',
      width: 130,
      render: (row) => (
        <span>
          {row.downFeedback
            ? row.downFeedback.primary_bucket_label || row.downFeedback.primary_bucket || '待分析'
            : '暂无缺口'}
        </span>
      ),
    },
    {
      key: 'latest',
      title: '最近内容',
      render: (row) => (
        <Box
          component="span"
          sx={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 1,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {row.downFeedback?.latest_message ||
            row.upFeedback?.latest_message ||
            row.summary ||
            row.last_agent_question ||
            '-'}
        </Box>
      ),
    },
    {
      key: 'updated',
      title: '时间',
      width: 170,
      render: (row) => formatDateTime(row.updated_at),
    },
    {
      key: 'actions',
      title: '操作',
      width: 90,
      render: (row) => (
        <UIButton
          variant="link"
          disabled={detailLoading}
          onClick={() => void openDetail(row)}
          sx={{
            height: 'auto',
            p: 0,
            fontSize: '12px',
            fontWeight: 400,
            color: '#1a71ff',
            textDecoration: 'none',
            '&:hover': { color: '#4a8dff', textDecoration: 'none' },
            '&.Mui-disabled': { color: '#c0c6d4', textDecoration: 'none' },
          }}
        >
          查看
        </UIButton>
      ),
    },
  ];

  const renderMobileCard = (row: ConversationLogRow) => (
    <Box component="article" sx={staffTokens.mobileCard} key={row.id}>
      <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <Box component="strong" sx={{ minWidth: 0, overflowWrap: 'break-word', fontSize: '14px', fontWeight: 600, color: '#18181a' }}>
          {row.title || row.summary || row.last_agent_question || row.id}
        </Box>
        <Box sx={{ display: 'flex', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px' }}>
          {row.downFeedback && <StatusBadge tone="red">差评</StatusBadge>}
          {row.upFeedback && <StatusBadge tone="green">好评</StatusBadge>}
          {!row.upFeedback && !row.downFeedback && <StatusBadge tone="blue">未评价</StatusBadge>}
        </Box>
      </Box>
      <Box
        component="p"
        sx={{
          mt: '8px',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
          fontSize: '12px',
          lineHeight: '1.55',
          color: '#858b9c',
        }}
      >
        {row.downFeedback?.latest_message ||
          row.upFeedback?.latest_message ||
          row.summary ||
          row.last_agent_question ||
          '-'}
      </Box>
      <Box sx={{ mt: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: '#858b9c' }}>
        <Box component="span" title={agentLabel(row)} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentLabel(row)}</Box>
        <Box component="span" sx={{ flexShrink: 0 }}>{formatDateTime(row.updated_at)}</Box>
      </Box>
      <Box sx={{ mt: '10px', display: 'flex', justifyContent: 'flex-end' }}>
        <UIButton
          variant="link"
          disabled={detailLoading}
          onClick={() => void openDetail(row)}
          sx={{
            height: 'auto',
            p: 0,
            fontSize: '12px',
            fontWeight: 400,
            color: '#1a71ff',
            textDecoration: 'none',
            '&:hover': { color: '#4a8dff', textDecoration: 'none' },
            '&.Mui-disabled': { color: '#c0c6d4', textDecoration: 'none' },
          }}
        >
          查看
        </UIButton>
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
          '@media (min-width:521px)': { p: '18px' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: '#757f9c' }}>
          <Clock size={14} style={{ flexShrink: 0 }} />
          <Box component="span" sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 'none' }}>对话记录</Box>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '20px' }} aria-label="对话反馈统计">
          <StatCard value={rows.length} label="对话" />
          <StatCard value={summary?.total_feedback ?? 0} label="反馈" />
          <StatCard value={summary?.up_count ?? 0} label="好评" tone="green" />
          <StatCard value={summary?.down_count ?? 0} label="差评" tone="red" />
        </Box>

        {summary && (summary.summary || summary.bucket_counts.length > 0) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px', borderRadius: '14px', border: '1px solid', borderColor: '#eef0f4', bgcolor: '#fafbfc', px: '20px', py: '16px' }}>
            {summary.summary && (
              <Box component="p" sx={{ overflowWrap: 'break-word', fontSize: '13px', lineHeight: '1.7', color: '#464c5e' }}>
                {summary.summary}
              </Box>
            )}
            {summary.bucket_counts.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {summary.bucket_counts.map((item) => (
                  <StatusBadge key={item.bucket} tone={bucketTone(item.bucket)}>
                    {item.label} {item.count}
                  </StatusBadge>
                ))}
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ overflowX: 'auto' }}>
          <UnderlineTabs
            aria-label="对话日志筛选"
            variant="line"
            value={filter}
            onChange={setFilter}
            items={FILTER_TABS}
          />
        </Box>

        <Box sx={{ display: 'grid', gap: '10px', '@media (min-width:768px)': { display: 'none' } }}>
          {filteredRows.length ? (
            pagedItems.map(renderMobileCard)
          ) : (
            <Box component="div" sx={{ py: '40px', textAlign: 'center', fontSize: '13px', color: '#858b9c' }}>暂无对话日志</Box>
          )}
        </Box>

        <Box sx={{ display: 'none', '@media (min-width:768px)': { display: 'block' } }}>
          <DataTable
            aria-label="对话日志"
            columns={columns}
            data={pagedItems}
            rowKey={(row) => row.id}
            loading={loading}
            emptyText="暂无对话日志"
          />
        </Box>

        {filteredRows.length > 0 && (
          <Box sx={{ mb: '6px' }}>
            <Paginator
              aria-label="对话日志分页"
              page={page}
              pageCount={pageCount}
              onChange={setPage}
            />
          </Box>
        )}
      </Box>

      <FeedbackDetailDialog
        detail={detail}
        agentLabelFromId={agentLabelFromId}
        onClose={() => setDetail(null)}
        onReanalyze={reanalyzeFeedback}
        reanalyzingId={reanalyzingId}
      />
    </>
  );
}

function FeedbackDetailDialog({
  detail,
  agentLabelFromId,
  onClose,
  onReanalyze,
  reanalyzingId,
}: {
  detail: ConversationDetail | null;
  agentLabelFromId: (agentId?: string | null) => string;
  onClose: () => void;
  onReanalyze: (feedbackId: string) => void;
  reanalyzingId: string | null;
}) {
  return (
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        sx={{
          position: 'relative',
          display: 'flex',
          maxHeight: 'calc(100dvh - 4rem)',
          width: 'calc(100% - 2rem)',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
          borderRadius: '14px',
          px: '20px',
          py: '16px',
          '@media (min-width:640px)': { maxWidth: '900px' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: '#757f9c' }}>
          <Clock size={14} style={{ flexShrink: 0 }} />
          <DialogTitle sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 'none', color: '#757f9c' }}>
            对话日志详情
          </DialogTitle>
        </Box>

        {detail && (
          <Box sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', gap: '16px', overflowY: 'auto', px: '12px' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', '@media (max-width:520px)': { gridTemplateColumns: '1fr' } }}>
              <DetailField label="任务 ID">
                {String(detail.session.session_id || detail.session.id || '-')}
              </DetailField>
              <DetailField label="数字员工">{agentLabelFromId(String(detail.session.agent_id || ''))}</DetailField>
              <DetailField label="用户">{displayUser(detail.session)}</DetailField>
              <DetailField label="状态">{String(detail.session.status || '-')}</DetailField>
              <Box sx={{ gridColumn: 'span 2', '@media (max-width:520px)': { gridColumn: 'span 1' } }}>
                <DetailField label="反馈">
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <StatusBadge tone="green">
                    好评 {detail.feedback.filter((item) => item.rating === 'up').length}
                  </StatusBadge>
                  <StatusBadge tone="red">
                    差评 {detail.feedback.filter((item) => item.rating === 'down').length}
                  </StatusBadge>
                  {detail.feedback
                    .filter((item) => item.rating === 'down')
                    .map((item) => item.analysis as FeedbackAnalysisRead | undefined)
                    .filter(Boolean)
                    .map((analysis, index) => (
                      <StatusBadge
                        key={`${analysis?.bucket || 'unknown'}_${index}`}
                        tone={bucketTone(analysis?.bucket)}
                      >
                        {analysis?.bucket_label || analysis?.bucket || '待分析'}
                      </StatusBadge>
                    ))}
                  </Box>
                </DetailField>
              </Box>
            </Box>

            <div className="feedback-conversation">
              {conversationItems(detail).map(({ message: item, trace }) => (
                <FeedbackMessage
                  key={item.id}
                  item={item}
                  trace={trace}
                  onReanalyze={onReanalyze}
                  reanalyzing={Boolean(item.feedback_id && item.feedback_id === reanalyzingId)}
                />
              ))}
              {detail.messages.length === 0 && detail.traces.length > 0
                ? detail.traces.map((trace) => (
                    <div key={trace.turn_id} className="feedback-message-row assistant">
                      <div className="feedback-message-bubble trace-only">
                        <FeedbackTraceBlock trace={trace} />
                      </div>
                    </div>
                  ))
                : null}
            </div>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackMessage({
  item,
  trace,
  onReanalyze,
  reanalyzing,
}: {
  item: FeedbackMessageRead;
  trace?: TurnTraceRead;
  onReanalyze: (feedbackId: string) => void;
  reanalyzing: boolean;
}) {
  const isUser = item.role === 'user';
  const isAssistant = item.role === 'assistant';
  const analysisFailed = item.feedback_analysis?.status === 'failed';
  return (
    <div className={`feedback-message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="feedback-message-bubble">
        <div className="feedback-message-meta">
          <span>{isUser ? '用户' : isAssistant ? '员工' : item.role}</span>
          <span>{formatDateTime(item.created_at)}</span>
          {item.feedback_rating === 'down' && <StatusBadge tone="red">差评</StatusBadge>}
          {item.feedback_rating === 'up' && <StatusBadge tone="green">好评</StatusBadge>}
          {item.feedback_analysis &&
            (analysisFailed ? (
              <StatusBadge tone="red">分析失败</StatusBadge>
            ) : (
              <StatusBadge tone={bucketTone(item.feedback_analysis.bucket)}>
                {item.feedback_analysis.bucket_label || item.feedback_analysis.bucket || '待分析'}
              </StatusBadge>
            ))}
        </div>
        {trace && <FeedbackTraceBlock trace={trace} />}
        <p className="feedback-message-content">{item.content}</p>
        {item.feedback_analysis && item.feedback_rating === 'down' && (
          <div className="feedback-analysis-box">
            <div>
              <strong>状态：</strong>
              {analysisStatusLabel(item.feedback_analysis.status)}
              {item.feedback_analysis.status !== 'failed' &&
                typeof item.feedback_analysis.confidence === 'number' && (
                  <span> · 置信度 {(item.feedback_analysis.confidence * 100).toFixed(0)}%</span>
                )}
            </div>
            {item.feedback_analysis.summary && (
              <div>
                <strong>改进项：</strong>
                {item.feedback_analysis.summary}
              </div>
            )}
            {item.feedback_analysis.reason && (
              <div>
                <strong>原因：</strong>
                {item.feedback_analysis.reason}
              </div>
            )}
            {item.feedback_analysis.status === 'failed' && item.feedback_id && (
              <UIButton
                variant="outline"
                disabled={reanalyzing}
                onClick={() => onReanalyze(item.feedback_id as string)}
                sx={{ ...staffTokens.outlineActionButton, mt: '8px', height: '30px', px: '14px' }}
              >
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    animation: reanalyzing ? 'spin 1s linear infinite' : undefined,
                    '@keyframes spin': {
                      from: { transform: 'rotate(0deg)' },
                      to: { transform: 'rotate(360deg)' },
                    },
                  }}
                >
                  <RefreshCw size={14} />
                </Box>
                重新分析
              </UIButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function conversationItems(
  detail: ConversationDetail,
): Array<{ message: FeedbackMessageRead; trace?: TurnTraceRead }> {
  const tracesByUserMessage = new Map<string, TurnTraceRead>();
  const tracesByTurn = new Map<string, TurnTraceRead>();
  detail.traces.forEach((trace) => {
    if (trace.user_message_id) tracesByUserMessage.set(trace.user_message_id, trace);
    tracesByTurn.set(trace.turn_id, trace);
  });

  let currentUserMessageId = '';
  return detail.messages.map((messageItem) => {
    if (messageItem.role === 'user') {
      currentUserMessageId = messageItem.id;
      return { message: messageItem };
    }
    const trace =
      messageItem.role === 'assistant'
        ? tracesByUserMessage.get(currentUserMessageId) || tracesByTurn.get(currentUserMessageId)
        : undefined;
    return { message: messageItem, trace };
  });
}

function FeedbackTraceBlock({ trace }: { trace: TurnTraceRead }) {
  const lines = traceDetails(trace.lines);
  if (lines.length === 0) return null;
  return (
    <div className="feedback-trace-block">
      <div className="feedback-trace-header">
        <Workflow size={14} />
        <span>执行记录</span>
        <span>{trace.completed_at ? '已完成' : '执行中'}</span>
      </div>
      <div className="feedback-trace-lines">
        {lines.map((line) => (
          <div key={line.id} className={`feedback-trace-line ${line.kind} ${line.state}`}>
            <span className="feedback-trace-icon">{traceLineIcon(line.kind)}</span>
            <span className="feedback-trace-content">
              <span className="feedback-trace-text">{line.text}</span>
              {line.detail && <span className="feedback-trace-detail">{line.detail}</span>}
              {line.code && (
                <details className="feedback-trace-code">
                  <summary>查看代码</summary>
                  <pre>{line.code}</pre>
                </details>
              )}
              {line.output && (
                <details className="feedback-trace-code">
                  <summary>{line.outputTitle || '查看输出'}</summary>
                  <pre>{line.output}</pre>
                </details>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function traceDetails(lines: TraceLineRead[]): TraceLineRead[] {
  const hiddenPlaceholders = new Set(['正在思考', '已完成思考', '正在执行', '执行记录']);
  return lines.filter((line) => {
    if (line.kind === 'thinking' && line.state !== 'failed') return false;
    if (hiddenPlaceholders.has(line.text) && !line.detail && !line.code && !line.output) return false;
    return true;
  });
}

function traceLineIcon(kind: TraceLineRead['kind']) {
  if (kind === 'skill') return <GitBranch size={13} />;
  if (kind === 'tool') return <Wrench size={13} />;
  if (kind === 'knowledge') return <FileSearch size={13} />;
  return <Workflow size={13} />;
}

function displayUser(session: Record<string, unknown>): string {
  return String(session.display_name || session.username || session.user_id || '-');
}

function bucketTone(bucket?: string): BadgeTone {
  if (bucket === 'model_issue') return 'red';
  if (bucket === 'skill_issue') return 'orange';
  if (bucket === 'tool_or_system_issue') return 'blue';
  if (bucket === 'positive_or_resolved') return 'green';
  if (bucket === 'needs_model_analysis') return 'blue';
  return 'gray';
}

function analysisStatusLabel(status?: string): string {
  if (status === 'pending') return '等待分析';
  if (status === 'analyzed') return '已完成';
  if (status === 'failed') return '分析失败';
  if (status === 'needs_model') return '未配置模型';
  return status || '未知';
}
