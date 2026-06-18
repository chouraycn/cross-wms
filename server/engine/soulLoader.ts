/**
 * SoulLoader — 人格层加载器
 *
 * v8.5: 人格层基础设施
 * - 读取 ~/.cdf-know-clow/SOUL.md 和 USER.md
 * - 解析 personality 字段，供策略工厂使用
 * - 生成 system message 前缀，注入对话初始化
 * - 缓存机制，避免每次请求重复读盘
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

// ===================== 常量 =====================

const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');
const SOUL_FILE = 'SOUL.md';
const USER_FILE = 'USER.md';

// ===================== 类型定义 =====================

/** 人格模式 */
export type PersonalityMode = 'cautious' | 'efficient' | 'balanced';

/** 策略偏好配置 */
export interface StrategyPreferences {
  /** Planner 触发阈值: simple | moderate | complex */
  plannerThreshold: 'simple' | 'moderate' | 'complex';
  /** 是否启用 Observer 快速路径（跳过反思节点） */
  observerFastPath: boolean;
  /** 预算轮数乘数（<1 更早收敛，>1 更宽容） */
  maxTurnsMultiplier: number;
}

/** 人格解析结果 */
export interface SoulProfile {
  /** 身份描述 */
  identity: string;
  /** 人格模式 */
  personality: PersonalityMode;
  /** 语气 */
  tone: string[];
  /** 价值观 */
  values: string[];
  /** 禁区 */
  forbiddenZones: string[];
  /** 策略偏好 */
  strategy: StrategyPreferences;
  /** 原始 SOUL.md 内容（用于 system message 注入） */
  rawSoulContent: string;
  /** 原始 USER.md 内容 */
  rawUserContent: string;
}

// ===================== 默认值 =====================

const DEFAULT_STRATEGY: StrategyPreferences = {
  plannerThreshold: 'moderate',
  observerFastPath: false,
  maxTurnsMultiplier: 1.0,
};

const DEFAULT_PERSONALITY: PersonalityMode = 'balanced';

// ===================== 缓存 =====================

let cachedProfile: SoulProfile | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 分钟缓存

// ===================== 解析器 =====================

/**
 * 从 SOUL.md 内容中解析 personality 字段
 * 格式: `- **personality**: \`cautious\``
 */
function parsePersonality(content: string): PersonalityMode {
  const match = content.match(/-?\s*\*{0,2}personality\*{0,2}\s*[:：]\s*`?(cautious|efficient|balanced)`?/i);
  if (match) {
    const mode = match[1].toLowerCase() as PersonalityMode;
    if (['cautious', 'efficient', 'balanced'].includes(mode)) return mode;
  }
  return DEFAULT_PERSONALITY;
}

/**
 * 从 SOUL.md 内容中解析策略偏好
 */
function parseStrategyPreferences(content: string): StrategyPreferences {
  const prefs = { ...DEFAULT_STRATEGY };

  // plannerThreshold
  const ptMatch = content.match(/`plannerThreshold`\s*[:：]\s*`?(simple|moderate|complex)`?/i);
  if (ptMatch) prefs.plannerThreshold = ptMatch[1].toLowerCase() as StrategyPreferences['plannerThreshold'];

  // observerFastPath
  const ofpMatch = content.match(/`observerFastPath`\s*[:：]\s*`?(true|false)`?/i);
  if (ofpMatch) prefs.observerFastPath = ofpMatch[1].toLowerCase() === 'true';

  // maxTurnsMultiplier
  const mtmMatch = content.match(/`maxTurnsMultiplier`\s*[:：]\s*`?([\d.]+)`?/);
  if (mtmMatch) prefs.maxTurnsMultiplier = parseFloat(mtmMatch[1]) || 1.0;

  return prefs;
}

/**
 * 从 SOUL.md 内容中提取身份描述
 */
