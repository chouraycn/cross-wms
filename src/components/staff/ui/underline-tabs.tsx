import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

export type UnderlineTabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

/**
 * `dot`  – short centered rounded indicator under the active label (SD1 node 38:6404).
 * `line` – full-tab-width 2px active bar over a full-width bottom divider (SD1 node 281:1935).
 */
export type UnderlineTabsVariant = 'dot' | 'line';

export type UnderlineTabsProps<T extends string = string> = {
  items: UnderlineTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: UnderlineTabsVariant;
  className?: string;
  /** Extra classes for each tab button (e.g. override the default fixed width). */
  tabClassName?: string;
  'aria-label'?: string;
  sx?: SxProps<Theme>;
};

/**
 * Global underline tab bar.
 * Use `variant="dot"` (default) for the short rounded indicator, or `variant="line"`
 * for the full-width divider with a full-tab-width active bar.
 */
export function UnderlineTabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'dot',
  className,
  tabClassName,
  'aria-label': ariaLabel,
  sx,
}: UnderlineTabsProps<T>) {
  const isLine = variant === 'line';
  return (
    <Box
      role="tablist"
      aria-label={ariaLabel}
      className={className}
      sx={[
        {
          display: 'flex',
          alignItems: 'flex-start',
        },
        ...(isLine ? [{ borderBottom: '0.5px solid', borderColor: 'var(--border)' }] : []),
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Box
            key={item.value}
            component="button"
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={tabClassName}
            sx={{
              position: 'relative',
              display: 'flex',
              width: '120px',
              alignItems: 'flex-start',
              justifyContent: 'center',
              px: '16px',
              fontSize: '14px',
              textTransform: 'capitalize',
              transition: 'background-color 0.15s, color 0.15s',
              outline: 'none',
              ...(isLine
                ? { pt: '6px', pb: '8px', mb: '-0.5px', borderBottom: '2px solid' }
                : { py: '6px' }),
              ...(isLine
                ? active
                  ? { borderColor: 'var(--foreground)', fontWeight: 500, color: 'var(--foreground)' }
                  : {
                      borderColor: 'transparent',
                      fontWeight: 400,
                      color: '#4f5669',
                      '&:hover': { color: 'var(--foreground)' },
                    }
                : active
                  ? { fontWeight: 500, color: '#18181A' }
                  : {
                      fontWeight: 400,
                      color: '#858B9C',
                      '&:hover': { color: '#18181A' },
                    }),
              '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
            }}
          >
            {item.label}
            {!isLine && active && (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  position: 'absolute',
                  top: '33px',
                  left: '50%',
                  width: '10px',
                  height: '3px',
                  transform: 'translateX(-50%)',
                  borderRadius: '4px',
                  bgcolor: '#18181A',
                  '@media (max-width: 560px)': { top: 'auto', bottom: 0 },
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
