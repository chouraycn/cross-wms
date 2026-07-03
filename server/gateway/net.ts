/**
 * Gateway 网络层助手
 *
 * 参考 openclaw/src/gateway/net.ts 的安全设计原则：
 * - fail-closed：客户端 IP 解析失败时返回 undefined，不回退到代理自身 IP
 * - 最小权限：绑定地址优先 loopback，容器环境才降级到 0.0.0.0
 * - 显式安全：ws:// 仅对回环、私有 IP、.local、.ts.net 放行
 */

import type { IncomingMessage } from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import { logger } from "../logger.js";

// ==================== 类型定义 ====================

/** Gateway 绑定模式 */
export type GatewayBindMode = "loopback" | "lan" | "tailnet" | "auto" | "custom";

// ==================== IP 地址分类助手 ====================

/** 判断是否为回环地址（127.0.0.0/8 或 ::1） */
export function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  // 去除 IPv6 映射前缀 ::ffff:
  const normalized = stripIPv4MappedPrefix(ip);
  // IPv4 回环：127.0.0.0/8
  if (net.isIPv4(normalized) && normalized.startsWith("127.")) {
    return true;
  }
  // IPv6 回环：::1
  if (net.isIPv6(normalized) && normalized === "::1") {
    return true;
  }
  return false;
}

/** 判断是否为私有或回环地址（RFC1918、link-local、CGNAT、ULA、回环） */
export function isPrivateOrLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  const normalized = stripIPv4MappedPrefix(ip);
  if (isLoopbackAddress(normalized)) {
    return true;
  }
  // IPv4 私有范围检查（RFC1918 + link-local + CGNAT）
  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) {
      return true;
    }
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      return true;
    }
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) {
      return true;
    }
    // 169.254.0.0/16（link-local）
    if (parts[0] === 169 && parts[1] === 254) {
      return true;
    }
    // CGNAT 100.64.0.0/10（Tailscale 默认范围）
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
      return true;
    }
  }
  // IPv6 私有范围检查
  if (net.isIPv6(normalized)) {
    // ULA：fc00::/7（fc 和 fd 开头）
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    // link-local：fe80::/10
    if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
        normalized.startsWith("fea") || normalized.startsWith("feb")) {
      return true;
    }
  }
  return false;
}

/** 去除 ::ffff: IPv4 映射前缀，返回规范化的 IP 地址 */
function stripIPv4MappedPrefix(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }
  return ip;
}

/** 规范化 IP 地址：去除前缀映射，验证有效性 */
function normalizeIpAddress(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }
  const trimmed = ip.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = stripIPv4MappedPrefix(trimmed);
  if (net.isIP(normalized) === 0) {
    return undefined;
  }
  return normalized;
}

/** 判断是否为合法的点分十进制 IPv4 地址 */
export function isValidIPv4(host: string): boolean {
  return net.isIPv4(host);
}

