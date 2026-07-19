// 主机环境安全策略声明与加载器。
// 加载生成的 host-env-security-policy.json 并将其规范化为不可变查找数组。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// 降级：tsconfig module 非 esnext，不支持 import attributes，改用 readFileSync
// 兼容 ESM 和 CJS：通过 eval 在 CJS 全局拿到 __filename；ESM 下使用 import.meta.url
// 使用 eval('...') 规避 TS 的 import.meta 静态检查，并允许在 CJS 模式下取到 __filename
const __filename_here: string = (() => {
  try {
    // CJS 环境下 __filename 为全局变量
    // eslint-disable-next-line no-eval
    const fn = eval("typeof __filename !== 'undefined' ? __filename : null");
    if (fn) return fn;
  } catch {
    // ignore
  }
  // ESM 环境：动态使用 import.meta.url（用 require 避免 ts 错误）
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { fileURLToPath } = require("node:url") as typeof import("node:url");
    // @ts-expect-error - import.meta 在 ESM 下存在，CJS 下不会执行到此分支
    return fileURLToPath(import.meta.url);
  } catch {
    // 兜底：使用 process.cwd()
    return process.cwd();
  }
})();

const HOST_ENV_SECURITY_POLICY_JSON = JSON.parse(
  readFileSync(join(dirname(__filename_here), "host-env-security-policy.json"), "utf-8"),
) as RawHostEnvSecurityPolicy;

/** 主机环境安全策略类型 */
export type HostEnvSecurityPolicy = Readonly<{
  blockedEverywhereKeys: readonly string[];
  blockedOverrideOnlyKeys: readonly string[];
  allowedInheritedOverrideOnlyKeys: readonly string[];
  blockedInheritedKeys: readonly string[];
  blockedInheritedPrefixes: readonly string[];
  blockedPrefixes: readonly string[];
  blockedOverridePrefixes: readonly string[];
  blockedKeys: readonly string[];
  blockedOverrideKeys: readonly string[];
}>;

type RawHostEnvSecurityPolicy = {
  blockedEverywhereKeys?: readonly string[];
  blockedOverrideOnlyKeys?: readonly string[];
  allowedInheritedOverrideOnlyKeys?: readonly string[];
  blockedPrefixes?: readonly string[];
  blockedOverridePrefixes?: readonly string[];
  blockedInheritedPrefixes?: readonly string[];
};

function sortUniqueUppercase(values: readonly string[]): readonly string[] {
  return Object.freeze(
    Array.from(new Set(values.map((value) => value.toUpperCase()))).toSorted((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function derivePolicyArrays(policy: RawHostEnvSecurityPolicy) {
  const blockedEverywhereKeys = policy.blockedEverywhereKeys ?? [];
  const blockedOverrideOnlyKeys = policy.blockedOverrideOnlyKeys ?? [];
  const allowedInheritedOverrideOnlyKeys = policy.allowedInheritedOverrideOnlyKeys ?? [];
  const allowedInheritedOverrideOnlyUpper = new Set(
    allowedInheritedOverrideOnlyKeys.map((value) => value.toUpperCase()),
  );
  const blockedPrefixes = policy.blockedPrefixes ?? [];
  const blockedOverridePrefixes = policy.blockedOverridePrefixes ?? [];
  const blockedInheritedPrefixes = policy.blockedInheritedPrefixes ?? blockedPrefixes;

  return {
    blockedInheritedKeys: sortUniqueUppercase([
      ...blockedEverywhereKeys,
      ...blockedOverrideOnlyKeys.filter(
        (value) => !allowedInheritedOverrideOnlyUpper.has(value.toUpperCase()),
      ),
    ]),
    blockedInheritedPrefixes: sortUniqueUppercase(blockedInheritedPrefixes),
    blockedKeys: sortUniqueUppercase(blockedEverywhereKeys),
    blockedOverrideKeys: sortUniqueUppercase(blockedOverrideOnlyKeys),
    blockedPrefixes: sortUniqueUppercase(blockedPrefixes),
    blockedOverridePrefixes: sortUniqueUppercase(blockedOverridePrefixes),
  };
}

/** 将原始主机环境策略 JSON 规范化为不可变查找数组。 */
export function loadHostEnvSecurityPolicy(
  rawPolicy: RawHostEnvSecurityPolicy = HOST_ENV_SECURITY_POLICY_JSON,
): HostEnvSecurityPolicy {
  const derived = derivePolicyArrays(rawPolicy);
  return Object.freeze({
    blockedEverywhereKeys: Object.freeze(rawPolicy.blockedEverywhereKeys ?? []),
    blockedOverrideOnlyKeys: Object.freeze(rawPolicy.blockedOverrideOnlyKeys ?? []),
    allowedInheritedOverrideOnlyKeys: Object.freeze(
      rawPolicy.allowedInheritedOverrideOnlyKeys ?? [],
    ),
    blockedInheritedKeys: derived.blockedInheritedKeys,
    blockedInheritedPrefixes: derived.blockedInheritedPrefixes,
    blockedPrefixes: derived.blockedPrefixes,
    blockedOverridePrefixes: derived.blockedOverridePrefixes,
    blockedKeys: derived.blockedKeys,
    blockedOverrideKeys: derived.blockedOverrideKeys,
  });
}

/** 从生成的 JSON 派生的进程级主机环境安全策略。 */
export const HOST_ENV_SECURITY_POLICY: HostEnvSecurityPolicy = loadHostEnvSecurityPolicy();
