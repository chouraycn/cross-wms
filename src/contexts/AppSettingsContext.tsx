/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

import type { DataSourceConfig } from '../services/dashboardApi';
import * as api from '../services/api';
import {
  changeLanguage,
  getCurrentLanguage,
  loadLanguage,
  i18nEvents,
  type SupportedLanguage,
} from '../i18n';

// ===================== Settings Type Definitions =====================

/** 腾讯文档链接条目 — 桌面版精简 */
export interface DocLinkItem {
  /** 唯一标识 */
  id: string;
  /** 文档链接 URL */
  url: string;
  /** 文档标题（自动解析或手动填写） */
  title: string;
  /** 数据类型 */
  dataType: 'warehouses' | 'inventory' | 'transit' | 'other';
  /** 关联仓库 ID（可选，为空则表示全局文档） */
  warehouseId?: string;
}

export interface OnlineDataEntry {
  /** 唯一标识 */
  id: string;
  /** 数据名称 */
  name: string;
  /** 数据类型 */
  dataType: 'warehouses' | 'inventory' | 'transit' | 'other';
  /** 在线输入的数据内容（JSON 字符串） */
  data: string;
  /** 最后更新时间 */
  updatedAt: string;
}

export interface TencentDocsConfig {
  /** 已添加的文档链接列表 */
  docLinks: DocLinkItem[];
  /** 在线数据录入 */
  onlineData: OnlineDataEntry[];
}

// ===================== 企业微信文档配置 =====================

/** 企业文档链接条目 */
export interface WeComDocLinkItem {
  /** 唯一标识 */
  id: string;
  /** 文档链接 URL (doc.weixin.qq.com/doc|smartsheet|smartpage/xxx) */
  url: string;
  /** 文档标题 */
  title: string;
  /** 数据类型 */
  dataType: 'warehouses' | 'inventory' | 'transit' | 'other';
  /** 关联仓库 ID（可选，为空则表示全局文档） */
  warehouseId?: string;
}

export interface WeComDocsConfig {
  /** 已添加的企业文档链接列表 */
  docLinks: WeComDocLinkItem[];
}

// ===================== 仪表盘配置 =====================

/** 仪表盘指标可见性配置 */
export interface DashboardVisibility {
  /** KPI: 在途货物总量 */
  kpiTransitVolume: boolean;
  /** KPI: 仓库总容积利用率 */
  kpiVolumeUtilization: boolean;
  /** KPI: 待处理入库单 */
  kpiPendingInbound: boolean;
  /** KPI: 当日出库量 */
  kpiOutboundCount: boolean;
  /** KPI: 库存深度 */
  kpiInventoryDepth: boolean;
  /** KPI: 在途报警（预计到仓后容积率） */
  kpiTransitAlert: boolean;
  /** 图表: 容积率趋势 */
  chartVolumeTrend: boolean;
  /** 图表: 在途货物状态分布 */
  chartTransitPie: boolean;
  /** 图表: 各仓库容积使用情况 */
  chartWarehouseBar: boolean;
  /** 热力图: 仓库出货热力图 */
  chartShipmentHeatmap: boolean;
  /** 图表: 库存预警列表 */
  chartInventoryAlert: boolean;
  /** 图表: 各仓库KPI对比表 */
  chartKpiComparison: boolean;
  /** 图表: 运单时效分析 */
  chartTransitTime: boolean;
}

/** 热力图配置 */
export interface HeatmapConfig {
  /** 时间范围（天） */
  days: number;
  /** 颜色方案 */
  colorScheme: 'ocean' | 'forest' | 'sunset';
}

