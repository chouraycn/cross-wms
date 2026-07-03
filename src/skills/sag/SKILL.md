---
name: SAG 语音合成服务
id: sag
description: 通过 ElevenLabs Web API 进行文本转语音（TTS），支持多模型、音色与情感标签
group: util
requires: {}
userInvocable: true
gate: auto
sandboxScope: none
---

通过 ElevenLabs Web API 进行文本转语音并生成本地音频文件。需设置 `ELEVENLABS_API_KEY`。

## 快速开始

```bash
# 列出可用音色
curl -sS "https://api.elevenlabs.io/v1/voices" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | jq '.voices[] | {name, voice_id}'

# 文本转语音并保存为文件
curl -sS "https://api.elevenlabs.io/v1/text-to-speech/<voice_id>" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello there","model_id":"eleven_v3"}' \
  -o /tmp/hello.mp3
```

## 模型说明

- 默认：`eleven_v3`（表现力强）
- 稳定：`eleven_multilingual_v2`
- 快速：`eleven_flash_v2_5`

```bash
curl -sS "https://api.elevenlabs.io/v1/models" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | jq '.[].name'
```

## 发音与语调规则

- 优先用改写纠正发音：例如 "key-note"、加连字符、调整大小写。
- 语言倾向：在 body 中加 `"language_code":"en|de|fr|..."` 引导规范化。
- v3：不支持 SSML `<break>`；用文本内 `[pause]`、`[short pause]`、`[long pause]`。
- v2/v2.5：支持 SSML `<break time="1.5s" />`；API 不直接暴露 `<phoneme>`。

## v3 情感音频标签（放在一行入口处）

- `[whispers]`、`[shouts]`、`[sings]`
- `[laughs]`、`[starts laughing]`、`[sighs]`、`[exhales]`
- `[sarcastic]`、`[curious]`、`[excited]`、`[crying]`、`[mischievously]`
- 示例：`"text":"[whispers] keep this quiet. [short pause] ok?"`

## 音色默认值

- 通过 URL 中的 `<voice_id>` 指定音色；可设环境变量 `ELEVENLABS_VOICE_ID` 复用。

## 对话语音回复

当用户要求"语音"回复（如"用疯狂的科学家声音"）时，生成音频并在回复中附带：

```bash
curl -sS "https://api.elevenlabs.io/v1/text-to-speech/lj2rcrvANS3gaWWnczSX" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Your message here","model_id":"eleven_v3"}' \
  -o /tmp/voice-reply.mp3

# 回复中附带：
# MEDIA:/tmp/voice-reply.mp3
```

音色技巧：

- 疯狂科学家：用 `[excited]` 标签、戏剧性停顿 `[short pause]`、变化强度。
- 平静：用 `[whispers]` 或放慢节奏。
- 戏剧化：节制使用 `[sings]` 或 `[shouts]`。

默认音色：`lj2rcrvANS3gaWWnczSX`。生成长输出前确认音色与说话人。
