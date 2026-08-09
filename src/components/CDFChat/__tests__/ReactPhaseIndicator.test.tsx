import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import React from 'react';
import ReactPhaseIndicator from '../ReactPhaseIndicator';
import type { Message } from '../../../types/chat';

const lightTheme = createTheme({ palette: { mode: 'light' } });

function renderWith(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

function makePhase(phase: NonNullable<Message['reactPhase']>['phase'], over: Partial<NonNullable<Message['reactPhase']>> = {}): Message['reactPhase'] {
  return { phase, ...over };
}

describe('ReactPhaseIndicator', () => {
  it('renders null when no visibility events are provided', () => {
    const { container } = renderWith(<ReactPhaseIndicator />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('react-phase-indicator')).toBeNull();
  });

  it('renders the indicator and phase labels when reactPhase is present', () => {
    renderWith(<ReactPhaseIndicator reactPhase={makePhase('reasoning')} />);
    expect(screen.getByTestId('react-phase-indicator')).toBeInTheDocument();
    // 四个非完成阶段的短标签（R/A/O/F）应出现
    expect(screen.getByText('R')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('shows the done checkmark and applies fade-out opacity when phase=done', () => {
    renderWith(<ReactPhaseIndicator reactPhase={makePhase('done')} />);
    const root = screen.getByTestId('react-phase-indicator');
    // done 阶段淡出：opacity 降到 0.55
    expect(window.getComputedStyle(root).opacity).toBe('0.55');
    // 完成阶段最后一格渲染为 CheckIcon（svg），而非短标签 ✓
    expect(root.querySelector('svg[data-testid="CheckIcon"]')).not.toBeNull();
  });

  it('applies the reflecting pulse animation to the current (F) dot when phase=reflecting', () => {
    renderWith(<ReactPhaseIndicator reactPhase={makePhase('reflecting')} />);
    // 动画挂在圆点容器（Box）上，而非其内部 <span>，因此取 parentElement
    const fDot = screen.getByText('F').parentElement!;
    const style = window.getComputedStyle(fDot);
    // reflecting 脉冲：animation 简写应包含 1.4s 与 reactPulse
    // （jsdom 不展开 animation 简写到 longhand，故断言简写字符串）
    expect(style.animation).toContain('1.4s');
    expect(style.animation).toContain('reactPulse');
    expect(style.animation).toContain('infinite');
  });

  it('does not apply pulse animation when phase is not reflecting', () => {
    renderWith(<ReactPhaseIndicator reactPhase={makePhase('reasoning')} />);
    const rDot = screen.getByText('R').parentElement!;
    const style = window.getComputedStyle(rDot);
    // 推理阶段当前格不应有脉冲动画（animation 简写为空）
    expect(style.animation === '' || style.animation === 'none').toBe(true);
  });

  it('renders the reflection confidence badge', () => {
    renderWith(
      <ReactPhaseIndicator
        reactPhase={makePhase('reflecting')}
        reflectionConfidence={{ confidenceScore: 8, selfScore: 7, shouldEarlyStop: true, reason: '高置信' }}
      />,
    );
    expect(screen.getByText(/置信 8/)).toBeInTheDocument();
  });

  it('renders the replan triggered badge', () => {
    renderWith(
      <ReactPhaseIndicator
        reactPhase={makePhase('reasoning')}
        replanTriggered={{ reason: '连续失败', oldPlanId: 'p1', newPlanId: 'p2' }}
      />,
    );
    expect(screen.getByText('已重规划')).toBeInTheDocument();
  });

  it('renders the complexity assessment badge', () => {
    renderWith(
      <ReactPhaseIndicator
        reactPhase={makePhase('reasoning')}
        complexityAssessment={{ level: 'complex', estimatedSteps: 6, reason: '多步', recommendedMode: 'react' }}
      />,
    );
    expect(screen.getByText(/高复杂度/)).toBeInTheDocument();
  });

  it('renders the context compressed badge', () => {
    renderWith(
      <ReactPhaseIndicator
        reactPhase={makePhase('reasoning')}
        contextCompressed={{ strategy: 'semantic', originalTokens: 1000, compressedTokens: 400, ratio: 0.4 }}
      />,
    );
    expect(screen.getByText(/压缩/)).toBeInTheDocument();
  });

  it('renders the budget exceeded badge', () => {
    renderWith(
      <ReactPhaseIndicator
        reactPhase={makePhase('acting')}
        budgetExceeded={{ reason: '超限', consumedTurns: 8, consumedTokens: 5000, maxTurns: 10, maxTokens: 8000 }}
      />,
    );
    expect(screen.getByText('预算告警')).toBeInTheDocument();
  });
});
