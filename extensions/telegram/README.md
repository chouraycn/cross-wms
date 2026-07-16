# Telegram Channel Extension

Telegram Bot API 渠道扩展，为 cross-wms 提供 Telegram 消息通道能力。

## 功能

- 通过 Telegram Bot API 收发消息
- 支持私聊和群组消息
- 支持媒体、反应、话题线程、投票、提及、语音、视频、输入状态
- 支持 Markdown 格式消息
- 支持轮询和 Webhook 两种接收模式

## 配置

设置以下环境变量：

```
TELEGRAM_BOT_TOKEN=<your-bot-token>
```

或通过应用配置：

```json
{
  "telegram": {
    "botToken": "<your-bot-token>",
    "webhookUrl": "https://your-domain.com/webhook/telegram",
    "webhookSecret": "<optional-secret>"
  }
}
```

## 获取 Bot Token

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 命令创建新机器人
3. 按照提示设置名称和用户名
4. 获取 Bot Token 并配置到环境变量中

## 渠道能力

| 能力 | 支持 |
|------|------|
| 私聊 | ✓ |
| 群组 | ✓ |
| 媒体 | ✓ |
| 反应 | ✓ |
| 话题线程 | ✓ |
| 投票 | ✓ |
| 提及 | ✓ |
| 语音 | ✓ |
| 视频 | ✓ |
| 输入状态 | ✓ |
| Markdown | ✓ |
