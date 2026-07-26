/**
 * StaffLayout — StaffDeck 模块的外层布局
 *
 * 职责：
 * 1. 维护企业认证状态（未登录显示 LoginPage，已登录显示业务页面）
 * 2. 渲染简化版侧边栏 + 顶部用户菜单
 * 3. 通过 React Context 将 currentUser/isAdmin/onLogout 注入到所有子页面
 * 4. 拦截 AppSidebar 的 onNavigate 回调，转换为 react-router 的 navigate 调用
 *
 * 设计原则：与 cross-wms 主应用隔离 — 仅在 /staff, /enterprise, /workspace 路径下挂载
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  CalendarClock,
  ClipboardList,
  FileText,
  Folder,
  Globe,
  History,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';

import {
  clearEnterpriseAuthSession,
  getEnterpriseAuthSession,
  isEnterpriseAdmin,
  setEnterpriseAuthSession,
  type EnterpriseAuthSession,
  type EnterpriseAuthUser,
} from './auth.js';
import { EnterpriseRoute } from './enums/routes.js';
import { cn } from './lib/utils.js';
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
];

const CAPABILITY_NAV: NavItem[] = [
  { route: EnterpriseRoute.Knowledge, label: '知识库', Icon: Folder },
  { route: EnterpriseRoute.GeneralSkills, label: '技能', Icon: Sparkles },
  { route: EnterpriseRoute.Skills, label: 'SOP', Icon: ClipboardList },
  { route: EnterpriseRoute.Tools, label: '工具', Icon: Briefcase },
];

const SYSTEM_NAV: NavItem[] = [
  { route: EnterpriseRoute.Accounts, label: '账号管理', Icon: Users },
  { route: EnterpriseRoute.Models, label: '模型配置', Icon: Settings },
];

function resolveSelected(pathname: string): string {
  // 精确匹配优先，其次前缀匹配
  const all = [...PRIMARY_NAV, ...PROFILE_NAV, ...CAPABILITY_NAV, ...SYSTEM_NAV];
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
      <button
        key={item.route}
        type="button"
        onClick={() => onNavigate(item.route)}
        className={cn(
          'flex w-full items-center gap-[10px] rounded-[10px] px-[14px] py-[8px] text-left text-[13px] transition-colors',
          active
            ? 'bg-[#eef1fb] text-[#3a4fbf] font-medium'
            : 'text-[#464c5e] hover:bg-[#f6f6f6]',
        )}
      >
        <item.Icon className="size-[16px] shrink-0" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[#e3e7f1] bg-[#fbfbf9]">
      <div className="flex items-center justify-center px-[16px] py-[20px]">
        <BrandLogo />
      </div>

      <div className="flex-1 overflow-y-auto px-[12px] pb-[16px]">
        <nav className="flex flex-col gap-[4px]">
          {primaryItems.map(renderNavButton)}
        </nav>

        <div className="mt-[20px] mb-[8px] px-[14px] text-[10px] font-medium uppercase tracking-wide text-[#9aa0b5]">
          基本资料
        </div>
        <nav className="flex flex-col gap-[2px]">
          {PROFILE_NAV.map(renderNavButton)}
        </nav>

        <div className="mt-[16px] mb-[8px] px-[14px] text-[10px] font-medium uppercase tracking-wide text-[#9aa0b5]">
          员工能力
        </div>
        <nav className="flex flex-col gap-[2px]">
          {CAPABILITY_NAV.map(renderNavButton)}
        </nav>
      </div>
    </aside>
  );
}

// ============================ Layout ============================

export type StaffLayoutProps = {
  children?: ReactNode;
};

export default function StaffLayout({ children }: StaffLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<EnterpriseAuthSession | null>(() =>
    getEnterpriseAuthSession(),
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

  const handleLogin = useCallback((next: EnterpriseAuthSession) => {
    setEnterpriseAuthSession(next);
    setSession(next);
  }, []);

  const handleLogout = useCallback(() => {
    clearEnterpriseAuthSession();
    setSession(null);
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

  // 未登录：渲染登录页（占满整个 cross-wms 内容区，无侧边栏）
  if (!session) {
    // 局部加载 LoginPage，避免直接 import 导致主应用首次加载体积膨胀
    const LoginPage = ReactLazyLoginPage;
    return (
      <div className="sd-root min-h-full bg-[#f7f5ef]">
        <LoginPage onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <StaffAuthContext.Provider value={authValue}>
      <div className="sd-root flex h-full min-h-0 bg-[#f7f5ef]">
        <StaffSidebar
          selected={selected}
          onNavigate={handleNavigate}
          isAdmin={isAdmin}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 顶部用户条 */}
          <header className="flex h-[44px] shrink-0 items-center justify-end gap-[8px] border-b border-[#e3e7f1] bg-white px-[16px]">
            <span className="text-[12px] text-[#757f9c]">
              {currentUser?.display_name || currentUser?.username || '未登录'}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-[#757f9c] hover:bg-[#f6f6f6]"
            >
              退出
            </button>
          </header>
          {/* 主内容区 */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
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

// ============================ Lazy login page ============================

const ReactLazyLoginPage = React.lazy(() => import('../../pages/staff/LoginPage.js'));
