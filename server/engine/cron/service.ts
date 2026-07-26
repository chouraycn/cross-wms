/** Stateful CronService facade around the locked service operation helpers. */
import type { CronServiceContract } from "./service-contract.js";
import * as ops from "./service/ops.js";
import type {
  CronServiceState,
  CronRunResult,
  CronListOptions,
  CronServiceOptions,
} from "./service/ops.js";
import type { CronJob, CronJobCreate, CronJobPatch } from "./types.js";

export type { CronEvent, CronServiceOptions } from "./service/ops.js";

/** Public cron service facade that owns mutable scheduler state and delegates to ops. */
export class CronService {
  private readonly state: CronServiceState;

  constructor(options?: CronServiceOptions) {
    this.state = ops.createCronServiceState(options);
  }

  async start() {
    await ops.start(this.state);
  }

  stop() {
    ops.stop(this.state);
  }

  async status() {
    return await ops.status(this.state);
  }

  async list(opts?: { includeDisabled?: boolean }) {
    return await ops.list(this.state, opts);
  }

  async listPage(opts?: CronListOptions) {
    return await ops.listPage(this.state, opts);
  }

  async add(input: CronJobCreate) {
    return await ops.add(this.state, input);
  }

  async update(id: string, patch: CronJobPatch) {
    return await ops.update(this.state, id, patch);
  }

  async remove(id: string) {
    return await ops.remove(this.state, id);
  }

  async run(id: string, mode?: "due" | "force"): Promise<CronRunResult> {
    return await ops.run(this.state, id, mode);
  }

  async enqueueRun(id: string, mode?: "due" | "force"): Promise<CronRunResult> {
    return await ops.run(this.state, id, mode);
  }

  getJob(id: string): CronJob | undefined {
    return this.state.jobs.find((job) => job.id === id);
  }

  async readJob(id: string): Promise<CronJob | undefined> {
    return await ops.readJob(this.state, id);
  }

  getDefaultAgentId(): string | undefined {
    return undefined;
  }

  wake(opts: { mode: string; text: string; sessionKey?: string; agentId?: string }) {
    return undefined;
  }

  getStats() {
    return ops.getStats(this.state);
  }

  refreshSchedules() {
    return ops.refreshSchedules(this.state);
  }

  getDueJobs(nowMs?: number) {
    return ops.getDueJobs(this.state, nowMs);
  }

  markRunComplete(
    id: string,
    runId: string,
    result: { status: "ok" | "error" | "skipped"; error?: string; summary?: string },
  ) {
    return ops.markRunComplete(this.state, id, runId, result);
  }
}
