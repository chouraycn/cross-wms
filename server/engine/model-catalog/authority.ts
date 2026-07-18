import type { ModelCatalogSource, NormalizedModelCatalogRow } from './types';
import { logger } from '../../logger.js';

const MODEL_CATALOG_SOURCE_AUTHORITY: Readonly<Record<ModelCatalogSource, number>> = {
  config: 0,
  manifest: 1,
  registry: 1,
  cache: 2,
  'runtime-refresh': 2,
  'provider-index': 3,
};

function compareSourceAuthority(left: ModelCatalogSource, right: ModelCatalogSource): number {
  const leftAuth = MODEL_CATALOG_SOURCE_AUTHORITY[left] ?? 99;
  const rightAuth = MODEL_CATALOG_SOURCE_AUTHORITY[right] ?? 99;
  return leftAuth - rightAuth;
}

export function mergeRowsByAuthority(
  rows: Iterable<NormalizedModelCatalogRow>,
): NormalizedModelCatalogRow[] {
  const byMergeKey = new Map<string, NormalizedModelCatalogRow>();
  let conflictCount = 0;

  for (const row of rows) {
    const existing = byMergeKey.get(row.mergeKey);
    if (!existing) {
      byMergeKey.set(row.mergeKey, row);
      continue;
    }
    const comparison = compareSourceAuthority(row.source, existing.source);
    if (comparison < 0) {
      byMergeKey.set(row.mergeKey, row);
      conflictCount++;
    } else if (comparison === 0) {
      logger.debug(
        `[Authority] 同源冲突: ${row.mergeKey} (${row.source} vs ${existing.source})`,
      );
    }
  }

  if (conflictCount > 0) {
    logger.debug(`[Authority] 合并完成，解决了 ${conflictCount} 个冲突`);
  }

  return [...byMergeKey.values()].toSorted(
    (left, right) =>
      left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id),
  );
}

export function getSourceAuthority(source: ModelCatalogSource): number {
  return MODEL_CATALOG_SOURCE_AUTHORITY[source] ?? 99;
}

export function compareSources(left: ModelCatalogSource, right: ModelCatalogSource): number {
  return compareSourceAuthority(left, right);
}

export function hasHigherOrEqualAuthority(
  source: ModelCatalogSource,
  compareTo: ModelCatalogSource,
): boolean {
  return compareSourceAuthority(source, compareTo) <= 0;
}
