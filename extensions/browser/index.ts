import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'browser',
  name: 'Browser Tool',
  description: 'Browser automation tool extension (CDP / Playwright snapshot-and-act)',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class BrowserTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Browser tool extension');

    const cfg = context.config as Record<string, any>;
    const chromeCfg = (cfg['chrome'] || {}) as Record<string, unknown>;
    const proxyCfg = (cfg['proxy'] || {}) as Record<string, unknown>;

    const config = {
      controlPort: (cfg['controlPort'] as number) || 0,
      chrome: {
        executablePath: (chromeCfg['executablePath'] as string) || '',
        headless: Boolean(chromeCfg['headless'] ?? true),
      },
      proxy: {
        enabled: Boolean(proxyCfg['enabled'] ?? false),
      },
      tool: 'browser',
    };

    context.logger.info('Browser tool registered with headless:', config.chrome.headless);
  }

  unregister(): void {
    console.log('Unregistering Browser tool extension');
  }
}
