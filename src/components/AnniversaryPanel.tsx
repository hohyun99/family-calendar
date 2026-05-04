'use client';

import { useState } from 'react';
import { Plus, Trash2, PartyPopper } from 'lucide-react';
import { Anniversary, addAnniversary, deleteAnniversary } from '@/lib/anniversaries';

const EMOJI_OPTIONS = ['🎂', '💑', '🎉', '💍', '🌸', '🏆', '🎁', '❤️', '⭐', '🌟'];

interface Props {
  list: Anniversary[];
  onChanged: () => void;
}

export default function AnniversaryPanel({ list, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [emoji, setEmoji] = useState('🎉');
  const [title, setTitle] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setAdding(false); setTitle(''); setMonth(''); setDay(''); setEmoji('🎉'); };

  const handleSave = async () => {
    if (!title.trim() || !month || !day) return;
    setSaving(true);
    try {
      await addAnniversary({ title: title.trim(), month: Number(month), day: Number(day), emoji });
      onChanged();
      reset();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 기념일을 삭제할까요?')) return;
    await deleteAnniversary(id);
    onChanged();
  };

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <PartyPopper size={15} className="text-purple-500" /> 기념일 관리
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs bg-purple-100 text-purple-600 hover:bg-purple-200 px-3 py-1 rounded-lg transition"
          >
            <Plus size={12} /> 추가
          </button>
        )}
      </div>

      {/* 추가 폼 */}
      {adding && (
        <div className="bg-purple-50 rounded-xl p-3 space-y-2">
          {/* 이모지 선택 */}
          <div className="flex gap-1.5 flex-wrap">
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-lg rounded-lg p-1 transition ${emoji === e ? 'bg-purple-200 ring-2 ring-purple-400' : 'hover:bg-purple-100'}`}
              >{e}</button>
            ))}
          </div>
          {/* 제목 */}
          <input
            type="text"
            placeholder="기념일 이름 (예: 결혼기념일)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
          {/* 날짜 */}
          <div className="flex gap-2">
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">월</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
            <select
              value={day}
              onChange={e => setDay(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">일</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}일</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !month || !day}
              className="flex-1 bg-purple-500 text-white text-sm rounded-lg py-2 hover:bg-purple-600 disabled:opacity-40 transition"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={reset}
              className="flex-1 bg-gray-100 text-gray-600 text-sm rounded-lg py-2 hover:bg-gray-200 transition"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 기념일 목록 */}
      {list.length === 0 && !adding ? (
        <p className="text-xs text-gray-400 text-center py-2">등록된 기념일이 없어요</p>
      ) : (
        <div className="space-y-1.5">
          {list.map(a => (
            <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <span className="text-lg">{a.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{a.title}</p>
                <p className="text-[11px] text-gray-400">{a.month}월 {a.day}일 · 매년</p>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition"
              ><Trash2 size={11} /> 삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
