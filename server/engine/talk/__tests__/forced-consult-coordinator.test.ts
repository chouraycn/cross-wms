// 强制咨询协调器测试，覆盖 prepare/schedule/recordNativeConsult/dedupe 逻辑。
import { describe, expect, it } from "vitest";
import { createRealtimeVoiceForcedConsultCoordinator } from "../forced-consult-coordinator.js";

describe("realtime voice forced consult coordinator", () => {
  it("prepares a forced consult handle and consumes it by matching question", () => {
    const coordinator = createRealtimeVoiceForcedConsultCoordinator({ now: () => 1000 });
    const handle = coordinator.prepare("what is the status?");
    expect(handle).toBeDefined();
    expect(handle?.question).toBe("what is the status?");

    const consumed = coordinator.consumePending("what is the status?");
    expect(consumed?.id).toBe(handle?.id);
    // After consuming, pending is cleared.
    expect(coordinator.consumePending("what is the status?")).toBeUndefined();
  });

  it("records a native consult that matches a pending forced consult", () => {
    const coordinator = createRealtimeVoiceForcedConsultCoordinator({ now: () => 1000 });
    coordinator.prepare("check inventory");

    const match = coordinator.recordNativeConsult({ question: "check inventory" }, "call-1");
    expect(match.kind).toBe("pending");
    if (match.kind === "pending") {
      expect(match.handle.question).toBe("check inventory");
    }
    expect(coordinator.nativeCallIds(match.kind === "pending" ? match.handle : undefined)).toContain("call-1");
  });

  it("records a native consult that has no matching forced consult", () => {
    const coordinator = createRealtimeVoiceForcedConsultCoordinator({ now: () => 1000 });
    const match = coordinator.recordNativeConsult({ question: "unrelated question" });
    expect(match.kind).toBe("none");
  });

  it("marks a handle as delivered and detects recent native consults", () => {
    const coordinator = createRealtimeVoiceForcedConsultCoordinator({ now: () => 1000 });
    const handle = coordinator.prepare("what changed");
    expect(handle).toBeDefined();
    if (!handle) return;

    coordinator.markDelivered(handle);
    expect(coordinator.hasRecent("what changed")).toBe(true);

    coordinator.recordNativeConsult({ question: "what changed" });
    expect(coordinator.hasRecentNativeConsult("what changed")).toBe(true);
  });

  it("cancels a pending handle and removes it from state", () => {
    const coordinator = createRealtimeVoiceForcedConsultCoordinator({ now: () => 1000 });
    const handle = coordinator.prepare("cancel me");
    expect(handle).toBeDefined();
    if (!handle) return;

    coordinator.markCancelled(handle);
    expect(coordinator.isCancelled(handle)).toBe(true);

    coordinator.remove(handle);
    expect(coordinator.handles().find((h) => h.id === handle.id)).toBeUndefined();
  });
});
