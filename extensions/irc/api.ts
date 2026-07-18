/**
 * IRC 渠道 API 封装
 *
 * 基于 IRC 协议（RFC 1459 / RFC 2812）实现基础的 IRC 连接、
 * 频道加入与消息收发逻辑。参考 openclaw/extensions/irc 的核心 API 层。
 *
 * 仅移植核心 API 层，不依赖 openclaw 内部框架。
 */

import type { Socket } from "node:net";

/**
 * IRC 渠道配置
 */
export interface IrcChannelConfig {
  /** IRC 服务器主机名 */
  host: string;
  /** IRC 服务器端口（默认 6667，TLS 时通常为 6697） */
  port?: number;
  /** 是否使用 TLS 加密连接 */
  tls?: boolean;
  /** 昵称 */
  nick: string;
  /** 用户名（默认与昵称相同） */
  user?: string;
  /** 真实名称 */
  realName?: string;
  /** 身份认证密码（Nickserv 或服务器 PASS） */
  password?: string;
  /** 默认加入的频道列表（如 ["#general"]） */
  channels?: string[];
  /** 连接超时（毫秒，默认 15000） */
  connectTimeout?: number;
}

/** IRC 收到的消息事件 */
export interface IrcMessageEvent {
  /** 消息来源前缀（如 nick!user@host） */
  prefix?: string;
  /** IRC 命令（如 PRIVMSG / JOIN / PART / NOTICE） */
  command: string;
  /** 命令参数 */
  params: string[];
  /** 消息目标（频道或昵称） */
  target?: string;
  /** 消息文本内容 */
  text?: string;
  /** 发送者昵称（从 prefix 解析） */
  from?: string;
}

/** IRC 频道句柄，提供基础的消息收发能力 */
export interface IrcChannel {
  /** 建立到 IRC 服务器的连接 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(message?: string): Promise<void>;
  /** 加入指定频道 */
  join(channel: string): void;
  /** 离开指定频道 */
  part(channel: string, reason?: string): void;
  /** 发送 PRIVMSG 私信或频道消息 */
  send(target: string, text: string): void;
  /** 注册消息回调 */
  onMessage(handler: (event: IrcMessageEvent) => void): () => void;
  /** 当前连接是否已建立 */
  isConnected(): boolean;
}

/** 解析 IRC 协议行（去除尾部 \r\n） */
function parseIrcLine(line: string): IrcMessageEvent {
  let rest = line;
  let prefix: string | undefined;
  if (rest.startsWith(":")) {
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      return { prefix: rest.slice(1), command: "", params: [] };
    }
    prefix = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }

  const spaceIdx = rest.indexOf(" ");
  let command: string;
  if (spaceIdx === -1) {
    command = rest;
    rest = "";
  } else {
    command = rest.slice(0, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }

  const params: string[] = [];
  while (rest.length > 0) {
    if (rest.startsWith(":")) {
      params.push(rest.slice(1));
      break;
    }
    const idx = rest.indexOf(" ");
    if (idx === -1) {
      params.push(rest);
      break;
    }
    params.push(rest.slice(0, idx));
    rest = rest.slice(idx + 1);
  }

  const from = prefix ? prefix.split("!")[0] : undefined;
  const target = params.length > 0 ? params[0] : undefined;
  const text = params.length > 1 ? params[params.length - 1] : undefined;

  return { prefix, command, params, target, text, from };
}

/**
 * 创建 IRC 渠道实例
 *
 * 使用 Node.js 的 net/tls 模块建立底层 TCP 连接，按 IRC 协议
 * 完成 NICK/USER 注册、JOIN 频道以及 PRIVMSG 消息收发。
 */
export function createIrcChannel(config: IrcChannelConfig): IrcChannel {
  const port = config.port ?? (config.tls ? 6697 : 6667);
  const user = config.user || config.nick;
  const realName = config.realName || config.nick;
  const connectTimeout = config.connectTimeout ?? 15000;

  let socket: Socket | undefined;
  let connected = false;
  const messageHandlers = new Set<(event: IrcMessageEvent) => void>();

  const emit = (event: IrcMessageEvent): void => {
    for (const handler of messageHandlers) {
      try {
        handler(event);
      } catch {
        // 回调异常不影响后续处理
      }
    }
  };

  const writeLine = (line: string): void => {
    if (!socket || !connected) return;
    socket.write(line + "\r\n");
  };

  const handleLine = (line: string): void => {
    if (!line) return;
    const event = parseIrcLine(line);

    // PING/PONG 心跳保活
    if (event.command === "PING" && event.params.length > 0) {
      writeLine(`PONG :${event.params[event.params.length - 1]}`);
      return;
    }

    emit(event);
  };

  const connect = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        socket?.removeAllListeners();
      };

      timer = setTimeout(() => {
        cleanup();
        socket?.destroy();
        reject(new Error(`IRC 连接超时 (${config.host}:${port})`));
      }, connectTimeout);

      const onConnect = (): void => {
        if (timer) clearTimeout(timer);
        connected = true;

        // 服务器密码
        if (config.password) {
          writeLine(`PASS ${config.password}`);
        }
        writeLine(`NICK ${config.nick}`);
        writeLine(`USER ${user} 0 * :${realName}`);

        // 注册成功后加入默认频道（收到 001 欢迎指令表示注册完成）
        const onWelcome = (ev: IrcMessageEvent): void => {
          if (ev.command === "001") {
            for (const ch of config.channels ?? []) {
              writeLine(`JOIN ${ch}`);
            }
            resolve();
          }
        };
        messageHandlers.add(onWelcome);
        // 在 resolve 后移除临时监听器，避免内存泄漏
        setTimeout(() => messageHandlers.delete(onWelcome), 0);
      };

      const onError = (err: Error): void => {
        cleanup();
        connected = false;
        reject(new Error(`IRC 连接错误: ${err.message}`));
      };

      if (config.tls) {
        // 动态加载 tls 模块，避免在不使用 TLS 时引入额外开销
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const tls = require("node:tls") as typeof import("node:tls");
        socket = tls.connect({ host: config.host, port }, onConnect) as unknown as Socket;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const net = require("node:net") as typeof import("node:net");
        socket = net.connect({ host: config.host, port }, onConnect);
      }

      socket.on("error", onError);
      socket.on("close", () => {
        connected = false;
      });

      let buffer = "";
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);
          handleLine(line);
        }
      });
    });
  };

  const disconnect = (message?: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve();
        return;
      }
      if (connected) {
        writeLine(`QUIT :${message ?? "bye"}`);
      }
      socket.once("close", () => {
        connected = false;
        resolve();
      });
      socket.end();
    });
  };

  const join = (channel: string): void => {
    writeLine(`JOIN ${channel}`);
  };

  const part = (channel: string, reason?: string): void => {
    writeLine(reason ? `PART ${channel} :${reason}` : `PART ${channel}`);
  };

  const send = (target: string, text: string): void => {
    // 按行拆分发送，避免消息中嵌入换行导致协议错误
    for (const line of text.split("\n")) {
      if (line.length > 0) {
        writeLine(`PRIVMSG ${target} :${line}`);
      }
    }
  };

  const onMessage = (handler: (event: IrcMessageEvent) => void): (() => void) => {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
  };

  const isConnected = (): boolean => connected;

  return {
    connect,
    disconnect,
    join,
    part,
    send,
    onMessage,
    isConnected,
  };
}
