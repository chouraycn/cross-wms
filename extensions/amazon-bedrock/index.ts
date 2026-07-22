import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'amazon-bedrock',
  name: 'Amazon Bedrock Provider',
  description: 'Amazon Bedrock managed LLM provider extension (Claude / Llama / Titan)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class AmazonBedrockProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Amazon Bedrock provider extension');

    const accessKeyId = context.secrets('AWS_ACCESS_KEY_ID');
    const secretAccessKey = context.secrets('AWS_SECRET_ACCESS_KEY');
    if (!accessKeyId || !secretAccessKey) {
      context.logger.warn('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not found in environment');
    }

    const config = {
      accessKeyId,
      secretAccessKey,
      region: context.config['region'] || 'us-east-1',
      models: [
        { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet', maxTokens: 8192 },
        { id: 'meta.llama3-3-70b-instruct-v1:0', name: 'Llama 3.3 70B', maxTokens: 8192 },
        { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', maxTokens: 512000 },
      ],
    };

    context.logger.info('Amazon Bedrock provider registered with config region:', config.region);
  }

  unregister(): void {
    console.log('Unregistering Amazon Bedrock provider extension');
  }
}
