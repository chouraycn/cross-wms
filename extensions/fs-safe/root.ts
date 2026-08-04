// Re-export everything from the real @openclaw/fs-safe npm package
// Using direct path to bypass tsconfig catch-all @openclaw/* -> ../extensions/*
export * from "../../node_modules/@openclaw/fs-safe/dist/root.js";
