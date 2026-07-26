// Concurrency wrapper for media-understanding tasks that keeps successful
// outputs while verbose-logging per-provider failures.
// Ported from openclaw/src/media-understanding/concurrency.ts.
//
// Dependency adjustments:
//   - ../globals.js logVerbose, shouldLogVerbose
//     → ../media/_openclaw-media-stubs.js (cross-wms keeps the openclaw
//       logVerbose / shouldLogVerbose adapters in the media stub barrel)
//   - ../utils/run-with-concurrency.js runTasksWithConcurrency
//     → cross-wms exposes the helper at ../infra/run-with-concurrency.js
import { logVerbose, shouldLogVerbose } from "../media/_openclaw-media-stubs.js";
import { runTasksWithConcurrency } from "../infra/run-with-concurrency.js";

/** Runs media tasks under a fixed concurrency limit while preserving successful results. */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const { results } = await runTasksWithConcurrency({
    tasks,
    limit,
    // Media understanding tries every eligible entry; verbose mode keeps per-entry failures visible.
    onTaskError(err) {
      if (shouldLogVerbose()) {
        logVerbose(`Media understanding task failed: ${String(err)}`);
      }
    },
  });
  return results;
}
