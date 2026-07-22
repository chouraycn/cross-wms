import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'image-generation-core',
  name: 'Image Generation Core',
  description: 'Core image generation contract and routing extension',
  version: '1.0.0',
  kind: 'image-generation',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class ImageGenerationCore implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Image Generation Core extension');

    const config = {
      defaultProvider: (context.config['defaultProvider'] as string) || 'fal',
      supportedFormats: ['png', 'webp', 'jpg'],
    };

    context.logger.info('Image Generation Core registered with default provider:', config.defaultProvider);
  }

  unregister(): void {
    console.log('Unregistering Image Generation Core extension');
  }
}
