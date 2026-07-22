import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createSign, createVerify } from "node:crypto";
import JSZip from "jszip";
import { logger } from "../../../logger.js";

export type SkillPackage = {
  id: string;
  name: string;
  version: string;
  description: string;
  files: string[];
  dependencies: Record<string, string>;
  metadata: Record<string, unknown>;
  createdAt: number;
};

export type PackageSignature = {
  algorithm: string;
  signature: string;
  publicKey?: string;
  timestamp: number;
};

export type PackageManifest = {
  package: SkillPackage;
  signature?: PackageSignature;
  sha256: string;
};

export type CreatePackageOptions = {
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  metadata?: Record<string, unknown>;
  includeHidden?: boolean;
};

export type PublishPackageOptions = {
  authToken?: string;
  timeout?: number;
};

export type DownloadPackageOptions = {
  authToken?: string;
  timeout?: number;
};

const MANIFEST_FILENAME = "manifest.json";

async function computeDirectorySha256(dir: string, files: string[]): Promise<string> {
  const hash = createHash("sha256");

  const sortedFiles = [...files].sort();
  for (const file of sortedFiles) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      const content = await fs.readFile(filePath);
      hash.update(file);
      hash.update(content);
    }
  }

  return hash.digest("hex");
}

async function collectSkillFiles(
  skillDir: string,
  includeHidden = false,
): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string, relativePath: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryName = entry.name;

      if (!includeHidden && entryName.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(currentDir, entryName);
      const newRelativePath = relativePath ? path.join(relativePath, entryName) : entryName;

      if (entry.isDirectory()) {
        await walk(fullPath, newRelativePath);
      } else if (entry.isFile()) {
        files.push(newRelativePath);
      }
    }
  }

  await walk(skillDir, "");
  return files.sort();
}

async function parseSkillMetadata(skillDir: string): Promise<{
  name: string;
  description: string;
  version: string;
  dependencies?: Record<string, string>;
}> {
  const skillMdPath = path.join(skillDir, "SKILL.md");

  try {
    const content = await fs.readFile(skillMdPath, "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const metadata: Record<string, string> = {};

      for (const line of frontmatter.split("\n")) {
        const [key, ...valueParts] = line.split(":");
        if (key && valueParts.length > 0) {
          metadata[key.trim()] = valueParts.join(":").trim();
        }
      }

      const name = metadata.name || path.basename(skillDir);
      const description = metadata.description || "";
      const version = metadata.version || "1.0.0";

      let dependencies: Record<string, string> | undefined;
      if (metadata.dependencies) {
        try {
          dependencies = JSON.parse(metadata.dependencies);
        } catch {
          // ignore parse error
        }
      }

      return { name, description, version, dependencies };
    }
  } catch {
    // SKILL.md not found or unreadable
  }

  return {
    name: path.basename(skillDir),
    description: "",
    version: "1.0.0",
  };
}

