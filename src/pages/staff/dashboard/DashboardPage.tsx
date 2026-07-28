import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, FileText, Pencil, UserCircle, MessageSquare } from 'lucide-react';
import { Box } from '@mui/material';
import { Badge, Button as UiButton, Tabs, TabsList, TabsTrigger, notify } from '../../../components/staff/ui/index.js';
import { staffTokens } from '../../../components/staff/lib/staffTokens.js';
import { EnterpriseRoute } from '../../../components/staff/enums/routes.js';
import { api, TENANT_ID } from '../../../components/staff/api/client.js';
import type { EnterpriseAuthUser } from '../../../components/staff/auth.js';
import AppHeader from '../../../components/staff/AppHeader.js';
import EmployeeAvatar from '../../../components/staff/EmployeeAvatar.js';
import EmployeeAvatarEditor from '../../../components/staff/EmployeeAvatarEditor.js';
import EmployeeProfileEditor from '../../../components/staff/EmployeeProfileEditor.js';
import ScheduledTasksTab from './ScheduledTasksTab.js';
import MemoriesTab from './MemoriesTab.js';
import ConversationLogsTab from './ConversationLogsTab.js';
import WorkRecordTab from './WorkRecordTab.js';
import type { ReplyStats } from './WorkRecordTab.js';
import {
  agentResourceCount,
  canManageEmployeeAgent,
  canSelectCurrentEmployeeAgent,
  employeeCreatorName,
  employeeDisplayName,
  employeeProfile,
  preferredEmployeeAgent,
  staffdeckDisplayText,
} from '../../../components/staff/employee.js';
import type {
  AgentProfileRead,
  AgentWorkRecordEventRead,
  AgentWorkRecordRead,
  EnterpriseChatSessionRead,
  FeedbackSummaryRead,
  GeneralSkillRead,
  KnowledgeBaseRead,
  ModelConfigRead,
  ScheduledTaskRead,
  SkillRead,
  ToolRead,
} from '../../../components/staff/types/index.js';

const ENTERPRISE_AGENT_STORAGE_KEY = 'ultrarag_enterprise_agent_scope';

