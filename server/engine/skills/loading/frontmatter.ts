import type {
  ParsedSkillFrontmatter,
  SkillMetadata,
  SkillInvocationPolicy,
  SkillInstallSpec,
} from "../types.js";

export function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  const result: ParsedSkillFrontmatter = {};
  
  if (!content.startsWith("---")) {
    return result;
  }
  
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return result;
  }
  
  const frontmatterBlock = content.slice(3, endIndex).trim();
  const lines = frontmatterBlock.split("\n");
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    if (key) {
      result[key] = value;
    }
  }
  
  return result;
}

function getFrontmatterString(
  frontmatter: ParsedSkillFrontmatter,
  key: string,
): string | undefined {
  return frontmatter[key];
}

function parseFrontmatterBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return defaultValue;
}

function normalizeStringList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const BREW_FORMULA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@+._/-]*$/;
const GO_MODULE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~+\-/]*(?:@[A-Za-z0-9][A-Za-z0-9._~+\-/]*)?$/;
const UV_PACKAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-[\]=<>!~+,]*$/;
const NPM_PACKAGE_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function normalizeSafeBrewFormula(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const formula = raw.trim();
  if (!formula || formula.startsWith("-") || formula.includes("\\") || formula.includes("..")) {
    return undefined;
  }
  if (!BREW_FORMULA_PATTERN.test(formula)) {
    return undefined;
  }
  return formula;
}

function normalizeSafeNpmSpec(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const spec = raw.trim();
  if (!spec || spec.startsWith("-")) {
    return undefined;
  }
  const atIndex = spec.lastIndexOf("@");
  const pkgName = atIndex > 0 ? spec.slice(0, atIndex) : spec;
  if (!NPM_PACKAGE_PATTERN.test(pkgName)) {
    return undefined;
  }
  return spec;
}

function normalizeSafeGoModule(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const moduleSpec = raw.trim();
  if (
    !moduleSpec ||
    moduleSpec.startsWith("-") ||
    moduleSpec.includes("\\") ||
    moduleSpec.includes("://")
  ) {
    return undefined;
  }
  if (!GO_MODULE_PATTERN.test(moduleSpec)) {
    return undefined;
  }
  return moduleSpec;
}

function normalizeSafeUvPackage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const pkg = raw.trim();
  if (!pkg || pkg.startsWith("-") || pkg.includes("\\") || pkg.includes("://")) {
    return undefined;
  }
  if (!UV_PACKAGE_PATTERN.test(pkg)) {
    return undefined;
  }
  return pkg;
}

function normalizeSafeDownloadUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value || /\s/.test(value)) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function resolveSkillInvocationPolicy(
  frontmatter: ParsedSkillFrontmatter,
): SkillInvocationPolicy {
  return {
    userInvocable: parseFrontmatterBool(getFrontmatterString(frontmatter, "user-invocable"), true),
    disableModelInvocation: parseFrontmatterBool(
      getFrontmatterString(frontmatter, "disable-model-invocation"),
      false,
    ),
  };
}

export function resolveSkillMetadata(
  frontmatter: ParsedSkillFrontmatter,
): SkillMetadata | undefined {
  const openclawBlock = getFrontmatterString(frontmatter, "openclaw");
  if (!openclawBlock) {
    const simpleMetadata = extractSimpleMetadata(frontmatter);
    return Object.keys(simpleMetadata).length > 0 ? simpleMetadata : undefined;
  }
  return parseOpenClawBlock(openclawBlock);
}

function extractSimpleMetadata(frontmatter: ParsedSkillFrontmatter): SkillMetadata {
  const result: SkillMetadata = {};
  
  if (frontmatter.emoji) result.emoji = frontmatter.emoji;
  if (frontmatter.homepage) result.homepage = frontmatter.homepage;
  if (frontmatter["skill-key"]) result.skillKey = frontmatter["skill-key"];
  if (frontmatter["primary-env"]) result.primaryEnv = frontmatter["primary-env"];
  
  const osList = normalizeStringList(frontmatter.os);
  if (osList.length > 0) result.os = osList;
  
  const requires = extractRequires(frontmatter);
  if (requires) result.requires = requires;
  
  return result;
}