export interface DashboardConfig {
  /** 容积率预警线（百分比） */
  warningThreshold: number;
  /** 容积率满仓线（百分比） */
  fullThreshold: number;
  /** 库龄预警天数 */
  ageWarningDays: number;
  /** KPI趋势对比天数 */
  trendCompareDays: number;
  /** 数据刷新间隔秒数 */
  dataRefreshInterval: number;
  /** 在途货物统计天数 */
  defaultTransitVolumeDays: number;
  /** 仓库总件数（影响容积率计算） */
  totalItems: number;
  /** 在途报警阈值（到仓后容积率百分比，超过此值报警） */
  transitAlertThreshold: number;
  /** 指标可见性 */
  visibility: DashboardVisibility;
  /** 热力图配置 */
  heatmap: HeatmapConfig;
  /** 组件顺序 */
  componentOrder: string[];
  /** 数据源模式：mock / api / tencent-docs */
  dataSourceMode: 'mock' | 'api' | 'tencent-docs';
  /** API 基础地址（仅 api 模式） */
  dataSourceApiBaseUrl: string;
  /** 腾讯文档 ID 映射（仅 tencent-docs 模式） */
  dataSourceDocMappings: DataSourceConfig['docMappings'];
}

export interface SidebarConfig {
  /** 是否在侧边栏 Logo 旁显示版本号 */
  showVersion: boolean;
}

// ===================== 外观配置 =====================

export type ThemeMode = 'light' | 'dark';
export type AccentColor = 'default' | 'blue' | 'green' | 'purple' | 'red' | 'orange';
export type FontSize = 'small' | 'medium' | 'large';
export type BorderRadius = 'sharp' | 'normal' | 'rounded';

export interface AppearanceConfig {
  /** 主题模式 */
  themeMode: ThemeMode;
  /** 强调色 */
  accentColor: AccentColor;
  /** 字体大小 */
  fontSize: FontSize;
  /** 圆角风格 */
  borderRadius: BorderRadius;
  /** 是否显示动画 */
  enableAnimations: boolean;
  /** 是否显示阴影 */
  enableShadows: boolean;
  /** 紧凑模式（减少内边距） */
  compactMode: boolean;
  /** AI 助手显示名称 */
  botName: string;
}

// ===================== AI 引擎配置 =====================

export type ExecutionMode = 'legacy' | 'react' | 'agent';

/** v7.0: 队列模式 — 高频交互消息竞争控制 */
export type QueueMode = 'collect' | 'steer' | 'followup';

/** 工具 Profile：控制可用工具集 */
export type ToolProfile = 'minimal' | 'coding' | 'messaging' | 'full';

/** 压缩策略 */
export type CompactionStrategy = 'semantic' | 'extractive' | 'truncation';

export interface AiEngineConfig {
  /** 默认执行模式：legacy(轻量) / react(完整ReAct) */
  defaultExecutionMode: ExecutionMode;
  /** v7.0: 默认队列模式：collect(合并) / steer(转向) / followup(追加) */
  defaultQueueMode: QueueMode;
  /** v1.7.19: 最大历史对话轮次（0 表示不限制） */
  maxHistoryTurns: number;
  /** 工具 Profile：控制可用工具集 */
  toolProfile: ToolProfile;
  /** 上下文压缩配置 */
  compaction: {
    /** 是否启用自动压缩 */
    enabled: boolean;
    /** 压缩策略：semantic(语义) / extractive(摘要) / truncation(截断) */
    strategy: CompactionStrategy;
    /** 触发阈值：上下文占比达到多少时触发压缩（0-1） */
    thresholdRatio: number;
    /** 保留最近 N 轮对话不压缩 */
    preserveRecent: number;
  };
}

export interface AppSettings {
  tencentDocs: TencentDocsConfig;
  wecomDocs: WeComDocsConfig;
  dashboard: DashboardConfig;
  sidebar: SidebarConfig;
  /** 外观配置 */
  appearance: AppearanceConfig;
  /** AI 引擎配置 */
  aiEngine: AiEngineConfig;
  /** 语言设置 */
  language: SupportedLanguage;
}

