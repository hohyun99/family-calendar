import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

interface HourlySlot {
  hour: number;
  temp: number;
  code: number;
  precipProb: number;
}

export async function POST(req: NextRequest) {
  const { slots }: { slots: HourlySlot[] } = await req.json();

  const summary = slots
    .map(s => `${s.hour}시: ${s.temp}°C, 강수확률 ${s.precipProb}%`)
    .join(' / ');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `오늘 수원 시간별 날씨: ${summary}

위 날씨를 보고 오늘 하루 외출 시 옷차림을 추천해줘.
응답 형식(JSON만, 다른 말 없이):
{"icon":"이모지 1개","items":["아이템1","아이템2"],"extra":"저녁 기온 주의사항(없으면 빈 문자열)"}

조건:
- items는 2~3개의 구체적인 옷 이름(한국어)
- extra는 아침과 저녁 기온 차가 7°C 이상이거나 저녁에 추워지는 경우만 작성
- extra는 짧게(15자 이내)`,
  });

  const raw = (response.text ?? '').trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  try {
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ icon: '👕', items: [raw], extra: '' });
  }
}
