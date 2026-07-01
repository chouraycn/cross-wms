/**
 * Soul 加载器模块
 *
 * 负责从不同来源加载 Soul 配置：
 * - 系统级规则（system）
 * - 项目级规则（project）
 * - 用户级规则（user）
 * - 会话级规则（session）
 *
 * 支持增量加载和缓存
 */

import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../logger.js';
import { AppPaths } from '../../config/appPaths.js';
import {
  SoulConfig,
  SoulPriority,
  SoulSource,
  SoulCacheEntry,
  SectionHashMap,
  SoulSectionType,
} from './types.js';
import {
  parseSoulMarkdown,
  parseUserMarkdown,
  computeHash,
  DEFAULT_STRATEGY,
  DEFAULT_PERSONALITY,
} from './parser.js';
import { mergeSoulConfigs } from './priority.js';

// ===================== 常量 =====================

const CDF_KNOW_CLOW_DIR = AppPaths.rootDir;
const SOUL_FILE = 'SOUL.md';
const USER_FILE = 'USER.md';
const CACHE_TTL_MS = 60_000; // 1 分钟缓存

// ===================== 缓存 =====================

/** 配置缓存（按优先级和文件路径索引） */
const configCache = new Map<string, SoulCacheEntry>();

/** 分段哈希缓存（用于增量更新） */
const sectionHashCache = new Map<string, SectionHashMap>();

/** 合并后的配置缓存 */
let mergedConfigCache: {
  config: ReturnType<typeof mergeSoulConfigs>;
  timestamp: number;
} | null = null;

// ===================== 工具函数 =====================

/**
 * 创建来源信息
 */
function createSource(priority: SoulPriority, filePath: string): SoulSource {
  return {
    priority,
    filePath,
    loadedAt: Date.now(),
    hash: undefined, // 将在加载后设置
  };
}

/**
 * 安全读取文件
 */
function safeReadFile(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    logger.warn(`[SoulLoader] 读取文件失败: ${filePath}`, err);
  }
  return '';
}

/**
 * 获取文件修改时间
 */
