import { logger } from '../../logger.js';

export interface SlugGeneratorOptions {
  maxLength?: number;
  separator?: string;
  lowerCase?: boolean;
}

const DEFAULT_OPTIONS: SlugGeneratorOptions = {
  maxLength: 60,
  separator: '-',
  lowerCase: true,
};

export function generateSlug(input: string, options: SlugGeneratorOptions = {}): string {
  const sep = options.separator !== undefined ? options.separator : '-';
  const len = options.maxLength !== undefined ? options.maxLength : 60;
  const lc = options.lowerCase !== undefined ? options.lowerCase : true;

  let slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, sep)
    .replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '');

  if (lc) {
    slug = slug.toLowerCase();
  }

  if (slug.length > len) {
    slug = slug.slice(0, len);
    slug = slug.replace(new RegExp(`${sep}+$`), '');
  }

  return slug || 'untitled';
}

export async function generateSlugFromLLM(
  content: string,
  options: SlugGeneratorOptions = {}
): Promise<string> {
  logger.debug('[hooks:SlugGenerator] Generating slug from content');

  const lines = content.trim().split('\n');
  let candidate = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed.length > 5) {
      candidate = trimmed;
      break;
    }
  }

  if (!candidate) {
    candidate = content.slice(0, 100);
  }

  return generateSlug(candidate, options);
}
