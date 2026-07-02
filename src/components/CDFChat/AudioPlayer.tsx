/**
 * 音频播放器组件 — 支持普通音频和语音消息
 *
 * 基于 OpenClaw AudioContent 设计，支持：
 * - 播放/暂停/进度条
 * - 播放速度切换
 * - 语音消息模式（气泡样式）
 * - 转文字显示
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  /** 音频 URL 或 base64 数据 */
  src: string;
  /** 是否为语音消息 */
  isVoiceNote?: boolean;
  /** 语音转文字 */
  transcript?: string;
  /** 音频时长（秒） */
  durationSeconds?: number;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  isVoiceNote = false,
  transcript,
  durationSeconds,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(1); // 默认 1x
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const cycleSpeed = useCallback(() => {
    const nextIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_OPTIONS[nextIndex];
    }
  }, [speedIndex]);

  const seekTo = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  }, [duration]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isVoiceNote) {
    return (
      <div className="cdf-audio-player cdf-audio-player--voice">
        <audio ref={audioRef} src={src} preload="metadata" />
        <button
          className="cdf-audio-player__play-btn"
          onClick={togglePlay}
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="cdf-audio-player__waveform" onClick={seekTo}>
          <div
            className="cdf-audio-player__progress"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="cdf-audio-player__duration">
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </span>
        {transcript && (
          <button
            className="cdf-audio-player__transcript-btn"
            onClick={() => setShowTranscript(!showTranscript)}
            aria-label="查看转文字"
          >
            💬
          </button>
        )}
        {showTranscript && transcript && (
          <div className="cdf-audio-player__transcript">{transcript}</div>
        )}
      </div>
    );
  }

  return (
    <div className="cdf-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        className="cdf-audio-player__play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div className="cdf-audio-player__info">
        <div className="cdf-audio-player__progress-bar" onClick={seekTo}>
          <div
            className="cdf-audio-player__progress"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="cdf-audio-player__time">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <button
        className="cdf-audio-player__speed-btn"
        onClick={cycleSpeed}
        aria-label="播放速度"
      >
        {SPEED_OPTIONS[speedIndex]}x
      </button>
      {transcript && (
        <button
          className="cdf-audio-player__transcript-toggle"
          onClick={() => setShowTranscript(!showTranscript)}
        >
          {showTranscript ? '隐藏文字' : '显示文字'}
        </button>
      )}
      {showTranscript && transcript && (
        <div className="cdf-audio-player__transcript">{transcript}</div>
      )}
    </div>
  );
};
