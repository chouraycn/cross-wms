/**
 * Shared styles and constants for Settings tab sub-components.
 * Extracted from SettingsPanel.tsx to avoid duplication.
 */

/** Switch component style — dark checked state */
export const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
} as const;

/** TextField component style — consistent font sizing */
export const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
} as const;

/** App version injected by Vite at build time */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
