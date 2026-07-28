import * as React from 'react'
import { Box, InputBase } from '@mui/material'
import { Search } from 'lucide-react'
import type { SxProps } from '@mui/material/styles'

import { staffTokens } from '../lib/staffTokens.js'

type SearchComboProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  'aria-label'?: string
  sx?: SxProps
}

/**
 * 集成搜索组合（input + 提交按钮）。样式来自 staffTokens.searchCombo /
 * searchComboInput / searchComboButton，统一到主程序靛蓝主题，替代原 Tailwind
 * SEARCH_COMBO_CLASS / SEARCH_COMBO_INPUT_CLASS / SEARCH_COMBO_BUTTON_CLASS。
 */
export function SearchCombo({
  value,
  onChange,
  onSubmit,
  placeholder,
  'aria-label': ariaLabel,
  sx,
}: SearchComboProps) {
  return (
    <Box sx={[staffTokens.searchCombo, ...(sx ? [sx] : [])] as SxProps}>
      <InputBase
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) {
            event.preventDefault()
            onSubmit()
          }
        }}
        sx={staffTokens.searchComboInput}
      />
      <Box
        component="button"
        type="button"
        aria-label={ariaLabel ?? '搜索'}
        onClick={() => onSubmit?.()}
        sx={staffTokens.searchComboButton}
      >
        <Search size={14} />
      </Box>
    </Box>
  )
}
