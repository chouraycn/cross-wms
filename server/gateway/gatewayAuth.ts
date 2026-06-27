/**
 * Gateway Auth — API 认证模块
 *
 * 支持：
 * - API Key 认证（Bearer Token）
 * - 自定义 API Key（在配置文件或环境变量中设置）
 * - 速率限制
 */

import type { Request } from 'express';
import { logger } from '../logger.js';

// ==================== 配置 ====================

interface AuthConfig {
  apiKeys: string[];
  rateLimitPerMinute: number;
  trustedProxies: string[];
}

const DEFAULT_CONFIG: AuthConfig = {
  apiKeys: [],
  rateLimitPerMinute: 60,
  trustedProxies: ['127.0.0.1', '::1'],
};

let config: AuthConfig = { ...DEFAULT_CONFIG };

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// ==================== 配置函数 ====================

export function configureGatewayAuth(newConfig: Partial<AuthConfig>): void {
  config = { ...config, ...newConfig };
  logger.info(`[GatewayAuth] 配置已更新: API Keys ${config.apiKeys.length} 个, 速率限制 ${config.rateLimitPerMinute}/分钟`);
}

export function addApiKey(key: string): void {
  if (!config.apiKeys.includes(key)) {
    config.apiKeys.push(key);
    logger.info(`[GatewayAuth] 添加 API Key: ${key.slice(0, 8)}...`);
  }
}

export function removeApiKey(key: string): void {
  const idx = config.apiKeys.indexOf(key);
  if (idx >= 0) {
    config.apiKeys.splice(idx, 1);
    logger.info(`[GatewayAuth] 移除 API Key: ${key.slice(0, 8)}...`);
  }
}

// ==================== 认证函数 ====================

export interface AuthResult {
  authenticated: boolean;
  error?: string;
  clientId?: string;
  rateLimitRemaining?: number;
}

export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const clientIp = getClientIp(req);

  // 速率限制检查
  const rateLimitResult = checkRateLimit(clientIp);
  if (!rateLimitResult.allowed) {
    return {
      authenticated: false,
      error: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
    };
  }

  // 如果没有配置 API Key，允许所有请求（开发模式）
  if (config.apiKeys.length === 0) {
    return {
      authenticated: true,
      clientId: 'dev',
      rateLimitRemaining: rateLimitResult.remaining,
    };
  }

  // 从 Authorization Header 获取 API Key
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return {
      authenticated: false,
      error: 'Missing Authorization header',
    };
  }

  // 支持 Bearer Token 格式
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return {
      authenticated: false,
      error: 'Invalid Authorization header format. Use: Bearer <API_KEY>',
    };
  }

  const apiKey = parts[1];

  // 验证 API Key
  if (!config.apiKeys.includes(apiKey)) {
    logger.warn(`[GatewayAuth] 无效的 API Key: ${apiKey.slice(0, 8)}... from ${clientIp}`);
    return {
      authenticated: false,
      error: 'Invalid API key',
    };
  }

  return {
    authenticated: true,
    clientId: `client-${apiKey.slice(0, 8)}`,
    rateLimitRemaining: rateLimitResult.remaining,
  };
}

// ==================== 速率限制 ====================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

function checkRateLimit(clientIp: string): RateLimitResult {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 分钟窗口
  const limit = config.rateLimitPerMinute;

  let record = rateLimitMap.get(clientIp);

  if (!record || now >= record.resetAt) {
    // 新窗口
    record = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(clientIp, record);
    return { allowed: true, remaining: limit - 1, resetAt: record.resetAt };
  }

  record.count++;

  if (record.count > limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining: limit - record.count,
    resetAt: record.resetAt,
  };
}

// 定期清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now >= record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000);

// ==================== 工具函数 ====================

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
    const firstIp = ips.split(',')[0].trim();
    // 检查是否来自可信代理
    if (isTrustedProxy(firstIp)) {
      return firstIp;
    }
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = typeof realIp === 'string' ? realIp : realIp[0];
    if (isTrustedProxy(ip)) {
      return ip;
    }
  }

  return req.socket.remoteAddress || 'unknown';
}

function isTrustedProxy(ip: string): boolean {
  return config.trustedProxies.some((trusted) => {
    if (trusted === ip) return true;
    if (trusted.includes('/')) {
      // CIDR 格式支持
      return ip.startsWith(trusted.split('/')[0].replace(/\.\d+$/, ''));
    }
    return false;
  });
}

// ==================== 开发者模式 API Key ====================

export function generateDevApiKey(): string {
  const key = `sk-dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return key;
}
