import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

import AppHeader from '../AppHeader';
import { StatCard } from '../StatCard';
import { Button as UIButton } from '../ui';
import { staffTokens } from '../lib/staffTokens.js';
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

const CARD_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
  gap: '16px',
  '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  '@media (min-width: 1024px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  '@media (min-width: 1280px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
  '@media (min-width: 1536px)': { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' },
} as const;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

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
  const cardHeight = kind === 'agents' ? '140px' : '112px';
  return (
    <Box sx={CARD_GRID_SX}>
      {Array.from({ length: 8 }, (_, index) => (
        <Box
          key={index}
          sx={{
            width: '100%',
            animation: `${pulse} 2s cubic-bezier(0.4,0,0.6,1) infinite`,
            borderRadius: '20px',
            border: '0.5px solid',
            borderColor: '#f0f1f5',
            bgcolor: '#f6f6f6',
            height: cardHeight,
          }}
        />
      ))}
    </Box>
  );
}

function ResourceIconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'grid',
        width: '32px',
        height: '32px',
        flexShrink: 0,
        placeItems: 'center',
        borderRadius: '10px',
        bgcolor: '#f2f4f8',
        color: '#8a94a6',
      }}
    >
      <Icon size={18} />
    </Box>
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
      <Box
        sx={{
          display: 'grid',
          minHeight: '180px',
          width: '100%',
          placeItems: 'center',
          alignContent: 'center',
          gap: '10px',
          borderRadius: '18px',
          border: '1px dashed',
          borderColor: '#dfe4ec',
          bgcolor: '#fbfcfd',
          px: '20px',
          py: '40px',
          textAlign: 'center',
          fontWeight: 700,
          color: '#8b94aa',
        }}
      >
        <Search size={20} />
        <Box component="span">{items.length === 0 ? '暂无开放内容' : '没有匹配的广场内容'}</Box>
      </Box>
    );
  } else if (kind === 'agents') {
    body = (
      <Box sx={CARD_GRID_SX}>
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
      </Box>
    );
  } else {
    body = (
      <Box sx={CARD_GRID_SX}>
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
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        boxSizing: 'border-box',
        px: '48px',
        pt: '32px',
        pb: '43px',
        '@media (max-width: 900px)': { px: '16px' },
      }}
      aria-busy={loading}
    >
      <AppHeader
        onLogout={onLogout}
        userName={userName}
        title={title}
        description={subtitle}
      />

      <Box sx={{ mt: '20px', mb: '16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '16px' }}>
        <UIButton variant="outline" onClick={onBack} sx={{ ...staffTokens.outlineActionButton }}>
          <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} />
          返回开放广场
        </UIButton>
        <UIButton
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          sx={{ ...staffTokens.outlineActionButton }}
        >
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              '& svg': {
                width: '14px',
                height: '14px',
                ...(loading ? { animation: `${spin} 1s linear infinite` } : {}),
              },
            }}
          >
            <RefreshCw />
          </Box>
          刷新
        </UIButton>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          borderRadius: '20px',
          bgcolor: '#fff',
          p: '18px 18px 24px 18px',
          boxShadow: '0 -4px 16px 0 rgba(0,0,0,0.05)',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '20px' }} aria-label={`${title}统计`}>
          <Box sx={{ maxWidth: '220px' }}>
            <StatCard value={items.length} label={countLabel} />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: '#757f9c' }}>
            <Box sx={{ display: 'inline-flex', flexShrink: 0, color: '#757f9c', '& svg': { width: '14px', height: '14px' } }}>
              <PlatformIcon />
            </Box>
            <Box component="span" sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 'none' }}>
              {title}
            </Box>
          </Box>

          {signals.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', px: '12px' }}>
              {signals.map((signal) => (
                <Box
                  key={signal}
                  component="span"
                  sx={{
                    borderRadius: '20px',
                    border: '0.5px solid',
                    borderColor: '#e3e7f1',
                    px: '8px',
                    py: '2px',
                    fontSize: '10px',
                    lineHeight: 'normal',
                    color: '#757f9c',
                  }}
                >
                  {signal}
                </Box>
              ))}
            </Box>
          )}

          <Box
            component="label"
            sx={{
              display: 'flex',
              height: '34px',
              width: '100%',
              maxWidth: '360px',
              alignItems: 'center',
              gap: '8px',
              overflow: 'hidden',
              borderRadius: '10px',
              border: '0.5px solid',
              borderColor: '#e3e7f1',
              bgcolor: '#fff',
              px: '12px',
              transition: 'border-color 0.15s',
              '&:focus-within': { borderColor: '#18181a' },
            }}
          >
            <Box sx={{ display: 'inline-flex', flexShrink: 0, color: '#858b9c', '& svg': { width: '14px', height: '14px' } }}>
              <Search />
            </Box>
            <Box
              component="input"
              value={searchText}
              placeholder={`搜索${countLabel}`}
              onChange={(event) => setSearchText(event.target.value)}
              sx={{
                minWidth: 0,
                flex: 1,
                border: 0,
                bgcolor: 'transparent',
                fontSize: '12px',
                color: '#18181a',
                outline: 'none',
                '&::placeholder': { color: '#858b9c' },
              }}
            />
          </Box>

          {body}
        </Box>
      </Box>
    </Box>
  );
}
