import { describe, it, expect } from "vitest";
import * as pairingModule from "../index.js";

describe("pairing/index.ts exports", () => {
  it("should export types", () => {
    expect(pairingModule).toBeDefined();
  });

  it("should export PairingCrypto class", () => {
    expect(pairingModule.PairingCrypto).toBeDefined();
    expect(typeof pairingModule.PairingCrypto).toBe("function");
  });

  it("should export pairingCrypto singleton", () => {
    expect(pairingModule.pairingCrypto).toBeDefined();
    expect(pairingModule.pairingCrypto).toBeInstanceOf(pairingModule.PairingCrypto);
  });

  it("should export PairingCodeGenerator class", () => {
    expect(pairingModule.PairingCodeGenerator).toBeDefined();
    expect(typeof pairingModule.PairingCodeGenerator).toBe("function");
  });

  it("should export pairingCodeGenerator singleton", () => {
    expect(pairingModule.pairingCodeGenerator).toBeDefined();
    expect(pairingModule.pairingCodeGenerator).toBeInstanceOf(pairingModule.PairingCodeGenerator);
  });

  it("should export generatePairingCode function", () => {
    expect(pairingModule.generatePairingCode).toBeDefined();
    expect(typeof pairingModule.generatePairingCode).toBe("function");
  });

  it("should export validatePairingCodeFormat function", () => {
    expect(pairingModule.validatePairingCodeFormat).toBeDefined();
    expect(typeof pairingModule.validatePairingCodeFormat).toBe("function");
  });

  it("should export PairingStore class", () => {
    expect(pairingModule.PairingStore).toBeDefined();
    expect(typeof pairingModule.PairingStore).toBe("function");
  });

  it("should export pairingStore singleton", () => {
    expect(pairingModule.pairingStore).toBeDefined();
    expect(pairingModule.pairingStore).toBeInstanceOf(pairingModule.PairingStore);
  });

  it("should export PairingSessionManager class", () => {
    expect(pairingModule.PairingSessionManager).toBeDefined();
    expect(typeof pairingModule.PairingSessionManager).toBe("function");
  });

  it("should export pairingSessionManager singleton", () => {
    expect(pairingModule.pairingSessionManager).toBeDefined();
    expect(pairingModule.pairingSessionManager).toBeInstanceOf(pairingModule.PairingSessionManager);
  });

  it("should export PairingProtocol class", () => {
    expect(pairingModule.PairingProtocol).toBeDefined();
    expect(typeof pairingModule.PairingProtocol).toBe("function");
  });

  it("should export PairingDiscovery class", () => {
    expect(pairingModule.PairingDiscovery).toBeDefined();
    expect(typeof pairingModule.PairingDiscovery).toBe("function");
  });

  it("should export ManualDiscoveryProvider class", () => {
    expect(pairingModule.ManualDiscoveryProvider).toBeDefined();
    expect(typeof pairingModule.ManualDiscoveryProvider).toBe("function");
  });

  it("should export pairingDiscovery singleton", () => {
    expect(pairingModule.pairingDiscovery).toBeDefined();
    expect(pairingModule.pairingDiscovery).toBeInstanceOf(pairingModule.PairingDiscovery);
  });

  it("should export PairingServer class", () => {
    expect(pairingModule.PairingServer).toBeDefined();
    expect(typeof pairingModule.PairingServer).toBe("function");
  });

  it("should export PairingClient class", () => {
    expect(pairingModule.PairingClient).toBeDefined();
    expect(typeof pairingModule.PairingClient).toBe("function");
  });

  it("should export PairingRuntime class", () => {
    expect(pairingModule.PairingRuntime).toBeDefined();
    expect(typeof pairingModule.PairingRuntime).toBe("function");
  });

  it("should export createPairingRuntime function", () => {
    expect(pairingModule.createPairingRuntime).toBeDefined();
    expect(typeof pairingModule.createPairingRuntime).toBe("function");
  });

  it("should export generateDeviceId function", () => {
    expect(pairingModule.generateDeviceId).toBeDefined();
    expect(typeof pairingModule.generateDeviceId).toBe("function");
  });

  it("should export createLocalDeviceInfo function", () => {
    expect(pairingModule.createLocalDeviceInfo).toBeDefined();
    expect(typeof pairingModule.createLocalDeviceInfo).toBe("function");
  });
});
