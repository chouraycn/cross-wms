import { z } from 'zod';
import { logger } from '../../logger.js';

export const ToolImageSchema = z.object({
  toolName: z.string(),
  type: z.enum(['icon', 'screenshot', 'diagram', 'thumbnail']),
  url: z.string().optional(),
  dataUri: z.string().optional(),
  alt: z.string().default(''),
  width: z.number().optional(),
  height: z.number().optional(),
  mimeType: z.string().default('image/png'),
});

export type ToolImage = z.infer<typeof ToolImageSchema>;

const imageStore = new Map<string, Map<string, ToolImage>>();

export function registerToolImage(toolName: string, image: ToolImage): void {
  if (!imageStore.has(toolName)) {
    imageStore.set(toolName, new Map());
  }
  imageStore.get(toolName)!.set(image.type, image);
  logger.debug(`[Agents:ToolImages] Registered ${image.type} for ${toolName}`);
}

export function getToolImage(toolName: string, type: ToolImage['type']): ToolImage | undefined {
  return imageStore.get(toolName)?.get(type);
}

export function getToolImages(toolName: string): ToolImage[] {
  const toolImages = imageStore.get(toolName);
  return toolImages ? Array.from(toolImages.values()) : [];
}

export function removeToolImage(toolName: string, type: ToolImage['type']): boolean {
  const toolImages = imageStore.get(toolName);
  if (!toolImages) return false;
  const existed = toolImages.has(type);
  toolImages.delete(type);
  if (toolImages.size === 0) {
    imageStore.delete(toolName);
  }
  return existed;
}

export function clearToolImages(toolName?: string): void {
  if (toolName) {
    imageStore.delete(toolName);
  } else {
    imageStore.clear();
  }
}

export function hasToolImage(toolName: string, type: ToolImage['type']): boolean {
  return imageStore.get(toolName)?.has(type) ?? false;
}

export function listToolsWithImages(): string[] {
  return Array.from(imageStore.keys());
}

export function getToolIcon(toolName: string, category?: string): string {
  const icon = getToolImage(toolName, 'icon');
  if (icon?.dataUri) return icon.dataUri;
  if (icon?.url) return icon.url;
  
  const categoryIcons: Record<string, string> = {
    file: '📁',
    code: '💻',
    search: '🔍',
    network: '🌐',
    system: '⚙️',
    database: '🗄️',
    general: '🔧',
    memory: '🧠',
    agent: '🤖',
  };
  return categoryIcons[category ?? 'general'] ?? '🔧';
}

logger.debug('[Agents:ToolImages] Module loaded');
