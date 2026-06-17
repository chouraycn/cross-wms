/**
 * FewShotTemplates — Few-shot 示例模板模块
 *
 * 定义 5-8 个 Few-shot 模板，根据用户消息匹配注入到上下文。
 * 提升 ReAct 首轮 Reasoning 的准确率。
 *
 * 核心方法：
 * - assessTrigger: 匹配用户消息，返回最佳模板
 * - injectTemplate: 将模板注入到消息列表中
 *
 * v5.0.0: ReAct 循环优化
 */

import type { MessageContent } from '../aiClient.js';

// ===================== 类型定义 =====================

/** Few-shot 示例 */
export interface FewShotExample {
  role: string;
  content: string;
}

/** Few-shot 模板 */
export interface FewShotTemplate {
  /** 模板唯一 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 触发模式列表（正则） */
  triggerPatterns: RegExp[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 示例列表 */
  examples: FewShotExample[];
}

// ===================== 模板定义 =====================

/**
 * 预定义的 Few-shot 模板列表。
 * 匹配优先级：WMS 业务模板 > 通用查询模板。
 */
const TEMPLATES: FewShotTemplate[] = [
  // 模板 1：WMS 库存查询
  {
    id: 'wms_inventory_query',
    name: 'WMS 库存查询',
    triggerPatterns: [
      /库存[查查询概]/,
      /查询.*库存/,
      /inventory/i,
      /stock.*level/i,
      /当前.*库存/,
      /SKU.*库存/,
    ],
    systemPrompt: '当用户查询库存时，优先使用 wms_inventory 工具获取实时库存数据。如果用户指定了仓库名称或 SKU，将其作为参数传入。',
    examples: [
      {
        role: 'user',
        content: '查一下当前仓库的库存情况',
      },
      {
        role: 'assistant',
        content: '我来帮您查询当前仓库的库存情况。',
      },
    ],
  },

  // 模板 2：跨仓调拨
  {
    id: 'wms_cross_warehouse_transfer',
    name: '跨仓调拨',
    triggerPatterns: [
      /调拨/,
      /跨仓/,
      /转移.*库存/,
      /transfer.*stock/i,
      /从.*仓.*到.*仓/,
    ],
    systemPrompt: '跨仓调拨需要多步骤执行：1) 查询源仓库库存 2) 确认目标仓库容量 3) 创建调拨单。请按步骤执行，每步确认后继续。',
    examples: [
      {
        role: 'user',
        content: '把A仓库的100件商品调拨到B仓库',
      },
      {
        role: 'assistant',
        content: '我将分步执行跨仓调拨：先查询A仓库库存，确认目标仓库容量，然后创建调拨单。',
      },
    ],
  },

  // 模板 3：文件操作
  {
    id: 'file_operations',
    name: '文件操作',
    triggerPatterns: [
      /读取.*文件/,
      /写入.*文件/,
      /查看.*文件/,
      /创建.*文件/,
      /删除.*文件/,
      /file.*(read|write|create|delete)/i,
      /文件.*操作/,
    ],
    systemPrompt: '文件操作时，先确认文件路径存在。读取文件使用 file_readFile，写入文件使用 file_writeFile（需确认），列目录使用 file_listDir。',
    examples: [
      {
        role: 'user',
        content: '读取 /data/config.json 文件',
      },
      {
        role: 'assistant',
        content: '我来帮您读取文件，首先确认文件路径。',
      },
    ],
  },

  // 模板 4：数据导出
  {
    id: 'data_export',
    name: '数据导出',
    triggerPatterns: [
      /导出/,
      /export/i,
      /下载.*数据/,
      /保存.*报表/,
      /生成.*报表/,
      /Excel|CSV|PDF/i,
    ],
    systemPrompt: '数据导出时，先查询数据库获取数据，然后使用文件写入工具保存。注意大文件需分批处理。导出格式默认 CSV。',
    examples: [
      {
        role: 'user',
        content: '导出当前库存数据为Excel',
      },
      {
        role: 'assistant',
        content: '我将先查询库存数据，然后导出为Excel文件。',
      },
    ],
  },

  // 模板 5：数据库查询
  {
    id: 'database_query',
    name: '数据库查询',
    triggerPatterns: [
      /查询.*数据/,
      /SQL/i,
      /数据库/,
      /select.*from/i,
      /统计.*数据/,
      /数据.*分析/,
    ],
    systemPrompt: '数据库查询时，先确认表结构（如需），再构造 SQL。使用 db_query 工具执行。避免 SELECT *，只查询需要的字段。',
    examples: [
      {
        role: 'user',
        content: '查询最近7天的入库记录',
      },
      {
        role: 'assistant',
        content: '我来帮您查询最近7天的入库记录，先确认表结构再构造查询。',
      },
    ],
  },

  // 模板 6：系统信息查询
  {
    id: 'system_info_query',
    name: '系统信息查询',
    triggerPatterns: [
      /系统.*信息/,
      /system.*info/i,
      /版本/,
      /version/i,
      /状态/,
      /status/i,
      /健康.*检查/,
    ],
    systemPrompt: '系统信息查询使用 system_info 或 desktop_health 工具，无需多步骤规划。',
    examples: [
      {
        role: 'user',
        content: '查看系统状态',
      },
      {
        role: 'assistant',
        content: '我来帮您查看系统状态。',
      },
    ],
  },

  // 模板 7：网络搜索
  {
    id: 'web_search_query',
    name: '网络搜索',
    triggerPatterns: [
      /搜索/,
      /search/i,
      /查找.*网上/,
      /google/i,
      /百度/,
      /最新.*新闻/,
    ],
    systemPrompt: '网络搜索使用 web_search 工具。如果需要抓取网页内容，使用 web_fetch 工具。',
    examples: [
      {
        role: 'user',
        content: '搜索一下最新的仓储管理技术',
      },
      {
        role: 'assistant',
        content: '我来帮您搜索最新的仓储管理技术。',
      },
    ],
  },

  // 模板 8：浏览器自动化
  {
    id: 'browser_automation',
    name: '浏览器自动化',
    triggerPatterns: [
      /打开.*网页/,
      /浏览器/,
      /browser/i,
      /网页.*操作/,
      /点击.*按钮/,
      /输入.*表单/,
    ],
    systemPrompt: '浏览器操作需要分步执行：1) 导航到页面 2) 截图确认 3) 执行操作（点击/输入）。每步需确认权限。',
    examples: [
      {
        role: 'user',
        content: '打开浏览器并访问 example.com',
      },
      {
        role: 'assistant',
        content: '我将帮您打开浏览器并访问指定网站，先导航到页面再截图确认。',
      },
    ],
  },
];

// ===================== FewShotTemplates 类 =====================

/**
 * Few-shot 模板管理器 — 模板匹配 + 注入逻辑。
 *
 * 匹配优先级：WMS 业务模板 > 通用查询模板。
 * 注入位置：在 system prompt 之后、用户消息之前。
 */
export class FewShotTemplates {
  private templates: FewShotTemplate[];

