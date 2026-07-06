# Voice Call Extension

Real-time voice call integration with telephony providers for cross-wms.

## Features

- Inbound and outbound call handling
- Call recording
- Real-time transcription
- Multiple provider support (Twilio, Telnyx)

## Configuration

Set one of the following environment variables:
- `TWILIO_API_KEY`
- `TELNYX_API_KEY`

## Usage

```typescript
import { extensionLoader } from '@cross-wms/extensions';

await extensionLoader.loadAll();
await extensionLoader.enable('voice-call');
```

## API

### initiateCall(config: CallConfig)

Initiates a voice call.

```typescript
import { initiateCall } from '@cross-wms/voice-call-extension';

const result = await initiateCall({
  to: '+1234567890',
  from: '+0987654321',
  record: true,
  transcribe: true,
});

console.log(result.callId, result.status);
```