
import type { PluginConfigSchema, PluginDefinition, PluginSdkApi } from './types.js';
import { definePlugin } from './decorators.js';

type UnifiedModelCatalogEntry = {
  id: string;
  name?: string;
  provider: string;
  source: 'static' | 'live';
  [key: string]: any;
};

function normalizeStringEntries(entries: any[]): string[] {
  return entries.filter((v): v is string => typeof v === 'string');
}

function uniqueStrings(entries: string[]): string[] {
  return [...new Set(entries)];
}

type ProviderAuthMethod = {
  methodId?: string;
  label?: string;
  hint?: string;
  envVar?: string;
  [key: string]: any;
};

type ProviderPluginCatalog = {
  order?: string;
  run: (ctx: any) => Promise<ProviderCatalogResult>;
};

type ProviderCatalogResult = {
  provider?: any;
  [key: string]: any;
};

type ProviderCatalogContext = unknown;

type ProviderPlugin = {
  id?: string;
  label?: string;
  docsPath?: string;
  aliases?: string[];
  envVars?: string[];
  auth?: ProviderAuthMethod[];
  catalog?: ProviderPluginCatalog;
  staticCatalog?: ProviderPluginCatalog;
  buildReplayPolicy?: any;
  sanitizeReplayHistory?: any;
  resolveReasoningOutputMode?: any;
  [key: string]: any;
};

type UnifiedModelCatalogProviderContext = unknown;

type ProviderPluginWizardSetup = {
  choiceId?: string;
  choiceLabel?: string;
  choiceHint?: string;
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
  methodId?: string;
  onboardingScopes?: string[];
  modelAllowlist?: string[];
};

function createProviderApiKeyAuthMethod(options: {
  providerId: string;
  methodId: string;
  label: string;
  hint?: string;
  envVar?: string;
  expectedProviders?: string[];
  wizard?: any;
}): ProviderAuthMethod {
  return {
    methodId: options.methodId,
    label: options.label,
    hint: options.hint,
    envVar: options.envVar,
  };
}

type ApiKeyAuthMethodOptions = Parameters<typeof createProviderApiKeyAuthMethod>[0];

async function buildSingleProviderApiKeyCatalog(params: {
  ctx?: any;
  providerId?: string;
  buildProvider?: (ctx: any) => Promise<any>;
  allowExplicitBaseUrl?: boolean;
  [key: string]: any;
}): Promise<ProviderCatalogResult> {
  if (params.buildProvider) {
    const provider = await params.buildProvider(params.ctx);
    return { provider };
  }
  return { provider: undefined };
}

function projectProviderCatalogResultToUnifiedTextRows(
  _params: any,
): UnifiedModelCatalogEntry[] {
  return [];
}

function copyArrayEntries(value: any): any[] {
  return Array.isArray(value) ? [...value] : [];
}

function isRecord(value: any): value is Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readRecordValue(record: any, key: string): any {
  if (!isRecord(record)) {
    return undefined;
  }
  return record[key];
}

export type SingleProviderPluginApiKeyAuthOptions = Omit<
  ApiKeyAuthMethodOptions,
  'providerId' | 'expectedProviders' | 'wizard'
> & {
  expectedProviders?: string[];
  wizard?: false | ProviderPluginWizardSetup;
};

export type SingleProviderPluginCatalogOptions =
  | {
      buildProvider: Parameters<typeof buildSingleProviderApiKeyCatalog>[0]['buildProvider'];
      buildStaticProvider?: Parameters<typeof buildSingleProviderApiKeyCatalog>[0]['buildProvider'];
      allowExplicitBaseUrl?: boolean;
      run?: never;
      order?: never;
      staticRun?: never;
    }
  | {
      run: ProviderPluginCatalog['run'];
      staticRun?: ProviderPluginCatalog['run'];
      order?: ProviderPluginCatalog['order'];
      buildProvider?: never;
      buildStaticProvider?: never;
      allowExplicitBaseUrl?: never;
    };

export type SingleProviderPluginOptions = {
  id: string;
  name: string;
  description: string;
  version?: string;
  configSchema?: PluginConfigSchema | (() => PluginConfigSchema);
  provider?: {
    id?: string;
    label: string;
    docsPath: string;
    aliases?: string[];
    envVars?: string[];
    auth?: SingleProviderPluginApiKeyAuthOptions[];
    extraAuth?: ProviderAuthMethod[];
    catalog: SingleProviderPluginCatalogOptions;
  } & Omit<
    ProviderPlugin,
    'id' | 'label' | 'docsPath' | 'aliases' | 'envVars' | 'auth' | 'catalog' | 'staticCatalog'
  >;
  register?: (api: PluginSdkApi) => void | Promise<void>;
};

function resolveWizardSetup(params: {
  providerId: string;
  providerLabel: string;
  auth: SingleProviderPluginApiKeyAuthOptions;
}): ProviderPluginWizardSetup | undefined {
  if (params.auth.wizard === false) {
    return undefined;
  }
  const wizard = params.auth.wizard ?? {};
  const methodId = params.auth.methodId.trim();
  return {
    choiceId: wizard.choiceId ?? `${params.providerId}-${methodId}`,
    choiceLabel: wizard.choiceLabel ?? params.auth.label,
    ...(wizard.choiceHint ? { choiceHint: wizard.choiceHint } : {}),
    groupId: wizard.groupId ?? params.providerId,
    groupLabel: wizard.groupLabel ?? params.providerLabel,
    ...(wizard.groupHint ?? params.auth.hint
      ? { groupHint: wizard.groupHint ?? params.auth.hint }
      : {}),
    methodId,
    ...(wizard.onboardingScopes ? { onboardingScopes: wizard.onboardingScopes } : {}),
    ...(wizard.modelAllowlist ? { modelAllowlist: wizard.modelAllowlist } : {}),
  };
}

