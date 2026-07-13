import YAML from 'yaml';

export type ParsedSkillFrontmatter = Record<string, string>;

export interface SkillInstallSpec {
  id?: string;
  kind: 'brew' | 'node' | 'go' | 'uv' | 'download';
  label?: string;
  bins?: string[];
  os?: string[];
  formula?: string;
  package?: string;
  module?: string;
  url?: string;
  archive?: string;
  extract?: boolean;
  stripComponents?: number;
  targetDir?: string;
}

export interface OpenClawSkillMetadata {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
}

export interface SkillInvocationPolicy {
  userInvocable: boolean;
  disableModelInvocation: boolean;
}

export interface SkillExposure {
  includeInRuntimeRegistry: boolean;
  includeInAvailableSkillsPrompt: boolean;
  userInvocable: boolean;
}

export interface ParsedSkillMd {
  frontmatter: ParsedSkillFrontmatter;
  structuredMetadata: unknown;
  body: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  metadata?: OpenClawSkillMetadata;
}

export function extractFrontmatterBlock(content: string): string | undefined {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!normalized.startsWith('---')) {
    return undefined;
  }
  const endIndex = normalized.indexOf('\n---', 3);
  if (endIndex === -1) {
    return undefined;
  }
  return normalized.slice(4, endIndex);
}

export function parseFrontmatterBlock(content: string): ParsedSkillFrontmatter {
  const block = extractFrontmatterBlock(content);
  if (!block) {
    return {};
  }

  const lineParsed = parseLineFrontmatter(block);
  const yamlParsed = parseYamlFrontmatter(block);

  if (yamlParsed === null) {
    return lineFrontmatterToPlain(lineParsed);
  }

  const merged: ParsedSkillFrontmatter = {};
  for (const [key, yamlValue] of Object.entries(yamlParsed)) {
    merged[key] = yamlValue.value;
    const lineEntry = lineParsed[key];
    if (!lineEntry) continue;
    if (shouldPreferInlineLineValue({ lineEntry, yamlValue })) {
      merged[key] = lineEntry.value;
    }
  }

  for (const [key, lineEntry] of Object.entries(lineParsed)) {
    if (!(key in merged)) {
      merged[key] = lineEntry.value;
    }
  }

  return merged;
}

export function getStructuredFrontmatterValue(content: string, key: string): unknown {
  const block = extractFrontmatterBlock(content);
  if (!block) return undefined;

  try {
    const parsed = YAML.parse(block, { schema: 'core' }) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'object') return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function parseFrontmatterWithStructuredMetadata(content: string): {
  frontmatter: ParsedSkillFrontmatter;
  structuredMetadata: unknown;
} {
  const frontmatter = parseFrontmatterBlock(content);
  const structuredMetadata = getStructuredFrontmatterValue(content, 'metadata');
  return { frontmatter, structuredMetadata };
}

export function parseSkillMd(content: string): ParsedSkillMd {
  const { frontmatter, structuredMetadata } = parseFrontmatterWithStructuredMetadata(content);
  const body = extractSkillBody(content);
  const metadata = resolveOpenClawMetadata(frontmatter, structuredMetadata);

  return {
    frontmatter,
    structuredMetadata,
    body,
    name: frontmatter.name || frontmatter.title || '未知技能',
    description: frontmatter.description || '',
    version: frontmatter.version,
    author: frontmatter.author,
    metadata,
  };
}

function extractSkillBody(content: string): string {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!normalized.startsWith('---')) {
    return normalized.trim();
  }
  const endIndex = normalized.indexOf('\n---', 3);
  if (endIndex === -1) {
    return normalized.trim();
  }
  return normalized.slice(endIndex + 4).trim();
}

type ParsedFrontmatterLineEntry = {
  value: string;
  kind: 'inline' | 'multiline';
  rawInline: string;
};

type ParsedYamlValue = {
  value: string;
  kind: 'scalar' | 'structured';
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function coerceYamlFrontmatterValue(value: unknown): ParsedYamlValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    return { value: value.trim(), kind: 'scalar' };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value: String(value), kind: 'scalar' };
  }
  if (typeof value === 'object') {
    try {
      return { value: JSON.stringify(value), kind: 'structured' };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseYamlFrontmatter(block: string): Record<string, ParsedYamlValue> | null {
  try {
    const parsed = YAML.parse(block, { schema: 'core' }) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const result: Record<string, ParsedYamlValue> = {};
    for (const [rawKey, value] of Object.entries(parsed as Record<string, unknown>)) {
      const key = rawKey.trim();
      if (!key) continue;
      const coerced = coerceYamlFrontmatterValue(value);
      if (!coerced) continue;
      result[key] = coerced;
    }
    return result;
  } catch {
    return null;
  }
}

function extractMultiLineValue(lines: string[], startIndex: number): {
  value: string;
  linesConsumed: number;
} {
  const valueLines: string[] = [];
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      break;
    }
    valueLines.push(line);
    i += 1;
  }

  const combined = valueLines.join('\n').trim();
  return { value: combined, linesConsumed: i - startIndex };
}

