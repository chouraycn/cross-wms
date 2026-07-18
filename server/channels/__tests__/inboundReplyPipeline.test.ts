import { describe, it, expect } from "vitest";
import {
  InboundReplyPipeline,
  InboundReplyPipelineError,
} from "../inboundReplyPipeline.js";
import type { ChannelMessage } from "../types.js";

function createMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: "msg-1",
    channelId: "ch-1",
    content: "Hello world",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("InboundReplyPipeline 模块单元测试", () => {
  describe("normalize 阶段", () => {
    it("应该修剪消息内容", async () => {
      const pipeline = new InboundReplyPipeline();
      const result = await pipeline.process(createMessage({ content: "  hello  " }));
      expect(result.content).toBe("hello");
    });

    it("应该补充缺失的 timestamp", async () => {
      const pipeline = new InboundReplyPipeline();
      const result = await pipeline.process(createMessage({ timestamp: undefined }));
      expect(result.timestamp).toBeDefined();
    });

    it("应该补充空的 mentions 数组", async () => {
      const pipeline = new InboundReplyPipeline();
      const result = await pipeline.process(createMessage());
      expect(result.mentions).toEqual([]);
    });
  });

  describe("filter 阶段 - mention gating", () => {
    it("requireMention=false 时应该放行所有消息", async () => {
      const pipeline = new InboundReplyPipeline({
        mentionGating: { requireMention: false },
      });
      const result = await pipeline.process(createMessage());
      expect(result.id).toBe("msg-1");
    });

    it("requireMention=true 且有 mention 时应该放行", async () => {
      const pipeline = new InboundReplyPipeline({
        mentionGating: { requireMention: true, allowedAgentIds: ["agent-1"] },
      });
      const result = await pipeline.process(
        createMessage({ mentions: ["agent-1"] }),
      );
      expect(result.id).toBe("msg-1");
    });

    it("requireMention=true 且无 mention 时应该丢弃", async () => {
      const pipeline = new InboundReplyPipeline({
        mentionGating: { requireMention: true },
      });
      await expect(pipeline.process(createMessage())).rejects.toThrow(
        InboundReplyPipelineError,
      );
    });

    it("allowNoMentionInGroup=true 时应该放行无 mention 消息", async () => {
      const pipeline = new InboundReplyPipeline({
        mentionGating: { requireMention: true, allowNoMentionInGroup: true },
      });
      const result = await pipeline.process(createMessage());
      expect(result.id).toBe("msg-1");
    });

    it("mention 不在 allowedAgentIds 中应该丢弃", async () => {
      const pipeline = new InboundReplyPipeline({
        mentionGating: { requireMention: true, allowedAgentIds: ["agent-1"] },
      });
      await expect(
        pipeline.process(createMessage({ mentions: ["agent-2"] })),
      ).rejects.toThrow(InboundReplyPipelineError);
    });
  });

  describe("route 阶段 - prefix routing", () => {
    it("应该根据前缀路由到对应 agent", async () => {
      const pipeline = new InboundReplyPipeline({
        prefixRouting: {
          prefixMap: { "!/": "agent-1", "?/": "agent-2" },
        },
      });
      const result = await pipeline.process(createMessage({ content: "!/help" }));
      expect(result.targetAgentId).toBe("agent-1");
    });

    it("应该优先匹配最长前缀", async () => {
      const pipeline = new InboundReplyPipeline({
        prefixRouting: {
          prefixMap: { "!": "agent-1", "!!": "agent-2" },
        },
      });
      const result = await pipeline.process(createMessage({ content: "!!alert" }));
      expect(result.targetAgentId).toBe("agent-2");
    });

    it("stripPrefix=true 应该移除前缀", async () => {
      const pipeline = new InboundReplyPipeline({
        prefixRouting: {
          prefixMap: { "!/": "agent-1" },
          stripPrefix: true,
        },
      });
      const result = await pipeline.process(createMessage({ content: "!/help" }));
      expect(result.content).toBe("help");
      expect(result.targetAgentId).toBe("agent-1");
    });

    it("无前缀时应该使用 defaultAgentId", async () => {
      const pipeline = new InboundReplyPipeline({
        prefixRouting: {
          prefixMap: { "!/": "agent-1" },
          defaultAgentId: "agent-default",
        },
      });
      const result = await pipeline.process(createMessage({ content: "hello" }));
      expect(result.targetAgentId).toBe("agent-default");
    });
  });

  describe("route 阶段 - thread binding", () => {
    it("应该从消息中提取 threadId", async () => {
      const pipeline = new InboundReplyPipeline({
        threadBinding: {
          enabled: true,
          extractThreadId: (msg) => msg.parentMessageId,
        },
      });
      const result = await pipeline.process(
        createMessage({ parentMessageId: "parent-1" }),
      );
      expect(result.threadId).toBe("parent-1");
    });

    it("应该使用默认 threadId", async () => {
      const pipeline = new InboundReplyPipeline({
        threadBinding: {
          enabled: true,
          defaultThreadId: "default-thread",
        },
      });
      const result = await pipeline.process(createMessage());
      expect(result.threadId).toBe("default-thread");
    });

    it("extractThreadId 优先级应该高于 defaultThreadId", async () => {
      const pipeline = new InboundReplyPipeline({
        threadBinding: {
          enabled: true,
          extractThreadId: () => "extracted-thread",
          defaultThreadId: "default-thread",
        },
      });
      const result = await pipeline.process(createMessage());
      expect(result.threadId).toBe("extracted-thread");
    });

    it("threadBinding 禁用时不应设置 threadId", async () => {
      const pipeline = new InboundReplyPipeline({
        threadBinding: { enabled: false },
      });
      const result = await pipeline.process(createMessage());
      expect(result.threadId).toBeUndefined();
    });
  });

  describe("enrich 阶段", () => {
    it("应该添加 processedAt 和 pipelineVersion", async () => {
      const pipeline = new InboundReplyPipeline();
      const result = await pipeline.process(createMessage());
      expect(result.metadata?.processedAt).toBeDefined();
      expect(result.metadata?.pipelineVersion).toBe("1.0");
    });
  });

  describe("自定义阶段", () => {
    it("应该支持自定义 normalize 阶段", async () => {
      const pipeline = new InboundReplyPipeline({
        customStages: {
          normalize: [
            (msg) => ({ ...msg, content: msg.content.toUpperCase() }),
          ],
        },
      });
      const result = await pipeline.process(createMessage({ content: "hello" }));
      expect(result.content).toBe("HELLO");
    });

    it("应该支持自定义 filter 阶段", async () => {
      const pipeline = new InboundReplyPipeline({
        customStages: {
          filter: [
            (msg) => (msg.content.includes("blocked") ? null : msg),
          ],
        },
      });
      await expect(
        pipeline.process(createMessage({ content: "blocked message" })),
      ).rejects.toThrow(InboundReplyPipelineError);
    });

    it("应该支持 addStage 动态添加阶段", async () => {
      const pipeline = new InboundReplyPipeline();
      pipeline.addStage("enrich", (msg) => ({
        ...msg,
        metadata: { ...msg.metadata, customFlag: true },
      }));
      const result = await pipeline.process(createMessage());
      expect(result.metadata?.customFlag).toBe(true);
    });
  });

  describe("错误处理", () => {
    it("丢弃的消息应该包含 stage 和 messageId", async () => {
      const pipeline = new InboundReplyPipeline({
        mentionGating: { requireMention: true },
      });
      try {
        await pipeline.process(createMessage());
        expect.fail("应该抛出错误");
      } catch (err) {
        expect(err).toBeInstanceOf(InboundReplyPipelineError);
        expect((err as InboundReplyPipelineError).stage).toBe("filter");
        expect((err as InboundReplyPipelineError).messageId).toBe("msg-1");
      }
    });
  });
});
