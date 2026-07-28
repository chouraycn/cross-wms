import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { Folder } from '../icons';

/** Per-module accent used for the meta line and tag pills (SD1 232:4634 family). */
export type PlatformResourceAccent = 'green' | 'blue' | 'indigo' | 'orange';

const ACCENT_STYLES: Record<PlatformResourceAccent, { meta: SxProps<Theme>; tag: SxProps<Theme> }> = {
  green: { meta: { color: '#2cb360' }, tag: { bgcolor: '#e9f7ef', color: '#2cb360' } },
  blue: { meta: { color: '#27c9ff' }, tag: { bgcolor: '#c4f1ff', color: '#25c7ff' } },
  indigo: { meta: { color: '#1a71ff' }, tag: { bgcolor: '#e8f0ff', color: '#1a71ff' } },
  orange: { meta: { color: '#ff7f00' }, tag: { bgcolor: '#fff2e5', color: '#ff7f00' } },
};

export const platformResourceAccentStyles = ACCENT_STYLES;

export type PlatformResourceCardProps = {
  title: ReactNode;
  /** Accent metric line under the title, e.g. "12M / 6个片段". */
  meta: ReactNode;
  description: ReactNode;
  tags?: string[];
  /** Full 36px icon visual. When omitted a default folder tile is shown. */
  icon?: ReactNode;
  /** Module accent color for the meta line and tag pills. Defaults to green (知识库). */
  accent?: PlatformResourceAccent;
  onClick?: () => void;
  className?: string;
};

/**
 * 广场 resource card shared by the 知识库 / 技能 / SOP / 工具 modules. It renders a
 * colorful module icon, a title with a green meta line, a two-line description
 * and a row of green pills on a clean white card (SD1 232:4923).
 */
export default function PlatformResourceCard({
  title,
  meta,
  description,
  tags,
  icon,
  accent = 'green',
  onClick,
  className,
}: PlatformResourceCardProps) {
  const accentStyles = ACCENT_STYLES[accent];
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      className={className}
      sx={{
        position: 'relative',
        display: 'flex',
        height: '112px',
        width: '100%',
        flexShrink: 0,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '14px',
        border: '0.5px solid',
        borderColor: '#f6f6f6',
        bgcolor: '#fff',
        p: '4px',
        textAlign: 'left',
        backdropFilter: 'blur(1.835px)',
        transition: 'box-shadow 0.15s',
        '&:hover': { boxShadow: '0 8px 20px rgba(15,23,42,0.06)' },
      }}
    >
      <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', px: '8px' }}>
        <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: '4px' }}>
          {icon ?? (
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
              <Folder size={18} />
            </Box>
          )}
          <Box sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column', gap: '4px' }}>
            <Box
              component="p"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 500, color: '#464c5e' }}
            >
              {title}
            </Box>
            <Box
              component="p"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', ...accentStyles.meta }}
            >
              {meta}
            </Box>
          </Box>
        </Box>

        <Box
          component="p"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            height: '26px',
            width: '100%',
            fontSize: '10px',
            lineHeight: '13px',
            color: '#757f9c',
          }}
        >
          {description}
        </Box>

        {tags && tags.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            {tags.map((tag) => (
              <Box
                key={tag}
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '90px',
                  px: '8px',
                  py: '2px',
                  fontSize: '8px',
                  lineHeight: 'normal',
                  ...accentStyles.tag,
                }}
              >
                {tag}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