export const DEFAULT_SETTINGS: AppSettings = {
  tencentDocs: {
    docLinks: [],
    onlineData: [],
  },
  wecomDocs: {
    docLinks: [],
  },
  dashboard: {
    warningThreshold: 70,
    fullThreshold: 90,
    ageWarningDays: 90,
    trendCompareDays: 30,
    dataRefreshInterval: 60,
    defaultTransitVolumeDays: 30,
    totalItems: 14300,
    transitAlertThreshold: 85, // 到仓后容积率超过85%报警
    visibility: {
      kpiTransitVolume: true,
      kpiVolumeUtilization: true,
      kpiPendingInbound: true,
      kpiOutboundCount: true,
      kpiInventoryDepth: true,
      kpiTransitAlert: true,
      chartVolumeTrend: true,
      chartTransitPie: true,
      chartWarehouseBar: true,
      chartShipmentHeatmap: true,
      chartInventoryAlert: true,
      chartKpiComparison: true,
      chartTransitTime: true,
    },
    heatmap: {
      days: 365,
      colorScheme: 'ocean',
    },
    componentOrder: ['kpi-cards', 'heatmap', 'volume-trend', 'transit-pie', 'warehouse-bar', 'inventory-alert', 'kpi-comparison', 'transit-time'],
    // 数据源配置（平铺结构）
    dataSourceMode: 'mock',
    dataSourceApiBaseUrl: '/api/v1',
    dataSourceDocMappings: {
      warehouses: 'warehouses',
      transitOrders: 'transitOrders',
      inventory: 'inventory',
      inboundRecords: 'inboundRecords',
      outboundRecords: 'outboundRecords',
      volumeHistory: 'volumeHistory',
      inboundTrend: 'inboundTrend',
      outboundTrend: 'outboundTrend',
    },
  },
  sidebar: {
    showVersion: true,
  },
  // 外观配置
  appearance: {
    themeMode: 'light',
    accentColor: 'default',
    fontSize: 'medium',
    borderRadius: 'normal',
    enableAnimations: true,
    enableShadows: true,
    compactMode: false,
    botName: 'CDF Bot',
  },
  // AI 引擎配置
  aiEngine: {
    defaultExecutionMode: 'legacy',
    defaultQueueMode: 'followup',
    maxHistoryTurns: 0,
    toolProfile: 'full',
    compaction: {
      enabled: true,
      strategy: 'semantic',
      thresholdRatio: 0.75,
      preserveRecent: 6,
    },
  },
  // 语言设置
  language: 'zh-CN',
};

// ===================== Context =====================

const STORAGE_KEY = 'cdf-know-clow-settings';

export interface AppSettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

// ===================== 子域 Context（按依赖分离，避免跨域重渲染） =====================

