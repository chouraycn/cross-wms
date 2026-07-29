import * as React from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

// 统一到 MUI 设计系统的 Tabs 实现。
// 保留 Radix 的 API 语义（role=tablist/tab/tabpanel、data-state、context 受控），
// 颜色/间距路由到 MUI 主题 token；active 视觉交由 data-state + 调用方 className 控制。
type TabsContextValue = { value?: string; setValue: (v: string) => void }
const TabsContext = React.createContext<TabsContextValue>({
  value: undefined,
  setValue: () => {},
})

const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
  {
    variants: {
      variant: {
        default: 'bg-muted',
        line: 'gap-1 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const mergeSx = (base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> => [
  base,
  ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
]

function Tabs({
  className,
  orientation = 'horizontal',
  value: controlledValue,
  defaultValue,
  onValueChange,
  sx,
  children,
  ...props
}: {
  className?: string
  orientation?: 'horizontal' | 'vertical'
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  sx?: SxProps<Theme>
  children?: React.ReactNode
} & Omit<React.ComponentProps<'div'>, 'value' | 'defaultValue' | 'onChange'>) {
  const [internal, setInternal] = React.useState<string | undefined>(defaultValue)
  const value = controlledValue !== undefined ? controlledValue : internal
  const setValue = React.useCallback(
    (v: string) => {
      if (controlledValue === undefined) setInternal(v)
      onValueChange?.(v)
    },
    [controlledValue, onValueChange],
  )
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <Box
        data-slot="tabs"
        data-orientation={orientation}
        className={cn('group/tabs flex gap-2', orientation === 'horizontal' ? 'flex-col' : 'flex-row', className)}
        sx={sx}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </Box>
    </TabsContext.Provider>
  )
}

function TabsList({
  className,
  variant = 'default',
  sx,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof tabsListVariants> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      role="tablist"
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      sx={mergeSx(
        {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 2,
          p: '3px',
          gap: 0.5,
          bgcolor: variant === 'default' ? 'action.hover' : 'transparent',
        },
        sx,
      )}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TabsTrigger({
  className,
  value,
  disabled,
  onClick,
  sx,
  children,
  ...props
}: React.ComponentProps<'button'> & { value: string; sx?: SxProps<Theme> }) {
  const { value: current, setValue } = React.useContext(TabsContext)
  const active = current === value
  return (
    <Box
      component="button"
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      data-slot="tabs-trigger"
      data-state={active ? 'active' : 'inactive'}
      onClick={(e) => {
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        if (!disabled) setValue(value)
      }}
      className={cn(className)}
      sx={mergeSx(
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          border: 'none',
          cursor: 'pointer',
          bgcolor: 'transparent',
          color: active ? 'text.primary' : 'text.secondary',
          fontWeight: 500,
          px: 1.5,
          py: 0.5,
          borderRadius: 1,
          transition: 'background-color 0.2s, color 0.2s',
          '&[data-state=active]': { boxShadow: 1 },
          '&:disabled': { opacity: 0.5, cursor: 'default' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
        },
        sx,
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Box>
  )
}

function TabsContent({ className, value, children, ...props }: React.ComponentProps<'div'> & { value: string }) {
  const { value: current } = React.useContext(TabsContext)
  const active = current === value
  return (
    <Box
      role="tabpanel"
      data-slot="tabs-content"
      hidden={!active}
      className={cn('flex-1 text-sm outline-none', className)}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Box>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
