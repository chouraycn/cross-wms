import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import type { AlertColor } from '@mui/material';
import type { CSSProperties } from 'react';
import { toast, type ExternalToast } from 'sonner';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// ====================== v1.7.187：统一提示系统（员工样式）======================
// 此文件是整个软件提示的唯一实现（一套代码）。
//   - 原软件 ToastContext：MUI Snackbar + Alert，useToast().showToast() 风格
//   - 原员工 ui/app-toast.tsx + ui/sonner.tsx：sonner + ToastPill 员工样式
// 现在把两套完全合并到这里，UI 统一使用员工的 ToastPill + sonner 风格（用户指定以员工样式为准）。
//
// 对外保留两个 API：
//   1) useToast() → { showToast(message, severity?, duration?) }  ← 兼容原有 89 个调用点不变
//   2) notify.success / error / warning / info / loading / dismiss  ← 员工侧使用
//
// Provider 仍接受 sidebarCollapsed prop，并将 Toaster 渲染在 sidebar 右侧内容区的底部中心，
// 确保 toast 不会被侧边栏挡住。
// ================================================================================

// ========== 1. 员工 ToastPill 样式（成功/错误 专用 pill）==========
type ToastVariant = 'success' | 'error';

const VARIANTS: Record<
  ToastVariant,
  { container: SxProps<Theme>; iconColor: string; Icon: typeof CheckCircleIcon }
> = {
  success: {
    container: { borderColor: '#96d9b0', bgcolor: '#e9f7ef', color: '#018434' },
    iconColor: '#2cb360',
    Icon: CheckCircleIcon,
  },
  error: {
    container: { borderColor: '#f38989', bgcolor: '#fce7e7', color: '#d20b0b' },
    iconColor: '#d20b0b',
    Icon: AlertCircleIcon,
  },
};

function ToastPill({ variant, message }: { variant: ToastVariant; message: React.ReactNode }) {
  const { container, iconColor, Icon } = VARIANTS[variant];
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        pointerEvents: 'auto',
        display: 'flex',
        maxWidth: '100%',
        alignItems: 'center',
        gap: '12px',
        borderRadius: '14px',
        border: '1px solid',
        ...container,
        px: '24px',
        py: '10px',
        boxShadow: '0px 12px 32px rgba(0,0,0,0.12)',
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          color: iconColor,
          '& svg': { width: '16px', height: '16px', flexShrink: 0 },
        }}
      >
        <Icon />
      </Box>
      <Box
        component="span"
        sx={{ fontSize: '14px', lineHeight: 'normal', overflowWrap: 'anywhere' }}
      >
        {message}
      </Box>
    </Box>
  );
}

function showVariant(
  variant: ToastVariant,
  message: React.ReactNode,
  options?: AppToastOptions,
) {
  return toast.custom(() => <ToastPill variant={variant} message={message} />, {
    duration: variant === 'success' ? 3200 : 4800,
    unstyled: true,
    className: 'flex w-full justify-center',
    ...options,
  });
}

// ========== 2. 全局 notify API（员工风格） ==========
export type AppToastOptions = Omit<
  ExternalToast,
  'icon' | 'className' | 'style' | 'unstyled' | 'descriptionClassName'
>;

export const notify = {
  success: (message: React.ReactNode, options?: AppToastOptions) =>
    showVariant('success', message, options),
  error: (message: React.ReactNode, options?: AppToastOptions) =>
    showVariant('error', message, options),
  warning: (message: React.ReactNode, options?: AppToastOptions) =>
    toast.warning(message, options),
  info: (message: React.ReactNode, options?: AppToastOptions) =>
    toast.info(message, options),
  loading: (message: React.ReactNode, options?: AppToastOptions) =>
    toast.loading(message, options),
  dismiss: (id?: string | number) => toast.dismiss(id),
};

// ========== 3. 兼容 useToast() / showToast() API（旧软件侧保留） ==========
interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * MUI AlertColor → notify.* 映射
 */
