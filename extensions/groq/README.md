# Groq Extension

Groq LLM provider extension for cross-wms.

## Features

- Supports multiple Groq models:
  - Mixtral 8x7B
  - Llama 3.1 70B
  - Llama 3.1 8B
- Streaming support
- Tool calling

## Configuration

Set the `GROQ_API_KEY` environment variable.

## Usage

```typescript
import { extensionLoader } from '@cross-wms/extensions';

await extensionLoader.loadAll();
await extensionLoader.enable('groq');
```