interface DomainSettingsValue<T> {
  settings: T;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

interface DocLinksSettingsValue {
  settings: { tencentDocs: TencentDocsConfig; wecomDocs: WeComDocsConfig };
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const AppearanceSettingsContext = createContext<DomainSettingsValue<AppearanceConfig> | null>(null);
const DashboardSettingsContext = createContext<DomainSettingsValue<DashboardConfig> | null>(null);
const DocLinksSettingsContext = createContext<DocLinksSettingsValue | null>(null);
const AiEngineSettingsContext = createContext<DomainSettingsValue<AiEngineConfig> | null>(null);

// ===================== Helper: Open External Link =====================

/**
 * Open a URL in the system's default browser.
 * Uses window.electronAPI in Electron environment, falls back to window.open in browser.
 *
 * @param url - The URL to open
 */
export function openExternalLink(url: string): void {
  if (window.electronAPI?.openExternalLink) {
    window.electronAPI.openExternalLink(url).catch((_err: unknown) => {
      // console.error('Failed to open external link:', _err);
    });
  } else {
    // Fallback for browser environment (non-Electron)
    window.open(url, '_blank');
  }
}

// ===================== Helper: Load Settings =====================

/** Load settings from API first, fallback to localStorage */
async function loadSettingsFromApi(): Promise<AppSettings | null> {
  try {
    const data = await api.getAppSettings();
    if (data && typeof data === 'object') {
      return mergeWithDefaults(data as Partial<AppSettings>);
    }
  } catch (e) {
    // console.error('[AppSettings] loadFromApi failed, falling back to localStorage:', e);
  }
  return null;
}

/** Load settings from localStorage (legacy fallback) */
function loadSettingsFromLocalStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return mergeWithDefaults(parsed);
    }
  } catch {
    // Ignore parse errors, fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

/** Merge partial settings with defaults, preserving backward compatibility */
export function mergeWithDefaults(parsed: Partial<AppSettings>): AppSettings {
  // Deep merge with defaults to ensure all fields exist even if storage is partial
  // Migrate from old API-based config and remove sync-related fields from docLinks
  const rawDocs = parsed.tencentDocs as { docLinks?: unknown[]; onlineData?: unknown[] } | undefined;
  const docLinks: DocLinkItem[] =
    rawDocs && Array.isArray(rawDocs.docLinks)
      ? rawDocs.docLinks.map((link: unknown) => {
          const record = link as Record<string, unknown>;
          return {
            // Only pick the fields that belong to the simplified DocLinkItem
            id: String(record.id ?? ''),
            url: String(record.url ?? ''),
            title: String(record.title ?? ''),
            dataType: String(record.dataType ?? 'other') as DocLinkItem['dataType'],
            // Ignore autoSync, syncInterval, lastSyncedAt, syncStatus from old data
          };
        })
      : [];

  // 在线数据加载
  const onlineData: OnlineDataEntry[] =
    rawDocs && Array.isArray(rawDocs.onlineData)
      ? rawDocs.onlineData.map((entry: unknown) => {
          const record = entry as Record<string, unknown>;
          return {
            id: String(record.id ?? ''),
            name: String(record.name ?? ''),
            dataType: String(record.dataType ?? 'other') as OnlineDataEntry['dataType'],
            data: String(record.data ?? ''),
            updatedAt: String(record.updatedAt ?? ''),
          };
        })
      : [];

  const tencentDocs = { docLinks, onlineData };

  // 企业文档链接迁移
  const rawWeComDocs = parsed.wecomDocs as { docLinks?: unknown[] } | undefined;
  const wecomDocLinks: WeComDocLinkItem[] =
    rawWeComDocs && Array.isArray(rawWeComDocs.docLinks)
      ? rawWeComDocs.docLinks.map((link: unknown) => {
          const record = link as Record<string, unknown>;
          return {
            id: String(record.id ?? ''),
            url: String(record.url ?? ''),
            title: String(record.title ?? ''),
            dataType: String(record.dataType ?? 'other') as WeComDocLinkItem['dataType'],
          };
        })
      : [];
  const wecomDocs = { docLinks: wecomDocLinks };

    return {
      tencentDocs,
      wecomDocs,
      dashboard: {
        ...DEFAULT_SETTINGS.dashboard,
        ...parsed.dashboard,
        visibility: { ...DEFAULT_SETTINGS.dashboard.visibility, ...(parsed.dashboard?.visibility ?? {}) },
        heatmap: { ...DEFAULT_SETTINGS.dashboard.heatmap, ...(parsed.dashboard?.heatmap ?? {}) },
        // 处理数据源字段（平铺结构，向后兼容旧版 dataSource 对象）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dataSourceMode: parsed.dashboard?.dataSourceMode
          ?? (parsed.dashboard as any)?.dataSource?.mode
          ?? DEFAULT_SETTINGS.dashboard.dataSourceMode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dataSourceApiBaseUrl: parsed.dashboard?.dataSourceApiBaseUrl
          ?? (parsed.dashboard as any)?.dataSource?.apiBaseUrl
          ?? DEFAULT_SETTINGS.dashboard.dataSourceApiBaseUrl,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dataSourceDocMappings: parsed.dashboard?.dataSourceDocMappings
          ?? (parsed.dashboard as any)?.dataSource?.docMappings
          ?? DEFAULT_SETTINGS.dashboard.dataSourceDocMappings,
      },
      sidebar: {
        ...DEFAULT_SETTINGS.sidebar,
        ...parsed.sidebar,
      },
      // 外观配置（向后兼容）
      appearance: parsed.appearance
        ? { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance }
        : { ...DEFAULT_SETTINGS.appearance },
      // AI 引擎配置（向后兼容）
      aiEngine: {
        ...DEFAULT_SETTINGS.aiEngine,
        ...parsed.aiEngine,
        compaction: {
          ...DEFAULT_SETTINGS.aiEngine.compaction,
          ...(parsed.aiEngine?.compaction ?? {}),
        },
      },
      // 语言设置（向后兼容，从 localStorage 的 app_language 读取）
      language: (parsed.language as SupportedLanguage) || getCurrentLanguage(),
    };
}

// ===================== Helper: Save to API + localStorage fallback =====================

async function saveSettingsToApi(settings: AppSettings): Promise<void> {
  try {
    await api.updateAppSettings(settings);
  } catch (e) {
    // console.error('[AppSettings] saveToApi failed, falling back to localStorage:', e);
    // Fallback: save to localStorage if API fails
    saveSettingsToLocalStorage(settings);
  }
}

function saveSettingsToLocalStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors (e.g. quota exceeded)
  }
}

