import type { MarketplaceSkillRow, InstalledSkillVersionRow } from '../../db-marketplace.js';
import { getDb } from '../../db-core.js';
import { logger } from '../../logger.js';
import { nanoid } from 'nanoid';
import os from 'os';
import path from 'path';
import { remoteSkillLoader, type RemoteSkillSource } from '../../engine/remoteSkillLoader.js';
import { AppPaths } from '../../config/appPaths.js';

export interface MarketplaceSkill {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  subCategory: string;
  author: string;
  version: string;
  rating: number;
  downloadCount: number;
  tags: string[];
  promptTemplate: string;
  executionMode: string;
  permissions: string[];
  dependencies: string[];
  detail: string;
  trigger: string;
  iconUrl: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledSkill {
  id: string;
  skillId: string;
  remoteId: string;
  installedVersion: string;
  latestVersion: string;
  autoUpdate: boolean;
  installedAt: string;
  updatedAt: string;
  skill?: MarketplaceSkill;
}

export interface MarketplaceQueryParams {
  category?: string;
  subCategory?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'rating' | 'downloads' | 'updated' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface MarketplaceSearchResult {
  skills: MarketplaceSkill[];
  total: number;
  page: number;
  pageSize: number;
}

function rowToSkill(row: MarketplaceSkillRow): MarketplaceSkill {
  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    icon: row.icon,
    category: row.category,
    subCategory: row.sub_category,
    author: row.author,
    version: row.version,
    rating: row.rating,
    downloadCount: row.download_count,
    tags: JSON.parse(row.tags || '[]'),
    promptTemplate: row.prompt_template,
    executionMode: row.execution_mode,
    permissions: JSON.parse(row.permissions || '[]'),
    dependencies: JSON.parse(row.dependencies || '[]'),
    detail: row.detail,
    trigger: row.trigger,
    iconUrl: row.icon_url,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToInstalled(row: InstalledSkillVersionRow): InstalledSkill {
  return {
    id: row.id,
    skillId: row.skill_id,
    remoteId: row.remote_id,
    installedVersion: row.installed_version,
    latestVersion: row.latest_version,
    autoUpdate: row.auto_update === 1,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

export async function searchMarketplace(params: MarketplaceQueryParams): Promise<MarketplaceSearchResult> {
  const {
    category,
    subCategory,
    search,
    page = 1,
    pageSize = 20,
    sortBy = 'updated',
    sortOrder = 'desc',
  } = params;

  let query = 'SELECT * FROM marketplace_skills WHERE 1=1';
  const paramsArray: unknown[] = [];

  if (category) {
    query += ' AND category = ?';
    paramsArray.push(category);
  }

  if (subCategory) {
    query += ' AND sub_category = ?';
    paramsArray.push(subCategory);
  }

  if (search) {
    query += ' AND (name LIKE ? OR "desc" LIKE ? OR tags LIKE ?)';
    const searchPattern = `%${search}%`;
    paramsArray.push(searchPattern, searchPattern, searchPattern);
  }

  const sortMap: Record<string, string> = {
    rating: 'rating',
    downloads: 'download_count',
    updated: 'updated_at',
    name: 'name',
  };
  const sortField = sortMap[sortBy] || 'updated_at';
  query += ` ORDER BY ${sortField} ${sortOrder.toUpperCase()}`;

  const totalQuery = query.replace('SELECT *', 'SELECT COUNT(*) as cnt');
  const totalResult = getDb().prepare(totalQuery).get(...paramsArray) as { cnt: number };
  const total = totalResult.cnt;

  const offset = (page - 1) * pageSize;
  query += ' LIMIT ? OFFSET ?';
  paramsArray.push(pageSize, offset);

  const rows = getDb().prepare(query).all(...paramsArray) as MarketplaceSkillRow[];
  const skills = rows.map(rowToSkill);

  return { skills, total, page, pageSize };
}

export async function getSkillById(skillId: string): Promise<MarketplaceSkill | null> {
  const row = getDb().prepare('SELECT * FROM marketplace_skills WHERE id = ?').get(skillId) as MarketplaceSkillRow | undefined;
  return row ? rowToSkill(row) : null;
}

export async function getInstalledSkills(): Promise<InstalledSkill[]> {
  const rows = getDb().prepare('SELECT * FROM installed_skill_versions').all() as InstalledSkillVersionRow[];
  const installed = rows.map(rowToInstalled);

  for (const item of installed) {
    const skill = await getSkillById(item.skillId);
    if (skill) {
      item.skill = skill;
    }
  }

  return installed;
}

export interface InstallSkillOptions {
  /** 远程源地址（用于实际下载 skill 文件）；为空则仅写入安装记录 */
  sourceUrl?: string;
  /** 源类型，默认根据 sourceUrl scheme 推断 */
  sourceType?: RemoteSkillSource['type'];
  /** 认证 token（可选） */
  authToken?: string;
  /** 自定义安装目录（默认 ~/.workbuddy/skills） */
  targetDir?: string;
}

/** 用户级 skill 安装目录（与 RealSkillProvider 扫描源保持一致） */
function defaultUserSkillsDir(): string {
  return AppPaths.skillsDir;
}

/** 根据 sourceUrl 推断源类型 */
function inferSourceType(sourceUrl: string): RemoteSkillSource['type'] {
  if (sourceUrl.startsWith('git@') || sourceUrl.endsWith('.git')) return 'git';
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) return 'http';
  if (sourceUrl.startsWith('npm:') || sourceUrl.includes('registry.npmjs.org')) return 'npm';
  if (sourceUrl.startsWith('file://') || sourceUrl.startsWith('/') || sourceUrl.startsWith('./')) {
    return 'local';
  }
  return 'registry';
}

export async function installSkill(
  skillId: string,
  remoteId: string,
  version: string,
  opts?: InstallSkillOptions,
): Promise<InstalledSkill> {
  const id = nanoid();
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO installed_skill_versions (id, skill_id, remote_id, installed_version, latest_version, auto_update, installed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, skillId, remoteId, version, version, now, now);

  const row = getDb().prepare('SELECT * FROM installed_skill_versions WHERE id = ?').get(id) as InstalledSkillVersionRow;
  const result = rowToInstalled(row);

  getDb().prepare('UPDATE marketplace_skills SET download_count = download_count + 1 WHERE id = ?').run(skillId);

  logger.info(`[Marketplace] 已安装技能: ${skillId} (${version})`);

  // 若提供了远程源，则实际下载并安装 skill 文件（best-effort，失败不影响安装记录）
  if (opts?.sourceUrl) {
    try {
      const sourceType = opts.sourceType ?? inferSourceType(opts.sourceUrl);
      const url = opts.sourceUrl.startsWith('file://')
        ? opts.sourceUrl.slice('file://'.length)
        : opts.sourceUrl;
      const source: RemoteSkillSource = {
        type: sourceType,
        url,
        authToken: opts.authToken,
        enabled: true,
        priority: 0,
      };
      remoteSkillLoader.addSource(source);
      const targetDir = opts.targetDir ?? path.join(defaultUserSkillsDir(), skillId);
      const installResult = await remoteSkillLoader.installSkill(
        skillId,
        version,
        url,
        targetDir,
      );
      if (!installResult.success) {
        logger.warn(
          `[Marketplace] skill 文件下载失败（安装记录仍保留）: ${skillId} - ${installResult.error}`,
        );
      } else {
        logger.info(`[Marketplace] skill 文件已安装至: ${installResult.installedPath}`);
      }
    } catch (e) {
      logger.warn(`[Marketplace] skill 文件安装异常（忽略）: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

/**
 * 回退已安装技能到指定历史版本
 * @returns 成功时返回更新后的安装记录，失败时返回 null
 */
export async function rollbackSkill(
  installedId: string,
  targetVersion: string,
): Promise<InstalledSkill | null> {
  const row = getDb().prepare('SELECT * FROM installed_skill_versions WHERE id = ?').get(installedId) as InstalledSkillVersionRow | undefined;
  if (!row) return null;

  const skillId = row.skill_id;
  const result = await remoteSkillLoader.rollbackSkill(skillId, targetVersion);
  if (!result.success) {
    logger.warn(`[Marketplace] 回退失败 ${skillId} → ${targetVersion}: ${result.error}`);
    return null;
  }

  // 同步 DB 中的当前版本
  getDb().prepare(
    'UPDATE installed_skill_versions SET installed_version = ?, updated_at = ? WHERE id = ?',
  ).run(targetVersion, new Date().toISOString(), installedId);

  const updated = getDb().prepare('SELECT * FROM installed_skill_versions WHERE id = ?').get(installedId) as InstalledSkillVersionRow;
  logger.info(`[Marketplace] 已回退技能: ${skillId} → ${targetVersion}`);
  return rowToInstalled(updated);
}

/**
 * 获取已安装技能在 loader 中的版本历史
 */
export async function getInstalledVersionHistory(
  installedId: string,
): Promise<Array<{
  version: string;
  installedAt: number;
  source: string;
  sourceType: string;
  current: boolean;
}> | null> {
  const row = getDb().prepare('SELECT * FROM installed_skill_versions WHERE id = ?').get(installedId) as InstalledSkillVersionRow | undefined;
  if (!row) return null;
  return remoteSkillLoader.listVersions(row.skill_id);
}

/**
 * 卸载已安装技能：删除 DB 记录，并尝试移除已安装的 skill 文件（best-effort）
 */
export async function uninstallSkill(installedId: string): Promise<boolean> {
  const row = getDb().prepare('SELECT * FROM installed_skill_versions WHERE id = ?').get(installedId) as InstalledSkillVersionRow | undefined;
  if (!row) return false;

  // best-effort：尝试通过 loader 移除 skill 文件
  try {
    await remoteSkillLoader.uninstallSkill(row.skill_id);
  } catch (e) {
    logger.warn(`[Marketplace] 移除 skill 文件失败（忽略）: ${e instanceof Error ? e.message : String(e)}`);
  }

  getDb().prepare('DELETE FROM installed_skill_versions WHERE id = ?').run(installedId);

  logger.info(`[Marketplace] 已卸载技能: ${row.skill_id}`);
  return true;
}

export async function setAutoUpdate(installedId: string, autoUpdate: boolean): Promise<boolean> {
  const result = getDb().prepare('UPDATE installed_skill_versions SET auto_update = ?, updated_at = ? WHERE id = ?').run(
    autoUpdate ? 1 : 0,
    new Date().toISOString(),
    installedId,
  );
  return result.changes > 0;
}

export async function getCategories(): Promise<Array<{ category: string; subCategories: string[] }>> {
  const rows = getDb().prepare('SELECT DISTINCT category, sub_category FROM marketplace_skills').all() as Array<{ category: string; sub_category: string }>;

  const categoryMap = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!categoryMap.has(row.category)) {
      categoryMap.set(row.category, new Set());
    }
    if (row.sub_category) {
      categoryMap.get(row.category)!.add(row.sub_category);
    }
  }

  return Array.from(categoryMap.entries()).map(([category, subCategories]) => ({
    category,
    subCategories: Array.from(subCategories),
  }));
}

export async function addSkillToMarketplace(skill: Omit<MarketplaceSkill, 'id' | 'createdAt' | 'updatedAt'>): Promise<MarketplaceSkill> {
  const id = nanoid();
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO marketplace_skills (
      id, name, "desc", icon, category, sub_category, author, version,
      rating, download_count, tags, prompt_template, execution_mode,
      permissions, dependencies, detail, trigger, icon_url, source_url,
      created_at, updated_at, cached_at, cache_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    skill.name,
    skill.desc,
    skill.icon,
    skill.category,
    skill.subCategory,
    skill.author,
    skill.version,
    JSON.stringify(skill.tags),
    skill.promptTemplate,
    skill.executionMode,
    JSON.stringify(skill.permissions),
    JSON.stringify(skill.dependencies),
    skill.detail,
    skill.trigger,
    skill.iconUrl,
    skill.sourceUrl,
    now,
    now,
    now,
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  );

  const row = getDb().prepare('SELECT * FROM marketplace_skills WHERE id = ?').get(id) as MarketplaceSkillRow;
  logger.info(`[Marketplace] 已添加技能到市场: ${skill.name}`);
  return rowToSkill(row);
}

export async function updateSkillInMarketplace(skillId: string, updates: Partial<MarketplaceSkill>): Promise<MarketplaceSkill | null> {
  const row = getDb().prepare('SELECT * FROM marketplace_skills WHERE id = ?').get(skillId) as MarketplaceSkillRow | undefined;
  if (!row) return null;

  const now = new Date().toISOString();
  const updateFields: string[] = [];
  const updateParams: unknown[] = [];

  if (updates.name !== undefined) { updateFields.push('name = ?'); updateParams.push(updates.name); }
  if (updates.desc !== undefined) { updateFields.push('"desc" = ?'); updateParams.push(updates.desc); }
  if (updates.icon !== undefined) { updateFields.push('icon = ?'); updateParams.push(updates.icon); }
  if (updates.category !== undefined) { updateFields.push('category = ?'); updateParams.push(updates.category); }
  if (updates.subCategory !== undefined) { updateFields.push('sub_category = ?'); updateParams.push(updates.subCategory); }
  if (updates.author !== undefined) { updateFields.push('author = ?'); updateParams.push(updates.author); }
  if (updates.version !== undefined) { updateFields.push('version = ?'); updateParams.push(updates.version); }
  if (updates.tags !== undefined) { updateFields.push('tags = ?'); updateParams.push(JSON.stringify(updates.tags)); }
  if (updates.promptTemplate !== undefined) { updateFields.push('prompt_template = ?'); updateParams.push(updates.promptTemplate); }
  if (updates.executionMode !== undefined) { updateFields.push('execution_mode = ?'); updateParams.push(updates.executionMode); }
  if (updates.permissions !== undefined) { updateFields.push('permissions = ?'); updateParams.push(JSON.stringify(updates.permissions)); }
  if (updates.dependencies !== undefined) { updateFields.push('dependencies = ?'); updateParams.push(JSON.stringify(updates.dependencies)); }
  if (updates.detail !== undefined) { updateFields.push('detail = ?'); updateParams.push(updates.detail); }
  if (updates.trigger !== undefined) { updateFields.push('trigger = ?'); updateParams.push(updates.trigger); }
  if (updates.iconUrl !== undefined) { updateFields.push('icon_url = ?'); updateParams.push(updates.iconUrl); }
  if (updates.sourceUrl !== undefined) { updateFields.push('source_url = ?'); updateParams.push(updates.sourceUrl); }

  updateFields.push('updated_at = ?');
  updateParams.push(now);
  updateParams.push(skillId);

  getDb().prepare(`UPDATE marketplace_skills SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateParams);

  const updatedRow = getDb().prepare('SELECT * FROM marketplace_skills WHERE id = ?').get(skillId) as MarketplaceSkillRow;
  return rowToSkill(updatedRow);
}