function parseIdentity(content: string): string {
  const section = extractSection(content, '身份');
  if (!section) return 'CrossWMS 智能助手';
  // 取第一行非空内容
  const lines = section.split('\n').filter(l => l.trim() && !l.trim().startsWith('<!--'));
  return lines[0]?.replace(/^[-*]\s*/, '').trim() || 'CrossWMS 智能助手';
}

/**
 * 从 SOUL.md 内容中提取列表项
 */
function parseListItems(content: string, sectionName: string): string[] {
  const section = extractSection(content, sectionName);
  if (!section) return [];
  return section
    .split('\n')
    .filter(l => /^\s*[-*]\s+/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

/**
 * 提取 Markdown 某个 ## 节的内容
 */
function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`^##\\s+${heading}[\\s\\S]*?(?=^##\\s+|^---\\s*$|$)`, 'm');
  const match = content.match(regex);
  return match ? match[0] : null;
}

/**
 * 安全读取文件
 */
function safeReadFile(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // 读取失败，返回空
  }
  return '';
}

// ===================== 公开 API =====================

/**
 * 加载人格配置（带缓存）
 *
 * 读取 ~/.cdf-know-clow/SOUL.md 和 USER.md，
 * 解析 personality 和策略偏好，返回结构化 SoulProfile。
 */
export function loadSoulProfile(forceRefresh = false): SoulProfile {
  const now = Date.now();
  if (!forceRefresh && cachedProfile && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedProfile;
  }

  const soulPath = path.join(CDF_KNOW_CLOW_DIR, SOUL_FILE);
  const userPath = path.join(CDF_KNOW_CLOW_DIR, USER_FILE);

  const rawSoulContent = safeReadFile(soulPath);
  const rawUserContent = safeReadFile(userPath);

  const profile: SoulProfile = {
    identity: parseIdentity(rawSoulContent),
    personality: parsePersonality(rawSoulContent),
    tone: parseListItems(rawSoulContent, '语气'),
    values: parseListItems(rawSoulContent, '价值观'),
    forbiddenZones: parseListItems(rawSoulContent, '禁区'),
    strategy: parseStrategyPreferences(rawSoulContent),
    rawSoulContent,
    rawUserContent,
  };

  cachedProfile = profile;
  cacheTimestamp = now;

  return profile;
}

/**
 * 根据人格模式获取策略偏好覆盖
 *
 * 在 SOUL.md 未显式定义策略偏好时，
 * 根据 personality 字段自动推断默认偏好。
 */
export function getPersonalityStrategyDefaults(personality: PersonalityMode): StrategyPreferences {
  switch (personality) {
    case 'cautious':
      return {
        plannerThreshold: 'simple',    // 简单任务也触发 Planner
        observerFastPath: false,        // 不跳过反思
        maxTurnsMultiplier: 0.8,        // 更早收敛
      };
    case 'efficient':
      return {
        plannerThreshold: 'complex',    // 只有复杂任务才触发 Planner
        observerFastPath: true,         // 跳过反思，快速执行
        maxTurnsMultiplier: 1.2,        // 更宽松的轮数预算
      };
    case 'balanced':
    default:
      return DEFAULT_STRATEGY;
  }
}

/**
 * 生成人格 system message 前缀
 *
 * 将 SOUL.md + USER.md 的关键信息浓缩为 system message，
 * 注入对话初始化的最前面。
 */
