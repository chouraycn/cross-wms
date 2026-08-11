/**
 * ObservabilityCenterPage — 监控中心聚合页
 *
 * 收敛设置面板「可观测性」分组下的重复入口，并把原属「API 与密钥」的
 * 调用历史、原属侧边栏「系统 & 监控」的系统指标一并纳入：
 *   系统监控 / 系统指标 / 审计日志 / 执行历史 / 事件账本 / 调用历史 / 路由命中率
 * 通过 Tab 在同一页面内组合，底层仍为原有独立页面组件。
 */

import React from 'react';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import CenterPage from '../components/Layout/CenterPage';
import SystemMonitorPage from './SystemMonitorPage';
import MetricsPage from './MetricsPage';
import AuditLogPage from './AuditLogPage';
import ExecutionHistoryPage from './ExecutionHistoryPage';
import EventLedgerPage from './EventLedgerPage';
import ApiHistoryPage from './ApiHistoryPage';
import RouteMetricsPanel from '../components/RouteMetricsPanel';

const ObservabilityCenterPage: React.FC = () => (
  <CenterPage
    title="监控中心"
    description="系统监控、系统指标、审计日志、执行历史、事件账本、API 调用历史与路由命中率"
    icon={<MonitorHeartIcon />}
    tabs={[
      { label: '系统监控', render: () => <SystemMonitorPage /> },
      { label: '系统指标', render: () => <MetricsPage /> },
      { label: '审计日志', render: () => <AuditLogPage /> },
      { label: '执行历史', render: () => <ExecutionHistoryPage /> },
      { label: '事件账本', render: () => <EventLedgerPage /> },
      { label: '调用历史', render: () => <ApiHistoryPage /> },
      { label: '路由命中率', render: () => <RouteMetricsPanel /> },
    ]}
  />
);

export default ObservabilityCenterPage;