function parseLineFrontmatter(block: string): Record<string, ParsedFrontmatterLineEntry> {
  const result: Record<string, ParsedFrontmatterLineEntry> = {};
  const lines = block.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (!match) {
      i += 1;
      continue;
    }

    const key = match[1];
    const inlineValue = match[2].trim();
    if (!key) {
      i += 1;
      continue;
    }

    if (!inlineValue && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine.startsWith(' ') || nextLine.startsWith('\t')) {
        const { value, linesConsumed } = extractMultiLineValue(lines, i);
        if (value) {
          result[key] = { value, kind: 'multiline', rawInline: inlineValue };
        }
        i += linesConsumed;
        continue;
      }
    }

    const value = stripQuotes(inlineValue);
    if (value) {
      result[key] = { value, kind: 'inline', rawInline: inlineValue };
    }
    i += 1;
  }

  return result;
}

function lineFrontmatterToPlain(parsed: Record<string, ParsedFrontmatterLineEntry>): ParsedSkillFrontmatter {
  const result: ParsedSkillFrontmatter = {};
  for (const [key, entry] of Object.entries(parsed)) {
    result[key] = entry.value;
  }
  return result;
}

function isYamlBlockScalarIndicator(value: string): boolean {
  return /^[|>][+-]?(\d+)?[+-]?$/.test(value);
}

function shouldPreferInlineLineValue(params: {
  lineEntry: ParsedFrontmatterLineEntry;
  yamlValue: ParsedYamlValue;
}): boolean {
  const { lineEntry, yamlValue } = params;
  if (yamlValue.kind !== 'structured') return false;
  if (lineEntry.kind !== 'inline') return false;
  if (isYamlBlockScalarIndicator(lineEntry.rawInline)) return false;
  return lineEntry.value.includes(':');
}

function normalizeStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string').map(s => s.trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

const BREW_FORMULA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@+._/-]*$/;
const GO_MODULE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~+\-/]*(?:@[A-Za-z0-9][A-Za-z0-9._~+\-/]*)?$/;
const UV_PACKAGE_PATTERN = /^[a-z0-9][a-z0-9._-]*(\[[a-z0-9,._-]+\])?(([><=!~]=?|===?)[a-z0-9.*_-]+)?$/i;

function normalizeSafeBrewFormula(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const formula = raw.trim();
  if (!formula || formula.startsWith('-') || formula.includes('\\') || formula.includes('..')) {
    return undefined;
  }
  if (!BREW_FORMULA_PATTERN.test(formula)) return undefined;
  return formula;
}

function normalizeSafeNpmSpec(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const spec = raw.trim();
  if (!spec || spec.startsWith('-')) return undefined;
  return spec;
}

function normalizeSafeGoModule(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const moduleSpec = raw.trim();
  if (!moduleSpec || moduleSpec.startsWith('-') || moduleSpec.includes('\\') || moduleSpec.includes('://')) {
    return undefined;
  }
  if (!GO_MODULE_PATTERN.test(moduleSpec)) return undefined;
  return moduleSpec;
}

function normalizeSafeUvPackage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const pkg = raw.trim();
  if (!pkg || pkg.startsWith('-') || pkg.includes('\\') || pkg.includes('://')) {
    return undefined;
  }
  if (!UV_PACKAGE_PATTERN.test(pkg)) return undefined;
  return pkg;
}

function normalizeSafeDownloadUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || /\s/.test(value)) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseInstallSpec(input: unknown): SkillInstallSpec | undefined {
  if (!input || typeof input !== 'object') return undefined;

  const raw = input as Record<string, unknown>;
  const kind = raw.kind as SkillInstallSpec['kind'];

  if (!kind || !['brew', 'node', 'go', 'uv', 'download'].includes(kind)) {
    return undefined;
  }

  const spec: SkillInstallSpec = { kind };

  if (typeof raw.id === 'string') spec.id = raw.id;
  if (typeof raw.label === 'string') spec.label = raw.label;
  if (raw.bins) spec.bins = normalizeStringList(raw.bins);

  const osList = normalizeStringList(raw.os);
  if (osList.length > 0) spec.os = osList;

  const formula = normalizeSafeBrewFormula(raw.formula);
  if (formula) spec.formula = formula;

  const cask = normalizeSafeBrewFormula(raw.cask);
  if (!spec.formula && cask) spec.formula = cask;

  if (kind === 'node') {
    const pkg = normalizeSafeNpmSpec(raw.package);
    if (pkg) spec.package = pkg;
  } else if (kind === 'uv') {
    const pkg = normalizeSafeUvPackage(raw.package);
    if (pkg) spec.package = pkg;
  }

  const moduleSpec = normalizeSafeGoModule(raw.module);
  if (moduleSpec) spec.module = moduleSpec;

  const downloadUrl = normalizeSafeDownloadUrl(raw.url);
  if (downloadUrl) spec.url = downloadUrl;

  if (typeof raw.archive === 'string') spec.archive = raw.archive;
  if (typeof raw.extract === 'boolean') spec.extract = raw.extract;
  if (typeof raw.stripComponents === 'number') spec.stripComponents = raw.stripComponents;
  if (typeof raw.targetDir === 'string') spec.targetDir = raw.targetDir;

  if (kind === 'brew' && !spec.formula) return undefined;
  if ((kind === 'node' || kind === 'uv') && !spec.package) return undefined;
  if (kind === 'go' && !spec.module) return undefined;
  if (kind === 'download' && !spec.url) return undefined;

  return spec;
}

function parseFrontmatterBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return defaultValue;
}

export function resolveSkillInvocationPolicy(frontmatter: ParsedSkillFrontmatter): SkillInvocationPolicy {
  return {
    userInvocable: parseFrontmatterBool(frontmatter['user-invocable'], true),
    disableModelInvocation: parseFrontmatterBool(frontmatter['disable-model-invocation'], false),
  };
}

export function resolveSkillExposure(frontmatter: ParsedSkillFrontmatter): SkillExposure {
  return {
    includeInRuntimeRegistry: parseFrontmatterBool(frontmatter['include-in-runtime-registry'], true),
    includeInAvailableSkillsPrompt: parseFrontmatterBool(frontmatter['include-in-available-skills-prompt'], true),
    userInvocable: parseFrontmatterBool(frontmatter['user-invocable'], true),
  };
}

export function resolveOpenClawMetadata(
  frontmatter: ParsedSkillFrontmatter,
  structuredMetadata?: unknown,
): OpenClawSkillMetadata | undefined {
  const metadataObj = (() => {
    if (structuredMetadata && typeof structuredMetadata === 'object') {
      return structuredMetadata;
    }
    if (frontmatter.metadata) {
      try {
        return JSON.parse(frontmatter.metadata);
      } catch {
        return undefined;
      }
    }
    return undefined;
  })();

  if (!metadataObj) return undefined;

  const m = metadataObj as Record<string, unknown>;
  const openclaw = m.openclaw as Record<string, unknown> | undefined;

  if (!openclaw) return undefined;

  const requires = (() => {
    const req = openclaw.requires;
    if (!req || typeof req !== 'object') return undefined;
    const r = req as Record<string, unknown>;
    const bins = normalizeStringList(r.bins);
    const anyBins = normalizeStringList(r.anyBins);
    const env = normalizeStringList(r.env);
    const config = normalizeStringList(r.config);
    if (bins.length === 0 && anyBins.length === 0 && env.length === 0 && config.length === 0) {
      return undefined;
    }
    return {
      ...(bins.length > 0 ? { bins } : {}),
      ...(anyBins.length > 0 ? { anyBins } : {}),
      ...(env.length > 0 ? { env } : {}),
      ...(config.length > 0 ? { config } : {}),
    };
  })();

  const install = (() => {
    const inst = openclaw.install;
    if (!inst) return undefined;
    if (Array.isArray(inst)) {
      const specs = inst.map(parseInstallSpec).filter((s): s is SkillInstallSpec => s !== undefined);
      return specs.length > 0 ? specs : undefined;
    }
    const spec = parseInstallSpec(inst);
    return spec ? [spec] : undefined;
  })();

  const osRaw = normalizeStringList(openclaw.os);

  const result: OpenClawSkillMetadata = {};

  if (typeof openclaw.always === 'boolean') result.always = openclaw.always;
  if (typeof openclaw.emoji === 'string') result.emoji = openclaw.emoji;
  if (typeof openclaw.homepage === 'string') result.homepage = openclaw.homepage;
  if (typeof openclaw.skillKey === 'string') result.skillKey = openclaw.skillKey;
  if (typeof openclaw.primaryEnv === 'string') result.primaryEnv = openclaw.primaryEnv;
  if (osRaw.length > 0) result.os = osRaw;
  if (requires) result.requires = requires;
  if (install) result.install = install;

  return result;
}
