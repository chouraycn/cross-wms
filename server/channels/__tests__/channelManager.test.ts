import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChannelManager } from "../channelManager.js";
import type { Channel, ChannelMessage, ChannelMeta } from "../types.js";

function createMockChannel(id: string, sendImpl?: (msg: ChannelMessage) => Promise<void>): Channel {
  return {
    id,
    meta: {
      id,
      label: `Channel ${id}`,
      selectionLabel: `Channel ${id}`,
    } as ChannelMeta,
    status: "ready",
    send: sendImpl ?? vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ChannelManager 模块单元测试", () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe("register / unregister", () => {
    it("应该注册频道", () => {
      const channel = createMockChannel("ch-1");
      manager.register(channel);
      expect(manager.get("ch-1")).toBe(channel);
    });

    it("重复注册应该覆盖旧频道", () => {
      const channel1 = createMockChannel("ch-1");
      const channel2 = createMockChannel("ch-1");
      manager.register(channel1);
      manager.register(channel2);
      expect(manager.get("ch-1")).toBe(channel2);
    });

    it("应该注销频道", () => {
      const channel = createMockChannel("ch-1");
      manager.register(channel);
      manager.unregister("ch-1");
      expect(manager.get("ch-1")).toBeUndefined();
    });

    it("注销不存在的频道应该不报错", () => {
      expect(() => manager.unregister("nonexistent")).not.toThrow();
    });

    it("1000 次 register/unregister 压力测试应保持稳定", () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const channel = createMockChannel(`ch-${i}`);
        manager.register(channel);
        // 立即注销，模拟高频注册/注销
        if (i % 2 === 0) {
          manager.unregister(`ch-${i}`);
        }
      }
      const duration = performance.now() - start;

      // 验证剩余频道数量：奇数 i 的频道应保留
      const remaining = manager.list();
      const oddCount = Array.from({ length: 1000 }, (_, i) => i).filter(
        (i) => i % 2 !== 0,
      ).length;
      expect(remaining).toHaveLength(oddCount);
      // 性能阈值：1000 次循环应在 2s 内完成
      expect(duration).toBeLessThan(2000);
    });

    it("注销不存在的 channel 应静默处理多次调用", () => {
      expect(() => manager.unregister("nonexistent-1")).not.toThrow();
      expect(() => manager.unregister("nonexistent-1")).not.toThrow();
      expect(() => manager.unregister("nonexistent-1")).not.toThrow();
      // 注销空字符串、特殊字符
      expect(() => manager.unregister("")).not.toThrow();
      expect(() => manager.unregister("/path/with/slashes")).not.toThrow();
      expect(() => manager.unregister("中文频道")).not.toThrow();
      // 状态应保持空
      expect(manager.list()).toEqual([]);
    });
  });

  describe("get / list", () => {
    it("获取不存在的频道应该返回 undefined", () => {
      expect(manager.get("nonexistent")).toBeUndefined();
    });

    it("list 应该返回所有已注册频道", () => {
      const ch1 = createMockChannel("ch-1");
      const ch2 = createMockChannel("ch-2");
      manager.register(ch1);
      manager.register(ch2);

      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list).toContain(ch1);
      expect(list).toContain(ch2);
    });

    it("list 在无频道时应该返回空数组", () => {
      expect(manager.list()).toEqual([]);
    });
  });

  describe("broadcast", () => {
    it("应该向所有频道广播消息", async () => {
      const send1 = vi.fn().mockResolvedValue(undefined);
      const send2 = vi.fn().mockResolvedValue(undefined);
      manager.register(createMockChannel("ch-1", send1));
      manager.register(createMockChannel("ch-2", send2));

      const message: ChannelMessage = {
        id: "msg-1",
        channelId: "broadcast",
        content: "Hello all",
      };

      await manager.broadcast(message);
      expect(send1).toHaveBeenCalledWith(message);
      expect(send2).toHaveBeenCalledWith(message);
    });

    it("单个频道失败不应影响其他频道", async () => {
      const send1 = vi.fn().mockRejectedValue(new Error("fail"));
      const send2 = vi.fn().mockResolvedValue(undefined);
      manager.register(createMockChannel("ch-1", send1));
      manager.register(createMockChannel("ch-2", send2));

      const message: ChannelMessage = {
        id: "msg-1",
        channelId: "broadcast",
        content: "Hello all",
      };

      // broadcast 不会抛出，但会记录日志
      await expect(manager.broadcast(message)).resolves.toBeUndefined();
      expect(send1).toHaveBeenCalledWith(message);
      expect(send2).toHaveBeenCalledWith(message);
    });

    it("无频道时广播应该正常完成", async () => {
      const message: ChannelMessage = {
        id: "msg-1",
        channelId: "broadcast",
        content: "Hello all",
      };
      await expect(manager.broadcast(message)).resolves.toBeUndefined();
    });

    it("10 个并发 broadcast 应全部成功且每个频道每次都收到消息", async () => {
      const sendFns: Array<ReturnType<typeof vi.fn>> = [];
      for (let i = 0; i < 5; i++) {
        const fn = vi.fn().mockResolvedValue(undefined);
        sendFns.push(fn);
        manager.register(createMockChannel(`ch-${i}`, fn));
      }

      // 并发触发 10 次广播
      const broadcasts: Array<Promise<void>> = [];
      for (let i = 0; i < 10; i++) {
        const message: ChannelMessage = {
          id: `msg-${i}`,
          channelId: "broadcast",
          content: `concurrent broadcast ${i}`,
        };
        broadcasts.push(manager.broadcast(message));
      }

      // 等待所有广播完成
      await Promise.all(broadcasts);

      // 每个频道应被调用 10 次（10 次广播）
      for (const fn of sendFns) {
        expect(fn).toHaveBeenCalledTimes(10);
      }
    });

    it("并发广播中部分频道失败不应阻塞其他频道完成", async () => {
      const sendOk = vi.fn().mockResolvedValue(undefined);
      const sendFail = vi.fn().mockRejectedValue(new Error("send failed"));
      manager.register(createMockChannel("ok", sendOk));
      manager.register(createMockChannel("fail", sendFail));

      // 并发执行 20 次广播
      const broadcasts: Array<Promise<void>> = [];
      for (let i = 0; i < 20; i++) {
        broadcasts.push(
          manager.broadcast({
            id: `msg-${i}`,
            channelId: "broadcast",
            content: `msg ${i}`,
          }),
        );
      }

      // 所有 broadcast 都应 resolve（不会抛错）
      await expect(Promise.all(broadcasts)).resolves.toBeDefined();

      // 两个频道都应被调用 20 次
      expect(sendOk).toHaveBeenCalledTimes(20);
      expect(sendFail).toHaveBeenCalledTimes(20);
    });
  });

  describe("startAll / stopAll", () => {
    it("应该启动所有频道", async () => {
      const ch1 = createMockChannel("ch-1");
      const ch2 = createMockChannel("ch-2");
      manager.register(ch1);
      manager.register(ch2);

      await manager.startAll();
      expect(ch1.start).toHaveBeenCalled();
      expect(ch2.start).toHaveBeenCalled();
      expect(ch1.status).toBe("ready");
      expect(ch2.status).toBe("ready");
    });

    it("应该停止所有频道", async () => {
      const ch1 = createMockChannel("ch-1");
      const ch2 = createMockChannel("ch-2");
      manager.register(ch1);
      manager.register(ch2);

      await manager.stopAll();
      expect(ch1.stop).toHaveBeenCalled();
      expect(ch2.stop).toHaveBeenCalled();
      expect(ch1.status).toBe("closed");
      expect(ch2.status).toBe("closed");
    });

    it("启动失败应该将状态设为 error", async () => {
      const ch1 = createMockChannel("ch-1");
      ch1.start = vi.fn().mockRejectedValue(new Error("start failed"));
      manager.register(ch1);

      await manager.startAll();
      expect(ch1.status).toBe("error");
    });

    it("没有 start/stop 方法的频道应该被跳过", async () => {
      const ch1 = createMockChannel("ch-1");
      delete (ch1 as any).start;
      delete (ch1 as any).stop;
      manager.register(ch1);

      await manager.startAll();
      await manager.stopAll();
      // 不应抛出
      expect(ch1.status).toBe("ready");
    });
  });
});
