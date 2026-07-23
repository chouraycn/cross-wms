import { describe, expect, it } from "vitest";
import { getReplyFromConfig } from "../heartbeat-runner.runtime.js";

describe("getReplyFromConfig (降级 stub)", () => {
  it("应该抛出 not implemented 错误", async () => {
    await expect(getReplyFromConfig({}, {}, {})).rejects.toThrow(
      "getReplyFromConfig stub",
    );
  });

  it("错误信息应包含未移植的模块说明", async () => {
    await expect(getReplyFromConfig({}, {}, {})).rejects.toThrow(
      "auto-reply/reply.js missing",
    );
  });
});
