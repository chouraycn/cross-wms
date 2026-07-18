// 发现本地 Tailscale tailnet 地址。
// 注意：openclaw 版本依赖 listExternalInterfaceAddresses/readNetworkInterfaces，
// 但 cross-wms 的 network-interfaces.ts 使用不同 API（getIpv4Addresses/getIpv6Addresses），
// 此处适配为 cross-wms 既有实现。
import { isIpInCidr } from "./_openclaw-stubs.js";
import { getIpv4Addresses, getIpv6Addresses } from "./network-interfaces.js";
import { uniqueStrings } from "./string-normalization.js";

/** 从本地外部接口发现的 tailnet 地址 */
type TailnetAddresses = {
  ipv4: string[];
  ipv6: string[];
};

const TAILNET_IPV4_CIDR = "100.64.0.0/10";
const TAILNET_IPV6_CIDR = "fd7a:115c:a1e0::/48";

/** 当地址位于 Tailscale CGNAT IPv4 范围内时返回 true */
export function isTailnetIPv4(address: string): boolean {
  // Tailscale IPv4 范围: 100.64.0.0/10
  // https://tailscale.com/kb/1015/100.x-addresses
  return isIpInCidr(address, TAILNET_IPV4_CIDR);
}

function isTailnetIPv6(address: string): boolean {
  // Tailscale IPv6 ULA 前缀: fd7a:115c:a1e0::/48
  // （跨 tailnet 稳定；节点获得每设备后缀）
  // 注意：_openclaw-stubs 中的 isIpInCidr 降级实现仅支持 IPv4，IPv6 始终返回 false。
  // 此处保留调用以维持 API 一致；待 net-policy 完整移植后可恢复完整行为。
  return isIpInCidr(address, TAILNET_IPV6_CIDR);
}

/** 从本地外部接口列出唯一的 Tailscale IPv4/IPv6 地址 */
export function listTailnetAddresses(): TailnetAddresses {
  const ipv4: string[] = [];
  const ipv6: string[] = [];

  for (const address of getIpv4Addresses()) {
    if (isTailnetIPv4(address)) {
      ipv4.push(address);
    }
  }
  for (const address of getIpv6Addresses()) {
    if (isTailnetIPv6(address)) {
      ipv6.push(address);
    }
  }

  return { ipv4: uniqueStrings(ipv4), ipv6: uniqueStrings(ipv6) };
}

/** 返回第一个发现的 Tailscale IPv4 地址（如有） */
export function pickPrimaryTailnetIPv4(): string | undefined {
  return listTailnetAddresses().ipv4[0];
}

/** 返回第一个发现的 Tailscale IPv6 地址（如有） */
export function pickPrimaryTailnetIPv6(): string | undefined {
  return listTailnetAddresses().ipv6[0];
}
