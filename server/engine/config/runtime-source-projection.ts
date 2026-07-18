// 移植自 openclaw/src/config/runtime-source-projection.ts
// 将运行时派生的配置投射回当前编写的源快照。
//
// 依赖说明：源文件依赖 ./types.js 的 OpenClawConfig 类型。cross-wms 该类型位于
// ./types/openclaw.js，此处调整导入路径。其余依赖（./io.write-prepare.js、
// ./merge-patch.js、./runtime-snapshot.js）均已就绪。

import { createMergePatch, projectSourceOntoRuntimeShape } from "./io.write-prepare.js";
import { applyMergePatch } from "./merge-patch.js";
import { getRuntimeConfigSnapshot, getRuntimeConfigSourceSnapshot } from "./runtime-snapshot.js";
import type { OpenClawConfig } from "./types/openclaw.js";

function isCompatibleTopLevelRuntimeProjectionShape(params: {
  runtimeSnapshot: OpenClawConfig;
  candidate: OpenClawConfig;
}): boolean {
  const runtime = params.runtimeSnapshot as Record<string, unknown>;
  const candidate = params.candidate as Record<string, unknown>;
  for (const key of Object.keys(runtime)) {
    if (!Object.hasOwn(candidate, key)) {
      return false;
    }
    const runtimeValue = runtime[key];
    const candidateValue = candidate[key];
    const runtimeType = Array.isArray(runtimeValue)
      ? "array"
      : runtimeValue === null
        ? "null"
        : typeof runtimeValue;
    const candidateType = Array.isArray(candidateValue)
      ? "array"
      : candidateValue === null
        ? "null"
        : typeof candidateValue;
    if (runtimeType !== candidateType) {
      return false;
    }
  }
  return true;
}

/** Projects a runtime-derived config back onto the active authored source snapshot. */
export function projectConfigOntoRuntimeSourceSnapshot(config: OpenClawConfig): OpenClawConfig {
  const runtimeConfigSnapshot = getRuntimeConfigSnapshot();
  const runtimeConfigSourceSnapshot = getRuntimeConfigSourceSnapshot();
  if (!runtimeConfigSnapshot || !runtimeConfigSourceSnapshot) {
    return config;
  }
  if (config === runtimeConfigSnapshot) {
    return runtimeConfigSourceSnapshot;
  }
  if (
    !isCompatibleTopLevelRuntimeProjectionShape({
      runtimeSnapshot: runtimeConfigSnapshot,
      candidate: config,
    })
  ) {
    return config;
  }
  const projectedSource = projectSourceOntoRuntimeShape(
    runtimeConfigSourceSnapshot,
    runtimeConfigSnapshot,
  ) as OpenClawConfig;
  const runtimePatch = createMergePatch(runtimeConfigSnapshot, config);
  return applyMergePatch(projectedSource, runtimePatch) as OpenClawConfig;
}