/** 判断 IP 是否在 CIDR 范围内 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) {
    return false;
  }
  const slashIndex = cidr.indexOf("/");
  if (slashIndex === -1) {
    // 非 CIDR 格式，直接比较
    return normalizeIpAddress(cidr) === normalizedIp;
  }
  const network = cidr.slice(0, slashIndex);
  const prefixBits = parseInt(cidr.slice(slashIndex + 1), 10);
  if (isNaN(prefixBits) || prefixBits < 0 || prefixBits > 128) {
    return false;
  }

  if (net.isIPv4(normalizedIp) && net.isIPv4(network)) {
    return isIPv4InCidr(normalizedIp, network, prefixBits);
  }
  if (net.isIPv6(normalizedIp) && net.isIPv6(network)) {
    return isIPv6InCidr(normalizedIp, network, prefixBits);
  }
  return false;
}

function isIPv4InCidr(ip: string, network: string, prefixBits: number): boolean {
  if (prefixBits > 32) {
    return false;
  }
  const ipParts = ip.split(".").map(Number);
  const netParts = network.split(".").map(Number);
  if (ipParts.length !== 4 || netParts.length !== 4) {
    return false;
  }
  const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const netInt = (netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3];
  const mask = prefixBits === 0 ? 0 : (0xffffffff << (32 - prefixBits)) >>> 0;
  return (ipInt >>> 0) === ((ipInt & mask) >>> 0) && (netInt & mask) >>> 0 === (ipInt & mask) >>> 0;
}

function isIPv6InCidr(ip: string, network: string, prefixBits: number): boolean {
  const ipBytes = ipv6ToBytes(ip);
  const netBytes = ipv6ToBytes(network);
  if (!ipBytes || !netBytes) {
    return false;
  }
  const fullBytes = Math.floor(prefixBits / 8);
  const remainingBits = prefixBits % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (ipBytes[i] !== netBytes[i]) {
      return false;
    }
  }
  if (remainingBits > 0 && fullBytes < 16) {
    const mask = 0xff << (8 - remainingBits);
    if ((ipBytes[fullBytes] & mask) !== (netBytes[fullBytes] & mask)) {
      return false;
    }
  }
  return true;
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  try {
    const addr = new URL(`http://[${ip}]/`);
    const hostname = addr.hostname.slice(1, -1);
    const parts = hostname.split(":");
    const bytes = new Uint8Array(16);
    // 简化实现：仅支持完整 IPv6 地址
    if (parts.length !== 8) {
      return null;
    }
    for (let i = 0; i < 8; i++) {
      const word = parseInt(parts[i], 16);
      if (isNaN(word)) {
        return null;
      }
      bytes[i * 2] = (word >> 8) & 0xff;
      bytes[i * 2 + 1] = word & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

// ==================== Host 头解析 ====================

/** 规范化 Host 头：小写化并去空 */
function normalizeHostHeader(hostHeader?: string): string {
  return (hostHeader ?? "").trim().toLowerCase();
}

/** 从 Host 头提取主机名，保留未加括号的 IPv6 地址 */
export function resolveHostName(hostHeader?: string): string {
  const host = normalizeHostHeader(hostHeader);
  if (!host) {
    return "";
  }
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end !== -1) {
      return host.slice(1, end);
    }
  }
  // 未加括号的 IPv6 主机（如 ::1）无端口，应原样返回
  if (net.isIP(host) === 6) {
    return host;
  }
  const [name] = host.split(":");
  return name ?? "";
}

/** 判断主机名或 IP 是否指向本机（localhost、127.x、::1、[::1]、::ffff:127.x） */
export function isLoopbackHost(host: string): boolean {
  if (!host) {
    return false;
  }
  const normalized = host.trim().toLowerCase().replace(/\.+$/, "");
  if (normalized === "localhost") {
    return true;
  }
  const unbracketed =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
  return isLoopbackAddress(unbracketed);
}

/** 判断主机名或 IP 是否为私有或回环地址 */
export function isPrivateOrLoopbackHost(host: string): boolean {
  if (!host) {
    return false;
  }
  const normalized = host.trim().toLowerCase().replace(/\.+$/, "");
  if (normalized === "localhost") {
    return true;
  }
  const unbracketed =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
  return isPrivateOrLoopbackAddress(unbracketed);
}

// ==================== 客户端 IP 解析 ====================

/** 判断 IP 是否属于受信代理列表 */
export function isTrustedProxyAddress(ip: string | undefined, trustedProxies?: string[]): boolean {
  const normalized = normalizeIpAddress(ip);
  if (!normalized || !trustedProxies || trustedProxies.length === 0) {
    return false;
  }
  return trustedProxies.some((proxy) => {
    const candidate = proxy.trim();
    if (!candidate) {
      return false;
    }
    return isIpInCidr(normalized, candidate);
  });
}

