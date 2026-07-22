export type ExtensionKind =
  | 'provider'
  | 'embedding-provider'
  | 'memory-host'
  | 'channel'
  | 'tool'
  | 'service'
  | 'web-search'
  | 'image-generation'
  | 'video-generation'
  | 'audio-provider'
  | 'security-provider'
  | 'api-integration';

export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  kind: ExtensionKind;
  sdkVersion: string;
  dependencies?: Record<string, string>;
  configSchema?: Record<string, unknown>;
  requiresAuth?: boolean;
  authType?: 'api-key' | 'oauth' | 'none';
}

export interface ExtensionContext {
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  config: Record<string, unknown>;
  secrets: (key: string) => string | undefined;
}

export interface ExtensionProvider {
  manifest: ExtensionManifest;
  register(context: ExtensionContext): void;
  unregister?(): void;
}

export interface ExtensionEntry {
  default: ExtensionProvider;
}

export interface ExtensionRegistryEntry {
  id: string;
  manifest: ExtensionManifest;
  provider: ExtensionProvider;
  enabled: boolean;
}

export interface ExtensionLoaderOptions {
  extensionDirs?: string[];
  ignorePatterns?: string[];
  logger?: ExtensionContext['logger'];
}