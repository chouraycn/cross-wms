import type { TTSProvider, TTSConfig, TTSResult } from './types';
import { ElevenLabsClient } from 'elevenlabs';

export class ElevenLabsProvider implements TTSProvider {
  id = 'elevenlabs';
  name = 'ElevenLabs';
  supportedVoices = ['Rachel', 'Domi', 'Bella', 'Antoni', 'Elli', 'Josh', 'Arnold', 'Adam', 'Sam'];
  supportedLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'];

  private client: ElevenLabsClient | null = null;

  private getClient(apiKey: string): ElevenLabsClient {
    if (!this.client) {
      this.client = new ElevenLabsClient({ apiKey });
    }
    return this.client;
  }

  async synthesize(text: string, config: TTSConfig): Promise<TTSResult> {
    const client = this.getClient(config.apiKey);
    const audio = await client.generate({
      text,
      model_id: config.model || 'eleven_monolingual_v1',
      voice_id: config.voiceId || 'Rachel',
      language_code: config.language || 'en',
    });

    const buffer = Buffer.from(await audio.arrayBuffer());
    return {
      audioBuffer: buffer,
      contentType: 'audio/mpeg',
    };
  }

  async listVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    return this.supportedVoices.map(name => ({
      id: name.toLowerCase(),
      name,
      language: 'en',
    }));
  }
}