function copyProviderAuthOptions(value: any): SingleProviderPluginApiKeyAuthOptions[] {
  return copyArrayEntries(value).filter(isRecord) as SingleProviderPluginApiKeyAuthOptions[];
}

function copyProviderAuthMethods(value: any): ProviderAuthMethod[] {
  return copyArrayEntries(value).filter(isRecord) as ProviderAuthMethod[];
}

function resolveEnvVars(params: {
  envVars?: any;
  auth?: SingleProviderPluginApiKeyAuthOptions[];
}): string[] | undefined {
  const combined = normalizeStringEntries([
    ...copyArrayEntries(params.envVars),
    ...(params.auth ?? []).map((entry) => readRecordValue(entry, 'envVar')).filter(Boolean),
  ]);
  return combined.length > 0 ? uniqueStrings(combined) : undefined;
}

async function runUnifiedTextCatalog(params: {
  providerId: string;
  catalog: ProviderPluginCatalog;
  ctx: UnifiedModelCatalogProviderContext;
  source: UnifiedModelCatalogEntry['source'];
}): Promise<UnifiedModelCatalogEntry[]> {
  const result = await params.catalog.run(params.ctx);
  return projectProviderCatalogResultToUnifiedTextRows({
    providerId: params.providerId,
    result,
    source: params.source,
  });
}

export function defineSingleProviderPluginEntry(options: SingleProviderPluginOptions): PluginDefinition {
  const provider = options.provider;
  const providerId = provider?.id ?? options.id;
  const providerLabel = provider?.label ?? options.name;

  return definePlugin({
    id: options.id,
    name: options.name,
    description: options.description,
    version: options.version,
    ...(options.configSchema
      ? {
          configSchema:
            typeof options.configSchema === 'function'
              ? options.configSchema()
              : options.configSchema,
        }
      : {}),
    register(api) {
      if (provider) {
        const providerAuth = copyProviderAuthOptions(provider.auth);
        const acceptedProviderAuth: SingleProviderPluginApiKeyAuthOptions[] = [];
        const auth = providerAuth.flatMap((entry) => {
          try {
            const { wizard: _wizard, ...authParams } = entry;
            const wizard = resolveWizardSetup({
              providerId,
              providerLabel,
              auth: entry,
            });
            const method = createProviderApiKeyAuthMethod({
              ...authParams,
              providerId,
              expectedProviders: entry.expectedProviders ?? [providerId],
              ...(wizard ? { wizard } : {}),
            });
            acceptedProviderAuth.push(entry);
            return [method];
          } catch {
            return [];
          }
        });
        const envVars = resolveEnvVars({
          envVars: provider.envVars,
          auth: acceptedProviderAuth,
        });
        auth.push(...copyProviderAuthMethods(provider.extraAuth));

        let catalog: ProviderPluginCatalog;
        if ('run' in provider.catalog) {
          const catalogRun = provider.catalog.run;
          catalog = {
            order: provider.catalog.order ?? 'simple',
            run: catalogRun!,
          };
        } else {
          const buildProvider = provider.catalog.buildProvider;
          catalog = {
            order: 'simple',
            run: (ctx: ProviderCatalogContext): Promise<ProviderCatalogResult> =>
              buildSingleProviderApiKeyCatalog({
                ctx,
                providerId,
                buildProvider,
                ...(provider.catalog.allowExplicitBaseUrl ? { allowExplicitBaseUrl: true } : {}),
              }),
          };
        }

        const staticCatalog: ProviderPluginCatalog | undefined =
          'run' in provider.catalog
            ? provider.catalog.staticRun
              ? {
                  order: provider.catalog.order ?? 'simple',
                  run: provider.catalog.staticRun,
                }
              : undefined
            : provider.catalog.buildStaticProvider
              ? {
                  order: 'simple',
                  run: async () => ({
                    provider: await provider.catalog.buildStaticProvider!({}),
                  }),
                }
              : undefined;

        const providerMetadata = {
          id: providerId,
          label: providerLabel,
          docsPath: provider.docsPath,
          ...(provider.aliases ? { aliases: provider.aliases } : {}),
          ...(envVars ? { envVars } : {}),
          auth,
          catalog,
          ...(staticCatalog ? { staticCatalog } : {}),
          ...Object.fromEntries(
            Object.entries(provider).filter(
              ([key]) =>
                ![
                  'id',
                  'label',
                  'docsPath',
                  'aliases',
                  'envVars',
                  'auth',
                  'extraAuth',
                  'catalog',
                  'staticCatalog',
                ].includes(key),
            ),
          ),
        };

        api.registerHook(
          `provider:${providerId}:metadata`,
          () => providerMetadata,
          { priority: 0, metadata: { provider: providerId } },
        );

        api.registerHook(
          `provider:${providerId}:catalog`,
          async (ctx: any) => {
            return runUnifiedTextCatalog({
              providerId,
              catalog,
              ctx,
              source: 'live',
            });
          },
          { priority: 0, metadata: { provider: providerId } },
        );

        if (staticCatalog) {
          api.registerHook(
            `provider:${providerId}:static-catalog`,
            async (ctx: any) => {
              return runUnifiedTextCatalog({
                providerId,
                catalog: staticCatalog,
                ctx,
                source: 'static',
              });
            },
            { priority: 0, metadata: { provider: providerId } },
          );
        }
      }

      options.register?.(api);
    },
  });
}
