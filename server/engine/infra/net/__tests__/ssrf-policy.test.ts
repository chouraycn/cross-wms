import { describe, it, expect } from "vitest";
import {
  isAllowed,
  mergeSsrFPolicies,
  isPrivateNetworkOptInEnabled,
  ssrfPolicyFromPrivateNetworkOptIn,
  normalizeHostnameSuffixAllowlist,
  isHttpsUrlAllowedByHostnameSuffixAllowlist,
  buildHostnameAllowlistPolicyFromSuffixAllowlist,
  createSsrfPolicyGuard,
  hasLegacyFlatAllowPrivateNetworkAlias,
  migrateLegacyFlatAllowPrivateNetworkAlias,
  type SsrFPolicy,
} from "../ssrf-policy.js";

describe("ssrf-policy isAllowed", () => {
  // 注意：isPrivateIpAddress 将所有非 IP 字符串（含域名）视为私有，
  // 因此无策略时只有公网 IP 字面量能通过；域名需通过 allowedHostnames 或
  // allowPrivateNetwork 豁免。
  it("应该允许公网 IP 字面量（无策略）", () => {
    expect(isAllowed("https://8.8.8.8/path")).toBe(true);
    expect(isAllowed("https://1.1.1.1/v1/chat")).toBe(true);
  });

  it("无策略时域名应被拒绝（deny-by-default）", () => {
    expect(isAllowed("https://example.com/")).toBe(false);
    expect(isAllowed("https://api.openai.com/")).toBe(false);
  });

  it("应该拒绝无效 URL", () => {
    expect(isAllowed("not-a-url")).toBe(false);
    expect(isAllowed("")).toBe(false);
    expect(isAllowed("://no-host")).toBe(false);
  });

  it("应该拒绝无 hostname 的 URL", () => {
    expect(isAllowed("https:///path-only")).toBe(false);
  });

  it("应该拒绝私有 IPv4 地址", () => {
    expect(isAllowed("https://127.0.0.1/")).toBe(false);
    expect(isAllowed("https://10.0.0.1/")).toBe(false);
    expect(isAllowed("https://192.168.1.1/")).toBe(false);
    expect(isAllowed("https://172.16.0.1/")).toBe(false);
    expect(isAllowed("https://169.254.169.254/")).toBe(false);
  });

  it("应该拒绝被阻止的 hostname (localhost / metadata)", () => {
    expect(isAllowed("https://localhost/")).toBe(false);
    expect(isAllowed("https://metadata.google.internal/")).toBe(false);
    expect(isAllowed("http://service.local/")).toBe(false);
    expect(isAllowed("http://host.internal/")).toBe(false);
  });

  it("dangerouslyAllowPrivateNetwork 应该允许私有 IP 和域名", () => {
    const policy: SsrFPolicy = { dangerouslyAllowPrivateNetwork: true };
    expect(isAllowed("https://127.0.0.1/", policy)).toBe(true);
    expect(isAllowed("https://10.0.0.1/", policy)).toBe(true);
    expect(isAllowed("https://example.com/", policy)).toBe(true);
  });

  it("allowPrivateNetwork 别名也应该允许私有 IP", () => {
    const policy: SsrFPolicy = { allowPrivateNetwork: true };
    expect(isAllowed("https://192.168.1.1/", policy)).toBe(true);
  });

  it("allowedHostnames 应该绕过私有检查（精确域名豁免）", () => {
    const policy: SsrFPolicy = { allowedHostnames: ["example.com"] };
    expect(isAllowed("https://example.com/", policy)).toBe(true);
  });

  it("allowedHostnames 应该绕过私有 IP 检查", () => {
    const policy: SsrFPolicy = { allowedHostnames:["127.0.0.1"] };
    expect(isAllowed("https://127.0.0.1/", policy)).toBe(true);
  });

  it("hostnameAllowlist 过滤：不匹配的域名立即拒绝", () => {
    const policy: SsrFPolicy = { hostnameAllowlist: ["allowed.com"] };
    expect(isAllowed("https://other.com/", policy)).toBe(false);
  });

  it("hostnameAllowlist 过滤：不匹配的公网 IP 也拒绝", () => {
    const policy: SsrFPolicy = { hostnameAllowlist: ["8.8.8.8"] };
    expect(isAllowed("https://1.1.1.1/", policy)).toBe(false);
  });

  it("hostnameAllowlist 精确匹配公网 IP 应该允许", () => {
    const policy: SsrFPolicy = { hostnameAllowlist: ["8.8.8.8"] };
    expect(isAllowed("https://8.8.8.8/", policy)).toBe(true);
  });

  it("hostnameAllowlist 通配符不匹配裸域名本身", () => {
    const policy: SsrFPolicy = { hostnameAllowlist: ["*.example.com"] };
    expect(isAllowed("https://example.com/", policy)).toBe(false);
  });
});

