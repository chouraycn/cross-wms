---
name: iMessage 消息
id: imsg
description: 通过 macOS 信息 App 读取与发送 iMessage/SMS 消息
group: integration
requires:
  bins: ["sqlite3"]
userInvocable: true
gate: auto
sandboxScope: read
---

使用 `imsg` 通过 macOS 信息 App（Messages.app）读取与发送 iMessage/SMS。

## 何时使用

适用于：

- 用户明确要求发送 iMessage 或 SMS
- 读取 iMessage 会话历史
- 查看最近的 Messages.app 聊天
- 向手机号或 Apple ID 发送消息

## 何时不使用

不适用于：

- Telegram 消息 -> 使用 `message` 工具的 `channel:telegram`
- Signal 消息 -> 使用已配置的 Signal 通道
- WhatsApp 消息 -> 使用已配置的 WhatsApp 通道
- Discord 消息 -> 使用 `message` 工具的 `channel:discord`
- Slack 消息 -> 使用 `slack` 技能
- 群聊管理（增删成员）-> 不支持
- 批量/群发消息 -> 必须先与用户确认
- 在当前会话中回复 -> 直接正常回复即可（OpenClaw 会自动路由）

## 前置条件

- macOS 且信息 App 已登录
- 终端已授予"完全磁盘访问权限"
- 已授予信息 App 的自动化权限（用于发送）

## 常用命令

### 列出聊天

```bash
imsg chats --limit 10 --json
```

### 查看历史

```bash
# 按聊天 ID
imsg history --chat-id 1 --limit 20 --json

# 含附件信息
imsg history --chat-id 1 --limit 20 --attachments --json
```

### 监听新消息

```bash
imsg watch --chat-id 1 --attachments
```

### 发送消息

```bash
# 仅文本
imsg send --to "+14155551212" --text "Hello!"

# 含附件
imsg send --to "+14155551212" --text "看看这个" --file /path/to/image.jpg

# 指定服务
imsg send --to "+14155551212" --text "Hi" --service imessage
imsg send --to "+14155551212" --text "Hi" --service sms
```

## 服务选项

- `--service imessage` - 强制 iMessage（接收方需支持 iMessage）
- `--service sms` - 强制 SMS（绿色气泡）
- `--service auto` - 由信息 App 决定（默认）

## 安全规则

1. 发送前务必确认收件人与消息内容
2. 未经用户明确同意，绝不向未知号码发送
3. 注意附件 - 确认文件路径存在
4. 自行限速 - 不要刷屏

## 示例流程

用户："发短信告诉妈妈我会晚到"

```bash
# 1. 查找妈妈的聊天
imsg chats --limit 20 --json | jq '.[] | select(.displayName | contains("Mom"))'

# 2. 与用户确认
# "找到 Mom，号码 +1555123456。通过 iMessage 发送'我会晚到'？"

# 3. 确认后发送
imsg send --to "+1555123456" --text "我会晚到"
```
