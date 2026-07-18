/**
 * SMS 渠道 API 封装
 *
 * 提供通用的 SMS 发送能力，通过可插拔的 provider 适配
 * Twilio / Vonage / 阿里云短信等后端。参考 openclaw/extensions/sms
 * 的核心 API 层。
 *
 * 仅移植核心 API 层，不依赖 openclaw 内部框架。
 */

/** SMS 发送结果 */
export interface SmsSendResult {
  /** 是否发送成功 */
  success: boolean;
  /** 服务商返回的消息 ID（成功时） */
  messageId?: string;
  /** 错误描述（失败时） */
  error?: string;
  /** 服务商原始响应 */
  raw?: unknown;
}

/** SMS transport 适配器接口（由具体服务商实现） */
export interface SmsTransport {
  /** 发送单条短信 */
  send(options: SmsSendOptions): Promise<SmsSendResult>;
}

/** SMS 发送参数 */
export interface SmsSendOptions {
  /** 目标手机号（E.164 格式，如 +8613800138000） */
  to: string;
  /** 发送方号码或 sender id（可选） */
  from?: string;
  /** 短信文本内容 */
  text: string;
  /** 模板 ID（部分服务商要求） */
  templateId?: string;
  /** 模板参数（与 templateId 配合使用） */
  templateParams?: Record<string, string>;
}

/**
 * SMS 渠道配置
 */
export interface SmsChannelConfig {
  /** 默认发送方号码或 sender id */
  from?: string;
  /** 服务商名称（用于日志/标识，如 "twilio" / "vonage" / "aliyun"） */
  provider?: string;
  /** 自定义 transport 实例（与 provider 二选一） */
  transport?: SmsTransport;
  /** 服务商 API 凭据（具体字段由 provider 决定） */
  credentials?: Record<string, string>;
  /** 服务商 API 端点（自托管网关时覆盖） */
  endpoint?: string;
  /** 请求超时（毫秒，默认 10000） */
  timeout?: number;
}

/** SMS 渠道句柄 */
export interface SmsChannel {
  /** 发送单条短信 */
  send(options: SmsSendOptions): Promise<SmsSendResult>;
  /** 批量发送短信 */
  sendBatch(options: SmsSendOptions[]): Promise<SmsSendResult[]>;
  /** 当前使用的 transport */
  getTransport(): SmsTransport;
}

/**
 * 默认 HTTP transport
 *
 * 通过 POST JSON 调用自托管短信网关或兼容服务商端点。
 * 请求体字段遵循 SmsSendOptions，期望响应包含 messageId 字段。
 */
function createHttpTransport(config: SmsChannelConfig): SmsTransport {
  const endpoint = config.endpoint;
  const timeout = config.timeout ?? 10000;
  const credentials = config.credentials ?? {};

  return {
    async send(options: SmsSendOptions): Promise<SmsSendResult> {
      if (!endpoint) {
        return {
          success: false,
          error: "未配置 SMS 服务商端点 (endpoint) 或 transport",
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...credentials,
          },
          body: JSON.stringify(options),
          signal: controller.signal,
        });

        const raw = await response.json().catch(() => undefined);

        if (!response.ok) {
          return {
            success: false,
            error: `SMS API 错误: ${response.status}`,
            raw,
          };
        }

        const data = raw as { messageId?: string; id?: string; error?: string };
        return {
          success: true,
          messageId: data.messageId || data.id,
          raw,
        };
      } catch (err) {
        return {
          success: false,
          error: `SMS 发送失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * 创建 SMS 渠道实例
 *
 * 优先使用 config.transport；若未提供，则基于 config.endpoint
 * 构建通用 HTTP transport。具体服务商（Twilio/Vonage/阿里云）可
 * 通过注入自定义 SmsTransport 实现。
 */
export function createSmsChannel(config: SmsChannelConfig): SmsChannel {
  const transport = config.transport ?? createHttpTransport(config);
  const defaultFrom = config.from;

  const send = async (options: SmsSendOptions): Promise<SmsSendResult> => {
    const merged: SmsSendOptions = {
      ...options,
      from: options.from ?? defaultFrom,
    };
    return transport.send(merged);
  };

  const sendBatch = async (options: SmsSendOptions[]): Promise<SmsSendResult[]> => {
    return Promise.all(options.map((opt) => send(opt)));
  };

  return {
    send,
    sendBatch,
    getTransport: () => transport,
  };
}
