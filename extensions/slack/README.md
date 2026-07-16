# Slack Channel Extension

Slack 渠道扩展，为 cross-wms 提供 Slack 消息通道能力。

## 功能

- 通过 Slack Web API 收发消息
- 支持频道、私信和群组消息
- 支持线程回复
- 支持消息反应
- 支持文件上传
- 支持 mrkdwn 格式消息
- 支持斜杠命令

## 配置

设置以下环境变量：

```
SLACK_BOT_TOKEN=<xoxb-your-bot-token>
SLACK_APP_TOKEN=<xapp-your-app-token>
```

或通过应用配置：

```json
{
  "slack": {
    "botToken": "xoxb-your-bot-token",
    "appToken": "xapp-your-app-token",
    "userToken": "xoxp-your-user-token"
  }
}
```

## 获取 Token

### Bot Token (xoxb-)

1. 访问 [Slack API](https://api.slack.com/apps) 创建新应用
2. 在 "OAuth & Permissions" 页面添加 Bot Token Scopes（如 `chat:write`, `channels:history` 等）
3. 安装应用到工作区，获取 Bot User OAuth Token

### App Token (xapp-)

1. 在应用设置页面的 "Socket Mode" 中启用 Socket Mode
2. 生成 App-Level Token

## 渠道能力

| 能力 | 支持 |
|------|------|
| 私聊 | ✓ |
| 群组 | ✓ |
| 媒体 | ✓ |
| 反应 | ✓ |
| 话题线程 | ✓ |
| 投票 | ✗ |
| 提及 | ✓ |
| 语音 | ✗ |
| 视频 | ✗ |
| 输入状态 | ✓ |
| Markdown | ✓ |
