/**
 * Gateway Server Methods Registry
 * Gateway 服务方法注册中心
 */

import type { GatewayMethodContext, GatewayMethodHandler, GatewayMethodResult } from "./types.js";

class MethodRegistry {
  private readonly methods = new Map<string, GatewayMethodHandler>();

  register(method: string, handler: GatewayMethodHandler): void {
    this.methods.set(method, handler);
  }

  unregister(method: string): boolean {
    return this.methods.delete(method);
  }

  has(method: string): boolean {
    return this.methods.has(method);
  }

  get(method: string): GatewayMethodHandler | undefined {
    return this.methods.get(method);
  }

  listMethods(): string[] {
    return Array.from(this.methods.keys()).sort();
  }

  async invoke(
    method: string,
    params: unknown,
    context: GatewayMethodContext,
  ): Promise<GatewayMethodResult> {
    const handler = this.methods.get(method);
    if (!handler) {
      return {
        ok: false,
        error: {
          code: "METHOD_NOT_FOUND",
          message: `Method "${method}" not found`,
        },
      };
    }

    try {
      const result = await handler(params, context);
      return { ok: true, result };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: (error as Error)?.name ?? "INTERNAL_ERROR",
          message: (error as Error)?.message ?? "Internal server error",
        },
      };
    }
  }

  clear(): void {
    this.methods.clear();
  }
}

const METHOD_REGISTRY_INSTANCE = new MethodRegistry();

export function getMethodRegistry(): MethodRegistry {
  return METHOD_REGISTRY_INSTANCE;
}

export function registerGatewayMethod(
  method: string,
  handler: GatewayMethodHandler,
): void {
  METHOD_REGISTRY_INSTANCE.register(method, handler);
}

export function unregisterGatewayMethod(method: string): boolean {
  return METHOD_REGISTRY_INSTANCE.unregister(method);
}

export async function invokeGatewayMethod(
  method: string,
  params: unknown,
  context: GatewayMethodContext,
): Promise<GatewayMethodResult> {
  return await METHOD_REGISTRY_INSTANCE.invoke(method, params, context);
}