function mapSeverityToNotify(
  message: string,
  severity: AlertColor = 'info',
  duration?: number,
) {
  const opts: AppToastOptions | undefined = duration ? { duration } : undefined;
  switch (severity) {
    case 'success':
      return notify.success(message, opts);
    case 'error':
      return notify.error(message, opts);
    case 'warning':
      return notify.warning(message, opts);
    case 'info':
    default:
      return notify.info(message, opts);
  }
}

// Provider props：保持和原 ToastContext 完全一致（sidebarCollapsed 用于位置计算）
interface ToastProviderProps {
  children: ReactNode;
  sidebarCollapsed: boolean;
}

/**
 * 侧边栏宽度计算 — 与 Sidebar.tsx 常量对齐：
 *   收起 83px / 展开 260px
 */
function getSidebarWidth(collapsed: boolean): number {
  return collapsed ? 83 : 260;
}

/**
 * 全局统一 Toaster（员工风格），根据 sidebarCollapsed 计算偏移，
 * 让 toast 始终显示在主内容区（sidebar 右侧）的底部中央。
 */
export function UnifiedToaster({
  sidebarCollapsed = false,
  ...props
}: ToasterProps & { sidebarCollapsed?: boolean }) {
  const sidebarWidth = getSidebarWidth(sidebarCollapsed);

  // Sonner offset 使用对象形式 { left / right / bottom / top }
  // 内容区宽度 = 100vw - sidebarWidth，让 toast 始终显示在内容区底部中间，
  // 避免渗入左侧 sidebar 区域。
  const toastOffset = {
    bottom: 24,
    left: sidebarWidth + 16, // 额外 16px 安全边距
  } as const;

  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-center"
      offset={toastOffset}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          // 让 toast 最大宽度始终限制在"内容区宽度 - 安全边距"内，
          // 不超出右侧内容区、也不渗入左侧 sidebar 区域
          '--width': `min(calc(100vw - ${sidebarWidth + 32}px), 420px)`,
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
}

// 导出给 staff/ui/sonner.tsx 重新使用（统一成一套组件）
export { UnifiedToaster as Toaster };

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  sidebarCollapsed,
}) => {
  // showToast 稳定 — 直接调用 notify（sonner 本身是全局的）
  const showToast = React.useCallback(
    (message: string, severity: AlertColor = 'info', duration: number = 3000) => {
      mapSeverityToNotify(message, severity, duration);
    },
    [],
  );

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* 统一全局提示容器：员工风格 + 侧边栏偏移位置 */}
      <UnifiedToaster sidebarCollapsed={sidebarCollapsed} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 理论上不会发生，因为 App.tsx 最外层就包裹了 ToastProvider。
    // 回退策略：直接基于 notify 实现，保证即便不在 Provider 里也能工作（非 React 场景导入也可用）
    return {
      showToast: (message, severity, duration) =>
        mapSeverityToNotify(message, severity, duration),
    };
  }
  return ctx;
}

// ================== v1.7.187：统一重复提示文案常量 ==================
// 解决同一个错误/成功提示在 30+ 个文件里重复书写相同字符串的问题。
// 规则：新增提示优先从本处查找复用；文案相同但语义不同的不要合并。
export const ToastMessages = {
  NETWORK_ERROR: '网络错误',
  DELETE_FAILED: '删除失败',
  DELETE_SUCCESS: '删除成功',
  UPDATE_SUCCESS: '更新成功',
  CREATE_SUCCESS: '创建成功',
  SAVE_FAILED: '保存失败',
  COPY_FAILED: '复制失败',
  TAGS_ADD_FAILED: '添加标签失败',
  TAGS_REMOVE_FAILED: '移除标签失败',
  CACHE_CLEARED: '缓存已清除',
  STATUS_UPDATED: '状态已更新',
  RESET_TO_DEFAULT: '已重置为默认值',
  TARGET_CREATED: '目标已创建',
  TARGET_DESCRIPTION_REQUIRED: '请输入目标描述',
  KEY_DELETED: '密钥已删除',
  SKILL_ENABLED: '技能已启用',
  OPERATION_SUCCESS: '操作成功',
  ITEM_DELETED: '已删除',
  PDF_EXPORT_IN_PROGRESS: 'PDF 导出功能开发中',
} as const;

export type ToastMessageKey = keyof typeof ToastMessages;