export default function DashboardPage({
  currentUser,
  isAdmin = false,
  profileTab = 'work',
  onLogout,
}: {
  currentUser?: EnterpriseAuthUser;
  isAdmin?: boolean;
  profileTab?: ProfileTabKey;
  onLogout?: () => void;
} = {}) {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [skills, setSkills] = useState<SkillRead[]>([]);
  const [generalSkills, setGeneralSkills] = useState<GeneralSkillRead[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [models, setModels] = useState<ModelConfigRead[]>([]);
  const [tools, setTools] = useState<ToolRead[]>([]);
  const [sessions, setSessions] = useState<EnterpriseChatSessionRead[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryRead | null>(null);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskRead[]>([]);
  const [replyStats, setReplyStats] = useState<ReplyStats>({ total: 0, today: 0, byDay: {} });
  const [activityEvents, setActivityEvents] = useState<AgentWorkRecordEventRead[]>([]);
  const [agentId, setAgentId] = useState(() => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      setAgentId((event as CustomEvent<{ agentId?: string }>).detail?.agentId || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '');
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<AgentProfileRead[]>(`/agents?tenant_id=${TENANT_ID}`),
      api.get<SkillRead[]>(`/skills?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),
      api.get<GeneralSkillRead[]>(`/general-skills?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),
      api.get<KnowledgeBaseRead[]>(`/knowledge-bases?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),
      api.get<ModelConfigRead[]>(`/model-configs?tenant_id=${TENANT_ID}`),
      api.get<ToolRead[]>(`/tools?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),
      api.get<EnterpriseChatSessionRead[]>(`/sessions?tenant_id=${TENANT_ID}`),
      api.get<FeedbackSummaryRead>(`/feedback/summary?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),
      api.get<ScheduledTaskRead[]>(`/scheduled-tasks?tenant_id=${TENANT_ID}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),
    ])
      .then(([agentRows, skillRows, generalSkillRows, kbRows, modelRows, toolRows, sessionRows, feedbackRows, taskRows]) => {
        const visibleAgents = agentRows.filter((item) => canSelectCurrentEmployeeAgent(item, currentUser, {
          activeOnly: true,
        }));
        setAgents(visibleAgents);
        setSkills(skillRows);
        setGeneralSkills(generalSkillRows);
        setKnowledgeBases(kbRows);
        setModels(modelRows);
        setTools(toolRows);
        setSessions(sessionRows);
        setFeedbackSummary(feedbackRows);
        setScheduledTasks(taskRows.filter((item) => item.status !== 'archived'));
        if (!agentId || !visibleAgents.some((item) => item.id === agentId)) {
          const manageableAgents = visibleAgents.filter((item) => canManageEmployeeAgent(item, currentUser));
          const next = isAdmin
            ? preferredEmployeeAgent(visibleAgents)?.id || ''
            : preferredEmployeeAgent(manageableAgents)?.id
              || preferredEmployeeAgent(visibleAgents)?.id
              || '';
          if (next) {
            window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, next);
            window.dispatchEvent(new CustomEvent('ultrarag-enterprise-agent-scope-change', { detail: { agentId: next } }));
            setAgentId(next);
          }
        }
      })
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载数字员工档案失败'))
      .finally(() => setLoaded(true));
  }, [agentId, currentUser, isAdmin]);

  const selectedAgent = agents.find((item) => item.id === agentId)
    || agents.find((item) => !item.is_overall)
    || null;
  const employeeSessions = selectedAgent?.is_overall
    ? sessions
    : sessions.filter((item) => item.agent_id === selectedAgent?.id);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkRecord() {
      if (!selectedAgent || selectedAgent.is_overall) {
        setReplyStats({ total: 0, today: 0, byDay: {} });
        setActivityEvents([]);
        return;
      }
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
        const workRecord = await api.get<AgentWorkRecordRead>(
          `/agents/${encodeURIComponent(selectedAgent.id)}/work-record?tenant_id=${TENANT_ID}&timezone=${encodeURIComponent(timezone)}`,
        );
        if (cancelled) return;
        setReplyStats({
          total: workRecord.reply_stats.total,
          today: workRecord.reply_stats.today,
          byDay: workRecord.reply_stats.by_day,
        });
        setActivityEvents(workRecord.events);
      } catch (error) {
        if (cancelled) return;
        setReplyStats({ total: 0, today: 0, byDay: {} });
        setActivityEvents([]);
        notify.error(error instanceof Error ? error.message : '加载员工工作记录失败');
      }
    }
    void loadWorkRecord();
    return () => {
      cancelled = true;
    };
  }, [selectedAgent?.id, selectedAgent?.is_overall]);

  const defaultModel = models.find((item) => item.is_default);
  const totalCalls = skills.reduce((sum, item) => sum + (item.total_call_count || item.call_count || 0), 0);
  const positiveFeedback = skills.reduce((sum, item) => sum + (item.total_positive_feedback_count || 0), 0);
  const negativeFeedback = skills.reduce((sum, item) => sum + (item.total_negative_feedback_count || 0), 0);
  const visibleKnowledgeBases = knowledgeBases.filter((item) => !isEmptyDefaultKnowledgeBase(item));

  if (!loaded && agents.length === 0) {
    return <div className="page dashboard-page" />;
  }

  if (!selectedAgent && !isAdmin) {
    return (
      <div className="page dashboard-page">
        <Box className="empty-workspace-card" sx={{ p: '24px' }}>
          <Box component="h3" sx={{ m: 0, fontSize: '20px', fontWeight: 600, color: 'text.primary' }}>还没有数字员工</Box>
          <Box component="p" sx={{ mt: '8px', fontSize: '14px', color: 'text.secondary' }}>
            点击左下角「新建数字员工」开始创建，或前往员工广场选择已发布的员工。
          </Box>
          <Box sx={{ mt: '16px', display: 'flex', gap: '8px' }}>
            <UiButton onClick={() => navigate(EnterpriseRoute.Agents)}>查看我的数字员工</UiButton>
            <UiButton variant="outline" onClick={() => navigate(EnterpriseRoute.Feedback)}>查看对话日志</UiButton>
          </Box>
        </Box>
      </div>
    );
  }

  if (!selectedAgent || selectedAgent.is_overall) {
    return (
      <div className="page dashboard-page">
        <div className="page-title">
          <h3>开放广场</h3>
        </div>
        <section className="employee-hero org-hero">
          <div>
            <span className="section-kicker">开放广场</span>
            <h2 className="ui-typography">开放广场</h2>
            <p className="ui-typography">
              汇集所有可共享的 SOP、知识库、技能和工具，新建数字员工时可以从这里复制配置作为起点。
            </p>
          </div>
          <div className="employee-hero-metrics">
            <MetricTile label="员工" value={agents.filter((item) => !item.is_overall).length} />
            <MetricTile label="对话" value={sessions.length} />
            <MetricTile label="反馈" value={feedbackSummary?.total_feedback || 0} />
          </div>
        </section>
        <div className="org-dashboard-grid">
          <DashboardStat title="SOP" value={skills.length} />
          <DashboardStat title="技能" value={generalSkills.length} />
          <DashboardStat title="知识库" value={visibleKnowledgeBases.length} />
          <DashboardStat title="可用工具" value={tools.filter((item) => item.enabled).length} />
          <DashboardStat title="SOP 调用" value={totalCalls} />
          <DashboardStat title="好评" value={positiveFeedback || feedbackSummary?.up_count || 0} />
          <DashboardStat title="差评" value={negativeFeedback || feedbackSummary?.down_count || 0} />
          <div className="org-dashboard-card">
            <Box className="ui-card-body" sx={{ p: '24px' }}>
              <Box component="span" sx={{ fontSize: '13px', color: 'text.secondary' }}>默认模型</Box>
              <Box component="span" sx={{ fontSize: '15px', color: 'text.primary' }}>{defaultModel ? `${defaultModel.name} / ${defaultModel.model}` : '未配置'}</Box>
            </Box>
          </div>
        </div>
      </div>
    );
  }

  const employee = employeeProfile(selectedAgent);
  const employeeCreator = employeeCreatorName(selectedAgent);
  const canEditSelectedAgent = canManageEmployeeAgent(selectedAgent, currentUser);
  const activeSkills = skills.filter((item) => item.status === 'published' && item.branch_status !== 'inactive');
  const activeGeneralSkills = generalSkills.filter((item) => item.status === 'published');
  const activeKnowledge = visibleKnowledgeBases.filter((item) => item.status === 'active');
  const activeTools = tools.filter((item) => item.enabled);
  const selectedKnowledgeCount = visibleKnowledgeBases.length;
  const selectedGeneralSkillCount = agentResourceCount(selectedAgent, 'general_skill');
  const selectedSkillCount = agentResourceCount(selectedAgent, 'skill');
  const employeeScheduledTasks = scheduledTasks.filter((item) => item.agent_id === selectedAgent.id && item.status !== 'archived');
  const activeScheduledTasks = employeeScheduledTasks.filter((item) => item.status === 'active');
  const totalFeedback = positiveFeedback + negativeFeedback;
  const positiveRate = totalFeedback ? Math.round((positiveFeedback / totalFeedback) * 100) : 0;
  const negativeRate = totalFeedback ? Math.round((negativeFeedback / totalFeedback) * 100) : 0;
  const systemPromptSummary = typeof selectedAgent.metadata?.system_prompt_summary === 'string'
    ? selectedAgent.metadata.system_prompt_summary
    : '';
  const systemSummary = compactSummary(
    staffdeckDisplayText(selectedAgent.persona_prompt || systemPromptSummary || selectedAgent.description || `${employee.roleName}，负责接收任务、调用知识库、执行 SOP 并沉淀对话质量反馈。`),
    132,
  );

  const heroActionButtonSx = {
    ...staffTokens.outlineActionButton,
    height: 'auto',
    borderRadius: '14px',
    px: '12px',
    py: '8px',
    gap: '4px',
    boxShadow: '0px 6px 6px rgba(0,0,0,0.05)',
    '&:hover': { borderColor: 'text.disabled', bgcolor: 'background.paper', color: 'text.secondary' },
  };
  const heroAvatar = (
    <EmployeeAvatar
      agent={selectedAgent}
      width={136}
      height={160}
      radius={0}
      fit="contain"
      objectPosition="center bottom"
      style={{ background: 'transparent', border: 'none', boxShadow: 'none', overflow: 'visible' }}
    />
  );

  return (
    <Box
      sx={{
        minHeight: '100%',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        px: '48px',
        pt: '32px',
        pb: '43px',
        '@media (max-width:900px)': { px: '16px' },
      }}
    >
      <AppHeader
        onLogout={onLogout}
        userName={currentUser?.username}
        left={(
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '36px', rowGap: '24px', pt: '4px', pl: '4px' }}>
            <Box sx={{ display: 'flex', flexShrink: 0, flexDirection: 'column', alignItems: 'center' }}>
              {canEditSelectedAgent ? (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setAvatarEditorOpen(true)}
                  aria-label="更换头像"
                  sx={{
                    position: 'relative',
                    display: 'block',
                    cursor: 'pointer',
                    border: 0,
                    bgcolor: 'transparent',
                    p: 0,
                    '&:hover .avatar-edit-overlay': { opacity: 1 },
                  }}
                >
                  {heroAvatar}
                  <Box
                    component="span"
                    className="avatar-edit-overlay"
                    sx={{
                      pointerEvents: 'none',
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      bgcolor: 'rgba(0,0,0,0.45)',
                      py: '4px',
                      fontSize: '11px',
                      color: '#fff',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <UserCircle size={12} />
                    更换头像
                  </Box>
                </Box>
              ) : (
                heroAvatar
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <UiButton
                  variant="outline"
                  sx={heroActionButtonSx}
                  onClick={() => navigate(EnterpriseRoute.Chat)}
                >
                  <MessageSquare size={14} />
                  去对话
                </UiButton>
                {canEditSelectedAgent && (
                  <UiButton
                    variant="outline"
                    sx={heroActionButtonSx}
                    onClick={() => setProfileEditorOpen(true)}
                  >
                    <Pencil size={14} />
                    编辑资料
                  </UiButton>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', minWidth: '280px', flex: 1, flexDirection: 'column', gap: '8px' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <Box component="h2" sx={{ m: 0, fontSize: '22px', lineHeight: 'none', fontWeight: 600, color: '#18181a' }}>
                  {employeeDisplayName(selectedAgent)}
                </Box>
                <Box component="span" sx={{ fontSize: '13px', lineHeight: 'none', color: '#757f9c' }}>{employee.roleName || employeeDisplayName(selectedAgent)}</Box>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '9999px', bgcolor: '#f6f6f6', px: '10px', py: '2px' }}>
                  <Box
                    component="span"
                    sx={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      boxShadow: '0 0 0 1.5px #fff',
                      bgcolor: selectedAgent.status === 'active' ? '#22c55e' : '#c4c9d4',
                    }}
                  />
                  <Box component="span" sx={{ fontSize: '12px', color: '#757f9c' }}>
                    {selectedAgent.status === 'active' ? '在线' : '下线'}
                  </Box>
                </Box>
                <Box component="span" sx={{ fontSize: '12px', color: '#757f9c' }}>创建者：{employeeCreator}</Box>
                <Box component="span" sx={{ fontSize: '12px', color: '#757f9c' }}>入职时间：{employee.onboardedAt}</Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                  {employee.workStyles.slice(0, 3).map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      sx={{
                        height: 'auto',
                        borderRadius: '10px',
                        border: '0.5px solid',
                        borderColor: '#e3e7f1',
                        px: '16px',
                        py: '4px',
                        fontSize: '12px',
                        fontWeight: 400,
                        color: '#757f9c',
                      }}
                    >
                      {item}
                    </Badge>
                  ))}
                </Box>
              </Box>

              <Box component="p" sx={{ m: 0, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', maxWidth: '720px', fontSize: '14px', lineHeight: '22px', color: '#757f9c' }}>
                {systemSummary}
              </Box>

              <Box sx={{ display: 'flex', width: '100%', maxWidth: '514px', gap: '12px' }}>
                <HeroMetric value={selectedKnowledgeCount} label="资料" />
                <HeroMetric value={selectedGeneralSkillCount} label="技能" />
                <HeroMetric value={selectedSkillCount} label="SOP" />
                <HeroMetric value={activeScheduledTasks.length} label="定时任务" />
              </Box>
            </Box>
          </Box>
        )}
      />
      <EmployeeProfileTabs activeKey={profileTab} />
      {profileTab === 'work' && (
        <WorkRecordTab
          selectedAgent={selectedAgent}
          activeKnowledge={activeKnowledge}
          activeGeneralSkills={activeGeneralSkills}
          activeSkills={activeSkills}
          activeTools={activeTools}
          activeScheduledTasks={activeScheduledTasks}
          employeeSessions={employeeSessions}
          replyStats={replyStats}
          activityEvents={activityEvents}
          positiveRate={positiveRate}
          negativeRate={negativeRate}
        />
      )}
      {profileTab === 'scheduled' && <ScheduledTasksTab />}
      {profileTab === 'memories' && <MemoriesTab />}
      {profileTab === 'logs' && <ConversationLogsTab />}
      <EmployeeAvatarEditor
        agent={selectedAgent}
        open={avatarEditorOpen}
        onClose={() => setAvatarEditorOpen(false)}
        onSaved={(saved) => setAgents((current) => current.map((item) => (item.id === saved.id ? saved : item)))}
      />
      <EmployeeProfileEditor
        agent={selectedAgent}
        open={profileEditorOpen}
        currentUser={currentUser}
        onClose={() => setProfileEditorOpen(false)}
        onSaved={(saved) => setAgents((current) => current.map((item) => (item.id === saved.id ? saved : item)))}
      />
    </div>
  );
}

