'use client'

import * as React from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import Box from '@mui/material/Box'

import { cn } from './utils'

// 本地 asChild 实现，替代 Radix Slot（仅合并 className + 透传 props，满足 sidebar 的 asChild 用法）。
function SlotRoot({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) {
  if (!React.isValidElement(children)) return null
  const child = children as React.ReactElement
  return React.cloneElement(child, {
    ...props,
    className: cn((props.className as string) ?? '', (child.props as { className?: string }).className),
  } as Record<string, unknown>)
}
import { Button } from './button'
import { Input } from './input'
import { Separator } from './separator'
import { Skeleton } from './skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './tooltip'
import { PanelLeftIcon } from 'lucide-react'

// NOTE: useIsMobile inlined from StaffDeck's @/hooks/use-mobile for portability.
const MOBILE_BREAKPOINT = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

type SidebarContextProps = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open],
  )

  // Helper to toggle the sidebar. Always drive the desktop open state so the
  // sidebar stays a visible (icon) rail on small screens instead of an off-canvas sheet.
  const toggleSidebar = React.useCallback(() => {
    return setOpen((open) => !open)
  }, [setOpen])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? 'expanded' : 'collapsed'

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <Box
        data-slot="sidebar-wrapper"
        className={className}
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        sx={{
          display: 'flex',
          minHeight: '100svh',
          width: '100%',
          '&:has([data-variant="inset"])': { bgcolor: 'var(--sidebar, #ffffff)' },
        }}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </Box>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}) {
  const { state } = useSidebar()

  if (collapsible === 'none') {
    return (
      <Box
        data-slot="sidebar"
        className={className}
        sx={{
          display: 'flex',
          height: '100%',
          width: 'var(--sidebar-width)',
          flexDirection: 'column',
          bgcolor: 'var(--sidebar, #ffffff)',
          color: 'var(--sidebar-foreground, #858b9c)',
        }}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </Box>
    )
  }

  return (
    <Box
      className={className}
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      sx={{
        display: 'block',
        color: 'var(--sidebar-foreground, #858b9c)',
      }}
    >
      {/* This is what handles the sidebar gap on desktop */}
      <Box
        data-slot="sidebar-gap"
        sx={{
          position: 'relative',
          width: 'var(--sidebar-width)',
          bgcolor: 'transparent',
          transition: 'width 0.3s',
          transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
          '[data-collapsible="offcanvas"] &': { width: 0 },
          '[data-side="right"] &': { transform: 'rotate(180deg)' },
          ...(variant === 'floating' || variant === 'inset'
            ? { '[data-collapsible="icon"] &': { width: 'calc(var(--sidebar-width-icon) + 16px)' } }
            : { '[data-collapsible="icon"] &': { width: 'var(--sidebar-width-icon)' } }),
        }}
      />
      <Box
        data-slot="sidebar-container"
        data-side={side}
        className={className}
        sx={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          zIndex: 10,
          display: 'flex',
          height: '100svh',
          width: 'var(--sidebar-width)',
          transition: 'left 0.3s, right 0.3s, width 0.3s',
          transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
          '&[data-side="left"]': { left: 0 },
          '[data-collapsible="offcanvas"] &[data-side="left"]': {
            left: 'calc(var(--sidebar-width) * -1)',
          },
          '&[data-side="right"]': { right: 0 },
          '[data-collapsible="offcanvas"] &[data-side="right"]': {
            right: 'calc(var(--sidebar-width) * -1)',
          },
          ...(variant === 'floating' || variant === 'inset'
            ? {
                p: '8px',
                '[data-collapsible="icon"] &': {
                  width: 'calc(var(--sidebar-width-icon) + 16px + 2px)',
                },
              }
            : {
                '[data-collapsible="icon"] &': { width: 'var(--sidebar-width-icon)' },
                '[data-side="left"] &': {
                  borderRight: '1px solid',
                  borderColor: 'var(--sidebar-border, #f4f4f4)',
                },
                '[data-side="right"] &': {
                  borderLeft: '1px solid',
                  borderColor: 'var(--sidebar-border, #f4f4f4)',
                },
              }),
        }}
        {...(props as Record<string, unknown>)}
      >
        <Box
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          sx={{
            display: 'flex',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            bgcolor: 'var(--sidebar, #ffffff)',
            '[data-variant="floating"] &': {
              borderRadius: '8px',
              boxShadow:
                '0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px var(--sidebar-border, #f4f4f4)',
            },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}

const SR_ONLY: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <Box component="span" sx={SR_ONLY}>
        Toggle Sidebar
      </Box>
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Box
      component="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={className}
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        zIndex: 20,
        display: 'none',
        width: '16px',
        transition: 'all 0.15s',
        transitionTimingFunction: 'linear',
        transform: 'translateX(-50%)',
        '&::after': { position: 'absolute', top: 0, bottom: 0, insetInlineStart: '50%', width: '2px' },
        '&:hover::after': { bgcolor: 'var(--sidebar-border, #f4f4f4)' },
        '[data-side="left"] &': { right: '-16px', cursor: 'w-resize' },
        '[data-side="right"] &': { left: 0, cursor: 'e-resize' },
        '[data-side="left"][data-state="collapsed"] &': { cursor: 'e-resize' },
        '[data-side="right"][data-state="collapsed"] &': { cursor: 'w-resize' },
        '[data-collapsible="offcanvas"] &': {
          transform: 'translateX(0)',
          '&::after': { left: '100%' },
        },
        '[data-collapsible="offcanvas"] &:hover': { bgcolor: 'var(--sidebar, #ffffff)' },
        '[data-side="left"][data-collapsible="offcanvas"] &': { right: '-8px' },
        '[data-side="right"][data-collapsible="offcanvas"] &': { left: '-8px' },
        '@media (min-width: 640px)': { display: 'flex' },
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <Box
      component="main"
      data-slot="sidebar-inset"
      className={className}
      sx={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        flex: 1,
        flexDirection: 'column',
        bgcolor: 'var(--background, #f7f5ef)',
        '@media (min-width: 768px)': {
          '[data-variant="inset"] ~ &': {
            m: '8px',
            ml: 0,
            borderRadius: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          },
          '[data-variant="inset"][data-state="collapsed"] ~ &': { ml: '8px' },
        },
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={className}
      sx={{
        height: '32px',
        width: '100%',
        bgcolor: 'var(--background, #f7f5ef)',
        boxShadow: 'none',
      }}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="sidebar-header"
      data-sidebar="header"
      className={className}
      sx={{ display: 'flex', flexDirection: 'column', gap: '8px', p: '8px' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={className}
      sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={className}
      sx={{ mx: '8px', width: 'auto', bgcolor: 'var(--sidebar-border, #f4f4f4)' }}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="sidebar-content"
      data-sidebar="content"
      className={className}
      sx={{
        display: 'flex',
        minHeight: 0,
        flex: 1,
        flexDirection: 'column',
        gap: 0,
        overflowY: 'auto',
        '&::-webkit-scrollbar': { display: 'none' },
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        '[data-collapsible="icon"] &': { overflow: 'hidden' },
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="sidebar-group"
      data-sidebar="group"
      className={className}
      sx={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        minWidth: 0,
        flexDirection: 'column',
        p: '8px',
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  sx,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean; sx?: SxProps<Theme> }) {
  if (asChild) {
    return (
      <SlotRoot
        data-slot="sidebar-group-label"
        data-sidebar="group-label"
        className={className}
        {...(props as Record<string, unknown>)}
      />
    )
  }

  return (
    <Box
      component="div"
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={className}
      sx={{
        display: 'flex',
        height: '32px',
        flexShrink: 0,
        alignItems: 'center',
        borderRadius: '6px',
        px: '8px',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--sidebar-foreground, #858b9c)',
        opacity: 0.7,
        outline: '2px solid transparent',
        outlineOffset: '2px',
        transition: 'margin 0.2s, opacity 0.2s',
        transitionTimingFunction: 'linear',
        '[data-collapsible="icon"] &': { mt: '-32px', opacity: 0 },
        '&:focus-visible': { boxShadow: '0 0 0 2px var(--sidebar-ring, #18181a)' },
        '& > svg': { width: '16px', height: '16px', flexShrink: 0 },
        ...(sx as Record<string, unknown>),
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  sx,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean; sx?: SxProps<Theme> }) {
  if (asChild) {
    return (
      <SlotRoot
        data-slot="sidebar-group-action"
        data-sidebar="group-action"
        className={className}
        {...(props as Record<string, unknown>)}
      />
    )
  }

  return (
    <Box
      component="button"
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={className}
      sx={{
        position: 'absolute',
        top: '14px',
        right: '12px',
        display: 'flex',
        aspectRatio: '1 / 1',
        width: '20px',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        p: 0,
        color: 'var(--sidebar-foreground, #858b9c)',
        outline: '2px solid transparent',
        outlineOffset: '2px',
        transition: 'transform 0.15s',
        '[data-collapsible="icon"] &': { display: 'none' },
        '&::after': {
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          bottom: '-8px',
          left: '-8px',
        },
        '&:hover': {
          bgcolor: 'var(--sidebar-accent, #f6f6f6)',
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '&:focus-visible': { boxShadow: '0 0 0 2px var(--sidebar-ring, #18181a)' },
        '@media (min-width: 768px)': { '&::after': { display: 'none' } },
        '& > svg': { width: '16px', height: '16px', flexShrink: 0 },
        ...(sx as Record<string, unknown>),
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={className}
      sx={{ width: '100%', fontSize: '14px' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <Box
      component="ul"
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={className}
      sx={{ display: 'flex', width: '100%', minWidth: 0, flexDirection: 'column', gap: 0 }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <Box
      component="li"
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      data-menu-item
      className={className}
      sx={{ position: 'relative' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

const menuButtonSx = ({
  variant,
  size,
}: {
  variant?: 'default' | 'outline'
  size?: 'default' | 'sm' | 'lg'
}): SxProps<Theme> => {
  const base: Record<string, unknown> = {
    position: 'relative',
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
    borderRadius: '6px',
    p: '8px',
    textAlign: 'left',
    fontSize: '14px',
    outline: '2px solid transparent',
    outlineOffset: '2px',
    transition: 'width 0.15s, height 0.15s, padding 0.15s',
    '&:hover': {
      bgcolor: 'var(--sidebar-accent, #f6f6f6)',
      color: 'var(--sidebar-accent-foreground, #18181a)',
    },
    '&:focus-visible': { boxShadow: '0 0 0 2px var(--sidebar-ring, #18181a)' },
    '&:active': {
      bgcolor: 'var(--sidebar-accent, #f6f6f6)',
      color: 'var(--sidebar-accent-foreground, #18181a)',
    },
    '&[aria-disabled="true"]': { pointerEvents: 'none', opacity: 0.5 },
    '&:disabled': { pointerEvents: 'none', opacity: 0.5 },
    '&[data-open]:hover': {
      bgcolor: 'var(--sidebar-accent, #f6f6f6)',
      color: 'var(--sidebar-accent-foreground, #18181a)',
    },
    '&[data-active]': {
      bgcolor: 'var(--sidebar-accent, #f6f6f6)',
      fontWeight: 500,
      color: 'var(--sidebar-accent-foreground, #18181a)',
    },
    '& svg': { width: '16px', height: '16px', flexShrink: 0 },
    '& > span:last-child': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    '[data-collapsible="icon"] &': { width: '32px', height: '32px', p: '8px' },
  }

  if (variant === 'outline') {
    base.bgcolor = 'var(--background, #f7f5ef)'
    base.boxShadow = '0 0 0 1px var(--sidebar-border, #f4f4f4)'
    base['&:hover'] = {
      bgcolor: 'var(--sidebar-accent, #f6f6f6)',
      color: 'var(--sidebar-accent-foreground, #18181a)',
      boxShadow: '0 0 0 1px var(--sidebar-accent, #f6f6f6)',
    }
  }

  if (size === 'sm') {
    base.height = '28px'
    base.fontSize = '12px'
  } else if (size === 'lg') {
    base.height = '48px'
    base['[data-collapsible="icon"] &'] = { width: '32px', height: '32px', p: 0 }
  } else {
    base.height = '32px'
  }

  return base as SxProps<Theme>
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & { variant?: 'default' | 'outline'; size?: 'default' | 'sm' | 'lg' }) {
  const { isMobile, state } = useSidebar()

  const button = asChild ? (
    <SlotRoot
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      data-menu-button
      className={className}
      {...(props as Record<string, unknown>)}
    />
  ) : (
    <Box
      component="button"
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      data-menu-button
      sx={menuButtonSx({ variant, size })}
      className={className}
      {...(props as Record<string, unknown>)}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === 'string') {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== 'collapsed' || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  sx,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  showOnHover?: boolean
  sx?: SxProps<Theme>
}) {
  if (asChild) {
    return (
      <SlotRoot
        data-slot="sidebar-menu-action"
        data-sidebar="menu-action"
        className={className}
        {...(props as Record<string, unknown>)}
      />
    )
  }

  return (
    <Box
      component="button"
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={className}
      sx={{
        position: 'absolute',
        top: '6px',
        right: '4px',
        display: 'flex',
        aspectRatio: '1 / 1',
        width: '20px',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        p: 0,
        color: 'var(--sidebar-foreground, #858b9c)',
        outline: '2px solid transparent',
        outlineOffset: '2px',
        transition: 'transform 0.15s',
        '[data-collapsible="icon"] &': { display: 'none' },
        '[data-menu-button]:hover ~ &': {
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '[data-menu-button][data-size="lg"] ~ &': { top: '10px' },
        '[data-menu-button][data-size="sm"] ~ &': { top: '4px' },
        '&::after': {
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          bottom: '-8px',
          left: '-8px',
        },
        '&:hover': {
          bgcolor: 'var(--sidebar-accent, #f6f6f6)',
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '&:focus-visible': { boxShadow: '0 0 0 2px var(--sidebar-ring, #18181a)' },
        '@media (min-width: 768px)': { '&::after': { display: 'none' } },
        '& > svg': { width: '16px', height: '16px', flexShrink: 0 },
        ...(showOnHover
          ? {
              '@media (min-width: 768px)': { opacity: 0 },
              '[data-menu-item]:hover &': { opacity: 1 },
            }
          : {}),
        ...(sx as Record<string, unknown>),
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={className}
      sx={{
        pointerEvents: 'none',
        position: 'absolute',
        right: '4px',
        display: 'flex',
        height: '20px',
        minWidth: '20px',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        px: '4px',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--sidebar-foreground, #858b9c)',
        fontVariantNumeric: 'tabular-nums',
        userSelect: 'none',
        '[data-collapsible="icon"] &': { display: 'none' },
        '[data-menu-button]:hover ~ &': {
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '[data-menu-button][data-size="lg"] ~ &': { top: '10px' },
        '[data-menu-button][data-size="sm"] ~ &': { top: '4px' },
        '[data-menu-button][data-active] ~ &': {
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<'div'> & {
  showIcon?: boolean
}) {
  // Random width between 50 to 90%.
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  })

  return (
    <Box
      component="div"
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={className}
      sx={{ display: 'flex', height: '32px', alignItems: 'center', gap: '8px', borderRadius: '6px', px: '8px' }}
      {...(props as Record<string, unknown>)}
    >
      {showIcon && (
        <Skeleton
          variant="rectangular"
          sx={{ width: '16px', height: '16px', borderRadius: '6px' }}
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        variant="rectangular"
        sx={{ height: '16px', maxWidth: 'var(--skeleton-width)', flex: 1 }}
        data-sidebar="menu-skeleton-text"
        style={
          {
            '--skeleton-width': width,
          } as React.CSSProperties
        }
      />
    </Box>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <Box
      component="ul"
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={className}
      sx={{
        mx: '14px',
        display: 'flex',
        minWidth: 0,
        transform: 'translateX(1px)',
        flexDirection: 'column',
        gap: '4px',
        borderLeft: '1px solid',
        borderColor: 'var(--sidebar-border, #f4f4f4)',
        px: '10px',
        py: '2px',
        '[data-collapsible="icon"] &': { display: 'none' },
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<'li'>) {
  return (
    <Box
      component="li"
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={className}
      sx={{ position: 'relative' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = 'md',
  isActive = false,
  className,
  sx,
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean
  size?: 'sm' | 'md'
  isActive?: boolean
  sx?: SxProps<Theme>
}) {
  if (asChild) {
    return (
      <SlotRoot
        data-slot="sidebar-menu-sub-button"
        data-sidebar="menu-sub-button"
        data-size={size}
        data-active={isActive}
        className={className}
        {...(props as Record<string, unknown>)}
      />
    )
  }

  return (
    <Box
      component="a"
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={className}
      sx={{
        display: 'flex',
        height: '28px',
        minWidth: 0,
        transform: 'translateX(-1px)',
        alignItems: 'center',
        gap: '8px',
        overflow: 'hidden',
        borderRadius: '6px',
        px: '8px',
        color: 'var(--sidebar-foreground, #858b9c)',
        outline: '2px solid transparent',
        outlineOffset: '2px',
        '[data-collapsible="icon"] &': { display: 'none' },
        '&:hover': {
          bgcolor: 'var(--sidebar-accent, #f6f6f6)',
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '&:focus-visible': { boxShadow: '0 0 0 2px var(--sidebar-ring, #18181a)' },
        '&:active': {
          bgcolor: 'var(--sidebar-accent, #f6f6f6)',
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '&[data-size="md"]': { fontSize: '14px' },
        '&[data-size="sm"]': { fontSize: '12px' },
        '&[data-active]': {
          bgcolor: 'var(--sidebar-accent, #f6f6f6)',
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        '& > span:last-child': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        '& > svg': {
          width: '16px',
          height: '16px',
          flexShrink: 0,
          color: 'var(--sidebar-accent-foreground, #18181a)',
        },
        ...(sx as Record<string, unknown>),
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
