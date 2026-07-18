// 主机环境安全策略声明与加载器。
// 加载生成的 host-env-security-policy.json 并将其规范化为不可变查找数组。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// 降级：tsconfig module 非 esnext，不支持 import attributes，改用 readFileSync
// __filename 在 CommonJS 模块中是全局变量，由 @types/node 提供
const HOST_ENV_SECURITY_POLICY_JSON = JSON.parse(
  readFileSync(join(dirname(__filename), "host-env-security-policy.json"), "utf-8"),
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
