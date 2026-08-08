// Register service command tests cover daemon service subcommand registration.
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addGatewayServiceCommands } from "./register-service-commands.js";

const runDaemonInstall = vi.fn(async (_opts: any) => {});
const runDaemonRestart = vi.fn(async (_opts: any) => {});
const runDaemonStart = vi.fn(async (_opts: any) => {});
const runDaemonStatus = vi.fn(async (_opts: any) => {});
const runDaemonStop = vi.fn(async (_opts: any) => {});
const runDaemonUninstall = vi.fn(async (_opts: any) => {});

vi.mock("./install.runtime.js", () => ({
  runDaemonInstall: (opts: any) => runDaemonInstall(opts),
}));

vi.mock("./status.runtime.js", () => ({
  runDaemonStatus: (opts: any) => runDaemonStatus(opts),
}));

vi.mock("./lifecycle.runtime.js", () => ({
  runDaemonRestart: (opts: any) => runDaemonRestart(opts),
  runDaemonStart: (opts: any) => runDaemonStart(opts),
  runDaemonStop: (opts: any) => runDaemonStop(opts),
  runDaemonUninstall: (opts: any) => runDaemonUninstall(opts),
}));

function createGatewayParentLikeCommand() {
  const gateway = new Command().name("gateway");
  // Mirror overlapping root gateway options that conflict with service subcommand options.
  gateway.option("--port <port>", "Port for the gateway WebSocket");
  gateway.option("--token <token>", "Gateway token");
  gateway.option("--password <password>", "Gateway password");
  gateway.option("--force", "Gateway run --force", false);
  addGatewayServiceCommands(gateway);
  return gateway;
}

function expectSingleDaemonCall(mockFn: ReturnType<typeof vi.fn>) {
  expect(mockFn).toHaveBeenCalledTimes(1);
  const opts = mockFn.mock.calls[0]?.[0] as Record<string, any> | undefined;
  if (opts === undefined) {
    throw new Error("expected daemon call options");
  }
  return opts;
}

describe("addGatewayServiceCommands", () => {
  beforeEach(() => {
    runDaemonInstall.mockClear();
    runDaemonRestart.mockClear();
    runDaemonStart.mockClear();
    runDaemonStatus.mockClear();
    runDaemonStop.mockClear();
    runDaemonUninstall.mockClear();
  });

  it.each([
    {
      name: "forwards install option collisions from parent gateway command",
      argv: ["install", "--force", "--port", "19000", "--token", "tok_test"],
      assert: () => {
        const opts = expectSingleDaemonCall(runDaemonInstall);
        expect(opts.force).toBe(true);
        expect(opts.port).toBe("19000");
        expect(opts.token).toBe("tok_test");
      },
    },
    {
      name: "forwards restart force and wait controls",
      argv: ["restart", "--wait", "30s"],
      assert: () => {
        const opts = expectSingleDaemonCall(runDaemonRestart);
        expect(opts.wait).toBe("30s");
      },
    },
    {
      name: "forwards restart safe control",
      argv: ["restart", "--safe"],
      assert: () => {
        const opts = expectSingleDaemonCall(runDaemonRestart);
        expect(opts.safe).toBe(true);
      },
    },
    {
      name: "forwards restart force control",
      argv: ["restart", "--force"],
      assert: () => {
        const opts = expectSingleDaemonCall(runDaemonRestart);
        expect(opts.force).toBe(true);
      },
    },
    {
      name: "forwards status auth collisions from parent gateway command",
      argv: ["status", "--token", "tok_status", "--password", "pw_status"],
      assert: () => {
        const opts = expectSingleDaemonCall(runDaemonStatus);
        const rpc = opts.rpc as { token?: any; password?: any } | undefined;
        expect(rpc?.token).toBe("tok_status");
        expect(rpc?.password).toBe("pw_status"); // pragma: allowlist secret
      },
    },
    {
      name: "forwards require-rpc for status",
      argv: ["status", "--require-rpc"],
      assert: () => {
        const opts = expectSingleDaemonCall(runDaemonStatus);
        expect(opts.requireRpc).toBe(true);
      },
    },
  ])("$name", async ({ argv, assert }) => {
    const gateway = createGatewayParentLikeCommand();
    await gateway.parseAsync(argv, { from: "user" });
    assert();
  });
});
