import * as React from 'react'
import { Accordion as MuiAccordion, AccordionSummary, AccordionDetails } from '@mui/material'
import { ChevronDownIcon } from 'lucide-react'

import { cn } from './utils'

// 统一到 MUI：Accordion 映射为 MUI Accordion（context 受控），保留 compound API 与 data-slot。
type AccordionCtxValue = {
  type: 'single' | 'multiple'
  value: string | string[] | undefined
  setValue: (v: string | string[] | undefined) => void
}
const AccordionCtx = React.createContext<AccordionCtxValue | null>(null)

function Accordion({
  type = 'single',
  collapsible,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: {
  type?: 'single' | 'multiple'
  collapsible?: boolean
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (v: string | string[] | undefined) => void
  children?: React.ReactNode
} & React.ComponentProps<'div'>) {
  const isControlled = value !== undefined
  const [internal, setInternal] = React.useState<string | string[] | undefined>(defaultValue)
  const current = isControlled ? value : internal
  const setValue = React.useCallback(
    (v: string | string[] | undefined) => {
      if (!isControlled) setInternal(v)
      onValueChange?.(v)
    },
    [isControlled, onValueChange],
  )
  void collapsible
  return (
    <AccordionCtx.Provider value={{ type, value: current, setValue }}>
      <div data-slot="accordion" {...(props as Record<string, any>)}>
        {children}
      </div>
    </AccordionCtx.Provider>
  )
}

function AccordionItem({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<'div'> & { value: string; children: NonNullable<React.ReactNode> }) {
  const ctx = React.useContext(AccordionCtx)
  const selected = ctx?.value
  const expanded = ctx?.type === 'multiple'
    ? Array.isArray(selected) && selected.includes(value)
    : selected === value
  const handleChange = (_e: React.SyntheticEvent, isExpanded: boolean) => {
    if (!ctx) return
    if (ctx.type === 'multiple') {
      const arr = Array.isArray(selected) ? [...selected] : []
      if (isExpanded) ctx.setValue([...arr, value])
      else ctx.setValue(arr.filter((v) => v !== value))
    } else {
      ctx.setValue(isExpanded ? value : undefined)
    }
  }
  return (
    <MuiAccordion
      data-slot="accordion-item"
      expanded={!!expanded}
      onChange={handleChange}
      disableGutters
      elevation={0}
      className={cn('border-b last:border-b-0', className)}
      sx={{ '&:before': { display: 'none' }, bgcolor: 'transparent' }}
      {...(props as Record<string, any>)}
    >
      {children}
    </MuiAccordion>
  )
}

function AccordionTrigger({ className, children, ...props }: React.ComponentProps<'button'>) {
  return (
    <AccordionSummary
      data-slot="accordion-trigger"
      expandIcon={<ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />}
      className={cn(
        'flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium outline-none transition-all hover:underline',
        className,
      )}
      {...(props as Record<string, any>)}
    >
      {children}
    </AccordionSummary>
  )
}

function AccordionContent({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <AccordionDetails
      data-slot="accordion-content"
      className={cn('pt-0 pb-4', className)}
      {...(props as Record<string, any>)}
    >
      {children}
    </AccordionDetails>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
