'use client';

import { useEffect, useState } from 'react';

const LAT = 37.2636;
const LON = 127.0286;

interface HourlySlot {
  hour: number;
  temp: number;
  code: number;
  precipProb: number;
  pm10: number;
  pm25: number;
}

interface WeatherAdvice {
  summary: string;
  clothing: { icon: string; items: string[]; extra: string };
  umbrella: { icon: string; text: string };
  air: { icon: string; text: string };
}

function weatherEmoji(code: number) {
  if (code === 0)  return '☀️';
  if (code <= 2)   return '🌤️';
  if (code <= 3)   return '☁️';
  if (code <= 48)  return '🌫️';
  if (code <= 55)  return '🌦️';
  if (code <= 67)  return '🌧️';
  if (code <= 77)  return '🌨️';
  if (code <= 82)  return '🌦️';
  return '⛈️';
}

function weatherLabel(code: number) {
  if (code === 0)  return '맑음';
  if (code <= 2)   return '구름 조금';
  if (code <= 3)   return '흐림';
  if (code <= 48)  return '안개';
  if (code <= 55)  return '이슬비';
  if (code <= 67)  return '비';
  if (code <= 77)  return '눈';
  if (code <= 82)  return '소나기';
  return '뇌우';
}

export default function WeatherWidget() {
  const [slots, setSlots] = useState<HourlySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [advice, setAdvice] = useState<WeatherAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  useEffect(() => {
    async function fetch_() {
      try {
        const [wx, aq] = await Promise.all([
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
            `&hourly=temperature_2m,weathercode,precipitation_probability` +
            `&timezone=Asia%2FSeoul&forecast_days=1`
          ).then(r => r.json()),
          fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}` +
            `&hourly=pm10,pm2_5` +
            `&timezone=Asia%2FSeoul&forecast_days=1`
          ).then(r => r.json()),
        ]);

        const result: HourlySlot[] = wx.hourly.time.map((t: string, i: number) => ({
          hour: new Date(t).getHours(),
          temp: Math.round(wx.hourly.temperature_2m[i]),
          code: wx.hourly.weathercode[i],
          precipProb: wx.hourly.precipitation_probability[i] ?? 0,
          pm10: Math.round(aq.hourly.pm10[i] ?? 0),
          pm25: Math.round(aq.hourly.pm2_5[i] ?? 0),
        }));

        setSlots(result);

        setAdviceLoading(true);
        fetch('/api/clothing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slots: result }),
        })
          .then(r => r.json())
          .then((data: WeatherAdvice) => setAdvice(data))
          .catch(() => {})
          .finally(() => setAdviceLoading(false));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-2 text-sm text-gray-400 animate-pulse">
        <span>🌤️</span> 날씨 불러오는 중...
      </div>
    );
  }

  if (error || slots.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-4 text-sm text-gray-400">
        날씨 정보를 불러올 수 없어요.
      </div>
    );
  }

  const nowHour = new Date().getHours();
  const nowIdx = slots.findIndex(s => s.hour === nowHour);
  const current = slots[nowIdx] ?? slots[0];
  const upcoming = slots.slice(nowIdx + 1, nowIdx + 7);

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      {/* 현재 날씨 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{weatherEmoji(current.code)}</span>
          <div>
            <p className="text-2xl font-bold text-gray-800">{current.temp}°C</p>
            <p className="text-xs text-gray-500">{weatherLabel(current.code)} · 강수 {current.precipProb}%</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 font-medium">수원 · 지금</p>
      </div>

      {/* AI 요약 */}
      {adviceLoading ? (
        <p className="text-[11px] text-gray-300 animate-pulse">AI 분석 중...</p>
      ) : advice?.summary ? (
        <p className="text-[11px] text-gray-400">{advice.summary}</p>
      ) : null}

      {/* 옷차림 + 우산 */}
      <div className="flex gap-2">
        <div className="flex-1 bg-sky-50 rounded-xl px-3 py-2 min-h-[56px]">
          <p className="text-[10px] text-sky-400 font-semibold mb-1">
            {advice?.clothing.icon ?? '👕'} 오늘 옷차림
          </p>
          {adviceLoading ? (
            <p className="text-[10px] text-sky-300 animate-pulse">분석 중...</p>
          ) : advice?.clothing ? (
            <>
              <p className="text-xs text-sky-700">{advice.clothing.items.join(' · ')}</p>
              {advice.clothing.extra && (
                <p className="text-[10px] text-orange-400 mt-0.5">{advice.clothing.extra}</p>
              )}
            </>
          ) : null}
        </div>
        <div className="flex-1 bg-indigo-50 rounded-xl px-3 py-2 min-h-[56px]">
          <p className="text-[10px] text-indigo-400 font-semibold mb-1">
            {advice?.umbrella.icon ?? '🌂'} 우산
          </p>
          {adviceLoading ? (
            <p className="text-[10px] text-indigo-300 animate-pulse">분석 중...</p>
          ) : advice?.umbrella ? (
            <p className="text-xs text-indigo-700">{advice.umbrella.text}</p>
          ) : null}
        </div>
      </div>

      {/* 미세먼지 */}
      <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{advice?.air.icon ?? '💨'}</span>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold">미세먼지</p>
            {adviceLoading ? (
              <p className="text-[10px] text-gray-300 animate-pulse">분석 중...</p>
            ) : (
              <p className="text-xs text-gray-600">{advice?.air.text ?? ''}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400">PM10 <span className="font-semibold text-gray-600">{current.pm10}</span></p>
          <p className="text-[10px] text-gray-400">PM2.5 <span className="font-semibold text-gray-600">{current.pm25}</span></p>
        </div>
      </div>

      {/* 시간별 예보 */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {upcoming.map(s => (
          <div
            key={s.hour}
            className="flex flex-col items-center gap-1 min-w-[48px] bg-gray-50 rounded-xl py-2 px-1"
          >
            <p className="text-[10px] text-gray-400 font-medium">{s.hour}시</p>
            <span className="text-lg">{weatherEmoji(s.code)}</span>
            <p className="text-xs font-semibold text-gray-700">{s.temp}°</p>
            <p className="text-[9px] text-gray-400">{s.precipProb}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
