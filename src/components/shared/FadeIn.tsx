import React, { useState, useEffect } from 'react';

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number; // 延迟毫秒数
}

/**
 * WKWebView 兼容的淡入动画组件
 * 使用 useState + useEffect 替代 CSS @keyframes fadeIn
 */
const FadeIn: React.FC<FadeInProps> = ({ children, className = '', style, delay = 0 }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        opacity: 0,
        transform: 'translateY(4px)',
        transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
        ...(visible && {
          opacity: 1,
          transform: 'translateY(0)',
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default FadeIn;
