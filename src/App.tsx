import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, Suspense, Profiler } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, useTheme, IconButton, Typography, Paper, Stack, Button, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import BugReportIcon from '@mui/icons-material/BugReport';
import Sidebar, { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED } from './components/Layout/Sidebar';
import GlobalActionsBar from './components/Layout/GlobalActionsBar';
import WarehouseSelector, { ALL_WAREHOUSES } from './components/Dashboard/WarehouseSelector';
import { AppSettingsProvider, useAppearanceSettings } from './contexts/AppSettingsContext';
import type { AppearanceConfig, AccentColor } from './contexts/AppSettingsContext';
import { ModelsProvider } from './contexts/ModelsContext';
import { isPyWebView } from './services/tencentDocsApi';
import { getGrayScale, FONT_SIZES, BORDER_RADII, SPACING, SHADOWS } from './constants/theme';
import { ToastProvider, useToast } from './contexts/ToastContext';
import WindowDragBar from './components/Layout/WindowDragBar';
const CDFChatThread = React.lazy(() => import('./components/CDFChat/ChatThread.js').then(m => ({ default: m.ChatThread ?? m.default })));
import { ChatProvider, useChatSession } from './contexts/ChatContext';
import { WarehouseCapabilityProvider } from './capabilities/warehouse/WarehouseCapabilityContext';
import { ProcessStatusProvider, ProcessStatusPanel } from './contexts/ProcessStatusContext';
import ErrorBoundary from './components/Common/ErrorBoundary';
import LoadingFallback from './components/Common/LoadingFallback';
import { I18nProvider } from './components/staff/i18n/index.js';
import StaffDeckPortal from './components/staff/StaffDeckPortal';
import { automationEngine } from './services/automation';
import { isWKWebView, isMacOSApp } from './utils/env';
import { recordRender, markPhase, endPhase } from './services/performanceTelemetry';
import SettingsGroupsDialog from './components/Layout/SettingsGroupsDialog';
const SettingsPopover = React.lazy(() => import('./components/Layout/SettingsPopover'));

// ===================== 白屏兜底：全局可视错误横幅 + safeLazy =====================
// 捕获 ErrorBoundary 无法覆盖的错误：
//   1. 微任务 / setTimeout / 原生事件回调 里的同步抛错 (window.onerror)
//   2. async 函数 / import() / Promise 未处理 rejection (window.onunhandledrejection)
// 即使 React 整树崩掉，也至少在页面上看到明确错误名 + 详情，不再是纯白屏。

type GlobalErrorItem = {
  id: number;
  kind: 'error' | 'rejection';
  message: string;
  detail: string;
  time: number;
};

let _globalErrorBannerPush: null | ((e: GlobalErrorItem) => void) = null;
let _errorSeq = 0;

function pushGlobalError(kind: 'error' | 'rejection', message: string, detail?: unknown) {
  const detailText = (() => {
    if (detail == null) return '';
    if (detail instanceof Error) {
      const s = detail.stack || String(detail);
      return `${String(detail)}\n${s.includes(detail.message) ? '' : s}`;
    }
    try {
      if (typeof detail === 'object') return JSON.stringify(detail, null, 2);
      return String(detail);
    } catch {
      return String(detail);
    }
  })();
  const item: GlobalErrorItem = {
    id: ++_errorSeq,
    kind,
    message,
    detail: detailText,
    time: Date.now(),
  };
  ((window as unknown) as Record<string, unknown>).__globalErrors =
    ((window as unknown) as Record<string, unknown>).__globalErrors || [];
  ((window as unknown) as Record<string, GlobalErrorItem[]>).__globalErrors.push(item);
  try {
    // eslint-disable-next-line no-console
    console.error(`[${kind}]`, message, detail ?? '');
  } catch { /* 兜底：全局错误记录自身不抛 */ }
  _globalErrorBannerPush?.(item);
}

