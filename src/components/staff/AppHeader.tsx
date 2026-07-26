// NOTE: 临时 stub — 等待业务组件子代理创建完整实现。
// 仅提供页面所需的最小头部（标题 + 用户菜单），实际实现请覆盖本文件。
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
};

export default function AppHeader({
  left,
  title,
  description,
  right,
  onLogout,
  userName,
  className,
}: AppHeaderProps) {
  const initial = userName?.trim()?.[0]?.toUpperCase();
  const leftContent = left ?? (
    (title !== undefined || description !== undefined) ? (
      <div className="flex min-h-[40px] flex-col justify-center gap-[4px]">
        {title !== undefined && (
          <p className="text-[16px] font-medium leading-[normal] text-[#464c5e]">{title}</p>
        )}
        {description !== undefined && (
          <p className="text-[14px] leading-[normal] text-[#757f9c]">{description}</p>
        )}
      </div>
    ) : null
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
