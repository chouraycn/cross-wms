/**
 * 应用版本号常量。
 *
 * 由 Vite 在构建时通过 `__APP_VERSION__` 全局注入；脱离旧 `components/Settings/`
 * 目录后单独承载，供 SidebarLogo / SettingsAbout / SettingsPopover 共用。
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