describe("ssrf-policy mergeSsrFPolicies", () => {
  it("应该合并多个策略的 allowlist", () => {
    const merged = mergeSsrFPolicies(
      { hostnameAllowlist: ["a.com"] },
      { hostnameAllowlist: ["b.com", "a.com"] },
    );
    expect(merged?.hostnameAllowlist).toEqual(
      expect.arrayContaining(["a.com", "b.com"]),
    );
    expect(merged?.hostnameAllowlist).toHaveLength(2);
  });

  it("任一策略开启 allowPrivateNetwork 则合并后开启", () => {
    const merged = mergeSsrFPolicies(
      { allowPrivateNetwork: false },
      { allowPrivateNetwork: true },
    );
    expect(merged?.allowPrivateNetwork).toBe(true);
  });

  it("全部 undefined 应返回 undefined", () => {
    expect(mergeSsrFPolicies(undefined, undefined)).toBeUndefined();
  });

  it("空对象应该返回 undefined", () => {
    expect(mergeSsrFPolicies({})).toBeUndefined();
  });
});

describe("ssrf-policy isPrivateNetworkOptInEnabled", () => {
  it("布尔 true 应该返回 true", () => {
    expect(isPrivateNetworkOptInEnabled(true)).toBe(true);
  });

  it("布尔 false 应该返回 false", () => {
    expect(isPrivateNetworkOptInEnabled(false)).toBe(false);
  });

  it("顶层 allowPrivateNetwork 应该被识别", () => {
    expect(isPrivateNetworkOptInEnabled({ allowPrivateNetwork: true })).toBe(true);
    expect(isPrivateNetworkOptInEnabled({ allowPrivateNetwork: false })).toBe(false);
  });

  it("顶层 dangerouslyAllowPrivateNetwork 应该被识别", () => {
    expect(
      isPrivateNetworkOptInEnabled({ dangerouslyAllowPrivateNetwork: true }),
    ).toBe(true);
  });

  it("嵌套 network.allowPrivateNetwork 应该被识别", () => {
    expect(
      isPrivateNetworkOptInEnabled({ network: { allowPrivateNetwork: true } }),
    ).toBe(true);
    expect(
      isPrivateNetworkOptInEnabled({ network: { dangerouslyAllowPrivateNetwork: true } }),
    ).toBe(true);
  });

  it("ssrfPolicyFromPrivateNetworkOptIn 应该生成策略", () => {
    expect(ssrfPolicyFromPrivateNetworkOptIn(true)).toEqual({
      allowPrivateNetwork: true,
    });
    expect(ssrfPolicyFromPrivateNetworkOptIn(false)).toBeUndefined();
  });
});

describe("ssrf-policy hostname suffix allowlist", () => {
  it("normalizeHostnameSuffixAllowlist 应该规范化为小写", () => {
    expect(
      normalizeHostnameSuffixAllowlist(["Example.COM", "API.OpenAI.com"]),
    ).toEqual(
      expect.arrayContaining(["example.com", "api.openai.com"]),
    );
  });

  it("通配符 * 应该折叠为单个 *", () => {
    expect(normalizeHostnameSuffixAllowlist(["*", "example.com"])).toEqual(["*"]);
  });

  it("空输入应返回空数组", () => {
    expect(normalizeHostnameSuffixAllowlist([])).toEqual([]);
    expect(normalizeHostnameSuffixAllowlist(undefined, [])).toEqual([]);
  });

  it("默认值在输入为空时生效", () => {
    expect(
      normalizeHostnameSuffixAllowlist(undefined, ["default.com"]),
    ).toEqual(["default.com"]);
  });

  it("isHttpsUrlAllowedByHostnameSuffixAllowlist 应该匹配 HTTPS + 后缀", () => {
    const allowlist = normalizeHostnameSuffixAllowlist(["example.com"]);
    expect(
      isHttpsUrlAllowedByHostnameSuffixAllowlist(
        "https://api.example.com/",
        allowlist,
      ),
    ).toBe(true);
    expect(
      isHttpsUrlAllowedByHostnameSuffixAllowlist("https://example.com/", allowlist),
    ).toBe(true);
  });

  it("isHttpsUrlAllowedByHostnameSuffixAllowlist 应该拒绝 HTTP", () => {
    const allowlist = normalizeHostnameSuffixAllowlist(["example.com"]);
    expect(
      isHttpsUrlAllowedByHostnameSuffixAllowlist("http://example.com/", allowlist),
    ).toBe(false);
  });

  it("isHttpsUrlAllowedByHostnameSuffixAllowlist 应该拒绝不匹配的域名", () => {
    const allowlist = normalizeHostnameSuffixAllowlist(["example.com"]);
    expect(
      isHttpsUrlAllowedByHostnameSuffixAllowlist("https://other.com/", allowlist),
    ).toBe(false);
  });

  it("buildHostnameAllowlistPolicyFromSuffixAllowlist 应该生成精确+通配符模式", () => {
    const policy = buildHostnameAllowlistPolicyFromSuffixAllowlist(["example.com"]);
    expect(policy?.hostnameAllowlist).toEqual(
      expect.arrayContaining(["example.com", "*.example.com"]),
    );
  });

  it("buildHostnameAllowlistPolicyFromSuffixAllowlist 通配符 * 返回 undefined", () => {
    expect(
      buildHostnameAllowlistPolicyFromSuffixAllowlist(["*"]),
    ).toBeUndefined();
  });

  it("buildHostnameAllowlistPolicyFromSuffixAllowlist 空输入返回 undefined", () => {
    expect(buildHostnameAllowlistPolicyFromSuffixAllowlist([])).toBeUndefined();
    expect(
      buildHostnameAllowlistPolicyFromSuffixAllowlist(undefined),
    ).toBeUndefined();
  });
});

