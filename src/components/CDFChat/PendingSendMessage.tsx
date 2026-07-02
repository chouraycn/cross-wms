/**
 * 待发送消息组件 — 发送状态可视化
 *
 * 支持：
 * - 发送中状态（灰色气泡 + 加载动画）
 * - 发送失败状态（红色 + 重试按钮）
 * - 附件展示
 */

import React from 'react';

interface PendingSendMessageProps {
  /** 发送状态 */
  state: 'queued' | 'sending' | 'failed';
  /** 失败原因 */
  error?: string;
  /** 重试回调 */
  onRetry?: () => void;
}

export const PendingSendMessage: React.FC<PendingSendMessageProps> = ({
  state,
  error,
  onRetry,
}) => {
  return (
    <div className={`cdf-pending-send cdf-pending-send--${state}`}>
      <div className="cdf-pending-send__status">
        {state === 'queued' && <span className="cdf-pending-send__indicator">排队中</span>}
        {state === 'failed' && (
          <div className="cdf-pending-send__error">
            <span className="cdf-pending-send__indicator cdf-pending-send__indicator--failed">
              发送失败{error ? `: ${error}` : ''}
            </span>
            {onRetry && (
              <button className="cdf-pending-send__retry-btn" onClick={onRetry}>
                重试
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
