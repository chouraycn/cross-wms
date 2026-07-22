import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'stepfun',
  name: 'StepFun Provider',
  description: 'StepFun (Step) LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class StepFunProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering StepFun provider extension');

    const apiKey = context.secrets('STEPFUN_API_KEY');
    if (!apiKey) {
      context.logger.warn('STEPFUN_API_KEY not found in environment');
    }

    const config = {
      apiKey,
      baseUrl: 'https://api.stepfun.com/v1',
      models: [
        { id: 'step-2-16k', name: 'Step 2 16K', maxTokens: 16000 },
        { id: 'step-2-mini', name: 'Step 2 Mini', maxTokens: 8192 },
        { id: 'step-r1-mini', name: 'Step R1 Mini', maxTokens: 8192, reasoning: true },
      ],
    };

    context.logger.info('StepFun provider registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering StepFun provider extension');
  }
}
