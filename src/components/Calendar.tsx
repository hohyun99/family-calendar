'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, addMonths, subMonths, parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';
import EventForm from './EventForm';
import VoiceInput from './VoiceInput';
import WeeklyView from './WeeklyView';
import WeatherWidget from './WeatherWidget';
import { CalendarEvent, EventPayload } from '@/types/event';
import { listEvents, addEvent, updateEvent, deleteEvent, markNotified } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const MEMBER_COLORS: Record<string, string> = {
  유찬: 'bg-blue-400', 유주: 'bg-pink-400', 엄마: 'bg-green-400', 아빠: 'bg-orange-400',
};
const MEMBER_TEXT: Record<string, string> = {
  유찬: 'text-blue-700', 유주: 'text-pink-700', 엄마: 'text-green-700', 아빠: 'text-orange-700',
};
const MEMBER_CALL: Record<string, string> = {
  유찬: '유찬아', 유주: '유주야', 엄마: '여보', 아빠: '자기야',
};

// ── 오디오 ──────────────────────────────────────────────────────────────
const audioCtxRef = { current: null as AudioContext | null };
const audioReadyRef = { current: false };

function initAudio() {
  if (audioReadyRef.current) return;
  audioReadyRef.current = true;
  const ctx = new AudioContext();
  audioCtxRef.current = ctx;
  const playSilent = () => {
    if (ctx.state === 'suspended') ctx.resume();
    const buf = ctx.createBuffer(1, ctx.sampleRate / 10, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
  };
  playSilent();
  setInterval(playSilent, 5000);
}

function playBeep() {
  const ctx = audioCtxRef.current;
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc.start(now); osc.stop(now + 0.8);
}

function speakText(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

// ── Web Push ─────────────────────────────────────────────────────────────
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    });
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
  } catch { /* Push 미지원 환경 */ }
}

