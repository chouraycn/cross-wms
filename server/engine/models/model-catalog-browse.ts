/**
 * 目录浏览 — 模型目录的浏览和分页功能
 *
 * 提供模型目录的分页浏览、排序、分类过滤等功能。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId } from './model-selection-normalize.js';

export interface CatalogBrowseParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'provider' | 'contextWindow' | 'recommended';
  sortOrder?: 'asc' | 'desc';
  provider?: string;
  category?: string;
  capability?: string;
  search?: string;
  authStatus?: 'all' | 'authenticated' | 'unauthenticated';
}

export interface CatalogBrowseResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ProviderBrowseResult {
  providers: Array<{
    id: string;
    name: string;
    modelCount: number;
    category?: string;
  }>;
  total: number;
}

const DEFAULT_PARAMS: Required<CatalogBrowseParams> = {
  page: 1,
  pageSize: 20,
  sortBy: 'recommended',
  sortOrder: 'desc',
  provider: '',
  category: '',
  capability: '',
  search: '',
  authStatus: 'all',
};

export function browseCatalog<T extends {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
  contextWindow?: number;
  isRecommended?: boolean;
  authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  description?: string;
}>(
  models: T[],
  params: CatalogBrowseParams = {},
): CatalogBrowseResult<T> {
  const p = { ...DEFAULT_PARAMS, ...params };

  let filtered = applyFilters(models, p);
  filtered = applySorting(filtered, p.sortBy, p.sortOrder);

  const total = filtered.length;
  const totalPages = Math.ceil(total / p.pageSize);
  const page = Math.max(1, Math.min(p.page, totalPages || 1));
  const startIndex = (page - 1) * p.pageSize;
  const endIndex = startIndex + p.pageSize;
  const items = filtered.slice(startIndex, endIndex);

  return {
    items,
    total,
    page,
    pageSize: p.pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

function applyFilters<T extends {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
  authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  description?: string;
}>(
  models: T[],
  params: Required<CatalogBrowseParams>,
): T[] {
  let filtered = [...models];

  if (params.provider) {
    const normProvider = normalizeProviderId(params.provider);
    filtered = filtered.filter(m => normalizeProviderId(m.provider) === normProvider);
  }

  if (params.capability) {
    filtered = filtered.filter(m => m.capabilities?.includes(params.capability));
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    filtered = filtered.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      m.description?.toLowerCase().includes(query),
    );
  }

  if (params.authStatus !== 'all') {
    if (params.authStatus === 'authenticated') {
      filtered = filtered.filter(m => m.authStatus === 'authenticated');
    } else {
      filtered = filtered.filter(m => m.authStatus !== 'authenticated');
    }
  }

  return filtered;
}

function applySorting<T extends {
  name: string;
  provider: string;
  contextWindow?: number;
  isRecommended?: boolean;
}>(
  models: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): T[] {
  return [...models].sort((a, b) => {
    let cmp = 0;

    switch (sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'provider':
        cmp = a.provider.localeCompare(b.provider);
        break;
      case 'contextWindow':
        cmp = (a.contextWindow ?? 0) - (b.contextWindow ?? 0);
        break;
      case 'recommended':
        const aRec = a.isRecommended ? 1 : 0;
        const bRec = b.isRecommended ? 1 : 0;
        cmp = aRec - bRec;
        break;
    }

    return sortOrder === 'desc' ? -cmp : cmp;
  });
}

export function browseProviders<T extends {
  id: string;
  name: string;
  models: Array<{ id: string }>;
  categories?: string[];
}>(
  providers: T[],
  options: {
    category?: string;
    sortBy?: 'name' | 'modelCount';
    sortOrder?: 'asc' | 'desc';
  } = {},
): ProviderBrowseResult {
  const sortBy = options.sortBy ?? 'name';
  const sortOrder = options.sortOrder ?? 'asc';

  let filtered = [...providers];

  if (options.category) {
    filtered = filtered.filter(p => p.categories?.includes(options.category!));
  }

  const result = filtered.map(p => ({
    id: p.id,
    name: p.name,
    modelCount: p.models.length,
    category: p.categories?.[0],
  }));

  result.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortBy === 'modelCount') {
      cmp = a.modelCount - b.modelCount;
    }
    return sortOrder === 'desc' ? -cmp : cmp;
  });

  return {
    providers: result,
    total: result.length,
  };
}

export function getCatalogCategories<T extends {
  categories?: string[];
}>(providers: T[]): string[] {
  const categories = new Set<string>();
  for (const provider of providers) {
    if (provider.categories) {
      for (const cat of provider.categories) {
        categories.add(cat);
      }
    }
  }
  return Array.from(categories);
}

export function getCatalogCapabilities<T extends {
  capabilities?: string[];
}>(models: T[]): string[] {
  const caps = new Set<string>();
  for (const model of models) {
    if (model.capabilities) {
      for (const cap of model.capabilities) {
        caps.add(cap);
      }
    }
  }
  return Array.from(caps);
}
