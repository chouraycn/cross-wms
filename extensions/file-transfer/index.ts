import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'file-transfer',
  name: 'File Transfer Tool',
  description: 'File transfer tool extension for paired node file exchange',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

export default class FileTransferTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering File Transfer tool extension');

    const config = {
      maxBytes: (context.config['maxBytes'] as number) || 104857600,
      allowedRoots: (context.config['allowedRoots'] as string[]) || [],
      tool: 'file-transfer',
    };

    context.logger.info('File Transfer tool registered with maxBytes:', config.maxBytes);
  }

  unregister(): void {
    console.log('Unregistering File Transfer tool extension');
  }
}
