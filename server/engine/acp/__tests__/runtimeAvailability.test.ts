import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { isAcpRuntimeSpawnAvailable } from "../runtimeAvailability.js";
import { getAcpRuntimeBackend } from "../runtimeRegistry.js";

vi.mock("../runtimeRegistry.js", () => ({
  getAcpRuntimeBackend: vi.fn(),
}));

describe("RuntimeAvailability", () => {
  describe("isAcpRuntimeSpawnAvailable", () => {
    it("should return false when sandboxed", () => {
      expect(isAcpRuntimeSpawnAvailable({ sandboxed: true })).toBe(false);
    });

    it("should return false when ACP is disabled by policy", () => {
      expect(isAcpRuntimeSpawnAvailable({ config: { acp: { enabled: false } } })).toBe(false);
    });

    it("should return false when no backend found", () => {
      (getAcpRuntimeBackend as Mock).mockReturnValue(undefined);
      expect(isAcpRuntimeSpawnAvailable({ config: { acp: { enabled: true } } })).toBe(false);
    });

    it("should return true when backend is healthy", () => {
      (getAcpRuntimeBackend as Mock).mockReturnValue({ healthy: () => true });
      expect(isAcpRuntimeSpawnAvailable({ config: { acp: { enabled: true } } })).toBe(true);
    });

    it("should return false when backend health check fails", () => {
      (getAcpRuntimeBackend as Mock).mockReturnValue({ healthy: () => false });
      expect(isAcpRuntimeSpawnAvailable({ config: { acp: { enabled: true } } })).toBe(false);
    });

    it("should return false when backend health check throws", () => {
      (getAcpRuntimeBackend as Mock).mockReturnValue({ healthy: () => { throw new Error("fail"); } });
      expect(isAcpRuntimeSpawnAvailable({ config: { acp: { enabled: true } } })).toBe(false);
    });

    it("should use backendId when provided", () => {
      (getAcpRuntimeBackend as Mock).mockReturnValue({ healthy: () => true });
      isAcpRuntimeSpawnAvailable({ config: { acp: { enabled: true } }, backendId: "test-backend" });
      expect(getAcpRuntimeBackend).toHaveBeenCalledWith("test-backend");
    });
  });
});