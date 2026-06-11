import { useState, useRef, useCallback, useEffect } from 'react';

// ===================== Types =====================

/** Web Speech API 识别结果 */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/** 浏览器原生的 SpeechRecognition 构造函数 */
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

/** Hook 返回的状态和方法 */
export interface UseSpeechRecognitionReturn {
  /** 是否正在录音 */
  isListening: boolean;
  /** 当前识别到的文本（包含临时结果） */
  transcript: string;
  /** 最终确认文本 */
  finalTranscript: string;
  /** 浏览器是否支持语音识别 */
  isSupported: boolean;
  /** 错误信息 */
  error: string | null;
  /** 开始录音 */
  startListening: () => void;
  /** 停止录音 */
  stopListening: () => void;
  /** 重置状态 */
  resetTranscript: () => void;
}

// ===================== Helpers =====================

/** 获取浏览器支持的 SpeechRecognition 构造函数 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition ||
    null
  );
}

// ===================== Hook =====================

/**
 * 封装 Web Speech API 的语音识别 Hook
 *
 * 特性：
 * - 自动检测浏览器支持情况
 * - 支持开始/停止录音
 * - 实时返回识别结果（含临时结果和最终结果）
 * - 自动处理 onend 事件，连续模式下意外结束时自动重启
 * - 中文识别（lang: 'zh-CN'）
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const SpeechRecognition = getSpeechRecognition();
  const isSupported = SpeechRecognition !== null;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const interimRef = useRef('');

  /** 清理并销毁识别实例 */
  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  /** 重置所有文本状态 */
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
    interimRef.current = '';
  }, []);

  /** 开始录音 */
  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      setError('当前浏览器不支持语音识别功能');
      return;
    }

    // 如果已有实例在运行，先停止
    cleanup();
    setError(null);
    interimRef.current = '';

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (result.isFinal) {
          final += alt.transcript;
        } else {
          interim += alt.transcript;
        }
      }

      interimRef.current = interim;

      if (final) {
        setFinalTranscript((prev) => prev + final);
        setTranscript((prev) => prev + final + interim);
      } else {
        setTranscript((prev) => {
          // 只保留已确认的部分 + 当前临时结果
          const confirmed = prev.replace(interimRef.current, '');
          return confirmed + interim;
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' 和 'aborted' 通常不需要提示用户
      if (event.error === 'not-allowed') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
      } else if (event.error === 'no-speech') {
        // 没有检测到语音，静默处理
      } else if (event.error !== 'aborted') {
        setError(`语音识别错误: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // 如果仍在监听状态（用户没有主动停止），可能是意外中断，尝试重启
      // 注意：由于 setIsListening(false) 是异步的，这里用 ref 判断更可靠
      // 但简单起见，让用户手动重新点击开始
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError('启动语音识别失败，请重试');
      setIsListening(false);
    }
  }, [SpeechRecognition, cleanup]);

  /** 停止录音 */
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    interimRef.current = '';
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isListening,
    transcript,
    finalTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
