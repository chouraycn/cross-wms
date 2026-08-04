// Gateway cron lazy loader.
// Defers scheduler startup until cron is touched by runtime or API handlers.
import type { CliDeps } from "../cli/deps.types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { CronServiceContract } from "../cron/service-contract.js";
import { resolveCronStorePath } from "../cron/store.js";
import type { GatewayCronState } from "./server-cron.js";

type LazyGatewayCronParams = {
  cfg: OpenClawConfig;
  deps: CliDeps;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
};

type LoadedGatewayCronState = {
  state: GatewayCronState;
  started: boolean;
};

/** Creates a cron state proxy that imports the real cron service on first use. */
export function createLazyGatewayCronState(params: LazyGatewayCronParams): GatewayCronState {
  const storePath = resolveCronStorePath(params.cfg.cron?.store);
  const cronEnabled = process.env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;
  let loaded: LoadedGatewayCronState | null = null;
  let loading: Promise<LoadedGatewayCronState> | null = null;
  let stopped = false;

  const load = async (): Promise<LoadedGatewayCronState> => {
    if (loaded) {
      return loaded;
    }
    // Share the same import promise across concurrent API calls so only one
    // scheduler instance is built for a Gateway process.
    loading ??= import("./server-cron.js").then(({ buildGatewayCronService }) => {
      loaded = {
        state: buildGatewayCronService(params),
        started: false,
      };
      return loaded;
    });
    return await loading;
  };

  const cron: CronServiceContract = ({
    async start() {
      stopped = false;
      const resolved = await load();
      if (stopped) {
        return;
      }
      if (resolved.started) {
        return;
      }
      resolved.started = true;
      await (resolved.state.cron as any).start();
      // If stop raced the lazy import/start path, immediately stop the loaded
      // scheduler so shutdown does not leave a background loop alive.
      if (stopped && resolved.started) {
        resolved.started = false;
        (resolved.state.cron as any).stop();
      }
    },
    stop() {
      stopped = true;
      if (loaded) {
        loaded.started = false;
        (loaded.state.cron as any).stop();
        return;
      }
      if (loading) {
        // Stop may happen while the dynamic import is still in flight; attach a
        // cleanup continuation instead of forcing cron to load synchronously.
        void loading
          .then((resolved) => {
            if (!stopped) {
              return;
            }
            resolved.started = false;
            (resolved.state.cron as any).stop();
          })
          .catch(() => {});
      }
    },
    async status() {
      return await ((await load()).state.cron as any).status();
    },
    async list(opts) {
      return await ((await load()).state.cron as any).list(opts);
    },
    async listPage(opts) {
      return await ((await load()).state.cron as any).listPage(opts);
    },
    async add(input) {
      return await ((await load()).state.cron as any).add(input);
    },
    async update(id, patch) {
      return await ((await load()).state.cron as any).update(id, patch);
    },
    async remove(id) {
      return await ((await load()).state.cron as any).remove(id);
    },
    async run(id, mode) {
      return await ((await load()).state.cron as any).run(id, mode);
    },
    async enqueueRun(id, mode) {
      return await ((await load()).state.cron as any).enqueueRun(id, mode);
    },
    getJob(id) {
      if (!loaded) {
        return undefined;
      }
      return (loaded.state.cron as any).getJob(id);
    },
    async readJob(id) {
      return await ((await load()).state.cron as any).readJob(id);
    },
    getDefaultAgentId() {
      if (!loaded) {
        return undefined;
      }
      return (loaded.state.cron as any).getDefaultAgentId();
    },
    wake(opts) {
      if (!loaded) {
        // A wake should kick off lazy loading but cannot claim success before
        // cron exists and knows whether the target job is wakeable.
        void load();
        return { ok: false };
      }
      return (loaded.state.cron as any).wake(opts);
    },
  }) as any;

  return {
    cron,
    storePath,
    cronEnabled,
  };
}
