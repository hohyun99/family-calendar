import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

interface HourlySlot {
  hour: number;
  temp: number;
  code: number;
  precipProb: number;
  pm10: number;
  pm25: number;
}

export async function POST(req: NextRequest) {
  const { slots }: { slots: HourlySlot[] } = await req.json();

  const summary = slots
    .map(s => `${s.hour}시: ${s.temp}°C 강수${s.precipProb}% PM10=${s.pm10} PM2.5=${s.pm25}`)
    .join(' / ');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `오늘 수원 시간별 날씨: ${summary}

이 데이터를 분석해서 아래 JSON만 반환해줘. 다른 말 없이 JSON만.

{
  "summary": "오늘 날씨 한 줄 요약 (20자 이내, 구어체)",
  "clothing": {
    "icon": "옷 관련 이모지 1개",
    "items": ["옷1", "옷2"],
    "extra": "기온차 7도 이상이거나 저녁에 추워지면 주의사항, 아니면 빈 문자열"
  },
  "umbrella": {
    "icon": "우산 관련 이모지 1개",
    "text": "우산 필요 여부 (10자 이내)"
  },
  "air": {
    "icon": "공기질 관련 이모지 1개",
    "text": "미세먼지 상태 한 마디 (15자 이내)"
  }
}`,
  });

  const raw = (response.text ?? '').trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({
      summary: '날씨 정보를 불러왔어요',
      clothing: { icon: '👕', items: ['편한 옷차림'], extra: '' },
      umbrella: { icon: '🌂', text: '확인 필요' },
      air: { icon: '🙂', text: '보통' },
    });
  }
}
