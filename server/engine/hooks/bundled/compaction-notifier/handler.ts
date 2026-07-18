// Compaction notifier hook：会话压缩时发送通知
import type { HookHandler } from "../../types.js";

/** 从 hook context 中读取可选的数值型压缩元数据（不信任 context 形状） */
function readOptionalNumber(context: Record<string, unknown>, key: string): number | undefined {
  const value = context[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

/** 会话压缩 hook：发出简短的用户可见进度消息。错误被吞掉以保证主流程不被通知失败中断。 */
const handler: HookHandler = async (event) => {
  try {
    const context = event.context;

    if (event.type === "session" && event.action === "compact:before") {
      const messageCount = readOptionalNumber(context, "messageCount");
      const messageSuffix =
        messageCount !== undefined && messageCount >= 0 ? ` (${messageCount} 条消息)` : "";
      event.messages.push(
        `🧹 正在压缩上下文${messageSuffix}，以便在不丢失历史的情况下继续……`,
      );
      return;
    }

    if (event.type === "session" && event.action === "compact:after") {
      const tokensBefore = readOptionalNumber(context, "tokensBefore");
      const tokensAfter = readOptionalNumber(context, "tokensAfter");
      const tokenDelta =
        tokensBefore !== undefined && tokensAfter !== undefined
          ? `（${tokensBefore.toLocaleString()} → ${tokensAfter.toLocaleString()} tokens）`
          : "";
      event.messages.push(`✅ 上下文已压缩${tokenDelta}。从上次中断处继续。`);
    }
  } catch {
    // 通知失败不应影响主流程；静默吞掉以避免阻塞压缩链
  }
};

export default handler;
