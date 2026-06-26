/**
 * ExecutionTrace - ReAct 执行轨迹组件（纯 CSS + React，无 MUI 依赖）
 *
 * 展示 ReAct 执行轨迹：推理 → 执行 → 观察 → 反思 → 完成
 * 左侧竖线 + 圆点的时间线布局
 * 支持折叠/展开
 * 流式时显示脉冲动画（CSS @keyframes）
 */
import React, { memo, useState } from 'react';

export interface ExecutionPhase {
  id: string;
  name: 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done';
  label: string;
  description?: string;
  isActive: boolean;
  isCompleted: boolean;
  children?: React.ReactNode;
}

export interface ExecutionTraceProps {
  phases: ExecutionPhase[];
  isStreaming?: boolean;
}

const PHASE_COLORS: Record<ExecutionPhase['name'], string> = {
  reasoning: '#8B5CF6',   // 紫色
  acting: '#3B82F6',      // 蓝色
  observing: '#10B981',   // 绿色
  reflecting: '#F59E0B',  // 琥珀色
  done: '#22C55E',        // 绿色
};

const PHASE_ICONS: Record<ExecutionPhase['name'], string> = {
  reasoning: '\u{1F9E0}', // 🧠
  acting: '\u{2699}',     // ⚙
  observing: '\u{1F50D}', // 🔍
  reflecting: '\u{1F4AD}', // 💭
  done: '\u{2705}',       // ✅
};

const ExecutionTrace: React.FC<ExecutionTraceProps> = memo(function ExecutionTrace({
  phases,
  isStreaming = false,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!phases || phases.length === 0) return null;

  const activePhase = phases.find(p => p.isActive);
  const completedCount = phases.filter(p => p.isCompleted).length;

  return (
    <div className="cdf-execution-trace">
      {/* 折叠头部 */}
      <button
        className="cdf-execution-trace__header"
        onClick={() => setExpanded(v => !v)}
        type="button"
      >
        <div className="cdf-execution-trace__header-left">
          <span className="cdf-execution-trace__header-icon">{PHASE_ICONS[activePhase?.name || 'reasoning']}</span>
          <span className="cdf-execution-trace__header-label">
            {activePhase ? activePhase.label : '执行轨迹'}
          </span>
          {isStreaming && (
            <span className="cdf-execution-trace__pulse" />
          )}
        </div>
        <div className="cdf-execution-trace__header-right">
          <span className="cdf-execution-trace__header-progress">
            {completedCount}/{phases.length}
          </span>
          <svg
            className={`cdf-execution-trace__header-arrow ${expanded ? 'cdf-execution-trace__header-arrow--open' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* 展开内容：时间线 */}
      {expanded && (
        <div className="cdf-execution-trace__timeline">
          {phases.map((phase, index) => {
            const color = PHASE_COLORS[phase.name];
            const isLast = index === phases.length - 1;

            return (
              <div
                key={phase.id}
                className={`cdf-execution-trace__node ${
                  phase.isActive ? 'cdf-execution-trace__node--active' : ''
                } ${phase.isCompleted ? 'cdf-execution-trace__node--completed' : ''}`}
              >
                {/* 竖线 */}
                {!isLast && (
                  <div
                    className="cdf-execution-trace__line"
                    style={{
                      background: phase.isCompleted
                        ? color
                        : 'var(--cdf-border)',
                    }}
                  />
                )}

                {/* 圆点 */}
                <div
                  className={`cdf-execution-trace__dot ${
                    phase.isActive && isStreaming ? 'cdf-execution-trace__dot--pulse' : ''
                  }`}
                  style={{
                    background: phase.isCompleted || phase.isActive ? color : 'var(--cdf-border)',
                    borderColor: phase.isCompleted || phase.isActive ? color : 'var(--cdf-border)',
                  }}
                >
                  {phase.isCompleted && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                {/* 内容区 */}
                <div className="cdf-execution-trace__content">
                  <div className="cdf-execution-trace__content-label" style={{ color: phase.isActive || phase.isCompleted ? color : 'var(--cdf-text-muted)' }}>
                    {PHASE_ICONS[phase.name]} {phase.label}
                  </div>
                  {phase.description && (
                    <div className="cdf-execution-trace__content-desc">
                      {phase.description}
                    </div>
                  )}
                  {phase.children && (
                    <div className="cdf-execution-trace__content-children">
                      {phase.children}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ExecutionTrace;
