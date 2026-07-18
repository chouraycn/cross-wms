// 移植自 openclaw/src/config/normalize-exec-safe-bin.ts
// 在物化配置被消费前，对 exec safe-bin 策略进行配置规范化。
// 仅限于持久化的全局/每 agent 配置形态；运行时信任决策位于 infra。
//
// 降级说明：源文件依赖 ../infra/exec-safe-bin-policy.js 的
// normalizeSafeBinProfileFixtures 与 ../infra/exec-safe-bin-trust.js 的
// normalizeTrustedSafeBinDirs。cross-wms 暂缺这些 infra 模块，
// 此处降级为透传实现（不做实际规范化）。
import type { OpenClawConfig } from './types/openclaw.js';

/** 降级 stub：原样返回 profiles，不做规范化。 */
function normalizeSafeBinProfileFixtures<T>(profiles: T): T {
  return profiles;
}

/** 降级 stub：原样返回 trusted dirs，不做规范化。 */
function normalizeTrustedSafeBinDirs(dirs: string[] | undefined): string[] {
  return Array.isArray(dirs) ? dirs : [];
}

/** 规范化全局和每 agent 配置作用域中的 exec safe-bin profiles 与 trusted dirs。 */
export function normalizeExecSafeBinProfilesInConfig(cfg: OpenClawConfig): void {
  const normalizeExec = (exec: unknown) => {
    if (!exec || typeof exec !== 'object' || Array.isArray(exec)) {
      return;
    }
    const typedExec = exec as {
      safeBinProfiles?: Record<string, unknown>;
      safeBinTrustedDirs?: string[];
    };
    const normalizedProfiles = normalizeSafeBinProfileFixtures(
      typedExec.safeBinProfiles as Record<
        string,
        {
          minPositional?: number;
          maxPositional?: number;
          allowedValueFlags?: readonly string[];
          deniedFlags?: readonly string[];
        }
      >,
    );
    typedExec.safeBinProfiles =
      Object.keys(normalizedProfiles).length > 0 ? normalizedProfiles : undefined;
    const normalizedTrustedDirs = normalizeTrustedSafeBinDirs(typedExec.safeBinTrustedDirs);
    typedExec.safeBinTrustedDirs =
      normalizedTrustedDirs.length > 0 ? normalizedTrustedDirs : undefined;
  };

  // Safe-bin 配置可全局设置或每 agent 覆盖；规范两个持久化作用域。
  normalizeExec(cfg.tools?.exec);
  const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  for (const agent of agents) {
    normalizeExec(agent?.tools?.exec);
  }
}
