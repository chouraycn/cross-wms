import type { PluginCapabilityKind, PluginManifest } from './types';

export type PluginManifestModelSupport = {
  supports: string[];
  excludes?: string[];
};

export type PluginManifestModelCatalog = {
  models: Array<{
    id: string;
    name?: string;
    provider?: string;
    capabilities?: string[];
  }>;
};

export type PluginManifestActivation = {
  requiresSetup?: boolean;
  setupEntry?: string;
  deferFullRuntime?: boolean;
};

export type PluginManifestSetup = {
  cliBackends?: string[];
};

export type PluginManifestContracts = {
  requires?: string[];
  provides?: string[];
};

export interface PluginManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: PluginManifest;
}

const REQUIRED_FIELDS: (keyof PluginManifest)[] = ['id', 'name', 'version', 'entry'];

const ID_REGEX = /^[a-z0-9-]+$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/;

export class ManifestValidator {
  static validate(raw: unknown): PluginManifestValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { valid: false, errors: ['Manifest must be an object'], warnings };
    }

    const manifest = raw as PluginManifest;

    for (const field of REQUIRED_FIELDS) {
      if (!manifest[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (manifest.id && !ID_REGEX.test(manifest.id)) {
      errors.push(`Invalid plugin id: ${manifest.id}. Must match ${ID_REGEX}`);
    }

    if (manifest.version && !VERSION_REGEX.test(manifest.version)) {
      errors.push(`Invalid version format: ${manifest.version}. Expected semver format`);
    }

    if (manifest.kind) {
      const kinds = Array.isArray(manifest.kind) ? manifest.kind : [manifest.kind];
      const validKinds: PluginCapabilityKind[] = [
        'tool', 'provider', 'embedding-provider', 'memory-host',
        'channel', 'hook', 'command', 'service',
      ];
      for (const kind of kinds) {
        if (!validKinds.includes(kind)) {
          errors.push(`Invalid kind: ${kind}`);
        }
      }
    }

    if (manifest.requiresPlugins && !Array.isArray(manifest.requiresPlugins)) {
      errors.push('requiresPlugins must be an array');
    }

    if (manifest.declaredCapabilities) {
      for (const cap of manifest.declaredCapabilities) {
        const validCaps: PluginCapabilityKind[] = [
          'tool', 'provider', 'embedding-provider', 'memory-host',
          'channel', 'hook', 'command', 'service',
        ];
        if (!validCaps.includes(cap)) {
          errors.push(`Invalid declared capability: ${cap}`);
        }
      }
    }

    if (manifest.entry && !manifest.entry.endsWith('.js') && !manifest.entry.endsWith('.ts')) {
      warnings.push(`Entry file should be .js or .ts: ${manifest.entry}`);
    }

    if (manifest.activation?.requiresSetup && !manifest.activation?.setupEntry) {
      warnings.push('activation.requiresSetup is true but setupEntry is not specified');
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    return { valid: true, errors: [], warnings, manifest };
  }

  static normalize(manifest: PluginManifest): PluginManifest {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? '',
      author: manifest.author ?? '',
      kind: manifest.kind ?? ['service'],
      channels: manifest.channels ?? [],
      providers: manifest.providers ?? [],
      requiresPlugins: manifest.requiresPlugins ?? [],
      enabledByDefault: manifest.enabledByDefault ?? true,
      configSchema: manifest.configSchema ?? {},
      entry: manifest.entry,
      dependencies: manifest.dependencies ?? [],
      permissions: manifest.permissions ?? [],
      keywords: manifest.keywords ?? [],
      homepage: manifest.homepage ?? '',
      repository: manifest.repository ?? '',
      license: manifest.license ?? 'MIT',
      minAppVersion: manifest.minAppVersion ?? '1.0.0',
      modelSupport: manifest.modelSupport,
      modelCatalog: manifest.modelCatalog,
      activation: manifest.activation,
      setup: manifest.setup,
      contracts: manifest.contracts,
      sdkVersion: manifest.sdkVersion ?? '1.0.0',
      registrationMode: manifest.registrationMode ?? 'full',
      declaredCapabilities: manifest.declaredCapabilities ?? [],
    };
  }

  static loadFromPath(filePath: string): PluginManifestValidationResult {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      const raw = JSON.parse(content);
      return this.validate(raw);
    } catch (e) {
      return {
        valid: false,
        errors: [`Failed to load manifest from ${filePath}: ${String(e)}`],
        warnings: [],
      };
    }
  }

  static compare(a: PluginManifest, b: PluginManifest): { changed: boolean; diffs: string[] } {
    const diffs: string[] = [];

    if (a.id !== b.id) diffs.push(`id: ${a.id} -> ${b.id}`);
    if (a.version !== b.version) diffs.push(`version: ${a.version} -> ${b.version}`);
    if (a.name !== b.name) diffs.push(`name: ${a.name} -> ${b.name}`);
    if (a.entry !== b.entry) diffs.push(`entry: ${a.entry} -> ${b.entry}`);

    const aKinds = Array.isArray(a.kind) ? a.kind.sort().join(',') : String(a.kind);
    const bKinds = Array.isArray(b.kind) ? b.kind.sort().join(',') : String(b.kind);
    if (aKinds !== bKinds) diffs.push(`kind: ${aKinds} -> ${bKinds}`);

    const aProviders = (a.providers ?? []).sort().join(',');
    const bProviders = (b.providers ?? []).sort().join(',');
    if (aProviders !== bProviders) diffs.push(`providers: ${aProviders} -> ${bProviders}`);

    const aChannels = (a.channels ?? []).sort().join(',');
    const bChannels = (b.channels ?? []).sort().join(',');
    if (aChannels !== bChannels) diffs.push(`channels: ${aChannels} -> ${bChannels}`);

    return { changed: diffs.length > 0, diffs };
  }
}

