// ===================== Electron API Type Declarations for Renderer =====================

/**
 * Result returned by the openExternalLink IPC call.
 */
export interface OpenExternalLinkResult {
  /** Whether the link was successfully opened */
  success: boolean;
  /** Error message if the operation failed */
  error?: string;
}

/**
 * API exposed to the renderer process via the preload script's contextBridge.
 * Access via window.electronAPI in the renderer.
 */
export interface ElectronAPI {
  /**
   * Open an external URL in the system's default browser.
   * @param url - The URL to open
   * @returns Promise resolving to OpenExternalLinkResult
   */
  openExternalLink: (url: string) => Promise<OpenExternalLinkResult>;
}

/** Extend the Window interface to include the Electron API */
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// This export ensures this file is treated as a module
export {};
