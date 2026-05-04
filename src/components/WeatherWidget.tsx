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

type Grade = { label: string; color: string; bar: string; face: string };

function pm10Grade(v: number): Grade {
  if (v <= 30)  return { label: '좋음',     color: 'text-blue-500',   bar: 'bg-blue-400',   face: '😊' };
  if (v <= 80)  return { label: '보통',     color: 'text-green-600',  bar: 'bg-green-400',  face: '🙂' };
  if (v <= 150) return { label: '나쁨',     color: 'text-orange-500', bar: 'bg-orange-400', face: '😷' };
  return               { label: '매우나쁨', color: 'text-red-500',    bar: 'bg-red-400',    face: '🤢' };
}

function pm25Grade(v: number): Grade {
  if (v <= 15)  return { label: '좋음',     color: 'text-blue-500',   bar: 'bg-blue-400',   face: '😊' };
  if (v <= 35)  return { label: '보통',     color: 'text-green-600',  bar: 'bg-green-400',  face: '🙂' };
  if (v <= 75)  return { label: '나쁨',     color: 'text-orange-500', bar: 'bg-orange-400', face: '😷' };
  return               { label: '매우나쁨', color: 'text-red-500',    bar: 'bg-red-400',    face: '🤢' };
}

function clothingAdvice(temp: number, minTemp: number): { icon: string; items: string[] } {
  const t = Math.min(temp, minTemp);
  if (t <= 4)  return { icon: '🧥', items: ['두꺼운 패딩', '목도리', '장갑', '귀마개'] };
  if (t <= 8)  return { icon: '🧣', items: ['코트', '두꺼운 니트', '목도리'] };
  if (t <= 11) return { icon: '🧶', items: ['자켓', '니트', '기모 바지'] };
  if (t <= 16) return { icon: '👕', items: ['가디건', '얇은 니트', '청바지'] };
  if (t <= 19) return { icon: '👔', items: ['얇은 긴팔', '가디건 (실내)'] };
  if (t <= 22) return { icon: '👗', items: ['긴팔 셔츠', '면바지'] };
  if (t <= 27) return { icon: '🩱', items: ['반팔', '얇은 소재'] };
  return               { icon: '🌞', items: ['반팔·민소매', '통기성 좋은 옷'] };
}

function umbrellaAdvice(maxPrecipProb: number, codes: number[]): { need: boolean; icon: string; text: string } {
  const hasSnow = codes.some(c => c >= 71 && c <= 77);
  if (maxPrecipProb >= 60)
    return { need: true,  icon: hasSnow ? '❄️' : '☂️', text: hasSnow ? '우산·방한 필수' : '우산 꼭 챙기세요' };
  if (maxPrecipProb >= 30)
    return { need: true,  icon: '🌂', text: '우산 챙기면 좋아요' };
  return { need: false, icon: '✅', text: '우산 불필요' };
}

function PmBar({ label, value, max, grade }: { label: string; value: number; max: number; grade: Grade }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-400 w-10 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${grade.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-lg leading-none">{grade.face}</span>
      <span className={`text-[11px] font-semibold w-12 shrink-0 ${grade.color}`}>
        {value}<span className="font-normal opacity-70"> {grade.label}</span>
      </span>
    </div>
  );
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
  const upcoming = slots.slice(nowIdx + 1, nowIdx + 7);
  const remaining = slots.slice(nowIdx); // 지금부터 자정까지

  const p10 = pm10Grade(current.pm10);
  const p25 = pm25Grade(current.pm25);

  const minTempToday = Math.min(...remaining.map(s => s.temp));
  const maxPrecipToday = Math.max(...remaining.map(s => s.precipProb));
  const clothing = clothingAdvice(current.temp, minTempToday);
  const umbrella = umbrellaAdvice(maxPrecipToday, remaining.map(s => s.code));

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

      {/* 옷차림 + 우산 */}
      <div className="flex gap-2">
        <div className="flex-1 bg-sky-50 rounded-xl px-3 py-2">
          <p className="text-[10px] text-sky-400 font-semibold mb-1">{clothing.icon} 오늘 옷차림</p>
          <p className="text-xs text-sky-700">{clothing.items.join(' · ')}</p>
        </div>
        <div className={`flex-1 rounded-xl px-3 py-2 ${umbrella.need ? 'bg-indigo-50' : 'bg-gray-50'}`}>
          <p className={`text-[10px] font-semibold mb-1 ${umbrella.need ? 'text-indigo-400' : 'text-gray-400'}`}>
            {umbrella.icon} 우산
          </p>
          <p className={`text-xs ${umbrella.need ? 'text-indigo-700' : 'text-gray-500'}`}>{umbrella.text}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">최대 강수 {maxPrecipToday}%</p>
        </div>
      </div>

      {/* 미세먼지 바 */}
      <div className="space-y-1.5 bg-gray-50 rounded-xl px-3 py-2">
        <PmBar label="PM10"  value={current.pm10} max={200} grade={p10} />
        <PmBar label="PM2.5" value={current.pm25} max={100} grade={p25} />
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
              <span className="text-base leading-none">{g.face}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
