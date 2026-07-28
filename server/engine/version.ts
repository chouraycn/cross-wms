// Re-export from config/version
export * from "./config/version.js";

/** Current application version (read from package.json at build time). */
export const VERSION = process.env.npm_package_version ?? '1.7.151';
