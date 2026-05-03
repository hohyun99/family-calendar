'use client';

import { useState, useEffect } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, parseISO, isToday, addWeeks, subWeeks
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarEvent } from '@/types/event';
import { listEvents } from '@/lib/storage';

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

export default function WeeklyView() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const all = listEvents();
    const from = startOfWeek(weekStart, { weekStartsOn: 0 });
    const to = endOfWeek(weekStart, { weekStartsOn: 0 });
    setEvents(all.filter(e => {
      const d = parseISO(e.start_at);
      return d >= from && d <= to;
    }));
  }, [weekStart]);

  const days = eachDayOfInterval({
    start: startOfWeek(weekStart, { weekStartsOn: 0 }),
    end: endOfWeek(weekStart, { weekStartsOn: 0 }),
  });

  const from = days[0];
  const to = days[6];
  const rangeLabel =
    from.getMonth() === to.getMonth()
      ? `${format(from, 'M월 d일')} - ${format(to, 'd일')}`
      : `${format(from, 'M월 d일')} - ${format(to, 'M월 d일')}`;

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800">주간 일정</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="text-gray-400 hover:text-gray-700 px-1 text-lg"
          >‹</button>
          <span className="text-xs text-gray-500">{rangeLabel}</span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="text-gray-400 hover:text-gray-700 px-1 text-lg"
          >›</button>
        </div>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
          className="text-xs text-indigo-500 hover:text-indigo-700"
        >
          이번 주
        </button>
      </div>

      {/* 날짜별 목록 */}
      <div className="space-y-1">
        {days.map(day => {
          const dayEvents = events.filter(e => isSameDay(parseISO(e.start_at), day));
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={`rounded-xl px-3 py-2 ${today ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold w-16 shrink-0 ${today ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {format(day, 'E M/d', { locale: ko })}
                  {today && <span className="ml-1 text-[10px] bg-indigo-500 text-white rounded px-1">오늘</span>}
                </span>
                {dayEvents.length === 0 && (
                  <span className="text-xs text-gray-300">일정 없음</span>
                )}
              </div>
              {dayEvents.length > 0 && (
                <div className="ml-16 space-y-1">
                  {dayEvents.map(e => (
                    <div key={e.id} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${MEMBER_COLORS[e.member] ?? 'bg-gray-400'}`} />
                      <span className={`text-xs font-semibold shrink-0 ${MEMBER_TEXT[e.member] ?? 'text-gray-600'}`}>
                        {e.member}
                      </span>
                      <span className="text-xs text-gray-700 flex-1">{e.title}</span>
                      {!e.all_day && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {format(parseISO(e.start_at), 'a h:mm', { locale: ko })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