export async function createPackage(
  skillDir: string,
  options: CreatePackageOptions = {},
): Promise<string> {
  const {
    version: overrideVersion,
    description: overrideDescription,
    dependencies: overrideDependencies,
    metadata = {},
    includeHidden = false,
  } = options;

  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) {
      throw new Error(`Skill path is not a directory: ${skillDir}`);
    }
  } catch {
    throw new Error(`Skill directory not found: ${skillDir}`);
  }

  const skillMetadata = await parseSkillMetadata(skillDir);
  const files = await collectSkillFiles(skillDir, includeHidden);

  if (!files.includes("SKILL.md")) {
    logger.warn("[SkillPackager] SKILL.md not found in skill directory");
  }

  const pkg: SkillPackage = {
    id: skillMetadata.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    name: skillMetadata.name,
    version: overrideVersion || skillMetadata.version,
    description: overrideDescription || skillMetadata.description,
    files,
    dependencies: overrideDependencies || skillMetadata.dependencies || {},
    metadata,
    createdAt: Date.now(),
  };

  const sha256 = await computeDirectorySha256(skillDir, files);

  const manifest: PackageManifest = {
    package: pkg,
    sha256,
  };

  const outputPath = path.join(
    path.dirname(skillDir),
    `${pkg.id}-${pkg.version}.skill.zip`,
  );

  const zip = new JSZip();

  zip.file(MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

  for (const file of files) {
    const filePath = path.join(skillDir, file);
    const content = await fs.readFile(filePath);
    zip.file(file, content);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(outputPath, buffer);

  logger.info(`[SkillPackager] Package created: ${outputPath} (${buffer.length} bytes)`);
  return outputPath;
}

export async function extractPackage(
  packagePath: string,
  targetDir: string,
): Promise<PackageManifest> {
  try {
    const stat = await fs.stat(packagePath);
    if (!stat.isFile()) {
      throw new Error(`Package path is not a file: ${packagePath}`);
    }
  } catch {
    throw new Error(`Package file not found: ${packagePath}`);
  }

  await fs.mkdir(targetDir, { recursive: true });

  const data = await fs.readFile(packagePath);
  const zip = await JSZip.loadAsync(data);

  const manifestContent = await zip.file(MANIFEST_FILENAME)?.async("string");
  if (!manifestContent) {
    throw new Error("manifest.json not found in package");
  }

  const manifest = JSON.parse(manifestContent) as PackageManifest;

  for (const file of manifest.package.files) {
    const fileData = await zip.file(file)?.async("nodebuffer");
    if (fileData) {
      const targetPath = path.join(targetDir, file);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, fileData);
    }
  }

  const computedSha256 = await computeDirectorySha256(targetDir, manifest.package.files);

  if (computedSha256 !== manifest.sha256) {
    throw new Error(`Checksum mismatch: expected ${manifest.sha256}, got ${computedSha256}`);
  }

  logger.info(`[SkillPackager] Package extracted to: ${targetDir}`);
  return manifest;
}

export async function signPackage(
  packagePath: string,
  privateKey: string,
): Promise<PackageManifest> {
  try {
    const stat = await fs.stat(packagePath);
    if (!stat.isFile()) {
      throw new Error(`Package path is not a file: ${packagePath}`);
    }
  } catch {
    throw new Error(`Package file not found: ${packagePath}`);
  }

  const targetDir = await fs.mkdtemp(path.join(path.dirname(packagePath), "skill-pkg-"));

  try {
    const originalManifest = await extractPackage(packagePath, targetDir);

    const manifestContent = JSON.stringify(originalManifest.package);
    const signer = createSign("RSA-SHA256");
    signer.update(manifestContent);
    const signature = signer.sign(privateKey, "base64");

    const publicKey = privateKey
      .replace(/-----BEGIN RSA PRIVATE KEY-----/, "-----BEGIN PUBLIC KEY-----")
      .replace(/-----END RSA PRIVATE KEY-----/, "-----END PUBLIC KEY-----");

    const signedManifest: PackageManifest = {
      ...originalManifest,
      signature: {
        algorithm: "RSA-SHA256",
        signature,
        publicKey,
        timestamp: Date.now(),
      },
    };

    const zip = new JSZip();

    zip.file(MANIFEST_FILENAME, JSON.stringify(signedManifest, null, 2));

    for (const file of signedManifest.package.files) {
      const filePath = path.join(targetDir, file);
      const content = await fs.readFile(filePath);
      zip.file(file, content);
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await fs.writeFile(packagePath, buffer);

    logger.info(`[SkillPackager] Package signed: ${packagePath}`);
    return signedManifest;
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
}

export async function verifyPackage(
  packagePath: string,
  publicKey?: string,
): Promise<{ valid: boolean; manifest: PackageManifest; errors: string[] }> {
  const errors: string[] = [];

  try {
    const stat = await fs.stat(packagePath);
    if (!stat.isFile()) {
      errors.push(`Package path is not a file: ${packagePath}`);
      return { valid: false, manifest: {} as PackageManifest, errors };
    }
  } catch {
    errors.push(`Package file not found: ${packagePath}`);
    return { valid: false, manifest: {} as PackageManifest, errors };
  }

  const targetDir = await fs.mkdtemp(path.join(path.dirname(packagePath), "skill-pkg-"));

  try {
    const manifest = await extractPackage(packagePath, targetDir);

    if (!manifest.signature) {
      errors.push("Package has no signature");
      return { valid: false, manifest, errors };
    }

    const keyToUse = publicKey || manifest.signature.publicKey;
    if (!keyToUse) {
      errors.push("No public key provided and no embedded public key found");
      return { valid: false, manifest, errors };
    }

    const manifestContent = JSON.stringify(manifest.package);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(manifestContent);

    try {
      const signatureValid = verifier.verify(keyToUse, manifest.signature.signature, "base64");

      if (!signatureValid) {
        errors.push("Signature verification failed");
      }

      if (signatureValid) {
        logger.info(`[SkillPackager] Package signature verified: ${packagePath}`);
      }

      return {
        valid: signatureValid,
        manifest,
        errors,
      };
    } catch (err) {
      errors.push(`Signature verification error: ${err instanceof Error ? err.message : String(err)}`);
      return { valid: false, manifest, errors };
    }
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true });
  }
}