export function validateManifest(raw: unknown): PluginManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Manifest must be an object'], warnings: [] };
  }

  const manifest = raw as PluginManifest;

  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (manifest.id && !ID_REGEX.test(manifest.id)) {
    errors.push(`Invalid plugin id: ${manifest.id}. Must match ${ID_REGEX}`);
  }

  if (manifest.version && !VERSION_REGEX.test(manifest.version)) {
    errors.push(`Invalid version format: ${manifest.version}. Expected semver format`);
  }

  if (manifest.kind) {
    const kinds = Array.isArray(manifest.kind) ? manifest.kind : [manifest.kind];
    const validKinds: PluginCapabilityKind[] = [
      'tool', 'provider', 'embedding-provider', 'memory-host',
      'channel', 'hook', 'command', 'service',
    ];
    for (const kind of kinds) {
      if (!validKinds.includes(kind)) {
        errors.push(`Invalid kind: ${kind}`);
      }
    }
  }

  if (manifest.requiresPlugins && !Array.isArray(manifest.requiresPlugins)) {
    errors.push('requiresPlugins must be an array');
  }

  if (manifest.declaredCapabilities) {
    for (const cap of manifest.declaredCapabilities) {
      const validCaps: PluginCapabilityKind[] = [
        'tool', 'provider', 'embedding-provider', 'memory-host',
        'channel', 'hook', 'command', 'service',
      ];
      if (!validCaps.includes(cap)) {
        errors.push(`Invalid declared capability: ${cap}`);
      }
    }
  }

  if (manifest.entry && !manifest.entry.endsWith('.js') && !manifest.entry.endsWith('.ts')) {
    warnings.push(`Entry file should be .js or .ts: ${manifest.entry}`);
  }

  if ((manifest as unknown as { activation?: PluginManifestActivation })?.activation?.requiresSetup &&
      !(manifest as unknown as { activation?: PluginManifestActivation })?.activation?.setupEntry) {
    warnings.push('activation.requiresSetup is true but setupEntry is not specified');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors: [], warnings, manifest };
}

export function normalizeManifest(manifest: PluginManifest): PluginManifest {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    author: manifest.author ?? '',
    kind: manifest.kind ?? ['service'],
    channels: manifest.channels ?? [],
    providers: manifest.providers ?? [],
    requiresPlugins: manifest.requiresPlugins ?? [],
    enabledByDefault: manifest.enabledByDefault ?? true,
    configSchema: manifest.configSchema ?? {},
    entry: manifest.entry,
    dependencies: manifest.dependencies ?? [],
    permissions: manifest.permissions ?? [],
    keywords: manifest.keywords ?? [],
    homepage: manifest.homepage ?? '',
    repository: manifest.repository ?? '',
    license: manifest.license ?? 'MIT',
    minAppVersion: manifest.minAppVersion ?? '1.0.0',
    sdkVersion: manifest.sdkVersion ?? '1.0.0',
    registrationMode: manifest.registrationMode ?? 'full',
    declaredCapabilities: manifest.declaredCapabilities ?? [],
  };
}

export function loadManifestFromPath(filePath: string): PluginManifestValidationResult {
  try {
    const content = require('fs').readFileSync(filePath, 'utf8');
    const raw = JSON.parse(content);
    return validateManifest(raw);
  } catch (e) {
    return {
      valid: false,
      errors: [`Failed to load manifest from ${filePath}: ${String(e)}`],
      warnings: [],
    };
  }
}

export function compareManifests(a: PluginManifest, b: PluginManifest): { changed: boolean; diffs: string[] } {
  const diffs: string[] = [];

  if (a.id !== b.id) diffs.push(`id: ${a.id} -> ${b.id}`);
  if (a.version !== b.version) diffs.push(`version: ${a.version} -> ${b.version}`);
  if (a.name !== b.name) diffs.push(`name: ${a.name} -> ${b.name}`);
  if (a.entry !== b.entry) diffs.push(`entry: ${a.entry} -> ${b.entry}`);

  const aKinds = Array.isArray(a.kind) ? a.kind.sort().join(',') : String(a.kind);
  const bKinds = Array.isArray(b.kind) ? b.kind.sort().join(',') : String(b.kind);
  if (aKinds !== bKinds) diffs.push(`kind: ${aKinds} -> ${bKinds}`);

  const aProviders = (a.providers ?? []).sort().join(',');
  const bProviders = (b.providers ?? []).sort().join(',');
  if (aProviders !== bProviders) diffs.push(`providers: ${aProviders} -> ${bProviders}`);

  const aChannels = (a.channels ?? []).sort().join(',');
  const bChannels = (b.channels ?? []).sort().join(',');
  if (aChannels !== bChannels) diffs.push(`channels: ${aChannels} -> ${bChannels}`);

  return { changed: diffs.length > 0, diffs };
}

export function discoverPlugins(pluginDirs: string[]): PluginManifest[] {
  const manifests: PluginManifest[] = [];
  const fs = require('fs');
  const path = require('path');

  for (const dir of pluginDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(dir, entry.name, 'plugin.json');
        if (fs.existsSync(manifestPath)) {
          const result = loadManifestFromPath(manifestPath);
          if (result.valid && result.manifest) {
            manifests.push(normalizeManifest(result.manifest));
          }
        }
      }
    } catch (e) {
      console.warn(`[manifest] Failed to scan plugin directory ${dir}: ${String(e)}`);
    }
  }

  return manifests;
}