// 格式化端口探测结果用于诊断和 CLI 输出。
// 降级实现：从 openclaw/src/infra/ports-format.ts 移植，
// - normalizeLowercaseStringOrEmpty 使用本地 string-coerce.js 替代 @openclaw/normalization-core/string-coerce
// - formatCliCommand 使用本地 _runtime-stubs.ts 替代 ../cli/command-format.js
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import { formatCliCommand } from "./_runtime-stubs.js";
import type { PortListener, PortListenerKind, PortUsage } from "./ports-types.js";

/** 将监听器分类为 OpenClaw Gateway、SSH 隧道、已知非 gateway 或未知。 */
export function classifyPortListener(listener: PortListener, _port: number): PortListenerKind {
  const raw = normalizeLowercaseStringOrEmpty(
    `${listener.commandLine ?? ""} ${listener.command ?? ""}`,
  );
  if (raw.includes("openclaw")) {
    return "gateway";
  }
  const command = normalizeLowercaseStringOrEmpty(listener.command ?? "");
  const commandLine = normalizeLowercaseStringOrEmpty(listener.commandLine ?? "");
  const hasSshCommand = /(?:^|[/\\])ssh(?:\.exe)?$/.test(command);
  const hasSshExecutable =
    hasSshCommand ||
    /(?:^|[\s"'])(?:(?:"[^"]*[/\\])|(?:'[^']*[/\\])|(?:\S*[/\\]))?ssh(?:\.exe)?(?:[\s"']|$)/.test(
      commandLine,
    );
  if (hasSshCommand) {
    return "ssh";
  }
  if (hasSshExecutable) {
    // 探测行已经证明此进程拥有查询的端口。
    // 确切的 ssh 可执行文件可能从 ssh_config 或 host 别名获取转发。
    return "ssh";
  }
  if (
    command === "sshd" ||
    /(?:^|[/\\])sshd(?:\.exe)?$/.test(command) ||
    /(?:^|[/\\])[^/\\\s]*ssh[^/\\\s]*(?:\.exe)?$/.test(command)
  ) {
    return "non_gateway";
  }
  if (/(?:^|[/\\\s])[^/\\\s]*ssh[^/\\\s]*(?:\.exe)?(?:[/\\\s"']|$)/.test(commandLine)) {
    return "non_gateway";
  }
  return "unknown";
}

function parseListenerAddress(address: string): { host: string; port: number } | null {
  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/^tcp6?\s+/i, "").replace(/\s*\(listen\)\s*$/i, "");
  const bracketMatch = normalized.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketMatch) {
    const port = Number.parseInt(bracketMatch[2], 10);
    return Number.isFinite(port)
      ? { host: normalizeLowercaseStringOrEmpty(bracketMatch[1]), port }
      : null;
  }
  const lastColon = normalized.lastIndexOf(":");
  if (lastColon <= 0 || lastColon >= normalized.length - 1) {
    return null;
  }
  const host = normalizeLowercaseStringOrEmpty(normalized.slice(0, lastColon));
  const portToken = normalized.slice(lastColon + 1).trim();
  if (!/^\d+$/.test(portToken)) {
    return null;
  }
  const port = Number.parseInt(portToken, 10);
  return Number.isFinite(port) ? { host, port } : null;
}

// 双栈监听器输出可能包含 IPv4 映射的 IPv6 地址；
// 将它们保留在 IPv6 family 中，以便良性 loopback-pair 检测保持保守。
function classifyLoopbackAddressFamily(host: string): "ipv4" | "ipv6" | null {
  if (host === "127.0.0.1" || host === "localhost") {
    return "ipv4";
  }
  if (host === "::1") {
    return "ipv6";
  }
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice("::ffff:".length);
    return mapped === "127.0.0.1" ? "ipv6" : null;
  }
  return null;
}

function isWildcardAddress(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "*";
}

function isExpectedGatewayBindAddress(host: string): boolean {
  return classifyLoopbackAddressFamily(host) !== null || isWildcardAddress(host);
}

/** 返回 true 表示一个绑定到预期 loopback 或通配符地址的 Gateway 监听器。 */
export function isSingleExpectedGatewayListener(listeners: PortListener[], port: number): boolean {
  if (listeners.length !== 1) {
    return false;
  }
  const [listener] = listeners;
  if (!listener || classifyPortListener(listener, port) !== "gateway") {
    return false;
  }
  const pid = listener.pid;
  if (typeof pid !== "number" || !Number.isFinite(pid)) {
    return false;
  }
  if (typeof listener.address !== "string") {
    return false;
  }
  const parsedAddress = parseListenerAddress(listener.address);
  return Boolean(
    parsedAddress &&
    parsedAddress.port === port &&
    isExpectedGatewayBindAddress(parsedAddress.host),
  );
}

/** 返回 true 表示由独立 IPv4 和 IPv6 loopback 行表示的一个 Gateway 进程。 */
export function isDualStackLoopbackGatewayListeners(
  listeners: PortListener[],
  port: number,
): boolean {
  if (listeners.length < 2) {
    return false;
  }
  const pids = new Set<number>();
  const families = new Set<"ipv4" | "ipv6">();
  for (const listener of listeners) {
    if (classifyPortListener(listener, port) !== "gateway") {
      return false;
    }
    const pid = listener.pid;
    if (typeof pid !== "number" || !Number.isFinite(pid)) {
      return false;
    }
    pids.add(pid);
    if (typeof listener.address !== "string") {
      return false;
    }
    const parsedAddress = parseListenerAddress(listener.address);
    if (!parsedAddress || parsedAddress.port !== port) {
      return false;
    }
    const family = classifyLoopbackAddressFamily(parsedAddress.host);
    if (!family) {
      return false;
    }
    families.add(family);
  }
  return pids.size === 1 && families.has("ipv4") && families.has("ipv6");
}

/** 返回 true 表示监听器行描述了良性 Gateway 绑定模式。 */
export function isExpectedGatewayListeners(listeners: PortListener[], port: number): boolean {
  return (
    isSingleExpectedGatewayListener(listeners, port) ||
    isDualStackLoopbackGatewayListeners(listeners, port)
  );
}

/** 为占用端口的进程构建面向用户的修复提示。 */
export function buildPortHints(listeners: PortListener[], port: number): string[] {
  if (listeners.length === 0) {
    return [];
  }
  const kinds = new Set(listeners.map((listener) => classifyPortListener(listener, port)));
  const hints: string[] = [];
  const expectedGatewayListeners = isExpectedGatewayListeners(listeners, port);
  if (kinds.has("gateway") && !expectedGatewayListeners) {
    hints.push(
      `Gateway already running locally. Stop it (${formatCliCommand("openclaw gateway stop")}) or use a different port.`,
    );
  }
  if (kinds.has("ssh")) {
    hints.push(
      "SSH tunnel already bound to this port. Close the tunnel or use a different local port in -L.",
    );
  }
  if (kinds.has("unknown") || kinds.has("non_gateway")) {
    hints.push("Another process is listening on this port.");
  }
  if (listeners.length > 1 && !expectedGatewayListeners) {
    hints.push(
      "Multiple listeners detected; ensure only one gateway/tunnel per port unless intentionally running isolated profiles.",
    );
  }
  return hints;
}

/** 格式化一个监听器行用于 CLI 诊断。 */
export function formatPortListener(listener: PortListener): string {
  const pid = listener.pid ? `pid ${listener.pid}` : "pid ?";
  const user = listener.user ? ` ${listener.user}` : "";
  const command = listener.commandLine || listener.command || "unknown";
  const address = listener.address ? ` (${listener.address})` : "";
  return `${pid}${user}: ${command}${address}`;
}

/** 将空闲/忙碌端口诊断格式化为 CLI 输出行。 */
export function formatPortDiagnostics(diagnostics: PortUsage): string[] {
  if (diagnostics.status !== "busy") {
    return [`Port ${diagnostics.port} is free.`];
  }
  const lines = [`Port ${diagnostics.port} is already in use.`];
  for (const listener of diagnostics.listeners) {
    lines.push(`- ${formatPortListener(listener)}`);
  }
  for (const hint of diagnostics.hints) {
    lines.push(`- ${hint}`);
  }
  return lines;
}
