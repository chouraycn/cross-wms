import { useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import type { SxProps } from '@mui/material/styles';
import {
  Briefcase,
  Calendar,
  ClipboardList,
  Folder,
  Wand2,
  MessageSquare,
  Wrench,
  BookOpen,
  Clock,
} from 'lucide-react';

import { staffdeckDisplayText } from '../../../components/staff/employee.js';
import { staffdeckContent } from '../../../assets/staffdeck-assets';
import type {
  AgentProfileRead,
  AgentWorkRecordEventRead,
  EnterpriseChatSessionRead,
  GeneralSkillRead,
  KnowledgeBaseRead,
  ScheduledTaskRead,
  SkillRead,
  ToolRead,
} from '../../../components/staff/types/index.js';

export type ReplyStats = {
  total: number;
  today: number;
  byDay: Record<string, number>;
};

export type WorkRecordTabProps = {
  selectedAgent: AgentProfileRead;
  activeKnowledge: KnowledgeBaseRead[];
  activeGeneralSkills: GeneralSkillRead[];
  activeSkills: SkillRead[];
  activeTools: ToolRead[];
  activeScheduledTasks: ScheduledTaskRead[];
  employeeSessions: EnterpriseChatSessionRead[];
  replyStats: ReplyStats;
  activityEvents: AgentWorkRecordEventRead[];
  positiveRate: number;
  negativeRate: number;
};

type MetricTone = 'default' | 'positive' | 'negative';

const metricToneSx: Record<MetricTone, SxProps> = {
  default: { border: '0.5px solid', borderColor: '#e3e7f1', bgcolor: 'transparent', '&:hover': { bgcolor: '#f7f8fa' } },
  positive: { bgcolor: '#e9f7ef', '&:hover': { bgcolor: '#dcf1e5' } },
  negative: { bgcolor: '#fce7e7', '&:hover': { bgcolor: '#f9dada' } },
};

const metricValueToneSx: Record<MetricTone, SxProps> = {
  default: { color: '#18181a' },
  positive: { color: '#2cb360' },
  negative: { color: '#d20b0b' },
};

const capabilityBaseSx = {
  position: 'relative',
  display: 'flex',
  height: '230px',
  width: '100%',
  minWidth: 0,
  appearance: 'none',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '6px',
  overflow: 'hidden',
  borderRadius: '20px',
  border: '1px solid',
  px: '24px',
  py: '20px',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'transform 180ms ease, box-shadow 180ms ease',
};

const capabilityLightCardSx: SxProps = {
  ...capabilityBaseSx,
  borderColor: '#f6f6f6',
  bgcolor: 'background.paper',
  boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 12px 26px rgba(0,0,0,0.08)' },
};

const capabilityDarkCardSx: SxProps = {
  ...capabilityBaseSx,
  borderColor: '#29282d',
  bgcolor: '#29282d',
  color: '#fff',
  boxShadow: 'none',
  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 12px 26px rgba(0,0,0,0.28)' },
};

const capabilityGlyphSx: SxProps = {
  flexShrink: 0,
  color: '#858b9c',
  '[data-tone="dark"] &': { color: '#fff' },
};

const capabilityNameSx: SxProps = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '14px',
  fontWeight: 400,
  color: '#858b9c',
  '[data-tone="dark"] &': { color: '#fff' },
};

const capabilityBarSx: SxProps = {
  display: 'block',
  height: '4px',
  width: '100%',
  overflow: 'hidden',
  borderRadius: '90px',
  bgcolor: '#e9e9e9',
  '[data-tone="dark"] &': { bgcolor: '#6a6a6a' },
};

const capabilityBarFillSx: SxProps = {
  display: 'block',
  height: '100%',
  width: '20px',
  borderRadius: '90px',
  bgcolor: '#282931',
  '[data-tone="dark"] &': { bgcolor: '#e9e9e9' },
};

const capabilityDescSx: SxProps = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 5,
  overflow: 'hidden',
  minWidth: 0,
  fontSize: '10px',
  lineHeight: '16px',
  fontWeight: 400,
  color: '#757f9c',
  overflowWrap: 'anywhere',
  '[data-tone="dark"] &': {
    WebkitLineClamp: 2,
    color: '#f6f6f6',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
};

