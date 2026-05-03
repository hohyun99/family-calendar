'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, addMonths, subMonths,
  parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';
import EventForm from './EventForm';
import VoiceInput from './VoiceInput';
import WeeklyView from './WeeklyView';
import { EventPayload, CalendarEvent } from '@/types/event';
import { listEvents, addEvent, updateEvent, deleteEvent, markNotified } from '@/lib/storage';

const MEMBER_COLORS: Record<string, string> = {
  유찬: 'bg-blue-400',
  유주: 'bg-pink-400',
  엄마: 'bg-green-400',
  아빠: 'bg-orange-400',
};

const MEMBER_TEXT: Record<string, string> = {
  유찬: 'text-blue-700',
  유주: 'text-pink-700',
  엄마: 'text-green-700',
  아빠: 'text-orange-700',
};

const MEMBER_CALL: Record<string, string> = {
  유찬: '유찬아',
  유주: '유주야',
  엄마: '여보',
  아빠: '자기야',
};

async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

function sendBrowserNotification(event: CalendarEvent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const call = MEMBER_CALL[event.member] ?? `${event.member}아`;
  new Notification(`📅 ${event.member} 일정 알림`, {
    body: `${call} ${event.title} 할 시간이에요! 10분 후 시작해요.`,
  });
}

// Web Audio API로 "딩동" 소리 — speechSynthesis보다 백그라운드에서 안정적
function playBeep(ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc.start(now);
  osc.stop(now + 0.8);
}

