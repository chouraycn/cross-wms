import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'document-extract',
  name: 'Document Extraction',
  description: 'Extract text and images from local document attachments',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
};

export default class DocumentExtractExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering document-extract extension');

    const config = {
      supportedFormats: ['pdf', 'docx', 'txt', 'md'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      extractImages: true,
      extractText: true,
    };

    context.logger.info('Document-extract extension registered with config:', JSON.stringify(config));
  }

  unregister(): void {
    console.log('Unregistering document-extract extension');
  }
}

export async function extractTextFromDocument(filePath: string): Promise<{ text: string; pages?: number }> {
  try {
    const content = await import('node:fs').then(fs => fs.promises.readFile(filePath));
    const text = content.toString('utf-8');
    return { text };
  } catch (error) {
    throw new Error(`Failed to extract text from document: ${(error as Error).message}`);
  }
}