import { useState, useEffect, useCallback, useRef } from 'react';

interface UseTypewriterOptions {
  text: string;
  speed?: number;
  enabled?: boolean;
}

interface UseTypewriterReturn {
  displayText: string;
  isTyping: boolean;
  skip: () => void;
}

export function useTypewriter({ text, speed = 30, enabled = true }: UseTypewriterOptions): UseTypewriterReturn {
  const [displayText, setDisplayText] = useState(enabled ? '' : text);
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedRef = useRef(false);

  const skip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    skippedRef.current = true;
    setDisplayText(text);
    setIsTyping(false);
  }, [text]);

  useEffect(() => {
    if (!enabled) {
      setDisplayText(text);
      setIsTyping(false);
      return;
    }

    // 重置状态
    skippedRef.current = false;
    indexRef.current = 0;
    setDisplayText('');
    setIsTyping(true);

    const typeNext = () => {
      if (skippedRef.current) return;

      indexRef.current += 1;
      const nextIndex = indexRef.current;

      if (nextIndex >= text.length) {
        setDisplayText(text);
        setIsTyping(false);
      } else {
        setDisplayText(text.slice(0, nextIndex));
        timeoutRef.current = setTimeout(typeNext, speed);
      }
    };

    timeoutRef.current = setTimeout(typeNext, speed);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [text, speed, enabled]);

  return { displayText, isTyping, skip };
}