export function buildSoulSystemMessage(): string {
  const profile = loadSoulProfile();
  const parts: string[] = [];

  // 人格核心
  parts.push(`[人格身份] ${profile.identity}`);
  parts.push(`[人格模式] ${profile.personality}`);

  if (profile.tone.length > 0) {
    parts.push(`[语气] ${profile.tone.join('；')}`);
  }

  if (profile.values.length > 0) {
    parts.push(`[价值观] ${profile.values.join('；')}`);
  }

  if (profile.forbiddenZones.length > 0) {
    parts.push(`[禁区] ${profile.forbiddenZones.join('；')}`);
  }

  // 用户画像
  if (profile.rawUserContent.trim()) {
    // 提取 USER.md 的关键信息，限制 500 字避免 token 膨胀
    const userSummary = profile.rawUserContent
      .replace(/<!--[\s\S]*?-->/g, '')   // 移除注释
      .replace(/^#+\s+/gm, '')           // 移除标题标记
      .trim()
      .slice(0, 500);
    parts.push(`[用户画像]\n${userSummary}`);
  }

  return parts.join('\n');
}

/**
 * 获取合并后的策略偏好（SOUL.md 显式配置 + personality 默认值）
 *
 * SOUL.md 中显式定义的配置优先，未定义的从 personality 默认值补充。
 */
export function getMergedStrategyPreferences(): StrategyPreferences {
  const profile = loadSoulProfile();
  const defaults = getPersonalityStrategyDefaults(profile.personality);

  // 检查 SOUL.md 是否有显式配置（通过比对默认值判断）
  const hasExplicitConfig =
    profile.strategy.plannerThreshold !== DEFAULT_STRATEGY.plannerThreshold ||
    profile.strategy.observerFastPath !== DEFAULT_STRATEGY.observerFastPath ||
    profile.strategy.maxTurnsMultiplier !== DEFAULT_STRATEGY.maxTurnsMultiplier;

  if (hasExplicitConfig) {
    // 显式配置优先，未覆盖的部分从 personality 默认值补充
    return {
      plannerThreshold: profile.strategy.plannerThreshold !== DEFAULT_STRATEGY.plannerThreshold
        ? profile.strategy.plannerThreshold
        : defaults.plannerThreshold,
      observerFastPath: profile.strategy.observerFastPath !== DEFAULT_STRATEGY.observerFastPath
        ? profile.strategy.observerFastPath
        : defaults.observerFastPath,
      maxTurnsMultiplier: profile.strategy.maxTurnsMultiplier !== DEFAULT_STRATEGY.maxTurnsMultiplier
        ? profile.strategy.maxTurnsMultiplier
        : defaults.maxTurnsMultiplier,
    };
  }

  // 无显式配置，完全使用 personality 默认值
  return defaults;
}

/**
 * 刷新缓存（SOUL.md / USER.md 被修改时调用）
 */
export function invalidateSoulCache(): void {
  cachedProfile = null;
  cacheTimestamp = 0;
}

/**
 * 初始化默认人格文件（首次启动时调用）
 *
 * 如果 ~/.cdf-know-clow/SOUL.md 或 USER.md 不存在，
 * 优先从项目目录 .cdf-know-clow/ 复制默认模板；
 * 复制失败（如 DMG 打包环境无模板文件）则使用内联默认内容。
 */
export function initDefaultSoulFiles(): void {
  // 打包环境无 import.meta.url，用 process.cwd() 兜底
  const projectSoulDir = path.join(process.cwd(), '.cdf-know-clow');

  fs.mkdirSync(CDF_KNOW_CLOW_DIR, { recursive: true });

  for (const fileName of [SOUL_FILE, USER_FILE]) {
    const targetPath = path.join(CDF_KNOW_CLOW_DIR, fileName);
    if (fs.existsSync(targetPath)) continue;  // 已存在不覆盖

    let content: string | null = null;

    // 策略1: 从项目模板复制
    const templatePath = path.join(projectSoulDir, fileName);
    if (fs.existsSync(templatePath)) {
      try {
        content = fs.readFileSync(templatePath, 'utf-8');
        console.log(`[SoulLoader] 从模板读取 ${fileName}`);
      } catch (err) {
        console.warn(`[SoulLoader] 读取模板 ${fileName} 失败:`, err);
      }
    }

    // 策略2: 内联默认内容（打包环境 fallback）
    if (!content) {
      content = fileName === SOUL_FILE ? DEFAULT_SOUL_CONTENT : DEFAULT_USER_CONTENT;
      console.log(`[SoulLoader] 使用内联默认 ${fileName}`);
    }

    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      console.log(`[SoulLoader] 初始化默认 ${fileName} → ${targetPath}`);
    } catch (err) {
      console.warn(`[SoulLoader] 写入 ${fileName} 失败:`, err);
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
