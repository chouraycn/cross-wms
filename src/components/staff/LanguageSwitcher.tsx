import { Check } from 'lucide-react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import { useI18n, type AppLocale } from './i18n/index.js';
import StaffdeckIcon from './StaffdeckIcon.js';

const OPTIONS: Array<{ locale: AppLocale; label: string; shortLabel: string }> = [
  { locale: 'zh-CN', label: '中文', shortLabel: '中' },
  { locale: 'en-US', label: 'English', shortLabel: 'EN' },
];

export type LanguageSwitcherProps = {
  className?: string;
};

export default function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();
  const active = OPTIONS.find((option) => option.locale === locale) || OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-i18n-ignore
        aria-label={locale === 'zh-CN' ? '切换语言' : 'Switch language'}
        className={[
          'flex h-[32px] w-[74px] shrink-0 items-center justify-center gap-[6px] rounded-[10px] border-[0.5px] border-[var(--border)] bg-white px-[8px] text-[12px] font-medium text-[var(--muted-foreground)] outline-none transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <StaffdeckIcon name="globe" size={14} style={{ flexShrink: 0 }} />
        <Box component="span" sx={{ minWidth: '18px', textAlign: 'center' }}>
          {active.shortLabel}
        </Box>
        <StaffdeckIcon name="arrow" size={12} style={{ transform: 'rotate(90deg)' }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-i18n-ignore
        align="end"
        sx={
          {
            width: '132px',
            borderRadius: '12px',
            border: '0.5px solid',
            borderColor: '#eceef1',
            bgcolor: '#fff',
            p: '4px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.1)',
          } as SxProps<Theme>
        }
      >
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.locale}
            onSelect={() => setLocale(option.locale)}
            sx={
              {
                height: '34px',
                cursor: 'pointer',
                justifyContent: 'space-between',
                borderRadius: '8px',
                px: '10px',
                fontSize: '13px',
                color: 'var(--ink-soft)',
              } as SxProps<Theme>
            }
          >
            <span>{option.label}</span>
            <Check
              size={14}
              style={{
                color: 'var(--foreground)',
                visibility: locale !== option.locale ? 'hidden' : 'visible',
              }}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
