import type { MemoryEntry, MemoryInsertOptions } from './types.js';

export type ModalityType = 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'code' | 'structured';

export interface MultimodalContent {
  modality: ModalityType;
  data: string | Buffer;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  encoding?: string;
}

export interface MultimodalMemoryEntry extends MemoryEntry {
  modality: ModalityType;
  modalityData?: MultimodalContent[];
  transcription?: string;
  description?: string;
  extractedText?: string;
}

export interface ModalityProcessor {
  type: ModalityType;
  canProcess(mimeType: string): boolean;
  process(content: MultimodalContent): Promise<{
    text: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class TextProcessor implements ModalityProcessor {
  type: ModalityType = 'text';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('text/') || mimeType === 'application/json';
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const text = typeof content.data === 'string' ? content.data : content.data.toString('utf-8');
    return {
      text,
      description: `Text content (${text.length} characters)`,
      metadata: { length: text.length, mimeType: content.mimeType },
    };
  }
}

export class ImageProcessor implements ModalityProcessor {
  type: ModalityType = 'image';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;
    return {
      text: `[Image: ${content.metadata?.filename || 'unnamed'}]`,
      description: `Image file (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        filename: content.metadata?.filename,
      },
    };
  }
}

export class AudioProcessor implements ModalityProcessor {
  type: ModalityType = 'audio';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('audio/');
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;
    return {
      text: `[Audio: ${content.metadata?.filename || 'unnamed'}]`,
      description: `Audio file (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        duration: content.metadata?.duration,
        filename: content.metadata?.filename,
      },
    };
  }
}

export class VideoProcessor implements ModalityProcessor {
  type: ModalityType = 'video';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;
    return {
      text: `[Video: ${content.metadata?.filename || 'unnamed'}]`,
      description: `Video file (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        duration: content.metadata?.duration,
        filename: content.metadata?.filename,
      },
    };
  }
}

export class PdfProcessor implements ModalityProcessor {
  type: ModalityType = 'pdf';

  canProcess(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;
    return {
      text: `[PDF: ${content.metadata?.filename || 'unnamed'}]`,
      description: `PDF document (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        pages: content.metadata?.pages,
        filename: content.metadata?.filename,
      },
    };
  }
}

export class CodeProcessor implements ModalityProcessor {
  type: ModalityType = 'code';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('text/x-') || ['application/javascript', 'application/typescript'].includes(mimeType);
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const code = typeof content.data === 'string' ? content.data : content.data.toString('utf-8');
    const lines = code.split('\n').length;
    return {
      text: code,
      description: `Code (${lines} lines)`,
      metadata: {
        lines,
        language: content.metadata?.language,
        mimeType: content.mimeType,
      },
    };
  }
}

export class MultimodalProcessor {
  private processors: Map<ModalityType, ModalityProcessor>;

  constructor() {
    this.processors = new Map();
    this.processors.set('text', new TextProcessor());
    this.processors.set('image', new ImageProcessor());
    this.processors.set('audio', new AudioProcessor());
    this.processors.set('video', new VideoProcessor());
    this.processors.set('pdf', new PdfProcessor());
    this.processors.set('code', new CodeProcessor());
  }

  detectModality(mimeType: string): ModalityType | null {
    for (const [type, processor] of this.processors) {
      if (processor.canProcess(mimeType)) {
        return type;
      }
    }
    return null;
  }

  async processContent(content: MultimodalContent): Promise<{
    text: string;
    description?: string;
    modality: ModalityType;
    metadata?: Record<string, unknown>;
  }> {
    const processor = this.processors.get(content.modality);
    if (!processor) {
      throw new Error(`No processor for modality: ${content.modality}`);
    }

    const result = await processor.process(content);
    return {
      ...result,
      modality: content.modality,
    };
  }

  async processMultiple(contents: MultimodalContent[]): Promise<Array<{
    text: string;
    description?: string;
    modality: ModalityType;
    metadata?: Record<string, unknown>;
  }>> {
    return Promise.all(contents.map((c) => this.processContent(c)));
  }

  registerProcessor(processor: ModalityProcessor): void {
    this.processors.set(processor.type, processor);
  }

  getSupportedModalities(): ModalityType[] {
    return Array.from(this.processors.keys());
  }
}

export const multimodalProcessor = new MultimodalProcessor();

export async function createMultimodalEntry(
  contents: MultimodalContent[],
  options: MemoryInsertOptions = {},
): Promise<Partial<MultimodalMemoryEntry>> {
  const processed = await multimodalProcessor.processMultiple(contents);
  const texts = processed.map((p) => p.text).join('\n\n');
  const descriptions = processed.map((p) => p.description).filter(Boolean).join('; ');
  const primaryModality = contents[0]?.modality || 'text';

  return {
    text: texts,
    description: descriptions,
    modality: primaryModality,
    modalityData: contents,
    metadata: {
      ...options.metadata,
      modalities: processed.map((p) => p.modality),
      modalityCount: processed.length,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}