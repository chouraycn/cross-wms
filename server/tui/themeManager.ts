import type { TUIThemeMode, TUIPalette } from './types.js';
import { getPalette, palette } from './theme/theme.js';

class ThemeManager {
  private currentMode: TUIThemeMode = 'auto';
  private currentPalette: TUIPalette = palette;

  getTheme(): { mode: TUIThemeMode; palette: TUIPalette } {
    return { mode: this.currentMode, palette: this.currentPalette };
  }

  switchTheme(mode: TUIThemeMode): void {
    this.currentMode = mode;
    this.currentPalette = getPalette(mode);
  }

  getMode(): TUIThemeMode {
    return this.currentMode;
  }

  getPalette(): TUIPalette {
    return this.currentPalette;
  }
}

export const themeManager = new ThemeManager();
