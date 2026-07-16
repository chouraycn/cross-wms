export type TextChunkProvider = string;

export type ChunkMode = 'length' | 'newline';

const DEFAULT_CHUNK_LIMIT = 4000;

export function resolveTextChunkLimit(provider?: TextChunkProvider, configLimit?: number): number {
  return configLimit ?? DEFAULT_CHUNK_LIMIT;
}

export function resolveChunkMode(provider?: TextChunkProvider, configMode?: ChunkMode): ChunkMode {
  return configMode ?? 'length';
}

export function chunkText(text: string, limit: number = DEFAULT_CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let breakAt = limit;
    const newlineIdx = remaining.lastIndexOf('\n', limit);
    if (newlineIdx > 0) breakAt = newlineIdx;
    else {
      const spaceIdx = remaining.lastIndexOf(' ', limit);
      if (spaceIdx > 0) breakAt = spaceIdx;
    }
    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function chunkMarkdownText(text: string, limit: number = DEFAULT_CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks = chunkText(text, limit);
  return chunks.map((chunk, i) => {
    if (i > 0) {
      const prevFence = chunks[i - 1].match(/```(\w*)\s*$/);
      if (prevFence && !chunk.startsWith('```')) {
        return '```\n' + chunk;
      }
    }
    if (i < chunks.length - 1) {
      const fenceCount = (chunk.match(/```/g) ?? []).length;
      if (fenceCount % 2 !== 0) {
        return chunk + '\n```';
      }
    }
    return chunk;
  });
}

export function chunkByNewline(text: string, limit: number = DEFAULT_CHUNK_LIMIT): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > limit && current) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function chunkTextWithMode(
  text: string,
  mode: ChunkMode,
  limit?: number,
  provider?: TextChunkProvider,
): string[] {
  const actualLimit = resolveTextChunkLimit(provider, limit);
  if (mode === 'newline') return chunkByNewline(text, actualLimit);
  return chunkText(text, actualLimit);
}
