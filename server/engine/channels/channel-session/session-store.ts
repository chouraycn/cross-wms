import type { ChannelSession } from "../session.js";

export interface SessionStore {
  get(sessionId: string): Promise<ChannelSession | undefined>;
  set(session: ChannelSession): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
  list(): Promise<ChannelSession[]>;
  listByChannel(channelId: string): Promise<ChannelSession[]>;
  listByUserId(userId: string): Promise<ChannelSession[]>;
  clear(): Promise<void>;
  getCount(): Promise<number>;
}

export class MemorySessionStore implements SessionStore {
  private store = new Map<string, ChannelSession>();

  async get(sessionId: string): Promise<ChannelSession | undefined> {
    return this.store.get(sessionId);
  }

  async set(session: ChannelSession): Promise<void> {
    this.store.set(session.sessionId, session);
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }

  async list(): Promise<ChannelSession[]> {
    return Array.from(this.store.values());
  }

  async listByChannel(channelId: string): Promise<ChannelSession[]> {
    return Array.from(this.store.values()).filter((s) => s.channelId === channelId);
  }

  async listByUserId(userId: string): Promise<ChannelSession[]> {
    return Array.from(this.store.values()).filter((s) => s.userId === userId);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getCount(): Promise<number> {
    return this.store.size;
  }
}