/**
 * 解析 X-Forwarded-For 链中的客户端 IP
 *
 * 从右向左遍历，跳过回环地址和受信代理，返回首个不可信跳。
 * 这是 openclaw 的 fail-closed 设计：不回退到代理自身 IP。
 */
function resolveForwardedClientIp(params: {
  forwardedFor?: string;
  trustedProxies?: string[];
}): string | undefined {
  const { forwardedFor, trustedProxies } = params;
  if (!trustedProxies?.length) {
    return undefined;
  }

  const forwardedChain: string[] = [];
  for (const entry of forwardedFor?.split(",") ?? []) {
    const normalized = normalizeIpAddress(entry);
    if (normalized) {
      forwardedChain.push(normalized);
    }
  }
  if (forwardedChain.length === 0) {
    return undefined;
  }

  // 从右向左遍历，返回首个不可信跳
  for (let index = forwardedChain.length - 1; index >= 0; index -= 1) {
    const hop = forwardedChain[index];
    if (isLoopbackAddress(hop)) {
      continue;
    }
    if (!isTrustedProxyAddress(hop, trustedProxies)) {
      return hop;
    }
  }
  return undefined;
}

/**
 * 解析客户端真实 IP
 *
 * fail-closed 策略：当流量来自受信代理但客户端来源头缺失或无效时，
 * 返回 undefined 而非代理自身 IP，避免将无关请求误判为本地/受信。
 */
export function resolveClientIp(params: {
  remoteAddr?: string;
  forwardedFor?: string;
  realIp?: string;
  trustedProxies?: string[];
  /** 默认 false：仅在显式启用时信任 X-Real-IP */
  allowRealIpFallback?: boolean;
}): string | undefined {
  const remote = normalizeIpAddress(params.remoteAddr);
  if (!remote) {
    return undefined;
  }
  // 远端不是受信代理时，直接使用远端地址
  if (!isTrustedProxyAddress(remote, params.trustedProxies)) {
    return remote;
  }
  // fail-closed：来自受信代理但来源头缺失/无效时不回退到代理 IP
  const forwardedIp = resolveForwardedClientIp({
    forwardedFor: params.forwardedFor,
    trustedProxies: params.trustedProxies,
  });
  if (forwardedIp) {
    return forwardedIp;
  }
  if (params.allowRealIpFallback) {
    return normalizeIpAddress(params.realIp);
  }
  return undefined;
}

/** 从 IncomingMessage 解析客户端 IP（便捷封装） */
export function resolveRequestClientIp(
  req?: IncomingMessage,
  trustedProxies?: string[],
  allowRealIpFallback = false,
): string | undefined {
  if (!req) {
    return undefined;
  }
  const headerValue = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  return resolveClientIp({
    remoteAddr: req.socket?.remoteAddress ?? "",
    forwardedFor: headerValue(req.headers?.["x-forwarded-for"]),
    realIp: headerValue(req.headers?.["x-real-ip"]),
    trustedProxies,
    allowRealIpFallback,
  });
}

// ==================== 容器环境检测 ====================

let containerEnvCache: boolean | null = null;

/**
 * 检测当前是否运行在容器环境中
 *
 * 容器内 loopback 从宿主网络命名空间不可达，需降级到 0.0.0.0
 * 以保证端口转发正常工作。
 */
export function isContainerEnvironment(): boolean {
  if (containerEnvCache !== null) {
    return containerEnvCache;
  }
  containerEnvCache = detectContainerEnvironment();
  return containerEnvCache;
}

function detectContainerEnvironment(): boolean {
  // Docker/Podman：存在 /.dockerenv 文件
  try {
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }
  } catch {
    // 忽略文件系统错误
  }
  // Kubernetes：存在典型环境变量
  if (process.env.KUBERNETES_SERVICE_HOST || process.env.KUBERNETES_SERVICE_PORT) {
    return true;
  }
  // cgroup v1：检查 /proc/1/cgroup 是否包含 docker/lxc/kubepods
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    if (/docker|lxc|kubepods/.test(cgroup)) {
      return true;
    }
  } catch {
    // 忽略读取错误（非 Linux 或权限不足）
  }
  return false;
}

