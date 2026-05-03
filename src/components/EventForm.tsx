'use client';

import { useState } from 'react';
import { EventPayload } from '@/types/event';

const MEMBERS = ['유찬', '유주', '엄마', '아빠'];

interface Props {
  initial?: Partial<EventPayload>;
  submitLabel?: string;
  onSubmit: (data: EventPayload) => Promise<void>;
  onCancel: () => void;
}

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string) {
  return new Date(local).toISOString();
}

export default function EventForm({ initial, submitLabel = '저장', onSubmit, onCancel }: Props) {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [member, setMember] = useState(initial?.member ?? '유찬');
  const [startAt, setStartAt] = useState(
    initial?.start_at ? toLocalDatetimeValue(initial.start_at) : toLocalDatetimeValue(now.toISOString())
  );
  const [endAt, setEndAt] = useState(initial?.end_at ? toLocalDatetimeValue(initial.end_at) : '');
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [notify, setNotify] = useState(initial?.notify ?? true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        title,
        member,
        start_at: localToIso(startAt),
        end_at: endAt ? localToIso(endAt) : null,
        all_day: allDay,
        notify,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
        <input
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="예: 수학학원, 병원 검진"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">누구</label>
        <div className="flex gap-2 flex-wrap">
          {MEMBERS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMember(m)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                member === m
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="allDay" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
        <label htmlFor="allDay" className="text-sm text-gray-700">하루 종일</label>
      </div>

      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">시작</label>
            <input
              type="datetime-local"
              required
              value={startAt}
              onChange={e => setStartAt(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">종료 (선택)</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={e => setEndAt(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>
      )}

      {allDay && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
          <input
            type="date"
            required
            value={startAt.slice(0, 10)}
            onChange={e => setStartAt(e.target.value + 'T00:00')}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="checkbox" id="notify" checked={notify} onChange={e => setNotify(e.target.checked)} />
        <label htmlFor="notify" className="text-sm text-gray-700">10분 전 알림</label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-indigo-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition"
        >
          {loading ? '저장 중...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-2 text-sm font-medium hover:bg-gray-200 transition"
        >
          취소
        </button>
      </div>
    </form>
  );
}
