import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types';
import { ElevenLabsProvider } from './providers/elevenlabs';
import { OpenAIProvider } from './providers/openai';
import type { TTSProvider, TTSConfig, TTSResult } from './providers/types';

const manifest: ExtensionManifest = {
  id: 'tts-core',
  name: 'TTS Core',
  description: 'Text-to-Speech core module with multiple providers',
  version: '1.0.0',
  kind: 'service',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

const providers: Map<string, TTSProvider> = new Map();

export default {
  manifest,
  register(context: ExtensionContext) {
    providers.set('elevenlabs', new ElevenLabsProvider());
    providers.set('openai', new OpenAIProvider());
    context.logger.info('TTS Core module registered with providers:', Array.from(providers.keys()));
  },
  unregister() {
    providers.clear();
  },
} as ExtensionProvider;

export { ElevenLabsProvider, OpenAIProvider };
export type { TTSProvider, TTSConfig, TTSResult };

export function getTTSProvider(providerId: string): TTSProvider | undefined {
  return providers.get(providerId);
}

export async function synthesizeText(
  text: string,
  config: TTSConfig
): Promise<TTSResult> {
  const provider = getTTSProvider(config.provider);
  if (!provider) {
    throw new Error(`TTS provider ${config.provider} not found`);
  }
  return provider.synthesize(text, config);
}