/** 全局可视错误横幅（固定在视口顶部，z-index 极高，覆盖任何内容） */
const GlobalErrorBanner: React.FC = () => {
  const [errors, setErrors] = useState<GlobalErrorItem[]>(() => {
    const prev = ((window as unknown) as Record<string, GlobalErrorItem[]>).__globalErrors || [];
    return [...prev];
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    _globalErrorBannerPush = (e) => {
      setErrors((list) => [...list, e]);
      setExpandedId((cur) => cur ?? e.id);
      setCollapsed(false);
    };

    const origError = window.onerror;
    window.onerror = function globalAppOnError(message, source, lineno, colno, error) {
      const msg = (typeof message === 'string' ? message : String(message)) || 'Unknown error';
      pushGlobalError(
        'error',
        `${msg}${source ? ` (${source}:${lineno ?? '?'}:${colno ?? '?'})` : ''}`,
        error ?? { source, lineno, colno },
      );
      if (typeof origError === 'function') {
        try { origError.apply(window, [message as any, source, lineno as any, colno as any, error as any]); } catch { /* 兜底 */ }
      }
      return true;
    };

    const origRejection = window.onunhandledrejection;
    window.onunhandledrejection = function globalAppOnUnhandledRejection(ev: PromiseRejectionEvent) {
      let msg = 'Unhandled Promise rejection';
      let detail: unknown = ev.reason;
      if (ev.reason instanceof Error) {
        msg = ev.reason.message || String(ev.reason);
      } else if (typeof ev.reason === 'string') {
        msg = ev.reason;
      } else if (ev.reason && typeof (ev.reason as any).message === 'string') {
        msg = String((ev.reason as any).message);
      }
      if (/dynamically imported module/i.test(msg) || /chunk/i.test(msg) || /Failed to fetch/i.test(msg)) {
        msg = '页面脚本加载失败（chunk 网络/缓存异常）：' + msg;
      }
      pushGlobalError('rejection', msg, detail);
      try { ev.preventDefault?.(); } catch { /* 兜底 */ }
      if (typeof origRejection === 'function') {
        try { origRejection.call(window, ev as any); } catch { /* 兜底 */ }
      }
    };

    return () => {
      if (_globalErrorBannerPush === pushGlobalError as unknown as typeof _globalErrorBannerPush) {
        _globalErrorBannerPush = null;
      }
      window.onerror = origError || null;
      window.onunhandledrejection = origRejection || null;
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <Box
      data-testid="global-error-banner"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      }}
    >
      <Stack spacing={0.5} sx={{ bgcolor: '#fff', p: 0.75 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 0.75, bgcolor: '#B91C1C', color: '#fff', borderRadius: '6px' }}>
          <BugReportIcon fontSize="small" sx={{ color: '#fff' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              检测到 {errors.length} 个未捕获错误（不再白屏）。点击「重试」「展开」或在控制台查看详情。
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="展开/收起错误详情">
              <Button
                size="small"
                variant="outlined"
                sx={{
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.45)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                  py: 0.25,
                }}
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? '展开' : '收起'}
              </Button>
            </Tooltip>
            <Tooltip title="刷新本窗口（恢复路由默认：/chat）">
              <Button
                size="small"
                variant="contained"
                startIcon={<RefreshIcon fontSize="small" />}
                sx={{
                  bgcolor: '#fff',
                  color: '#B91C1C',
                  '&:hover': { bgcolor: '#F9FAFB' },
                  py: 0.25,
                }}
                onClick={() => {
                  setErrors([]);
                  setExpandedId(null);
                  if (window.location.hash !== '#/chat') {
                    window.location.hash = '/chat';
                  }
                  setTimeout(() => window.location.reload(), 30);
                }}
              >
                重试
              </Button>
            </Tooltip>
            <Tooltip title="暂不显示">
              <IconButton
                size="small"
                sx={{ color: '#fff', p: 0.25 }}
                onClick={() => setErrors([])}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {!collapsed && errors.slice(-5).map((e, idx) => {
          const realIdx = errors.length - 5 + idx;
          const visible = errors.slice(-5);
          const item = visible[idx];
          const _ = realIdx; void _;
          const isExpanded = expandedId === item.id;
          const isError = item.kind === 'error';
          return (
            <Paper
              key={item.id}
              elevation={0}
              sx={{
                border: `1px solid ${isError ? '#FCA5A5' : '#FDBA74'}`,
                borderRadius: '6px',
                bgcolor: isError ? '#FEF2F2' : '#FFF7ED',
                overflow: 'hidden',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, alignItems: 'flex-start' }}>
                <Typography
                  variant="caption"
                  sx={{
                    flex: '0 0 auto',
                    mt: 0.1,
                    px: 1,
                    py: 0.25,
                    bgcolor: isError ? '#DC2626' : '#EA580C',
                    color: '#fff',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  {isError ? 'ERROR' : 'REJECTION'}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: isError ? '#991B1B' : '#9A3412',
                      cursor: 'pointer',
                      wordBreak: 'break-word',
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    {item.message}
                  </Typography>
                  {isExpanded && item.detail && (
                    <Paper
                      elevation={0}
                      sx={{
                        mt: 1,
                        p: 1.25,
                        bgcolor: '#111827',
                        borderRadius: '4px',
                        overflow: 'auto',
                        maxHeight: 260,
                      }}
                    >
                      <Typography
                        component="pre"
                        sx={{
                          m: 0,
                          color: '#FCA5A5',
                          fontSize: '0.72rem',
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.detail}
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
};

// ========== safeLazy：React.lazy import() 失败的可视兜底 ==========
// React.lazy 的 import() 抛 Promise rejection 时，有时不会传给 ErrorBoundary，直接整树白。
// safeLazy 把失败接住，在原组件位置渲染出错面板 + 错误名 + 重试按钮。

type LazyImportResult<T> = Promise<{ default: React.ComponentType<T> }>;

function safeLazy<T = any>(
  factory: () => LazyImportResult<T>,
  label = '页面',
): React.LazyExoticComponent<React.ComponentType<T>> {
  const FailFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => {
    const [showDetail, setShowDetail] = useState(false);
    return (
      <Box sx={{ p: 2, width: '100%' }}>
        <Paper elevation={0} sx={{ p: 3, border: '1px solid #FCA5A5', borderRadius: '12px', bgcolor: '#FEF2F2' }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <BugReportIcon sx={{ color: '#DC2626' }} />
              <Typography variant="h6" sx={{ color: '#991B1B', fontWeight: 600 }}>
                {label}加载失败
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              以下错误导致当前 {label} 无法渲染（已捕获，不再整页白屏）：
            </Typography>
            <Paper elevation={0} sx={{ p: 2, bgcolor: '#111827', borderRadius: '8px', overflow: 'auto' }}>
              <Typography
                component="pre"
                sx={{
                  m: 0,
                  color: '#FCA5A5',
                  fontSize: '0.78rem',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {error?.stack || String(error)}
              </Typography>
              {showDetail && (
                <Typography
                  component="pre"
                  sx={{
                    m: 0,
                    mt: 1,
                    pt: 1,
                    borderTop: '1px dashed #374151',
                    color: '#9CA3AF',
                    fontSize: '0.7rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {`message: ${error?.message ?? '—'}\nname: ${error?.name ?? '—'}\ntime: ${new Date().toLocaleString()}`}
                </Typography>
              )}
            </Paper>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                size="small"
                variant="contained"
                startIcon={<RefreshIcon fontSize="small" />}
                sx={{ bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } }}
                onClick={retry}
              >
                重试加载{label}
              </Button>
              <Button size="small" variant="outlined" onClick={() => setShowDetail((s) => !s)}>
                {showDetail ? '收起详情' : '更多详情'}
              </Button>
              <Button size="small" variant="outlined" onClick={() => window.history.back()}>
                返回上一页
              </Button>
              <Button size="small" variant="outlined" onClick={() => window.location.reload()}>
                刷新窗口
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  };

  const Wrapped: React.FC<T> = (props) => {
    const [attempt, setAttempt] = useState(0);
    const [fail, setFail] = useState<Error | null>(null);
    // 用 ref 缓存 LazyComp，保证跨渲染引用稳定 —— 否则每次重渲染 React.lazy() 都返回新类型，
    // React 视为组件类型变化 → 卸载重挂载 → Suspense fallback → 整页"一直刷新"
    const lazyCompRef = useRef<React.LazyExoticComponent<React.ComponentType<T>> | null>(null);

    // 首次渲染 + attempt 每次变化时重建 lazy（只有这两种情况才重新 import）
    if (lazyCompRef.current === null || attempt !== (lazyCompRef as any)._lastAttempt) {
      lazyCompRef.current = React.lazy(() =>
        factory()
          .then((m) => {
            setFail((cur) => (cur ? null : cur));
            return m;
          })
          .catch((err: unknown) => {
            const e = err instanceof Error ? err : new Error(String(err));
            setFail(e);
            return { default: (() => null) as React.ComponentType<T> };
          }),
      );
      (lazyCompRef as any)._lastAttempt = attempt;
    }

    const LazyComp = lazyCompRef.current;

    if (fail) {
      return (
        <FailFallback
          error={fail}
          retry={() => {
            setFail(null);
            setAttempt((n) => n + 1);
          }}
        />
      );
    }

    return (
      <Suspense fallback={null}>
        <LazyComp {...(props as any)} />
      </Suspense>
    );
  };
  Wrapped.displayName = `safeLazy(${label})`;

  return React.lazy(() => Promise.resolve({ default: Wrapped as React.ComponentType<T> }));
}

// v3.2: WKWebView 环境检测，用于禁用高成本效果
const IS_WKWEBVIEW = isWKWebView();

// 路由级懒加载 — 按需加载各页面组件，降低首屏加载体积
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const SkillsPage = safeLazy(() => import('./pages/SkillsPage'), '技能中心页');
const SkillDetailPage = safeLazy(() => import('./pages/SkillDetailPage'), '技能详情页');
const SkillAuditPage = safeLazy(() => import('./pages/SkillAuditPage'), '技能审计页');
const SkillDependencyGraphPage = safeLazy(() => import('./pages/SkillDependencyGraphPage'), '技能依赖图页');
const SkillUsageAnalyticsPage = safeLazy(() => import('./pages/SkillUsageAnalyticsPage'), '技能分析页');
const SkillHealthDashboardPage = safeLazy(() => import('./pages/SkillHealthDashboardPage'), '技能健康页');
const SkillDocQualityPage = safeLazy(() => import('./pages/SkillDocQualityPage'), '技能文档质量页');


const WarehousesPage = React.lazy(() => import('./pages/WarehousesPage'));
const PartnersPage = React.lazy(() => import('./pages/PartnersPage'));
const InTransitPage = React.lazy(() => import('./pages/InTransitPage'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const TencentDocsPage = React.lazy(() => import('./pages/TencentDocsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
// /settings 已改为侧边栏弹窗重定向，不再需要全页面 SettingsPage
const AutomationPage = React.lazy(() => import('./pages/AutomationPage'));
const WmsQualityPage = React.lazy(() => import('./pages/WmsQualityPage'));
const WmsInventoryPage = React.lazy(() => import('./pages/WmsInventoryPage'));
const WmsOutboundPage = React.lazy(() => import('./pages/WmsOutboundPage'));
const WmsInboundPage = React.lazy(() => import('./pages/WmsInboundPage'));
const WmsAlertPage = React.lazy(() => import('./pages/WmsAlertPage'));
const WmsReportPage = React.lazy(() => import('./pages/WmsReportPage'));
const WmsReplenishmentPage = React.lazy(() => import('./pages/WmsReplenishmentPage'));
const TransferPage = React.lazy(() => import('./pages/TransferPage'));
const PdfToolsPage = React.lazy(() => import('./pages/PdfToolsPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));
const _AISettingsDialog = React.lazy(() => import('./components/Layout/AISettingsDialog'));
const PluginsPage = React.lazy(() => import('./pages/PluginsPage'));
const ExtensionsPage = React.lazy(() => import('./pages/ExtensionsPage'));
const SystemMonitorPage = React.lazy(() => import('./pages/SystemMonitorPage'));
const AuditLogPage = React.lazy(() => import('./pages/AuditLogPage'));
const ApiKeysPage = React.lazy(() => import('./pages/ApiKeysPage'));
const ApiDomainWhitelistPage = React.lazy(() => import('./pages/ApiDomainWhitelistPage'));
const ApiTemplatesPage = React.lazy(() => import('./pages/ApiTemplatesPage'));
const BrowserPage = React.lazy(() => import('./pages/BrowserPage'));
const ApiCredentialsPage = React.lazy(() => import('./pages/ApiCredentialsPage'));
const ApiHistoryPage = React.lazy(() => import('./pages/ApiHistoryPage'));
const TuiTerminalPage = React.lazy(() => import('./pages/TuiTerminalPage'));
const SecretsPage = React.lazy(() => import('./pages/SecretsPage'));
const MemoryPage = React.lazy(() => import('./pages/MemoryPage'));
const WorkflowPage = React.lazy(() => import('./pages/WorkflowPage'));
const TemplateMarketPage = React.lazy(() => import('./pages/TemplateMarketPage'));
const ExecutionHistoryPage = React.lazy(() => import('./pages/ExecutionHistoryPage'));
const EventLedgerPage = React.lazy(() => import('./pages/EventLedgerPage'));
const FileExplorerPage = React.lazy(() => import('./pages/FileExplorerPage'));
const ContextEngineRegistryPage = React.lazy(() => import('./pages/ContextEngineRegistryPage'));
const McpServersPage = React.lazy(() => import('./pages/McpServersPage'));
const ObservabilityCenterPage = React.lazy(() => import('./pages/ObservabilityCenterPage'));
const ExtensionsCenterPage = React.lazy(() => import('./pages/ExtensionsCenterPage'));
const ModelManagementCenterPage = React.lazy(() => import('./pages/ModelManagementCenterPage'));
const SoulPage = React.lazy(() => import('./pages/SoulPage'));
const AgentsPage = React.lazy(() => import('./pages/AgentsPage'));
const GoalsPage = React.lazy(() => import('./pages/GoalsPage'));
const ImageGenerationPage = React.lazy(() => import('./pages/ImageGenerationPage'));
const MusicGenerationPage = React.lazy(() => import('./pages/MusicGenerationPage'));
const VideoGenerationPage = React.lazy(() => import('./pages/VideoGenerationPage'));
const ProcessStatusDemoPage = React.lazy(() => import('./pages/ProcessStatusDemoPage'));
const KeywordTriggerConfigPage = React.lazy(() => import('./pages/KeywordTriggerConfigPage'));
const GitManagerPage = React.lazy(() => import('./pages/GitManagerPage'));
const CodeIndexPage = React.lazy(() => import('./pages/CodeIndexPage'));
const TasksPage = React.lazy(() => import('./pages/TasksPage'));
const LspServersPage = React.lazy(() => import('./pages/LspServersPage'));
const WikiPage = React.lazy(() => import('./pages/WikiPage'));
const SkillWorkshopPage = React.lazy(() => import('./pages/SkillWorkshopPage'));
const MessageLifecyclePage = React.lazy(() => import('./pages/MessageLifecyclePage'));
const CacheManagerPage = React.lazy(() => import('./pages/CacheManagerPage'));
const ChannelsPage = React.lazy(() => import('./pages/ChannelsPage'));
const WebhookPage = React.lazy(() => import('./pages/WebhookPage'));
const MetricsPage = React.lazy(() => import('./pages/MetricsPage'));
const BrowserProfilesPage = React.lazy(() => import('./pages/BrowserProfilesPage'));
const PermissionsPage = React.lazy(() => import('./pages/PermissionsPage'));
const ModelsPage = React.lazy(() => import('./pages/ModelsPage'));
const SkillChainsPage = React.lazy(() => import('./pages/SkillChainsPage'));
const TriggersPage = React.lazy(() => import('./pages/TriggersPage'));
const InventoryTransactionsPage = React.lazy(() => import('./pages/InventoryTransactionsPage'));
const MatchingPage = React.lazy(() => import('./pages/MatchingPage'));
const SoulRulesPage = React.lazy(() => import('./pages/SoulRulesPage'));
const PairingPage = React.lazy(() => import('./pages/PairingPage'));
const TtsSettingsPage = React.lazy(() => import('./pages/TtsSettingsPage'));
const MediaLibraryPage = React.lazy(() => import('./pages/MediaLibraryPage'));
const MediaToolsPage = React.lazy(() => import('./pages/MediaToolsPage'));
// 监控中心：整合进程/节点/集成三个监控页面为统一 Tab 入口（2026-08-05）
const MonitoringHubPage = React.lazy(() => import('./pages/MonitoringHubPage'));

// ===================== StaffDeck 模块懒加载 =====================
// 2026-08-05：存量 MUI 版数字员工页面已全部清理，统一收敛到 iframe 版（/staffdeck）。
// 仅保留 3 个 iframe 版未覆盖的运维页（traces/debug/tutorial）。
// 2026-08-13：删除员工认证登录体系（不再有独立登录页/强制登录门），桌面端始终默认身份。
import StaffLayout, { withStaffAuth as wrapStaffAuth } from './components/staff/StaffLayout';
const StaffTracesPage = React.lazy(() => import('./pages/staff/TracesPage').then(m => ({ default: wrapStaffAuth(m.default) })));
const StaffDebugPage = React.lazy(() => import('./pages/staff/DebugPage').then(m => ({ default: wrapStaffAuth(m.default) })));
const StaffTutorialPage = React.lazy(() => import('./pages/staff/TutorialPage').then(m => ({ default: wrapStaffAuth(m.default) })));

/** 强调色映射 */
const ACCENT_MAP: Record<AccentColor, { main: string; light: string }> = {
  default: { main: '#111827', light: '#374151' },
  blue:    { main: '#2563EB', light: '#60A5FA' },
  green:   { main: '#059669', light: '#34D399' },
  purple:  { main: '#7C3AED', light: '#A78BFA' },
  red:     { main: '#DC2626', light: '#F87171' },
  orange:  { main: '#EA580C', light: '#FB923C' },
};

/** 根据外观配置动态创建 MUI Theme — 使用统一主题 Token */
function buildTheme(appearance: AppearanceConfig) {
  const isDark = appearance.themeMode === 'dark';
  const gs = getGrayScale(isDark);
  const accent = ACCENT_MAP[appearance.accentColor] || ACCENT_MAP.default;
  const fontSizes = FONT_SIZES[appearance.fontSize] || FONT_SIZES.medium;
  const borderRadii = BORDER_RADII[appearance.borderRadius] || BORDER_RADII.normal;
  const spacing = SPACING[appearance.compactMode ? 'compact' : 'normal'] || SPACING.normal;
  const shadows = SHADOWS[appearance.enableShadows ? (isDark ? 'dark' : 'light') : 'none'];

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: accent.main, light: accent.light, dark: accent.main },
      secondary: { main: gs.textMuted },
      background: {
        default: gs.bgPage,
        paper: gs.bgPanel,
      },
      text: {
        primary: gs.textPrimary,
        secondary: gs.textSecondary,
      },
      divider: gs.border,
    },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
      ].join(','),
      fontSize: parseFloat(fontSizes.base) * 16,
      h1: { fontSize: fontSizes['3xl'], fontWeight: 700 },
      h2: { fontSize: fontSizes['2xl'], fontWeight: 600 },
      h3: { fontSize: fontSizes.xl, fontWeight: 600 },
      h4: { fontSize: fontSizes.lg, fontWeight: 600 },
      h5: { fontSize: fontSizes.md, fontWeight: 600 },
      h6: { fontSize: fontSizes.base, fontWeight: 600 },
      body1: { fontSize: fontSizes.base },
      body2: { fontSize: fontSizes.sm },
      caption: { fontSize: fontSizes.xs },
      button: { fontSize: fontSizes.sm, fontWeight: 500 },
    },
    spacing: (factor: number) => `${spacing.base * factor}px`,
    shape: {
      borderRadius: borderRadii.base,
    },
    shadows: [
      'none',
      shadows.sm,
      shadows.base,
      shadows.md,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
      shadows.lg,
    ],
    // 全局弹窗层级（严格递增）：
    //   L0 页面底座 (0-999) / L1 侧边栏/抽屉 (1000-1499) / L2 Popover/浮层 (1500-1999)
    //   L3 设置对话框外壳 (2000) / L4 内嵌二级 Dialog (2400)  / L5 审批/强阻断 (2800)
    //   L6 拖拽顶栏/全局指令 (9990+)
    zIndex: {
      mobileStepper: 900,
      fab: 950,
      speedDial: 950,
      appBar: 1000,
      drawer: 1100,
      modal: 1300,
      snackbar: 1400,
      tooltip: 1450,
    },
    transitions: {
      duration: {
        shortest: appearance.enableAnimations ? 150 : 0,
        shorter: appearance.enableAnimations ? 200 : 0,
        short: appearance.enableAnimations ? 250 : 0,
        standard: appearance.enableAnimations ? 300 : 0,
        complex: appearance.enableAnimations ? 375 : 0,
        enteringScreen: appearance.enableAnimations ? 225 : 0,
        leavingScreen: appearance.enableAnimations ? 195 : 0,
      },
    },
    components: {
      // v3.2: WKWebView 中禁用 Ripple 效果，避免点击卡顿
      MuiButtonBase: {
        defaultProps: {
          disableRipple: IS_WKWEBVIEW,
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: borderRadii.md,
            border: `1px solid ${gs.border}`,
            backgroundColor: gs.bgPanel,
            boxShadow: shadows.base,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: borderRadii.base,
            fontWeight: 500,
            transition: appearance.enableAnimations ? undefined : 'none',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: borderRadii.full },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontSize: fontSizes.sm,
            fontWeight: 600,
            color: gs.textMuted,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&:last-child td': { borderBottom: 0 } },
        },
      },
      MuiModal: {
        styleOverrides: {
          // SettingsDialogShell 等可再以 sx 覆盖；此处为所有 Modal(Dialog) 基准，避免被 Popover/Sidebar 压
          root: { zIndex: 2000 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: borderRadii.xl,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          // SettingsPopover 等显式通过 sx/container zIndex 覆盖到 1700；此处设基准，确保 Popover 在侧边栏之上
          root: { zIndex: 1550 },
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: borderRadii.md,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: gs.bgInput,
              borderRadius: borderRadii.base,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& fieldset': {
              borderColor: gs.borderDarker,
            },
            '&:hover fieldset': {
              borderColor: isDark ? '#555555' : '#9CA3AF',
            },
            '&.Mui-focused fieldset': {
              borderColor: accent.main,
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: borderRadii.md,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            '& .MuiSwitch-track': {
              backgroundColor: gs.borderDarker,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: gs.bgPanel,
            borderBottom: `1px solid ${gs.border}`,
            boxShadow: shadows.base,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgSidebar,
            borderRight: `1px solid ${gs.border}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
            '&.Mui-selected': {
              backgroundColor: gs.bgActive,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: gs.bgPage,
            color: gs.textPrimary,
            colorScheme: isDark ? 'dark' : 'light',
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: gs.bgInput,
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            backgroundColor: gs.bgInput,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#2D2D2D' : '#374151',
            color: isDark ? '#F3F4F6' : '#FFFFFF',
            borderRadius: borderRadii.sm,
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: gs.border,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: gs.textMuted,
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            color: gs.textPrimary,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: borderRadii.full,
          },
        },
      },
      MuiBadge: {
        styleOverrides: {
          badge: {
            borderRadius: borderRadii.full,
          },
        },
      },
      
    },
  });
}

/** 自动隐藏滚动条 Hook：默认隐藏，滚动时显示，停止滚动 3 秒后隐藏；enabled=false 时完全禁用 */
function useAutoHideScrollbar(enabled: boolean = true) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return; // pywebview 环境下禁用
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      el.classList.add('scrollbar-visible');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        el.classList.remove('scrollbar-visible');
      }, 3000);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);

  return scrollRef;
}

/**
 * 全局刷新事件总线 — 顶部工具栏的「刷新表格」按钮派发事件，
 * 各页面组件订阅后自行刷新数据。
 */
type RefreshListener = () => void;
const refreshListeners = new Map<string, Set<RefreshListener>>();

export function subscribeRefresh(pageKey: string, listener: RefreshListener): () => void {
  if (!refreshListeners.has(pageKey)) refreshListeners.set(pageKey, new Set());
  refreshListeners.get(pageKey)!.add(listener);
  return () => { refreshListeners.get(pageKey)?.delete(listener); };
}

export function emitRefresh(pageKey: string) {
  refreshListeners.get(pageKey)?.forEach((fn) => fn());
}

/**
 * 全局新建仓库事件 — 顶部工具栏的「新建仓库」按钮派发事件，
 * WarehouseList 组件订阅后打开新建对话框。
 */
type NewWarehouseListener = () => void;
let newWarehouseListener: NewWarehouseListener | null = null;

export function subscribeNewWarehouse(listener: NewWarehouseListener): () => void {
  newWarehouseListener = listener;
  return () => { newWarehouseListener = null; };
}

export function emitNewWarehouse() {
  newWarehouseListener?.();
}

/**
 * 全局仓库切换事件总线 — 顶部工具栏的仓库切换按钮派发事件，
 * DashboardPage 订阅后更新 selectedWarehouse。
 */
type WarehouseChangeListener = (warehouseId: string) => void;
const warehouseChangeListeners = new Set<WarehouseChangeListener>();

export function subscribeWarehouseChange(listener: WarehouseChangeListener): () => void {
  warehouseChangeListeners.add(listener);
  return () => { warehouseChangeListeners.delete(listener); };
}

export function emitWarehouseChange(warehouseId: string) {
  warehouseChangeListeners.forEach((fn) => fn(warehouseId));
}

/** 根据当前路由决定顶部工具栏右侧显示哪些功能按钮 */
function getToolbarActions(pathname: string) {
  // 仓库管理页：刷新 + 新建仓库
  if (pathname.startsWith('/warehouses')) {
    return { refresh: true, newWarehouse: true, warehouseSwitch: false };
  }
  // 客商管理页：仅刷新
  if (pathname === '/partners') {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 仪表盘：仅刷新（仓库切换由 DashboardPage 内部管理）
  if (pathname === '/dashboard') {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 在途、库存、报表、WMS页面：仅刷新
  if (pathname.startsWith('/in-transit') || pathname.startsWith('/inventory') || pathname.startsWith('/reports') || pathname.startsWith('/wms/') || pathname.startsWith('/transfer')) {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 其他页面（腾讯文档、设置）：无操作按钮
  return { refresh: false, newWarehouse: false, warehouseSwitch: false };
}

/** 获取当前页面刷新事件的 key */
function getPageRefreshKey(pathname: string): string {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/warehouses')) return 'warehouses';
  if (pathname === '/partners') return 'partners';
  if (pathname.startsWith('/in-transit')) return 'in-transit';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/wms/quality')) return 'wms-quality';
  if (pathname.startsWith('/wms/inventory')) return 'wms-inventory';
  if (pathname.startsWith('/wms/outbound')) return 'wms-outbound';
  if (pathname.startsWith('/wms/alerts')) return 'wms-alerts';
  if (pathname.startsWith('/wms/reports')) return 'wms-reports';
  if (pathname.startsWith('/wms/replenishment')) return 'wms-replenishment';
  if (pathname.startsWith('/transfer')) return 'transfer';
  return '';
}

/* ===================== 存量 MUI 版数字员工 UI 已清理 =====================
 * 2026-08-05：src/pages/staff/* 下 39 个 MUI 版数字员工页面文件已物理删除（整目录重定向到 /staffdeck），
 * 统一收敛到 iframe 版（/staffdeck）。仅保留 4 个 iframe 版未覆盖的页面
 * （DebugPage / TracesPage / TutorialPage / StaffDeckEmbedPage）。iframe 是数字员工的唯一复刻实现。
 * 2026-08-13：删除独立「员工认证登录」体系，桌面端默认 default-user，不再保留登录页。
 */

/** 主布局（需要在 Router 内部以使用 useLocation / useNavigate） */
/**
 * 路由级会话同步组件 — 从非聊天页切回 /chat 时自动创建新会话
 *
 * 覆盖所有导航路径（不仅限于 NavList 的 navigate-chat 事件）：
 * - 浏览器后退/前进按钮
 * - /settings → /chat 重定向
 * - URL 直接输入
 * - 其他任何编程式导航
 *
 * 例外：URL 含 session 参数时（用户点击了历史对话），不创建新会话
 */
const ChatRouteSync: React.FC = () => {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const { session, handleNewChat } = useChatSession();

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;

    // 仅当从非 /chat 页切到 /chat 时触发
    if (location.pathname === '/chat' && prevPath !== '/chat') {
      const searchParams = new URLSearchParams(location.search);
      // URL 含 session（历史对话点击）或 skill（技能对话）参数时不创建新会话
      if (searchParams.has('session') || searchParams.has('skill')) return;
      // 当前会话已经是空会话（NavList 的 navigate-chat 事件已触发），跳过
      if (session.messages.length === 0) return;
      // 创建新会话
      handleNewChat();
    }
  }, [location.pathname, location.search, session, handleNewChat]);

  return null;
};
/** P0-1: localStorage 配额告警全局监听 — 必须在 ToastProvider 内部使用 */
const StorageWarningListener: React.FC = () => {
  const { showToast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const keyLabel = detail?.key ? detail.key.replace('cdf-know-clow-', '') : '未知';
      showToast(`本地存储空间不足（${keyLabel}），部分数据可能无法保存。建议清理旧数据。`, 'warning', 8000);
    };
    window.addEventListener('cdf-know-clow-storage-warning', handler);
    return () => window.removeEventListener('cdf-know-clow-storage-warning', handler);
  }, [showToast]);
  return null;
};

/** 对话内技能创建/生效反馈 — 监听 SKILL_CREATED 事件弹出状态 toast */
const SkillCreationListener: React.FC = () => {
  const { showToast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const skillName = detail?.skillName ?? '技能';
      const action = detail?.action ?? 'create_proposal';
      if (action === 'create_and_apply') {
        showToast(`技能已创建并生效：${skillName}`, 'success', 6000);
      } else {
        showToast(`技能提案已创建：${skillName}，等待审批`, 'info', 6000);
      }
    };
    window.addEventListener('cdf-know-clow-skill-created', handler);
    return () => window.removeEventListener('cdf-know-clow-skill-created', handler);
  }, [showToast]);
  return null;
};

const SettingsRedirect: React.FC<{ onOpenSettings: () => void; onExpandSidebar?: () => void }> = ({ onOpenSettings, onExpandSidebar }) => {
  const navigate = useNavigate();
  React.useEffect(() => {
    // 先展开侧边栏（确保设置按钮可见，anchorEl 能正确定位）
    onExpandSidebar?.();
    // 等待一帧让侧边栏渲染完成、ref 挂载后再打开弹窗
    const raf = requestAnimationFrame(() => {
      onOpenSettings();
      navigate('/chat', { replace: true });
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
};

/** React Profiler 包装器：记录渲染耗时，仅采集超过一帧（16ms）的渲染 */
const PerformanceProfiler: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const onRender: React.ProfilerOnRenderCallback = (
    profilerId,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    // 只记录明显的慢渲染，避免海量数据
    if (actualDuration < 16 && phase === 'update') return;
    recordRender({
      component: profilerId,
      phase: phase === 'mount' ? 'mount' : 'update',
      actualDurationMs: Math.round(actualDuration * 100) / 100,
      baseDurationMs: Math.round(baseDuration * 100) / 100,
      startTime: Math.round(startTime * 100) / 100,
      commitTime: Math.round(commitTime * 100) / 100,
    });
  };
  return <Profiler id={id} onRender={onRender}>{children}</Profiler>;
};

const MainLayout: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const location = useLocation();
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });
  // v1.7.86: 从 localStorage 恢复侧边栏折叠状态，避免每次启动都展开（修复首次启动双侧栏假象）
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cdf-know-clow-sidebar-collapsed');
      if (saved !== null) return saved === 'true';
    } catch { /* ignore */ }
    return isMobile;
  });
  // pywebview / macOS App 检测 — frameless 模式下红黄绿按钮悬浮在左上角（透明无背景条）
  // 只需少量顶部边距（8px），不再需要全宽标题栏避让
  // v3.3: 使用 isMacOSApp() 构建时检测作为初始值，避免运行时注入延迟导致布局闪烁
  const [isPy, setIsPy] = useState(() => isMacOSApp() || isPyWebView());

  // v1.7.86: 使用 useLayoutEffect 在首次绘制前注入 CSS 变量，避免布局闪烁导致"双侧栏"视觉假象
  useLayoutEffect(() => {
    if (isPy) {
      // BUTTON_TOP(10) + BUTTON_SIZE(12) + 间距(6) = 28px
      document.documentElement.style.setProperty('--pw-top', '28px');
    }
  }, [isPy]);

  useEffect(() => {
    if (!isPy) {
      const id = setInterval(() => {
        if (isPyWebView()) {
          setIsPy(true);
          document.documentElement.style.setProperty('--pw-top', '28px');
          clearInterval(id);
        }
      }, 500);
      setTimeout(() => clearInterval(id), 3000);
      return () => clearInterval(id);
    }
  }, [isPy]);

  // v1.7.86: 从 localStorage 恢复侧边栏折叠状态，避免每次启动都展开造成视觉跳跃
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('cdf-know-clow-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      // 派发状态事件，让子组件感知侧边栏折叠状态
      window.dispatchEvent(new CustomEvent('cdf-sidebar-state', { detail: { collapsed: next } }));
      return next;
    });
  }, []);

  // 初始化时也派发一次当前状态
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cdf-sidebar-state', { detail: { collapsed: sidebarCollapsed } }));
  }, [sidebarCollapsed]);

  // 响应式：移动端默认收起侧边栏，桌面端默认展开
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setSidebarCollapsed(e.matches);
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    } else {
      mql.addListener(handleChange);
      return () => mql.removeListener(handleChange);
    }
  }, []);

  // 监听自定义事件，允许子组件触发侧边栏切换
  useEffect(() => {
    const handleToggleSidebar = () => toggleSidebar();
    window.addEventListener('cdf-toggle-sidebar', handleToggleSidebar);
    return () => window.removeEventListener('cdf-toggle-sidebar', handleToggleSidebar);
  }, [toggleSidebar]);

  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLDivElement | null>(null);

  // 设置分组弹窗（点击设置 Popover 内的分组 → 弹出两栏弹窗）
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);
  const [groupsDialogKey, setGroupsDialogKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ groupKey?: string }>).detail;
      setGroupsDialogKey(detail?.groupKey);
      setGroupsDialogOpen(true);
    };
    window.addEventListener('cdf-open-settings-groups-dialog', handler as EventListener);
    return () => window.removeEventListener('cdf-open-settings-groups-dialog', handler as EventListener);
  }, []);

  // 自动隐藏滚动条：在 pywebview 环境下禁用（改用始终可见的宽滚动条）
  const scrollRef = useAutoHideScrollbar(!isPy);

  const actions = useMemo(() => getToolbarActions(location.pathname), [location.pathname]);
   
  const pageKey = useMemo(() => getPageRefreshKey(location.pathname), [location.pathname]);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(ALL_WAREHOUSES);
  const handleWarehouseChange = useCallback((warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    emitWarehouseChange(warehouseId);
  }, []);

  // 系统红黄绿按钮区域高度由 CSS 变量 --pw-top 控制（frameless 模式下 JS 注入 8px）
  // v1.5.182: 红黄绿改为透明悬浮，不再需要全宽标题栏避让

  return (
    <ToastProvider sidebarCollapsed={sidebarCollapsed}>
      <StorageWarningListener />
      <SkillCreationListener />
      {/* v1.5.107: 路由级会话同步 — 从非聊天页切回 /chat 时自动创建新会话 */}
      <ChatRouteSync />
      {/* v1.5.182: 窗口控制按钮 — 透明悬浮于左上角，与 Logo 同行（WorkBuddy 风格） */}
      <WindowDragBar />
      {/* 全局操作按钮栏 — 侧边栏展开/收起、搜索等全局按钮 */}
      <GlobalActionsBar 
        collapsed={sidebarCollapsed} 
        onToggle={toggleSidebar}
        expandedWidth={SIDEBAR_WIDTH_EXPANDED}
        collapsedWidth={SIDEBAR_WIDTH_COLLAPSED}
      />
      <ProcessStatusProvider>
      <Box sx={{ display: 'flex', height: '100vh', backgroundColor: gs.bgSidebar, overflow: 'hidden' }}>
        {/* Sidebar — 单栏布局 */}
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} settingsOpen={settingsPopoverOpen} onSettingsOpenChange={setSettingsPopoverOpen} settingsButtonRef={settingsButtonRef} />
        {/* 统一设置弹窗 */}
        <Suspense fallback={null}>
          <SettingsPopover
            open={settingsPopoverOpen}
            onClose={() => setSettingsPopoverOpen(false)}
            anchorEl={settingsButtonRef.current}
            onOpenModelManagement={() => window.dispatchEvent(new CustomEvent('cdf-open-ai-settings-dialog', { detail: { mainTab: 'basic', subTab: 'model' } }))}
            onOpenToolManagement={() => window.dispatchEvent(new CustomEvent('cdf-open-tool-management-dialog'))}
            onOpenAITab={(main, sub) => window.dispatchEvent(new CustomEvent('cdf-open-ai-settings-dialog', { detail: { mainTab: main, subTab: sub } }))}
            onOpenGroups={(key) => window.dispatchEvent(new CustomEvent('cdf-open-settings-groups-dialog', { detail: { groupKey: key } }))}
          />
        </Suspense>

        {/* 设置分组弹窗：点击设置 Popover 内的分组（通讯→仓储）弹出 */}
        <SettingsGroupsDialog
          open={groupsDialogOpen}
          initialGroupKey={groupsDialogKey}
          onClose={() => setGroupsDialogOpen(false)}
        />

      {/* Main content area */}
      {/* v1.7.15: 收起侧边栏后左边距也要保持，让灰色背景可见 */}
      {/* 高度固定为视窗高度（与 StaffLayout 保持一致），让圆角永远可见 */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.paper',
          height: 'calc(100vh - 18px)',
          margin: '9px 9px 9px 9px', // 内容区缩小3px，让灰色背景更多
          // v1.7.15: 描边颜色改为 #eeeeee
          border: '1px solid #eeeeee',
          paddingTop: 0,
          position: 'relative',
          borderRadius: '12px',
          overflow: 'hidden',
          transition: 'margin 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          // v2.3.0: 内容区排除拖拽，允许文本选择/复制
          WebkitAppRegion: 'no-drag',
        }}
      >
        {/* 进程状态面板 — 右上角悬浮 */}
        <ProcessStatusPanel isDark={isDark} gs={gs} />
        
        {/* 顶部操作按钮区 — 绝对定位在右上角，不占用垂直空间 */}
        {actions.warehouseSwitch && (
          <Box
            sx={{
              position: 'absolute',
              top: `calc(var(--pw-top, 0px) + 8px)`,
              right: 16,
              zIndex: 10,
            }}
          >
            <WarehouseSelector selected={selectedWarehouse} onChange={handleWarehouseChange} />
          </Box>
        )}

        {/* 主内容区：高度由内容决定，不强制撑满视窗 */}
        <Box
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 可滚动的内容区域 — 严格固定为父容器高度，确保 main 容器圆角永远可见 */}
          <Box
            ref={scrollRef}
            sx={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              // 滚动条默认隐藏，滚动时显示（通过 scrollbar-visible class）
              '&::-webkit-scrollbar': { width: '6px', height: '6px' },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': {
                background: 'transparent',
                borderRadius: '3px',
              },
              '&.scrollbar-visible::-webkit-scrollbar-thumb': {
                background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
              },
              '&.scrollbar-visible::-webkit-scrollbar-thumb:hover': {
                background: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
              },
            }}
          >
            <Box
              sx={{
                px: 3, // 与 logo 对齐，增加左右 padding
                // 侧边栏收起时，非聊天页顶部避让 GlobalActionsBar 按钮组（toggle + 新建对话）
                // 按钮位于 top:21px、高度约 26px，内容区需约 40px 额外顶部间距
                pt: sidebarCollapsed && location.pathname !== '/chat' ? '40px' : 0.375,
                pb: 3,
                '& .full-width-page': {
                  mx: -3, // 抵消 px: 3，让全宽组件保持全宽
                  mt: -0.5, // 抵消 pt: 0.5
                  mb: 3,
                },
              }}
            >
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/skills" element={<SkillsPage />} />
                    <Route path="/skills/:skillId" element={<SkillDetailPage />} />
                    <Route path="/skills/:skillId/audit" element={<SkillAuditPage />} />
                    <Route path="/skills/dependency-graph" element={<SkillDependencyGraphPage />} />
                    <Route path="/skills/usage-analytics" element={<SkillUsageAnalyticsPage />} />
                    <Route path="/skills/health" element={<SkillHealthDashboardPage />} />
                    <Route path="/skills/doc-quality" element={<SkillDocQualityPage />} />
                    <Route path="/skills/workshop" element={<SkillsPage initialTab="workshop" />} />
                    <Route path="/secrets" element={<SecretsPage />} />
                    <Route path="/memory" element={<MemoryPage />} />

                    <Route path="/chat" element={<CDFChatThread variant="page" />} />
                    <Route path="/warehouses" element={<WarehousesPage />} />
                    <Route path="/warehouses/:warehouseId" element={<WarehousesPage />} />
                    <Route path="/partners" element={<PartnersPage />} />
                    <Route path="/in-transit" element={<InTransitPage />} />
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/tencent-docs" element={<TencentDocsPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/wms/quality" element={<WmsQualityPage />} />
                    <Route path="/wms/inventory" element={<WmsInventoryPage />} />
                    <Route path="/wms/outbound" element={<WmsOutboundPage />} />
                    <Route path="/wms/inbound" element={<WmsInboundPage />} />
                    <Route path="/wms/alerts" element={<WmsAlertPage />} />
                    <Route path="/wms/reports" element={<WmsReportPage />} />
                    <Route path="/wms/replenishment" element={<WmsReplenishmentPage />} />
                    <Route path="/transfer" element={<TransferPage />} />
                    <Route path="/pdf-tools" element={<PdfToolsPage />} />
                    <Route path="/settings" element={<SettingsRedirect onOpenSettings={() => setSettingsPopoverOpen(true)} onExpandSidebar={() => setSidebarCollapsed(false)} />} />
                    <Route path="/automation" element={<AutomationPage />} />
                    <Route path="/plugins" element={<PluginsPage />} />
                    <Route path="/extensions" element={<ExtensionsPage />} />
                    <Route path="/system-monitor" element={<SystemMonitorPage />} />
                    <Route path="/audit-log" element={<AuditLogPage />} />
                    <Route path="/api-keys" element={<ApiKeysPage />} />
                    <Route path="/api-domain-whitelist" element={<ApiDomainWhitelistPage />} />
                    <Route path="/api-templates" element={<ApiTemplatesPage />} />
                    <Route path="/browser" element={<BrowserPage />} />
                    <Route path="/api-credentials" element={<ApiCredentialsPage />} />
                    <Route path="/api-history" element={<ApiHistoryPage />} />
                    <Route path="/tui" element={<TuiTerminalPage />} />
                    <Route path="/workflow" element={<WorkflowPage />} />
                    <Route path="/templates" element={<TemplateMarketPage />} />
                    <Route path="/execution-history" element={<ExecutionHistoryPage />} />
                    <Route path="/event-ledger" element={<EventLedgerPage />} />
                    <Route path="/observability-center" element={<ObservabilityCenterPage />} />
                    <Route path="/extensions-center" element={<ExtensionsCenterPage />} />
                    <Route path="/model-management" element={<ModelManagementCenterPage />} />
                    <Route path="/files" element={<FileExplorerPage />} />
                    <Route path="/context-engine" element={<ContextEngineRegistryPage />} />
                    <Route path="/mcp" element={<McpServersPage />} />
                    <Route path="/soul" element={<SoulPage />} />
                    <Route path="/agents" element={<AgentsPage />} />
                    <Route path="/goals" element={<GoalsPage />} />
                    <Route path="/image-generation" element={<ImageGenerationPage />} />
                    <Route path="/music-generation" element={<MusicGenerationPage />} />
                    <Route path="/video-generation" element={<VideoGenerationPage />} />
                    <Route path="/demo/process-status" element={<ProcessStatusDemoPage />} />
                    <Route path="/keyword-trigger" element={<KeywordTriggerConfigPage />} />
                    <Route path="/git" element={<GitManagerPage />} />
                    <Route path="/code-index" element={<CodeIndexPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/lsp" element={<LspServersPage />} />
                    <Route path="/wiki" element={<WikiPage />} />
                    <Route path="/skill-workshop" element={<SkillWorkshopPage />} />
                    <Route path="/message-lifecycle" element={<MessageLifecyclePage />} />
                    <Route path="/cache-manager" element={<CacheManagerPage />} />
                    <Route path="/channels" element={<ChannelsPage />} />
                    <Route path="/webhook" element={<WebhookPage />} />
                    <Route path="/metrics" element={<MetricsPage />} />
                    <Route path="/browser-profiles" element={<BrowserProfilesPage />} />
                    <Route path="/permissions" element={<PermissionsPage />} />
                    <Route path="/models" element={<ModelsPage />} />
                    <Route path="/skill-chains" element={<SkillChainsPage />} />
                    <Route path="/triggers" element={<TriggersPage />} />
                    <Route path="/inventory-transactions" element={<InventoryTransactionsPage />} />
                    <Route path="/matching" element={<MatchingPage />} />
                    <Route path="/soul-rules" element={<SoulRulesPage />} />
                    <Route path="/pairing" element={<PairingPage />} />
                    <Route path="/tts" element={<TtsSettingsPage />} />
                    <Route path="/media-library" element={<MediaLibraryPage />} />
                    <Route path="/media-tools" element={<MediaToolsPage />} />

                    {/* ===================== 监控中心（2026-08-05 整合）=====================
                        进程管理 / 节点主机 / 集成监控 三页统一收敛到 /monitoring，
                        原 /process /node-host /integration 保留为深链重定向。 */}
                    <Route path="/monitoring" element={<MonitoringHubPage />} />
                    <Route path="/monitoring/:tab" element={<MonitoringHubPage />} />
                    <Route path="/process" element={<Navigate to="/monitoring#process" replace />} />
                    <Route path="/node-host" element={<Navigate to="/monitoring#node-host" replace />} />
                    <Route path="/integration" element={<Navigate to="/monitoring#integration" replace />} />

                    {/* ===================== StaffDeck 模块路由 =====================
                       2026-08-05：存量 MUI 版数字员工页面已清理，统一收敛到 iframe 版（/staffdeck）。
                       仅保留 3 个 iframe 版未覆盖的运维页（traces/debug/tutorial）与登录页。 */}
                    <Route path="/staff" element={<Navigate to="/staffdeck" replace />} />
                    <Route path="/enterprise" element={<Navigate to="/staffdeck" replace />} />
                    <Route path="/enterprise/*" element={<Navigate to="/staffdeck" replace />} />
                    <Route path="/staff/*" element={<Navigate to="/staffdeck" replace />} />
                    <Route path="/workspace" element={<Navigate to="/staffdeck" replace />} />
                    <Route path="/workspace/*" element={<Navigate to="/staffdeck" replace />} />
                    {/* ↓ 以下 3 条 iframe 版尚未覆盖（运维/调试用），始终可达 */}
                    <Route path="/enterprise/traces" element={<StaffLayout><StaffTracesPage /></StaffLayout>} />
                    <Route path="/enterprise/debug" element={<StaffLayout><StaffDebugPage /></StaffLayout>} />
                    <Route path="/enterprise/tutorial" element={<StaffLayout><StaffTutorialPage /></StaffLayout>} />

                    {/* ===================== 员工 100% 复刻入口 =====================
                        实际 iframe 由 App 层的 StaffDeckPortal 常驻挂载并控制显隐，
                        此处仅占位避免匹配到 NotFound，杜绝双 iframe 重复加载。
                        /warehouse-staff 复用同一 iframe 容器，但通过 hash 进入工作区聊天。 */}
                    <Route path="/staffdeck" element={null} />
                    <Route path="/warehouse-staff" element={null} />

                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </Box>
          </Box>
        </Box>

      </Box>
    </Box>
    </ProcessStatusProvider>
  </ToastProvider>
);
};

/** 动态主题桥接组件：读取 settings → 构建 theme → 注入 ThemeProvider */
const ThemedApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useAppearanceSettings();

  const theme = useMemo(
    () => buildTheme(settings),
    [settings],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  // App 函数组件开始执行即视为 UI 渲染起点
  markPhase('app:render');

  useEffect(() => {
    automationEngine.start();
    // App 首次渲染完成
    endPhase('app:render');
    return () => automationEngine.stop();
  }, []);

  return (
    <>
      {/* 全局错误兜底横幅：不受 ErrorBoundary / 子树崩溃影响，永远能渲染，避免纯白屏 */}
      <GlobalErrorBanner />
      <ErrorBoundary>
        <I18nProvider>
          <AppSettingsProvider>
            <ModelsProvider>
              <WarehouseCapabilityProvider>
                <ChatProvider defaultModel="auto">
                  <ThemedApp>
                    <HashRouter>
                        <PerformanceProfiler id="MainLayout">
                          <MainLayout />
                          {/* 数字员工 iframe 常驻预热：路由匹配 /staffdeck 时仅显隐，零二次加载 */}
                          <StaffDeckPortal />
                        </PerformanceProfiler>
                    </HashRouter>
                  </ThemedApp>
                </ChatProvider>
              </WarehouseCapabilityProvider>
            </ModelsProvider>
          </AppSettingsProvider>
        </I18nProvider>
      </ErrorBoundary>
    </>
  );
};

export default App;
