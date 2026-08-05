/**
 * MonitoringHubPage — 监控中心统一入口
 *
 * 将原先分散的三个监控页面整合为 Tab 切换：
 * - 进程管理（ProcessManagementPage）
 * - 节点主机（NodeHostPage）
 * - 集成监控（IntegrationDashboardPage）
 *
 * 整合动机：三者在功能上同属"系统可观测性"，分散入口增加用户认知负担，
 * 且实际使用中常需联动查看（如进程异常 → 查节点资源 → 查集成链路）。
 *
 * 设计：保留三个原页面组件不动，本页仅做 Tab 容器 + 懒加载，避免重构风险。
 * 路由 /monitoring 进入本页，原 /process /node-host /integration 路由保留作为深链。
 */

import React, { Suspense, useState, useEffect } from 'react';
import { Box, Tabs, Tab, useTheme, CircularProgress } from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import DnsIcon from '@mui/icons-material/Dns';
import HubIcon from '@mui/icons-material/Hub';
import { getGrayScale } from '../constants/theme';

const ProcessManagementPage = React.lazy(() => import('./ProcessManagementPage'));
const NodeHostPage = React.lazy(() => import('./NodeHostPage'));
const IntegrationDashboardPage = React.lazy(() => import('./IntegrationDashboardPage'));

type MonitorTab = 'process' | 'node-host' | 'integration';

const TABS: Array<{ key: MonitorTab; label: string; icon: React.ReactElement }> = [
  { key: 'process', label: '进程管理', icon: <MemoryIcon sx={{ fontSize: 16 }} /> },
  { key: 'node-host', label: '节点主机', icon: <DnsIcon sx={{ fontSize: 16 }} /> },
  { key: 'integration', label: '集成监控', icon: <HubIcon sx={{ fontSize: 16 }} /> },
];

interface MonitoringHubPageProps {
  /** 初始 Tab，由路由深链决定（/monitoring/process → process） */
  initialTab?: MonitorTab;
}

export default function MonitoringHubPage({ initialTab = 'process' }: MonitoringHubPageProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [tab, setTab] = useState<MonitorTab>(initialTab);

  // 路由 hash 变化时同步 Tab（支持深链 #process / #node-host / #integration）
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, '') as MonitorTab;
      if (TABS.some((t) => t.key === h)) setTab(h);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleTabChange = (_: React.SyntheticEvent, v: MonitorTab) => {
    setTab(v);
    // 更新 hash 便于深链分享
    window.history.replaceState(null, '', `#${v}`);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box
        sx={{
          borderBottom: `1px solid ${gs.border}`,
          px: 2,
          flexShrink: 0,
          bgcolor: gs.bgPanel,
        }}
      >
        <Tabs
          value={tab}
          onChange={handleTabChange}
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              fontSize: '0.8125rem',
              fontWeight: 500,
              textTransform: 'none',
              color: gs.textMuted,
              '&.Mui-selected': { color: gs.textPrimary },
            },
            '& .MuiTabs-indicator': {
              height: 2,
              backgroundColor: isDark ? '#fff' : '#111',
            },
          }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              label={t.label}
              icon={t.icon}
              iconPosition="start"
              sx={{ gap: 0.75 }}
            />
          ))}
        </Tabs>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Suspense
          fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress size={28} />
            </Box>
          }
        >
          {tab === 'process' && <ProcessManagementPage />}
          {tab === 'node-host' && <NodeHostPage />}
          {tab === 'integration' && <IntegrationDashboardPage />}
        </Suspense>
      </Box>
    </Box>
  );
}
