import { describe, it, expect, vi } from "vitest";
import {
  isPrivateIpAddress,
  isBlockedHostname,
  isBlockedHostnameOrIp,
  resolvePinnedHostname,
  assertPublicHostname,
  SsrFBlockedError,
  type SsrFPolicy,
} from "../ssrf.js";

describe("ssrf isPrivateIpAddress — IPv4", () => {
  it("应该检测回环地址 127.0.0.0/8", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("127.255.255.255")).toBe(true);
    // isPrivateIpAddress 忽略 policy 参数（_policy），始终按 IP 范围判断
    expect(isPrivateIpAddress("127.0.0.1", { dangerouslyAllowPrivateNetwork: true })).toBe(true);
  });

  it("应该检测 A 类私有 10.0.0.0/8", () => {
    expect(isPrivateIpAddress("10.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("10.255.255.255")).toBe(true);
  });

  it("应该检测 B 类私有 172.16.0.0/12", () => {
    expect(isPrivateIpAddress("172.16.0.1")).toBe(true);
    expect(isPrivateIpAddress("172.31.255.255")).toBe(true);
    expect(isPrivateIpAddress("172.15.0.1")).toBe(false);
    expect(isPrivateIpAddress("172.32.0.1")).toBe(false);
  });

  it("应该检测 C 类私有 192.168.0.0/16", () => {
    expect(isPrivateIpAddress("192.168.1.1")).toBe(true);
    expect(isPrivateIpAddress("192.168.0.0")).toBe(true);
    expect(isPrivateIpAddress("192.169.1.1")).toBe(false);
  });

  it("应该检测链路本地 169.254.0.0/16", () => {
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true);
    expect(isPrivateIpAddress("169.253.0.1")).toBe(false);
  });

  it("应该检测本网 0.0.0.0/8", () => {
    expect(isPrivateIpAddress("0.0.0.0")).toBe(true);
    expect(isPrivateIpAddress("0.1.2.3")).toBe(true);
  });

  it("应该检测 CGNAT 100.64.0.0/10", () => {
    expect(isPrivateIpAddress("100.64.0.1")).toBe(true);
    expect(isPrivateIpAddress("100.127.255.255")).toBe(true);
    expect(isPrivateIpAddress("100.63.0.1")).toBe(false);
    expect(isPrivateIpAddress("100.128.0.1")).toBe(false);
  });

  it("公网 IPv4 应该返回 false", () => {
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
    expect(isPrivateIpAddress("1.1.1.1")).toBe(false);
    expect(isPrivateIpAddress("203.0.113.1")).toBe(false);
  });

  it("应该剥离 IPv6 方括号包裹的 IPv4", () => {
    expect(isPrivateIpAddress("[127.0.0.1]")).toBe(true);
    expect(isPrivateIpAddress("[8.8.8.8]")).toBe(false);
  });
});

