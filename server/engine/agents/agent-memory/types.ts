import { z } from 'zod';

export const MemoryEntrySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  sessionId: z.string(),
  type: z.enum(['short-term', 'long-term', 'working']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
  relevanceScore: z.number().default(0),
  tags: z.array(z.string()).default([]),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemoryStoreConfigSchema = z.object({
  type: z.enum(['sqlite', 'memory', 'redis']),
  path: z.string().optional(),
  maxEntries: z.number().default(1000),
  maxAgeMs: z.number().default(86400000),
  evictionPolicy: z.enum(['lru', 'fifo', 'ttl']).default('ttl'),
});

export type MemoryStoreConfig = z.infer<typeof MemoryStoreConfigSchema>;

export interface MemoryRetrievalOptions {
  agentId: string;
  sessionId?: string;
  query?: string;
  type?: MemoryEntry['type'];
  tags?: string[];
  limit?: number;
  minRelevance?: number;
}

export interface MemoryRetentionPolicy {
  maxEntries: number;
  maxAgeMs: number;
  evictionPolicy: 'lru' | 'fifo' | 'ttl';
}