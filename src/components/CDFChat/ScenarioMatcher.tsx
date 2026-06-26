/**
 * 场景推荐组件
 * 根据用户输入推荐 Agent 场景
 */
import React, { memo, useMemo } from 'react';
import { AgentIdentity, AgentAvatar, AGENT_SCENARIOS } from './AgentProfile';
import './AgentSwitcher.css';

interface ScenarioMatcherProps {
  userInput: string;
  currentAgent: AgentIdentity;
  onAgentSelect: (agent: AgentIdentity) => void;
  darkMode?: boolean;
}

// ===================== 关键词匹配规则 =====================

interface ScenarioRule {
  keywords: string[];
  agentId: string;
  reason: string;
  weight: number;
}

const SCENARIO_RULES: ScenarioRule[] = [
  // 代码相关
  {
    keywords: ['代码', 'code', '编程', '写程序', 'debug', '调试', '函数', 'class', 'import', 'export', 'python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c++', '报错', 'bug'],
    agentId: 'coder',
    reason: '检测到代码相关话题',
    weight: 3,
  },
  // 数据分析相关
  {
    keywords: ['分析', '数据', '统计', '图表', '可视化', 'excel', 'csv', '数据处理', 'analytics', 'dashboard', '报表', '趋势'],
    agentId: 'analyst',
    reason: '检测到数据分析需求',
    weight: 3,
  },
  // 创意相关
  {
    keywords: ['创意', '写作', '文案', '故事', '小说', '诗歌', '创作', '头脑风暴', 'idea', '灵感', 'marketing', '营销'],
    agentId: 'creative',
    reason: '检测到创意创作需求',
    weight: 3,
  },
  // 专家/技术咨询
  {
    keywords: ['专家', '咨询', '技术', '架构', '设计模式', '原理', '解释', '专业', '学术', '论文', '研究'],
    agentId: 'expert',
    reason: '检测到专业咨询需求',
    weight: 2,
  },
  // 批评建议
  {
    keywords: ['批评', '建议', '反馈', 'review', '评审', '评估', '改进', '优化建议'],
    agentId: 'critic',
    reason: '检测到评审反馈需求',
    weight: 2,
  },
];

// ===================== 匹配函数 =====================

function matchScenario(input: string): { agent: AgentIdentity; reason: string; score: number }[] {
  if (!input || input.trim().length < 2) {
    return [];
  }

  const lowerInput = input.toLowerCase();
  const matches: { agent: AgentIdentity; reason: string; score: number }[] = [];

  for (const rule of SCENARIO_RULES) {
    const matchedKeywords = rule.keywords.filter((keyword) =>
      lowerInput.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      const agent = AGENT_SCENARIOS.find((a) => a.id === rule.agentId);
      if (agent && agent.enabled !== false) {
        matches.push({
          agent,
          reason: rule.reason,
          score: matchedKeywords.length * rule.weight,
        });
      }
    }
  }

  // 按匹配分数排序
  return matches.sort((a, b) => b.score - a.score);
}

// ===================== ScenarioMatcher 组件 =====================

export const ScenarioMatcher: React.FC<ScenarioMatcherProps> = memo(function ScenarioMatcher({
  userInput,
  currentAgent,
  onAgentSelect,
  darkMode = false,
}) {
  const recommendations = useMemo(() => {
    return matchScenario(userInput).filter((m) => m.agent.id !== currentAgent.id);
  }, [userInput, currentAgent.id]);

  if (recommendations.length === 0) {
    return null;
  }

  const containerClass = `cdf-scenario-matcher ${darkMode ? 'cdf-dark' : ''}`;

  return (
    <div className={containerClass}>
      <div className="cdf-scenario-matcher__header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>推荐切换到</span>
      </div>
      <div className="cdf-scenario-matcher__list">
        {recommendations.slice(0, 3).map(({ agent, reason }) => (
          <button
            key={agent.id}
            className="cdf-scenario-matcher__item"
            onClick={() => onAgentSelect(agent)}
          >
            <AgentAvatar agent={agent} size={24} showTooltip={false} />
            <div className="cdf-scenario-matcher__item-info">
              <span className="cdf-scenario-matcher__item-name">{agent.name}</span>
              <span className="cdf-scenario-matcher__item-reason">{reason}</span>
            </div>
            <svg
              className="cdf-scenario-matcher__item-arrow"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
});

ScenarioMatcher.displayName = 'ScenarioMatcher';

export default ScenarioMatcher;
