/**
 * StaffLayout — StaffDeck 模块的外层布局
 *
 * 职责：
 * 1. 随主应用启动注入默认桌面身份（ensureDefaultSession），不要求 admin 登录
 * 2. 渲染简化版侧边栏 + 顶部用户菜单
 * 3. 通过 React Context 将 currentUser/isAdmin/onLogout 注入到所有子页面
 * 4. 拦截 AppSidebar 的 onNavigate 回调，转换为 react-router 的 navigate 调用
 *
 * 设计原则：与 cross-wms 主应用联动 — 数字员工作为子模块随应用启动即获得身份，
 * 仅在 /staff, /enterprise, /workspace 路径下挂载。后端 staffAuth 中间件对无 token
 * 请求兜底 default-user，因此前端无需强制登录门。
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  Activity,
  Bell,
  BookOpen,
  Briefcase,
  Bug,
  CalendarClock,
  ClipboardList,
  FileText,
  Folder,
  Globe,
  History,
  Settings,
  Sparkles,
  User,
  Users,
} from 'lucide-react';

import {
  ensureDefaultSession,
  isEnterpriseAdmin,
  type EnterpriseAuthSession,
  type EnterpriseAuthUser,
} from './auth.js';
import { EnterpriseRoute } from './enums/routes.js';
import BrandLogo from './BrandLogo.js';

// ============================ Auth Context ============================

type StaffAuthContextValue = {
  currentUser: EnterpriseAuthUser | null;
  isAdmin: boolean;
  onLogout: () => void;
};

const StaffAuthContext = createContext<StaffAuthContextValue>({
  currentUser: null,
  isAdmin: false,
  onLogout: () => {},
});

export function useStaffAuth(): StaffAuthContextValue {
  return useContext(StaffAuthContext);
}

// ============================ Navigation items ============================

type IconComponent = ComponentType<{ className?: string; style?: React.CSSProperties }>;
type NavItem = { route: string; label: string; Icon: IconComponent };

const PRIMARY_NAV: NavItem[] = [
  { route: EnterpriseRoute.Platform, label: '开放广场平台', Icon: Globe },
  { route: EnterpriseRoute.Agents, label: '我的数字员工', Icon: Users },
];

const PROFILE_NAV: NavItem[] = [
  { route: EnterpriseRoute.Dashboard, label: '员工档案', Icon: FileText },
  { route: EnterpriseRoute.ScheduledTasks, label: '定时任务', Icon: Bell },
  { route: EnterpriseRoute.Memories, label: '记忆', Icon: History },
  { route: EnterpriseRoute.Feedback, label: '对话日志', Icon: CalendarClock },
  { route: EnterpriseRoute.Persona, label: '岗位人设', Icon: User },
];

const CAPABILITY_NAV: NavItem[] = [
  { route: EnterpriseRoute.Knowledge, label: '知识库', Icon: Folder },
  { route: EnterpriseRoute.GeneralSkills, label: '技能', Icon: Sparkles },
  { route: EnterpriseRoute.Skills, label: 'SOP', Icon: ClipboardList },
  { route: EnterpriseRoute.Tools, label: '工具', Icon: Briefcase },
];

const OBSERVE_NAV: NavItem[] = [
  { route: EnterpriseRoute.Traces, label: '会话 Trace', Icon: Activity },
  { route: EnterpriseRoute.Debug, label: 'Agent 调试', Icon: Bug },
];

const HELP_NAV: NavItem[] = [
  { route: EnterpriseRoute.Tutorial, label: '使用教程', Icon: BookOpen },
];

const SYSTEM_NAV: NavItem[] = [
  { route: EnterpriseRoute.Accounts, label: '账号管理', Icon: Users },
  { route: EnterpriseRoute.Models, label: '模型配置', Icon: Settings },
];

function resolveSelected(pathname: string): string {
  // 精确匹配优先，其次前缀匹配
  const all = [...PRIMARY_NAV, ...PROFILE_NAV, ...CAPABILITY_NAV, ...OBSERVE_NAV, ...HELP_NAV, ...SYSTEM_NAV];
  const exact = all.find((item) => pathname === item.route);
  if (exact) return exact.route;
  const prefix = all
    .filter((item) => pathname.startsWith(item.route + '/') || pathname.startsWith(item.route))
    .sort((a, b) => b.route.length - a.route.length)[0];
  return prefix?.route || '';
}

// ============================ Sidebar ============================

function StaffSidebar({
  selected,
  onNavigate,
  isAdmin,
}: {
  selected: string;
  onNavigate: (route: string) => void;
  isAdmin: boolean;
}) {
  const primaryItems = isAdmin ? [...PRIMARY_NAV, ...SYSTEM_NAV] : PRIMARY_NAV;

  const renderNavButton = (item: NavItem) => {
    const active = selected === item.route;
    return (
      <Box
        component="button"
        key={item.route}
        type="button"
        onClick={() => onNavigate(item.route)}
        sx={[
          {
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            gap: '10px',
            borderRadius: '10px',
            px: '14px',
            py: '8px',
            textAlign: 'left',
            fontSize: '13px',
            transition: 'background-color 0.2s',
          },
          active
            ? { bgcolor: '#eef1fb', color: '#3a4fbf', fontWeight: 500 }
            : { color: '#464c5e', '&:hover': { bgcolor: '#f6f6f6' } },
        ] as SxProps<Theme>}
      >
        <item.Icon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label}
        </Box>
      </Box>
    );
  };

  return (
    <Box
      component="aside"
      sx={{
        display: 'flex',
        height: '100%',
        width: '220px',
        flexShrink: 0,
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: '#e3e7f1',
        bgcolor: '#fbfbf9',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', px: '16px', py: '20px' }}>
        <BrandLogo />
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: '12px', pb: '16px' }}>
        <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {primaryItems.map(renderNavButton)}
        </Box>

        <Box sx={{ mt: '20px', mb: '8px', px: '14px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9aa0b5' }}>
          基本资料
        </Box>
        <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {PROFILE_NAV.map(renderNavButton)}
        </Box>

        <Box sx={{ mt: '16px', mb: '8px', px: '14px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9aa0b5' }}>
          员工能力
        </Box>
        <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {CAPABILITY_NAV.map(renderNavButton)}
        </Box>

        <Box sx={{ mt: '16px', mb: '8px', px: '14px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9aa0b5' }}>
          观测与调试
        </Box>
        <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {OBSERVE_NAV.map(renderNavButton)}
        </Box>

        <Box sx={{ mt: '16px', mb: '8px', px: '14px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9aa0b5' }}>
          帮助
        </Box>
        <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {HELP_NAV.map(renderNavButton)}
        </Box>
      </Box>
    </Box>
  );
}

// ============================ Layout ============================

export type StaffLayoutProps = {
  children?: ReactNode;
};

export default function StaffLayout({ children }: StaffLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // CDF Know Claw 桌面应用：数字员工随主应用启动即获得默认身份，无需 admin 登录门
  const [session, setSession] = useState<EnterpriseAuthSession | null>(() =>
    ensureDefaultSession(),
  );

  // 监听其他标签页的登出事件
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ultrarag_auth' && !event.newValue) {
        setSession(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 无登录门场景：退出即重置为默认桌面身份，避免进入无 session 的退化态
  const handleLogout = useCallback(() => {
    const next = ensureDefaultSession();
    setSession(next);
  }, []);

  const handleNavigate = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate],
  );

  const currentUser = session?.user ?? null;
  const isAdmin = isEnterpriseAdmin(currentUser);
  const selected = useMemo(() => resolveSelected(location.pathname), [location.pathname]);

  const authValue = useMemo<StaffAuthContextValue>(
    () => ({ currentUser, isAdmin, onLogout: handleLogout }),
    [currentUser, isAdmin, handleLogout],
  );

  return (
    <StaffAuthContext.Provider value={authValue}>
      <Box sx={{ display: 'flex', height: '100%', minHeight: 0, bgcolor: '#f7f5ef' }} className="sd-root">
        <StaffSidebar
          selected={selected}
          onNavigate={handleNavigate}
          isAdmin={isAdmin}
        />
        <Box sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column' }}>
          {/* 顶部用户条 */}
          <Box
            component="header"
            sx={{
              display: 'flex',
              height: '44px',
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              borderBottom: '1px solid',
              borderColor: '#e3e7f1',
              bgcolor: '#fff',
              px: '16px',
            }}
          >
            <Box component="span" sx={{ fontSize: '12px', color: '#757f9c' }}>
              {currentUser?.display_name || currentUser?.username || '未登录'}
            </Box>
            <Box
              component="button"
              type="button"
              onClick={handleLogout}
              sx={{
                borderRadius: '6px',
                px: '8px',
                py: '4px',
                fontSize: '12px',
                color: '#757f9c',
                '&:hover': { bgcolor: '#f6f6f6' },
              }}
            >
              退出
            </Box>
          </Box>
          {/* 主内容区 */}
          <Box component="main" sx={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
            {children}
          </Box>
        </Box>
      </Box>
    </StaffAuthContext.Provider>
  );
}

