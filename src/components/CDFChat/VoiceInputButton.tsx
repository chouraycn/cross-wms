/**
 * CDFChat 语音输入按钮组件
 *
 * - 麦克风图标按钮
 * - 点击开始/停止录音
 * - 录音时有脉冲动画效果
 * - 显示实时转录文本
 * - 支持长按录音模式
 * - 不支持时显示禁用状态 + tooltip 提示
 * - 深色模式支持
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, IconButton, Tooltip, useTheme, Typography } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicNoneIcon from '@mui/icons-material/MicNone';
import StopIcon from '@mui/icons-material/Stop';
import { getGrayScale } from '../../constants/theme';
import { useSpeechToText } from './VoiceManager';
import type { STTOptions } from './VoiceManager';

export interface VoiceInputButtonProps {
  onTranscriptComplete?: (text: string) => void;
  onTranscriptChange?: (text: string) => void;
  disabled?: boolean;
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  holdToTalk?: boolean;
  showTranscript?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = React.memo(
  function VoiceInputButton({
    onTranscriptComplete,
    onTranscriptChange,
    disabled = false,
    lang = 'zh-CN',
    continuous = true,
    interimResults = true,
    holdToTalk = false,
    showTranscript = true,
    size = 'medium',
  }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const gs = getGrayScale(isDark);

    const sttOptions: STTOptions = { lang, continuous, interimResults };
    const {
      startListening,
      stopListening,
      isListening,
      isSupported,
      transcript,
      interimTranscript,
      error,
    } = useSpeechToText(sttOptions);

    const [isHovered, setIsHovered] = useState(false);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isHoldingRef = useRef(false);

    const displayText = transcript + interimTranscript;

    useEffect(() => {
      if (onTranscriptChange) {
        onTranscriptChange(displayText);
      }
    }, [displayText, onTranscriptChange]);

    const handleToggle = useCallback(() => {
      if (!isSupported || disabled) return;

      if (isListening) {
        stopListening();
        if (onTranscriptComplete && transcript) {
          onTranscriptComplete(transcript);
        }
      } else {
        startListening();
      }
    }, [isSupported, disabled, isListening, stopListening, startListening, onTranscriptComplete, transcript]);

    const handleMouseDown = useCallback(() => {
      if (!holdToTalk || !isSupported || disabled) return;

      isHoldingRef.current = true;
      holdTimerRef.current = setTimeout(() => {
        if (isHoldingRef.current) {
          startListening();
        }
      }, 200);
    }, [holdToTalk, isSupported, disabled, startListening]);

    const handleMouseUp = useCallback(() => {
      if (!holdToTalk || !isSupported || disabled) return;

      isHoldingRef.current = false;
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      if (isListening) {
        stopListening();
        if (onTranscriptComplete && transcript) {
          onTranscriptComplete(transcript);
        }
      }
    }, [holdToTalk, isSupported, disabled, isListening, stopListening, onTranscriptComplete, transcript]);

    const handleMouseLeave = useCallback(() => {
      setIsHovered(false);
      if (holdToTalk && isHoldingRef.current) {
        isHoldingRef.current = false;
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        if (isListening) {
          stopListening();
          if (onTranscriptComplete && transcript) {
            onTranscriptComplete(transcript);
          }
        }
      }
    }, [holdToTalk, isListening, stopListening, onTranscriptComplete, transcript]);

    useEffect(() => {
      return () => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
        }
      };
    }, []);

    const getTooltipTitle = () => {
      if (!isSupported) return '当前浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器';
      if (disabled) return '语音输入已禁用';
      if (holdToTalk) return isListening ? '松开结束录音' : '长按开始录音';
      return isListening ? '点击停止录音' : '点击开始语音输入';
    };

    const iconSize = size === 'small' ? 18 : size === 'large' ? 28 : 22;
    const buttonSize = size === 'small' ? 32 : size === 'large' ? 48 : 40;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {showTranscript && displayText && (
          <Box
            sx={{
              mb: 1,
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.06)',
              border: `1px solid ${isDark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.15)'}`,
              maxWidth: 300,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: isDark ? '#60A5FA' : '#3B82F6',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {displayText}
              {isListening && interimTranscript && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: 2,
                    height: 14,
                    bgcolor: isDark ? '#60A5FA' : '#3B82F6',
                    ml: 1,
                    verticalAlign: 'middle',
                    animation: 'cdf-voice-blink 0.8s infinite',
                  }}
                />
              )}
            </Typography>
          </Box>
        )}

        {error && (
          <Typography
            variant="caption"
            sx={{
              color: '#EF4444',
              fontSize: 11,
              mb: 1,
              textAlign: 'center',
              maxWidth: 200,
            }}
          >
            {error}
          </Typography>
        )}

        <Tooltip title={getTooltipTitle()} placement="top" arrow>
          <Box
            sx={{
              position: 'relative',
              display: 'inline-flex',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
          >
            {isListening && (
              <>
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: buttonSize + 16,
                    height: buttonSize + 16,
                    borderRadius: '50%',
                    bgcolor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
                    animation: 'cdf-voice-pulse-ring 1.5s ease-out infinite',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: buttonSize + 8,
                    height: buttonSize + 8,
                    borderRadius: '50%',
                    bgcolor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.12)',
                    animation: 'cdf-voice-pulse-ring 1.5s ease-out infinite',
                    animationDelay: '0.5s',
                  }}
                />
              </>
            )}

            <IconButton
              onClick={holdToTalk ? undefined : handleToggle}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchEnd={handleMouseUp}
              disabled={!isSupported || disabled}
              sx={{
                width: buttonSize,
                height: buttonSize,
                color: isListening
                  ? '#EF4444'
                  : isHovered && isSupported && !disabled
                    ? isDark
                      ? '#60A5FA'
                      : '#3B82F6'
                    : gs.textMuted,
                bgcolor: isListening
                  ? isDark
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(239,68,68,0.08)'
                  : isHovered && isSupported && !disabled
                    ? isDark
                      ? 'rgba(96,165,250,0.08)'
                      : 'rgba(59,130,246,0.06)'
                    : 'transparent',
                borderRadius: 2,
                p: 1,
                '&:hover': {
                  bgcolor: isListening
                    ? isDark
                      ? 'rgba(239,68,68,0.2)'
                      : 'rgba(239,68,68,0.12)'
                    : isSupported && !disabled
                      ? isDark
                        ? 'rgba(96,165,250,0.12)'
                        : 'rgba(59,130,246,0.08)'
                      : 'transparent',
                },
                '&.Mui-disabled': {
                  color: gs.textDisabled,
                },
                transition: 'all 0.15s ease',
                position: 'relative',
                zIndex: 1,
              }}
              aria-label={isListening ? '停止录音' : '语音输入'}
            >
              {isListening ? (
                <StopIcon sx={{ fontSize: iconSize }} />
              ) : !isSupported ? (
                <MicNoneIcon sx={{ fontSize: iconSize }} />
              ) : (
                <MicIcon sx={{ fontSize: iconSize }} />
              )}
            </IconButton>
          </Box>
        </Tooltip>

        <style>{`
          @keyframes cdf-voice-pulse-ring {
            0% {
              opacity: 0.6;
              transform: translate(-50%, -50%) scale(0.8);
            }
            100% {
              opacity: 0;
              transform: translate(-50%, -50%) scale(1.3);
            }
          }
          @keyframes cdf-voice-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
      </Box>
    );
  },
);

export default VoiceInputButton;
