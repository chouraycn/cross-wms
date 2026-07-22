import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import JSZip from "jszip";
import {
  createPackage,
  extractPackage,
  signPackage,
  verifyPackage,
  publishPackage,
  downloadPackage,
  listPackages,
  getPackageInfo,
  type SkillPackage,
  type PackageManifest,
} from "../lifecycle/skill-packager.js";

describe("skill-packager", () => {
  let tmpDir: string;
  let skillDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-packager-test-"));
    skillDir = path.join(tmpDir, "test-skill");

    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: Test Skill
description: A test skill for packaging
version: 1.0.0
emoji: 🧪
---

# Test Skill

This is a test skill.
`,
      "utf-8",
    );

    await fs.writeFile(path.join(skillDir, "README.md"), "# Test Skill\n\nThis is a readme.", "utf-8");

    await fs.mkdir(path.join(skillDir, "subdir"), { recursive: true });
    await fs.writeFile(path.join(skillDir, "subdir", "nested.txt"), "nested content", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("createPackage", () => {
    it("should create a skill package with correct manifest", async () => {
      const packagePath = await createPackage(skillDir);

      expect(packagePath).toBeDefined();
      expect(packagePath.endsWith(".skill.zip")).toBe(true);

      const stat = await fs.stat(packagePath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    });

    it("should include SKILL.md in package files", async () => {
      const packagePath = await createPackage(skillDir);
      const extractDir = path.join(tmpDir, "extract");
      const manifest = await extractPackage(packagePath, extractDir);

      expect(manifest.package.files).toContain("SKILL.md");
      expect(manifest.package.files).toContain("README.md");
      expect(manifest.package.files).toContain("subdir/nested.txt");
    });

    it("should extract skill metadata from SKILL.md", async () => {
      const packagePath = await createPackage(skillDir);
      const extractDir = path.join(tmpDir, "extract");
      const manifest = await extractPackage(packagePath, extractDir);

      expect(manifest.package.name).toBe("Test Skill");
      expect(manifest.package.id).toBe("test-skill");
      expect(manifest.package.version).toBe("1.0.0");
      expect(manifest.package.description).toBe("A test skill for packaging");
    });

    it("should accept override options", async () => {
      const packagePath = await createPackage(skillDir, {
        version: "2.0.0",
        description: "Overridden description",
        dependencies: { "other-skill": "^1.0.0" },
        metadata: { author: "test-author" },
      });

      const extractDir = path.join(tmpDir, "extract");
      const manifest = await extractPackage(packagePath, extractDir);

      expect(manifest.package.version).toBe("2.0.0");
      expect(manifest.package.description).toBe("Overridden description");
      expect(manifest.package.dependencies).toEqual({ "other-skill": "^1.0.0" });
      expect(manifest.package.metadata).toEqual({ author: "test-author" });
    });

    it("should handle missing SKILL.md gracefully", async () => {
      await fs.rm(path.join(skillDir, "SKILL.md"));

      const packagePath = await createPackage(skillDir);
      const extractDir = path.join(tmpDir, "extract");
      const manifest = await extractPackage(packagePath, extractDir);

      expect(manifest.package.name).toBe("test-skill");
      expect(manifest.package.version).toBe("1.0.0");
    });

    it("should throw error for non-existent directory", async () => {
      await expect(createPackage(path.join(tmpDir, "non-existent"))).rejects.toThrow();
    });
  });

  describe("extractPackage", () => {
    it("should extract package contents to target directory", async () => {
      const packagePath = await createPackage(skillDir);
      const extractDir = path.join(tmpDir, "extract");

      const manifest = await extractPackage(packagePath, extractDir);

      const skillMdPath = path.join(extractDir, "SKILL.md");
      const readmePath = path.join(extractDir, "README.md");
      const nestedPath = path.join(extractDir, "subdir", "nested.txt");

      expect(await fs.stat(skillMdPath)).toBeDefined();
      expect(await fs.stat(readmePath)).toBeDefined();
      expect(await fs.stat(nestedPath)).toBeDefined();
    });

    it("should verify sha256 checksum during extraction", async () => {
      const packagePath = await createPackage(skillDir);
      const extractDir = path.join(tmpDir, "extract");

      const manifest = await extractPackage(packagePath, extractDir);
      expect(manifest.sha256).toBeDefined();
    });

    it("should throw error for non-existent package", async () => {
      await expect(extractPackage(path.join(tmpDir, "non-existent.skill.zip"), tmpDir)).rejects.toThrow();
    });

    it("should throw error for tampered package (checksum mismatch)", async () => {
      const packagePath = await createPackage(skillDir);

      const extractDir = path.join(tmpDir, "tampered");
      const manifest = await extractPackage(packagePath, extractDir);

      await fs.writeFile(path.join(extractDir, "SKILL.md"), "tampered content", "utf-8");

      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("SKILL.md", "tampered content");
      zip.file("README.md", await fs.readFile(path.join(extractDir, "README.md")));
      zip.file("subdir/nested.txt", await fs.readFile(path.join(extractDir, "subdir/nested.txt")));

      const tamperedPath = path.join(tmpDir, "tampered.skill.zip");
      const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      await fs.writeFile(tamperedPath, buffer);

      await expect(extractPackage(tamperedPath, path.join(tmpDir, "extract-tampered"))).rejects.toThrow(
        "Checksum mismatch",
      );
    });
  });

  describe("signPackage and verifyPackage", () => {
    let packagePath: string;
    let privateKey: string;
    let publicKey: string;

    beforeEach(async () => {
      packagePath = await createPackage(skillDir);

      const { privateKey: key, publicKey: pubKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      privateKey = key;
      publicKey = pubKey;
    });

    it("should sign a package", async () => {
      const manifest = await signPackage(packagePath, privateKey);

      expect(manifest.signature).toBeDefined();
      expect(manifest.signature?.algorithm).toBe("RSA-SHA256");
      expect(manifest.signature?.signature).toBeDefined();
      expect(manifest.signature?.timestamp).toBeDefined();
    });

    it("should verify a signed package with embedded public key", async () => {
      await signPackage(packagePath, privateKey);

      const result = await verifyPackage(packagePath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should verify a signed package with provided public key", async () => {
      await signPackage(packagePath, privateKey);

      const result = await verifyPackage(packagePath, publicKey);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject unsigned package", async () => {
      const result = await verifyPackage(packagePath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Package has no signature");
    });

    it("should reject package with tampered manifest content", async () => {
      await signPackage(packagePath, privateKey);

      const extractDir = path.join(tmpDir, "tampered");
      const manifest = await extractPackage(packagePath, extractDir);

      manifest.package.name = "Tampered Skill";

      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("SKILL.md", await fs.readFile(path.join(extractDir, "SKILL.md")));
      zip.file("README.md", await fs.readFile(path.join(extractDir, "README.md")));
      zip.file("subdir/nested.txt", await fs.readFile(path.join(extractDir, "subdir/nested.txt")));

      const tamperedPath = path.join(tmpDir, "tampered.skill.zip");
      const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      await fs.writeFile(tamperedPath, buffer);

      const result = await verifyPackage(tamperedPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Signature verification failed");
    });
  });

  describe("publishPackage", () => {
    it("should return success false for non-existent package", async () => {
      const result = await publishPackage(
        path.join(tmpDir, "non-existent.skill.zip"),
        "https://mock-registry.com",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle network errors gracefully", async () => {
      const packagePath = await createPackage(skillDir);

      const result = await publishPackage(packagePath, "https://non-existent-registry.invalid");

      expect(result.success).toBe(false);
    });
  });

  describe("downloadPackage", () => {
    it("should return success false for non-existent package", async () => {
      const result = await downloadPackage(
        "non-existent",
        "1.0.0",
        "https://mock-registry.com",
        path.join(tmpDir, "downloaded.skill.zip"),
      );

      expect(result.success).toBe(false);
    });

    it("should handle network errors gracefully", async () => {
      const result = await downloadPackage(
        "test-skill",
        "1.0.0",
        "https://non-existent-registry.invalid",
        path.join(tmpDir, "downloaded.skill.zip"),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("listPackages", () => {
    it("should handle network errors gracefully", async () => {
      const result = await listPackages("https://non-existent-registry.invalid");

      expect(result.packages).toEqual([]);
      expect(result.error).toBeDefined();
    });
  });

  describe("getPackageInfo", () => {
    it("should handle network errors gracefully", async () => {
      const result = await getPackageInfo("test-skill", "https://non-existent-registry.invalid");

      expect(result.manifest).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });
});
