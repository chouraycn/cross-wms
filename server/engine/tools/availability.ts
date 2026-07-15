/**
 * 工具可用性评估器 — 参考 OpenClaw tools/availability.ts
 *
 * 将描述符中的可用性信号转换为诊断信息。
 * 评估器不了解具体工具的所有者，只关心信号匹配。
 */

import type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ToolAvailabilityContext,
  ToolAvailabilityDiagnostic,
  ToolAvailabilityExpression,
  ToolAvailabilitySignal,
} from './types.js';

/** 检查是否为 JSON 对象 */
function isRecord(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 沿路径解析配置值 */
function resolveConfigPath(
  config: JsonObject | undefined,
  path: readonly string[],
): JsonValue | undefined {
  let current: JsonValue | undefined = config;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** 检查配置值是否存在 */
function hasConfiguredValue(params: {
  value: JsonValue | undefined;
  signal: Extract<ToolAvailabilitySignal, { readonly kind: 'config' }>;
  context: ToolAvailabilityContext;
}): boolean {
  const { value, signal } = params;
  if (value === undefined || value === null) return false;

  if ((signal.check ?? 'exists') === 'available') {
    return params.context.isConfigValueAvailable?.({ value, path: signal.path, signal }) === true;
  }
  if ((signal.check ?? 'exists') === 'exists') return true;
  // non-empty 检查
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** 创建诊断信息 */
function diagnostic(
  reason: ToolAvailabilityDiagnostic['reason'],
  signal: ToolAvailabilitySignal,
  message: string,
): ToolAvailabilityDiagnostic {
  return { reason, signal, message };
}

/** 评估单个信号 */
function* evaluateSignal(
  signal: ToolAvailabilitySignal,
  context: ToolAvailabilityContext,
): Generator<ToolAvailabilityDiagnostic> {
  switch (signal.kind) {
    case 'always':
      // 始终可用，不生成诊断
      return;

    case 'auth': {
      if (!context.authProviderIds?.has(signal.providerId)) {
        yield diagnostic(
          'auth-missing',
          signal,
          `缺少认证: ${signal.providerId}`,
        );
      }
      return;
    }

    case 'config': {
      const value = resolveConfigPath(context.config, signal.path);
      if (!hasConfiguredValue({ value, signal, context })) {
        const pathStr = signal.path.join('.');
        yield diagnostic(
          'config-missing',
          signal,
          `配置缺失: ${pathStr}`,
        );
      }
      return;
    }

    case 'env': {
      if (!context.env?.[signal.name]) {
        yield diagnostic(
          'env-missing',
          signal,
          `环境变量缺失: ${signal.name}`,
        );
      }
      return;
    }

    case 'plugin-enabled': {
      if (!context.enabledPluginIds?.has(signal.pluginId)) {
        yield diagnostic(
          'plugin-disabled',
          signal,
          `插件未启用: ${signal.pluginId}`,
        );
      }
      return;
    }

    case 'context': {
      const actual = context.values?.[signal.key];
      if (signal.equals !== undefined) {
        if (actual !== signal.equals) {
          yield diagnostic(
            'context-mismatch',
            signal,
            `上下文不匹配: ${signal.key} 期望=${String(signal.equals)} 实际=${String(actual)}`,
          );
        }
      } else if (actual === undefined) {
        yield diagnostic(
          'context-mismatch',
          signal,
          `上下文值缺失: ${signal.key}`,
        );
      }
      return;
    }

    default: {
      yield diagnostic(
        'unsupported-signal',
        signal as ToolAvailabilitySignal,
        `不支持的信号类型: ${(signal as { kind: string }).kind}`,
      );
    }
  }
}

/** 评估可用性表达式 */
export function* evaluateToolAvailability(params: {
  descriptor: { availability?: ToolAvailabilityExpression; name: string };
  context: ToolAvailabilityContext;
}): Generator<ToolAvailabilityDiagnostic> {
  const { descriptor, context } = params;
  if (!descriptor.availability) return;

  yield* evaluateExpression(descriptor.availability, context);
}

/** 评估布尔表达式 */
function* evaluateExpression(
  expr: ToolAvailabilityExpression,
  context: ToolAvailabilityContext,
): Generator<ToolAvailabilityDiagnostic> {
  if ('kind' in expr) {
    yield* evaluateSignal(expr, context);
    return;
  }

  if ('allOf' in expr) {
    for (const sub of expr.allOf) {
      yield* evaluateExpression(sub, context);
    }
    return;
  }

  if ('anyOf' in expr) {
    // anyOf: 只要有一个通过即可
    const diagnostics: ToolAvailabilityDiagnostic[] = [];
    for (const sub of expr.anyOf) {
      const subDiags = Array.from(evaluateExpression(sub, context));
      if (subDiags.length === 0) return; // 有一个通过，不生成诊断
      diagnostics.push(...subDiags);
    }
    // 所有分支都失败，输出第一个诊断
    if (diagnostics.length > 0 && expr.anyOf.length > 0) {
      yield diagnostics[0];
    }
    return;
  }
}
