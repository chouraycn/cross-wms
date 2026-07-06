# Document Extract Extension

Extract text and images from local document attachments for cross-wms.

## Features

- Supports multiple formats: PDF, DOCX, TXT, MD
- Extracts text content
- Extracts images (optional)
- Configurable max file size

## Usage

```typescript
import { extensionLoader } from '@cross-wms/extensions';

await extensionLoader.loadAll();
await extensionLoader.enable('document-extract');
```

## API

### extractTextFromDocument(filePath: string)

Extracts text from a document file.

```typescript
import { extractTextFromDocument } from '@cross-wms/document-extract-extension';

const result = await extractTextFromDocument('/path/to/document.pdf');
console.log(result.text);
```