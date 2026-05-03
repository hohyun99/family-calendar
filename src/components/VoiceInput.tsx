'use client';

import { useState, useRef, useCallback } from 'react';

interface ParsedEvent {
  title: string;
  member: string;
  start_at: string;
  end_at?: string;
}

interface Props {
  onParsed: (event: ParsedEvent) => void;
}

const MEMBERS = ['유찬', '유주', '엄마', '아빠'];

// 간단한 텍스트 파싱 — "유찬 내일 오후 3시 수학학원" 형태
function parseVoiceText(text: string): ParsedEvent | null {
  const now = new Date();
  let member = '유찬';
  let title = text;

  // 가족 구성원 추출
  for (const m of MEMBERS) {
    if (text.includes(m)) {
      member = m;
      title = text.replace(m, '').trim();
      break;
    }
  }

  // 날짜 파싱
  let date = new Date(now);
  if (text.includes('내일')) {
    date.setDate(date.getDate() + 1);
    title = title.replace('내일', '').trim();
  } else if (text.includes('모레')) {
    date.setDate(date.getDate() + 2);
    title = title.replace('모레', '').trim();
  } else if (text.includes('오늘')) {
    title = title.replace('오늘', '').trim();
  }

  // 요일 파싱
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 0; i < days.length; i++) {
    const pattern = new RegExp(`${days[i]}요일`);
    if (pattern.test(text)) {
      const diff = (i - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + diff);
      title = title.replace(pattern, '').trim();
      break;
    }
  }

  // 시간 파싱
  const hourMatch = title.match(/(?:오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    const minute = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    if (title.includes('오후') && hour < 12) hour += 12;
    if (title.includes('오전') && hour === 12) hour = 0;
    date.setHours(hour, minute, 0, 0);
    title = title.replace(/(?:오전|오후)?\s*\d{1,2}시(?:\s*\d{1,2}분)?/, '').trim();
  } else {
    // 시간 없으면 현재 시간 + 1시간
    date.setHours(date.getHours() + 1, 0, 0, 0);
  }

  title = title.replace(/\s+/g, ' ').trim();
  if (!title) return null;

  return {
    title,
    member,
    start_at: date.toISOString(),
  };
}

export default function VoiceInput({ onParsed }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedEvent | null>(null);
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionClass = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.');
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
        const p = parseVoiceText(result);
        setParsed(p);
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
  }, []);

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
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all shadow-md ${
            listening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-indigo-500 text-white hover:bg-indigo-600'
          }`}
        >
          {listening ? '⏹' : '🎤'}
        </button>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">
            {listening ? '듣는 중...' : '버튼을 눌러 음성으로 일정을 추가하세요'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            예: "유찬 내일 오후 3시 수학학원"
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {transcript && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-sm text-gray-600 italic">"{transcript}"</p>
        </div>
      )}

      {parsed && (
        <div className="bg-indigo-50 rounded-xl p-3 space-y-1">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">인식된 일정</p>
          <p className="text-sm"><span className="font-medium">누구:</span> {parsed.member}</p>
          <p className="text-sm"><span className="font-medium">제목:</span> {parsed.title}</p>
          <p className="text-sm"><span className="font-medium">시간:</span> {new Date(parsed.start_at).toLocaleString('ko-KR')}</p>
          <button
            onClick={confirm}
            className="mt-2 w-full bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-600 transition"
          >
            일정 추가하기
          </button>
        </div>
      )}
    </div>
  );
}
