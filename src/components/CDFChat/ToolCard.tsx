/**
 * CDFChat 工具调用折叠卡片（轻量版）
 *
 * - Skill 卡片：绿色边框 + 绿色背景
 * - MCP 卡片：橙色边框 + 橙色背景
 * - 折叠/展开切换
 * - 显示工具名称、输入参数（JSON）、执行结果/错误
 * - 执行中显示加载动画
 * - 纯 CSS + React，无 MUI 依赖
 */
import React, { useState, memo } from 'react';
import type { ToolBlock } from '../../types/message-envelope.js';

interface Props {
  block: ToolBlock;
}

/** 格式化 JSON */
function formatJson(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/** 判断是否为 JSON 字符串 */
function isJsonLike(str: string): boolean {
  const t = str.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/** 截断文本 */
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '\n... (truncated)' : str;
}

const ToolCard: React.FC<Props> = memo(function ToolCard({ block }) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = block.status === 'pending' || block.status === 'running';
  const isFailed = block.status === 'error';
  const isDone = block.status === 'done';
  const isSkill = block.type === 'skill';

  // 格式化结果
  const rawResult = block.error || block.result || '';
  const formattedResult = (() => {
    if (!rawResult) return '';
    if (isJsonLike(rawResult)) {
      try { return JSON.stringify(JSON.parse(rawResult), null, 2); }
      catch { return rawResult; }
    }
    return rawResult;
  })();
  const displayResult = truncate(formattedResult, 500);

  const handleCopy = () => {
    const text = block.error || block.result || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* silent */ }
    }
  };

  return (
    <div className={`cdf-tool-card ${isSkill ? 'cdf-tool-card--skill' : 'cdf-tool-card--mcp'}`}>
      {/* 标题行 */}
      <div className="cdf-tool-card__header" onClick={() => setExpanded(v => !v)}>
        {/* 类型标签 */}
        <span className={`cdf-tool-card__badge ${isSkill ? 'cdf-tool-card__badge--skill' : 'cdf-tool-card__badge--mcp'}`}>
          {isSkill ? 'Skill' : 'MCP'}
        </span>

        {/* 工具名 */}
        <span className="cdf-tool-card__name">{block.name}</span>

        {/* 状态指示 */}
        {isRunning && (
          <span className="cdf-tool-card__status cdf-tool-card__status--running">
            <span className="cdf-tool-card__pulse" /> 执行中
          </span>
        )}
        {isDone && (
          <span className="cdf-tool-card__status cdf-tool-card__status--done">&#10003;</span>
        )}
        {isFailed && (
          <span className="cdf-tool-card__status cdf-tool-card__status--error">&#10007;</span>
        )}

        {/* 展开/折叠箭头 */}
        <span className={`cdf-tool-card__arrow ${expanded ? 'cdf-tool-card__arrow--open' : ''}`}>
          &#9660;
        </span>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="cdf-tool-card__body">
          {/* 输入参数 */}
          {Object.keys(block.input).length > 0 && (
            <div className="cdf-tool-card__section">
              <div className="cdf-tool-card__label">Input</div>
              <pre className="cdf-tool-card__code">{formatJson(block.input)}</pre>
            </div>
          )}

          {/* 结果 / 错误 */}
          {(block.result || block.error) && (
            <div className="cdf-tool-card__section">
              <div className="cdf-tool-card__label-row">
                <span className="cdf-tool-card__label">{isFailed ? 'Error' : 'Result'}</span>
                <button className="cdf-tool-card__copy-btn" onClick={handleCopy} title="Copy">
                  &#128203;
                </button>
              </div>
              <pre className={`cdf-tool-card__code ${isFailed ? 'cdf-tool-card__code--error' : ''}`}>
                {displayResult}
              </pre>
            </div>
          )}

          {/* 加载动画 */}
          {isRunning && !block.result && !block.error && (
            <div className="cdf-tool-card__loading">
              <span className="cdf-spinner" /> 等待结果...
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCard;
