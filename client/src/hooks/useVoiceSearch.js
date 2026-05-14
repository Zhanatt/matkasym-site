/**
 * useVoiceSearch — хук для голосового ввода через Web Speech API
 * Поддерживается: Chrome, Edge, Safari (iOS/macOS 15+)
 * Не поддерживается: Firefox (fallback — просто нет кнопки)
 */
import { useState, useRef, useCallback } from 'react';

export function useVoiceSearch({ onResult, lang = 'ru-RU' } = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError]         = useState(null);
  const recognitionRef            = useRef(null);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const start = useCallback(() => {
    if (!isSupported) {
      setError('Голосовой ввод не поддерживается вашим браузером');
      return;
    }

    // Если уже слушаем — останавливаем
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    setError(null);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognitionRef.current = recognition;

    recognition.lang           = lang;
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onResult?.(transcript);
    };

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') {
        setError(
          e.error === 'not-allowed'
            ? 'Разрешите доступ к микрофону'
            : `Ошибка распознавания: ${e.error}`
        );
      }
    };

    recognition.onend = () => setListening(false);

    recognition.start();
  }, [isSupported, listening, lang, onResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { listening, error, isSupported, start, stop };
}
