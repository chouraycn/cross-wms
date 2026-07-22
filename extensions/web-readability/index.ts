import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'web-readability',
  name: 'Web Readability Tool',
  description: 'Web page readability extraction tool extension for clean article content',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class WebReadabilityTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Web Readability tool extension');

    const config = {
      timeoutMs: (context.config['timeoutMs'] as number) || 30000,
      maxContentBytes: (context.config['maxContentBytes'] as number) || 524288,
      tool: 'web-readability',
    };

    context.logger.info('Web Readability tool registered with timeout:', config.timeoutMs);
  }

  unregister(): void {
    console.log('Unregistering Web Readability tool extension');
  }
}
