import React from 'react';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import ImageIcon from '@mui/icons-material/Image';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WebIcon from '@mui/icons-material/Web';
import StorageIcon from '@mui/icons-material/Storage';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import PhonelinkIcon from '@mui/icons-material/Phonelink';
import HubIcon from '@mui/icons-material/Hub';
import SecurityIcon from '@mui/icons-material/Security';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import TimerIcon from '@mui/icons-material/Timer';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import WebhookIcon from '@mui/icons-material/Webhook';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import GitHubIcon from '@mui/icons-material/GitHub';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PublicIcon from '@mui/icons-material/Public';
import BookOutlinedIcon from '@mui/icons-material/BookOutlined';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FindInPageOutlinedIcon from '@mui/icons-material/FindInPageOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import StaffdeckIcon from '../staff/StaffdeckIcon';

// 已移除的 Tab（迁移到 AI 对话 / Skill 体系 / Swift 原生）：
// - tencentDocs: 腾讯文档配置 → 通过腾讯文档 Skill 实现（功能页 /tencent-docs 仍保留）
// - dashboardCalc: 仪表盘参数 → 通过 AI 对话分析仪表盘
// - dashboardIndicators: 指标控制 → 通过 Skill 配置指标维度
// - systemAuthorization: 系统授权 → Swift 原生 App 内置权限管理，Web 端无需配置（状态已移除）

/** 菜单条目：带 children 即为可展开分组 */
export interface MenuEntry {
  key: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  children?: MenuEntry[];
  // 叶子动作（无 children 时生效）
  tab?: 'menu' | 'appearance' | 'about';
  path?: string;
  dialog?: 'tool' | 'model';
  appearanceInline?: boolean;
  // 打开 AISettingsDialog 并定位到指定标签页
  aiTab?: { main: string; sub: string };
}