function extractRequires(frontmatter: ParsedSkillFrontmatter): SkillMetadata["requires"] | undefined {
  const result: NonNullable<SkillMetadata["requires"]> = {};
  
  const bins = normalizeStringList(frontmatter["requires-bins"]);
  if (bins.length > 0) result.bins = bins;
  
  const anyBins = normalizeStringList(frontmatter["requires-any-bins"]);
  if (anyBins.length > 0) result.anyBins = anyBins;
  
  const env = normalizeStringList(frontmatter["requires-env"]);
  if (env.length > 0) result.env = env;
  
  const config = normalizeStringList(frontmatter["requires-config"]);
  if (config.length > 0) result.config = config;
  
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseOpenClawBlock(block: string): SkillMetadata | undefined {
  const result: SkillMetadata = {};
  const lines = block.split(/[;,\n]+/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    
    const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();
    
    switch (key) {
      case "always":
        result.always = parseFrontmatterBool(value, false);
        break;
      case "skillkey":
      case "skill-key":
        result.skillKey = value;
        break;
      case "primaryenv":
      case "primary-env":
        result.primaryEnv = value;
        break;
      case "emoji":
        result.emoji = value;
        break;
      case "homepage":
        result.homepage = value;
        break;
      case "os":
        result.os = normalizeStringList(value);
        break;
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
}

export function resolveSkillKey(
  skill: { name: string },
  metadata?: SkillMetadata | undefined,
): string {
  if (metadata?.skillKey) {
    return metadata.skillKey;
  }
  return skill.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function parseInstallSpec(input: string): SkillInstallSpec | undefined {
  const parts = input.split(",").map((s) => s.trim());
  if (parts.length === 0) return undefined;
  
  const kind = parts[0] as SkillInstallSpec["kind"];
  const validKinds: SkillInstallSpec["kind"][] = ["brew", "node", "go", "uv", "download"];
  if (!validKinds.includes(kind)) return undefined;
  
  const spec: SkillInstallSpec = { kind };
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    
    const key = part.slice(0, eqIndex).trim().toLowerCase();
    const value = part.slice(eqIndex + 1).trim();
    
    switch (key) {
      case "id":
        spec.id = value;
        break;
      case "label":
        spec.label = value;
        break;
      case "bins":
        spec.bins = normalizeStringList(value);
        break;
      case "os":
        spec.os = normalizeStringList(value);
        break;
      case "formula":
        spec.formula = normalizeSafeBrewFormula(value);
        break;
      case "package":
        if (kind === "node") {
          spec.package = normalizeSafeNpmSpec(value);
        } else if (kind === "uv") {
          spec.package = normalizeSafeUvPackage(value);
        }
        break;
      case "module":
        spec.module = normalizeSafeGoModule(value);
        break;
      case "url":
        spec.url = normalizeSafeDownloadUrl(value);
        break;
      case "archive":
        spec.archive = value;
        break;
      case "extract":
        spec.extract = parseFrontmatterBool(value, false);
        break;
      case "stripcomponents":
      case "strip-components":
        const num = parseInt(value, 10);
        if (!isNaN(num)) spec.stripComponents = num;
        break;
      case "targetdir":
      case "target-dir":
        spec.targetDir = value;
        break;
    }
  }
  
  if (spec.kind === "brew" && !spec.formula) return undefined;
  if (spec.kind === "node" && !spec.package) return undefined;
  if (spec.kind === "go" && !spec.module) return undefined;
  if (spec.kind === "uv" && !spec.package) return undefined;
  if (spec.kind === "download" && !spec.url) return undefined;
  
  return spec;
}