export default function WorkRecordTab({
  selectedAgent,
  activeKnowledge,
  activeGeneralSkills,
  activeSkills,
  activeTools,
  activeScheduledTasks,
  employeeSessions,
  replyStats,
  activityEvents,
  positiveRate,
  negativeRate,
}: WorkRecordTabProps) {
  const navigate = useNavigate();
  const goToLogs = () => navigate(`/staff/feedback?agent_id=${encodeURIComponent(selectedAgent.id)}`);

  const capabilityCards = [
    {
      route: '/staff/knowledge',
      title: '知识库',
      count: activeKnowledge.length,
      body: activeKnowledge.slice(0, 3).map((item) => staffdeckDisplayText(item.name)).join(' / ') || '暂无知识库',
      icon: <Box sx={capabilityGlyphSx}><Folder size={14} /></Box>,
      dark: false,
    },
    {
      route: '/staff/general-skills',
      title: '技能',
      count: activeGeneralSkills.length,
      body: activeGeneralSkills.slice(0, 3).map((item) => staffdeckDisplayText(item.name)).join(' / ') || '暂无启用技能',
      icon: <Box sx={capabilityGlyphSx}><Wand2 size={14} /></Box>,
      dark: false,
    },
    {
      route: '/staff/skills',
      title: 'SOP',
      count: activeSkills.length,
      body: activeSkills.slice(0, 3).map((item) => staffdeckDisplayText(item.name)).join(' / ') || '暂无启用 SOP',
      icon: <Box sx={capabilityGlyphSx}><ClipboardList size={14} /></Box>,
      dark: false,
    },
    {
      route: '/staff/tools',
      title: '工具',
      count: activeTools.length,
      body: activeTools.slice(0, 3).map((item) => staffdeckDisplayText(item.display_name || item.name)).join(' / ') || '暂无启用工具',
      icon: <Box sx={capabilityGlyphSx}><Briefcase size={14} /></Box>,
      dark: true,
      preview: staffdeckContent.capabilitytools,
    },
    {
      route: '/staff/scheduled-tasks',
      title: '定时任务',
      count: activeScheduledTasks.length,
      body: activeScheduledTasks.slice(0, 2).map((item) => staffdeckDisplayText(item.title)).join(' / ') || '暂无启用定时任务',
      icon: <Box sx={capabilityGlyphSx}><Calendar size={14} /></Box>,
      dark: true,
      preview: staffdeckContent.capabilitytasks,
    },
    {
      route: `/staff/feedback?agent_id=${encodeURIComponent(selectedAgent.id)}`,
      title: '对话日志',
      count: replyStats.total,
      body: staffdeckDisplayText(employeeSessions[0]?.summary || employeeSessions[0]?.last_agent_question || '暂无对话任务'),
      icon: <Box sx={capabilityGlyphSx}><MessageSquare size={14} /></Box>,
      dark: true,
      preview: staffdeckContent.capabilitylogs,
    },
  ];

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        mt: '-2px',
        flexDirection: 'column',
        gap: '24px',
        overflow: 'hidden',
        borderRadius: '18px',
        boxShadow: '0 20px 42px rgba(21,26,38,0.045)',
        bgcolor: 'background.paper',
        p: '14px',
        '& > *': { minWidth: 0 },
        '@media (min-width:521px)': { p: '18px' },
      }}
    >
      <Box sx={{ display: 'flex', width: '100%', alignItems: 'stretch', gap: '16px' }}>
        <ClickableMetric label="今日对话" value={replyStats.today} onClick={goToLogs} />
        <ClickableMetric label="累计对话" value={replyStats.total} onClick={goToLogs} />
        <ClickableMetric label="好评率" value={positiveRate} suffix="%" tone="positive" onClick={goToLogs} />
        <ClickableMetric label="差评率" value={negativeRate} suffix="%" tone="negative" onClick={goToLogs} />
      </Box>

      {/* 活动时间线：按日期分组的竖向时间轴（Day/Week/Month 切换与 HoverCard 为后续增强） */}
      <ActivityTimeline events={activityEvents} />

      <Box sx={{ width: '100%', minWidth: 0, maxWidth: '100%', overflowX: 'auto' }}>
        <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(160px,1fr)', gap: 'clamp(18px,2.22vw,32px)' }}>
          {capabilityCards.map((item) => (
            <Box
              component="button"
              type="button"
              key={item.title}
              data-tone={item.dark ? 'dark' : 'light'}
              onClick={() => navigate(item.route)}
              sx={item.dark ? capabilityDarkCardSx : capabilityLightCardSx}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '6px', pr: '24px' }}>
                  {item.icon}
                  <Box component="span" sx={capabilityNameSx}>{item.title}</Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Box
                    component="strong"
                    sx={{
                      fontSize: '24px',
                      lineHeight: 'none',
                      fontWeight: 600,
                      color: '#18181a',
                      '[data-tone="dark"] &': { color: '#fff' },
                    }}
                  >
                    {item.count}
                  </Box>
                  <Box component="span" sx={capabilityBarSx}>
                    <Box component="span" sx={capabilityBarFillSx} />
                  </Box>
                </Box>
              </Box>
              <Box component="span" sx={capabilityDescSx}>{item.body}</Box>
              {item.preview && (
                <Box
                  component="img"
                  src={item.preview}
                  alt=""
                  aria-hidden="true"
                  sx={{
                    position: 'absolute',
                    right: '10px',
                    bottom: '10px',
                    width: '84px',
                    height: '84px',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    opacity: 0.9,
                    pointerEvents: 'none',
                    '[data-tone="dark"] &': { opacity: 0.78 },
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function toDateKey(ts: string): string {
  const n = Number(ts);
  const date = !Number.isNaN(n) ? new Date(n * 1000) : new Date(ts);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return date.toISOString().slice(0, 10);
}

function formatTime(ts: string): string {
  const n = Number(ts);
  const date = !Number.isNaN(n) ? new Date(n * 1000) : new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
}

function groupByDate(events: AgentWorkRecordEventRead[]): Array<[string, AgentWorkRecordEventRead[]]> {
  const map = new Map<string, AgentWorkRecordEventRead[]>();
  for (const e of events) {
    const d = toDateKey(e.timestamp);
    const arr = map.get(d);
    if (arr) arr.push(e);
    else map.set(d, [e]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

const kindIconSx: SxProps = {
  flexShrink: 0,
  display: 'inline-flex',
  color: '#858b9c',
};

function KindIcon({ kind }: { kind: AgentWorkRecordEventRead['kind'] }) {
  switch (kind) {
    case 'chat':
      return <Box sx={kindIconSx}><MessageSquare size={14} /></Box>;
    case 'task':
      return <Box sx={kindIconSx}><Calendar size={14} /></Box>;
    case 'sop':
      return <Box sx={kindIconSx}><ClipboardList size={14} /></Box>;
    case 'tool':
      return <Box sx={kindIconSx}><Wrench size={14} /></Box>;
    case 'knowledge':
      return <Box sx={kindIconSx}><BookOpen size={14} /></Box>;
    case 'skill':
      return <Box sx={kindIconSx}><Wand2 size={14} /></Box>;
    default:
      return <Box sx={kindIconSx}><Clock size={14} /></Box>;
  }
}

function ActivityTimeline({ events }: { events: AgentWorkRecordEventRead[] }) {
  if (!events.length) {
    return <Box component="div" sx={{ fontSize: '12px', color: '#9aa0ad' }}>暂无活动时间线</Box>;
  }
  const groups = groupByDate(events);
  return (
    <Box component="div" sx={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '14px' }}>
      <Box component="div" sx={{ fontSize: '13px', fontWeight: 500, color: '#18181a' }}>活动时间线</Box>
      {groups.map(([date, evs]) => (
        <Box key={date} component="div" sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Box component="div" sx={{ fontSize: '12px', color: '#9aa0ad' }}>{date}</Box>
          <Box component="ol" sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px', pl: '18px' }}>
            <Box component="span" sx={{ position: 'absolute', bottom: '4px', left: '5px', top: '4px', width: '1.5px', bgcolor: '#e3e7f1' }} />
            {evs.map((e) => (
              <Box key={e.id} component="li" sx={{ position: 'relative' }}>
                <Box component="span" sx={{ position: 'absolute', left: '-18px', top: '4px', width: '9px', height: '9px', borderRadius: '50%', bgcolor: '#4f7cff', boxShadow: '0 0 0 2px #fff' }} />
                <Box component="div" sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KindIcon kind={e.kind} />
                  <Box component="span" sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', color: '#18181a' }}>{e.label}</Box>
                  <Box component="span" sx={{ flexShrink: 0, fontSize: '11px', color: '#9aa0ad' }}>{formatTime(e.timestamp)}</Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ClickableMetric({
  label,
  value,
  suffix = '',
  tone = 'default',
  onClick,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: MetricTone;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        minWidth: '1px',
        flex: '1 0 0',
        cursor: 'pointer',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '4px',
        borderRadius: '20px',
        px: '32px',
        py: '16px',
        textAlign: 'left',
        transition: 'background-color 180ms ease',
        ...metricToneSx[tone],
      }}
    >
      <Box
        component="strong"
        sx={{
          fontSize: '18px',
          fontWeight: 500,
          lineHeight: 'none',
          ...metricValueToneSx[tone],
        }}
      >
        {value}
        {suffix}
      </Box>
      <Box component="span" sx={{ fontSize: '12px', lineHeight: 'none', color: '#757f9c' }}>{label}</Box>
    </Box>
  );
}
