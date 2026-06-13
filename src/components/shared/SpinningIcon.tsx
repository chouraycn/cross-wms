import React, { useState, useEffect, useRef } from 'react';

interface SpinningIconProps {
  children: React.ReactNode;
  spinning: boolean;
  style?: React.CSSProperties;
}

/**
 * WKWebView 兼容的旋转动画组件
 * 使用 requestAnimationFrame 替代 CSS @keyframes spin
 */
export const SpinningIcon: React.FC<SpinningIconProps> = ({ children, spinning, style }) => {
  const [rotation, setRotation] = useState(0);
  const animFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  useEffect(() => {
    if (!spinning) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = undefined;
      }
      setRotation(0);
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      setRotation(prev => (prev + (delta / 1000) * 360) % 360);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
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
