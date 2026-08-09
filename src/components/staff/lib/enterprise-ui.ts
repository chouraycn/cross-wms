import { formatClientDateTime } from './timezone.js'

/**
 * Shared Tailwind class tokens for the StaffDeck list pages (SOP, skills,
 * scheduled tasks, employee memories, chat logs, ...). Keeping them in one
 * place avoids copy-pasting the exact same dropdown / select / card styling
 * into every page.
 *
 * 2026-08-09 对齐：原硬编码为靛蓝冷灰（#e3e7f1/#464c5e/#757f9c/#18181a 等），与
 * iframe 内 StaffDeck 暖色 teal 设计系统不一致。现统一改为 `src/styles/staffdeck.css`
 * 的员工调色板取值（border #ded7cc / ink-soft #343633 / muted-foreground #6d726e /
 * primary #0f766e / surface-muted #eeece4 等），主操作按钮改为 teal，与数字员工对齐。
 */

/** Dropdown menu item (icon + label, 12px muted text). */
export const MENU_ITEM_CLASS =
  'cursor-pointer gap-[6px] rounded-[10px] px-[12px] py-[6px] text-[12px] text-[#858b9c] focus:text-[#20201d] [&_svg]:size-[14px]'

/** Destructive (red) dropdown menu item. */
export const MENU_ITEM_DANGER_CLASS =
  'cursor-pointer gap-[6px] rounded-[10px] px-[12px] py-[6px] text-[12px] text-[#d20b0b] focus:bg-[#fce7e7] focus:text-[#d20b0b] focus:[&_svg]:text-[#d20b0b]! [&_svg]:size-[14px]'

/** Dropdown menu popover container (rounded white card + soft shadow). */
export const MENU_CONTENT_CLASS =
  'flex w-auto min-w-[140px] flex-col gap-[4px] rounded-[14px] border-0 bg-white p-[4px] shadow-[0px_0px_8px_rgba(0,0,0,0.1)] ring-0 [--accent:#e1f1ed] [--accent-foreground:#0f766e]'

/** shadcn `Select` trigger styled to match the 34px filter controls. */
export const SELECT_TRIGGER_CLASS =
  'h-[34px] data-[size=default]:h-[34px] rounded-[10px] border-[0.5px] border-[#ded7cc] bg-white text-[12px] text-[#343633] shadow-none data-placeholder:text-[#858b9c] hover:border-[#cfc5b7] focus-visible:border-[#0f766e] focus-visible:ring-0'

/** Mobile (<768px) list card wrapper. */
export const MOBILE_CARD_CLASS =
  'min-w-0 rounded-[8px] border border-[#ded7cc] bg-white p-[14px]'

/** Dialog footer bar — white background, top border, right-aligned actions. */
export const DIALOG_FOOTER_CLASS =
  'flex items-center justify-end gap-[8px] bg-white px-[24px] py-[12px]'

/** Standard dialog cancel button. */
export const DIALOG_CANCEL_BUTTON_CLASS =
  'h-[32px] min-w-[80px] rounded-[10px] border-[#ded7cc] bg-white px-[12px] text-[14px] font-normal text-[#343633] hover:border-[#ded7cc] hover:bg-[#eeece4] hover:text-[#20201d]'

/** Standard dialog primary confirm button (teal, 与数字员工主色对齐). */
export const DIALOG_PRIMARY_BUTTON_CLASS =
  'h-[32px] min-w-[80px] rounded-[10px] bg-[#0f766e] px-[12px] text-[14px] font-normal text-white hover:bg-[#0c5f59]'

/** Standard outline action button (toolbar refresh, card actions, etc.). */
export const OUTLINE_ACTION_BUTTON_CLASS =
  'h-[34px] gap-[4px] rounded-[10px] border-[0.5px] border-[#ded7cc] bg-white px-[20px] text-[12px] font-normal text-[#6d726e] hover:border-[#cfc5b7] hover:bg-white hover:text-[#20201d]'

/** Compact outline action button for inline card headers. */
export const OUTLINE_ACTION_BUTTON_SM_CLASS =
  'h-[32px] gap-[4px] rounded-[10px] border-[0.5px] border-[#ded7cc] bg-white px-[12px] text-[12px] font-normal text-[#343633] hover:border-[#cfc5b7] hover:bg-[#eeece4] hover:text-[#20201d] [&_svg:not([class*="size-"])]:size-[14px]'

/** Integrated search combo wrapper (input + submit button). */
export const SEARCH_COMBO_CLASS =
  'flex h-[32px] min-w-0 items-stretch overflow-hidden rounded-[10px] border-[0.5px] border-[#ded7cc] bg-white transition-colors focus-within:border-[#0f766e]'

/** Integrated search combo input field. */
export const SEARCH_COMBO_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent px-[14px] text-[14px] text-[#20201d] outline-none placeholder:text-[#9a9b95]'

/** Integrated search combo submit button (teal, 与数字员工主色对齐). */
export const SEARCH_COMBO_BUTTON_CLASS =
  'shrink-0 bg-[#0f766e] px-[20px] text-[14px] font-normal text-white transition-colors hover:bg-[#0c5f59] disabled:pointer-events-none disabled:opacity-50'

/** Format a backend timestamp in the active UI locale, or `-` when empty/invalid. */
export function formatDateTime(value?: string): string {
  return formatClientDateTime(value, '-')
}