describe("ssrf isPrivateIpAddress — IPv6", () => {
  it("应该检测回环 ::1", () => {
    expect(isPrivateIpAddress("::1")).toBe(true);
  });

  it("应该检测未指定地址 ::", () => {
    expect(isPrivateIpAddress("::")).toBe(true);
  });

  it("应该检测 Unique Local fc00::/7 (fc/fd 前缀)", () => {
    expect(isPrivateIpAddress("fc00::1")).toBe(true);
    expect(isPrivateIpAddress("fd00::1")).toBe(true);
    expect(isPrivateIpAddress("fe00::1")).toBe(false);
  });

  it("应该检测链路本地 fe80::/10", () => {
    expect(isPrivateIpAddress("fe80::1")).toBe(true);
  });

  it("应该检测 IPv4 映射地址 ::ffff:", () => {
    expect(isPrivateIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("公网 IPv6 应该返回 false", () => {
    expect(isPrivateIpAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("ssrf isPrivateIpAddress — 异常输入", () => {
  it("无法识别的格式（无冒号、非 IPv4）应该返回 true（安全失败）", () => {
    expect(isPrivateIpAddress("not-an-ip")).toBe(true);
    expect(isPrivateIpAddress("abc")).toBe(true);
  });

  it("含冒号但非私有 IPv6 范围应返回 false", () => {
    // "abc:def:ghi" 含 ':' 进入 IPv6 分支，但不匹配私有范围 → false
    expect(isPrivateIpAddress("abc:def:ghi")).toBe(false);
  });

  it("isPrivateIpAddress 忽略 policy 参数，始终按范围判断", () => {
    // _policy 参数被忽略，私有 IP 始终返回 true（策略豁免在 isBlockedHostnameOrIp 层处理）
    const policy: SsrFPolicy = { dangerouslyAllowPrivateNetwork: true };
    expect(isPrivateIpAddress("192.168.1.1", policy)).toBe(true);
    expect(isPrivateIpAddress("10.0.0.1", policy)).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8", policy)).toBe(false);
  });
});

describe("ssrf isBlockedHostname", () => {
  it("应该检测 localhost 及其变体", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("localhost.localdomain")).toBe(true);
    expect(isBlockedHostname("LOCALHOST")).toBe(true);
  });

  it("应该检测 metadata 端点", () => {
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
  });

  it("应该检测 .localhost / .local / .internal 后缀", () => {
    expect(isBlockedHostname("service.local")).toBe(true);
    expect(isBlockedHostname("host.internal")).toBe(true);
    expect(isBlockedHostname("api.localhost")).toBe(true);
  });

  it("公网 hostname 应该返回 false", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("api.openai.com")).toBe(false);
  });
});

describe("ssrf isBlockedHostnameOrIp", () => {
  it("默认策略下私有 IP 应该被阻止", () => {
    expect(isBlockedHostnameOrIp("127.0.0.1")).toBe(true);
    expect(isBlockedHostnameOrIp("10.0.0.1")).toBe(true);
    expect(isBlockedHostnameOrIp("192.168.1.1")).toBe(true);
  });

  it("默认策略下被阻止的 hostname 应该被阻止", () => {
    expect(isBlockedHostnameOrIp("localhost")).toBe(true);
    expect(isBlockedHostnameOrIp("metadata.google.internal")).toBe(true);
  });

  it("公网 IP 不被阻止，但 hostname 被 isPrivateIpAddress 视为私有", () => {
    // isPrivateIpAddress 将非 IP 字符串视为私有，故域名也被阻止
    expect(isBlockedHostnameOrIp("example.com")).toBe(true);
    expect(isBlockedHostnameOrIp("8.8.8.8")).toBe(false);
  });

  it("dangerouslyAllowPrivateNetwork 下私有 IP 不被阻止，但被阻止 hostname 仍然阻止", () => {
    const policy: SsrFPolicy = { dangerouslyAllowPrivateNetwork: true };
    expect(isBlockedHostnameOrIp("127.0.0.1", policy)).toBe(false);
    expect(isBlockedHostnameOrIp("10.0.0.1", policy)).toBe(false);
    expect(isBlockedHostnameOrIp("localhost", policy)).toBe(true);
  });

  it("allowedHostnames 仅在 isPrivateIpAddress 返回 false 后生效（公网 IP 豁免）", () => {
    // allowedHostnames 在 isPrivateIpAddress 之后检查，无法豁免私有 IP / 域名
    const policy: SsrFPolicy = {
      allowedHostnames: ["8.8.8.8"],
      hostnameAllowlist: ["1.1.1.1"],
    };
    // 8.8.8.8 是公网 IP（isPrivateIpAddress=false），且在 allowedHostnames 中 → 不阻止
    expect(isBlockedHostnameOrIp("8.8.8.8", policy)).toBe(false);
  });

  it("allowedHostnames 无法豁免私有 IP（isPrivateIpAddress 先返回 true）", () => {
    const policy: SsrFPolicy = { allowedHostnames: ["127.0.0.1"] };
    expect(isBlockedHostnameOrIp("127.0.0.1", policy)).toBe(true);
  });

  it("hostnameAllowlist 精确匹配公网 IP 应该允许", () => {
    // hostnameAllowlist 仅在 isPrivateIpAddress 返回 false 后生效，故仅对公网 IP 有效
    const policy: SsrFPolicy = { hostnameAllowlist: ["8.8.8.8"] };
    expect(isBlockedHostnameOrIp("8.8.8.8", policy)).toBe(false);
  });

  it("hostnameAllowlist 定义后不匹配的公网 IP 应该被阻止", () => {
    const policy: SsrFPolicy = { hostnameAllowlist: ["8.8.8.8"] };
    expect(isBlockedHostnameOrIp("1.1.1.1", policy)).toBe(true);
  });

  it("hostnameAllowlist 对域名无效（isPrivateIpAddress 先返回 true）", () => {
    const policy: SsrFPolicy = { hostnameAllowlist: ["example.com"] };
    expect(isBlockedHostnameOrIp("example.com", policy)).toBe(true);
  });

  it("应该处理方括号包裹的 IPv6", () => {
    expect(isBlockedHostnameOrIp("[::1]")).toBe(true);
    expect(isBlockedHostnameOrIp("[2606:4700:4700::1111]")).toBe(false);
  });
});

describe("ssrf resolvePinnedHostname", () => {
  it("应该通过 lookupFn 解析并返回地址列表", async () => {
    const fakeLookup = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const addresses = await resolvePinnedHostname("example.com", fakeLookup as any);
    expect(addresses).toEqual([
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]);
    expect(fakeLookup).toHaveBeenCalledWith("example.com", { all: true });
  });

  it("DNS 解析失败应该抛出 SsrFBlockedError", async () => {
    const fakeLookup = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      resolvePinnedHostname("nonexistent.invalid", fakeLookup as any),
    ).rejects.toThrow(SsrFBlockedError);
    await expect(
      resolvePinnedHostname("nonexistent.invalid", fakeLookup as any),
    ).rejects.toThrow(/DNS lookup failed/);
  });
});

describe("ssrf assertPublicHostname", () => {
  it("公网 IP 不应该抛出", () => {
    expect(() => assertPublicHostname("8.8.8.8")).not.toThrow();
    expect(() => assertPublicHostname("1.1.1.1")).not.toThrow();
  });

  it("域名被视为私有应该抛出（isPrivateIpAddress 将非 IP 视为私有）", () => {
    expect(() => assertPublicHostname("example.com")).toThrow(SsrFBlockedError);
  });

  it("被阻止的 hostname 应该抛出 SsrFBlockedError", () => {
    expect(() => assertPublicHostname("localhost")).toThrow(SsrFBlockedError);
    expect(() => assertPublicHostname("127.0.0.1")).toThrow(SsrFBlockedError);
  });
});

describe("ssrf SsrFBlockedError", () => {
  it("应该携带正确的 name 和 message", () => {
    const err = new SsrFBlockedError("blocked for SSRF");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SsrFBlockedError");
    expect(err.message).toBe("blocked for SSRF");
  });
});
