import React, { useState, useEffect } from 'react';

interface PulsingTextProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** 单次明暗切换的间隔毫秒数，默认 750ms（一个完整呼吸约 1.5s） */
  interval?: number;
}

/**
 * WKWebView 兼容的脉冲（呼吸）文字。
 *
 * 原代码用 inline `animation: 'pulse 1.5s infinite'`，但项目中并不存在
 * `@keyframes pulse` 定义——即该动画是死代码，浏览器与 WKWebView 下都不会动。
 * 这里用 setInterval 切换 opacity + CSS transition 实现真正的呼吸效果，
 * 符合项目「不用 @keyframes，用 JS 定时 + transition」的 WKWebView 约定。
 */
const PulsingText: React.FC<PulsingTextProps> = ({ children, style, interval = 750 }) => {
  const [dim, setDim] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setDim(d => !d), interval);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <span
      style={{
        opacity: dim ? 0.4 : 1,
        transition: `opacity ${interval}ms ease-in-out`,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export default PulsingText;
