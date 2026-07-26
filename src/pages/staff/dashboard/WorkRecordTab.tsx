import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Calendar,
  ClipboardList,
  Folder,
  Wand2,
  MessageSquare,
} from 'lucide-react';

import { staffdeckDisplayText } from '../../../components/staff/employee.js';
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

const metricToneClass: Record<MetricTone, string> = {
  default: 'border-[0.5px] border-[#e3e7f1] bg-transparent hover:bg-[#f7f8fa]',
  positive: 'bg-[#e9f7ef] hover:bg-[#dcf1e5]',
  negative: 'bg-[#fce7e7] hover:bg-[#f9dada]',
};

const metricValueToneClass: Record<MetricTone, string> = {
  default: 'text-[#18181a]',
  positive: 'text-[#2cb360]',
  negative: 'text-[#d20b0b]',
};

const capabilityCardClass =
  'group relative flex h-[230px] w-full min-w-0 appearance-none flex-col items-stretch gap-[6px] overflow-hidden rounded-[20px] border px-[24px] py-[20px] text-left transition-[transform,box-shadow] duration-[180ms] ease-[ease] hover:-translate-y-[2px]';
const capabilityLightCardClass =
  'border-[#f6f6f6] bg-white shadow-[0_4px_10px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_26px_rgba(0,0,0,0.08)]';
const capabilityDarkCardClass =
  'border-[#29282d] bg-[#29282d] text-white shadow-none hover:shadow-[0_12px_26px_rgba(0,0,0,0.28)]';
const capabilityGlyphClass = 'size-[14px] shrink-0 text-[#858b9c] group-data-[tone=dark]:text-white';
const capabilityNameClass = 'min-w-0 truncate text-[14px] font-normal text-[#858b9c] group-data-[tone=dark]:text-white';
const capabilityBarClass = 'block h-[4px] w-full overflow-hidden rounded-[90px] bg-[#e9e9e9] group-data-[tone=dark]:bg-[#6a6a6a]';
const capabilityBarFillClass = 'block h-full w-[20px] rounded-[90px] bg-[#282931] group-data-[tone=dark]:bg-[#e9e9e9]';
const capabilityDescClass =
  'line-clamp-5 min-w-0 overflow-hidden text-[10px] leading-[16px] font-normal text-[#757f9c] [overflow-wrap:anywhere] group-data-[tone=dark]:line-clamp-2 group-data-[tone=dark]:text-[#f6f6f6]';

export default function WorkRecordTab({
  selectedAgent,
  activeKnowledge,
  activeGeneralSkills,
  activeSkills,
  activeTools,
  activeScheduledTasks,
  employeeSessions,
  replyStats,
  activityEvents: _activityEvents,
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
      icon: <Folder className={capabilityGlyphClass} />,
      dark: false,
    },
    {
      route: '/staff/general-skills',
      title: '技能',
      count: activeGeneralSkills.length,
      body: activeGeneralSkills.slice(0, 3).map((item) => staffdeckDisplayText(item.name)).join(' / ') || '暂无启用技能',
      icon: <Wand2 className={capabilityGlyphClass} />,
      dark: false,
    },
    {
      route: '/staff/skills',
      title: 'SOP',
      count: activeSkills.length,
      body: activeSkills.slice(0, 3).map((item) => staffdeckDisplayText(item.name)).join(' / ') || '暂无启用 SOP',
      icon: <ClipboardList className={capabilityGlyphClass} />,
      dark: false,
    },
    {
      route: '/staff/tools',
      title: '工具',
      count: activeTools.length,
      body: activeTools.slice(0, 3).map((item) => staffdeckDisplayText(item.display_name || item.name)).join(' / ') || '暂无启用工具',
      icon: <Briefcase className={capabilityGlyphClass} />,
      dark: true,
    },
    {
      route: '/staff/scheduled-tasks',
      title: '定时任务',
      count: activeScheduledTasks.length,
      body: activeScheduledTasks.slice(0, 2).map((item) => staffdeckDisplayText(item.title)).join(' / ') || '暂无启用定时任务',
      icon: <Calendar className={capabilityGlyphClass} />,
      dark: true,
    },
    {
      route: `/staff/feedback?agent_id=${encodeURIComponent(selectedAgent.id)}`,
      title: '对话日志',
      count: replyStats.total,
      body: staffdeckDisplayText(employeeSessions[0]?.summary || employeeSessions[0]?.last_agent_question || '暂无对话任务'),
      icon: <MessageSquare className={capabilityGlyphClass} />,
      dark: true,
    },
  ];

  return (
    <section className="relative flex w-full min-w-0 max-w-full mt-[-2px] flex-col gap-[24px] overflow-hidden rounded-[18px] shadow-[0_20px_42px_rgba(21,26,38,0.045)] bg-white p-[14px] *:min-w-0 min-[521px]:p-[18px]">
      <div className="flex w-full items-stretch gap-[16px]">
        <ClickableMetric label="今日对话" value={replyStats.today} onClick={goToLogs} />
        <ClickableMetric label="累计对话" value={replyStats.total} onClick={goToLogs} />
        <ClickableMetric label="好评率" value={positiveRate} suffix="%" tone="positive" onClick={goToLogs} />
        <ClickableMetric label="差评率" value={negativeRate} suffix="%" tone="negative" onClick={goToLogs} />
      </div>

      {/* TODO: ActivityTimeline（Day/Week/Month 视图、HoverCard、日期选择器）复杂度高，待后续完整移植 */}

      <div className="w-full min-w-0 max-w-full overflow-x-auto">
        <div className="grid grid-flow-col auto-cols-[minmax(160px,1fr)] gap-[clamp(18px,2.22vw,32px)]">
          {capabilityCards.map((item) => (
            <button
              type="button"
              key={item.title}
              className={`${capabilityCardClass} ${item.dark ? capabilityDarkCardClass : capabilityLightCardClass}`}
              data-tone={item.dark ? 'dark' : 'light'}
              onClick={() => navigate(item.route)}
            >
              <span className="flex flex-col gap-[12px]">
                <span className="flex min-w-0 items-center gap-[6px] pr-[24px]">
                  {item.icon}
                  <span className={capabilityNameClass}>{item.title}</span>
                </span>
                <span className="flex flex-col gap-[6px]">
                  <strong className="text-[24px] leading-none font-semibold text-[#18181a] group-data-[tone=dark]:text-white">
                    {item.count}
                  </strong>
                  <span className={capabilityBarClass}>
                    <span className={capabilityBarFillClass} />
                  </span>
                </span>
              </span>
              <span className={capabilityDescClass}>{item.body}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
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
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-px flex-[1_0_0] cursor-pointer flex-col justify-center gap-[4px] rounded-[20px] px-[32px] py-[16px] text-left transition-colors ${metricToneClass[tone]}`}
    >
      <strong className={`text-[18px] font-medium leading-none ${metricValueToneClass[tone]}`}>
        {value}
        {suffix}
      </strong>
      <span className="text-[12px] leading-none text-[#757f9c]">{label}</span>
    </button>
  );
}