describe("ssrf-policy createSsrfPolicyGuard", () => {
  it("应该创建绑定 allowPrivateNetwork 策略的 guard", () => {
    const guard = createSsrfPolicyGuard({ allowPrivateNetwork: true });
    expect(guard.isAllowed("https://example.com/")).toBe(true);
    expect(guard.isAllowed("https://127.0.0.1/")).toBe(true);
  });

  it("应该创建绑定 allowedHostnames 策略的 guard", () => {
    const guard = createSsrfPolicyGuard({ allowedHostnames: ["trusted.com"] });
    expect(guard.isAllowed("https://trusted.com/")).toBe(true);
    expect(guard.isAllowed("https://untrusted.com/")).toBe(false);
  });

  it("无策略时 guard 应该拒绝私有地址和域名", () => {
    const guard = createSsrfPolicyGuard();
    expect(guard.isAllowed("https://127.0.0.1/")).toBe(false);
    expect(guard.isAllowed("https://example.com/")).toBe(false);
    expect(guard.isAllowed("https://8.8.8.8/")).toBe(true);
  });
});

describe("ssrf-policy legacy migration", () => {
  it("hasLegacyFlatAllowPrivateNetworkAlias 应该检测扁平别名", () => {
    expect(
      hasLegacyFlatAllowPrivateNetworkAlias({ allowPrivateNetwork: true }),
    ).toBe(true);
    expect(
      hasLegacyFlatAllowPrivateNetworkAlias({ network: { allowPrivateNetwork: true } }),
    ).toBe(false);
  });

  it("migrateLegacyFlatAllowPrivateNetworkAlias 应该迁移到 network.dangerouslyAllowPrivateNetwork", () => {
    const changes: string[] = [];
    const result = migrateLegacyFlatAllowPrivateNetworkAlias({
      entry: { allowPrivateNetwork: true, name: "test" },
      pathPrefix: "channels.test",
      changes,
    });
    expect(result.changed).toBe(true);
    expect(result.entry.network?.dangerouslyAllowPrivateNetwork).toBe(true);
    expect(result.entry.allowPrivateNetwork).toBeUndefined();
    expect(changes.length).toBe(1);
    expect(changes[0]).toContain("allowPrivateNetwork");
    expect(changes[0]).toContain("dangerouslyAllowPrivateNetwork");
  });

  it("migrateLegacyFlatAllowPrivateNetworkAlias 无别名时不修改", () => {
    const changes: string[] = [];
    const result = migrateLegacyFlatAllowPrivateNetworkAlias({
      entry: { name: "test" },
      pathPrefix: "channels.test",
      changes,
    });
    expect(result.changed).toBe(false);
    expect(changes.length).toBe(0);
  });

  it("canonical dangerouslyAllowPrivateNetwork 优先于 legacy 别名", () => {
    const changes: string[] = [];
    const result = migrateLegacyFlatAllowPrivateNetworkAlias({
      entry: {
        allowPrivateNetwork: true,
        network: { dangerouslyAllowPrivateNetwork: false },
      },
      pathPrefix: "channels.test",
      changes,
    });
    expect(result.entry.network?.dangerouslyAllowPrivateNetwork).toBe(false);
  });
});
