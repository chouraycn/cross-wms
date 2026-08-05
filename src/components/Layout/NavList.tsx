import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Typography,
  Box,
  Tooltip,
  Collapse,
  IconButton,
  TextField,
  useTheme,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useChatSidebar } from '../../contexts/ChatContext';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import WebIcon from '@mui/icons-material/Web';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ImageIcon from '@mui/icons-material/Image';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import PhonelinkIcon from '@mui/icons-material/Phonelink';
import HubIcon from '@mui/icons-material/Hub';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import OutboxOutlinedIcon from '@mui/icons-material/OutboxOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import FolderSharedOutlinedIcon from '@mui/icons-material/FolderSharedOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { getGrayScale } from '../../constants/theme';
import { Session } from '../../types/chat';
// StaffDeck 程序化图标（currentColor 主题化，与 NavList 文字色联动）
import StaffdeckIcon from '../staff/StaffdeckIcon';

// ===================== Helpers =====================

function getRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}个月前`;
  return `${Math.floor(month / 12)}年前`;
}

// ===================== Nav Item Types =====================

interface NavItemLeaf {
  label: string;
  path: string;
  icon: React.ReactNode;
  desc?: string;
  /** StaffDeck iframe 内部路由（如 /enterprise/agents），点击后通过 postMessage 导航 iframe */
  staffdeckRoute?: string;
  /** 打开主程序设置弹窗（不使用 iframe 导航，避免弹窗被裁剪），传入初始 tab */
  openSettingsDialog?: { mainTab?: 'basic' | 'ai' | 'tools' | 'system' | 'comms'; subTab?: 'model' | 'chat' | 'agents' | 'soul' | 'goals' | 'mcp' | 'lsp' | 'image' | 'secrets' | 'git' | 'auth' | 'context' | 'talk' | 'channels' };
}

interface NavItemGroup {
  label: string;
  icon: React.ReactNode;
  desc?: string;
  children: NavItemLeaf[];
  /** 分组自身的跳转路径（点击分组标题时导航到此路径） */
  path?: string;
  /** StaffDeck iframe 内部路由（分组标题点击后通过 postMessage 导航 iframe） */
  staffdeckRoute?: string;
}

type NavItem = NavItemLeaf | NavItemGroup;

function isGroup(item: NavItem): item is NavItemGroup {
  return 'children' in item;
}

// ===================== 轻量虚拟滚动列表 =====================
// 仅在 item 数超过阈值时启用，减少 DOM 节点数，避免卡顿
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

function VirtualList<T>({ items, itemHeight, height, renderItem, overscan = 5 }: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + height) / itemHeight) + overscan,
  );

  const visibleItems = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      result.push(
        <div key={i} style={{ position: 'absolute', top: i * itemHeight, left: 0, right: 0, height: itemHeight }}>
          {renderItem(items[i], i)}
        </div>,
      );
    }
    return result;
  }, [items, startIndex, endIndex, itemHeight, renderItem]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height, overflow: 'auto', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems}
      </div>
    </div>
  );
}

// ===================== Nav Items Config =====================

const navItems: NavItem[] = [
  { label: 'AI 对话', path: '/chat', icon: <StaffdeckIcon name="chat" size={18} />, desc: '智能助手' },
  { label: '技能', path: '/skills', icon: <StaffdeckIcon name="spark" size={18} />, desc: '能力管理' },
  {
    label: '员工',
    icon: <StaffdeckIcon name="user" size={18} />,
    desc: '数字员工',
    children: [
      { label: '数字员工广场', path: '/staffdeck', icon: <PublicOutlinedIcon />, desc: '广场', staffdeckRoute: '/workspace/gallery' },
      { label: '我的员工', path: '/staffdeck', icon: <PeopleOutlineIcon />, desc: '管理', staffdeckRoute: '/enterprise/agents' },
      { label: '员工档案', path: '/staffdeck', icon: <AccountCircleOutlinedIcon />, desc: '档案', staffdeckRoute: '/enterprise/dashboard' },
      { label: '对话', path: '/staffdeck', icon: <ForumOutlinedIcon />, desc: '会话', staffdeckRoute: '/workspace/chat' },
      { label: '知识库', path: '/staffdeck', icon: <FolderSharedOutlinedIcon />, desc: '知识', staffdeckRoute: '/enterprise/knowledge' },
      { label: '技能', path: '/staffdeck', icon: <AutoAwesomeOutlinedIcon />, desc: '技能', staffdeckRoute: '/enterprise/general-skills' },
      { label: 'SOP', path: '/staffdeck', icon: <AssignmentOutlinedIcon />, desc: 'SOP', staffdeckRoute: '/enterprise/skills' },
      { label: '工具', path: '/staffdeck', icon: <BuildOutlinedIcon />, desc: '工具', staffdeckRoute: '/enterprise/tools' },
      { label: '定时任务', path: '/staffdeck', icon: <ScheduleOutlinedIcon />, desc: '调度', staffdeckRoute: '/enterprise/scheduled-tasks' },
      { label: '记忆', path: '/staffdeck', icon: <HistoryOutlinedIcon />, desc: '记忆', staffdeckRoute: '/enterprise/memories' },
      { label: '对话日志', path: '/staffdeck', icon: <ForumOutlinedIcon />, desc: '日志', staffdeckRoute: '/enterprise/feedback' },
      { label: '渠道接入', path: '/staffdeck', icon: <PublicOutlinedIcon />, desc: '渠道', staffdeckRoute: '/enterprise/channels' },
      { label: '账号管理', path: '/staffdeck', icon: <AccountCircleOutlinedIcon />, desc: '账号', staffdeckRoute: '/enterprise/accounts' },
      { label: '模型配置', path: '/staffdeck', icon: <TuneOutlinedIcon />, desc: '模型', openSettingsDialog: { mainTab: 'basic', subTab: 'model' } },
    ],
  },
  {
    // 仓库员工 = 仓库专属数字员工(AI 对话) + 7 大 WMS 管理能力，
    // 整合为统一入口：点击分组标题进入仓库员工 AI 对话，
    // 展开后可访问入库/出库/库存/补货/质检/预警/报表。
    label: '仓库员工',
    icon: <WarehouseOutlinedIcon />,
    desc: 'AI · 仓储',
    path: '/warehouse-staff',
    children: [
      { label: '入库管理', path: '/wms/inbound', icon: <MoveToInboxOutlinedIcon />, desc: '收货 & 上架' },
      { label: '出库管理', path: '/wms/outbound', icon: <OutboxOutlinedIcon />, desc: '拣货 & 发运' },
      { label: '库存管理', path: '/wms/inventory', icon: <Inventory2OutlinedIcon />, desc: '库存台账' },
      { label: '补货计划', path: '/wms/replenishment', icon: <AutorenewOutlinedIcon />, desc: '补货建议' },
      { label: '质检管理', path: '/wms/quality', icon: <FactCheckOutlinedIcon />, desc: '质量检验' },
      { label: '库存预警', path: '/wms/alerts', icon: <WarningAmberOutlinedIcon />, desc: '异常提醒' },
      { label: '仓储报表', path: '/wms/reports', icon: <AssessmentOutlinedIcon />, desc: '数据分析' },
    ],
  },
  { label: '自动化', path: '/automation', icon: <StaffdeckIcon name="clock" size={18} />, desc: '任务 & 调度' },
  {
    label: '创作',
    icon: <StaffdeckIcon name="image" size={18} />,
    desc: '图像 · 音乐 · 视频',
    children: [
      { label: '图像生成', path: '/image-generation', icon: <ImageIcon />, desc: 'AI 绘图' },
      { label: '音乐生成', path: '/music-generation', icon: <AutoFixHighIcon />, desc: 'AI 作曲' },
      { label: '视频生成', path: '/video-generation', icon: <WebIcon />, desc: 'AI 视频创作' },
      { label: '媒体库', path: '/media-library', icon: <StorageIcon />, desc: '资产管理' },
      { label: '媒体工具', path: '/media-tools', icon: <LanguageOutlinedIcon />, desc: '媒体 & 链接理解' },
    ],
  },
  {
    label: '系统',
    icon: <SettingsOutlinedIcon />,
    desc: '设置 · 监控',
    children: [
      { label: '语音合成', path: '/tts', icon: <RecordVoiceOverIcon />, desc: 'TTS 设置' },
      { label: '设备配对', path: '/pairing', icon: <PhonelinkIcon />, desc: 'Pairing' },
      // 2026-08-05：进程/节点/集成三页整合为「监控中心」统一入口
      { label: '监控中心', path: '/monitoring', icon: <HubIcon />, desc: '进程 · 节点 · 集成' },
    ],
  },
];

// ===================== Props =====================

interface NavListProps {
  collapsed: boolean;
  activePath: string;
  onNavigate: (path: string) => void;
  /** 当前选中的聊天会话 ID */
  activeSessionId: string;
  /** 选中历史会话的回调 */
  onSelectSession: (sessionId: string) => void;
  /** 删除历史会话的回调 */
  onDeleteSession: (sessionId: string) => void;
  /** 加载历史/归档会话上下文但不跳转（任务 4） */
  onLoadSessionContext?: (sessionId: string) => void;
}

// ===================== Component =====================

const NavList: React.FC<NavListProps> = ({
  collapsed,
  activePath,
  onNavigate,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onLoadSessionContext,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 分组展开状态 — 初始根据当前路由自动展开活跃分组
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of navItems) {
      if (!isGroup(item)) continue;
      const selfActive = item.path && activePath.startsWith(item.path);
      const childActive = item.children.some((c) => activePath.startsWith(c.path));
      if (selfActive || childActive) initial[item.label] = true;
    }
    return initial;
  });

  // 路由变化时自动展开活跃分组
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      for (const item of navItems) {
        if (!isGroup(item)) continue;
        const selfActive = item.path && activePath.startsWith(item.path);
        const childActive = item.children.some((c) => activePath.startsWith(c.path));
        if (selfActive || childActive) next[item.label] = true;
      }
      return next;
    });
  }, [activePath]);

  // 聊天历史 — 从 ChatSidebarContext 获取（不随流式消息更新）
  const {
    sessions,
    handleDeleteSession: deleteSessionFromContext,
    togglePinSession,
    archiveSession: archiveSessionFromContext,
    archivedSessions,
    archivedSessionsTotal,
    isLoadingArchived,
    loadMoreArchivedSessions,
    setActiveSessionId,
  } = useChatSidebar();
  const historyListRef = useRef<HTMLDivElement>(null);
  const archivedListRef = useRef<HTMLDivElement>(null);

  // 即时选中状态：点击时立即切换视觉反馈，不等待父组件 state 传播
  const [justClickedSessionId, setJustClickedSessionId] = useState<string | null>(null);

  // 父组件 activeSessionId 更新后，清除本地即时状态
  useEffect(() => {
    if (justClickedSessionId && justClickedSessionId === activeSessionId) {
      setJustClickedSessionId(null);
    }
  }, [activeSessionId, justClickedSessionId]);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSessionFromContext(sessionId);
    onDeleteSession(sessionId);
  }, [deleteSessionFromContext, onDeleteSession]);

  const chatSessions = sessions;

  // v6.0: 仅显示活跃会话（归档会话不在此列表中）
  const activeSessions = chatSessions.filter(s => s.status !== 'archived' && s.status !== 'daily_reset');

  // 置顶优先 + 最近更新排序
  const sortedSessions = useMemo(() => {
    return [...activeSessions].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [activeSessions]);

  // v6.0: 归档会话排序
  const sortedArchivedSessions = useMemo(() => {
    return [...archivedSessions].sort((a, b) => {
      const aTime = new Date(a.archivedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.archivedAt || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [archivedSessions]);

  // v6.0: 归档区展开状态
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // 展开归档区时自动加载第一页
  useEffect(() => {
    if (archivedExpanded && archivedSessions.length === 0 && !isLoadingArchived) {
      loadMoreArchivedSessions();
    }
  }, [archivedExpanded, archivedSessions.length, isLoadingArchived, loadMoreArchivedSessions]);

  // 归档列表滚动触底时加载更多
  const handleArchivedScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 60;
    if (nearBottom && !isLoadingArchived && archivedSessions.length < archivedSessionsTotal) {
      loadMoreArchivedSessions();
    }
  }, [isLoadingArchived, archivedSessions.length, archivedSessionsTotal, loadMoreArchivedSessions]);

  // 点击导航项时清除历史对话的即时选中状态
  const handleNavClick = useCallback((path: string) => {
    setJustClickedSessionId(null);
    onNavigate(path);
  }, [onNavigate]);

  // StaffDeck 子导航：通过 postMessage 驱动 iframe 内部路由
  const handleStaffdeckNav = useCallback((route: string) => {
    setJustClickedSessionId(null);
    // 确保主路由停留在 /staffdeck（iframe 可见）
    if (activePath !== '/staffdeck') {
      onNavigate('/staffdeck');
    }
    // 延迟发送，确保 iframe 已可见
    setTimeout(() => {
      window.postMessage({ type: 'STAFFDECK_NAVIGATE', route }, '*');
    }, activePath !== '/staffdeck' ? 200 : 0);
  }, [activePath, onNavigate]);

  // 跟踪 iframe 当前 StaffDeck 路由（用于高亮子项）
  const [activeStaffdeckRoute, setActiveStaffdeckRoute] = useState<string>('');
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'STAFFDECK_ROUTE_CHANGE' && e.data?.route) {
        setActiveStaffdeckRoute(e.data.route);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ====== StaffDeck 数字员工对话历史 ======
  interface StaffSession {
    id: string;
    title: string | null;
    agent_id: string | null;
    status: string;
    updated_at: string;
  }
  const [staffSessions, setStaffSessions] = useState<StaffSession[]>([]);
  const [staffSessionsExpanded, setStaffSessionsExpanded] = useState(true);
  const [staffSearch, setStaffSearch] = useState('');
  // 置顶集合（持久化到 localStorage）
  const [staffPinned, setStaffPinned] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('cdfknow-staff-pinned');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  // iframe 当前激活的员工会话 ID（双向高亮）
  const [activeStaffSessionId, setActiveStaffSessionId] = useState<string>('');

  // 持久化置顶集合
  useEffect(() => {
    try {
      localStorage.setItem('cdfknow-staff-pinned', JSON.stringify(Array.from(staffPinned)));
    } catch { /* ignore */ }
  }, [staffPinned]);

  // 删除员工会话
  const handleDeleteStaffSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/staffdeck/chat/sessions/${sessionId}?tenant_id=default`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStaffSessions(prev => prev.filter(s => s.id !== sessionId));
        setStaffPinned(prev => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    } catch { /* ignore */ }
  }, []);

  // 切换置顶
  const toggleStaffPin = useCallback((sessionId: string) => {
    setStaffPinned(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchStaffSessions = async () => {
      try {
        const res = await fetch('/api/staffdeck/chat/sessions?tenant_id=default');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.code === 0 && Array.isArray(json.data)) {
          setStaffSessions(json.data.slice(0, 50));
        }
      } catch { /* ignore */ }
    };
    fetchStaffSessions();
    // 每 30 秒刷新一次
    const timer = setInterval(fetchStaffSessions, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // 监听 iframe 路由变化,提取 /workspace/chat/:sessionId 实现「iframe→侧边栏」高亮
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'STAFFDECK_ROUTE_CHANGE') return;
      const route: string = e.data?.route || '';
      const m = route.match(/^\/workspace\/chat\/(.+)$/);
      setActiveStaffSessionId(m ? m[1] : '');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 员工会话排序：置顶优先 + 最近更新
  const sortedStaffSessions = useMemo(() => {
    return [...staffSessions].sort((a, b) => {
      const pa = staffPinned.has(a.id) ? 1 : 0;
      const pb = staffPinned.has(b.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [staffSessions, staffPinned]);

  // 搜索过滤
  const filteredStaffSessions = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return sortedStaffSessions;
    return sortedStaffSessions.filter(s => (s.title || '新对话').toLowerCase().includes(q));
  }, [sortedStaffSessions, staffSearch]);

  // 跳转到员工会话
  const navigateToStaffSession = useCallback((sessionId: string) => {
    if (activePath !== '/staffdeck') {
      onNavigate('/staffdeck');
    }
    setTimeout(() => {
      window.postMessage({ type: 'STAFFDECK_NAVIGATE', route: `/workspace/chat/${sessionId}` }, '*');
    }, activePath !== '/staffdeck' ? 200 : 0);
  }, [activePath, onNavigate]);

  // 有历史会话选中且历史列表不为空时，"AI 对话"不显示激活态（白条让给历史对话项）
  const activeSessionHasMessages = useMemo(
    () => chatSessions.some((s) => s.id === activeSessionId),
    [chatSessions, activeSessionId]
  );
  const isChatWithSession = activeSessionId && activePath === '/chat' && activeSessionHasMessages;

  const isActive = (path: string) => {
    if (path === '/chat' && isChatWithSession) return false;
    // StaffDeck 模块入口：任何 /enterprise/* /staff/* /workspace/* 路径都高亮
    if (path === '/enterprise/dashboard') {
      return (
        activePath.startsWith('/enterprise/') ||
        activePath.startsWith('/staff/') ||
        activePath.startsWith('/workspace/')
      );
    }
    return activePath.startsWith(path);
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // 检查分组内是否有活跃项（含分组自身路径）
  const isGroupActive = (group: NavItemGroup) => {
    if (group.path && isActive(group.path)) return true;
    return group.children.some((child) =>
      child.staffdeckRoute
        ? activePath === '/staffdeck'
        : isActive(child.path)
    );
  };

  // 统一灰阶（从 theme.ts 获取）
  const bgActive = gs.bgActive;
  const bgActiveHover = isDark ? '#333333' : '#F9FAFB';
  const bgHover = gs.bgHover;
  const textActive = gs.textPrimary;
  const textNormal = gs.textSecondary;
  const textSecondary = gs.textMuted;
  const textMuted = gs.textDisabled;
  const iconActive = gs.textPrimary;
  const iconNormal = gs.textMuted;

  // ===== AI 完成标记（v1.9.3） =====
  // 使用 ref 代替 useState，避免触发组件重渲染
  const completedSessionsRef = useRef<Set<string>>(new Set());
  const prevSessionsRef = useRef<Session[]>(sessions);

  React.useEffect(() => {
    const prev = prevSessionsRef.current;
    let changed = false;
    for (const session of sessions) {
      if (completedSessionsRef.current.has(session.id)) continue;
      const prevSession = prev.find(s => s.id === session.id);
      if (!prevSession) continue;
      const prevLast = prevSession.messages[prevSession.messages.length - 1];
      const currLast = session.messages[session.messages.length - 1];
      if (
        prevLast?.role === 'assistant' && prevLast?.isStreaming &&
        currLast?.role === 'assistant' && !currLast?.isStreaming
      ) {
        completedSessionsRef.current.add(session.id);
        changed = true;
      }
    }
    prevSessionsRef.current = sessions;
    if (changed) {
      // 强制重新渲染以显示完成标记
      setJustClickedSessionId(justClickedSessionId);
    }
  }, [sessions, justClickedSessionId]);

  const clearCompletedFlag = useCallback((sessionId: string) => {
    completedSessionsRef.current.delete(sessionId);
    setJustClickedSessionId(justClickedSessionId);
  }, [justClickedSessionId]);

  // ===== 渲染单个会话项 =====
  const renderSessionItem = useCallback((session: Session) => {
    const rawTitle = session.title === '新对话' ? '' : (session.title || '');
    const title = (session.parentSessionId ? '└ ' : '') + (rawTitle || session.messages[0]?.content?.slice(0, 20) || '新对话');
    const effectiveActiveId = justClickedSessionId ?? activeSessionId;
    const isSessionActive = session.id === effectiveActiveId;
    const isPinned = session.isPinned === true;
    const relativeTime = getRelativeTime(session.updatedAt || session.createdAt);

    const lastMsg = session.messages[session.messages.length - 1];
    const isThinking = lastMsg?.role === 'assistant' && lastMsg?.isStreaming === true;
    const showCompleted = completedSessionsRef.current.has(session.id) && !isThinking;

    return (
      <ListItem
        key={session.id}
        disablePadding
        sx={{ display: 'block' }}
      >
        <ListItemButton
          onClick={() => {
            setJustClickedSessionId(session.id);
            // 先加载会话消息上下文
            onLoadSessionContext?.(session.id);
            // 然后切换 activeSessionId 并导航到聊天页面
            onSelectSession(session.id);
          }}
          sx={{
            minHeight: 32,
            px: 1.5,
            py: 0.25,
            borderRadius: '6px',
            backgroundColor: isSessionActive ? bgActive : 'transparent',
            '&:hover': {
              backgroundColor: isSessionActive ? bgActiveHover : bgHover,
              '& .session-actions': { opacity: 1 },
              '& .session-time': { opacity: 0 },
            },
          }}
        >
          <Typography
            sx={{
              fontSize: '0.7rem',
              fontWeight: isSessionActive ? 500 : 400,
              color: isSessionActive ? textActive : textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
              lineHeight: '28px',
            }}
          >
            {title}
          </Typography>
          {/* AI 思考 / 完成指示器 */}
          {isThinking && (
            <CircularProgress size={12} thickness={3} sx={{ color: '#F59E0B', mr: 0.5 }} />
          )}
          {!isThinking && showCompleted && (
            <Tooltip title="AI 已完成回复" placement="right">
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  clearCompletedFlag(session.id);
                }}
                sx={{
                  display: 'flex', alignItems: 'center', cursor: 'pointer', mr: 0.5,
                  transition: 'opacity 0.2s',
                  '&:hover': { opacity: 0.6 },
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 12, color: '#22C55E' }} />
              </Box>
            </Tooltip>
          )}
          {/* 右侧区：时间正常显示，hover 时按钮覆盖在时间上方 */}
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', flexShrink: 0, position: 'relative' }}>
            {relativeTime && (
              <Typography
                className="session-time"
                sx={{
                  fontSize: '0.6rem',
                  fontWeight: 400,
                  color: textMuted,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  lineHeight: '28px',
                  transition: 'opacity 0.15s',
                }}
              >
                {relativeTime}
              </Typography>
            )}
            <Box
              className="session-actions"
              sx={{
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0,
                transition: 'opacity 0.15s',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Tooltip title={isPinned ? '取消置顶' : '置顶'} placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinSession(session.id);
                  }}
                  sx={{
                    p: 0.25,
                    color: isPinned ? '#F59E0B' : gs.textMuted,
                    '&:hover': { color: isPinned ? '#D97706' : gs.textPrimary },
                  }}
                >
                  <PushPinOutlinedIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="归档" placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveSessionFromContext(session.id);
                  }}
                  sx={{
                    p: 0.25,
                    color: gs.textMuted,
                    '&:hover': { color: '#8B5CF6' },
                  }}
                >
                  <Inventory2OutlinedIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="删除" placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteSession(e, session.id);
                  }}
                  sx={{
                    p: 0.25,
                    color: gs.textMuted,
                    '&:hover': { color: '#EF4444' },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </ListItemButton>
      </ListItem>
    );
  }, [justClickedSessionId, activeSessionId, bgActive, bgActiveHover, bgHover, textActive, textSecondary, textMuted, gs, setActiveSessionId, onSelectSession, togglePinSession, handleDeleteSession, archiveSessionFromContext, clearCompletedFlag]);

  return (
    <List
      sx={{
        pt: 1,
        px: collapsed ? 0.5 : 1,
        flex: 1,
        overflow: 'auto',
        overscrollBehaviorY: 'none',
        WebkitOverflowScrolling: 'auto',
      }}
      // v1.5.107: 排除导航区域出窗口拖拽（父 Sidebar 已设 WebkitAppRegion:drag）
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {navItems.map((item) => {
        // ====== 分组项 ======
        if (isGroup(item)) {
          const expanded = expandedGroups[item.label] ?? false;
          const groupActive = isGroupActive(item);

          if (collapsed) {
            // 收起模式：显示分组图标，点击导航到分组自身路径或第一个子项
            const navTarget = item.path
              ? { path: item.path, staffdeckRoute: item.staffdeckRoute, openSettingsDialog: undefined }
              : { path: item.children[0].path, staffdeckRoute: item.children[0].staffdeckRoute, openSettingsDialog: item.children[0].openSettingsDialog };
            return (
              <Tooltip key={item.label} title={item.label} placement="right" arrow>
                <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => {
                      if (navTarget.openSettingsDialog) {
                        window.dispatchEvent(new CustomEvent('cdf-open-ai-settings-dialog', { detail: navTarget.openSettingsDialog }));
                      } else if (navTarget.staffdeckRoute) {
                        handleStaffdeckNav(navTarget.staffdeckRoute);
                      } else {
                        handleNavClick(navTarget.path);
                      }
                    }}
                    sx={{
                      minHeight: 40,
                      justifyContent: 'center',
                      px: 0,
                      borderRadius: '6px',
                      '&:hover': { backgroundColor: bgHover },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: groupActive ? iconActive : iconNormal }}>
                      {React.cloneElement(item.icon as React.ReactElement, {
                        sx: { fontSize: '20px' },
                      })}
                    </ListItemIcon>
                  </ListItemButton>
                </ListItem>
              </Tooltip>
            );
          }

          // 展开模式：可折叠分组（若分组有 path，点击标题同时导航）
          return (
            <Box key={item.label} sx={{ mb: 0.5 }}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => {
                    toggleGroup(item.label);
                    if (item.path || item.staffdeckRoute) {
                      if (item.staffdeckRoute) {
                        handleStaffdeckNav(item.staffdeckRoute);
                      } else if (item.path) {
                        handleNavClick(item.path);
                      }
                    }
                  }}
                  sx={{
                    minHeight: 36,
                    px: 1.5,
                    py: 0.25,
                    borderRadius: '6px',
                    '&:hover': { backgroundColor: bgHover },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center', color: groupActive ? iconActive : iconNormal }}>
                    {React.cloneElement(item.icon as React.ReactElement, {
                      sx: { fontSize: '18px' },
                    })}
                  </ListItemIcon>
                  <Typography
                    sx={{
                      fontSize: '0.8125rem',
                      fontWeight: groupActive ? 500 : 400,
                      color: groupActive ? textActive : textNormal,
                      flex: 1,
                      lineHeight: '36px',
                    }}
                  >
                    {item.label}
                  </Typography>
                  {item.desc && !collapsed && (
                    <Typography
                      sx={{
                        fontSize: '0.625rem',
                        color: textMuted,
                        mr: 0.5,
                        lineHeight: '36px',
                        flexShrink: 0,
                      }}
                    >
                      {item.desc}
                    </Typography>
                  )}
                  {expanded ? (
                    <ExpandLessIcon sx={{ fontSize: 16, color: textMuted }} />
                  ) : (
                    <ExpandMoreIcon sx={{ fontSize: 16, color: textMuted }} />
                  )}
                </ListItemButton>
              </ListItem>
              <Collapse in={expanded} timeout="auto">
                <List sx={{ py: 0, pl: 2.5 }}>
                  {item.children.map((child) => {
                    const childActive = child.openSettingsDialog
                      ? false
                      : child.staffdeckRoute
                        ? activeStaffdeckRoute === child.staffdeckRoute
                        : isActive(child.path);
                    return (
                      <ListItem key={child.label} disablePadding sx={{ display: 'block' }}>
                        <ListItemButton
                          onClick={() => {
                            if (child.openSettingsDialog) {
                              window.dispatchEvent(new CustomEvent('cdf-open-ai-settings-dialog', { detail: child.openSettingsDialog }));
                            } else if (child.staffdeckRoute) {
                              handleStaffdeckNav(child.staffdeckRoute);
                            } else {
                              handleNavClick(child.path);
                            }
                          }}
                        sx={{
                          minHeight: 32,
                          px: 1,
                          py: 0.25,
                          borderRadius: '6px',
                          backgroundColor: childActive ? bgActive : 'transparent',
                          '&:hover': {
                            backgroundColor: childActive ? bgActiveHover : bgHover,
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 0, mr: 1, justifyContent: 'center', color: childActive ? iconActive : iconNormal }}>
                          {React.cloneElement(child.icon as React.ReactElement, {
                            sx: { fontSize: '16px' },
                          })}
                        </ListItemIcon>
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: childActive ? 500 : 400,
                            color: childActive ? textActive : textNormal,
                            lineHeight: '28px',
                          }}
                        >
                          {child.label}
                        </Typography>
                        {child.desc && (
                          <Typography
                            sx={{
                              fontSize: '0.625rem',
                              color: textMuted,
                              ml: 'auto',
                              lineHeight: '28px',
                              flexShrink: 0,
                            }}
                          >
                            {child.desc}
                          </Typography>
                        )}
                      </ListItemButton>
                    </ListItem>
                  );
                })}
                </List>
              </Collapse>
            </Box>
          );
        }

        // ====== 普通导航项 ======
        const active = isActive(item.path);

        if (collapsed) {
          return (
            <Tooltip key={item.path} title={item.label} placement="right" arrow>
              <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
                <ListItemButton
                  onClick={() => {
                    if (item.path === '/chat') {
                      handleNavClick(item.path);
                      window.dispatchEvent(new CustomEvent('cdf-know-clow-clear-session'));
                      window.dispatchEvent(new CustomEvent('cdf-know-clow-navigate-chat'));
                      if (activePath === '/chat' || activePath.startsWith('/chat')) {
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('cdf-know-clow-navigate-chat'));
                        }, 0);
                      }
                    } else {
                      handleNavClick(item.path);
                    }
                  }}
                  sx={{
                    minHeight: 40,
                    justifyContent: 'center',
                    px: 0,
                    borderRadius: '6px',
                    backgroundColor: active ? bgActive : 'transparent',
                    '&:hover': {
                      backgroundColor: active ? bgActiveHover : bgHover,
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: active ? iconActive : iconNormal }}>
                    {React.cloneElement(item.icon as React.ReactElement, {
                      sx: { fontSize: '18px' },
                    })}
                  </ListItemIcon>
                </ListItemButton>
              </ListItem>
            </Tooltip>
          );
        }

        // 展开模式普通项
        return (
          <React.Fragment key={item.path}>
            <ListItem disablePadding sx={{ display: 'block', mb: 0.5 }}>
              <ListItemButton
                onClick={() => {
                  if (item.path === '/chat') {
                    handleNavClick(item.path);
                    window.dispatchEvent(new CustomEvent('cdf-know-clow-clear-session'));
                    window.dispatchEvent(new CustomEvent('cdf-know-clow-navigate-chat'));
                    if (activePath === '/chat' || activePath.startsWith('/chat')) {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('cdf-know-clow-navigate-chat'));
                      }, 0);
                    }
                  } else {
                    handleNavClick(item.path);
                  }
                }}
                sx={{
                  minHeight: 36,
                  px: 1.5,
                  py: 0.25,
                  borderRadius: '6px',
                  backgroundColor: active ? bgActive : 'transparent',
                  '&:hover': {
                    backgroundColor: active ? bgActiveHover : bgHover,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center', color: active ? iconActive : iconNormal }}>
                  {React.cloneElement(item.icon as React.ReactElement, {
                    sx: { fontSize: '16px' },
                  })}
                </ListItemIcon>
                <Typography
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: active ? 500 : 400,
                    color: active ? textActive : textNormal,
                    lineHeight: '36px',
                    flex: 1,
                  }}
                >
                  {item.label}
                </Typography>
                {'desc' in item && item.desc && (
                  <Typography
                    sx={{
                      fontSize: '0.625rem',
                      color: textMuted,
                      lineHeight: '36px',
                      flexShrink: 0,
                    }}
                  >
                    {item.desc}
                  </Typography>
                )}
              </ListItemButton>
            </ListItem>
          </React.Fragment>
        );
      })}

      {/* ====== 历史对话 ====== */}
      {!collapsed && sortedSessions.length > 0 && (
        <Box ref={historyListRef} sx={{ mt: 0.5, pt: 1, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, mb: 0.25, flexShrink: 0 }}>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: gs.textMuted,
                letterSpacing: '0.02em',
              }}
            >
              历史对话
              <Box
                component="span"
                sx={{
                  ml: 0.75,
                  fontSize: '0.625rem',
                  fontWeight: 500,
                  color: gs.textDisabled,
                }}
              >
                {sortedSessions.length}
              </Box>
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden', maxHeight: 280 }}>
            {sortedSessions.length <= 30 ? (
              sortedSessions.map((s) => renderSessionItem(s))
            ) : (
              <VirtualList
                items={sortedSessions}
                itemHeight={32}
                height={280}
                renderItem={(s) => renderSessionItem(s)}
              />
            )}
          </Box>
        </Box>
      )}

      {/* ====== 员工对话历史 ====== */}
      {!collapsed && staffSessions.length > 0 && (
        <Box sx={{ mt: 0.5, pt: 1, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
          <ListItemButton
            onClick={() => setStaffSessionsExpanded(prev => !prev)}
            sx={{
              minHeight: 28,
              px: 1.5,
              py: 0,
              borderRadius: '4px',
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: gs.textMuted,
                letterSpacing: '0.02em',
                flex: 1,
              }}
            >
              员工对话
              <Box component="span" sx={{ ml: 0.75, fontSize: '0.625rem', fontWeight: 500, color: gs.textDisabled }}>
                {staffSessions.length}
              </Box>
            </Typography>
            {staffSessionsExpanded
              ? <ExpandLessIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
              : <ExpandMoreIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
            }
          </ListItemButton>
          <Collapse in={staffSessionsExpanded} timeout="auto">
            <Box sx={{ maxHeight: 240, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* 搜索框 */}
              {staffSessions.length > 5 && (
                <Box sx={{ px: 1.5, py: 0.5, flexShrink: 0 }}>
                  <TextField
                    size="small"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="搜索员工对话"
                    sx={{
                      width: '100%',
                      '& .MuiOutlinedInput-root': {
                        height: 26,
                        fontSize: '0.7rem',
                        backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
                        '& fieldset': { border: 'none' },
                      },
                      '& input': { py: 0, px: 1 },
                    }}
                  />
                </Box>
              )}
              <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {filteredStaffSessions.map((s) => {
                  const title = s.title || '新对话';
                  const relativeTime = getRelativeTime(s.updated_at);
                  const isPinned = staffPinned.has(s.id);
                  const isActiveStaff = s.id === activeStaffSessionId;
                  return (
                    <ListItem key={s.id} disablePadding sx={{ display: 'block' }}>
                      <ListItemButton
                        onClick={() => navigateToStaffSession(s.id)}
                        sx={{
                          minHeight: 32,
                          px: 1.5,
                          py: 0.25,
                          borderRadius: '6px',
                          backgroundColor: isActiveStaff ? bgActive : 'transparent',
                          '&:hover': {
                            backgroundColor: isActiveStaff ? bgActiveHover : bgHover,
                            '& .staff-actions': { opacity: 1 },
                            '& .staff-time': { opacity: 0 },
                          },
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: isActiveStaff ? 500 : 400,
                            color: isActiveStaff ? textActive : textSecondary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            minWidth: 0,
                            lineHeight: '28px',
                          }}
                        >
                          {title}
                        </Typography>
                        {/* 右侧：时间 / hover 操作 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', flexShrink: 0, position: 'relative' }}>
                          {relativeTime && (
                            <Typography
                              className="staff-time"
                              sx={{
                                fontSize: '0.6rem',
                                color: textMuted,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                lineHeight: '28px',
                                transition: 'opacity 0.15s',
                              }}
                            >
                              {relativeTime}
                            </Typography>
                          )}
                          <Box
                            className="staff-actions"
                            sx={{
                              position: 'absolute',
                              right: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              opacity: 0,
                              transition: 'opacity 0.15s',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Tooltip title={isPinned ? '取消置顶' : '置顶'} placement="top" arrow>
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); toggleStaffPin(s.id); }}
                                sx={{
                                  p: 0.25,
                                  color: isPinned ? '#F59E0B' : gs.textMuted,
                                  '&:hover': { color: isPinned ? '#D97706' : gs.textPrimary },
                                }}
                              >
                                <PushPinOutlinedIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="删除" placement="top" arrow>
                              <IconButton
                                size="small"
                                onClick={(e) => handleDeleteStaffSession(e, s.id)}
                                sx={{
                                  p: 0.25,
                                  color: gs.textMuted,
                                  '&:hover': { color: '#EF4444' },
                                }}
                              >
                                <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      </ListItemButton>
                    </ListItem>
                  );
                })}
                {filteredStaffSessions.length === 0 && (
                  <Typography sx={{ fontSize: '0.65rem', color: textMuted, px: 2, py: 1 }}>
                    无匹配会话
                  </Typography>
                )}
              </Box>
            </Box>
          </Collapse>
        </Box>
      )}

      {/* ====== v6.0: 归档会话 ====== */}
      {!collapsed && sortedArchivedSessions.length > 0 && (
        <Box sx={{ mt: 1, pt: 1, display: 'flex', flexDirection: 'column', minHeight: 0, flex: '0 1 auto' }}>
          <ListItemButton
            onClick={() => setArchivedExpanded(prev => !prev)}
            sx={{
              minHeight: 28,
              px: 1.5,
              py: 0,
              borderRadius: '4px',
              '&:hover': { backgroundColor: bgHover },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: gs.textDisabled,
                letterSpacing: '0.02em',
                flex: 1,
              }}
            >
              归档
              <Box
                component="span"
                sx={{ ml: 0.75, fontSize: '0.625rem', fontWeight: 500, color: gs.textDisabled }}
              >
                {archivedSessionsTotal > 0 ? archivedSessionsTotal : sortedArchivedSessions.length}
              </Box>
            </Typography>
            {archivedExpanded
              ? <ExpandLessIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
              : <ExpandMoreIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
            }
          </ListItemButton>
          <Collapse in={archivedExpanded} timeout="auto">
            <Box
              ref={archivedListRef}
              onScroll={handleArchivedScroll}
              sx={{ overflowY: 'auto', maxHeight: 200, position: 'relative' }}
            >
              {sortedArchivedSessions.length === 0 && isLoadingArchived ? (
                <Box sx={{ py: 2, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled }}>
                    加载中...
                  </Typography>
                </Box>
              ) : (
                <>
                  {sortedArchivedSessions.map((s) => (
                    <ListItem key={s.id} disablePadding sx={{ display: 'block' }}>
                      <ListItemButton
                        onClick={() => {
                          onLoadSessionContext?.(s.id);
                        }}
                        sx={{
                          minHeight: 32,
                          px: 1.5,
                          py: 0,
                          borderRadius: '4px',
                          '&:hover': { backgroundColor: bgHover },
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            color: gs.textSecondary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {(s.title && s.title !== '新对话') ? s.title : '未命名对话'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: gs.textDisabled, ml: 1, flexShrink: 0 }}>
                          {getRelativeTime(s.archivedAt || s.updatedAt)}
                        </Typography>
                      </ListItemButton>
                    </ListItem>
                  ))}
                  {isLoadingArchived && (
                    <Box sx={{ py: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled }}>
                        加载更多...
                      </Typography>
                    </Box>
                  )}
                  {!isLoadingArchived && archivedSessions.length >= archivedSessionsTotal && archivedSessionsTotal > 0 && (
                    <Box sx={{ py: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.6rem', color: gs.textDisabled }}>
                        共 {archivedSessionsTotal} 个归档
                      </Typography>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Collapse>
        </Box>
      )}
    </List>
  );
};

export default React.memo(NavList);
