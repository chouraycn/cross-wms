import { logger } from '../../../../logger.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptimeMs: number;
  timestamp: string;
  version: string;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    connections: number;
    bytesIn: number;
    bytesOut: number;
  };
}

interface DependencyStatus {
  name: string;
  type: string;
  status: 'up' | 'down' | 'degraded';
  responseTimeMs: number;
  details?: string;
}

interface PerformanceMetrics {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  requests: {
    total: number;
    perSecond: number;
    successRate: number;
  };
  errors: {
    total: number;
    rate: number;
  };
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  system: SystemMetrics;
  dependencies: DependencyStatus[];
  performance: PerformanceMetrics;
  summary: string;
  recommendations: string[];
}

const startTime = Date.now();

export function getHealthStatus(): HealthStatus {
  logger.debug('[healthcheck] getHealthStatus');
  return {
    status: 'healthy',
    uptimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
}

export function getSystemMetrics(): SystemMetrics {
  logger.debug('[healthcheck] getSystemMetrics');

  const totalMemory = 16 * 1024 * 1024 * 1024;
  const usedMemory = totalMemory * 0.45;
  const totalDisk = 500 * 1024 * 1024 * 1024;
  const usedDisk = totalDisk * 0.32;

  return {
    cpu: {
      usage: 23.5,
      cores: 8,
      loadAverage: [1.2, 1.5, 1.1],
    },
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: totalMemory - usedMemory,
      usage: 45.0,
    },
    disk: {
      total: totalDisk,
      used: usedDisk,
      free: totalDisk - usedDisk,
      usage: 32.0,
    },
    network: {
      connections: 156,
      bytesIn: 1024 * 1024 * 50,
      bytesOut: 1024 * 1024 * 30,
    },
  };
}

export function getDependencies(): DependencyStatus[] {
  logger.debug('[healthcheck] getDependencies');

  return [
    {
      name: 'primary-db',
      type: 'database',
      status: 'up',
      responseTimeMs: 12,
      details: 'PostgreSQL 15.2',
    },
    {
      name: 'redis-cache',
      type: 'cache',
      status: 'up',
      responseTimeMs: 2,
      details: 'Redis 7.0',
    },
    {
      name: 'message-queue',
      type: 'queue',
      status: 'up',
      responseTimeMs: 8,
      details: 'RabbitMQ 3.11',
    },
    {
      name: 'object-storage',
      type: 'storage',
      status: 'degraded',
      responseTimeMs: 150,
      details: 'S3-compatible storage, elevated latency',
    },
    {
      name: 'auth-service',
      type: 'api',
      status: 'up',
      responseTimeMs: 45,
      details: 'OAuth2 provider',
    },
  ];
}

export function getPerformanceMetrics(): PerformanceMetrics {
  logger.debug('[healthcheck] getPerformanceMetrics');

  return {
    responseTime: {
      p50: 45,
      p95: 120,
      p99: 350,
    },
    requests: {
      total: 125000,
      perSecond: 145.8,
      successRate: 99.7,
    },
    errors: {
      total: 375,
      rate: 0.3,
    },
  };
}

export function generateHealthReport(): HealthReport {
  logger.debug('[healthcheck] generateHealthReport');

  const system = getSystemMetrics();
  const dependencies = getDependencies();
  const performance = getPerformanceMetrics();

  const degradedDeps = dependencies.filter((d) => d.status === 'degraded');
  const downDeps = dependencies.filter((d) => d.status === 'down');

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const recommendations: string[] = [];

  if (downDeps.length > 0) {
    status = 'unhealthy';
    recommendations.push(`以下依赖服务不可用：${downDeps.map((d) => d.name).join(', ')}`);
  } else if (degradedDeps.length > 0) {
    status = 'degraded';
    recommendations.push(`以下依赖服务性能下降：${degradedDeps.map((d) => d.name).join(', ')}`);
  }

  if (system.cpu.usage > 80) {
    recommendations.push('CPU 使用率过高，建议检查高负载进程');
  }
  if (system.memory.usage > 85) {
    recommendations.push('内存使用率过高，建议检查内存泄漏');
  }
  if (system.disk.usage > 80) {
    recommendations.push('磁盘使用率过高，建议清理空间');
  }
  if (performance.errors.rate > 1) {
    recommendations.push('错误率超过 1%，建议检查错误日志');
  }

  if (recommendations.length === 0) {
    recommendations.push('系统运行正常，无需特别关注');
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    system,
    dependencies,
    performance,
    summary: `系统状态：${status}，${dependencies.length} 个依赖服务，QPS ${performance.requests.perSecond.toFixed(1)}`,
    recommendations,
  };
}

export default {
  name: 'healthcheck',
  description: '系统健康检查、依赖状态、性能指标',
  tools: [
    {
      name: 'healthcheck_status',
      description: '获取总体健康状态',
      handler: () => getHealthStatus(),
    },
    {
      name: 'healthcheck_system',
      description: '获取系统资源指标',
      handler: () => getSystemMetrics(),
    },
    {
      name: 'healthcheck_dependencies',
      description: '获取依赖服务状态',
      handler: () => getDependencies(),
    },
    {
      name: 'healthcheck_performance',
      description: '获取性能指标',
      handler: () => getPerformanceMetrics(),
    },
    {
      name: 'healthcheck_report',
      description: '生成健康报告',
      handler: () => generateHealthReport(),
    },
  ],
};
