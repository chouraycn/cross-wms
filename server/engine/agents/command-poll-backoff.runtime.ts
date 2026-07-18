/**
 * Runtime seam for command poll backoff cleanup.
 *
 * 降级说明：无外部依赖降级，仅重新导出 `./command-poll-backoff.js` 的实现。
 */
import { pruneStaleCommandPolls as pruneStaleCommandPollsImpl } from "./command-poll-backoff.js";

type PruneStaleCommandPolls = typeof import("./command-poll-backoff.js").pruneStaleCommandPolls;

/** Prune stale command polls using the production backoff implementation. */
export function pruneStaleCommandPolls(
  ...args: Parameters<PruneStaleCommandPolls>
): ReturnType<PruneStaleCommandPolls> {
  return pruneStaleCommandPollsImpl(...args);
}
