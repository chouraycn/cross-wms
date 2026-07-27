/**
 * WhatsApp 渠道 API 封装
 *
 * 基于 WhatsApp Business API 实现消息收发能力。
 * 参考 openclaw/extensions/whatsapp 的核心 API 层。
 */

const WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
  apiBase?: string;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  text?: { body: string };
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface WhatsAppSendMessageResult {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
  [key: string]: unknown;
}

export interface WhatsAppWebhookEvent {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: WhatsAppMessage[];
        [key: string]: unknown;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppChannel {
  sendTextMessage(to: string, text: string): Promise<WhatsAppSendMessageResult>;
  sendTemplateMessage(to: string, templateName: string, languageCode?: string): Promise<WhatsAppSendMessageResult>;
  verifyWebhook(mode: string, token: string, challenge: string): string | null;
  parseWebhook(body: WhatsAppWebhookEvent): WhatsAppMessage[];
}

export function createWhatsAppChannel(config: WhatsAppConfig): WhatsAppChannel {
  const apiBase = config.apiBase || WHATSAPP_API_BASE;

  const request = async (path: string, options: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`WhatsApp API error (${path}): ${response.status} ${errorText}`);
    }

    return response.json();
  };

  const sendTextMessage = async (to: string, text: string): Promise<WhatsAppSendMessageResult> => {
    const result = await request(`/${config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    return result as WhatsAppSendMessageResult;
  };

  const sendTemplateMessage = async (to: string, templateName: string, languageCode: string = "en_US"): Promise<WhatsAppSendMessageResult> => {
    const result = await request(`/${config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      }),
    });
    return result as WhatsAppSendMessageResult;
  };

  const verifyWebhook = (mode: string, token: string, challenge: string): string | null => {
    if (mode === "subscribe" && token === config.accessToken) {
      return challenge;
    }
    return null;
  };

  const parseWebhook = (body: WhatsAppWebhookEvent): WhatsAppMessage[] => {
    const messages: WhatsAppMessage[] = [];
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.value.messages) {
          messages.push(...change.value.messages);
        }
      }
    }
    return messages;
  };

  return {
    sendTextMessage,
    sendTemplateMessage,
    verifyWebhook,
    parseWebhook,
  };
}