// ─────────────────────────────────────────────────────────────────────────

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<EventPayload>>({});
  const [showVoice, setShowVoice] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [pushGranted, setPushGranted] = useState(false);

  const addToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 8000);
  }, []);

  const fireVoice = useCallback((ev: CalendarEvent) => {
    const call = MEMBER_CALL[ev.member] ?? `${ev.member}아`;
    playBeep();
    speakText(`${call}, ${ev.title} 할 시간이에요. 10분 후에 시작해요.`);
    addToast(`${call} ${ev.title} 할 시간이에요! 10분 후 시작해요.`);
  }, [addToast]);

  // ── 이벤트 로드 ────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const data = await listEvents();
    setEvents(data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Supabase Realtime — 모든 기기 실시간 동기화 ────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  // ── Service Worker 메시지 수신 (SW → 탭 TTS) ───────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'NOTIFY') {
        const call = MEMBER_CALL[e.data.member] ?? `${e.data.member}아`;
        playBeep();
        speakText(`${call}, ${e.data.eventTitle} 할 시간이에요. 10분 후에 시작해요.`);
        addToast(`${call} ${e.data.eventTitle} 할 시간이에요! 10분 후 시작해요.`);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [addToast]);

  // ── Web Locks — 탭 freeze 방지 ─────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locks = (navigator as any).locks;
    if (!locks) return;
    let released = false;
    locks.request('calendar-active', { mode: 'shared' },
      () => new Promise<void>(r => { const t = setInterval(() => { if (released) { clearInterval(t); r(); } }, 5000); })
    );
    return () => { released = true; };
  }, []);

  // ── 알림 발화 (중복 방지용 Set) ────────────────────────────────────────
  const firedRef = useRef<Set<string>>(new Set());

  const maybeFire = useCallback(async (ev: CalendarEvent) => {
    if (firedRef.current.has(ev.id)) return;
    firedRef.current.add(ev.id);
    fireVoice(ev);
    await markNotified(ev.id);
    refresh();
  }, [fireVoice, refresh]);

  // ── 정확한 setTimeout 예약 ─────────────────────────────────────────────
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();
    for (const ev of events) {
      if (!ev.notify || ev.notified || ev.all_day) continue;
      const delay = new Date(ev.start_at).getTime() - 10 * 60 * 1000 - now;
      if (delay >= 0 && delay < 24 * 60 * 60 * 1000) {
        timers.push(setTimeout(() => maybeFire(ev), delay));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [events, maybeFire]);

  // ── 탭 복귀 시 놓친 알림 체크 ─────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      await refresh();
      const now = Date.now();
      for (const ev of events) {
        if (!ev.notify || ev.notified || ev.all_day) continue;
        const fireAt = new Date(ev.start_at).getTime() - 10 * 60 * 1000;
        // 놓친 알림: 지금보다 최대 5분 전까지
        if (fireAt <= now && fireAt >= now - 5 * 60 * 1000) {
          maybeFire(ev);
        }
      }
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [events, maybeFire, refresh]);

  // ── 60초 폴링 (setTimeout 보조) ────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      const now = Date.now();
      for (const ev of events) {
        if (!ev.notify || ev.notified || ev.all_day) continue;
        const fireAt = new Date(ev.start_at).getTime() - 10 * 60 * 1000;
        if (fireAt <= now && fireAt >= now - 60 * 1000) {
          maybeFire(ev);
        }
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [events, maybeFire]);

  // ── 알림 권한 + Service Worker 초기화 ─────────────────────────────────
  const setupNotifications = async () => {
    initAudio();
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setPushGranted(true);
      await subscribeToPush();
    }
  };

  useEffect(() => {
    if (Notification.permission === 'granted') {
      setPushGranted(true);
      subscribeToPush();
    }
  }, []);

  // ── 달력 헬퍼 ──────────────────────────────────────────────────────────
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
  });
  const eventsOnDay = (day: Date) => events.filter(e => isSameDay(parseISO(e.start_at), day));

  // ── 이벤트 핸들러 ──────────────────────────────────────────────────────
  const handleSaveEvent = async (data: EventPayload) => {
    if (editingEvent) {
      await updateEvent(editingEvent.id, data);
      setEditingEvent(null);
    } else {
      await addEvent(data);
    }
    setShowForm(false);
    setSelectedEvent(null);
    // Realtime이 refresh() 호출하므로 별도 호출 불필요
  };

  const handleEditEvent = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setFormInitial({ title: ev.title, member: ev.member, start_at: ev.start_at, end_at: ev.end_at ?? undefined, all_day: ev.all_day, notify: ev.notify });
    setShowForm(true); setShowVoice(false); setSelectedEvent(null);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('이 일정을 삭제할까요?')) return;
    await deleteEvent(id);
    setSelectedEvent(null);
  };

  const handleVoiceParsed = (parsed: { title: string; member: string; start_at: string; end_at?: string }) => {
    setFormInitial({ title: parsed.title, member: parsed.member, start_at: parsed.start_at, end_at: parsed.end_at });
    setEditingEvent(null); setShowVoice(false); setShowForm(true);
    setSelectedDay(new Date(parsed.start_at));
  };

  const todayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-pink-50 p-4">
      {/* 토스트 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-gray-900 text-white text-sm rounded-2xl px-4 py-3 shadow-xl">
            🔔 {t.message}
          </div>
        ))}
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {/* 날씨 */}
        <WeatherWidget />

        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="text-gray-400 hover:text-gray-700 text-xl px-2">‹</button>
          <h1 className="text-lg font-bold text-gray-800">{format(currentMonth, 'yyyy년 M월', { locale: ko })}</h1>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="text-gray-400 hover:text-gray-700 text-xl px-2">›</button>
        </div>

        {/* 알림 배너 */}
        {!pushGranted ? (
          <button
            onClick={setupNotifications}
            className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700 w-full hover:bg-amber-100 transition"
          >
            <span>🔔</span>
            <span>여기를 눌러 알림을 허용해 주세요 — 탭이 닫혀도 알려드려요</span>
          </button>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-green-700">
            <span>🔔</span>
            <span className="flex-1">알림 켜짐 — 탭이 닫혀도 10분 전에 알려드려요</span>
            <button
              onClick={() => { initAudio(); playBeep(); speakText('유찬아, 알림 테스트예요!'); }}
              className="text-xs bg-green-100 hover:bg-green-200 px-2 py-1 rounded-lg transition whitespace-nowrap"
            >소리 테스트</button>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={() => { setShowVoice(v => !v); setShowForm(false); }}
            className={`flex-1 shadow rounded-2xl py-3 text-sm font-medium transition flex items-center justify-center gap-2 ${showVoice ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}
          >🎤 음성으로 추가</button>
          <button
            onClick={() => { setFormInitial({}); setShowForm(true); setShowVoice(false); setEditingEvent(null); }}
            className="flex-1 bg-indigo-500 shadow rounded-2xl py-3 text-sm font-medium text-white hover:bg-indigo-600 transition flex items-center justify-center gap-2"
          >✚ 직접 입력</button>
        </div>

        {showVoice && <VoiceInput onParsed={handleVoiceParsed} />}

        {/* 달력 */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="grid grid-cols-7 mb-2">
            {['일','월','화','수','목','금','토'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map(day => {
              const de = eventsOnDay(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => { setSelectedDay(day); setShowForm(false); setEditingEvent(null); setSelectedEvent(null); }}
                  className={`rounded-xl p-1 cursor-pointer transition min-h-[52px] ${!isSameMonth(day, currentMonth) ? 'opacity-30' : ''} ${isSelected ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-gray-50'}`}
                >
                  <div className={`text-xs text-center font-semibold mb-1 w-6 h-6 flex items-center justify-center mx-auto rounded-full ${isToday ? 'bg-indigo-500 text-white' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {de.slice(0, 2).map(e => (
                      <div key={e.id} className={`text-white text-[9px] rounded px-1 truncate ${MEMBER_COLORS[e.member] ?? 'bg-gray-400'}`}>
                        {e.title}
                      </div>
                    ))}
                    {de.length > 2 && <div className="text-[9px] text-gray-400 text-center">+{de.length - 2}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 선택된 날 일정 */}
        {selectedDay && !showForm && (
          <div className="bg-white rounded-2xl shadow p-4 space-y-2">
            <h2 className="text-sm font-bold text-gray-700">{format(selectedDay, 'M월 d일 (E)', { locale: ko })} 일정</h2>
            {todayEvents.length === 0
              ? <p className="text-sm text-gray-400">일정이 없어요.</p>
              : todayEvents.map(e => (
                <div
                  key={e.id}
                  onClick={() => setSelectedEvent(selectedEvent?.id === e.id ? null : e)}
                  className="border border-gray-100 rounded-xl p-3 cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${MEMBER_COLORS[e.member] ?? 'bg-gray-400'}`} />
                    <span className={`text-xs font-semibold ${MEMBER_TEXT[e.member] ?? 'text-gray-600'}`}>{e.member}</span>
                    <span className="text-sm font-medium text-gray-800 flex-1">{e.title}</span>
                    {e.notify && <span className="text-xs text-gray-400">🔔</span>}
                  </div>
                  {!e.all_day && (
                    <p className="text-xs text-gray-400 mt-1 ml-4">
                      {format(parseISO(e.start_at), 'a h:mm', { locale: ko })}
                      {e.end_at ? ` ~ ${format(parseISO(e.end_at), 'a h:mm', { locale: ko })}` : ''}
                    </p>
                  )}
                  {selectedEvent?.id === e.id && (
                    <div className="mt-2 flex justify-end gap-3">
                      <button onClick={ev => { ev.stopPropagation(); handleEditEvent(e); }} className="text-xs text-indigo-500 hover:text-indigo-700">수정</button>
                      <button onClick={ev => { ev.stopPropagation(); handleDeleteEvent(e.id); }} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}

        {/* 폼 */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-4">{editingEvent ? '일정 수정' : '새 일정 추가'}</h2>
            <EventForm
              initial={formInitial}
              submitLabel={editingEvent ? '수정 저장' : '저장'}
              onSubmit={handleSaveEvent}
              onCancel={() => { setShowForm(false); setEditingEvent(null); }}
            />
          </div>
        )}

        {/* 주간 일정 */}
        <WeeklyView events={events} />

        {/* 범례 */}
        <div className="bg-white rounded-2xl shadow p-3 flex justify-around">
          {Object.entries(MEMBER_COLORS).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${color}`} />
              <span className="text-xs text-gray-600">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
