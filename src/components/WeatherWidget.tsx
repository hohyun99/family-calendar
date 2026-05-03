'use client';

import { useEffect, useState } from 'react';

const LAT = 37.2636;
const LON = 127.0286;

interface HourlySlot {
  hour: number;       // 0-23
  temp: number;
  code: number;       // WMO weather code
  precipProb: number;
  pm10: number;
  pm25: number;
}

function weatherEmoji(code: number) {
  if (code === 0) return '☀️';
  if (code <= 2)  return '🌤️';
  if (code <= 3)  return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

function weatherLabel(code: number) {
  if (code === 0) return '맑음';
  if (code <= 2)  return '구름 조금';
  if (code <= 3)  return '흐림';
  if (code <= 48) return '안개';
  if (code <= 55) return '이슬비';
  if (code <= 67) return '비';
  if (code <= 77) return '눈';
  if (code <= 82) return '소나기';
  return '뇌우';
}

type Grade = { label: string; bg: string; text: string };

function pm10Grade(v: number): Grade {
  if (v <= 30)  return { label: '좋음',     bg: 'bg-blue-100',   text: 'text-blue-600' };
  if (v <= 80)  return { label: '보통',     bg: 'bg-green-100',  text: 'text-green-600' };
  if (v <= 150) return { label: '나쁨',     bg: 'bg-orange-100', text: 'text-orange-600' };
  return               { label: '매우나쁨', bg: 'bg-red-100',    text: 'text-red-600' };
}

function pm25Grade(v: number): Grade {
  if (v <= 15)  return { label: '좋음',     bg: 'bg-blue-100',   text: 'text-blue-600' };
  if (v <= 35)  return { label: '보통',     bg: 'bg-green-100',  text: 'text-green-600' };
  if (v <= 75)  return { label: '나쁨',     bg: 'bg-orange-100', text: 'text-orange-600' };
  return               { label: '매우나쁨', bg: 'bg-red-100',    text: 'text-red-600' };
}

export default function WeatherWidget() {
  const [slots, setSlots] = useState<HourlySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
  const upcoming = slots.slice(nowIdx + 1, nowIdx + 7); // 이후 6시간

  const p10 = pm10Grade(current.pm10);
  const p25 = pm25Grade(current.pm25);

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
        <div className="text-right space-y-1">
          <p className="text-xs text-gray-400 font-medium">수원 · 지금</p>
          <div className="flex gap-1.5 justify-end">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p10.bg} ${p10.text}`}>
              PM10 {current.pm10} <span className="opacity-70">{p10.label}</span>
            </span>
          </div>
          <div className="flex gap-1.5 justify-end">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p25.bg} ${p25.text}`}>
              PM2.5 {current.pm25} <span className="opacity-70">{p25.label}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 시간별 예보 */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {upcoming.map(s => {
          const g = pm10Grade(s.pm10);
          return (
            <div
              key={s.hour}
              className="flex flex-col items-center gap-1 min-w-[48px] bg-gray-50 rounded-xl py-2 px-1"
            >
              <p className="text-[10px] text-gray-400 font-medium">{s.hour}시</p>
              <span className="text-lg">{weatherEmoji(s.code)}</span>
              <p className="text-xs font-semibold text-gray-700">{s.temp}°</p>
              <p className="text-[9px] text-gray-400">{s.precipProb}%</p>
              <span className={`text-[9px] px-1 rounded font-medium ${g.bg} ${g.text}`}>
                {g.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
