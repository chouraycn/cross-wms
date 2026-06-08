import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Alert,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DescriptionIcon from '@mui/icons-material/Description';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InfoIcon from '@mui/icons-material/Info';
import TuneIcon from '@mui/icons-material/Tune';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import ComputerIcon from '@mui/icons-material/Computer';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { AppSettings } from '../../contexts/AppSettingsContext';
import { isPyWebView } from '../../services/tencentDocsApi';
import TencentDocsTab from './tabs/TencentDocsTab';
import DashboardParamsTab from './tabs/DashboardParamsTab';
import MetricsControlTab from './tabs/MetricsControlTab';
import VolumeDocTab from './tabs/VolumeDocTab';
import ModelManagement from './tabs/ModelManagement';
import AboutTab from './tabs/AboutTab';
import TrafficLightOffsetSection from './tabs/TrafficLightOffsetSection';
import { useToast } from '../../contexts/ToastContext';

// ===================== Tab Definitions =====================

type SettingsTab = 'tencentDocs' | 'dashboardParams' | 'metricsControl' | 'volumeDoc' | 'modelManagement' | 'dmgSettings' | 'about';

interface TabItem {
  key: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  { key: 'tencentDocs', label: '腾讯文档', icon: <DescriptionIcon sx={{ fontSize: 20 }} /> },
  { key: 'dashboardParams', label: '仪表盘参数', icon: <DashboardIcon sx={{ fontSize: 20 }} /> },
  { key: 'metricsControl', label: '指标控制', icon: <TuneIcon sx={{ fontSize: 20 }} /> },
  { key: 'volumeDoc', label: '容积率文档', icon: <ViewTimelineIcon sx={{ fontSize: 20 }} /> },
  { key: 'modelManagement', label: '模型管理', icon: <SmartToyIcon sx={{ fontSize: 20 }} /> },
  { key: 'dmgSettings', label: 'DMG 设置', icon: <ComputerIcon sx={{ fontSize: 20 }} /> },
  { key: 'about', label: '关于', icon: <InfoIcon sx={{ fontSize: 20 }} /> },
];

// ===================== Main Component =====================

