export interface TTSConfig {
  provider: string;
  apiKey: string;
  voiceId?: string;
  model?: string;
  language?: string;
  rate?: number;
  pitch?: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string;
  duration?: number;
}

export interface TTSProvider {
  id: string;
  name: string;
  supportedVoices: string[];
  supportedLanguages: string[];
  synthesize(text: string, config: TTSConfig): Promise<TTSResult>;
  listVoices(): Promise<Array<{ id: string; name: string; language: string }>>;
}
