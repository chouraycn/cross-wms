/**
 * ACP Client Helpers
 * ACP 客户端辅助函数 - 封装 AcpClient 提供轻量级的创建、连接、收发 API
 *
 * 参考 openclaw/src/acp/client-helpers.ts 设计
 * 与 cross-wms server/engine/acp/client.ts 集成，复用底层 AcpClient 类
 */

import type { AcpClientOptions, AcpClientHandle } from "./client.js";
import { AcpClient } from "./client.js";

// 重新导出类型，便于外部统一引用
export type { AcpClientOptions, AcpClientHandle };

/** 默认接收消息超时时间（毫秒） */
const DEFAULT_RECEIVE_TIMEOUT_MS = 30_000;

/** 接收消息轮询间隔（毫秒） */
const RECEIVE_POLL_INTERVAL_MS = 50;

/** 客户端注册表条目 */
interface ClientRegistryEntry {
  client: AcpClient;
  /** 是否已完成 initialize + createSession */
  initialized: boolean;
  /** 待接收的响应队列 */
  responseQueue: string[];
}

/** 活跃客户端注册表：handle.sessionId -> 条目 */
const clientRegistry = new Map<string, ClientRegistryEntry>();

/** 生成辅助注册表用的唯一 id */
function generateHelperSessionId(): string {
  return `acp_helper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 创建 ACP 客户端（同步，不建立连接）
 *
 * 返回的句柄可传入 sendAcpMessage / receiveAcpMessage / disconnectAcpClient。
 * 首次调用 sendAcpMessage 时会延迟执行 initialize + createSession。
 *
 * @param options 客户端选项
 * @returns 客户端句柄
 */
export function createAcpClient(options: AcpClientOptions = {}): AcpClientHandle {
  const client = new AcpClient(options);
  const sessionId = generateHelperSessionId();
  clientRegistry.set(sessionId, {
    client,
    initialized: false,
    responseQueue: [],
  });
  return { sessionId };
}

/**
 * 异步连接 ACP 客户端 - 创建实例并完成 initialize + createSession
 *
 * @param options 客户端选项
 * @returns 已连接的客户端句柄（sessionId 来自底层 AcpClient.createSession）
 */
export async function connectAcpClient(options: AcpClientOptions = {}): Promise<AcpClientHandle> {
  const client = new AcpClient(options);
  await client.initialize();
  const sessionId = await client.createSession();
  clientRegistry.set(sessionId, {
    client,
    initialized: true,
    responseQueue: [],
  });
  return { sessionId };
}

/**
 * 断开 ACP 客户端连接 - 关闭会话并清理注册表条目
 *
 * 对未连接的客户端调用也是安全的。
 *
 * @param handle 客户端句柄
 */
export async function disconnectAcpClient(handle: AcpClientHandle): Promise<void> {
  const entry = clientRegistry.get(handle.sessionId);
  if (!entry) {
    return;
  }
  try {
    await entry.client.close();
  } finally {
    clientRegistry.delete(handle.sessionId);
  }
}

/**
 * 发送消息到 ACP 会话
 *
 * 若客户端尚未建立会话，会先延迟执行 initialize + createSession。
 * 响应会被加入待接收队列，通过 receiveAcpMessage 取回。
 *
 * @param handle 客户端句柄
 * @param message 消息文本
 */
export async function sendAcpMessage(handle: AcpClientHandle, message: string): Promise<void> {
  const entry = clientRegistry.get(handle.sessionId);
  if (!entry) {
    throw new Error(`ACP client not found for sessionId: ${handle.sessionId}`);
  }

  // 延迟建立会话
  if (!entry.initialized) {
    await entry.client.initialize();
    await entry.client.createSession();
    entry.initialized = true;
  }

  const response = await entry.client.prompt(message);
  entry.responseQueue.push(response);
}

/**
 * 接收下一条 ACP 消息 - 轮询等待，可设置超时
 *
 * @param handle 客户端句柄
 * @param timeout 超时时间（毫秒），默认 30 秒
 * @returns 接收到的消息文本
 */
export async function receiveAcpMessage(
  handle: AcpClientHandle,
  timeout: number = DEFAULT_RECEIVE_TIMEOUT_MS,
): Promise<string> {
  const entry = clientRegistry.get(handle.sessionId);
  if (!entry) {
    throw new Error(`ACP client not found for sessionId: ${handle.sessionId}`);
  }

  // 队列中已有消息，立即返回
  if (entry.responseQueue.length > 0) {
    return entry.responseQueue.shift()!;
  }

  // 轮询等待消息到达
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, RECEIVE_POLL_INTERVAL_MS));
    if (entry.responseQueue.length > 0) {
      return entry.responseQueue.shift()!;
    }
  }
  throw new Error(
    `ACP receive timeout after ${timeout}ms for sessionId: ${handle.sessionId}`,
  );
}
