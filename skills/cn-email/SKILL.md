---
name: cn-email
description: 国内邮件服务：QQ邮箱、网易邮箱、阿里云企业邮箱、腾讯企业邮箱
version: 1.0.0
homepage: https://github.com/pimalaya/himalaya
metadata:
  openclaw:
    emoji: 📧
    requires:
      bins:
        - himalaya
    install:
      - id: brew
        kind: brew
        formula: himalaya
        bins:
          - himalaya
        label: Install Himalaya (brew)
  crosswms:
    category: general
    executionMode: agent
    source: workspace
    status: active
---

# 国内邮件服务

使用 `himalaya` 管理国内邮件服务（QQ邮箱、网易邮箱、阿里云企业邮箱、腾讯企业邮箱）。

## 配置文件

配置文件路径：`~/.config/himalaya/config.toml`

### QQ邮箱配置

```toml
[accounts.qq]
email = "yourname@qq.com"
display-name = "你的名字"
default = true

backend.type = "imap"
backend.host = "imap.qq.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "yourname@qq.com"
backend.auth.type = "password"
backend.auth.raw = "你的QQ邮箱授权码"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.qq.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "yourname@qq.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.raw = "你的QQ邮箱授权码"
```

### 网易邮箱配置

```toml
[accounts.163]
email = "yourname@163.com"
display-name = "你的名字"

backend.type = "imap"
backend.host = "imap.163.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "yourname@163.com"
backend.auth.type = "password"
backend.auth.raw = "你的网易邮箱授权码"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.163.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "yourname@163.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.raw = "你的网易邮箱授权码"
```

### 阿里云企业邮箱配置

```toml
[accounts.aliyun]
email = "yourname@company.com"
display-name = "你的名字"

backend.type = "imap"
backend.host = "imap.mxhichina.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "yourname@company.com"
backend.auth.type = "password"
backend.auth.raw = "你的邮箱密码"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.mxhichina.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "yourname@company.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.raw = "你的邮箱密码"
```

### 腾讯企业邮箱配置

```toml
[accounts.exmail]
email = "yourname@company.com"
display-name = "你的名字"

backend.type = "imap"
backend.host = "imap.exmail.qq.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "yourname@company.com"
backend.auth.type = "password"
backend.auth.raw = "你的邮箱密码"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.exmail.qq.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "yourname@company.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.raw = "你的邮箱密码"
```

## 基本命令

### 查看邮箱列表

```bash
himalaya folder list
himalaya envelope list
```

### 读取邮件

```bash
himalaya message read <id>
```

### 搜索邮件

```bash
himalaya envelope list from someone@example.com subject 关键词
himalaya envelope list subject "订单通知"
```

### 发送邮件

```bash
# 纯文本
himalaya message write
himalaya message send --to someone@example.com --subject "主题" --body "内容"

# 多行内容
echo -e "Hi,\n\n这是邮件内容。\n\n此致" | himalaya message send --to someone@example.com --subject "主题" --body-file -
```

### 回复/转发

```bash
himalaya message reply <id>
himalaya message forward <id>
```

### 管理邮件

```bash
himalaya message move <id> <folder>
himalaya message copy <id> <folder>
himalaya message delete <id>
```

## 安全规则

1. 发送前务必确认收件人和内容
2. 使用授权码而非密码登录
3. 不要在配置文件中明文存储密码，建议使用密钥管理器

## 注意事项

- QQ邮箱/网易邮箱需要在网页端开启POP3/IMAP并获取授权码
- 企业邮箱通常直接使用邮箱密码即可
- 默认使用 UTF-8 编码，支持中文邮件内容