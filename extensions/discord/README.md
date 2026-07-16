# Discord Channel Extension

Discord Bot API 渠道扩展，为 cross-wms 提供 Discord 消息通道能力。

## 功能

- 通过 Discord REST API v10 收发消息
- 支持服务器频道和私信
- 支持消息反应 (Emoji)
- 支持线程
- 支持 Embed 富文本消息
- 支持文件附件
- 支持输入状态指示
- 支持 Gateway Bot 连接信息获取

## 配置

设置以下环境变量：

```
DISCORD_BOT_TOKEN=<your-bot-token>
```

或通过应用配置：

```json
{
  "discord": {
    "botToken": "<your-bot-token>",
    "applicationId": "<your-application-id>",
    "guildId": "<your-guild-id>"
  }
}
```

## 获取 Bot Token

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 创建新应用
3. 在 "Bot" 页面添加机器人
4. 复制 Bot Token
5. 启用所需的 Privileged Gateway Intents (Message Content Intent 等)
6. 使用 OAuth2 URL 生成器创建邀请链接，将机器人添加到服务器

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
| 视频 | ✗ |
| 输入状态 | ✓ |
| Markdown | ✓ |
