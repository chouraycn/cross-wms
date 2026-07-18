---
name: compaction-notifier
description: "会话压缩开始与完成时发送可见的聊天通知。"
metadata:
  {
    "openclaw":
      {
        "emoji": "🧹",
        "events": ["session:compact:before", "session:compact:after"],
        "always": true,
      },
  }
---

# Compaction Notifier

在 OpenClaw 压缩会话转录本时发送简短的用户可见状态消息。启用方式：

```bash
openclaw hooks enable compaction-notifier
```

适用于长对话在压缩上下文时看起来像是卡住的聊天界面。
