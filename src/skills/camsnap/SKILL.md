---
name: 摄像头快照
id: camsnap
description: 从 RTSP/ONVIF 摄像头捕获快照、片段或动作事件
group: media
requires:
  bins: ["ffmpeg"]
userInvocable: true
gate: manual
sandboxScope: write
---

使用 `camsnap` 从已配置的摄像头抓取快照、片段或动作事件。

## 配置

- 配置文件：`~/.config/camsnap/config.yaml`
- 添加摄像头：`camsnap add --name kitchen --host 192.168.0.10 --user user --pass pass`

## 常用命令

- 发现设备：`camsnap discover --info`
- 快照：`camsnap snap kitchen --out shot.jpg`
- 片段：`camsnap clip kitchen --dur 5s --out clip.mp4`
- 动作监测：`camsnap watch kitchen --threshold 0.2 --action '...'`
- 自检：`camsnap doctor --probe`

## 注意事项

- 需要 `ffmpeg` 在 PATH 中。
- 长片段录制前先做一次短测试捕获。
