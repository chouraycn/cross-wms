import yaml from 'js-yaml';

export interface SkillInstallStep {
  type: 'brew' | 'node' | 'go' | 'rust' | 'pip' | 'cargo' | 'download' | 'bash';
  name: string;
  url?: string;
  version?: string;
  args?: string[];
}

export interface SkillRequires {
  bins?: string[];
  anyBins?: string[];
  env?: string[];
  config?: string[];
}

export interface SkillMetadata {
  emoji?: string;
  os?: string[];
  requires?: SkillRequires;
  install?: SkillInstallStep[];
  [key: string]: unknown;
}

export interface SkillOpenClawConfig {
  emoji?: string;
  os?: string[];
  requires?: SkillRequires;
  install?: SkillInstallStep[];
  [key: string]: unknown;
}

export interface ParsedSkillMdWithMetadata {
  name?: string;
  description?: string;
  version?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  trigger?: string;
  triggers?: string[];
  status?: string;
  featured?: boolean;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
  executionMode?: string;
  metadata?: SkillMetadata;
  openclaw?: SkillOpenClawConfig;
  body: string;
  promptTemplate: string;
  hasError: boolean;
  errorMessage?: string;
}

function normalizeRequiresList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string').map(s => s.trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function parseInstallSteps(raw: unknown): SkillInstallStep[] {
  if (!raw || !Array.isArray(raw)) return [];
  const steps: SkillInstallStep[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const type = obj.type as string;
    const name = obj.name as string;
    if (!type || !name) continue;
    steps.push({
      type: type as SkillInstallStep['type'],
      name,
      url: obj.url as string | undefined,
      version: obj.version as string | undefined,
      args: Array.isArray(obj.args) ? obj.args.map(String) : undefined,
    });
  }
  return steps;
}

export function parseSkillMdWithMetadata(content: string): ParsedSkillMdWithMetadata {
  const trimmed = content.trimStart();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  
  let frontmatter: Record<string, unknown> = {};
  let body = content.trim();
  let hasError = false;
  let errorMessage: string | undefined;

  if (fmMatch) {
    try {
      frontmatter = yaml.load(fmMatch[1], { schema: yaml.DEFAULT_SCHEMA, json: true }) as Record<string, unknown> || {};
    } catch (err) {
      hasError = true;
      errorMessage = `YAML parse error: ${err instanceof Error ? err.message : String(err)}`;
    }
    body = fmMatch[2].trim();
  }

  const metadataRaw = frontmatter.metadata as Record<string, unknown> | undefined;
  // OpenClaw 格式中 openclaw 可能嵌套在 metadata 内部（metadata: { openclaw: { ... } }）
  const metadataOpenClawRaw = metadataRaw?.openclaw as Record<string, unknown> | undefined;
  const topLevelOpenClawRaw = frontmatter.openclaw as Record<string, unknown> | undefined;

  // openclaw 配置：优先顶层 frontmatter.openclaw，其次 metadata.openclaw
  const openclawRaw = topLevelOpenClawRaw || metadataOpenClawRaw;

  // metadata 字段来源：优先 metadata.openclaw（OpenClaw 特有嵌套格式），其次 metadata 本身
  const metadataSource = metadataOpenClawRaw || metadataRaw || {};

  const metadata: SkillMetadata = {};
  if (metadataSource) {
    metadata.emoji = metadataSource.emoji as string | undefined;
    metadata.os = normalizeRequiresList(metadataSource.os);
    metadata.install = parseInstallSteps(metadataSource.install);
    if (metadataSource.requires) {
      const req = metadataSource.requires as Record<string, unknown>;
      metadata.requires = {
        bins: normalizeRequiresList(req.bins),
        anyBins: normalizeRequiresList(req.anyBins),
        env: normalizeRequiresList(req.env),
        config: normalizeRequiresList(req.config),
      };
    }
  }

  const openclaw: SkillOpenClawConfig = {};
  if (openclawRaw && openclawRaw.requires) {
    const req = openclawRaw.requires as Record<string, unknown>;
    openclaw.requires = {
      bins: normalizeRequiresList(req.bins),
      anyBins: normalizeRequiresList(req.anyBins),
      env: normalizeRequiresList(req.env),
      config: normalizeRequiresList(req.config),
    };
  }

  const triggers = normalizeRequiresList(frontmatter.triggers);

  return {
    name: frontmatter.name as string | undefined,
    description: frontmatter.description as string | undefined,
    version: frontmatter.version as string | undefined,
    category: frontmatter.category as string | undefined,
    icon: frontmatter.icon as string | undefined,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : undefined,
    trigger: frontmatter.trigger as string | undefined,
    triggers: triggers.length > 0 ? triggers : undefined,
    status: frontmatter.status as string | undefined,
    featured: frontmatter.featured === true || frontmatter.featured === 'true',
    userInvocable: frontmatter['user-invocable'] === true || frontmatter['user-invocable'] === 'true',
    disableModelInvocation: frontmatter['disable-model-invocation'] === true || frontmatter['disable-model-invocation'] === 'true',
    executionMode: frontmatter.executionMode as string | undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    openclaw: Object.keys(openclaw).length > 0 ? openclaw : undefined,
    body,
    promptTemplate: body,
    hasError,
    errorMessage,
  };
}

export function getRequiresFromSkillMd(content: string): SkillRequires | undefined {
  const parsed = parseSkillMdWithMetadata(content);
  return parsed.metadata?.requires || parsed.openclaw?.requires;
}

export function getInstallStepsFromSkillMd(content: string): SkillInstallStep[] {
  const parsed = parseSkillMdWithMetadata(content);
  return parsed.metadata?.install || [];
}

export function getOsFromSkillMd(content: string): string[] {
  const parsed = parseSkillMdWithMetadata(content);
  return parsed.metadata?.os || [];
}
