import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'cloudflare-ai-gateway',
  name: 'Cloudflare AI Gateway Provider',
  description: 'Cloudflare AI Gateway proxying LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class CloudflareAiGatewayProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Cloudflare AI Gateway provider extension');

    const accountId = context.secrets('CLOUDFLARE_ACCOUNT_ID');
    const gatewayId = context.config['gatewayId'] as string | undefined;
    if (!accountId) {
      context.logger.warn('CLOUDFLARE_ACCOUNT_ID not found in environment');
    }

    const config = {
      accountId,
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${accountId || '{account_id}'}${gatewayId ? '/' + gatewayId : ''}`,
      models: [
        { id: '@cf/meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
      ],
    };

    context.logger.info('Cloudflare AI Gateway provider registered with gateway:', gatewayId || 'default');
  }

  unregister(): void {
    console.log('Unregistering Cloudflare AI Gateway provider extension');
  }
}
