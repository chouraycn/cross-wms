import crypto from 'crypto';
import { parseSkillMd, ParsedSkillMd } from './skillParser';

export interface ContentFingerprint {
  hash: string;
  version: string;
  timestamp: number;
  contentLength: number;
}

export interface SkillVersionInfo {
  skillId: string;
  name: string;
  version: string;
  fingerprint: ContentFingerprint;
  parsed: ParsedSkillMd;
}

export class VersionController {
  private hashAlgorithm: string;
  private versionCache: Map<string, ContentFingerprint>;

  constructor(algorithm: string = 'sha256') {
    this.hashAlgorithm = algorithm;
    this.versionCache = new Map();
  }

  generateFingerprint(content: string): ContentFingerprint {
    const hash = crypto.createHash(this.hashAlgorithm).update(content).digest('hex').slice(0, 16);
    const version = `v1.${parseInt(hash.slice(0, 8), 16).toString(10).padStart(8, '0')}`;

    return {
      hash,
      version,
      timestamp: Date.now(),
      contentLength: content.length,
    };
  }

  computePromptVersion(content: string): string {
    const fingerprint = this.generateFingerprint(content);
    return fingerprint.version;
  }

  getVersion(skillId: string): ContentFingerprint | undefined {
    return this.versionCache.get(skillId);
  }

  updateVersion(skillId: string, content: string): ContentFingerprint {
    const fingerprint = this.generateFingerprint(content);
    this.versionCache.set(skillId, fingerprint);
    return fingerprint;
  }

  compareVersions(skillId: string, content: string): {
    changed: boolean;
    oldFingerprint?: ContentFingerprint;
    newFingerprint: ContentFingerprint;
  } {
    const oldFingerprint = this.versionCache.get(skillId);
    const newFingerprint = this.generateFingerprint(content);
    const changed = !oldFingerprint || oldFingerprint.hash !== newFingerprint.hash;

    return { changed, oldFingerprint, newFingerprint };
  }

  parseAndVersion(content: string): SkillVersionInfo {
    const parsed = parseSkillMd(content);
    const fingerprint = this.generateFingerprint(content);

    return {
      skillId: parsed.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: parsed.name,
      version: parsed.version || fingerprint.version,
      fingerprint,
      parsed,
    };
  }

  getVersionHistory(): Array<{
    skillId: string;
    version: string;
    hash: string;
  }> {
    const history: Array<{ skillId: string; version: string; hash: string }> = [];
    for (const [skillId, fingerprint] of this.versionCache) {
      history.push({
        skillId,
        version: fingerprint.version,
        hash: fingerprint.hash,
      });
    }
    return history;
  }

  clearCache(): void {
    this.versionCache.clear();
  }

  hasChanges(skillId: string, content: string): boolean {
    const cached = this.versionCache.get(skillId);
    if (!cached) return true;

    const newHash = crypto.createHash(this.hashAlgorithm).update(content).digest('hex').slice(0, 16);
    return cached.hash !== newHash;
  }
}

export const versionController = new VersionController();
