// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createConnectedChannelStatusPatch,
  createTransportActivityStatusPatch,
} from '../channel-status-patches.js';

describe('channel-status-patches', () => {
  describe('createConnectedChannelStatusPatch', () => {
    it('应返回 connected:true 的 patch', () => {
      const patch = createConnectedChannelStatusPatch(1000);
      expect(patch.connected).toBe(true);
    });

    it('应使用传入的时间戳填充 lastConnectedAt 与 lastEventAt', () => {
      const at = 1234567890;
      const patch = createConnectedChannelStatusPatch(at);
      expect(patch.lastConnectedAt).toBe(at);
      expect(patch.lastEventAt).toBe(at);
    });

    it('未传入时间戳时应使用 Date.now()（数值类型）', () => {
      const before = Date.now();
      const patch = createConnectedChannelStatusPatch();
      const after = Date.now();
      expect(typeof patch.lastConnectedAt).toBe('number');
      expect(patch.lastConnectedAt).toBeGreaterThanOrEqual(before);
      expect(patch.lastConnectedAt).toBeLessThanOrEqual(after);
      expect(patch.lastEventAt).toBe(patch.lastConnectedAt);
    });

    it('connected 应始终为 true', () => {
      expect(createConnectedChannelStatusPatch(0).connected).toBe(true);
      expect(createConnectedChannelStatusPatch(-1).connected).toBe(true);
    });
  });

  describe('createTransportActivityStatusPatch', () => {
    it('应返回 lastTransportActivityAt 字段', () => {
      const patch = createTransportActivityStatusPatch(5000);
      expect(patch.lastTransportActivityAt).toBe(5000);
    });

    it('未传入时间戳时应使用 Date.now()（数值类型）', () => {
      const before = Date.now();
      const patch = createTransportActivityStatusPatch();
      const after = Date.now();
      expect(typeof patch.lastTransportActivityAt).toBe('number');
      expect(patch.lastTransportActivityAt).toBeGreaterThanOrEqual(before);
      expect(patch.lastTransportActivityAt).toBeLessThanOrEqual(after);
    });

    it('应支持 0 时间戳', () => {
      const patch = createTransportActivityStatusPatch(0);
      expect(patch.lastTransportActivityAt).toBe(0);
    });

    it('不应包含 connected 字段', () => {
      const patch = createTransportActivityStatusPatch(100);
      expect((patch as Record<string, unknown>).connected).toBeUndefined();
    });
  });
});
