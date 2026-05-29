import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

import type { DataSourceConfig } from '../services/dashboardApi';

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

export interface TencentDocsConfig {
  /** 已添加的文档链接列表 */
  docLinks: DocLinkItem[];
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
  colorScheme: 'blue' | 'green' | 'red';
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
  /** 数据源配置 */
  dataSource: DataSourceConfig;
}

export interface SidebarConfig {
  /** 是否在侧边栏 Logo 旁显示版本号 */
  showVersion: boolean;
}

export interface AppSettings {
  tencentDocs: TencentDocsConfig;
  wecomDocs: WeComDocsConfig;
  dashboard: DashboardConfig;
  sidebar: SidebarConfig;
}

// ===================== Default Settings =====================

const DEFAULT_SETTINGS: AppSettings = {
  tencentDocs: {
    docLinks: [],
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
      colorScheme: 'blue',
    },
    componentOrder: ['kpi-cards', 'heatmap', 'volume-trend', 'transit-pie', 'warehouse-bar', 'inventory-alert', 'kpi-comparison', 'transit-time'],
    dataSource: {
      mode: 'mock',
      apiBaseUrl: '/api/v1',
      docMappings: {},
    },
  },
  sidebar: {
    showVersion: true,
  },
};

// ===================== Context =====================

const STORAGE_KEY = 'crosswms-settings';

interface AppSettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

// ===================== Helper: Open External Link =====================

/**
 * Open a URL in the system's default browser.
 * Uses window.electronAPI in Electron environment, falls back to window.open in browser.
 *
 * @param url - The URL to open
 */
export function openExternalLink(url: string): void {
  if (window.electronAPI?.openExternalLink) {
    window.electronAPI.openExternalLink(url).catch((err: unknown) => {
      console.error('Failed to open external link:', err);
    });
  } else {
    // Fallback for browser environment (non-Electron)
    window.open(url, '_blank');
  }
}

// ===================== Helper: Load from localStorage =====================

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      // Deep merge with defaults to ensure all fields exist even if storage is partial
      // Migrate from old API-based config and remove sync-related fields from docLinks
      const rawDocs = parsed.tencentDocs as { docLinks?: unknown[] } | undefined;
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

      const tencentDocs = { docLinks };

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
          dataSource: { ...DEFAULT_SETTINGS.dashboard.dataSource, ...(parsed.dashboard?.dataSource ?? {}) },
        },
        sidebar: {
          ...DEFAULT_SETTINGS.sidebar,
          ...parsed.sidebar,
        },
      };
    }
  } catch {
    // Ignore parse errors, fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

// ===================== Helper: Save to localStorage =====================

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors (e.g. quota exceeded)
  }
}

// ===================== Provider =====================

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Persist to localStorage whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev };
      if (partial.tencentDocs) {
        next.tencentDocs = { ...prev.tencentDocs, ...partial.tencentDocs };
      }
      if (partial.wecomDocs) {
        next.wecomDocs = { ...prev.wecomDocs, ...partial.wecomDocs };
      }
      if (partial.dashboard) {
        next.dashboard = {
          ...prev.dashboard,
          ...partial.dashboard,
          visibility: { ...prev.dashboard.visibility, ...(partial.dashboard.visibility ?? {}) },
          heatmap: { ...prev.dashboard.heatmap, ...(partial.dashboard.heatmap ?? {}) },
          dataSource: { ...prev.dashboard.dataSource, ...(partial.dashboard.dataSource ?? {}) },
        };
      }
      if (partial.sidebar) {
        next.sidebar = { ...prev.sidebar, ...partial.sidebar };
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const value = useMemo<AppSettingsContextValue>(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
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
