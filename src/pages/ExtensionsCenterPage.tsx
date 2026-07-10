/**
 * ExtensionsCenterPage — 扩展与工具聚合页
 *
 * 收敛设置面板「工具与扩展」分组下的重复入口：
 *   扩展管理 / 插件 / 工具 (MCP)
 * 通过 Tab 在同一页面内组合，底层仍为原有独立页面组件。
 */

import React from 'react';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import CenterPage from '../components/Layout/CenterPage';
import ExtensionsPage from './ExtensionsPage';
import PluginsPage from './PluginsPage';
import McpServersPage from './McpServersPage';

const ExtensionsCenterPage: React.FC = () => (
  <CenterPage
    title="扩展与工具"
    description="统一管理扩展、插件与 MCP 工具"
    icon={<ExtensionOutlinedIcon />}
    tabs={[
      { label: '扩展管理', render: () => <ExtensionsPage /> },
      { label: '插件', render: () => <PluginsPage /> },
      { label: '工具 (MCP)', render: () => <McpServersPage /> },
    ]}
  />
);

export default ExtensionsCenterPage;
