export interface TUIConfig {
  backend: 'embedded' | 'http';
  theme: 'auto' | 'light' | 'dark';
  http: {
    baseUrl: string;
    apiKey?: string;
  };
  historyLimit: number;
  wordWrap: boolean;
}

export const DEFAULT_TUI_CONFIG: TUIConfig = {
  backend: 'embedded',
  theme: 'auto',
  http: {
    baseUrl: 'http://127.0.0.1:3000',
  },
  historyLimit: 100,
  wordWrap: true,
};

export function getDefaultConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.crosswms/tui-config.json`;
}

export function validateTuiConfig(config: unknown): config is TUIConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  if (c.backend !== 'embedded' && c.backend !== 'http') return false;
  if (c.theme !== 'auto' && c.theme !== 'light' && c.theme !== 'dark') return false;
  if (typeof c.historyLimit !== 'number') return false;
  if (typeof c.wordWrap !== 'boolean') return false;
  return true;
}

export function loadTuiConfig(configPath?: string): TUIConfig {
  try {
    const path = configPath || getDefaultConfigPath();
    const fs = require('node:fs');
    if (fs.existsSync(path)) {
      const raw = fs.readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      if (validateTuiConfig(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_TUI_CONFIG };
}

export function saveTuiConfig(config: TUIConfig, configPath?: string): void {
  const path = configPath || getDefaultConfigPath();
  const fs = require('node:fs');
  const pathModule = require('node:path');
  const dir = pathModule.dirname(path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
}
