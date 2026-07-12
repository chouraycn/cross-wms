import type { TTSProvider, TTSConfig, TTSResult } from './types';
import OpenAI from 'openai';

export class OpenAIProvider implements TTSProvider {
  id = 'openai';
  name = 'OpenAI';
  supportedVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  supportedLanguages = ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'it', 'ru'];

  private client: OpenAI | null = null;

  private getClient(apiKey: string): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async synthesize(text: string, config: TTSConfig): Promise<TTSResult> {
    const client = this.getClient(config.apiKey);
    const response = await client.audio.speech.create({
      model: config.model || 'tts-1',
      voice: (config.voiceId || 'alloy') as any,
      input: text,
      response_format: 'mp3',
      speed: config.rate || 1.0,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      audioBuffer: buffer,
      contentType: 'audio/mpeg',
    };
  }

  async listVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    return this.supportedVoices.map(name => ({
      id: name,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      language: 'en',
    }));
  }
}
