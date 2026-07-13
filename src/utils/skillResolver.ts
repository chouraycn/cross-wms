import { parseSkillMd, type ParsedSkillMd, resolveOpenClawMetadata, resolveSkillInvocationPolicy, resolveSkillExposure } from './skillParser';
import { securityScanner, type SecurityScanResult } from './securityScanner';
import { computeSkillFingerprint, type SkillFingerprint } from './skillFingerprint';
import type { SkillEntry } from './skillRegistry';

export interface ResolvedSkill {
  entry: SkillEntry;
  parsed: ParsedSkillMd;
  scanResult: SecurityScanResult;
  fingerprint: string;
}

export interface SkillResolveOptions {
  source?: SkillEntry['source'];
  enabled?: boolean;
  runScan?: boolean;
  computeFingerprint?: boolean;
}

export interface SkillResolveResult {
  resolved: ResolvedSkill[];
  failed: Array<{ path: string; error: string }>;
}

export class SkillResolver {
  private cache: Map<string, ResolvedSkill> = new Map();
  private fileTimestamps: Map<string, number> = new Map();

  async resolveFromContent(
    skillId: string,
    content: string,
    filePath: string,
    options: SkillResolveOptions = {}
  ): Promise<ResolvedSkill> {
    const cacheKey = `${skillId}:${filePath}`;
    const cached = this.cache.get(cacheKey);
    const currentHash = (await computeSkillFingerprint(content)).hash;

    if (cached && cached.fingerprint === currentHash) {
      return cached;
    }

    const parsed = parseSkillMd(content);
    const metadata = resolveOpenClawMetadata(parsed.frontmatter, parsed.structuredMetadata);
    const invocation = resolveSkillInvocationPolicy(parsed.frontmatter);
    const exposure = resolveSkillExposure(parsed.frontmatter);

    const entry: SkillEntry = {
      id: skillId,
      name: parsed.frontmatter.name || skillId,
      description: parsed.frontmatter.description || '',
      filePath,
      baseDir: filePath.substring(0, filePath.lastIndexOf('/')) || '.',
      source: options.source || 'user',
      promptVersion: parsed.frontmatter.version,
      contentHash: currentHash,
      metadata,
      invocation,
      exposure,
      enabled: options.enabled ?? true,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    };

    let scanResult: SecurityScanResult;
    if (options.runScan !== false) {
      scanResult = securityScanner.scanSkillMd(skillId, content);
    } else {
      scanResult = {
        skillId,
        scannedFiles: 0,
        critical: 0,
        warn: 0,
        info: 0,
        passed: true,
        findings: [],
        scannedAt: Date.now(),
        durationMs: 0,
      };
    }

    const fingerprint = options.computeFingerprint !== false ? currentHash : '';

    const resolved: ResolvedSkill = {
      entry,
      parsed,
      scanResult,
      fingerprint,
    };

    this.cache.set(cacheKey, resolved);
    this.fileTimestamps.set(cacheKey, Date.now());

    return resolved;
  }

  invalidate(skillId: string, filePath: string): boolean {
    const cacheKey = `${skillId}:${filePath}`;
    this.fileTimestamps.delete(cacheKey);
    return this.cache.delete(cacheKey);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.fileTimestamps.clear();
  }

  getCached(skillId: string, filePath: string): ResolvedSkill | undefined {
    return this.cache.get(`${skillId}:${filePath}`);
  }

  hasCache(skillId: string, filePath: string): boolean {
    return this.cache.has(`${skillId}:${filePath}`);
  }

  cacheSize(): number {
    return this.cache.size;
  }

  resolveSkillName(content: string): string | null {
    try {
      const parsed = parseSkillMd(content);
      return parsed.frontmatter.name || null;
    } catch {
      return null;
    }
  }

  resolveSkillDescription(content: string): string | null {
    try {
      const parsed = parseSkillMd(content);
      return parsed.frontmatter.description || null;
    } catch {
      return null;
    }
  }

  resolveSkillVersion(content: string): string | null {
    try {
      const parsed = parseSkillMd(content);
      return parsed.frontmatter.version || null;
    } catch {
      return null;
    }
  }

  extractSkillRequires(content: string): { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[] } | null {
    try {
      const parsed = parseSkillMd(content);
      const metadata = resolveOpenClawMetadata(parsed.frontmatter, parsed.structuredMetadata);
      return metadata?.requires || null;
    } catch {
      return null;
    }
  }

  extractSkillInstallSpecs(content: string): import('./skillParser').SkillInstallSpec[] | null {
    try {
      const parsed = parseSkillMd(content);
      const metadata = resolveOpenClawMetadata(parsed.frontmatter, parsed.structuredMetadata);
      return metadata?.install || null;
    } catch {
      return null;
    }
  }

  validateSkillContent(content: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const parsed = parseSkillMd(content);

      if (!parsed.frontmatter.name) {
        errors.push('Skill name is required in frontmatter');
      }
      if (!parsed.frontmatter.description) {
        warnings.push('Skill description is recommended');
      }
      if (!parsed.frontmatter.version) {
        warnings.push('Skill version is recommended for change tracking');
      }

      if (parsed.frontmatter.name && parsed.frontmatter.name.length > 100) {
        warnings.push('Skill name is longer than 100 characters');
      }
      if (parsed.frontmatter.description && parsed.frontmatter.description.length > 500) {
        warnings.push('Skill description is longer than 500 characters');
      }

      const metadata = resolveOpenClawMetadata(parsed.frontmatter, parsed.structuredMetadata);
      if (metadata?.install) {
        for (const spec of metadata.install) {
          if (spec.kind === 'brew' && !spec.formula) {
            errors.push('Brew install spec requires formula field');
          }
          if (spec.kind === 'node' && !spec.package) {
            errors.push('Node install spec requires package field');
          }
          if (spec.kind === 'go' && !spec.module) {
            errors.push('Go install spec requires module field');
          }
          if (spec.kind === 'uv' && !spec.package) {
            errors.push('UV install spec requires package field');
          }
          if (spec.kind === 'download' && !spec.url) {
            errors.push('Download install spec requires url field');
          }
        }
      }
    } catch (e) {
      errors.push(`Failed to parse skill: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

export const skillResolver = new SkillResolver();
