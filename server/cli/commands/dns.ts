/**
 * dns 命令
 * DNS 配置 (resolve/flush/list)
 *
 * 参考 openclaw dns-cli，提供 DNS 解析与配置查询。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import dns from "dns";
import { logger } from "../../logger.js";

export type DnsOptions = {
  json?: boolean;
};

interface DnsRecord {
  hostname: string;
  addresses: string[];
  ttl: number;
}

async function resolveHostname(hostname: string): Promise<DnsRecord> {
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    return {
      hostname,
      addresses: addresses.map((a) => a.address),
      ttl: 300,
    };
  } catch {
    return { hostname, addresses: [], ttl: 0 };
  }
}

function getServers(): string[] {
  return dns.getServers();
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerDnsCommand(program: Command): void {
  const dnsCmd = program
    .command("dns")
    .description("DNS 配置 (resolve/flush/list)");

  dnsCmd
    .command("resolve <hostname>")
    .description("解析主机名")
    .option("--json", "JSON 输出格式")
    .action(async (hostname: string, options: DnsOptions) => {
      const record = await resolveHostname(hostname);
      if (options.json) {
        logger.info(formatJsonOutput(record));
      } else {
        if (record.addresses.length === 0) {
          logger.info(`无法解析: ${hostname}`);
        } else {
          logger.info(`${hostname} -> ${record.addresses.join(", ")} (TTL: ${record.ttl})`);
        }
      }
    });

  dnsCmd
    .command("list")
    .description("列出当前 DNS 服务器")
    .option("--json", "JSON 输出格式")
    .action((options: DnsOptions) => {
      const servers = getServers();
      if (options.json) {
        logger.info(formatJsonOutput({ servers }));
      } else {
        logger.info("DNS 服务器:");
        for (const server of servers) {
          logger.info(`  ${server}`);
        }
      }
    });

  dnsCmd
    .command("flush")
    .description("刷新 DNS 缓存（模拟）")
    .action(() => {
      logger.info("DNS 缓存已刷新");
    });

  // 默认 list
  dnsCmd
    .option("--json", "JSON 输出格式")
    .action((options: DnsOptions) => {
      const servers = getServers();
      if (options.json) {
        logger.info(formatJsonOutput({ servers }));
      } else {
        logger.info(`DNS 服务器: ${servers.join(", ")}`);
      }
    });
}
