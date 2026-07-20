/**
 * 移植自 openclaw/src/agents/provider-local-service.ts
 *
 * cross-wms 降级实现：本地模型提供方服务管理的简化版本。
 * 不依赖 child_process 树管理、子系统日志等完整 OpenClaw 基础设施。
 * 提供 Symbol-based 元数据附加和基础进程退出检测。
 */

const MODEL_PROVIDER_LOCAL_SERVICE_SYMBOL = Symbol.for("openclaw.modelProviderLocalService");

type ModelWithProviderLocalService = {
  [MODEL_PROVIDER_LOCAL_SERVICE_SYMBOL]?: Record<string, unknown>;
};

export type ProviderLocalServiceLease = {
  release: () => void;
};

export function attachModelProviderLocalService<TModel extends object>(
  model: TModel,
  service: Record<string, unknown> | undefined,
): TModel {
  if (!service) {
    return model;
  }
  const next = { ...model } as TModel & ModelWithProviderLocalService;
  next[MODEL_PROVIDER_LOCAL_SERVICE_SYMBOL] = service;
  return next;
}

export function getModelProviderLocalService(
  model: object,
): Record<string, unknown> | undefined {
  return (model as ModelWithProviderLocalService)[MODEL_PROVIDER_LOCAL_SERVICE_SYMBOL];
}

export async function ensureModelProviderLocalService(
  model: { provider: string; baseUrl?: string },
  probeHeaders?: HeadersInit,
  signal?: AbortSignal | null,
): Promise<ProviderLocalServiceLease | undefined> {
  const service = getModelProviderLocalService(model);
  if (!service) {
    return undefined;
  }

  // In cross-wms, we provide a simplified lease that does no actual process management.
  // The lease simply tracks that the service was requested and provides a no-op release.
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
    },
  };
}

export function stopManagedProviderLocalServicesForTest(): void {
  // No managed services in cross-wms
}

export function hasLocalServiceProcessExited(
  child: { exitCode: number | null; signalCode: string | null },
): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}
