import { getEnterpriseAuthSession } from '../auth.js'

/**
 * StaffDeck API client. All requests are prefixed with `/api/staffdeck`.
 * The `api` object exposes `get/post/put/delete/postWithSignal/postKeepalive/blob`
 * plus the SSE streaming helpers `streamChatTurn` and `streamPost`.
 */

const API_BASE = '/api/staffdeck'

export const TENANT_ID = 'default'
export const SHOW_DEBUG = false

export class ApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string, statusText: string) {
    super(parseErrorMessage(body) || statusText || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export function authHeader(): Record<string, string> {
  const session = getEnterpriseAuthSession()
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {}
}

/**
 * 后端统一响应包裹为 { code, data, message }。此处归一化解包，
 * 让所有 api.* 调用方直接拿到 `data`，避免页面层契约不一致
 * （部分页面当裸数组、部分手动 .data 解包）导致列表渲染崩溃/恒空。
 * 非包裹结构（裸数组、SSE 之外的普通对象）原样返回。
 */
function unwrapEnvelope<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'code' in payload &&
    'data' in payload &&
    'message' in payload
  ) {
    return (payload as { data: unknown }).data as T
  }
  return payload as T
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers || {}),
    },
    ...options,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, text, response.statusText)
  }
  const json = (await response.json()) as unknown
  return unwrapEnvelope<T>(json)
}

async function keepalivePost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, text, response.statusText)
  }
  const text = await response.text()
  return unwrapEnvelope<T>(text ? JSON.parse(text) : {})
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  postWithSignal: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), signal }),
  postKeepalive: <T>(path: string, body?: unknown) => keepalivePost<T>(path, body),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  blob: async (path: string) => {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        ...authHeader(),
      },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new ApiError(response.status, text, response.statusText)
    }
    return response.blob()
  },
}

export type StreamEvent = {
  event: string
  data: Record<string, unknown>
}

export async function streamChatTurn(
  body: Record<string, unknown>,
  onEvent: (item: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamPost('/chat/stream', body, onEvent, signal)
}

export async function streamPost(
  path: string,
  body: Record<string, unknown>,
  onEvent: (item: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, text, response.statusText)
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    blocks.forEach((block) => {
      const parsed = parseSseBlock(block)
      if (parsed) onEvent(parsed)
    })
  }

  buffer += decoder.decode()
  const parsed = parseSseBlock(buffer)
  if (parsed) onEvent(parsed)
}

export async function streamGet(
  path: string,
  onEvent: (item: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { ...authHeader() }, signal })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, text, response.statusText)
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    blocks.forEach((block) => {
      const parsed = parseSseBlock(block)
      if (parsed) onEvent(parsed)
    })
  }

  buffer += decoder.decode()
  const parsed = parseSseBlock(buffer)
  if (parsed) onEvent(parsed)
}

function parseSseBlock(block: string): StreamEvent | null {
  const lines = block.split('\n').map((line) => line.trimEnd())
  const eventLine = lines.find((line) => line.startsWith('event:'))
  const dataLines = lines.filter((line) => line.startsWith('data:'))
  if (!eventLine || dataLines.length === 0) return null
  const event = eventLine.replace(/^event:\s*/, '')
  const rawData = dataLines.map((line) => line.replace(/^data:\s*/, '')).join('\n')
  try {
    return { event, data: JSON.parse(rawData) as Record<string, unknown> }
  } catch {
    return { event, data: { raw: rawData } }
  }
}

function parseErrorMessage(text: string): string {
  if (!text) return ''
  try {
    const payload = JSON.parse(text) as { detail?: unknown; message?: unknown; error?: unknown }
    const detail = payload.detail ?? payload.message ?? payload.error
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map(formatValidationDetail)
        .filter(Boolean)
        .join('；')
    }
  } catch {
    return text
  }
  return text
}

function formatValidationDetail(item: unknown): string {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return ''

  const detail = item as { loc?: unknown; msg?: unknown }
  const message = typeof detail.msg === 'string' ? detail.msg : ''
  const location = Array.isArray(detail.loc)
    ? detail.loc.map((part) => String(part)).filter(Boolean).join('.')
    : ''

  if (location && message) return `${location}: ${message}`
  return message
}
