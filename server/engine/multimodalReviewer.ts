import { logger } from '../logger.js';
import type { OutputQuality } from './outputReviewer.js';

export interface MultimodalReviewInput {
  userQuestion: string;
  textResponse: string;
  images?: Array<{ url: string; description?: string }>;
  files?: Array<{ name: string; size: number; mimeType: string }>;
  model?: string;
}

export interface MultimodalReviewResult {
  quality: OutputQuality;
  textQuality: OutputQuality;
  imageQuality: OutputQuality;
  fileQuality: OutputQuality;
  issues: string[];
  suggestion: string;
}

export class MultimodalReviewer {
  private enabled: boolean;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async review(input: MultimodalReviewInput): Promise<MultimodalReviewResult> {
    if (!this.enabled) {
      return {
        quality: 'A',
        textQuality: 'A',
        imageQuality: 'A',
        fileQuality: 'A',
        issues: [],
        suggestion: 'multimodal reviewer disabled',
      };
    }

    const issues: string[] = [];
    const textQuality = this.reviewText(input.textResponse, input.userQuestion, issues);
    const imageQuality = this.reviewImages(input.images, issues);
    const fileQuality = this.reviewFiles(input.files, issues);

    const qualities: OutputQuality[] = [textQuality, imageQuality, fileQuality];
    const overallQuality = this.getLowestQuality(qualities);

    const suggestion = issues.length > 0
      ? issues[0]
      : 'All content reviewed successfully';

    logger.info(`[MultimodalReviewer] Quality: ${overallQuality} (text:${textQuality}, image:${imageQuality}, file:${fileQuality})`);

    return {
      quality: overallQuality,
      textQuality,
      imageQuality,
      fileQuality,
      issues,
      suggestion,
    };
  }

  private reviewText(text: string, question: string, issues: string[]): OutputQuality {
    if (!text || text.trim().length === 0) {
      issues.push('文本内容为空');
      return 'D';
    }

    if (text.length < 10) {
      issues.push('文本内容过短');
      return 'C';
    }

    if (question && text.trim() === question.trim()) {
      issues.push('AI 回答与用户问题完全相同');
      return 'D';
    }

    if (text.includes('I don\'t know') || text.includes('我不知道') && text.length < 50) {
      issues.push('AI 回答过于简单');
      return 'C';
    }

    return 'A';
  }

  private reviewImages(images: MultimodalReviewInput['images'], issues: string[]): OutputQuality {
    if (!images || images.length === 0) {
      return 'A';
    }

    let quality: OutputQuality = 'A';

    for (const img of images) {
      if (!img.url || img.url.trim().length === 0) {
        issues.push('图片 URL 为空');
        quality = this.getLowestQuality([quality, 'D']);
        continue;
      }

      if (!img.url.startsWith('http') && !img.url.startsWith('data:') && !img.url.startsWith('/')) {
        issues.push(`图片 URL 格式无效: ${img.url.slice(0, 30)}...`);
        quality = this.getLowestQuality([quality, 'C']);
      }

      if (!img.description || img.description.trim().length === 0) {
        issues.push('图片缺少描述文本');
        quality = this.getLowestQuality([quality, 'B']);
      }
    }

    return quality;
  }

  private reviewFiles(files: MultimodalReviewInput['files'], issues: string[]): OutputQuality {
    if (!files || files.length === 0) {
      return 'A';
    }

    let quality: OutputQuality = 'A';

    for (const file of files) {
      if (!file.name || file.name.trim().length === 0) {
        issues.push('文件名为空');
        quality = this.getLowestQuality([quality, 'D']);
        continue;
      }

      if (file.size <= 0) {
        issues.push(`文件大小无效: ${file.name}`);
        quality = this.getLowestQuality([quality, 'D']);
      }

      if (!file.mimeType || file.mimeType.trim().length === 0) {
        issues.push(`文件缺少 MIME 类型: ${file.name}`);
        quality = this.getLowestQuality([quality, 'B']);
      }

      const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1'];
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (dangerousExtensions.includes(ext)) {
        issues.push(`文件类型可能有安全风险: ${file.name}`);
        quality = this.getLowestQuality([quality, 'C']);
      }
    }

    return quality;
  }

  private getLowestQuality(qualities: OutputQuality[]): OutputQuality {
    const scores: Record<OutputQuality, number> = { A: 4, B: 3, C: 2, D: 1 };
    return qualities.reduce((min, q) => (scores[q] < scores[min] ? q : min), 'A' as OutputQuality);
  }
}

export const multimodalReviewer = new MultimodalReviewer();
