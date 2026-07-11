/**
 * CDFChat 窗口事件监听 Hook
 *
 * 集中管理 ChatThread 中需要监听的 window CustomEvent：
 * - cdf-sidebar-state：左侧侧边栏折叠状态
 * - approval_request：审批请求（从 SSE 流中触发，打开审批对话框）
 * - cdf-know-clow-navigate-chat / cdf-know-clow-focus-chat：聚焦聊天输入框
 *
 * 事件名统一使用 CdfEvents 常量（见 src/events/events.ts）。
 */
import { useEffect } from 'react';
import { CdfEvents } from '../events/events.js';

/** useChatEventListeners 入参 */
export interface UseChatEventListenersProps {
  /** 设置左侧侧边栏是否折叠 */
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  /** 设置是否显示审批对话框 */
  setShowApprovalDialog: (open: boolean) => void;
  /** 是否为独立页面变体（仅 page 变体下才注册聚焦输入框事件） */
  isPage: boolean;
}

/**
 * CDFChat 窗口事件监听 Hook
 */
export function useChatEventListeners({
  setLeftSidebarCollapsed,
  setShowApprovalDialog,
  isPage,
}: UseChatEventListenersProps): void {
  // 监听左侧侧边栏折叠状态（展开时隐藏内容框左侧的侧边栏切换和新对话按钮）
  useEffect(() => {
    const handleSidebarToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.collapsed === 'boolean') {
        setLeftSidebarCollapsed(detail.collapsed);
      }
    };
    // 从 localStorage 读取初始状态
    try {
      const stored = localStorage.getItem('cdf-know-clow-sidebar-collapsed');
      if (stored === 'true') setLeftSidebarCollapsed(true);
    } catch { /* ignore */ }
    window.addEventListener(CdfEvents.SIDEBAR_STATE, handleSidebarToggle);
    return () => window.removeEventListener(CdfEvents.SIDEBAR_STATE, handleSidebarToggle);
  }, [setLeftSidebarCollapsed]);

  // 监听 approval_request 事件（从 SSE 流中）
  useEffect(() => {
    const handleApprovalRequestEvent = (event: CustomEvent) => {
      const request = event.detail;
      setShowApprovalDialog(true);
    };

    window.addEventListener(CdfEvents.APPROVAL_REQUEST, handleApprovalRequestEvent as EventListener);

    return () => {
      window.removeEventListener(CdfEvents.APPROVAL_REQUEST, handleApprovalRequestEvent as EventListener);
    };
  }, [setShowApprovalDialog]);

  // 监听导航到聊天 / 聚焦聊天输入框事件
  useEffect(() => {
    if (!isPage) return;
    const focusInput = () => {
      setTimeout(() => {
        const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editable) {
          editable.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editable);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 200);
    };
    const handleNavigateToChat = () => focusInput();
    const handleFocusChat = () => focusInput();
    window.addEventListener(CdfEvents.NAVIGATE_CHAT, handleNavigateToChat);
    window.addEventListener(CdfEvents.FOCUS_CHAT, handleFocusChat);
    return () => {
      window.removeEventListener(CdfEvents.NAVIGATE_CHAT, handleNavigateToChat);
      window.removeEventListener(CdfEvents.FOCUS_CHAT, handleFocusChat);
    };
  }, [isPage]);
}

export default useChatEventListeners;