function getFileMtime(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(cacheKey: string, mtime: number): boolean {
  const cached = configCache.get(cacheKey);
  if (!cached) return false;
  return cached.mtime >= mtime;
}

/**
 * 更新分段哈希缓存
 */
function updateSectionHashCache(cacheKey: string, config: SoulConfig): void {
  const hashMap: SectionHashMap = {
    identity: config.identity?.hash || null,
    capabilities: config.capabilities?.hash || null,
    constraints: config.constraints?.hash || null,
    style: config.style?.hash || null,
    knowledge: config.knowledge?.hash || null,
  };

  sectionHashCache.set(cacheKey, hashMap);
}

/**
 * 检查分段是否有变化
 */
function hasSectionChanged(
  cacheKey: string,
  type: SoulSectionType,
  newHash: string | null
): boolean {
  const cachedHash = sectionHashCache.get(cacheKey);
  if (!cachedHash) return true;
  return cachedHash[type] !== newHash;
}

// ===================== 加载器 =====================

/**
 * 加载系统级 Soul 配置
 *
 * 从项目目录加载系统默认规则
 */
export function loadSystemSoul(): SoulConfig | null {
  const priority: SoulPriority = 'system';
  const fileName = 'SYSTEM.md';
  const filePath = path.join(process.cwd(), '.cdf-know-clow', fileName);
  const cacheKey = `${priority}:${filePath}`;

  const mtime = getFileMtime(filePath);

  // 检查缓存
  if (isCacheValid(cacheKey, mtime)) {
    const cached = configCache.get(cacheKey);
    if (cached) return cached.config;
  }

  // 读取文件
  const content = safeReadFile(filePath);
  if (!content) return null;

  // 解析
  const source = createSource(priority, filePath);
  source.hash = computeHash(content);
  const config = parseSoulMarkdown(content, source);

  // 更新缓存
  configCache.set(cacheKey, {
    config,
    timestamp: Date.now(),
    mtime,
  });
  updateSectionHashCache(cacheKey, config);

  logger.debug(`[SoulLoader] 加载系统级配置: ${filePath}`);
  return config;
}

/**
 * 加载项目级 Soul 配置
 *
 * 从项目根目录加载项目特定规则
 */
export function loadProjectSoul(): SoulConfig | null {
  const priority: SoulPriority = 'project';
  const filePath = path.join(process.cwd(), '.cdf-know-clow', SOUL_FILE);
  const cacheKey = `${priority}:${filePath}`;

  const mtime = getFileMtime(filePath);

  // 检查缓存
  if (isCacheValid(cacheKey, mtime)) {
    const cached = configCache.get(cacheKey);
    if (cached) return cached.config;
  }

  // 读取文件
  const content = safeReadFile(filePath);
  if (!content) return null;

  // 解析
  const source = createSource(priority, filePath);
  source.hash = computeHash(content);
  const config = parseSoulMarkdown(content, source);

  // 更新缓存
  configCache.set(cacheKey, {
    config,
    timestamp: Date.now(),
    mtime,
  });
  updateSectionHashCache(cacheKey, config);

  logger.debug(`[SoulLoader] 加载项目级配置: ${filePath}`);
  return config;
}

/**
 * 加载用户级 Soul 配置
 *
 * 从用户目录加载用户自定义规则
 */
export function loadUserSoul(): SoulConfig | null {
  const priority: SoulPriority = 'user';
  const filePath = path.join(CDF_KNOW_CLOW_DIR, SOUL_FILE);
  const cacheKey = `${priority}:${filePath}`;

  const mtime = getFileMtime(filePath);

  // 检查缓存
  if (isCacheValid(cacheKey, mtime)) {
    const cached = configCache.get(cacheKey);
    if (cached) return cached.config;
  }

  // 读取文件
  const content = safeReadFile(filePath);
  if (!content) return null;

  // 解析
  const source = createSource(priority, filePath);
  source.hash = computeHash(content);
  const config = parseSoulMarkdown(content, source);

  // 更新缓存
  configCache.set(cacheKey, {
    config,
    timestamp: Date.now(),
    mtime,
  });
  updateSectionHashCache(cacheKey, config);

  logger.debug(`[SoulLoader] 加载用户级配置: ${filePath}`);
  return config;
}

/**
 * 加载会话级 Soul 配置
 *
 * 从用户目录加载 USER.md（用户画像）
 */
export function loadSessionSoul(): SoulConfig | null {
  const priority: SoulPriority = 'session';
  const filePath = path.join(CDF_KNOW_CLOW_DIR, USER_FILE);
  const cacheKey = `${priority}:${filePath}`;

  const mtime = getFileMtime(filePath);

  // 检查缓存
  if (isCacheValid(cacheKey, mtime)) {
    const cached = configCache.get(cacheKey);
    if (cached) return cached.config;
  }

  // 读取文件
  const content = safeReadFile(filePath);
  if (!content) return null;

  // 解析
  const source = createSource(priority, filePath);
  source.hash = computeHash(content);
  const config = parseUserMarkdown(content, source);

  // 更新缓存
  configCache.set(cacheKey, {
    config,
    timestamp: Date.now(),
    mtime,
  });
  updateSectionHashCache(cacheKey, config);

  logger.debug(`[SoulLoader] 加载会话级配置: ${filePath}`);
  return config;
}

/**
 * 按优先级加载所有 Soul 配置
 *
 * 从所有层级加载配置并合并
 */
export function loadAllSouls(forceRefresh = false): ReturnType<typeof mergeSoulConfigs> {
  const now = Date.now();

  // 检查合并缓存
  if (!forceRefresh && mergedConfigCache && (now - mergedConfigCache.timestamp) < CACHE_TTL_MS) {
    return mergedConfigCache.config;
  }

  // 从各层级加载配置
  const configs: SoulConfig[] = [];

  const systemConfig = loadSystemSoul();
  if (systemConfig) configs.push(systemConfig);

  const projectConfig = loadProjectSoul();
  if (projectConfig) configs.push(projectConfig);

  const userConfig = loadUserSoul();
  if (userConfig) configs.push(userConfig);

  const sessionConfig = loadSessionSoul();
  if (sessionConfig) configs.push(sessionConfig);

  // 如果没有加载到任何配置，创建默认配置
  if (configs.length === 0) {
    const defaultSource = createSource('system', 'default');
    configs.push({
      source: defaultSource,
      personality: DEFAULT_PERSONALITY,
      strategy: DEFAULT_STRATEGY,
      rawContent: '',
    });
  }

  // 合并配置
  const merged = mergeSoulConfigs(configs);

  // 更新缓存
  mergedConfigCache = {
    config: merged,
    timestamp: now,
  };

  logger.debug(`[SoulLoader] 加载所有配置完成，共 ${configs.length} 个来源`);
  return merged;
}

/**
 * 加载指定 Agent 的 Soul 文件
 *
 * 从 agents 目录加载特定 Agent 的配置
 */
export function loadAgentSoul(agentSoulFile: string): string {
  const soulPath = path.join(CDF_KNOW_CLOW_DIR, 'agents', agentSoulFile);
  return safeReadFile(soulPath);
}

/**
 * 刷新缓存
 *
 * 当配置文件被修改时调用
 */
export function invalidateCache(priority?: SoulPriority, filePath?: string): void {
  if (priority && filePath) {
    const cacheKey = `${priority}:${filePath}`;
    configCache.delete(cacheKey);
    sectionHashCache.delete(cacheKey);
  } else {
    configCache.clear();
    sectionHashCache.clear();
  }

  mergedConfigCache = null;
  logger.debug(`[SoulLoader] 缓存已刷新`);
}

/**
 * 获取分段哈希映射
 *
 * 用于增量更新检测
 */
export function getSectionHashMap(priority: SoulPriority, filePath: string): SectionHashMap | null {
  const cacheKey = `${priority}:${filePath}`;
  return sectionHashCache.get(cacheKey) || null;
}

/**
 * 初始化默认 Soul 文件
 *
 * 首次启动时创建默认配置文件
 */
export function initDefaultSoulFiles(): void {
  // 确保目录存在
  fs.mkdirSync(CDF_KNOW_CLOW_DIR, { recursive: true });

  // 创建 agents 子目录
  const agentsDir = path.join(CDF_KNOW_CLOW_DIR, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  // 初始化 SOUL.md 和 USER.md
  for (const fileName of [SOUL_FILE, USER_FILE]) {
    const targetPath = path.join(CDF_KNOW_CLOW_DIR, fileName);
    if (fs.existsSync(targetPath)) continue;  // 已存在不覆盖

    // 尝试从项目模板复制
    const projectSoulDir = path.join(process.cwd(), '.cdf-know-clow');
    const templatePath = path.join(projectSoulDir, fileName);

    let content: string | null = null;

    if (fs.existsSync(templatePath)) {
      try {
        content = fs.readFileSync(templatePath, 'utf-8');
        logger.debug(`[SoulLoader] 从模板读取 ${fileName}`);
      } catch (err) {
        logger.warn(`[SoulLoader] 读取模板 ${fileName} 失败:`, err);
      }
    }

    // 使用内联默认内容
    if (!content) {
      content = fileName === SOUL_FILE ? DEFAULT_SOUL_CONTENT : DEFAULT_USER_CONTENT;
      logger.debug(`[SoulLoader] 使用内联默认 ${fileName}`);
    }

    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      logger.debug(`[SoulLoader] 初始化默认 ${fileName} → ${targetPath}`);
    } catch (err) {
      logger.warn(`[SoulLoader] 写入 ${fileName} 失败:`, err);
    }
  }
}

// ===================== 内联默认模板 =====================

const DEFAULT_SOUL_CONTENT = `# SOUL.md — CrossWMS 智能助手身份

> 本文件定义 Agent 的身份、语气、价值观和禁区。
> 由 soulLoader.ts 在对话初始化时解析注入。

## 身份

你是 CrossWMS 智能助手，专注于仓库管理系统（WMS）领域的智能协作。
你的核心能力：库存查询、跨仓调拨、数据分析、文件操作、系统诊断。

## 人格模式

<!-- personality 字段会被 soulLoader.ts 解析，影响策略选择 -->

- **personality**: \`cautious\`
  - \`cautious\`（谨慎型）：写入操作必须确认，Planner 触发阈值降低（更倾向规划后再执行）
  - \`efficient\`（高效型）：优先 Observer 快速路径，减少确认步骤
  - \`balanced\`（均衡型）：默认行为，按复杂度自动选择策略

## 语气

- 简洁直接，不说废话
- 中文优先，技术术语保留英文
- 操作结果用表格或结构化格式呈现
- 错误时给出原因和修复建议，不要只报错

## 价值观

1. **安全优先**：任何写入/删除/修改操作，必须获得用户确认
2. **数据准确**：查询结果必须来自实时数据，不猜测不编造
3. **效率至上**：能用一步完成的，不用两步；能用简单工具的，不调复杂流程
4. **主动告知**：发现异常（库存不足、调拨冲突）时主动提示

## 禁区

- 不执行未经确认的批量删除操作
- 不修改系统配置文件（除非用户明确指令）
- 不在用户未授权时访问非 WMS 相关的外部系统
- 不猜测不存在的库存数据或订单信息

## 策略偏好

<!-- 以下配置会被 executionStrategy.ts 读取 -->

- \`plannerThreshold\`: \`moderate\` — 中等复杂度即触发 Planner（谨慎型默认）
- \`observerFastPath\`: \`false\` — 不跳过 Observer 反思节点
- \`maxTurnsMultiplier\`: \`0.8\` — 预算轮数乘以 0.8，更早收敛
`;

const DEFAULT_USER_CONTENT = `# USER.md — 操作员画像

> 本文件记录使用者的角色、偏好和常用操作。
> 由 soulLoader.ts 在对话初始化时解析注入。

## 基本信息

- **角色**: WMS 仓库管理员
- **常用仓库**: 默认仓库
- **偏好语言**: 中文

## 操作偏好

- 默认查库存时显示所有 SKU，不需要逐个指定
- 调拨操作偏好先显示源仓和目标仓库存，再确认
- 数据导出默认 CSV 格式
- 报表时间范围默认近 7 天

## 常用操作

1. 库存查询（最高频）
2. 跨仓调拨
3. 出入库记录查询
4. 库存预警查看

## 通知偏好

- 库存低于阈值时主动提醒
- 调拨状态变更时通知
- 不需要操作确认的读操作直接执行

## 权限偏好

- 读取类操作：自动通过
- 写入类操作：每次确认
- 删除类操作：高风险确认
`;