'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2, CheckCircle } from 'lucide-react';

interface ParsedEvent {
  title: string;
  member: string;
  start_at: string;
  end_at?: string;
}

interface Props {
  onParsed: (event: ParsedEvent) => void;
}

export default function VoiceInput({ onParsed }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedEvent | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const parseWithAI = useCallback(async (text: string) => {
    setParsing(true);
    setError('');
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
      setParsed(data);
    } catch {
      setError('AI 파싱에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setParsing(false);
    }
  }, []);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionClass = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setError('이 브라우저는 음성 인식을 지원하지 않아요. Chrome을 사용해주세요.');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const result = Array.from(e.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join('');
      setTranscript(result);
      if (e.results[e.results.length - 1].isFinal) {
        parseWithAI(result);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      setError(`음성 인식 오류: ${e.error}`);
      setListening(false);
    };

    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
    setTranscript('');
    setParsed(null);
    setError('');
  }, [parseWithAI]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const confirm = () => {
    if (parsed) {
      onParsed(parsed);
      setTranscript('');
      setParsed(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={listening ? stopListening : startListening}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-md ${
            listening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-indigo-500 text-white hover:bg-indigo-600'
          }`}
        >
          {listening ? <Square size={20} /> : <Mic size={22} />}
        </button>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">
            {listening ? '듣는 중...' : '버튼을 눌러 말하세요'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            예: "유찬 다음주 화요일 오후 3시 수학학원"
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {transcript && (
        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-sm text-gray-600 italic">"{transcript}"</p>
        </div>
      )}

      {parsing && (
        <div className="flex items-center gap-2 text-sm text-indigo-500">
          <Loader2 size={15} className="animate-spin" />
          AI가 일정을 분석하고 있어요...
        </div>
      )}

      {parsed && !parsing && (
        <div className="bg-indigo-50 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-semibold text-indigo-500 flex items-center gap-1">
            <CheckCircle size={12} /> AI 인식 결과
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-gray-500">누구</span>
            <span className="font-medium text-gray-800">{parsed.member}</span>
            <span className="text-gray-500">제목</span>
            <span className="font-medium text-gray-800">{parsed.title}</span>
            <span className="text-gray-500">시작</span>
            <span className="font-medium text-gray-800">
              {new Date(parsed.start_at).toLocaleString('ko-KR', { month:'numeric', day:'numeric', weekday:'short', hour:'numeric', minute:'2-digit' })}
            </span>
            {parsed.end_at && (
              <>
                <span className="text-gray-500">종료</span>
                <span className="font-medium text-gray-800">
                  {new Date(parsed.end_at).toLocaleString('ko-KR', { hour:'numeric', minute:'2-digit' })}
                </span>
              </>
            )}
          </div>
          <button
            onClick={confirm}
            className="mt-1 w-full bg-indigo-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-indigo-600 transition"
          >
            일정 추가하기
          </button>
        </div>
      )}
    </div>
  );
}