  constructor(templates?: FewShotTemplate[]) {
    this.templates = templates ?? TEMPLATES;
  }

  /**
   * 评估用户消息，匹配最佳 Few-shot 模板。
   *
   * 匹配逻辑：
   * 1. 遍历所有模板的 triggerPatterns
   * 2. 返回第一个匹配的模板（按定义顺序，即优先级顺序）
   * 3. 无匹配返回 null
   *
   * @param userMessage - 用户消息文本
   * @returns 匹配的模板或 null
   */
  assessTrigger(userMessage: string): FewShotTemplate | null {
    const messageText = typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);

    for (const template of this.templates) {
      for (const pattern of template.triggerPatterns) {
        if (pattern.test(messageText)) {
          return template;
        }
      }
    }

    return null;
  }

  /**
   * 将 Few-shot 模板注入到消息列表中。
   * 在 system prompt 之后插入模板的 systemPrompt 和示例。
   *
   * @param messages - 原始消息列表
   * @param template - 要注入的模板
   * @returns 注入后的消息列表
   */
  injectTemplate(
    messages: Array<{ role: string; content: MessageContent }>,
    template: FewShotTemplate,
  ): Array<{ role: string; content: MessageContent }> {
    const result = [...messages];

    // 找到第一条 system 消息的位置
    let firstSystemIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].role === 'system') {
        firstSystemIdx = i;
        break;
      }
    }

    // 构造注入消息
    const injectedMessages: Array<{ role: string; content: MessageContent }> = [
      {
        role: 'system',
        content: `[Few-shot 指导] ${template.systemPrompt}`,
      },
      ...template.examples.map(ex => ({
        role: ex.role,
        content: ex.content as MessageContent,
      })),
    ];

    // 在 system 消息后插入，或在开头插入
    if (firstSystemIdx >= 0) {
      result.splice(firstSystemIdx + 1, 0, ...injectedMessages);
    } else {
      result.unshift(...injectedMessages);
    }

    return result;
  }

  /**
   * 获取所有模板。
   */
  getTemplates(): FewShotTemplate[] {
    return [...this.templates];
  }

  /**
   * 根据 ID 获取模板。
   */
  getTemplateById(id: string): FewShotTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }
}

/**
 * 单例实例，供全局使用。
 */
export const fewShotTemplates = new FewShotTemplates();
