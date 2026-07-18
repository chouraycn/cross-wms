/**
 * 遗留命名兼容
 *
 * 产品/包命名常量，桥接当前 cross-wms 清单与
 * 旧版配置和包中仍在使用的遗留键名。
 */

import { logger } from '../../logger.js';
import {
  PROJECT_NAME,
  LEGACY_PROJECT_NAMES,
  MANIFEST_KEY,
  LEGACY_MANIFEST_KEYS,
  MACOS_APP_SOURCES_DIR,
  type LegacyNameMapping,
  type CompatWarning,
  type CompatOptions,
} from './types.js';

export {
  PROJECT_NAME,
  LEGACY_PROJECT_NAMES,
  MANIFEST_KEY,
  LEGACY_MANIFEST_KEYS,
  MACOS_APP_SOURCES_DIR,
};

const LEGACY_NAME_MAPPINGS: LegacyNameMapping[] = [
  {
    oldName: 'cdf-know',
    newName: 'crosswms',
    category: 'package',
    deprecatedSince: '2.0.0',
    replacement: 'Use crosswms instead',
  },
  {
    oldName: 'cdfknow',
    newName: 'crosswms',
    category: 'package',
    deprecatedSince: '2.0.0',
    replacement: 'Use crosswms instead',
  },
  {
    oldName: 'clawdbot',
    newName: 'crosswms',
    category: 'package',
    deprecatedSince: '1.0.0',
    replacement: 'Use crosswms instead',
  },
];

export class LegacyNameMapper {
  private mappings: Map<string, LegacyNameMapping> = new Map();
  private warnings: CompatWarning[] = [];
  private usageCounts: Map<string, number> = new Map();
  private options: Required<CompatOptions> = {
    warnOnLegacy: true,
    trackUsage: true,
    maxWarnings: 100,
  };

  constructor(options: CompatOptions = {}) {
    this.options = { ...this.options, ...options };
    for (const mapping of LEGACY_NAME_MAPPINGS) {
      this.mappings.set(mapping.oldName.toLowerCase(), mapping);
    }
  }

  addMapping(mapping: LegacyNameMapping): void {
    this.mappings.set(mapping.oldName.toLowerCase(), mapping);
  }

  removeMapping(oldName: string): void {
    this.mappings.delete(oldName.toLowerCase());
  }

  hasLegacyName(name: string): boolean {
    return this.mappings.has(name.toLowerCase());
  }

  resolveName(name: string): { name: string; isLegacy: boolean; mapping?: LegacyNameMapping } {
    const lowerName = name.toLowerCase();
    const mapping = this.mappings.get(lowerName);

    if (mapping) {
      if (this.options.warnOnLegacy) {
        this.emitWarning(mapping);
      }
      if (this.options.trackUsage) {
        this.trackUsage(lowerName);
      }
      return { name: mapping.newName, isLegacy: true, mapping };
    }

    return { name, isLegacy: false };
  }

  getNewName(oldName: string): string | undefined {
    const mapping = this.mappings.get(oldName.toLowerCase());
    return mapping?.newName;
  }

  getLegacyNames(newName: string): string[] {
    const results: string[] = [];
    for (const mapping of this.mappings.values()) {
      if (mapping.newName.toLowerCase() === newName.toLowerCase()) {
        results.push(mapping.oldName);
      }
    }
    return results;
  }

  getAllMappings(): LegacyNameMapping[] {
    return Array.from(this.mappings.values());
  }

  private emitWarning(mapping: LegacyNameMapping): void {
    if (this.warnings.length >= this.options.maxWarnings) {
      return;
    }

    const warning: CompatWarning = {
      oldName: mapping.oldName,
      newName: mapping.newName,
      message: `'${mapping.oldName}' is deprecated, use '${mapping.newName}' instead. ${mapping.replacement ?? ''}`,
      timestamp: new Date(),
    };

    this.warnings.push(warning);
    logger.warn(`[Compat] ${warning.message}`);
  }

  private trackUsage(name: string): void {
    const current = this.usageCounts.get(name) ?? 0;
    this.usageCounts.set(name, current + 1);
  }

  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [name, count] of this.usageCounts) {
      stats[name] = count;
    }
    return stats;
  }

  getWarnings(): CompatWarning[] {
    return [...this.warnings];
  }

  clearWarnings(): void {
    this.warnings = [];
  }

  clearUsageStats(): void {
    this.usageCounts.clear();
  }

  reset(): void {
    this.warnings = [];
    this.usageCounts.clear();
  }
}

export const legacyNameMapper = new LegacyNameMapper();

export function resolveLegacyName(name: string): string {
  return legacyNameMapper.resolveName(name).name;
}

export function isLegacyName(name: string): boolean {
  return legacyNameMapper.hasLegacyName(name);
}

export function getLegacyMapping(name: string): LegacyNameMapping | undefined {
  const result = legacyNameMapper.resolveName(name);
  return result.mapping;
}

export function normalizeProjectName(name: string): string {
  const lower = name.toLowerCase();
  if (lower === PROJECT_NAME) return PROJECT_NAME;
  for (const legacy of LEGACY_PROJECT_NAMES) {
    if (lower === legacy) return PROJECT_NAME;
  }
  return name;
}

export function isProjectName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === PROJECT_NAME) return true;
  for (const legacy of LEGACY_PROJECT_NAMES) {
    if (lower === legacy) return true;
  }
  return false;
}
