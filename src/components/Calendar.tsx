'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, addMonths, subMonths, parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Mic, Plus, Gift,
  Bell, BellOff, Volume2, CalendarDays, Pencil, Trash2,
  RefreshCw, Flag, PartyPopper,
} from 'lucide-react';
import EventForm from './EventForm';
import VoiceInput from './VoiceInput';
import WeatherWidget from './WeatherWidget';
import AnniversaryPanel from './AnniversaryPanel';
import { CalendarEvent, EventPayload, Recurrence } from '@/lib/db';
import { listEvents, addEvent, updateEvent, deleteEvent, markNotified } from '@/lib/db';
import { Anniversary, listAnniversaries, anniversariesOnDay } from '@/lib/anniversaries';
import { supabase } from '@/lib/supabase';
import { getHoliday } from '@/lib/holidays';

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
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAnniversary, setShowAnniversary] = useState(false);
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

  // ── 이벤트 + 기념일 로드 ───────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const data = await listEvents();
    setEvents(data);
  }, []);

  const refreshAnniversaries = useCallback(async () => {
    const data = await listAnniversaries();
    setAnniversaries(data);
  }, []);

  useEffect(() => { refresh(); refreshAnniversaries(); }, [refresh, refreshAnniversaries]);

  // ── Supabase Realtime — 모든 기기 실시간 동기화 ────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anniversaries' }, () => {
        refreshAnniversaries();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, refreshAnniversaries]);

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
      if (!ev.notify || ev.notified || ev.all_day || ev.recurrence !== 'none') continue;
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
        if (!ev.notify || ev.notified || ev.all_day || ev.recurrence !== 'none') continue;
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
        if (!ev.notify || ev.notified || ev.all_day || ev.recurrence !== 'none') continue;
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

  const eventsOnDay = (day: Date) => events.filter(e => {
    const start = parseISO(e.start_at);
    // 시작일 이전에는 표시하지 않음
    if (day < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
    switch (e.recurrence) {
      case 'daily':   return !getHoliday(day);
      case 'weekly':  return day.getDay() === start.getDay();
      case 'monthly': return day.getDate() === start.getDate();
      default:        return isSameDay(start, day);
    }
  });

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
  const focusDay = selectedDay ?? new Date();
  const focusHoliday = getHoliday(focusDay);
  const focusAnniversaries = anniversariesOnDay(anniversaries, focusDay);
  const MEMBERS_CONFIG = [
    { name: '유찬', card: 'bg-blue-50 border-blue-100',   dot: 'bg-blue-400',   label: 'text-blue-700' },
    { name: '유주', card: 'bg-pink-50 border-pink-100',   dot: 'bg-pink-400',   label: 'text-pink-700' },
    { name: '엄마', card: 'bg-green-50 border-green-100', dot: 'bg-green-400',  label: 'text-green-700' },
    { name: '아빠', card: 'bg-orange-50 border-orange-100', dot: 'bg-orange-400', label: 'text-orange-700' },
  ] as const;
  const memberDayEvents = (name: string) =>
    events
      .filter(e => e.member === name && isSameDay(parseISO(e.start_at), focusDay))
      .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-pink-50 p-4">
      {/* 토스트 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-gray-900 text-white text-sm rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2">
            <Bell size={14} className="shrink-0" /> {t.message}
          </div>
        ))}
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {/* 날씨 */}
        <WeatherWidget />

        {/* 공휴일 배너 */}
        {focusHoliday && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Flag size={15} className="text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-600">{focusHoliday}</p>
              <p className="text-xs text-red-400">{format(focusDay, 'M월 d일 (E)', { locale: ko })} 공휴일</p>
            </div>
          </div>
        )}

        {/* 기념일 배너 */}
        {focusAnniversaries.map(a => (
          <div key={a.id} className="bg-purple-50 border border-purple-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-lg">
              {a.emoji}
            </div>
            <div>
              <p className="text-sm font-bold text-purple-700">{a.title}</p>
              <p className="text-xs text-purple-400">{a.month}월 {a.day}일 기념일</p>
            </div>
          </div>
        ))}

        {/* 주요 일정 (선택 날짜, 기본=오늘) */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            {format(focusDay, 'M월 d일 (E)', { locale: ko })} 주요 일정
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {MEMBERS_CONFIG.map(({ name, card, dot, label }) => {
              const list = memberDayEvents(name);
              return (
                <div key={name} className={`rounded-xl border p-3 ${card}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className={`text-xs font-bold ${label}`}>{name}</span>
                  </div>
                  {list.length === 0
                    ? <p className="text-xs text-gray-400">일정 없음</p>
                    : list.map(e => (
                      <div key={e.id} className="mb-1.5 last:mb-0">
                        <p className="text-xs font-medium text-gray-800 leading-tight">{e.title}</p>
                        {!e.all_day && (
                          <p className="text-[11px] text-gray-400">
                            {format(parseISO(e.start_at), 'a h:mm', { locale: ko })}
                          </p>
                        )}
                      </div>
                    ))
                  }
                </div>
              );
            })}
          </div>
        </div>

        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-gray-800">{format(currentMonth, 'yyyy년 M월', { locale: ko })}</h1>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 알림 배너 */}
        {!pushGranted ? (
          <button
            onClick={setupNotifications}
            className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 text-sm text-amber-700 w-full hover:bg-amber-100 transition"
          >
            <BellOff size={16} className="shrink-0" />
            <span>여기를 눌러 알림을 허용해 주세요 — 탭이 닫혀도 알려드려요</span>
          </button>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3 text-sm text-green-700">
            <Bell size={16} className="shrink-0" />
            <span className="flex-1">알림 켜짐 — 탭이 닫혀도 10분 전에 알려드려요</span>
            <button
              onClick={() => { initAudio(); playBeep(); speakText('유찬아, 알림 테스트예요!'); }}
              className="flex items-center gap-1 text-xs bg-green-100 hover:bg-green-200 px-2 py-1 rounded-lg transition whitespace-nowrap"
            ><Volume2 size={12} /> 소리 테스트</button>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={() => { setShowVoice(v => !v); setShowForm(false); setShowAnniversary(false); setEditingEvent(null); }}
            className={`flex-1 shadow rounded-2xl py-3 text-sm font-medium transition flex items-center justify-center gap-2 active:scale-95 ${
              showVoice
                ? 'bg-indigo-500 text-white ring-2 ring-indigo-300'
                : 'bg-white text-indigo-600 hover:bg-indigo-50'
            }`}
          ><Mic size={15} /> 음성 입력</button>
          <button
            onClick={() => { setFormInitial({}); setShowForm(s => !s); setShowVoice(false); setShowAnniversary(false); setEditingEvent(null); }}
            className={`flex-1 shadow rounded-2xl py-3 text-sm font-medium transition flex items-center justify-center gap-2 active:scale-95 ${
              showForm && !editingEvent
                ? 'bg-indigo-700 text-white ring-2 ring-indigo-300'
                : 'bg-indigo-500 text-white hover:bg-indigo-600'
            }`}
          ><Plus size={15} /> 일정 추가</button>
          <button
            onClick={() => { setShowAnniversary(s => !s); setShowForm(false); setShowVoice(false); setEditingEvent(null); }}
            className={`shadow rounded-2xl py-3 px-4 text-sm font-medium transition flex items-center justify-center gap-1.5 active:scale-95 ${
              showAnniversary
                ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                : 'bg-white text-purple-600 hover:bg-purple-50'
            }`}
          ><Gift size={15} /> 기념일</button>
        </div>

        {showVoice && <VoiceInput onParsed={handleVoiceParsed} />}
        {showAnniversary && (
          <AnniversaryPanel list={anniversaries} onChanged={refreshAnniversaries} />
        )}

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
              const da = anniversariesOnDay(anniversaries, day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isSameDay(day, new Date());
              const holiday = getHoliday(day);
              const isSun = day.getDay() === 0;
              const isSat = day.getDay() === 6;
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => { setSelectedDay(day); setShowForm(false); setEditingEvent(null); setSelectedEvent(null); }}
                  className={`rounded-xl p-1 cursor-pointer transition min-h-[52px] ${!isSameMonth(day, currentMonth) ? 'opacity-30' : ''} ${isSelected ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-gray-50'}`}
                >
                  <div className={`text-xs text-center font-semibold mb-0.5 w-6 h-6 flex items-center justify-center mx-auto rounded-full ${
                    isToday ? 'bg-indigo-500 text-white' :
                    holiday || isSun ? 'text-red-500' :
                    isSat ? 'text-blue-500' : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  {holiday && (
                    <p className="text-[8px] text-red-400 text-center leading-tight truncate px-0.5 mb-0.5">
                      {holiday.replace(' 연휴', '').replace('·', '/')}
                    </p>
                  )}
                  {da.map(a => (
                    <p key={a.id} className="text-[8px] text-purple-400 text-center leading-tight truncate px-0.5 mb-0.5">
                      {a.emoji}{a.title}
                    </p>
                  ))}
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
                    {e.recurrence !== 'none' && (
                      <span className="flex items-center gap-0.5 text-[10px] bg-teal-100 text-teal-600 rounded-full px-1.5 py-0.5">
                        <RefreshCw size={9} />
                        {({'daily':'매일', 'weekly':'매주', 'monthly':'매월'} as Record<string,string>)[e.recurrence]}
                      </span>
                    )}
                    {e.notify && e.recurrence === 'none' && <Bell size={12} className="text-gray-400 shrink-0" />}
                  </div>
                  {!e.all_day && (
                    <p className="text-xs text-gray-400 mt-1 ml-4">
                      {format(parseISO(e.start_at), 'a h:mm', { locale: ko })}
                      {e.end_at ? ` ~ ${format(parseISO(e.end_at), 'a h:mm', { locale: ko })}` : ''}
                    </p>
                  )}
                  {selectedEvent?.id === e.id && (
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={ev => { ev.stopPropagation(); handleEditEvent(e); }} className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition">
                        <Pencil size={11} /> 수정
                      </button>
                      <button onClick={ev => { ev.stopPropagation(); handleDeleteEvent(e.id); }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition">
                        <Trash2 size={11} /> 삭제
                      </button>
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
            <h2 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <CalendarDays size={15} className="text-indigo-500" />
              {editingEvent ? '일정 수정' : '새 일정 추가'}
            </h2>
            <EventForm
              initial={formInitial}
              submitLabel={editingEvent ? '수정 저장' : '저장'}
              onSubmit={handleSaveEvent}
              onCancel={() => { setShowForm(false); setEditingEvent(null); }}
            />
          </div>
        )}

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