/** 仅供测试重置容器环境缓存 */
export function __resetContainerCacheForTest(): void {
  containerEnvCache = null;
}

// ==================== 绑定地址解析 ====================

/**
 * 测试能否绑定到指定主机地址
 * 创建临时服务器、尝试绑定、然后关闭。
 */
async function canBindToHost(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const testServer = net.createServer();
    testServer.once("error", () => {
      resolve(false);
    });
    testServer.once("listening", () => {
      testServer.close();
      resolve(true);
    });
    // 使用端口 0 让操作系统选择可用端口
    testServer.listen(0, host);
  });
}

/**
 * 解析 Gateway 绑定主机地址（带降级策略）
 *
 * 模式说明：
 * - loopback：127.0.0.1（极少失败，优雅降级到 0.0.0.0）
 * - lan：始终 0.0.0.0（无降级）
 * - tailnet：Tailnet IPv4（如可用），否则回环
 * - auto：容器内 0.0.0.0（Docker/Podman/K8s），裸机则回环
 * - custom：用户指定 IP，不可用则降级到 0.0.0.0
 *
 * @returns 绑定地址（永不为 null）
 */
export async function resolveGatewayBindHost(
  bind: GatewayBindMode | undefined,
  customHost?: string,
): Promise<string> {
  const mode = bind ?? "loopback";

  if (mode === "loopback") {
    if (await canBindToHost("127.0.0.1")) {
      return "127.0.0.1";
    }
    logger.warn("[GatewayNet] loopback 绑定失败，降级到 0.0.0.0");
    return "0.0.0.0";
  }

  if (mode === "lan") {
    return "0.0.0.0";
  }

  if (mode === "tailnet") {
    // Tailnet 默认使用 100.x CGNAT 范围，尝试探测主接口地址
    const tailnetIP = pickPrimaryTailnetIPv4();
    if (tailnetIP && (await canBindToHost(tailnetIP))) {
      return tailnetIP;
    }
    if (await canBindToHost("127.0.0.1")) {
      return "127.0.0.1";
    }
    return "0.0.0.0";
  }

  if (mode === "custom") {
    const host = customHost?.trim();
    if (!host) {
      logger.warn("[GatewayNet] custom 模式未指定有效主机，降级到 0.0.0.0");
      return "0.0.0.0";
    }
    if (isValidIPv4(host) && (await canBindToHost(host))) {
      return host;
    }
    logger.warn(`[GatewayNet] custom 主机 ${host} 不可绑定，降级到 0.0.0.0`);
    return "0.0.0.0";
  }

  if (mode === "auto") {
    // 容器内 loopback 从宿主网络命名空间不可达，优先 0.0.0.0
    if (isContainerEnvironment()) {
      return "0.0.0.0";
    }
    if (await canBindToHost("127.0.0.1")) {
      return "127.0.0.1";
    }
    return "0.0.0.0";
  }

  return "0.0.0.0";
}

/**
 * 解析默认绑定模式
 *
 * 容器环境默认 "auto"（解析为 0.0.0.0）；裸机/VM 默认 "loopback"。
 * 当 tailscaleMode 为 serve/funnel 时始终返回 "loopback"，
 * 因为 Tailscale serve/funnel 架构上要求回环绑定。
 */
export function defaultGatewayBindMode(tailscaleMode?: string): GatewayBindMode {
  if (tailscaleMode && tailscaleMode !== "off") {
    return "loopback";
  }
  return isContainerEnvironment() ? "auto" : "loopback";
}

