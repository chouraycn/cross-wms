/**
 * PDF Providers — PDF 处理多提供商支持
 *
 * 提供多种 PDF 处理能力提供商：
 * - 本地解析提供商（pdf-parse）
 * - OCR 提供商（Tesseract/PaddleOCR）
 * - AI 总结提供商（OpenAI/Anthropic/Google）
 *
 * v1.0.0: 初始版本
 */

import type {
  OcrProviderConfig,
  OcrResult,
  AiProviderConfig,
  AiSummarizeRequest,
  AiSummarizeResponse,
  PdfMetadata,
} from './pdfTypes.js';

import { logger } from '../logger.js';
import { callAIModel as callModelAPI } from '../aiClient.js';

// ===================== 本地解析提供商 =====================

/**
 * 本地 PDF 解析提供商
 * 使用 pdf-parse 库进行文本提取
 */
export class LocalPdfProvider {
  name = 'local';

  /**
   * 提取 PDF 文本内容
   */
  async extractText(filePath: string): Promise<string> {
    const fs = require('fs');

    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || '';
    } catch (err) {
      logger.error('[LocalPdfProvider] 提取文本失败:', err instanceof Error ? err.message : String(err));
      throw new Error(`本地 PDF 提取失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 提取 PDF 元数据
   */
  async extractMetadata(filePath: string): Promise<PdfMetadata> {
    const fs = require('fs');

    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      const stat = fs.statSync(filePath);

      return {
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        subject: data.info?.Subject || undefined,
        creator: data.info?.Creator || undefined,
        producer: data.info?.Producer || undefined,
        creationDate: data.info?.CreationDate || undefined,
        modificationDate: data.info?.ModDate || undefined,
        pageCount: data.numpages,
        fileSize: stat.size,
      };
    } catch (err) {
      logger.error('[LocalPdfProvider] 提取元数据失败:', err instanceof Error ? err.message : String(err));
      throw new Error(`元数据提取失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 检查提供商是否可用
   */
  isAvailable(): boolean {
    try {
      require.resolve('pdf-parse');
      return true;
    } catch {
      return false;
    }
  }
}

// ===================== OCR 提供商 =====================

/**
 * OCR 提供商接口
 */
export interface OcrProvider {
  name: string;
  recognize(filePath: string, config?: OcrProviderConfig): Promise<OcrResult>;
  isAvailable(): boolean;
}

/**
 * Tesseract OCR 提供商
 * 需要安装 tesseract.js 或系统 Tesseract
 */
export class TesseractOcrProvider implements OcrProvider {
  name = 'tesseract';

  /**
   * 使用 Tesseract 进行 OCR 识别
   */
  async recognize(filePath: string, config?: OcrProviderConfig): Promise<OcrResult> {
    const fs = require('fs');

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    try {
      // 尝试使用 tesseract.js（浏览器和 Node.js 均支持）
      // @ts-expect-error tesseract.js 类型声明不可用
      const tesseract = await import('tesseract.js');

      const language = config?.language || 'chi_sim+eng';
      const worker = await tesseract.createWorker(language, 1, {
        logger: (m: { status?: string; progress?: number }) => logger.debug('[Tesseract]', m.status, m.progress),
      });

      const result = await worker.recognize(filePath);
      await worker.terminate();

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        pages: [
          {
            pageNumber: 1,
            text: result.data.text,
            confidence: result.data.confidence,
          },
        ],
      };
    } catch (err) {
      logger.error('[TesseractOcrProvider] OCR 失败:', err instanceof Error ? err.message : String(err));

      // 如果 tesseract.js 不可用，尝试调用系统 Tesseract
      try {
        const { execSync } = require('child_process');
        const language = config?.language || 'chi_sim+eng';

        // 检查系统 Tesseract 是否可用
        try {
          execSync('tesseract --version', { stdio: 'ignore' });
        } catch {
          throw new Error('系统 Tesseract 未安装');
        }

        // 调用 Tesseract 进行 OCR
        const outputPath = `/tmp/tesseract_output_${Date.now()}`;
        execSync(`tesseract "${filePath}" "${outputPath}" -l ${language}`, {
          timeout: 60000,
        });

        const text = fs.readFileSync(`${outputPath}.txt`, 'utf-8');
        fs.unlinkSync(`${outputPath}.txt`);

        return {
          text,
          confidence: 0, // 系统 Tesseract 不提供置信度
          pages: [
            {
              pageNumber: 1,
              text,
              confidence: 0,
            },
          ],
        };
      } catch (systemErr) {
        throw new Error(`OCR 失败: tesseract.js 和系统 Tesseract 均不可用`);
      }
    }
  }

  /**
   * 检查提供商是否可用
   */
  isAvailable(): boolean {
    // 检查 tesseract.js
    try {
      require.resolve('tesseract.js');
      return true;
    } catch {}

    // 检查系统 Tesseract
    try {
      const { execSync } = require('child_process');
      execSync('tesseract --version', { stdio: 'ignore' });
      return true;
    } catch {}

    return false;
  }
}

/**
 * PaddleOCR 提供商
 * 需要安装 PaddleOCR（Python）
 */
export class PaddleOcrProvider implements OcrProvider {
  name = 'paddleocr';

