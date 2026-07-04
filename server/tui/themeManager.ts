/**
 * TUI 主题管理器
 *
 * 支持运行时切换主题（通过 /theme dark|light|auto 命令）
 * 将当前主题写入 OPENCLAW_THEME 环境变量，使子进程能继承
 */

import { getTheme as getThemeBase } from './theme.js';
import type { TuiTheme } from './types.js';
import { logger } from '../logger.js';

export type ThemeName = 'dark' | 'light' | 'auto';

class ThemeManager {
  private current: TuiTheme;
  private name: ThemeName;

  constructor() {
    this.name = (process.env.OPENCLAW_THEME as ThemeName) ?? 'auto';
    if (this.name !== 'dark' && this.name !== 'light' && this.name !== 'auto') {
      this.name = 'auto';
    }
    this.current = getThemeBase(this.name === 'auto' ? undefined : this.name);
  }

  getTheme(): TuiTheme {
    return this.current;
  }

  getName(): ThemeName {
    return this.name;
  }

  /**
   * 切换主题
   * @returns 切换后的主题对象
   */
  switchTheme(name: ThemeName): TuiTheme {
    if (name !== 'dark' && name !== 'light' && name !== 'auto') {
      throw new Error(`未知主题: ${name}，可选: dark/light/auto`);
    }
    this.name = name;
    this.current = getThemeBase(name === 'auto' ? undefined : name);
    // 同步到环境变量
    if (name === 'auto') {
      delete process.env.OPENCLAW_THEME;
    } else {
      process.env.OPENCLAW_THEME = name;
    }
    logger.debug(`[TUI Theme] 已切换到主题: ${name}`);
    return this.current;
  }

  /**
   * 列出可用主题
   */
  listThemes(): ThemeName[] {
    return ['dark', 'light', 'auto'];
  }
}

export const themeManager = new ThemeManager();