/**
 * 解析 Gateway 监听主机列表
 *
 * Windows 上 uv_tcp_bind6 创建双栈套接字，同时绑定 ::1 和 127.0.0.1
 * 会导致非确定性 TCP 路由，因此 Windows 上仅返回 IPv4 地址。
 */
export async function resolveGatewayListenHosts(
  bindHost: string,
  opts?: { canBindToHost?: (host: string) => Promise<boolean> },
): Promise<string[]> {
  if (bindHost !== "127.0.0.1") {
    return [bindHost];
  }
  if (process.platform === "win32") {
    return [bindHost];
  }
  const canBind = opts?.canBindToHost ?? canBindToHost;
  if (await canBind("::1")) {
    return [bindHost, "::1"];
  }
  return [bindHost];
}

/** 选取主 Tailnet IPv4 地址（通过网络接口探测 100.64/10 CGNAT 范围） */
function pickPrimaryTailnetIPv4(): string | undefined {
  try {
    const interfaces = os.networkInterfaces();
    if (!interfaces) {
      return undefined;
    }
    for (const name of ["tailscale0", "utun4", "utun0"]) {
      const entries = interfaces[name];
      if (!entries) {
        continue;
      }
      for (const entry of entries) {
        if (entry.family === "IPv4" && !entry.internal) {
          const parts = entry.address.split(".").map(Number);
          if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
            return entry.address;
          }
        }
      }
    }
    // 遍历所有接口查找 100.64/10 范围地址
    for (const entries of Object.values(interfaces)) {
      if (!entries) {
        continue;
      }
      for (const entry of entries) {
        if (entry.family === "IPv4" && !entry.internal) {
          const parts = entry.address.split(".").map(Number);
          if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
            return entry.address;
          }
        }
      }
    }
  } catch {
    // 忽略网络接口读取错误
  }
  return undefined;
}

// ==================== WebSocket URL 安全检查 ====================

/**
 * WebSocket URL 安全检查（CWE-319：敏感信息明文传输）
 *
 * 安全策略：
 * - wss://（TLS）始终安全
 * - ws:// 仅对回环、私有 IP 字面量、.local、.ts.net 主机放行
 * - 其他 ws:// URL 视为不安全（凭据和聊天数据会暴露给网络拦截）
 *
 * @param url WebSocket URL
 * @param opts.allowPrivateWs 可选破窗：允许信任私有 DNS 的 ws:// 主机名
 */
export function isSecureWebSocketUrl(
  url: string,
  opts?: {
    allowPrivateWs?: boolean;
  },
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Node ws 客户端接受 http(s) URL 并规范化为 ws(s)
  // 此处同等对待以保持一致的安全策略
  const protocol =
    parsed.protocol === "https:" ? "wss:" : parsed.protocol === "http:" ? "ws:" : parsed.protocol;

  if (protocol === "wss:") {
    return true;
  }

  if (protocol !== "ws:") {
    return false;
  }

  // 默认策略允许本地/Tailnet 端点（无法在无额外配置下使用公共 TLS）
  if (isLoopbackHost(parsed.hostname)) {
    return true;
  }
  if (isTrustedPlaintextWebSocketHost(parsed.hostname)) {
    return true;
  }
  // 可选破窗：信任私有 DNS 覆盖网络
  if (opts?.allowPrivateWs) {
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return true;
    }
    // 主机名可能解析到私有网络（VPN/Tailnet DNS），但同步验证器无法解析
    const hostForIpCheck =
      parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
        ? parsed.hostname.slice(1, -1)
        : parsed.hostname;
    return net.isIP(hostForIpCheck) === 0;
  }
  return false;
}

/** 判断主机名是否为受信的明文 WebSocket 主机（私有/回环/.local/.ts.net） */
function isTrustedPlaintextWebSocketHost(hostname: string): boolean {
  if (isPrivateOrLoopbackHost(hostname)) {
    return true;
  }
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, "");
  return normalized.endsWith(".local") || normalized.endsWith(".ts.net");
}