export const SETTINGS_MENU: MenuEntry[] = [
  { key: 'appearance', label: '外观', icon: <PaletteOutlinedIcon sx={{ fontSize: 20 }} />, description: '主题、颜色与显示偏好', appearanceInline: true },
  { key: 'modelManagement', label: '模型管理', icon: <AutoAwesomeIcon sx={{ fontSize: 20 }} />, description: 'AI 模型配置与默认模型', dialog: 'model' },
  { key: 'extensionsCenter', label: '扩展与工具', icon: <ExtensionOutlinedIcon sx={{ fontSize: 20 }} />, description: '插件、扩展与 MCP 工具统一管理', path: '/extensions-center' },
  {
    key: 'comms',
    label: '通讯 & 语音',
    icon: <RecordVoiceOverIcon sx={{ fontSize: 20 }} />,
    description: '语音对话 · TTS · 通道',
    children: [
      { key: 'comms-talk', label: '语音对话', icon: <RecordVoiceOverIcon sx={{ fontSize: 18 }} />, description: '通道配置', aiTab: { main: 'comms', sub: 'talk' } },
      { key: 'tts', label: '语音合成', icon: <RecordVoiceOverIcon sx={{ fontSize: 18 }} />, description: 'TTS 设置', path: '/tts' },
    ],
  },
  {
    key: 'creation',
    label: '创作',
    icon: <StaffdeckIcon name="image" size={20} />,
    description: '图像 · 音乐 · 视频',
    children: [
      { key: 'image-generation', label: '图像生成', icon: <ImageIcon sx={{ fontSize: 18 }} />, description: 'AI 绘图', path: '/image-generation' },
      { key: 'music-generation', label: '音乐生成', icon: <AutoFixHighIcon sx={{ fontSize: 18 }} />, description: 'AI 作曲', path: '/music-generation' },
      { key: 'video-generation', label: '视频生成', icon: <WebIcon sx={{ fontSize: 18 }} />, description: 'AI 视频创作', path: '/video-generation' },
      { key: 'media-library', label: '媒体库', icon: <StorageIcon sx={{ fontSize: 18 }} />, description: '资产管理', path: '/media-library' },
      { key: 'media-tools', label: '媒体工具', icon: <LanguageOutlinedIcon sx={{ fontSize: 18 }} />, description: '媒体 & 链接理解', path: '/media-tools' },
    ],
  },
  {
    key: 'system-group',
    label: '系统',
    icon: <MonitorHeartIcon sx={{ fontSize: 20 }} />,
    description: '设备 · 监控 · 权限',
    children: [
      { key: 'pairing', label: '设备配对', icon: <PhonelinkIcon sx={{ fontSize: 18 }} />, description: 'Pairing', path: '/pairing' },
      { key: 'monitoring', label: '监控中心', icon: <HubIcon sx={{ fontSize: 18 }} />, description: '进程 · 节点 · 集成', path: '/monitoring' },
      { key: 'observabilityCenter', label: '系统可观测性', icon: <MonitorHeartIcon sx={{ fontSize: 18 }} />, description: '指标 · 审计 · 事件账本', path: '/observability-center' },
      { key: 'permissions', label: '权限管理', icon: <SecurityIcon sx={{ fontSize: 18 }} />, description: '屏幕录制 · 辅助功能 · 全盘访问', path: '/permissions' },
    ],
  },
  {
    key: 'triggers',
    label: '触发 & 通知',
    icon: <NotificationsActiveOutlinedIcon sx={{ fontSize: 20 }} />,
    description: '触发·关键词·Webhook',
    children: [
      { key: 'triggers-list', label: '触发器', icon: <TimerIcon sx={{ fontSize: 18 }} />, description: '事件触发', path: '/triggers' },
      { key: 'keyword-trigger', label: '关键词触发', icon: <FlashOnIcon sx={{ fontSize: 18 }} />, description: '触发配置', path: '/keyword-trigger' },
      { key: 'webhook', label: 'Webhook', icon: <WebhookIcon sx={{ fontSize: 18 }} />, description: '钩子管理', path: '/webhook' },
    ],
  },
  {
    key: 'devTools',
    label: '开发工具',
    icon: <CodeOutlinedIcon sx={{ fontSize: 20 }} />,
    description: 'Git·索引·LSP·任务',
    children: [
      { key: 'git', label: 'Git 管理', icon: <GitHubIcon sx={{ fontSize: 18 }} />, description: '版本控制', path: '/git' },
      { key: 'code-index', label: '代码索引', icon: <CodeOutlinedIcon sx={{ fontSize: 18 }} />, description: '符号搜索', path: '/code-index' },
      { key: 'lsp', label: 'LSP 服务器', icon: <LanguageOutlinedIcon sx={{ fontSize: 18 }} />, description: '语言服务', path: '/lsp' },
      { key: 'tasks', label: '任务管理', icon: <TaskAltIcon sx={{ fontSize: 18 }} />, description: 'CRUD 管理', path: '/tasks' },
      { key: 'browser-profiles', label: '浏览器配置', icon: <PublicIcon sx={{ fontSize: 18 }} />, description: '浏览器管理', path: '/browser-profiles' },
    ],
  },
  {
    key: 'knowledge',
    label: '知识 & 记忆',
    icon: <BookOutlinedIcon sx={{ fontSize: 20 }} />,
    description: 'Wiki·消息·缓存·记忆·文档',
    children: [
      { key: 'wiki', label: 'Wiki 知识库', icon: <BookOutlinedIcon sx={{ fontSize: 18 }} />, description: '知识管理', path: '/wiki' },
      { key: 'memory', label: '记忆', icon: <StorageIcon sx={{ fontSize: 18 }} />, description: '记忆管理', path: '/memory' },
      { key: 'message-lifecycle', label: '消息生命周期', icon: <TrackChangesIcon sx={{ fontSize: 18 }} />, description: '生命周期监控', path: '/message-lifecycle' },
      { key: 'cache-manager', label: '缓存管理', icon: <StorageIcon sx={{ fontSize: 18 }} />, description: '缓存管理', path: '/cache-manager' },
      { key: 'tencent-docs', label: '腾讯文档', icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />, description: '在线文档', path: '/tencent-docs' },
    ],
  },
  {
    key: 'wms',
    label: '仓储管理',
    icon: <WarehouseOutlinedIcon sx={{ fontSize: 20 }} />,
    description: '仓库·在途·库存',
    children: [
      { key: 'dashboard', label: '仪表盘', icon: <DashboardOutlinedIcon sx={{ fontSize: 18 }} />, description: '总览', path: '/dashboard' },
      { key: 'warehouses', label: '仓库管理', icon: <FolderOutlinedIcon sx={{ fontSize: 18 }} />, description: '仓库列表', path: '/warehouses' },
      { key: 'partners', label: '客商管理', icon: <GroupsOutlinedIcon sx={{ fontSize: 18 }} />, description: '供应商 & 客户', path: '/partners' },
      { key: 'in-transit', label: '在途管理', icon: <LocalShippingOutlinedIcon sx={{ fontSize: 18 }} />, description: '在途跟踪', path: '/in-transit' },
      { key: 'inventory', label: '库存管理', icon: <InventoryOutlinedIcon sx={{ fontSize: 18 }} />, description: '库存查询', path: '/inventory' },
      { key: 'transfer', label: '仓库调拨', icon: <SwapHorizIcon sx={{ fontSize: 18 }} />, description: '多仓调拨', path: '/transfer' },
      { key: 'inventory-transactions', label: '库存交易', icon: <ArrowUpwardIcon sx={{ fontSize: 18 }} />, description: '流水记录', path: '/inventory-transactions' },
      { key: 'wms-quality', label: '入库质检', icon: <FactCheckOutlinedIcon sx={{ fontSize: 18 }} />, description: '质检管理', path: '/wms/quality' },
      { key: 'wms-inventory', label: '库存盘点', icon: <FindInPageOutlinedIcon sx={{ fontSize: 18 }} />, description: '盘点管理', path: '/wms/inventory' },
      { key: 'wms-outbound', label: '出库复核', icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 18 }} />, description: '复核管理', path: '/wms/outbound' },
      { key: 'wms-alerts', label: '预警 & 补货', icon: <NotificationsActiveOutlinedIcon sx={{ fontSize: 18 }} />, description: '预警中心 & 智能补货', path: '/wms/alerts' },
      { key: 'reports', label: '报表', icon: <AssessmentOutlinedIcon sx={{ fontSize: 18 }} />, description: '数据报表 & 报表中心', path: '/reports' },
    ],
  },
  { key: 'about', label: '关于', icon: <StaffdeckIcon name="info" sx={{ fontSize: 20 }} />, description: '系统信息与版本', tab: 'about' },
];
