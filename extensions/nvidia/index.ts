import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'nvidia',
  name: 'NVIDIA Provider',
  description: 'NVIDIA NIM / integrate API LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class NvidiaProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering NVIDIA provider extension');

    const apiKey = context.secrets('NVIDIA_API_KEY');
    if (!apiKey) {
      context.logger.warn('NVIDIA_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      models: [
        { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 131072 },
        { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', maxTokens: 64000, reasoning: true },
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', maxTokens: 131072 },
      ],
    };

    context.logger.info('NVIDIA provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering NVIDIA provider extension');
  }
}
