// 用于修改待处理配对请求状态的共享辅助函数。
type PendingState<TPending> = {
  pendingById: Record<string, TPending>;
};

/** 拒绝一个待处理的配对请求并返回调用者选择的 id 字段。 */
export async function rejectPendingPairingRequest<
  TPending,
  TState extends PendingState<TPending>,
  TIdKey extends string,
>(params: {
  requestId: string;
  idKey: TIdKey;
  loadState: () => Promise<TState>;
  persistState: (state: TState) => Promise<void>;
  getId: (pending: TPending) => string;
}): Promise<({ requestId: string } & Record<TIdKey, string>) | null> {
  const state = await params.loadState();
  const pending = state.pendingById[params.requestId];
  if (!pending) {
    return null;
  }
  delete state.pendingById[params.requestId];
  await params.persistState(state);
  return {
    requestId: params.requestId,
    [params.idKey]: params.getId(pending),
  } as { requestId: string } & Record<TIdKey, string>;
}
