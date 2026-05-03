'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, addMonths, subMonths,
  parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';
import EventForm from './EventForm';
import VoiceInput from './VoiceInput';
import { EventPayload, CalendarEvent } from '@/types/event';
import { listEvents, addEvent, deleteEvent, getUpcomingEvents, markNotified } from '@/lib/storage';

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

async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function sendBrowserNotification(event: CalendarEvent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const call = MEMBER_CALL[event.member] ?? `${event.member}아`;
  const body = `${call} ${event.title} 할 시간이에요! 10분 후 시작해요.`;
  new Notification(`📅 ${event.member} 일정 알림`, { body, icon: '/favicon.ico' });
}

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<EventPayload>>({});
  const [showVoice, setShowVoice] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const refresh = useCallback(() => setEvents(listEvents()), []);

  useEffect(() => {
    refresh();
    requestNotificationPermission();
  }, [refresh]);

  // 매분 알림 체크
  useEffect(() => {
    const check = () => {
      const upcoming = getUpcomingEvents();
      for (const ev of upcoming) {
        sendBrowserNotification(ev);
        markNotified(ev.id);
      }
      if (upcoming.length > 0) refresh();
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
  });

  const eventsOnDay = (day: Date) =>
    events.filter(e => isSameDay(parseISO(e.start_at), day));

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    setShowForm(false);
    setSelectedEvent(null);
  };

  const handleAddEvent = async (data: EventPayload) => {
    addEvent({
      title: data.title,
      member: data.member,
      start_at: data.start_at,
      end_at: data.end_at ?? null,
      all_day: data.all_day,
      notify: data.notify,
    });
    refresh();
    setShowForm(false);
  };

  const handleDeleteEvent = (id: number) => {
    if (!confirm('이 일정을 삭제할까요?')) return;
    deleteEvent(id);
    refresh();
    setSelectedEvent(null);
  };

  const handleVoiceParsed = (parsed: { title: string; member: string; start_at: string; end_at?: string }) => {
    setFormInitial({ title: parsed.title, member: parsed.member, start_at: parsed.start_at, end_at: parsed.end_at });
    setShowVoice(false);
    setShowForm(true);
    setSelectedDay(new Date(parsed.start_at));
  };

  const todayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-pink-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="text-gray-400 hover:text-gray-700 text-xl px-2">‹</button>
          <h1 className="text-lg font-bold text-gray-800">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h1>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="text-gray-400 hover:text-gray-700 text-xl px-2">›</button>
        </div>

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
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={ev => { ev.stopPropagation(); handleDeleteEvent(e.id); }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 이벤트 추가 폼 */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-4">새 일정 추가</h2>
            <EventForm
              initial={formInitial}
              onSubmit={handleAddEvent}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

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
