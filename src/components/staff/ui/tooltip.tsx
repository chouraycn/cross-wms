import * as React from 'react'
import { Tooltip as MuiTooltip } from '@mui/material'

import { cn } from './utils'

// 统一到 MUI：Tooltip 渲染交由 MUI Tooltip 完成，保留 Radix 的 compound API
// （TooltipProvider / Tooltip / TooltipTrigger / TooltipContent）与 data-slot。
type TooltipSide = 'top' | 'right' | 'bottom' | 'left'
type TooltipAlign = 'start' | 'center' | 'end'
type Placement = NonNullable<React.ComponentProps<typeof MuiTooltip>['placement']>

type TooltipCtxValue = {
  content: React.ReactNode
  setContent: (c: React.ReactNode) => void
  placement: Placement
  setPlacement: (p: Placement) => void
  enterDelay: number
  leaveDelay: number
}
const TooltipCtx = React.createContext<TooltipCtxValue>({
  content: null,
  setContent: () => {},
  placement: 'bottom',
  setPlacement: () => {},
  enterDelay: 0,
  leaveDelay: 0,
})

function TooltipProvider({
  delayDuration = 0,
  children,
}: {
  delayDuration?: number
  children?: React.ReactNode
}) {
  return (
    <TooltipCtx.Provider
      value={{
        content: null,
        setContent: () => {},
        placement: 'bottom',
        setPlacement: () => {},
        enterDelay: delayDuration,
        leaveDelay: 0,
      }}
    >
      {children}
    </TooltipCtx.Provider>
  )
}

function Tooltip({
  children,
  openDelay,
  closeDelay,
}: {
  children?: React.ReactNode
  openDelay?: number
  closeDelay?: number
}) {
  const [content, setContent] = React.useState<React.ReactNode>(null)
  const [placement, setPlacement] = React.useState<Placement>('bottom')
  const parent = React.useContext(TooltipCtx)
  const enterDelay = openDelay !== undefined ? openDelay : parent.enterDelay
  const leaveDelay = closeDelay !== undefined ? closeDelay : parent.leaveDelay
  return (
    <TooltipCtx.Provider value={{ content, setContent, placement, setPlacement, enterDelay, leaveDelay }}>
      {children}
    </TooltipCtx.Provider>
  )
}

function TooltipTrigger({
  asChild = false,
  children,
  ...props
}: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { content, placement, enterDelay, leaveDelay } = React.useContext(TooltipCtx)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return (
      <MuiTooltip
        title={content}
        placement={placement}
        enterDelay={enterDelay}
        leaveDelay={leaveDelay}
        disableInteractive
        arrow={false}
      >
        {React.cloneElement(child, { 'data-slot': 'tooltip-trigger', ...(props as Record<string, any>) } as Record<string, any>)}
      </MuiTooltip>
    )
  }
  return (
    <MuiTooltip
      title={content}
      placement={placement}
      enterDelay={enterDelay}
      leaveDelay={leaveDelay}
      disableInteractive
      arrow={false}
    >
      <button type="button" data-slot="tooltip-trigger" {...(props as Record<string, any>)}>
        {children}
      </button>
    </MuiTooltip>
  )
}

function TooltipContent({
  children,
  hidden,
  side = 'top',
  align = 'center',
  sideOffset,
  ...props
}: React.ComponentProps<'div'> & {
  hidden?: boolean
  side?: TooltipSide
  align?: TooltipAlign
  sideOffset?: number
}) {
  const { setContent, setPlacement } = React.useContext(TooltipCtx)
  const placement = (align === 'center' ? side : `${side}-${align}`) as Placement
  void sideOffset
  React.useEffect(() => {
    setContent(hidden ? null : children)
    setPlacement(placement)
    return () => setContent(null)
  }, [children, hidden, placement, setContent, setPlacement])
  void props
  return null
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
