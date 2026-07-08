import type { Command } from 'commander';
import http from 'http';
import { logger } from '../../logger.js';
import { detectProvider, normalizeModelId } from '../../gateway/gateway.js';

export type GatewayOptions = {
  json?: boolean;
  port?: string;
};

interface GatewayStatus {
  state: 'running' | 'stopped';
  url: string;
  port: number;
  protocol: string;
  version: string;
}

interface GatewayProbe {
  reachable: boolean;
  latencyMs: number;
  statusCode?: number;
  message?: string;
}

interface ModelInfo {
  id: string;
  normalizedId: string;
  provider: string;
}

const DEFAULT_PORT = 7331;

function resolvePort(port?: string): number {
  if (port && /^\d+$/.test(port)) {
    return parseInt(port, 10);
  }
  return DEFAULT_PORT;
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function getGatewayStatus(port: number): Promise<GatewayStatus> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          resolve({
            state: 'running',
            url: `http://localhost:${port}`,
            port,
            protocol: 'http/v1',
            version: info.version || '1.0.0',
          });
        } catch {
          resolve({
            state: 'running',
            url: `http://localhost:${port}`,
            port,
            protocol: 'http/v1',
            version: '1.0.0',
          });
        }
      });
    });
    req.on('error', () => {
      resolve({
        state: 'stopped',
        url: `http://localhost:${port}`,
        port,
        protocol: 'http/v1',
        version: '1.0.0',
      });
    });
    req.setTimeout(2000);
  });
}

async function probeGateway(port: number): Promise<GatewayProbe> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      const latency = Date.now() - start;
      resolve({
        reachable: true,
        latencyMs: latency,
        statusCode: res.statusCode,
        message: res.statusCode === 200 ? 'OK' : `HTTP ${res.statusCode}`,
      });
    });
    req.on('error', () => {
      const latency = Date.now() - start;
      resolve({
        reachable: false,
        latencyMs: latency,
        message: 'Connection refused',
      });
    });
    req.setTimeout(3000);
  });
}

async function getModels(port: number): Promise<Array<{ id: string; owned_by: string }> | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/v1/models`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result.data || []);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => {
      resolve(null);
    });
    req.setTimeout(3000);
  });
}

function resolveModel(modelId: string): ModelInfo {
  return {
    id: modelId,
    normalizedId: normalizeModelId(modelId),
    provider: detectProvider(modelId),
  };
}

function formatStatusOutput(status: GatewayStatus): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  网关状态:');
  lines.push(`    状态:   ${status.state}`);
  lines.push(`    URL:    ${status.url}`);
  lines.push(`    端口:   ${status.port}`);
  lines.push(`    协议:   ${status.protocol}`);
  lines.push(`    版本:   ${status.version}`);
  lines.push('');
  return lines.join('\n');
}

function formatProbeOutput(probe: GatewayProbe): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  网关探活:');
  lines.push(`    可达:     ${probe.reachable ? '✓ 是' : '✗ 否'}`);
  lines.push(`    延迟:     ${probe.latencyMs}ms`);
  if (probe.statusCode) {
    lines.push(`    状态码:   ${probe.statusCode}`);
  }
  if (probe.message) {
    lines.push(`    消息:     ${probe.message}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatModelResolveOutput(model: ModelInfo): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  模型解析:');
  lines.push(`    原始 ID:      ${model.id}`);
  lines.push(`    归一化 ID:    ${model.normalizedId}`);
  lines.push(`    提供商:       ${model.provider}`);
  lines.push('');
  return lines.join('\n');
}

export function registerGatewayCommand(program: Command): void {
  const gatewayCmd = program
    .command('gateway')
    .description('网关管理 (status/probe/models/resolve)');

  gatewayCmd
    .command('status')
    .description('查看网关状态')
    .option('--port <port>', '网关端口', String(DEFAULT_PORT))
    .option('--json', 'JSON 输出格式')
    .action(async (options: GatewayOptions) => {
      const port = resolvePort(options.port);
      const status = await getGatewayStatus(port);
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(formatStatusOutput(status));
      }
    });

  gatewayCmd
    .command('probe')
    .description('探活网关')
    .option('--port <port>', '网关端口', String(DEFAULT_PORT))
    .option('--json', 'JSON 输出格式')
    .action(async (options: GatewayOptions) => {
      const port = resolvePort(options.port);
      const probe = await probeGateway(port);
      if (options.json) {
        logger.info(formatJsonOutput(probe));
      } else {
        logger.info(formatProbeOutput(probe));
      }
    });

  gatewayCmd
    .command('models')
    .description('获取网关模型列表')
    .option('--port <port>', '网关端口', String(DEFAULT_PORT))
    .option('--json', 'JSON 输出格式')
    .action(async (options: GatewayOptions) => {
      const port = resolvePort(options.port);
      const models = await getModels(port);
      if (options.json) {
        logger.info(formatJsonOutput(models || { error: 'Gateway not reachable' }));
      } else {
        if (!models) {
          logger.info('网关不可达，无法获取模型列表');
        } else {
          logger.info(`\n  网关模型列表 (共 ${models.length} 个):\n`);
          for (const model of models) {
            logger.info(`    ${model.id.padEnd(24)} ${model.owned_by}`);
          }
          logger.info('');
        }
      }
    });

  gatewayCmd
    .command('resolve <model>')
    .description('解析模型 ID（归一化 + 提供商检测）')
    .option('--json', 'JSON 输出格式')
    .action((model: string, options: GatewayOptions) => {
      const result = resolveModel(model);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(formatModelResolveOutput(result));
      }
    });

  gatewayCmd
    .command('info')
    .description('查看网关详细信息')
    .option('--port <port>', '网关端口', String(DEFAULT_PORT))
    .option('--json', 'JSON 输出格式')
    .action(async (options: GatewayOptions) => {
      const port = resolvePort(options.port);
      const [status, probe] = await Promise.all([
        getGatewayStatus(port),
        probeGateway(port),
      ]);
      const info = {
        ...status,
        latency: probe.latencyMs,
        reachable: probe.reachable,
      };
      if (options.json) {
        logger.info(formatJsonOutput(info));
      } else {
        logger.info('');
        logger.info('  网关信息:');
        logger.info(`    状态:         ${status.state}`);
        logger.info(`    URL:          ${status.url}`);
        logger.info(`    端口:         ${status.port}`);
        logger.info(`    协议:         ${status.protocol}`);
        logger.info(`    版本:         ${status.version}`);
        logger.info(`    可达:         ${probe.reachable ? '是' : '否'}`);
        logger.info(`    延迟:         ${probe.latencyMs}ms`);
        logger.info('');
      }
    });

  gatewayCmd.action(async (options: GatewayOptions) => {
    const port = resolvePort(options.port);
    const status = await getGatewayStatus(port);
    if (options.json) {
      logger.info(formatJsonOutput(status));
    } else {
      logger.info(formatStatusOutput(status));
    }
  });
}
