/**
 * TestApiClient - E2E API 测试客户端工具
 *
 * 封装 supertest，提供统一的 API 调用接口，
 * 支持 baseURL 配置、token 认证、超时控制等。
 *
 * 使用方式：
 *   const client = new TestApiClient(router, '/api/xxx');
 *   const res = await client.get('/items');
 */

import request, { type Test } from 'supertest';
import express, { type Router, type Express } from 'express';

export interface TestClientOptions {
  basePath?: string;
  token?: string;
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

export class TestApiClient {
  private app: Express;
  private basePath: string;
  private token?: string;
  private timeout: number;

  constructor(router: Router, options: TestClientOptions = {}) {
    this.app = express();
    this.app.use(express.json());
    this.basePath = options.basePath || '';
    this.token = options.token;
    this.timeout = options.timeout || 30000;

    if (this.basePath) {
      this.app.use(this.basePath, router);
    } else {
      this.app.use(router);
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  private buildUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!this.basePath) return normalizedPath;
    if (normalizedPath === '/') return this.basePath;
    return `${this.basePath}${normalizedPath}`;
  }

  private applyAuth(req: Test): Test {
    if (this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }
    return req;
  }

  private applyTimeout(req: Test): Test {
    req.timeout(this.timeout);
    return req;
  }

  async get<T = unknown>(path: string): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    let req = request(this.app).get(url);
    req = this.applyAuth(req);
    req = this.applyTimeout(req);
    const res = await req;
    return {
      status: res.status,
      body: res.body as T,
      headers: res.headers as Record<string, string>,
    };
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    let req = request(this.app).post(url);
    if (body !== undefined) {
      req = req.send(body).set('Content-Type', 'application/json');
    }
    req = this.applyAuth(req);
    req = this.applyTimeout(req);
    const res = await req;
    return {
      status: res.status,
      body: res.body as T,
      headers: res.headers as Record<string, string>,
    };
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    let req = request(this.app).put(url);
    if (body !== undefined) {
      req = req.send(body).set('Content-Type', 'application/json');
    }
    req = this.applyAuth(req);
    req = this.applyTimeout(req);
    const res = await req;
    return {
      status: res.status,
      body: res.body as T,
      headers: res.headers as Record<string, string>,
    };
  }

  async delete<T = unknown>(path: string): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    let req = request(this.app).delete(url);
    req = this.applyAuth(req);
    req = this.applyTimeout(req);
    const res = await req;
    return {
      status: res.status,
      body: res.body as T,
      headers: res.headers as Record<string, string>,
    };
  }

  getApp(): Express {
    return this.app;
  }

  getSupertest(): request.SuperTest<request.Test> {
    return request(this.app);
  }
}

export function createTestClient(router: Router, basePath?: string): TestApiClient {
  return new TestApiClient(router, { basePath });
}
