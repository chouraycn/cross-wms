import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import AppHeader from '../AppHeader';
import { StatCard } from '../StatCard';
import { Button as UIButton } from '../ui';
import { cn } from '../lib/utils';
import {
  ArrowRight,
  Database,
  type LucideIcon,
  ListChecks,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
} from '../icons';
import EmployeeAvatar from '../EmployeeAvatar';
import type { AgentProfileRead } from '../types';

import PlatformEmployeeCard, { type PlatformStat } from './PlatformEmployeeCard';
import PlatformResourceCard, { type PlatformResourceAccent } from './PlatformResourceCard';

export type PlatformDetailKind = 'agents' | 'knowledge' | 'general-skills' | 'skills' | 'tools';

export type PlatformDetailItem = {
  id: string;
  title: string;
  description: string;
  meta: string;
  tags: string[];
  agent?: AgentProfileRead;
};

const PLATFORM_RESOURCE_ICON: Partial<Record<PlatformDetailKind, LucideIcon>> = {
  knowledge: Database,
  'general-skills': Sparkles,
  skills: ListChecks,
  tools: Wrench,
};

const PLATFORM_ACCENT: Partial<Record<PlatformDetailKind, PlatformResourceAccent>> = {
  knowledge: 'green',
  'general-skills': 'indigo',
  skills: 'blue',
  tools: 'orange',
};

const RETURN_BUTTON_CLASS =
  'h-8 gap-1 rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white px-5 text-[12px] font-normal text-[#757f9c] hover:border-[#cbd3e6] hover:bg-white hover:text-[#18181a]';

export type PlatformKindDetailViewProps = {
  kind: PlatformDetailKind;
  title: string;
  subtitle: string;
  countLabel: string;
  signals: string[];
  icon: LucideIcon;
  items: PlatformDetailItem[];
  loading: boolean;
  employeeStats: (agent: AgentProfileRead) => PlatformStat[];
  onBack: () => void;
  onRefresh: () => void;
  onOpenItem: (item: PlatformDetailItem) => void;
  onLogout?: () => void;
  userName?: string;
};

function DetailSkeleton({ kind }: { kind: PlatformDetailKind }) {
  const cardHeight = kind === 'agents' ? 'h-[140px]' : 'h-[112px]';
  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className={cn(
            'w-full animate-pulse rounded-[20px] border-[0.5px] border-[#f0f1f5] bg-[#f6f6f6]',
            cardHeight,
          )}
        />
      ))}
    </div>
  );
}

function ResourceIconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-[32px] shrink-0 place-items-center rounded-[10px] bg-[#f2f4f8] text-[#8a94a6]">
      <Icon className="size-[18px]" />
    </span>
  );
}

/**
 * Full-list view for a single 开放广场 module (/ enterprise/platform/:kind).
 * Mirrors the main platform page card system inside the standard enterprise page shell.
 */
export default function PlatformKindDetailView({
  kind,
  title,
  subtitle,
  countLabel,
  signals,
  icon: PlatformIcon,
  items,
  loading,
  employeeStats,
  onBack,
  onRefresh,
  onOpenItem,
  onLogout,
  userName,
}: PlatformKindDetailViewProps) {
  const [searchText, setSearchText] = useState('');

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => [
      item.title,
      item.description,
      item.meta,
      item.tags.join(' '),
    ].some((value) => value.toLowerCase().includes(keyword)));
  }, [items, searchText]);

  const resourceIcon = PLATFORM_RESOURCE_ICON[kind];
  const accent = PLATFORM_ACCENT[kind];

  let body: ReactNode;
  if (loading) {
    body = <DetailSkeleton kind={kind} />;
  } else if (filteredItems.length === 0) {
    body = (
      <div className="grid min-h-[180px] w-full place-items-center content-center gap-[10px] rounded-[18px] border border-dashed border-[#dfe4ec] bg-[#fbfcfd] px-[20px] py-[40px] text-center font-bold text-[#8b94aa]">
        <Search className="size-[20px] shrink-0" />
        <span>{items.length === 0 ? '暂无开放内容' : '没有匹配的广场内容'}</span>
      </div>
    );
  } else if (kind === 'agents') {
    body = (
      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {filteredItems.map((item) => item.agent && (
          <PlatformEmployeeCard
            key={item.id}
            avatar={(
              <EmployeeAvatar
                agent={item.agent}
                width={50}
                height={59}
                fit="contain"
                objectPosition="center bottom"
                className="overflow-visible! rounded-none! border-0! bg-transparent! bg-none! shadow-none! after:hidden!"
              />
            )}
            name={item.title}
            role={item.meta}
            online={item.agent.status === 'active'}
            description={item.description}
            stats={employeeStats(item.agent)}
            onOpen={() => onOpenItem(item)}
          />
        ))}
      </div>
    );
  } else {
    body = (
      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {filteredItems.map((item) => (
          <PlatformResourceCard
            key={item.id}
            icon={resourceIcon ? <ResourceIconTile icon={resourceIcon} /> : undefined}
            accent={accent}
            title={item.title}
            meta={item.meta}
            description={item.description}
            tags={item.tags.slice(0, 2)}
            onClick={() => onOpenItem(item)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-full box-border px-[48px] pt-[32px] pb-[43px] max-[900px]:px-[16px]" aria-busy={loading}>
      <AppHeader
        onLogout={onLogout}
        userName={userName}
        title={title}
        description={subtitle}
      />

      <div className="mt-[20px] mb-[16px] flex flex-wrap justify-end gap-[16px]">
        <UIButton variant="outline" onClick={onBack} className={RETURN_BUTTON_CLASS}>
          <ArrowRight className="size-3.5 rotate-180" />
          返回开放广场
        </UIButton>
        <UIButton
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className={RETURN_BUTTON_CLASS}
        >
          <RefreshCw className={cn('size-[14px]', loading && 'animate-spin')} />
          刷新
        </UIButton>
      </div>

      <div className="flex flex-col gap-[24px] rounded-[20px] bg-white p-[18px_18px_24px_18px] shadow-[0_-4px_16px_0_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-stretch gap-[20px]" aria-label={`${title}统计`}>
          <StatCard value={items.length} label={countLabel} className="max-w-[220px]" />
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-[6px] px-[12px] text-[#757f9c]">
            <PlatformIcon className="size-[14px] shrink-0" />
            <span className="text-[14px] font-normal leading-none">{title}</span>
          </div>

          {signals.length > 0 && (
            <div className="flex flex-wrap items-center gap-[6px] px-[12px]">
              {signals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-[20px] border-[0.5px] border-[#e3e7f1] px-[8px] py-[2px] text-[10px] leading-[normal] text-[#757f9c]"
                >
                  {signal}
                </span>
              ))}
            </div>
          )}

          <label className="flex h-[34px] w-full max-w-[360px] items-center gap-[8px] overflow-hidden rounded-[10px] border-[0.5px] border-[#e3e7f1] bg-white px-[12px] transition-colors focus-within:border-[#18181a]">
            <Search className="size-[14px] shrink-0 text-[#858b9c]" />
            <input
              value={searchText}
              placeholder={`搜索${countLabel}`}
              onChange={(event) => setSearchText(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#18181a] outline-none placeholder:text-[#858b9c]"
            />
          </label>

          {body}
        </div>
      </div>
    </div>
  );
}
