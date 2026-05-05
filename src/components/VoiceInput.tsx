'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface ParsedEvent {
  title: string;
  member: string;
  start_at: string;
  end_at?: string;
}

interface Props {
  onParsed: (event: ParsedEvent) => void;
  onError?: (msg: string) => void;
}

export default function VoiceInput({ onParsed, onError }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const parseWithAI = useCallback(async (text: string) => {
    setParsing(true);
    try {
      const res = await fetch('/api/parse-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          now: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onParsed(data);
    } catch {
      onError?.('AI 파싱에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setParsing(false);
    }
  }, [onParsed, onError]);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      onError?.('이 브라우저는 음성 인식을 지원하지 않아요. Chrome을 사용해주세요.');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const result = Array.from(e.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript).join('');
      setTranscript(result);
      if (e.results[e.results.length - 1].isFinal) {
        parseWithAI(result);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      onError?.(`음성 인식 오류: ${e.error}`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
    setTranscript('');
  }, [parseWithAI, onError]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // 마운트되면 바로 마이크 시작
  useEffect(() => { startListening(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white rounded-2xl shadow px-4 py-3 flex items-center gap-3">
      <button
        onClick={listening ? stopListening : startListening}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
          listening ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-100 text-indigo-500'
        }`}
      >
        {listening ? <Square size={16} /> : <Mic size={18} />}
      </button>

      <div className="flex-1 min-w-0">
        {parsing ? (
          <p className="text-sm text-indigo-500 flex items-center gap-1.5">
            <Loader2 size={13} className="animate-spin shrink-0" /> AI 분석 중...
          </p>
        ) : transcript ? (
          <p className="text-sm text-gray-700 truncate">"{transcript}"</p>
        ) : (
          <p className="text-sm text-gray-400">
            {listening ? '듣는 중...' : '버튼을 눌러 다시 말하세요'}
          </p>
        )}
      </div>
    </div>
  );
}
