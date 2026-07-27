// AppHeader — 数字员工模块通用页头（标题 + 描述 + 返回 + 用户菜单）。
import type { ReactNode } from 'react';
import { cn } from './lib/utils';

export type AppHeaderProps = {
  left?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  onLogout?: () => void;
  userName?: string;
  className?: string;
  showBack?: boolean;
  onBack?: () => void;
};

export default function AppHeader({
  left,
  title,
  description,
  right,
  onLogout,
  userName,
  className,
  showBack,
  onBack,
}: AppHeaderProps) {
  const initial = userName?.trim()?.[0]?.toUpperCase();
  const backButton = showBack ? (
    <button
      type="button"
      onClick={onBack}
      aria-label="返回"
      className="mr-[4px] grid size-[32px] shrink-0 place-items-center rounded-[10px] outline-none hover:bg-[#f6f6f6]"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#464c5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  ) : null;
  const leftContent = left ?? (
    <div className="flex min-h-[40px] items-center gap-[4px]">
      {backButton}
      {(title !== undefined || description !== undefined) ? (
        <div className="flex min-w-0 flex-col justify-center gap-[4px]">
          {title !== undefined && (
            <p className="text-[16px] font-medium leading-[normal] text-[#464c5e]">{title}</p>
          )}
          {description !== undefined && (
            <p className="text-[14px] leading-[normal] text-[#757f9c]">{description}</p>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <header className={cn('flex w-full items-start gap-[16px]', className)}>
      <div className="min-w-0 flex-1">{leftContent}</div>
      <div className="flex h-[32px] shrink-0 items-center gap-[8px]">
        {right !== undefined ? right : (
          userName ? (
            <button
              type="button"
              onClick={onLogout}
              className="flex h-[32px] shrink-0 items-center gap-[8px] rounded-[10px] pl-[4px] pr-[8px] outline-none hover:bg-[#f6f6f6]"
            >
              <span className="grid size-[32px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#eef1fb] text-[14px] font-medium leading-none text-[#7e96dc]">
                {initial || 'U'}
              </span>
              <span className="text-[12px] text-[#464c5e]">{userName}</span>
            </button>
          ) : null
        )}
      </div>
    </header>
  );
}
