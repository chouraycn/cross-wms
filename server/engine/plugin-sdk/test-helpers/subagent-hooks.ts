// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Test helper preserves plugin-specific hook API type.
export function registerHookHandlersForTest<TApi>(params: {
  config: Record<string, any>;
  register: (api: TApi) => void;
}) {
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const api = {
    config: params.config,
    on: (hookName: string, handler: (event: any, ctx: any) => unknown) => {
      handlers.set(hookName, handler);
    },
  } as TApi;
  params.register(api);
  return handlers;
}

export function getRequiredHookHandler(
  handlers: Map<string, (event: any, ctx: any) => unknown>,
  hookName: string,
): (event: any, ctx: any) => unknown {
  const handler = handlers.get(hookName);
  if (!handler) {
    throw new Error(`expected ${hookName} hook handler`);
  }
  return handler;
}