const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useAppSettings();

  /** Open a link in the system browser (adapts to pywebview / browser environments) */
  const openInBrowser = useCallback(async (url: string) => {
    if (isPyWebView() && window.pywebview?.api) {
      try {
        await window.pywebview.api.open_in_browser(url);
        return;
      } catch {
        // fallback
      }
    }
    window.open(url, '_blank');
  }, []);

  // Active tab
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && TABS.some(t => t.key === tabParam)) {
      return tabParam as SettingsTab;
    }
    return 'tencentDocs';
  });

  // 同步 tab 变化到 URL 参数
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      setSearchParams(activeTab === 'tencentDocs' ? {} : { tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  // Local draft state for unsaved changes
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const { showToast } = useToast();

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Show a snackbar message (delegates to global ToastContext) */
  const onShowSnackbar = useCallback((msg: string) => {
    showToast(msg, 'success');
  }, [showToast]);

  /** Save draft to the global settings store */
  const handleSave = () => {
    if (draft.dashboard.fullThreshold <= draft.dashboard.warningThreshold) {
      setErrors((e) => ({ ...e, 'dashboard.fullThreshold': '满仓线必须大于预警线' }));
      return;
    }
    updateSettings({ tencentDocs: draft.tencentDocs });
    updateSettings({ wecomDocs: draft.wecomDocs });
    updateSettings({ volumeDocs: draft.volumeDocs });
    updateSettings({ dashboard: draft.dashboard });
    updateSettings({ sidebar: draft.sidebar });
    updateSettings({ models: draft.models });
    showToast('设置已保存', 'success');
  };

  /** Reset to defaults */
  const handleReset = () => {
    resetSettings();
    setDraft({
      tencentDocs: {
        ...settings.tencentDocs,
        docLinks: [],
        onlineData: [],
      },
      wecomDocs: {
        docLinks: [],
      },
      volumeDocs: {
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
        transitAlertThreshold: 85,
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
          days: 14,
          colorScheme: 'ocean',
        },
        componentOrder: ['kpi-cards', 'heatmap', 'volume-trend', 'transit-pie', 'warehouse-bar', 'inventory-alert', 'kpi-comparison', 'transit-time'],
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
      appearance: {
        themeMode: 'light',
        accentColor: 'default',
        fontSize: 'medium',
        borderRadius: 'normal',
        enableAnimations: true,
        enableShadows: true,
        compactMode: false,
      },
      models: settings.models,
    });
    setErrors({});
    showToast('已重置为默认值', 'info');
  };

  const hasErrors = Object.keys(errors).length > 0;

  /** Render the active tab content */
  const renderContent = () => {
    switch (activeTab) {
      case 'tencentDocs':
        return <TencentDocsTab draft={draft} setDraft={setDraft} errors={errors} setErrors={setErrors} openInBrowser={openInBrowser} onShowSnackbar={onShowSnackbar} />;
      case 'dashboardParams':
        return <DashboardParamsTab draft={draft} setDraft={setDraft} errors={errors} setErrors={setErrors} onShowSnackbar={onShowSnackbar} />;
      case 'metricsControl':
        return <MetricsControlTab draft={draft} setDraft={setDraft} errors={errors} setErrors={setErrors} />;
      case 'volumeDoc':
        return <VolumeDocTab draft={draft} setDraft={setDraft} openInBrowser={openInBrowser} />;
      case 'modelManagement':
        return <ModelManagement draft={draft} setDraft={setDraft} />;
      case 'dmgSettings':
        return (
          <Box sx={{ maxWidth: 680 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>
              DMG 窗口设置
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 3 }}>
              配置桌面应用（DMG）的窗口行为，仅在使用 pywebview 桌面端时生效。
            </Typography>
            <TrafficLightOffsetSection />
          </Box>
        );
      case 'about':
        return <AboutTab draft={draft} setDraft={setDraft} errors={errors} setErrors={setErrors} />;
    }
  };

  // ===================== Layout =====================

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: '#111827' }}>
        系统设置
      </Typography>

      <Box sx={{ display: 'flex', gap: 0, minHeight: 480 }}>
        {/* Left: Tab Navigation */}
        <Box
          sx={{
            width: 200,
            flexShrink: 0,
            borderRight: '1px solid #E5E7EB',
            pr: 0,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Box
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  cursor: 'pointer',
                  borderRadius: '0 8px 8px 0',
                  mr: 1,
                  mb: 0.5,
                  backgroundColor: isActive ? '#111827' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#6B7280',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    backgroundColor: isActive ? '#111827' : '#F3F4F6',
                  },
                  '& .tab-icon': {
                    color: isActive ? '#FFFFFF' : '#6B7280',
                    transition: 'color 0.15s ease',
                  },
                  '& .tab-label': {
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                  },
                }}
              >
                <Box className="tab-icon">{tab.icon}</Box>
                <Typography className="tab-label">{tab.label}</Typography>
              </Box>
            );
          })}
        </Box>

        {/* Right: Content Area */}
        <Box
          sx={{
            flex: 1,
            pl: 4,
            pr: 2,
            py: 0,
          }}
        >
          {renderContent()}
        </Box>
      </Box>

      {/* Action Buttons — fixed at bottom */}
      <Divider sx={{ my: 3 }} />
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={handleReset}
          sx={{
            borderColor: '#E5E7EB',
            color: '#6B7280',
            '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
          }}
        >
          重置为默认值
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={hasErrors}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            '&.Mui-disabled': { backgroundColor: '#E5E7EB', color: '#9CA3AF' },
          }}
        >
          保存设置
        </Button>
      </Box>
    </Box>
  );
};

export default SettingsPanel;
