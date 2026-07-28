import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

import { ChevronDown } from '../icons';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

export type PlatformColumnProps = {
  /** Small 14px glyph shown before the title. */
  icon: ReactNode;
  /** Column title, e.g. 数字员工广场. */
  title: ReactNode;
  /** Count shown on the right of the header. */
  count: number;
  /** Unit label rendered after the count, e.g. 员工 / 内容. */
  countLabel: string;
  /** Filter chips rendered under the title. */
  filters?: string[];
  /** Renders a skeleton-free muted list while data loads. */
  loading?: boolean;
  /** Whether the column has no content — shows the empty placeholder. */
  isEmpty?: boolean;
  /** Text for the empty placeholder. */
  emptyText?: string;
  /** Fired when the "查看全部" button is pressed. */
  onViewAll?: () => void;
  /** The column's cards. */
  children?: ReactNode;
  className?: string;
};

/**
 * Shared shell for a single 开放广场 column. It captures the parts that repeat
 * across all five modules (数字员工 / 知识库 / 技能 / SOP / 工具): the icon+title
 * header with a count, the filter chip row, the divider, the card list (or an
 * empty placeholder) and the "查看全部" footer button. Each module only supplies
 * its own cards via `children`.
 */
export default function PlatformColumn({
  icon,
  title,
  count,
  countLabel,
  filters,
  loading = false,
  isEmpty = false,
  emptyText = '暂无开放内容',
  onViewAll,
  children,
  className,
}: PlatformColumnProps) {
  void countLabel;
  return (
    <Box
      component="section"
      className={className}
      sx={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        width: '100%',
        minWidth: '180px',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        borderRadius: '14px',
        border: '0.5px solid',
        borderColor: '#e3e7f1',
        px: '12px',
        py: '14px',
      }}
    >
      <Box sx={{ display: 'flex', width: '100%', minHeight: 0, flex: 1, flexDirection: 'column', gap: '16px' }}>
        <Box sx={{ display: 'flex', width: '100%', flexShrink: 0, flexDirection: 'column', gap: '10px' }}>
          <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Box
                component="span"
                sx={{ display: 'flex', width: '14px', height: '14px', flexShrink: 0, alignItems: 'center', justifyContent: 'center', color: '#464c5e' }}
              >
                {icon}
              </Box>
              <Box
                component="p"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 500, color: '#464c5e' }}
              >
                {title}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: '2px', fontSize: '12px', color: '#464c5e' }}>
              <Box component="span">{count}</Box>
            </Box>
          </Box>

          {filters && filters.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
              {filters.map((filter) => (
                <Box
                  key={filter}
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
                  {filter}
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ height: '1px', width: '100%', bgcolor: '#e3e7f1' }} />
        </Box>

        <Box sx={{ marginRight: '-12px', display: 'flex', minHeight: 0, width: 'calc(100% + 12px)', flex: 1, flexDirection: 'column', gap: '16px', overflowY: 'auto', pr: '12px' }}>
          {loading ? (
            <PlatformColumnSkeleton />
          ) : isEmpty ? (
            <Box
              sx={{
                display: 'flex',
                minHeight: '180px',
                width: '100%',
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '18px',
                border: '1px dashed',
                borderColor: '#e4e9f2',
                bgcolor: '#fbfcfe',
                px: '18px',
                py: '28px',
                textAlign: 'center',
              }}
            >
              <Box sx={{ display: 'flex', maxWidth: '180px', flexDirection: 'column', alignItems: 'center' }}>
                <Box
                  component="span"
                  sx={{
                    display: 'grid',
                    width: '34px',
                    height: '34px',
                    placeItems: 'center',
                    borderRadius: '12px',
                    bgcolor: '#fff',
                    color: '#98a2b3',
                    boxShadow: '0 1px 8px rgba(70,76,94,0.06), 0 0 0 1px #edf1f6',
                  }}
                >
                  <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} />
                </Box>
                <Box component="p" sx={{ mt: '12px', fontSize: '13px', fontWeight: 500, lineHeight: '19px', color: '#7f879a' }}>
                  {emptyText}
                </Box>
                <Box component="p" sx={{ mt: '4px', fontSize: '10px', lineHeight: '16px', color: '#a7adbb' }}>
                  发布内容后会在这里展示
                </Box>
              </Box>
            </Box>
          ) : (
            children
          )}
        </Box>
      </Box>

      {!isEmpty && (
        <>
          <Box sx={{ height: '1px', width: '100%', flexShrink: 0, bgcolor: '#e3e7f1' }} />

          <Box
            component="button"
            type="button"
            onClick={onViewAll}
            sx={{
              display: 'flex',
              width: '120px',
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              borderRadius: '10px',
              border: '0.5px solid',
              borderColor: '#e3e7f1',
              bgcolor: '#fff',
              px: '20px',
              py: '8px',
              fontSize: '12px',
              color: '#757f9c',
              transition: 'color 0.15s',
              '&:hover': { color: '#18181a' },
            }}
          >
            查看全部
            <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
          </Box>
        </>
      )}
    </Box>
  );
}

function PlatformColumnSkeleton() {
  return (
    <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '16px' }}>
      {[0, 1, 2].map((index) => (
        <Box
          key={index}
          sx={{
            height: '112px',
            width: '100%',
            flexShrink: 0,
            animation: `${pulse} 2s cubic-bezier(0.4,0,0.6,1) infinite`,
            borderRadius: '20px',
            border: '0.5px solid',
            borderColor: '#f0f1f5',
            bgcolor: '#f6f6f6',
          }}
        />
      ))}
    </Box>
  );
}
