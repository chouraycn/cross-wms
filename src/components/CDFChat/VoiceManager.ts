/**
 * CDFChat 语音管理工具
 *
 * 封装浏览器 Web Speech API，提供：
 * - useTextToSpeech: 文本转语音 Hook
 * - useSpeechToText: 语音转文本 Hook
 *
 * 支持浏览器兼容性检测与优雅降级。
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// ===================== Web Speech API 类型声明 =====================

// SpeechRecognition 构造函数签名
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// SpeechRecognition 实例接口
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onaudiostart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onsoundend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onsoundstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly confidence: number;
  readonly transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'language-not-supported'
  | 'bad-grammar';

// 扩展 Window 接口以支持 webkit 前缀
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// ===================== 类型定义 =====================

export interface VoiceInfo {
  name: string;
  lang: string;
  voiceURI: string;
  default?: boolean;
}

export interface TTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: VoiceInfo | null;
  lang?: string;
}

export interface STTOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface UseTextToSpeechReturn {
  speak: (text: string, opts?: TTSOptions) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  voice: VoiceInfo | null;
  voices: VoiceInfo[];
  rate: number;
  pitch: number;
  volume: number;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  setVoice: (voice: VoiceInfo | null) => void;
}

export interface UseSpeechToTextReturn {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}

// ===================== 浏览器支持检测 =====================

function checkSpeechSynthesisSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window;
}

function checkSpeechRecognitionSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window
  );
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// ===================== useTextToSpeech Hook =====================

const DEFAULT_RATE = 1;
const DEFAULT_PITCH = 1;
const DEFAULT_VOLUME = 1;

export function useTextToSpeech(defaultOpts: TTSOptions = {}): UseTextToSpeechReturn {
  const isSupported = checkSpeechSynthesisSupport();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voice, setVoice] = useState<VoiceInfo | null>(defaultOpts.voice ?? null);
  const [rate, setRate] = useState(defaultOpts.rate ?? DEFAULT_RATE);
  const [pitch, setPitch] = useState(defaultOpts.pitch ?? DEFAULT_PITCH);
  const [volume, setVolume] = useState(defaultOpts.volume ?? DEFAULT_VOLUME);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const loadVoices = useCallback(() => {
    if (!isSupported) return;
    const available = window.speechSynthesis.getVoices();
    const voiceList: VoiceInfo[] = available.map((v) => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      default: v.default,
    }));
    setVoices(voiceList);

    if (!voice && voiceList.length > 0) {
      const defaultVoice = defaultOpts.lang
        ? voiceList.find((v) => v.lang.startsWith(defaultOpts.lang!)) || voiceList[0]
        : voiceList.find((v) => v.default) || voiceList[0];
      setVoice(defaultVoice);
    }
  }, [isSupported, voice, defaultOpts.lang]);

  useEffect(() => {
    if (!isSupported) return;

    loadVoices();

    const synth = window.speechSynthesis;
    synth.onvoiceschanged = loadVoices;

    return () => {
      synth.onvoiceschanged = null;
    };
  }, [isSupported, loadVoices]);

  const speak = useCallback(
    (text: string, opts: TTSOptions = {}) => {
      if (!isSupported || !text.trim()) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      const currentVoice = opts.voice ?? voice;
      if (currentVoice) {
        const realVoice = window.speechSynthesis
          .getVoices()
          .find((v) => v.voiceURI === currentVoice.voiceURI);
        if (realVoice) {
          utterance.voice = realVoice;
        }
      }

      utterance.rate = opts.rate ?? rate;
      utterance.pitch = opts.pitch ?? pitch;
      utterance.volume = opts.volume ?? volume;
      utterance.lang = opts.lang ?? defaultOpts.lang ?? 'zh-CN';

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, voice, rate, pitch, volume, defaultOpts.lang],
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    voice,
    voices,
    rate,
    pitch,
    volume,
    setRate,
    setPitch,
    setVolume,
    setVoice,
  };
}

// ===================== useSpeechToText Hook =====================

export function useSpeechToText(defaultOpts: STTOptions = {}): UseSpeechToTextReturn {
  const isSupported = checkSpeechRecognitionSupport();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef('');

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = defaultOpts.continuous ?? true;
    recognition.interimResults = defaultOpts.interimResults ?? true;
    recognition.lang = defaultOpts.lang ?? 'zh-CN';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;
        if (result.isFinal) {
          finalText += transcriptText;
        } else {
          interim += transcriptText;
        }
      }

      if (finalText) {
        finalTranscriptRef.current += finalText;
        setTranscript(finalTranscriptRef.current);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMsg = '语音识别出错';
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          errorMsg = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问';
          break;
        case 'no-speech':
          errorMsg = '未检测到语音输入';
          break;
        case 'audio-capture':
          errorMsg = '未检测到麦克风设备';
          break;
        case 'network':
          errorMsg = '网络错误，语音识别需要网络连接';
          break;
        case 'aborted':
          errorMsg = '语音识别已中止';
          break;
        default:
          errorMsg = `语音识别错误: ${event.error}`;
      }
      setError(errorMsg);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current && recognition.continuous) {
        try {
          recognitionRef.current.start();
        } catch {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [isSupported, defaultOpts.lang, defaultOpts.continuous, defaultOpts.interimResults]);

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;

    finalTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setError(null);

    try {
      recognitionRef.current.start();
    } catch (e) {
      setError('无法启动语音识别');
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
  }, [isSupported]);

  return {
    startListening,
    stopListening,
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
  };
}
