/**
 * Skill Auto Capture — 自动捕获推荐
 *
 * 从对话记录中提取持久化指令，自动生成 skill 提案。
 *
 * 功能：
 * 1. 信号提取（extractDurableInstructions）— 从对话中识别持久化指令模式
 * 2. 主题推断（inferTopic）— 基于关键词匹配推断 skill 主题分类
 * 3. 提案生成（generateSkillProposal）— 生成 SKILL.md 内容
 * 4. 自动捕获入口（runAutoCapture）— 检查重复、创建提案
 */

import { logger } from '../logger.js';
import { skillWorkshop, type SkillProposal } from './skillWorkshop.js';

// ===================== 类型定义 =====================

/** 对话消息 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 提取到的持久化指令 */
export interface DurableInstruction {
  /** 原始文本 */
  text: string;
  /** 触发模式 */
  pattern: string;
  /** 消息来源 */
  source: 'user' | 'assistant';
  /** 置信度 0-1 */
  confidence: number;
}

/** 主题类型 */
export type SkillTopic =
  | 'wms-operations'
  | 'inventory'
  | 'reporting'
  | 'automation'
  | 'general';

// ===================== 常量 =====================

/** 英文触发模式 */
const EN_PATTERNS: Array<{ regex: RegExp; pattern: string; confidence: number }> = [
  { regex: /next time/i, pattern: 'next_time', confidence: 0.9 },
  { regex: /from now on/i, pattern: 'from_now_on', confidence: 0.95 },
  { regex: /remember to/i, pattern: 'remember_to', confidence: 0.9 },
  { regex: /make sure to/i, pattern: 'make_sure_to', confidence: 0.85 },
  { regex: /always\s+(use|check|verify|do|follow|run|call|invoke)/i, pattern: 'always_action', confidence: 0.8 },
  { regex: /prefer\s+\w+\s+(when|instead)/i, pattern: 'prefer_when', confidence: 0.75 },
  { regex: /when (asked|you|prompted|requested)/i, pattern: 'when_asked', confidence: 0.7 },
  { regex: /in the future/i, pattern: 'in_the_future', confidence: 0.8 },
  { regex: /from this point (on|forward)/i, pattern: 'from_this_point', confidence: 0.9 },
  { regex: /don'?t forget to/i, pattern: 'dont_forget', confidence: 0.85 },
  { regex: /you should (always|never)?\s*/i, pattern: 'you_should', confidence: 0.7 },
  { regex: /i want you to/i, pattern: 'i_want_you_to', confidence: 0.65 },
];

/** 中文触发模式 */
const ZH_PATTERNS: Array<{ regex: RegExp; pattern: string; confidence: number }> = [
  { regex: /下次/, pattern: 'zh_next_time', confidence: 0.9 },
  { regex: /以后/, pattern: 'zh_from_now_on', confidence: 0.85 },
  { regex: /记住/, pattern: 'zh_remember', confidence: 0.9 },
  { regex: /记得/, pattern: 'zh_remember_to', confidence: 0.85 },
  { regex: /总是/, pattern: 'zh_always', confidence: 0.8 },
  { regex: /优先/, pattern: 'zh_prefer', confidence: 0.8 },
  { regex: /当[你我他它]?[被问询提]?到?时?/, pattern: 'zh_when_asked', confidence: 0.75 },
  { regex: /从今以后/, pattern: 'zh_from_now_on', confidence: 0.95 },
  { regex: /从此以后/, pattern: 'zh_from_now_on', confidence: 0.95 },
  { regex: /别忘了/, pattern: 'zh_dont_forget', confidence: 0.85 },
  { regex: /必须/, pattern: 'zh_must', confidence: 0.8 },
  { regex: /一定要/, pattern: 'zh_must', confidence: 0.85 },
];

/** 主题关键词映射 */
const TOPIC_KEYWORDS: Record<SkillTopic, string[]> = {
  'wms-operations': [
    '入库', '出库', '上架', '拣货', '盘点', '调拨', '移库', '补货',
    '收货', '发货', '仓储', '仓库', '库位', '批次', '序列号',
    'warehouse', 'inventory in', 'inventory out', 'putaway', 'picking',
    'stock count', 'cycle count', 'transfer', 'replenishment',
    'receiving', 'shipping', 'wms',
  ],
  'inventory': [
    '库存', '存货', '库存量', '库存查询', '库存预警', '库存周转',
    'stock', 'inventory level', 'stock level', 'sku',
    'available stock', 'on hand', 'reserved', 'backorder',
  ],
  'reporting': [
    '报表', '报告', '统计', '数据分析', '仪表盘', '可视化',
    'report', 'dashboard', 'analytics', 'statistics', 'chart',
    'kpi', 'metrics', 'summary',
  ],
  'automation': [
    '自动化', '自动', '定时', '调度', '批量', '批处理',
    'automation', 'auto', 'schedule', 'cron', 'batch',
    'workflow', 'pipeline', 'trigger',
  ],
  'general': [
    '通用', '帮助', '工具', '助手', '设置', '配置',
    'general', 'utility', 'helper', 'tool', 'config',
    'setup', 'common',
  ],
};

// ===================== AutoCaptureService 类 =====================

/**
 * 自动捕获服务
 *
 * 从对话记录中提取持久化指令，自动生成 skill 提案。
 */
export class AutoCaptureService {
  constructor() {}

  // ===================== 1. 信号提取 =====================

  /**
   * 从对话消息中提取持久化指令
   *
   * @param messages - 对话消息列表
   * @returns 提取到的持久化指令列表
   */
  extractDurableInstructions(messages: ChatMessage[]): DurableInstruction[] {
    const instructions: DurableInstruction[] = [];

    for (const msg of messages) {
      const content = msg.content;
      if (!content || content.trim().length < 5) continue;

      const lines = content.split(/\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 5) continue;

        // 检查英文模式
        for (const p of EN_PATTERNS) {
          if (p.regex.test(trimmed)) {
            instructions.push({
              text: trimmed,
              pattern: p.pattern,
              source: msg.role,
              confidence: p.confidence,
            });
            break;
          }
        }

        // 检查中文模式
        for (const p of ZH_PATTERNS) {
          if (p.regex.test(trimmed)) {
            instructions.push({
              text: trimmed,
              pattern: p.pattern,
              source: msg.role,
              confidence: p.confidence,
            });
            break;
          }
        }
      }
    }

    // 去重（基于文本内容）
    const seen = new Set<string>();
    const unique = instructions.filter((inst) => {
      const key = inst.text.toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 按置信度降序
    unique.sort((a, b) => b.confidence - a.confidence);

    logger.debug(`[AutoCapture] Extracted ${unique.length} durable instruction(s) from ${messages.length} message(s).`);

    return unique;
  }

  // ===================== 2. 主题推断 =====================

  /**
   * 基于文本内容推断主题分类
   *
   * @param text - 文本内容
   * @returns 主题分类
   */
  inferTopic(text: string): SkillTopic {
    const lowerText = text.toLowerCase();
    const scores: Record<SkillTopic, number> = {
      'wms-operations': 0,
      'inventory': 0,
      'reporting': 0,
      'automation': 0,
      'general': 0,
    };

    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) {
          scores[topic as SkillTopic]++;
        }
      }
    }

    // 找出得分最高的主题
    let bestTopic: SkillTopic = 'general';
    let bestScore = 0;

    for (const [topic, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestTopic = topic as SkillTopic;
      }
    }

    logger.debug(`[AutoCapture] Topic inference: "${bestTopic}" (score=${bestScore})`);

    return bestTopic;
  }

  // ===================== 3. 提案生成 =====================

  /**
   * 根据持久化指令生成 SKILL.md 内容
   *
   * @param instructions - 持久化指令列表
   * @param topic - 主题分类
   * @returns SKILL.md 内容
   */
  generateSkillProposal(
    instructions: DurableInstruction[],
    topic: SkillTopic,
  ): { name: string; description: string; content: string } {
    const topInstruction = instructions[0];
    const cleanedText = this.cleanInstructionText(topInstruction.text);
    const skillName = this.generateSkillName(cleanedText, topic);

    const description = this.generateDescription(instructions, topic);
    const triggers = this.generateTriggers(instructions);
    const instructionBody = this.generateInstructionBody(instructions);

    const frontmatter = [
      '---',
      `name: "${skillName}"`,
      `description: "${this.escapeYaml(description)}"`,
      `group: "${this.mapTopicToGroup(topic)}"`,
      `tags: [auto-captured, ${topic}]`,
      `triggers:`,
      ...triggers.map((t) => `  - "${this.escapeYaml(t)}"`),
      '---',
      '',
    ].join('\n');

    const body = [
      `# ${skillName}`,
      '',
      `## 说明`,
      '',
      description,
      '',
      `## 触发条件`,
      '',
      ...triggers.map((t) => `- ${t}`),
      '',
      `## 操作指南`,
      '',
      instructionBody,
      '',
      `## Captured from conversation`,
      '',
      `> 本 skill 由自动捕获功能从对话中提取生成。`,
      `> 生成时间：${new Date().toISOString()}`,
      '',
      `### 原始指令`,
      '',
      ...instructions.map((inst) => `- [${inst.source}] ${inst.text}`),
      '',
    ].join('\n');

    return {
      name: skillName,
      description,
      content: frontmatter + body,
    };
  }

  // ===================== 4. 自动捕获入口 =====================

  /**
   * 运行自动捕获
   *
   * 从对话消息中提取持久化指令并生成 skill 提案。
   * 会检查是否已有相同主题的 pending 提案（防重复）。
   *
   * @param messages - 对话消息列表
   * @returns 创建的提案，或 null（无新指令或已存在相同提案）
   */
  runAutoCapture(messages: ChatMessage[]): SkillProposal | null {
    logger.debug('[AutoCapture] Running auto-capture...');

    // 1. 提取持久化指令
    const instructions = this.extractDurableInstructions(messages);
    if (instructions.length === 0) {
      logger.debug('[AutoCapture] No durable instructions found.');
      return null;
    }

    // 2. 过滤低置信度
    const highConfidence = instructions.filter((i) => i.confidence >= 0.7);
    if (highConfidence.length === 0) {
      logger.debug('[AutoCapture] No high-confidence durable instructions.');
      return null;
    }

    // 3. 推断主题
    const combinedText = highConfidence.map((i) => i.text).join(' ');
    const topic = this.inferTopic(combinedText);

    // 4. 检查是否已有相同主题的 pending 提案（防重复）
    if (this.hasSimilarPendingProposal(highConfidence[0].text, topic)) {
      logger.debug(`[AutoCapture] Similar pending proposal already exists for topic "${topic}".`);
      return null;
    }

    // 5. 生成提案内容
    const { name, description, content } = this.generateSkillProposal(highConfidence, topic);

    // 6. 创建提案
    try {
      const proposal = skillWorkshop.createProposal({
        type: 'create',
        skillName: name,
        skillPath: `auto-captured/${name}/SKILL.md`,
        content,
        origin: {
          agentId: 'auto-capture',
        },
      });

      logger.info(`[AutoCapture] Created proposal "${proposal.id}" for skill "${name}" (topic=${topic}).`);

      return proposal;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[AutoCapture] Failed to create proposal: ${msg}`);
      return null;
    }
  }

  // ===================== 辅助方法 =====================

  /**
   * 检查是否已有相似的 pending 提案
   */
  private hasSimilarPendingProposal(text: string, topic: SkillTopic): boolean {
    const pending = skillWorkshop.listProposals({ status: 'pending', type: 'create' });

    const cleanedText = this.cleanInstructionText(text).toLowerCase();

    for (const proposal of pending) {
      // 检查 skillName 是否包含主题
      if (!proposal.skillPath.startsWith('auto-captured/')) continue;

      // 简单相似度：检查内容中是否包含相同关键词
      const proposalContent = proposal.content.toLowerCase();
      const sharedWords = this.countSharedWords(cleanedText, proposalContent);

      if (sharedWords >= 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * 计算两段文本的共享单词数
   */
  private countSharedWords(a: string, b: string): number {
    const wordsA = new Set(a.split(/[\s,，。.!！?？;；:：]+/).filter((w) => w.length >= 2));
    const wordsB = new Set(b.split(/[\s,，。.!！?？;；:：]+/).filter((w) => w.length >= 2));

    let count = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) count++;
    }
    return count;
  }

  /**
   * 清理指令文本（去掉触发词前缀）
   */
  private cleanInstructionText(text: string): string {
    let cleaned = text.trim();

    // 移除常见前缀
    const prefixPatterns = [
      /^next time[,，]?\s*/i,
      /^from now on[,，]?\s*/i,
      /^remember to\s+/i,
      /^make sure to\s+/i,
      /^always\s+/i,
      /^don'?t forget to\s+/i,
      /^in the future[,，]?\s*/i,
      /^下次[,，]?\s*/,
      /^以后[,，]?\s*/,
      /^记住[,，]?\s*/,
      /^记得[,，]?\s*/,
      /^别忘了[,，]?\s*/,
      /^一定要\s+/,
      /^必须\s+/,
    ];

    for (const p of prefixPatterns) {
      cleaned = cleaned.replace(p, '');
    }

    return cleaned.trim();
  }

  /**
   * 生成 skill 名称
   */
  private generateSkillName(text: string, topic: SkillTopic): string {
    // 取前 6 个词作为名称基础
    const words = text.split(/[\s,，。.!！?？;；:：]+/).filter((w) => w.length > 0).slice(0, 6);
    let name = words.join('-').toLowerCase();

    // 只保留字母数字和连字符
    name = name.replace(/[^a-z0-9\u4e00-\u9fa5\-]/g, '');

    // 避免过长
    if (name.length > 50) {
      name = name.slice(0, 50);
    }

    // 确保不以连字符开头或结尾
    name = name.replace(/^-+|-+$/g, '');

    // 如果名称太短，加上主题前缀
    if (name.length < 3) {
      name = `${topic}-auto-skill`;
    }

    return name;
  }

  /**
   * 生成描述
   */
  private generateDescription(instructions: DurableInstruction[], topic: SkillTopic): string {
    const top = instructions[0];
    const cleaned = this.cleanInstructionText(top.text);

    if (instructions.length === 1) {
      return `Auto-captured instruction: ${cleaned}`;
    }

    return `Auto-captured ${instructions.length} instructions about ${topic}. Primary: ${cleaned}`;
  }

  /**
   * 生成触发器列表
   */
  private generateTriggers(instructions: DurableInstruction[]): string[] {
    const triggers: string[] = [];

    for (const inst of instructions) {
      const cleaned = this.cleanInstructionText(inst.text);
      if (cleaned.length > 0 && cleaned.length < 100) {
        triggers.push(cleaned);
      }
      if (triggers.length >= 5) break;
    }

    if (triggers.length === 0) {
      triggers.push('auto-captured instruction');
    }

    return triggers;
  }

  /**
   * 生成指令主体内容
   */
  private generateInstructionBody(instructions: DurableInstruction[]): string {
    const lines: string[] = [];

    for (let i = 0; i < instructions.length; i++) {
      const inst = instructions[i];
      const cleaned = this.cleanInstructionText(inst.text);
      lines.push(`${i + 1}. ${cleaned}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 主题到权限组的映射
   */
  private mapTopicToGroup(topic: SkillTopic): string {
    switch (topic) {
      case 'wms-operations':
        return 'wms';
      case 'inventory':
        return 'wms';
      case 'reporting':
        return 'wms';
      case 'automation':
        return 'system';
      case 'general':
      default:
        return 'util';
    }
  }

  /**
   * 转义 YAML 字符串中的特殊字符
   */
  private escapeYaml(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
  }
}

// ===================== Module-level Singleton =====================

/** 自动捕获服务单例 */
export const autoCaptureService = new AutoCaptureService();