  /**
   * 使用 PaddleOCR 进行识别
   */
  async recognize(filePath: string, config?: OcrProviderConfig): Promise<OcrResult> {
    const fs = require('fs');

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    try {
      // PaddleOCR 通常通过 Python 调用
      // 这里通过子进程调用 Python PaddleOCR
      const { execSync } = require('child_process');

      // 创建临时 Python 脚本
      const pythonScript = `
import sys
try:
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(use_angle_cls=True, lang='${config?.language || 'ch'}')
    result = ocr.ocr('${filePath}', cls=True)
    text_lines = []
    for line in result:
        if line:
            for word_info in line:
                text_lines.append(word_info[1][0])
    print('\\n'.join(text_lines))
except Exception as e:
    print('ERROR:', str(e))
    sys.exit(1)
`;

      const scriptPath = `/tmp/paddleocr_script_${Date.now()}.py`;
      fs.writeFileSync(scriptPath, pythonScript);

      const output = execSync(`python3 "${scriptPath}"`, {
        timeout: 120000,
        encoding: 'utf-8',
      });

      fs.unlinkSync(scriptPath);

      if (output.startsWith('ERROR:')) {
        throw new Error(output.substring(6));
      }

      return {
        text: output,
        confidence: 0, // PaddleOCR 不提供整体置信度
        pages: [
          {
            pageNumber: 1,
            text: output,
            confidence: 0,
          },
        ],
      };
    } catch (err) {
      logger.error('[PaddleOcrProvider] OCR 失败:', err instanceof Error ? err.message : String(err));
      throw new Error(`PaddleOCR 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 检查提供商是否可用
   */
  isAvailable(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('python3 -c "from paddleocr import PaddleOCR"', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

// ===================== AI 总结提供商 =====================

/**
 * AI 总结提供商接口
 */
export interface AiSummarizeProvider {
  name: string;
  summarize(request: AiSummarizeRequest, config?: AiProviderConfig): Promise<AiSummarizeResponse>;
  isAvailable(): boolean;
}

/**
 * OpenAI 总结提供商
 */
export class OpenAiSummarizeProvider implements AiSummarizeProvider {
  name = 'openai';

  /**
   * 使用 OpenAI 进行总结
   */
  async summarize(request: AiSummarizeRequest, config?: AiProviderConfig): Promise<AiSummarizeResponse> {
    const model = config?.model || 'gpt-4o-mini';
    const maxTokens = config?.maxTokens || 2000;

    // 构建总结提示词
    const systemPrompt = this.buildSystemPrompt(request.summaryType, request.customPrompt);
    const userPrompt = this.buildUserPrompt(request.text, request.metadata);

    try {
      const response = await callModelAPI({
        id: 'pdf-summarize',
        provider: 'openai',
        apiEndpoint: config?.apiEndpoint,
        apiKey: config?.apiKey,
        maxTokens,
        temperature: config?.temperature || 0.7,
      }, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // 解析响应
      const summary = response;

      // 如果是结构化总结，尝试解析 JSON
      if (request.summaryType === 'structured') {
        try {
          const parsed = JSON.parse(summary);
          return {
            summary: parsed.summary || summary,
            keyPoints: parsed.keyPoints,
            structure: parsed.structure,
          };
        } catch {
          // JSON 解析失败，返回原始文本
          return {
            summary,
          };
        }
      }

      return {
        summary,
      };
    } catch (err) {
      logger.error('[OpenAiSummarizeProvider] 总结失败:', err instanceof Error ? err.message : String(err));
      throw new Error(`OpenAI 总结失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(summaryType: string, customPrompt?: string): string {
    if (customPrompt) {
      return customPrompt;
    }

    switch (summaryType) {
      case 'brief':
        return '你是一个专业的文档总结助手。请用简洁的语言总结以下 PDF 文档的核心内容，控制在 200 字以内。';
      case 'detailed':
        return '你是一个专业的文档总结助手。请详细总结以下 PDF 文档的内容，包括主要观点、关键信息、重要结论等。';
      case 'structured':
        return `你是一个专业的文档总结助手。请对以下 PDF 文档进行结构化总结，返回 JSON 格式：
{
  "summary": "文档整体摘要",
  "keyPoints": ["关键点1", "关键点2", ...],
  "structure": {
    "sections": [
      {"title": "章节标题", "summary": "章节摘要", "pageNumber": 页码}
    ]
  }
}`;
      default:
        return '你是一个专业的文档总结助手。请总结以下 PDF 文档的内容。';
    }
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(text: string, metadata?: PdfMetadata): string {
    let prompt = '';

    if (metadata) {
      prompt += `文档信息：\n`;
      if (metadata.title) prompt += `- 标题：${metadata.title}\n`;
      if (metadata.author) prompt += `- 作者：${metadata.author}\n`;
      if (metadata.pageCount) prompt += `- 页数：${metadata.pageCount}\n`;
      prompt += '\n';
    }

    prompt += `文档内容：\n${text}`;

    return prompt;
  }

  /**
   * 检查提供商是否可用
   */
  isAvailable(): boolean {
    // OpenAI 总是可用（只要有 API Key）
    return true;
  }
}

/**
 * Anthropic 总结提供商
 */
export class AnthropicSummarizeProvider implements AiSummarizeProvider {
  name = 'anthropic';

  /**
   * 使用 Anthropic Claude 进行总结
   */
  async summarize(request: AiSummarizeRequest, config?: AiProviderConfig): Promise<AiSummarizeResponse> {
    const model = config?.model || 'claude-3-5-sonnet-20241022';
    const maxTokens = config?.maxTokens || 2000;

    const systemPrompt = this.buildSystemPrompt(request.summaryType, request.customPrompt);
    const userPrompt = this.buildUserPrompt(request.text, request.metadata);

    try {
      const response = await callModelAPI({
        id: 'pdf-summarize',
        provider: 'anthropic',
        apiEndpoint: config?.apiEndpoint,
        apiKey: config?.apiKey,
        maxTokens,
        temperature: config?.temperature || 0.7,
      }, [
        { role: 'user', content: userPrompt },
      ]);

      return {
        summary: response,
      };
    } catch (err) {
      logger.error('[AnthropicSummarizeProvider] 总结失败:', err instanceof Error ? err.message : String(err));
      throw new Error(`Anthropic 总结失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildSystemPrompt(summaryType: string, customPrompt?: string): string {
    if (customPrompt) return customPrompt;

    switch (summaryType) {
      case 'brief':
        return '你是一个专业的文档总结助手。请用简洁的语言总结以下 PDF 文档的核心内容。';
      case 'detailed':
        return '你是一个专业的文档总结助手。请详细总结以下 PDF 文档的内容。';
      case 'structured':
        return '你是一个专业的文档总结助手。请对以下 PDF 文档进行结构化总结，提取关键点和章节结构。';
      default:
        return '你是一个专业的文档总结助手。请总结以下 PDF 文档的内容。';
    }
  }

  private buildUserPrompt(text: string, metadata?: PdfMetadata): string {
    let prompt = '';
    if (metadata) {
      prompt += `文档信息：标题=${metadata.title || '未知'}, 作者=${metadata.author || '未知'}, 页数=${metadata.pageCount}\n\n`;
    }
    prompt += `请总结以下文档内容：\n${text}`;
    return prompt;
  }

  isAvailable(): boolean {
    return true;
  }
}

/**
 * Google 总结提供商（Gemini）
 */
export class GoogleSummarizeProvider implements AiSummarizeProvider {
  name = 'google';

  async summarize(request: AiSummarizeRequest, config?: AiProviderConfig): Promise<AiSummarizeResponse> {
    const model = config?.model || 'gemini-1.5-flash';
    const maxTokens = config?.maxTokens || 2000;

    const prompt = this.buildPrompt(request);

    try {
      const response = await callModelAPI({
        id: 'pdf-summarize',
        provider: 'google',
        apiEndpoint: config?.apiEndpoint,
        apiKey: config?.apiKey,
        maxTokens,
        temperature: config?.temperature || 0.7,
      }, [
        { role: 'user', content: prompt },
      ]);

      return {
        summary: response,
      };
    } catch (err) {
      logger.error('[GoogleSummarizeProvider] 总结失败:', err instanceof Error ? err.message : String(err));
      throw new Error(`Google 总结失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildPrompt(request: AiSummarizeRequest): string {
    const typeInstructions = {
      brief: '请用简洁的语言总结以下文档的核心内容：',
      detailed: '请详细总结以下文档的内容：',
      structured: '请对以下文档进行结构化总结，提取关键点：',
    };

    return `${typeInstructions[request.summaryType] || '请总结以下文档：'}\n\n${request.text}`;
  }

  isAvailable(): boolean {
    return true;
  }
}

// ===================== 提供商注册表 =====================

/**
 * OCR 提供商注册表
 */
export const ocrProviders: Map<string, OcrProvider> = new Map();

/**
 * AI 总结提供商注册表
 */
export const aiProviders: Map<string, AiSummarizeProvider> = new Map();

/**
 * 初始化默认提供商
 */
export function initPdfProviders(): void {
  // 注册 OCR 提供商
  ocrProviders.set('tesseract', new TesseractOcrProvider());
  ocrProviders.set('paddleocr', new PaddleOcrProvider());

  // 注册 AI 总结提供商
  aiProviders.set('openai', new OpenAiSummarizeProvider());
  aiProviders.set('anthropic', new AnthropicSummarizeProvider());
  aiProviders.set('google', new GoogleSummarizeProvider());

  logger.debug('[PDF Providers] 提供商初始化完成');
}

/**
 * 获取 OCR 提供商
 */
export function getOcrProvider(name: string): OcrProvider | undefined {
  return ocrProviders.get(name);
}

/**
 * 获取可用的 OCR 提供商
 */
export function getAvailableOcrProvider(): OcrProvider | undefined {
  // 优先使用 Tesseract
  const tesseract = ocrProviders.get('tesseract');
  if (tesseract?.isAvailable()) return tesseract;

  // 其次使用 PaddleOCR
  const paddleocr = ocrProviders.get('paddleocr');
  if (paddleocr?.isAvailable()) return paddleocr;

  return undefined;
}

/**
 * 获取 AI 总结提供商
 */
export function getAiProvider(name: string): AiSummarizeProvider | undefined {
  return aiProviders.get(name);
}

/**
 * 获取默认 AI 总结提供商
 */
export function getDefaultAiProvider(): AiSummarizeProvider {
  return aiProviders.get('openai')!;
}

// LocalPdfProvider 已在上方通过 `export class` 导出，此处无需重复导出