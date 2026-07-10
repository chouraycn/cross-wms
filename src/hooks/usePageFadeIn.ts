import { useState, useEffect } from 'react';

/**
 * WKWebView 兼容的页面淡入 className hook。
 *
 * WKWebView（macOS 桌面壳）不支持 CSS @keyframes，导致 .page-fade-in 的
 * `animation: fadeInUp` 静默失效（页面直接瞬显）。这里改用 useEffect + CSS
 * transition 实现：挂载后下一"帧"（setTimeout 16ms，符合项目约定）添加
 * `.visible`，由 .page-fade-in / .page-fade-in.visible 的 transition 完成淡入。
 *
 * 与 shared/FadeIn 同一范式，全环境（浏览器 + WKWebView）一致生效。
 *
 * 用法：
 *   const fadeCls = usePageFadeIn();
 *   return <Box className={fadeCls}> ... </Box>;
 */
export function usePageFadeIn(base = 'page-fade-in'): string {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(timer);
  }, []);

  return visible ? `${base} visible` : base;
}

export default usePageFadeIn;