export async function publishPackage(
  packagePath: string,
  registryUrl: string,
  options: PublishPackageOptions = {},
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  const { authToken, timeout = 30000 } = options;

  try {
    const stat = await fs.stat(packagePath);
    if (!stat.isFile()) {
      return { success: false, error: `Package path is not a file: ${packagePath}` };
    }
  } catch {
    return { success: false, error: `Package file not found: ${packagePath}` };
  }

  try {
    const fileData = await fs.readFile(packagePath);

    const url = new URL("/api/packages", registryUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/zip",
      "Content-Length": String(fileData.length),
    };

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: fileData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseData = await response.json();

    if (response.ok) {
      logger.info(`[SkillPackager] Package published to ${registryUrl}`);
      return { success: true, response: responseData };
    }

    return { success: false, error: responseData?.error || `HTTP ${response.status}` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[SkillPackager] Publish failed:", err);
    return { success: false, error: errorMessage };
  }
}

export async function downloadPackage(
  packageId: string,
  version: string,
  registryUrl: string,
  targetPath: string,
  options: DownloadPackageOptions = {},
): Promise<{ success: boolean; manifest?: PackageManifest; error?: string }> {
  const { authToken, timeout = 30000 } = options;

  try {
    const url = new URL(`/api/packages/${packageId}/${version}`, registryUrl);
    const headers: Record<string, string> = {};

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData?.error || `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(buffer));

    const targetDir = await fs.mkdtemp(path.join(path.dirname(targetPath), "skill-pkg-"));

    try {
      const manifest = await extractPackage(targetPath, targetDir);
      logger.info(`[SkillPackager] Package downloaded: ${targetPath}`);
      return { success: true, manifest };
    } finally {
      await fs.rm(targetDir, { recursive: true, force: true });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[SkillPackager] Download failed:", err);
    return { success: false, error: errorMessage };
  }
}

export async function listPackages(
  registryUrl: string,
): Promise<{ packages: SkillPackage[]; error?: string }> {
  try {
    const url = new URL("/api/packages", registryUrl);
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { packages: [], error: errorData?.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { packages: data.packages || [] };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[SkillPackager] List packages failed:", err);
    return { packages: [], error: errorMessage };
  }
}

export async function getPackageInfo(
  packageId: string,
  registryUrl: string,
): Promise<{ manifest?: PackageManifest; error?: string }> {
  try {
    const url = new URL(`/api/packages/${packageId}`, registryUrl);
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData?.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { manifest: data as PackageManifest };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[SkillPackager] Get package info failed:", err);
    return { error: errorMessage };
  }
}
