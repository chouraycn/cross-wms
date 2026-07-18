/**
 * 英文 locale
 *
 * 服务端英文翻译资源。
 */

import type { LocaleMessages } from '../types.js';

export const enMessages: LocaleMessages = {
  common: {
    success: 'Success',
    error: 'Error',
    loading: 'Loading...',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    update: 'Update',
    search: 'Search',
    reset: 'Reset',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    retry: 'Retry',
    skip: 'Skip',
    submit: 'Submit',
    yes: 'Yes',
    no: 'No',
    ok: 'OK',
  },
  errors: {
    unknown: 'Unknown error',
    network: 'Network error',
    timeout: 'Request timeout',
    unauthorized: 'Unauthorized',
    forbidden: 'Forbidden',
    notFound: 'Not found',
    internalServer: 'Internal server error',
    badRequest: 'Bad request',
    validationFailed: 'Validation failed',
    rateLimit: 'Rate limit exceeded, please try again later',
  },
  chat: {
    newChat: 'New chat',
    send: 'Send',
    typing: 'Typing...',
    errorSending: 'Error sending',
    history: 'History',
    clearHistory: 'Clear history',
    deleteSession: 'Delete session',
    sessionDeleted: 'Session deleted',
    messageTooLong: 'Message too long',
    emptyMessage: 'Message cannot be empty',
    thinking: 'Thinking...',
  },
  mcp: {
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    error: 'Connection error',
    toolsLoaded: 'Tools loaded',
    toolCallFailed: 'Tool call failed',
    serverNotFound: 'Server not found',
  },
  hooks: {
    installed: 'Hook installed',
    installFailed: 'Install failed',
    updated: 'Hook updated',
    updateFailed: 'Update failed',
    uninstalled: 'Hook uninstalled',
    uninstallFailed: 'Uninstall failed',
  },
  gmail: {
    setup: 'Gmail setup',
    setupComplete: 'Gmail setup complete',
    setupFailed: 'Gmail setup failed',
    watcherRunning: 'Gmail watcher running',
    watcherStopped: 'Gmail watcher stopped',
    watcherError: 'Gmail watcher error',
    accountRequired: 'Gmail account required',
    topicRequired: 'Pub/Sub topic required',
    pushTokenRequired: 'Push token required',
  },
  commitments: {
    extracted: 'Commitment extracted',
    extractionFailed: 'Extraction failed',
    saved: 'Commitment saved',
    saveFailed: 'Save failed',
    expired: 'Commitment expired',
    completed: 'Commitment completed',
  },
  trajectory: {
    recorded: 'Trajectory recorded',
    exportStarted: 'Export started',
    exportComplete: 'Export complete',
    exportFailed: 'Export failed',
    cleanupComplete: 'Cleanup complete',
  },
};

export default enMessages;