function speakText(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<EventPayload>>({});
  const [showVoice, setShowVoice] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission>('default');
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioReadyRef = useRef(false);

  // AudioContext 초기화 + 사일런트 루프 시작 (사용자 제스처 필요)
  const initAudio = useCallback(() => {
    if (audioReadyRef.current) return;
    audioReadyRef.current = true;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // 5초마다 무음 버퍼 재생 → AudioContext suspended 방지
    const playSilent = () => {
      if (ctx.state === 'suspended') ctx.resume();
      const buf = ctx.createBuffer(1, ctx.sampleRate / 10, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
    };
    playSilent();
    setInterval(playSilent, 5000);
  }, []);

  // Web Locks API — 탭이 freeze되지 않도록 잠금 유지
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locks = (navigator as any).locks;
    if (!locks) return;
    let released = false;
    locks.request('calendar-keep-alive', { mode: 'shared' },
      () => new Promise<void>(resolve => {
        const t = setInterval(() => { if (released) { clearInterval(t); resolve(); } }, 5000);
      })
    );
    return () => { released = true; };
  }, []);

  const refresh = useCallback(() => setEvents(listEvents()), []);

  useEffect(() => {
    refresh();
    if (typeof Notification !== 'undefined') setNotifyPermission(Notification.permission);
  }, [refresh]);

  const addToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000);
  }, []);

  const fireNotification = useCallback((ev: CalendarEvent) => {
    const call = MEMBER_CALL[ev.member] ?? `${ev.member}아`;
    const msg = `${call} ${ev.title} 할 시간이에요! 10분 후 시작해요.`;
    sendBrowserNotification(ev);
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      playBeep(audioCtxRef.current);
    }
    speakText(`${call}, ${ev.title} 할 시간이에요. 10분 후에 시작해요.`);
    addToast(msg);
    markNotified(ev.id);
  }, [addToast]);

  // ── 핵심: 이벤트마다 정확한 setTimeout 예약 ──────────────────────────
  // setInterval 폴링은 Chrome이 탭을 suspend하면 멈춤.
  // setTimeout으로 정확한 시각에 예약하면 훨씬 안정적.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();

    for (const ev of events) {
      if (!ev.notify || ev.notified || ev.all_day) continue;
      const notifyAt = new Date(ev.start_at).getTime() - 10 * 60 * 1000;
      const delay = notifyAt - now;
      // 0초~24시간 이내인 것만 예약 (과거 또는 너무 먼 미래 제외)
      if (delay >= 0 && delay < 24 * 60 * 60 * 1000) {
        timers.push(setTimeout(() => {
          fireNotification(ev);
          refresh();
        }, delay));
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [events, fireNotification, refresh]);

  // ── 보조: 60초 폴링 (setTimeout 예약이 누락될 경우 안전망) ──────────
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const all = listEvents();
      for (const ev of all) {
        if (!ev.notify || ev.notified || ev.all_day) continue;
        const diff = new Date(ev.start_at).getTime() - now;
        if (diff >= 8 * 60 * 1000 && diff <= 12 * 60 * 1000) {
          fireNotification(ev);
        }
      }
      refresh();
    };

    const timer = setInterval(check, 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fireNotification, refresh]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
  });

  const eventsOnDay = (day: Date) =>
    events.filter(e => isSameDay(parseISO(e.start_at), day));

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    setShowForm(false);
    setEditingEvent(null);
    setSelectedEvent(null);
  };

  const handleSaveEvent = async (data: EventPayload) => {
    if (editingEvent) {
      updateEvent(editingEvent.id, {
        title: data.title, member: data.member,
        start_at: data.start_at, end_at: data.end_at ?? null,
        all_day: data.all_day, notify: data.notify, notified: editingEvent.notified,
      });
      setEditingEvent(null);
    } else {
      addEvent({
        title: data.title, member: data.member,
        start_at: data.start_at, end_at: data.end_at ?? null,
        all_day: data.all_day, notify: data.notify,
      });
    }
    refresh();
    setShowForm(false);
    setSelectedEvent(null);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormInitial({
      title: event.title, member: event.member,
      start_at: event.start_at, end_at: event.end_at ?? undefined,
      all_day: event.all_day, notify: event.notify,
    });
    setShowForm(true);
    setShowVoice(false);
    setSelectedEvent(null);
  };

  const handleDeleteEvent = (id: number) => {
    if (!confirm('이 일정을 삭제할까요?')) return;
    deleteEvent(id);
    refresh();
    setSelectedEvent(null);
  };

  const handleVoiceParsed = (parsed: { title: string; member: string; start_at: string; end_at?: string }) => {
    setFormInitial({ title: parsed.title, member: parsed.member, start_at: parsed.start_at, end_at: parsed.end_at });
    setEditingEvent(null);
    setShowVoice(false);
    setShowForm(true);
    setSelectedDay(new Date(parsed.start_at));
  };

  const todayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-pink-50 p-4">
      {/* 토스트 알림 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-gray-900 text-white text-sm rounded-2xl px-4 py-3 shadow-xl">
            🔔 {t.message}
          </div>
        ))}
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="text-gray-400 hover:text-gray-700 text-xl px-2">‹</button>
          <h1 className="text-lg font-bold text-gray-800">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h1>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="text-gray-400 hover:text-gray-700 text-xl px-2">›</button>
        </div>

        {/* 알림 권한 배너 */}
        {notifyPermission === 'denied' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-600">
            <span>🔕</span>
            <span className="flex-1">알림이 차단되어 있어요. 브라우저 설정 → 이 사이트 → 알림 허용으로 변경해 주세요.</span>
          </div>
        )}
        {notifyPermission === 'default' && (
          <button
            onClick={async () => {
              initAudio(); // 버튼 클릭 시점에 AudioContext + Web Lock 활성화
              setNotifyPermission(await requestNotificationPermission());
            }}
            className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700 w-full hover:bg-amber-100 transition"
          >
            <span>🔔</span>
            <span>10분 전 알림을 받으려면 여기를 눌러 허용해 주세요</span>
          </button>
        )}
        {notifyPermission === 'granted' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-green-700">
            <span>🔔</span>
            <span className="flex-1">알림 켜짐 — 탭이 열려 있는 동안 소리+음성으로 알려드려요.</span>
            <button
              onClick={() => {
                initAudio();
                if (audioCtxRef.current) playBeep(audioCtxRef.current);
                speakText('유찬아, 알림 테스트예요!');
              }}
              className="text-xs bg-green-100 hover:bg-green-200 px-2 py-1 rounded-lg transition whitespace-nowrap"
            >
              소리 테스트
            </button>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={() => { setShowVoice(v => !v); setShowForm(false); }}
            className={`flex-1 shadow rounded-2xl py-3 text-sm font-medium transition flex items-center justify-center gap-2 ${
              showVoice ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            🎤 음성으로 추가
          </button>
          <button
            onClick={() => { setFormInitial({}); setShowForm(true); setShowVoice(false); }}
            className="flex-1 bg-indigo-500 shadow rounded-2xl py-3 text-sm font-medium text-white hover:bg-indigo-600 transition flex items-center justify-center gap-2"
          >
            ✚ 직접 입력
          </button>
        </div>

        {showVoice && <VoiceInput onParsed={handleVoiceParsed} />}

        {/* 달력 */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="grid grid-cols-7 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map(day => {
              const dayEvents = eventsOnDay(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  className={`rounded-xl p-1 cursor-pointer transition min-h-[52px] ${
                    !isSameMonth(day, currentMonth) ? 'opacity-30' : ''
                  } ${isSelected ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-gray-50'}`}
                >
                  <div className={`text-xs text-center font-semibold mb-1 w-6 h-6 flex items-center justify-center mx-auto rounded-full ${
                    isToday ? 'bg-indigo-500 text-white' : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(e => (
                      <div
                        key={e.id}
                        className={`text-white text-[9px] rounded px-1 truncate ${MEMBER_COLORS[e.member] ?? 'bg-gray-400'}`}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-gray-400 text-center">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 선택된 날 이벤트 목록 */}
        {selectedDay && !showForm && (
          <div className="bg-white rounded-2xl shadow p-4 space-y-2">
            <h2 className="text-sm font-bold text-gray-700">
              {format(selectedDay, 'M월 d일 (E)', { locale: ko })} 일정
            </h2>
            {todayEvents.length === 0 ? (
              <p className="text-sm text-gray-400">일정이 없어요.</p>
            ) : (
              todayEvents.map(e => (
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
                      <button
                        onClick={ev => { ev.stopPropagation(); handleEditEvent(e); }}
                        className="text-xs text-indigo-500 hover:text-indigo-700"
                      >수정</button>
                      <button
                        onClick={ev => { ev.stopPropagation(); handleDeleteEvent(e.id); }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >삭제</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 이벤트 추가/수정 폼 */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-4">
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

        {/* 주간 일정표 */}
        <WeeklyView />

        {/* 가족 구성원 범례 */}
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
