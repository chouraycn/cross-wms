export const DefaultServiceUrls = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    apiEndpoint: process.env.OLLAMA_API_ENDPOINT || 'http://localhost:11434/v1',
    modelsEndpoint: process.env.OLLAMA_MODELS_ENDPOINT || 'http://localhost:11434/v1',
    nativeEndpoint: process.env.OLLAMA_NATIVE_ENDPOINT || 'http://localhost:11434/api/tags',
  },
  vllm: {
    defaultUrls: [
      'http://localhost:8000',
      'http://localhost:8001',
    ],
  },
  lmstudio: {
    defaultUrl: 'http://localhost:1234',
  },
  searxng: {
    defaultUrl: 'http://localhost:8080',
  },
  ollamaSearch: {
    defaultBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  },
};

export function getOllamaBaseUrl(): string {
  return DefaultServiceUrls.ollama.baseUrl;
}

export function getOllamaApiEndpoint(): string {
  return DefaultServiceUrls.ollama.apiEndpoint;
}
