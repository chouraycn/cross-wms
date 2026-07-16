export interface HookFrontmatter {
  name?: string;
  description?: string;
  events?: string[];
  enabled?: boolean;
  requires?: {
    bins?: string[];
    env?: string[];
  };
  [key: string]: unknown;
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

export function parseFrontmatter(content: string): HookFrontmatter {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return {};
  }

  const raw = match[1];
  const result: HookFrontmatter = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split(':');
    if (!key) continue;

    const value = valueParts.join(':').trim();
    const cleanKey = key.trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        result[cleanKey] = JSON.parse(value);
      } catch {
        result[cleanKey] = value;
      }
    } else if (value === 'true') {
      result[cleanKey] = true;
    } else if (value === 'false') {
      result[cleanKey] = false;
    } else {
      result[cleanKey] = value;
    }
  }

  return result;
}

export function extractBody(content: string): string {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return content;
  }
  return content.slice(match[0].length).trim();
}

export function serializeFrontmatter(data: HookFrontmatter): string {
  const lines: string[] = ['---'];
  
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  
  lines.push('---');
  return lines.join('\n');
}