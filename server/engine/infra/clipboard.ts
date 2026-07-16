import { logger } from '../../logger.js';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      logger.debug('[infra:Clipboard] Copied to clipboard via Web API');
      return true;
    }
    
    const clipboardy = await import('clipboardy');
    await clipboardy.default.write(text);
    logger.debug('[infra:Clipboard] Copied to clipboard via clipboardy');
    return true;
  } catch (err) {
    logger.error(`[infra:Clipboard] Failed to copy: ${err}`);
    return false;
  }
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const text = await navigator.clipboard.readText();
      logger.debug('[infra:Clipboard] Read from clipboard via Web API');
      return text;
    }
    
    const clipboardy = await import('clipboardy');
    const text = await clipboardy.default.read();
    logger.debug('[infra:Clipboard] Read from clipboard via clipboardy');
    return text;
  } catch (err) {
    logger.error(`[infra:Clipboard] Failed to read: ${err}`);
    return null;
  }
}