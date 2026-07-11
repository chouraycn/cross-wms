/**
 * code_understanding 工具处理器
 *
 * 把死代码单例 CodeUnderstandingService（server/engine/codeUnderstanding.ts）
 * 接入 LIVE 工具解析链路（toolRegistry），作为新增的内置工具 `code_understanding`。
 *
 * 设计：纯增量接入——仅在 initDefaultTools 注册一个新工具，不替换/分叉任何
 * 现有工具或 chat 执行路径。handler 接收结构化参数，调用服务方法，返回 JSON 字符串
 * （与 ToolHandler 签名 (args) => Promise<string> 一致）。
 */

import { getCodeUnderstandingService } from './codeUnderstanding.js';
import { logger } from '../logger.js';

export type CodeUnderstandingAction =
  | 'analyzeFile'
  | 'analyzeProject'
  | 'explainSymbol'
  | 'suggestImprovements';

/**
 * 处理 code_understanding 工具调用。
 *
 * 参数：
 *  - action:  'analyzeFile' | 'analyzeProject' | 'explainSymbol' | 'suggestImprovements'
 *  - filePath: 文件绝对/相对路径（analyzeFile / explainSymbol / suggestImprovements 必填）
 *  - rootPath: 项目根路径（analyzeProject 必填）
 *  - symbolName: 符号名（explainSymbol 必填）
 *  - line?: 符号所在行（explainSymbol 可选）
 */
export async function handleCodeUnderstanding(args: Record<string, unknown>): Promise<string> {
  const action = args.action as CodeUnderstandingAction | undefined;
  const service = getCodeUnderstandingService();

  try {
    switch (action) {
      case 'analyzeProject': {
        const rootPath = args.rootPath;
        if (typeof rootPath !== 'string' || !rootPath) {
          return JSON.stringify({ error: 'analyzeProject 需要 rootPath 参数' });
        }
        const result = await service.analyzeProject(rootPath);
        return JSON.stringify(result);
      }

      case 'explainSymbol': {
        const filePath = args.filePath;
        const symbolName = args.symbolName;
        if (typeof filePath !== 'string' || !filePath) {
          return JSON.stringify({ error: 'explainSymbol 需要 filePath 参数' });
        }
        if (typeof symbolName !== 'string' || !symbolName) {
          return JSON.stringify({ error: 'explainSymbol 需要 symbolName 参数' });
        }
        const line = typeof args.line === 'number' ? args.line : undefined;
        const result = await service.explainSymbol(filePath, symbolName, line);
        return JSON.stringify(result);
      }

      case 'suggestImprovements': {
        const filePath = args.filePath;
        if (typeof filePath !== 'string' || !filePath) {
          return JSON.stringify({ error: 'suggestImprovements 需要 filePath 参数' });
        }
        const result = await service.suggestImprovements(filePath);
        return JSON.stringify(result);
      }

      case 'analyzeFile':
      default: {
        const filePath = args.filePath;
        if (typeof filePath !== 'string' || !filePath) {
          return JSON.stringify({ error: 'analyzeFile 需要 filePath 参数' });
        }
        const result = await service.analyzeFile(filePath);
        return JSON.stringify(result);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[code_understanding] 执行失败:', message);
    return JSON.stringify({ error: message });
  }
}
