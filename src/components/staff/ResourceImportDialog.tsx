import { useEffect, type ChangeEvent } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/index.js'
import { Button } from './ui/button.js'
import Box from '@mui/material/Box'
import { staffTokens } from './lib/staffTokens.js'

export type ImportSourceOption = { value: string; label: string }
export type ImportChoiceItem = { id: string; label: ReactNode }

export type ResourceImportDialogProps = {
  open: boolean
  loading: boolean
  /** Header icon (14px). */
  icon: ReactNode
  title: string
  /** Optional target select for flows where the destination is not implied by page scope. */
  targetPlaceholder?: string
  targetLabel?: string
  targets?: ImportSourceOption[]
  targetId?: string
  /** Placeholder for the "copy source" select. */
  sourcePlaceholder: string
  sources: ImportSourceOption[]
  sourceId: string
  /** Caption above the checkbox list, e.g. "选择 SOP" / "选择技能". */
  itemsLabel: string
  items: ImportChoiceItem[]
  selectedIds: string[]
  /** Shown when a source is selected but has no importable items. */
  emptyText: string
  /** Shown before any source is selected. Defaults to "请先选择复制来源". */
  emptySourceText?: string
  /** Explanatory footer note. */
  note: ReactNode
  submitText?: string
  onTargetChange?: (value: string) => void
  onSourceChange: (value: string) => void
  onSelectedChange: (ids: string[]) => void
  onClose: () => void
  onSubmit: () => void
}

/**
 * Generic "copy resources from another scope" dialog shared by the SOP and
 * 技能 pages: a copy-source select plus a checkbox list of importable
 * resources. Kept dependency-free so it can be reused across modules without
 * pulling in business logic.
 */
export function ResourceImportDialog({
  open,
  loading,
  icon,
  title,
  targetPlaceholder,
  targetLabel = '复制到',
  targets,
  targetId,
  sourcePlaceholder,
  sources,
  sourceId,
  itemsLabel,
  items,
  selectedIds,
  emptyText,
  emptySourceText = '请先选择复制来源',
  note,
  submitText = '复制',
  onTargetChange,
  onSourceChange,
  onSelectedChange,
  onClose,
  onSubmit,
}: ResourceImportDialogProps) {
  const showTargetSelect = Boolean(targets && onTargetChange)
  const effectiveSourceId = sourceId || (sources.length === 1 ? sources[0].value : '')

  useEffect(() => {
    if (!open || sourceId || sources.length !== 1) return
    onSourceChange(sources[0].value)
  }, [onSourceChange, open, sourceId, sources])

  const toggle = (id: string, checked: boolean) => {
    onSelectedChange(checked ? [...selectedIds, id] : selectedIds.filter((value) => value !== id))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        sx={{
          position: 'relative',
          display: 'flex',
          maxHeight: 'calc(100dvh - 4rem)',
          width: 'calc(100% - 2rem)',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
          borderRadius: '14px',
          px: '20px',
          py: '16px',
          '@media (min-width: 640px)': { maxWidth: '640px' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'var(--muted-foreground)' }}>
          {icon}
          <DialogTitle
            sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 'none', color: 'var(--muted-foreground)' }}
          >
            {title}
          </DialogTitle>
        </Box>

        <Box
          sx={{
            display: 'flex',
            minHeight: 0,
            flex: 1,
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
            px: '12px',
          }}
        >
          {showTargetSelect && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box
                component="span"
                sx={{ fontSize: '11px', fontWeight: 600, color: '#858b9c' }}
              >
                {targetLabel}
              </Box>
              <Select value={targetId || undefined} onValueChange={onTargetChange}>
                <SelectTrigger sx={{ width: '100%' }}>
                  <SelectValue placeholder={targetPlaceholder || targetLabel} />
                </SelectTrigger>
                <SelectContent>
                  {(targets || []).map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Box
              component="span"
              sx={{ fontSize: '11px', fontWeight: 600, color: '#858b9c' }}
            >
              复制来源
            </Box>
            <Box sx={{ position: 'relative' }}>
              <Box
                component="select"
                value={effectiveSourceId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  onSourceChange(event.target.value)
                }
                sx={{
                  width: '100%',
                  appearance: 'none',
                  pl: '12px',
                  pr: '36px',
                  outline: 'none',
                  '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
                }}
              >
                <option value="" disabled>
                  {sourcePlaceholder}
                </option>
                {sources.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Box>
              <Box
                component={ChevronDown}
                sx={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  width: '16px',
                  height: '16px',
                  transform: 'translateY(-50%)',
                  color: '#858b9c',
                }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Box
              component="span"
              sx={{ fontSize: '11px', fontWeight: 600, color: '#858b9c' }}
            >
              {itemsLabel}
            </Box>
            <Box
              sx={{
                maxHeight: '300px',
                overflowY: 'auto',
                borderRadius: '10px',
                border: '1px solid',
                borderColor: '#eef0f4',
                p: '6px',
              }}
            >
              {items.length === 0 ? (
                <Box
                  component="div"
                  sx={{ py: '28px', textAlign: 'center', fontSize: '12px', color: '#858b9c' }}
                >
                  {sourceId ? emptyText : emptySourceText}
                </Box>
              ) : (
                items.map((item) => (
                  <Box
                    component="label"
                    key={item.id}
                    sx={{
                      display: 'flex',
                      cursor: 'pointer',
                      alignItems: 'center',
                      gap: '10px',
                      borderRadius: '8px',
                      px: '8px',
                      py: '7px',
                      '&:hover': { bgcolor: 'var(--surface-muted)' },
                    }}
                  >
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={(checked) => toggle(item.id, checked === true)}
                    />
                    <Box
                      component="span"
                      sx={{
                        minWidth: 0,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        color: 'var(--foreground)',
                      }}
                    >
                      {item.label}
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </Box>

          <Box
            component="p"
            sx={{ fontSize: '12px', lineHeight: '1.6', color: '#858b9c' }}
          >
            {note}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', px: '12px' }}>
          <Button
            variant="outline"
            disabled={loading}
            onClick={onClose}
            sx={staffTokens.dialogCancelButton}
          >
            取消
          </Button>
          <Button
            disabled={loading}
            onClick={onSubmit}
            sx={staffTokens.dialogPrimaryButton}
          >
            {submitText}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

export default ResourceImportDialog
