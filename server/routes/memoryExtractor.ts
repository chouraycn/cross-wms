import path from 'path';
import { promises as fsp } from 'fs';
import { callAIModel } from '../aiClient.js';
import { loadModelsConfig, isLocalModel } from '../modelsStore.js';
import { selectKey } from '../keyRotator.js';
import { writeMemory, searchMemory, extractKeywords } from '../engine/vecMemoryStore.js';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';

// MEMORY.md 路径
const MEMORY_MD_PATH = path.join(AppPaths.rootDir, 'MEMORY.md');

// v2.8.2: 记忆提取 LLM 调用节流 — 避免短时间内频繁调用 LLM 浪费资源
const MEMORY_EXTRACT_COOLDOWN_MS = 60_000; // 60s 冷却期
let lastMemoryExtractTime = 0;
let lastMemoryExtractMsgHash = '';

// v2.8.2: 简易 hash — 用于检测相同/相似用户消息，跳过重复提取
function quickHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// v2.8.2: Pre-LLM 启发式 — 检测对话是否以工具输出为主（不值得提取记忆）
function isToolOutputDominant(assistantMessage: string): boolean {
  // 工具输出特征：高密度的 JSON 标点、路径、日志标记
  const toolMarkers = (assistantMessage.match(/[{}[\]":,\\/]/g) || []).length;
  const punctRatio = assistantMessage.length > 0 ? toolMarkers / assistantMessage.length : 0;
  // 标点密度 > 15% 且消息长度 > 200 → 很可能是工具输出
  if (punctRatio > 0.15 && assistantMessage.length > 200) return true;
  // 检查典型工具输出开头模式
  if (/^(执行|工具|结果|输出|成功|失败|错误|Error|Result|Output)/.test(assistantMessage.trim())) return true;
  return false;
}

/** 读取 MEMORY.md 内容，不存在则返回空字符串 */
export async function readMemoryMd(): Promise<string> {
  try {
    return await fsp.readFile(MEMORY_MD_PATH, 'utf-8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      logger.error('[Memory] 读取失败:', e);
    }
  }
  return '';
}

/** 写入 MEMORY.md 内容（异步，不阻塞事件循环） */
export async function writeMemoryMd(content: string): Promise<void> {
  try {
    // v2.8.2: 异步 mkdir — recursive 选项保证幂等，无需 existsSync 预检查
    await fsp.mkdir(AppPaths.rootDir, { recursive: true });
    await fsp.writeFile(MEMORY_MD_PATH, content, 'utf-8');
  } catch (e) {
    logger.error('[Memory] 写入失败:', e);
    throw e;
  }
}

/**
 * 自动记忆学习：从对话中提取关键信息，追加到 MEMORY.md
 *
 * 策略：
 * 1. 只在对话轮次 >= 3 时触发（避免首句无意义提取）
 * 2. 异步执行，不阻塞主对话流程
 * 3. 提取前读取现有记忆，避免重复
 * 4. 只追加新内容，不覆盖用户手动编写的内容
 * 5. v2.8.2: 60s 冷却期 + 消息 hash 去重 — 避免短时间内重复 LLM 调用
 * 6. v2.8.2: Pre-LLM 启发式过滤 — 工具输出为主的对话直接跳过，节省 LLM 调用
 * 7. v2.8.2: 全异步文件 I/O — readMemoryMd/writeMemoryMd 均使用 fsp API
 */
export async function extractAndAppendMemory(
  userMessage: string,
  assistantMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<{ updated: boolean; count: number }> {
  try {
    // v1.5.132: 提高最小对话长度阈值，避免短对话产生噪音记忆
    if (userMessage.length < 10 || assistantMessage.length < 20) return { updated: false, count: 0 };

    // v1.5.132: 至少需要 3 轮对话才触发记忆提取
    if (conversationHistory.length < 4) return { updated: false, count: 0 };

    // v2.8.2: 冷却期检查 — 60s 内不重复调用 LLM
    const now = Date.now();
    if (now - lastMemoryExtractTime < MEMORY_EXTRACT_COOLDOWN_MS) {
      logger.debug('[AutoMemory] 冷却期内，跳过提取');
      return { updated: false, count: 0 };
    }

    // v2.8.2: 用户消息去重 — 相同/高度相似的消息跳过
    const msgHash = quickHash(userMessage.slice(0, 200));
    if (msgHash === lastMemoryExtractMsgHash) {
      logger.debug('[AutoMemory] 用户消息与上次相同，跳过提取');
      return { updated: false, count: 0 };
    }

    // v2.8.2: Pre-LLM 启发式 — 工具输出为主的对话不值得提取
    if (isToolOutputDominant(assistantMessage)) {
      logger.debug('[AutoMemory] 助手回复以工具输出为主，跳过提取');
      return { updated: false, count: 0 };
    }

    // v2.8.2: 更新冷却时间戳和消息 hash（在 LLM 调用前设置，防止并发重复）
    lastMemoryExtractTime = now;
    lastMemoryExtractMsgHash = msgHash;

    const existingMemory = await readMemoryMd();

    // 构建提取 prompt
    const historySummary = conversationHistory
      .slice(-6) // 最近 3 轮
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const extractPrompt = `你是一个记忆提取助手。请从以下对话中提取值得长期记住的关键信息。\n\n## 提取规则\n1. 只提取以下类型的信息：\n   - 用户的偏好、习惯、喜好\n   - 用户提到的个人事实（名字、角色、环境等）\n   - 用户明确要求记住的指令或规则\n   - 重要的项目上下文（技术栈、配置、约定）\n2. 严禁提取：\n   - 工具执行的输出结果、文件内容、代码片段\n   - 文件路径、URL、命令行输出\n   - 临时性问题（如"今天天气怎么样"）\n   - 已经在现有记忆中存在的重复信息\n   - 对话中的闲聊、客套\n   - AI 助手自己的回复内容\n   - JSON 数据、日志输出、堆栈跟踪\n3. 每条记忆用一行简洁的中文描述，10-100 字\n4. 如果没有值得记住的新信息，返回空字符串\n5. 宁可少提取，也不要提取噪音信息\n\n## 现有记忆\n${existingMemory || '（无现有记忆）'}\n\n## 最近对话\n${historySummary}\n\n## 本次对话\n用户: ${userMessage.slice(0, 500)}\n助手: ${assistantMessage.slice(0, 500)}\n\n请只输出提取到的记忆条目，每条一行。如果没有新信息，输出空字符串。不要输出任何解释。`;

    // 使用当前可用的模型进行提取
    const modelsConfig = await loadModelsConfig();
    const availableModels = modelsConfig.models.filter((m) => m.enabled);
    const targetModel = availableModels[0];

    if (!targetModel) {
      logger.debug('[AutoMemory] 无可用模型，跳过记忆提取');
      return { updated: false, count: 0 };
    }

    const keyResult = selectKey(targetModel);
    const effectiveApiKey = keyResult ? keyResult.key : undefined;

    if (!effectiveApiKey && !isLocalModel(targetModel)) {
      logger.debug('[AutoMemory] 无可用 API Key，跳过记忆提取');
      return { updated: false, count: 0 };
    }

    // 调用 AI 进行提取（非流式）
    const extractMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: '你是一个精确的记忆提取助手。只输出提取到的记忆条目，不要输出任何解释或格式标记。' },
      { role: 'user', content: extractPrompt },
    ];

    const extractedContent = await callAIModel(
      {
        id: targetModel.id,
        provider: targetModel.provider || '',
        apiEndpoint: targetModel.apiEndpoint,
        apiKey: effectiveApiKey,
        maxTokens: 512,
        temperature: 0.3,
      },
      extractMessages,
    );

    if (!extractedContent?.trim()) {
      logger.debug('[AutoMemory] 未提取到新记忆');
      return { updated: false, count: 0 };
    }

    // 清理提取结果：去除可能的 markdown 标记
    const cleanedExtraction = extractedContent
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').replace(/^#+\s*/, '').trim())
      .filter((line) => line.length > 3 && line.length < 200)
      .join('\n');

    if (!cleanedExtraction) {
      logger.debug('[AutoMemory] 清理后无有效记忆');
      return { updated: false, count: 0 };
    }

    // v1.5.132: 噪音过滤 — 过滤掉工具输出、文件路径、JSON 等非语义记忆
    const NOISE_PATTERNS = [
      /^(\/|\.\/|~\/|C:\\\\)/,          // 文件路径
      /^\s*[{[]/,                      // JSON/数组开头
      /^\s*(error|warn|info|debug)\b/i, // 日志级别
      /^\s*(git|npm|yarn|pnpm|npx|pip|python|node|bash|sh)\s/, // 命令行
      /^\s*(import|export|const|let|var|function|class)\s/, // 代码
      /^\s*\d{4}-\d{2}-\d{2}/,         // 日期开头
      /^\s*<(html|head|body|div|span|script|style)/, // HTML 标签
      /^\s*(http|https|ftp):\/\//,     // URL
      /^\s*\[.{50,}\]/,                // 长数组/工具调用结果
      /[{}]{3,}/,                      // 多层 JSON 嵌套
    ];

    const isNoise = (line: string): boolean => {
      // 过短或过长
      if (line.length < 8 || line.length > 150) return true;
      // 匹配噪音模式
      for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(line)) return true;
      }
      // 包含大量标点（工具输出特征）
      const punctCount = (line.match(/[{}[\]":,\\/]/g) || []).length;
      if (punctCount > line.length * 0.2) return true;
      return false;
    };

    // 去重：检查每条新记忆是否已存在于现有记忆中
    const existingLines = new Set(
      existingMemory.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean),
    );
    const newLines = cleanedExtraction
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 3 && !existingLines.has(l.toLowerCase()))
      .filter((l) => !isNoise(l)); // v1.5.132: 噪音过滤

    if (newLines.length === 0) {
      logger.debug('[AutoMemory] 过滤后无有效记忆（可能均为噪音）');
      return { updated: false, count: 0 };
    }

    // 追加到 MEMORY.md
    const timestamp = new Date().toLocaleString('zh-CN');
    const newSection = `\n## 自动学习 (${timestamp})\n${newLines.map((l) => `- ${l}`).join('\n')}\n`;
    const updatedMemory = existingMemory
      ? existingMemory.trimEnd() + '\n' + newSection
      : `# AI 记忆 (MEMORY.md)\n\n本文件由 AI 自动学习和用户手动编辑共同维护。\n${newSection}`;

    await writeMemoryMd(updatedMemory);
    logger.debug(`[AutoMemory] 成功追加 ${newLines.length} 条记忆`);

    // 同步写入 vecMemoryStore（向量语义索引）
    // 使用 extractKeywords 提取关键词，提升降级搜索准确率
    for (const line of newLines) {
      try {
        await writeMemory({
          userId: 'default',
          sessionId: 'auto-memory',
          category: 'insight',
          content: line,
          keywords: extractKeywords(`${userMessage} ${line}`),
        });
      } catch (e) {
        logger.error('[Memory] Failed to store to vecMemoryStore:', e);
      }
    }

    return { updated: true, count: newLines.length };
  } catch (e) {
    // 记忆提取失败不应影响主对话流程
    logger.error('[AutoMemory] 提取失败:', e instanceof Error ? e.message : e);
    return { updated: false, count: 0 };
  }
}
