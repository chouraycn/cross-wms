/**
 * 读取指示器组件 — "正在输入"效果
 *
 * 基于 OpenClaw Reading Indicator 设计，支持三种动画变体：
 * - dots: 三个点依次出现消失
 * - bounce: 弹跳动画
 * - pulse: 脉冲效果
 */

import React from 'react';
import { ThinkingIcon } from '../Common/Icons';

interface ReadingIndicatorProps {
  /** 指示器文本 */
  text?: string;
  /** 动画类型 */
  variant?: 'dots' | 'bounce' | 'pulse';
  /** 当前阶段 */
  phase?: 'thinking' | 'generating' | 'tool-executing';
}

const PHASE_TEXTS = {
  thinking: 'AI 正在思考...',
  generating: 'AI 正在输入...',
  'tool-executing': 'AI 正在执行工具...',
} as const;

export const ReadingIndicator: React.FC<ReadingIndicatorProps> = ({
  text,
  variant = 'dots',
  phase = 'thinking',
}) => {
  const displayText = text || PHASE_TEXTS[phase];

  return (
    <div className={`cdf-reading-indicator cdf-reading-indicator--${variant}`}>
      {/* v1.7.87: 用闪光 SVG 图标替换 "AI" 文本 */}
      <div className="cdf-reading-indicator__avatar">
        <ThinkingIcon size={20} color="#fff" />
      </div>
      <div className="cdf-reading-indicator__content">
        {variant === 'dots' && (
          <div className="cdf-reading-indicator__dots">
            <span className="cdf-reading-indicator__dot" />
            <span className="cdf-reading-indicator__dot" />
            <span className="cdf-reading-indicator__dot" />
          </div>
        )}
        {variant === 'bounce' && (
          <div className="cdf-reading-indicator__bounce">
            <span className="cdf-reading-indicator__dot" />
            <span className="cdf-reading-indicator__dot" />
            <span className="cdf-reading-indicator__dot" />
          </div>
        )}
        {variant === 'pulse' && (
          <div className="cdf-reading-indicator__pulse">
            <span className="cdf-reading-indicator__dot" />
          </div>
        )}
        <span className="cdf-reading-indicator__text">{displayText}</span>
      </div>
    </div>
  );
};
