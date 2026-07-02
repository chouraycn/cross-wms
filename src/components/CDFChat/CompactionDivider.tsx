/**
 * 压缩历史分隔符组件
 *
 * 标记压缩历史边界，支持：
 * - 显示压缩标签和摘要
 * - 点击展开查看压缩前内容
 * - 压缩比例和消息数量展示
 */

import React, { useState } from 'react';

interface CompactionDividerProps {
  /** 分隔符标签 */
  label: string;
  /** 压缩摘要 */
  summary?: string;
  /** 压缩前消息数量 */
  originalCount?: number;
  /** 压缩比例 */
  compressionRatio?: number;
  /** 点击展开回调 */
  onExpand?: () => void;
}

export const CompactionDivider: React.FC<CompactionDividerProps> = ({
  label,
  summary,
  originalCount,
  compressionRatio,
  onExpand,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded && onExpand) {
      onExpand();
    }
  };

  return (
    <div className="cdf-compaction-divider">
      <button
        className="cdf-compaction-divider__header"
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <span className="cdf-compaction-divider__line" />
        <span className="cdf-compaction-divider__icon">💬</span>
        <span className="cdf-compaction-divider__label">{label}</span>
        {originalCount !== undefined && (
          <span className="cdf-compaction-divider__count">
            {originalCount} 条消息
          </span>
        )}
        {compressionRatio !== undefined && (
          <span className="cdf-compaction-divider__ratio">
            压缩率 {(compressionRatio * 100).toFixed(0)}%
          </span>
        )}
        <span className="cdf-compaction-divider__line" />
      </button>
      {isExpanded && summary && (
        <div className="cdf-compaction-divider__summary">
          {summary}
        </div>
      )}
    </div>
  );
};
