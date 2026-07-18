export interface HttpBackendOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class HttpBackend {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  private abortController: AbortController | null = null;

  constructor(options: HttpBackendOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey || '';
    this.timeoutMs = options.timeoutMs || 30000;
  }

  async *sendChat(messages: Array<{ role: string; content: string }>): AsyncGenerator<Record<string, unknown>, void, unknown> {
    this.abortController = new AbortController();
    try {
      yield { type: 'error', error: 'Connection failed', message: `Cannot connect to ${this.baseUrl}` };
      yield { type: 'assistant_end' };
    } catch (e: any) {
      yield { type: 'error', error: e?.message || 'Unknown error' };
      yield { type: 'assistant_end' };
    }
  }

  abortChat(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async listSessions(): Promise<Array<{ id: string; title: string; updatedAt: number; messageCount: number }>> {
    return [];
  }

  async createSession(title: string): Promise<{ id: string; title: string }> {
    return { id: 'sess_' + Date.now(), title };
  }

  async deleteSession(_id: string): Promise<void> {}

  async loadHistory(_sessionId: string): Promise<Array<{ role: string; content: string }>> {
    return [];
  }
}
