/**
 * 前端技能链 Store — 事件总线模式
 * 管理技能链的 CRUD、复制与执行
 */

import type { SkillChain } from '../types/skill';
import * as api from '../services/api';

class ChainStore {
  private chains: SkillChain[] = [];
  private listeners = new Set<() => void>();

  /** 获取所有链 */
  getChains(): SkillChain[] {
    return this.chains;
  }

  /** 根据 ID 获取链 */
  getChain(id: string): SkillChain | undefined {
    return this.chains.find((c) => c.id === id);
  }

  /** 从 API 加载所有链 */
  async loadChains(): Promise<void> {
    try {
      this.chains = await api.fetchSkillChains();
      this.notifyAll();
    } catch (e) {
      // console.error('[chainStore] loadChains failed:', e);
    }
  }

  /** 创建新链 */
  async createChain(data: Omit<SkillChain, 'id' | 'createdAt' | 'updatedAt'>): Promise<SkillChain> {
    const chain = await api.createSkillChain(data);
    this.chains.push(chain);
    this.notifyAll();
    return chain;
  }

  /** 更新链 */
  async updateChain(id: string, data: Partial<SkillChain>): Promise<void> {
    const updated = await api.updateSkillChain(id, data);
    const idx = this.chains.findIndex((c) => c.id === id);
    if (idx >= 0) {
      this.chains[idx] = updated;
    }
    this.notifyAll();
  }

  /** 删除链 */
  async deleteChain(id: string): Promise<void> {
    await api.deleteSkillChain(id);
    this.chains = this.chains.filter((c) => c.id !== id);
    this.notifyAll();
  }

  /** 复制链 */
  async duplicateChain(id: string): Promise<SkillChain> {
    const dup = await api.duplicateSkillChain(id);
    this.chains.push(dup);
    this.notifyAll();
    return dup;
  }

  /** 订阅变更 */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** 通知所有监听者 */
  private notifyAll(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        // console.error('[chainStore] listener error:', e);
      }
    });
  }
}

export const chainStore = new ChainStore();