function DashboardStat({ title, value }: { title: string; value: number }): ReactNode {
  return (
    <div className="org-dashboard-card">
      <Box className="ui-card-body" sx={{ p: '24px' }}>
        <Box component="span" sx={{ fontSize: '13px', color: 'text.secondary' }}>{title}</Box>
        <strong>{value}</strong>
      </Box>
    </div>
  );
}

function isEmptyDefaultKnowledgeBase(item: KnowledgeBaseRead): boolean {
  const hasRuntimeKnowledge = item.document_count > 0 || item.bucket_count > 0 || item.chunk_count > 0;
  if (!hasRuntimeKnowledge && item.metadata?.created_from_document_upload && !item.metadata?.source_document_id) {
    return true;
  }
  return (
    item.name === '默认知识库'
    && item.document_count === 0
    && item.bucket_count === 0
    && item.chunk_count === 0
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="employee-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type ProfileTabKey = 'work' | 'scheduled' | 'memories' | 'logs';

const PROFILE_TABS: {
  key: ProfileTabKey;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  route: EnterpriseRoute;
}[] = [
  { key: 'work', label: '工作记录', Icon: FileText, route: EnterpriseRoute.Dashboard },
  { key: 'scheduled', label: '定时任务', Icon: Clock, route: EnterpriseRoute.ScheduledTasks },
  { key: 'memories', label: '记忆', Icon: Clock, route: EnterpriseRoute.Memories },
  { key: 'logs', label: '对话日志', Icon: Calendar, route: EnterpriseRoute.Feedback },
];

function EmployeeProfileTabs({ activeKey = 'work' }: { activeKey?: ProfileTabKey }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={activeKey}
      onValueChange={(value) => {
        const tab = PROFILE_TABS.find((item) => item.key === value);
        if (tab && value !== activeKey) navigate(tab.route);
      }}
      sx={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}
    >
      <TabsList
        aria-label="个人档案分区"
        sx={{ height: '35px', width: '504px', maxWidth: '100%', gap: '8px', borderRadius: 0, bgcolor: 'transparent', p: 0 }}
      >
        {PROFILE_TABS.map(({ key, label, Icon }) => (
          <TabsTrigger
            key={key}
            value={key}
            sx={{
              height: '35px',
              flex: 1,
              gap: '7px',
              borderRadius: '8px 8px 0 0',
              border: 0,
              fontSize: '14px',
              fontWeight: 700,
              color: '#8b94aa',
              '&:hover': { color: '#202226' },
              '&[data-state=active]': {
                bgcolor: 'background.paper',
                color: '#202226',
                boxShadow: '0 -12px 28px rgba(21,26,38,0.04)',
              },
            }}
          >
            <Icon />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ display: 'flex', flex: 1, alignItems: 'flex-end', gap: '4px', borderRadius: '10px', bgcolor: '#f6f6f6', px: '20px', py: '8px' }}>
      <Box component="strong" sx={{ fontSize: '14px', lineHeight: 'none', fontWeight: 500, color: '#18181a' }}>{value}</Box>
      <Box component="span" sx={{ fontSize: '12px', lineHeight: 'none', color: '#464c5e' }}>{label}</Box>
    </Box>
  );
}

function compactSummary(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}
