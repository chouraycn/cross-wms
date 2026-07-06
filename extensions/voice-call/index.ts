import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'voice-call',
  name: 'Voice Call',
  description: 'Real-time voice call integration with telephony providers',
  version: '1.0.0',
  kind: 'service',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

export default class VoiceCallExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering voice-call extension');

    const apiKey = context.secrets('TWILIO_API_KEY') || context.secrets('TELNYX_API_KEY');
    if (!apiKey) {
      context.logger.warn('No telephony API key found (TWILIO_API_KEY or TELNYX_API_KEY)');
    }

    const config = {
      apiKey,
      providers: ['twilio', 'telnyx'],
      features: {
        inbound: true,
        outbound: true,
        recording: true,
        transcription: true,
      },
    };

    context.logger.info('Voice-call extension registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering voice-call extension');
  }
}

export interface CallConfig {
  to: string;
  from: string;
  webhookUrl?: string;
  record?: boolean;
  transcribe?: boolean;
}

export interface CallResult {
  callId: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed';
  recordingUrl?: string;
  transcription?: string;
}

export async function initiateCall(config: CallConfig): Promise<CallResult> {
  return {
    callId: `call-${Date.now()}`,
    status: 'queued',
  };
}