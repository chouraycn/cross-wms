import React, { useState, useEffect, useRef } from 'react';

interface SpinningIconProps {
  children: React.ReactNode;
  spinning: boolean;
  style?: React.CSSProperties;
}

/**
 * WKWebView 兼容的旋转动画组件
 * 使用 setTimeout(fn, 16) 替代 CSS @keyframes spin 与 requestAnimationFrame，
 * 避免 WKWebView 非活跃窗口下 rAF 被暂停导致旋转卡住（项目 WKWebView 兼容约定）。
 */
export const SpinningIcon: React.FC<SpinningIconProps> = ({ children, spinning, style }) => {
  const [rotation, setRotation] = useState(0);
  const animFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  useEffect(() => {
    if (!spinning) {
      if (animFrameRef.current) {
        window.clearTimeout(animFrameRef.current);
        animFrameRef.current = undefined;
      }
      setRotation(0);
      return;
    }

    const animate = () => {
      const now = Date.now();
      if (!lastTimeRef.current) {
        lastTimeRef.current = now;
      }
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      setRotation(prev => (prev + (delta / 1000) * 360) % 360);

      animFrameRef.current = window.setTimeout(animate, 16);
    };

    animFrameRef.current = window.setTimeout(animate, 16);

    return () => {
      if (animFrameRef.current) {
        window.clearTimeout(animFrameRef.current);
        animFrameRef.current = undefined;
      }
      lastTimeRef.current = undefined;
    };
  }, [spinning]);

  return (
    <span
      style={{
        display: 'inline-flex',
        transform: spinning ? `rotate(${rotation}deg)` : 'none',
        transition: 'transform 0.1s linear',
        ...style
      }}
    >
      {children}
    </span>
  );
};

export default SpinningIcon;
