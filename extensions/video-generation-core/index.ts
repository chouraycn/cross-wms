import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'video-generation-core',
  name: 'Video Generation Core',
  description: 'Core video generation contract and routing extension',
  version: '1.0.0',
  kind: 'video-generation',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class VideoGenerationCore implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Video Generation Core extension');

    const config = {
      defaultProvider: (context.config['defaultProvider'] as string) || 'runway',
      supportedFormats: ['mp4', 'webm'],
      maxDurationSeconds: (context.config['maxDurationSeconds'] as number) || 10,
    };

    context.logger.info('Video Generation Core registered with default provider:', config.defaultProvider);
  }

  unregister(): void {
    console.log('Unregistering Video Generation Core extension');
  }
}
