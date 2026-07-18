import type { ModelCatalogProvider } from '../types';

export type ProviderIndexPluginInstall = {
  npmSpec?: string;
  defaultChoice?: 'npm';
  minHostVersion?: string;
  expectedIntegrity?: string;
};

export type ProviderIndexPlugin = {
  id: string;
  package?: string;
  source?: string;
  install?: ProviderIndexPluginInstall;
};

export type ProviderIndexAuthChoice = {
  method: string;
  choiceId: string;
  choiceLabel: string;
  choiceHint?: string;
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
  optionKey?: string;
  cliFlag?: string;
  cliOption?: string;
  cliDescription?: string;
  onboardingScopes?: readonly ('text-inference' | 'image-generation' | 'music-generation')[];
};

export type ProviderIndexProvider = {
  id: string;
  name: string;
  plugin: ProviderIndexPlugin;
  docs?: string;
  categories?: readonly string[];
  authChoices?: readonly ProviderIndexAuthChoice[];
  previewCatalog?: ModelCatalogProvider;
};

export type ProviderIndex = {
  version: number;
  providers: Readonly<Record<string, ProviderIndexProvider>>;
};
