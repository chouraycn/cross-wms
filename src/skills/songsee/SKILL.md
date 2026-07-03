---
name: 歌曲特征分析
id: songsee
description: 使用 ffmpeg 生成音频频谱图、波形与频率可视化，分析并识别音频特征
group: media
requires: { bins: ["ffmpeg"] }
userInvocable: true
gate: auto
sandboxScope: read
---

使用 `ffmpeg` 从音频生成频谱图、波形与频率可视化，用于分析并识别歌曲特征。仅读取输入文件并输出图像，不修改源文件。

## 快速开始

```bash
# 频谱图
ffmpeg -y -i track.mp3 -lavfi showspectrumpic=s=1280x720:legend=1 spectrogram.png

# 波形图
ffmpeg -y -i track.mp3 -filter_complex showwavespic=s=1280x240 waves.png

# 常数 Q 变换（音乐音阶可视化）
ffmpeg -y -i track.mp3 -lavfi showcqtspic=s=1280x720 cqt.png

# 频率分布
ffmpeg -y -i track.mp3 -lavfi showfreqspic=s=1280x360 freqs.png
```

## 时间切片

```bash
# 截取 12.5s 起 8s 片段生成频谱图
ffmpeg -y -ss 12.5 -t 8 -i track.mp3 -lavfi showspectrumpic=s=1024x512 slice.jpg
```

## 常用参数

- `-ss <秒>` / `-t <秒>`：起点与时长（时间切片）。
- `showspectrumpic`：`s=宽x高`、`legend=1`、`mode=combined|separate`、`color=intensity|rainbow|channel`。
- `showwavespic`：`s=宽x高`、`colors`、`split_channels=1`。
- 调色板近似 openclaw songsee 的 `--style`：`color=intensity`（gray）、`color=rainbow`（magma/inferno 类）。

## 标准输入

```bash
cat track.mp3 | ffmpeg -y -i - -lavfi showspectrumpic=s=1024x512 -f image2 out.png
```

## 说明

- 原生支持 WAV/MP3；其他格式由 ffmpeg 解码，无额外依赖。
- 输出格式由扩展名决定（png/jpg）。
- 仅读取音频并生成图像，不改变源文件。
- 多视图可分别生成后拼合，或用 `-filter_complex` 串联多个 `show*pic`。
