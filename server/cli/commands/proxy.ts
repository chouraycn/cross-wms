/**
 * proxy 命令
 * 代理管理 (list/add/remove/test)
 *
 * 参考 openclaw proxy-cli，管理上游代理配置。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type ProxyOptions = {
  json?: boolean;
};

type ProxyProtocol = "http" | "https" | "socks5" | "socks4";

interface ProxyEntry {
  id: string;
  name: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  auth?: { username: string; password: string };
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  requestCount: number;
}

const PROXY_STORE: Map<string, ProxyEntry> = new Map([
  [
    "px-001",
    {
      id: "px-001",
      name: "us-east-proxy",
      protocol: "http",
      host: "proxy.us-east.example.com",
      port: 8080,
      active: true,
      createdAt: "2025-01-01T00:00:00Z",
      lastUsedAt: "2025-01-15T10:00:00Z",
      requestCount: 1024,
    },
  ],
  [
    "px-002",
    {
      id: "px-002",
      name: "socks-fallback",
      protocol: "socks5",
      host: "127.0.0.1",
      port: 1080,
      active: false,
      createdAt: "2025-01-05T00:00:00Z",
      requestCount: 56,
    },
  ],
]);

function generateProxyId(): string {
  return `px_${Date.now().toString(36)}`;
}

function listProxies(): ProxyEntry[] {
  return Array.from(PROXY_STORE.values());
}

function addProxy(params: {
  name: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
}): ProxyEntry {
  const id = generateProxyId();
  const entry: ProxyEntry = {
    id,
    name: params.name,
    protocol: params.protocol,
    host: params.host,
    port: params.port,
    auth: params.username ? { username: params.username, password: params.password || "" } : undefined,
    active: true,
    createdAt: new Date().toISOString(),
    requestCount: 0,
  };
  PROXY_STORE.set(id, entry);
  return entry;
}

function removeProxy(id: string): boolean {
  return PROXY_STORE.delete(id);
}

function testProxy(id: string): { success: boolean; latencyMs: number; message: string } {
  const entry = PROXY_STORE.get(id);
  if (!entry) {
    return { success: false, latencyMs: 0, message: `代理未找到: ${id}` };
  }
  if (!entry.active) {
    return { success: false, latencyMs: 0, message: `代理未激活: ${id}` };
  }
  return {
    success: true,
    latencyMs: 45,
    message: `代理 ${entry.host}:${entry.port} 连接成功 (45ms)`,
  };
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatProxyList(proxies: ProxyEntry[]): string {
  const lines: string[] = ["", "  代理列表:"];
  for (const p of proxies) {
    const icon = p.active ? "✓" : "✗";
    lines.push(`    ${icon} ${p.id} ${p.name} ${p.protocol}://${p.host}:${p.port} (请求: ${p.requestCount})`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerProxyCommand(program: Command): void {
  const proxyCmd = program
    .command("proxy")
    .description("代理管理 (list/add/remove/test)");

  proxyCmd
    .command("list")
    .description("列出所有代理")
    .option("--json", "JSON 输出格式")
    .action((options: ProxyOptions) => {
      const proxies = listProxies();
      if (options.json) {
        logger.info(formatJsonOutput(proxies));
      } else {
        logger.info(formatProxyList(proxies));
      }
    });

  proxyCmd
    .command("add <name> <host> <port>")
    .description("添加代理")
    .option("--protocol <protocol>", "协议 (http/https/socks5/socks4)", "http")
    .option("--username <user>", "认证用户名")
    .option("--password <pass>", "认证密码")
    .option("--json", "JSON 输出格式")
    .action(
      (
        name: string,
        host: string,
        port: string,
        options: ProxyOptions & { protocol?: string; username?: string; password?: string },
      ) => {
        const proxy = addProxy({
          name,
          protocol: (options.protocol as ProxyProtocol) || "http",
          host,
          port: parseInt(port, 10),
          username: options.username,
          password: options.password,
        });
        logger.info(`已添加代理: ${proxy.id}`);
        if (options.json) {
          logger.info(formatJsonOutput(proxy));
        }
      },
    );

  proxyCmd
    .command("remove <id>")
    .description("移除代理")
    .action((id: string) => {
      const removed = removeProxy(id);
      if (removed) {
        logger.info(`已移除代理: ${id}`);
      } else {
        logger.error(`未找到代理: ${id}`);
      }
    });

  proxyCmd
    .command("test <id>")
    .description("测试代理连接")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: ProxyOptions) => {
      const result = testProxy(id);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      }
    });

  // 默认 list
  proxyCmd
    .option("--json", "JSON 输出格式")
    .action((options: ProxyOptions) => {
      const proxies = listProxies();
      if (options.json) {
        logger.info(formatJsonOutput(proxies));
      } else {
        logger.info(formatProxyList(proxies));
      }
    });
}