// ===================== Provider =====================

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettingsFromLocalStorage());
  const [isApiLoaded, setIsApiLoaded] = useState(false);

  // On mount, try to load from API (supersedes localStorage)
  useEffect(() => {
    let cancelled = false;
    loadSettingsFromApi().then((apiSettings) => {
      if (cancelled) return;
      const merged = apiSettings ?? loadSettingsFromLocalStorage();
      setSettings(merged);
      saveSettingsToLocalStorage(merged);
      setIsApiLoaded(true);
    }).catch(() => {
      setIsApiLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist general settings to API + localStorage
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isApiLoaded) return;

    const timer = setTimeout(() => {
      saveSettingsToApi(settings);
      saveSettingsToLocalStorage(settings);
    }, 500);

    return () => clearTimeout(timer);
  }, [settings, isApiLoaded]);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev };
      if (partial.tencentDocs) {
        next.tencentDocs = {
          ...prev.tencentDocs,
          ...partial.tencentDocs,
          docLinks: partial.tencentDocs.docLinks ?? prev.tencentDocs.docLinks,
          onlineData: partial.tencentDocs.onlineData ?? prev.tencentDocs.onlineData,
        };
      }
      if (partial.wecomDocs) {
        next.wecomDocs = { ...prev.wecomDocs, ...partial.wecomDocs };
      }
      if (partial.dashboard) {
        const prevDashboard = prev.dashboard;
        const partialDashboard = partial.dashboard;

        next.dashboard = {
          ...prevDashboard,
          ...partialDashboard,
          visibility: { ...prevDashboard.visibility, ...(partialDashboard.visibility ?? {}) },
          heatmap: { ...prevDashboard.heatmap, ...(partialDashboard.heatmap ?? {}) },
          // 数据源字段（平铺结构，向后兼容旧版 dataSource 对象）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dataSourceMode: partialDashboard.dataSourceMode
            ?? (partialDashboard as any)?.dataSource?.mode
            ?? prevDashboard.dataSourceMode,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dataSourceApiBaseUrl: partialDashboard.dataSourceApiBaseUrl
            ?? (partialDashboard as any)?.dataSource?.apiBaseUrl
            ?? prevDashboard.dataSourceApiBaseUrl,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dataSourceDocMappings: partialDashboard.dataSourceDocMappings
            ?? (partialDashboard as any)?.dataSource?.docMappings
            ?? prevDashboard.dataSourceDocMappings,
        };
      }
      if (partial.sidebar) {
        next.sidebar = { ...prev.sidebar, ...partial.sidebar };
      }
      if (partial.appearance) {
        next.appearance = { ...prev.appearance, ...partial.appearance };
      }
      if (partial.aiEngine) {
        next.aiEngine = {
          ...prev.aiEngine,
          ...partial.aiEngine,
          compaction: {
            ...prev.aiEngine.compaction,
            ...(partial.aiEngine.compaction ?? {}),
          },
        };
      }
      if (partial.language) {
        next.language = partial.language;
      }
      return next;
    });
  }, []);

  // 同步语言设置到 i18n
  useEffect(() => {
    if (!isApiLoaded) return;
    const currentLang = getCurrentLanguage();
    if (settings.language !== currentLang) {
      loadLanguage(settings.language).then(() => {
        changeLanguage(settings.language);
      });
    }
  }, [settings.language, isApiLoaded]);

  // 监听外部语言变化（如直接调用 i18n 的 changeLanguage）
  useEffect(() => {
    const handler = (data: { current: SupportedLanguage }) => {
      setSettings((prev) => {
        if (prev.language === data.current) return prev;
        return { ...prev, language: data.current };
      });
    };
    const unsubscribe = i18nEvents.on('languageChanged', handler);
    return unsubscribe;
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const value = useMemo<AppSettingsContextValue>(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings],
  );

  // 子域 values — 各自仅依赖所属子域切片，updateSettings/resetSettings 是稳定引用
  const appearanceValue = useMemo<DomainSettingsValue<AppearanceConfig>>(() => ({
    settings: settings.appearance,
    updateSettings,
    resetSettings,
  }), [settings.appearance, updateSettings, resetSettings]);

  const dashboardValue = useMemo<DomainSettingsValue<DashboardConfig>>(() => ({
    settings: settings.dashboard,
    updateSettings,
    resetSettings,
  }), [settings.dashboard, updateSettings, resetSettings]);

  const docLinksValue = useMemo<DocLinksSettingsValue>(() => ({
    settings: {
      tencentDocs: settings.tencentDocs,
      wecomDocs: settings.wecomDocs,
    },
    updateSettings,
    resetSettings,
  }), [settings.tencentDocs, settings.wecomDocs, updateSettings, resetSettings]);

  const aiEngineValue = useMemo<DomainSettingsValue<AiEngineConfig>>(() => ({
    settings: settings.aiEngine,
    updateSettings,
    resetSettings,
  }), [settings.aiEngine, updateSettings, resetSettings]);

  return (
    <AppSettingsContext.Provider value={value}>
      <AppearanceSettingsContext.Provider value={appearanceValue}>
        <DashboardSettingsContext.Provider value={dashboardValue}>
          <DocLinksSettingsContext.Provider value={docLinksValue}>
            <AiEngineSettingsContext.Provider value={aiEngineValue}>
              {children}
            </AiEngineSettingsContext.Provider>
          </DocLinksSettingsContext.Provider>
        </DashboardSettingsContext.Provider>
      </AppearanceSettingsContext.Provider>
    </AppSettingsContext.Provider>
  );
};

// ===================== Hook =====================

export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}

// ===================== 子域 Hooks =====================

export function useAppearanceSettings(): DomainSettingsValue<AppearanceConfig> {
  const ctx = useContext(AppearanceSettingsContext);
  if (!ctx) {
    throw new Error('useAppearanceSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}

export function useDashboardSettings(): DomainSettingsValue<DashboardConfig> {
  const ctx = useContext(DashboardSettingsContext);
  if (!ctx) {
    throw new Error('useDashboardSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}

export function useDocLinksSettings(): DocLinksSettingsValue {
  const ctx = useContext(DocLinksSettingsContext);
  if (!ctx) {
    throw new Error('useDocLinksSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}

export function useAiEngineSettings(): DomainSettingsValue<AiEngineConfig> {
  const ctx = useContext(AiEngineSettingsContext);
  if (!ctx) {
    throw new Error('useAiEngineSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}