// ============================ Page wrapper HOC ============================

/**
 * 将 StaffDeck 页面的 props 注入从 Context 读取，避免每个路由重复传参
 * 使用方式： const WrappedPage = withStaffAuth(StaffAgentsPage);
 *
 * 泛型约束使用 `EnterpriseAuthUser | undefined` 而非 `unknown`/`null`：
 * 与所有 StaffDeck 页面组件声明的 `currentUser?: EnterpriseAuthUser` 完全一致，
 * 避免 contravariance 不兼容。Context 中的 null 会在传入前转换为 undefined。
 */
export function withStaffAuth<P extends { currentUser?: EnterpriseAuthUser; isAdmin?: boolean; onLogout?: () => void }>(
  Page: ComponentType<P>,
): ComponentType<Omit<P, 'currentUser' | 'isAdmin' | 'onLogout'>> {
  const Wrapped = function StaffAuthWrapped(props: Omit<P, 'currentUser' | 'isAdmin' | 'onLogout'>) {
    const { currentUser, isAdmin, onLogout } = useStaffAuth();
    // 将 null 转换为 undefined 以匹配页面组件的 props 类型
    const user = (currentUser ?? undefined) as P['currentUser'];
    return <Page {...(props as P)} currentUser={user} isAdmin={isAdmin} onLogout={onLogout} />;
  };
  Wrapped.displayName = `withStaffAuth(${Page.displayName || Page.name || 'Page'})`;
  return Wrapped;
}
