import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

export async function POST(req: NextRequest) {
  const { text, now }: { text: string; now: string } = await req.json();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `오늘 날짜/시간: ${now} (Asia/Seoul)
가족 구성원: 유찬, 유주, 엄마, 아빠

사용자가 말한 내용: "${text}"

위 발화를 분석해서 일정 정보를 JSON으로만 반환해줘. 다른 말 없이 JSON만.

{
  "member": "유찬|유주|엄마|아빠 중 하나 (언급 없으면 유찬)",
  "title": "일정 제목 (깔끔하게 정리)",
  "start_at": "ISO 8601 형식 (예: 2026-05-06T15:00:00+09:00)",
  "end_at": "종료 시각 ISO 8601 또는 null"
}

규칙:
- 날짜가 없으면 오늘로
- 시간이 없으면 오전 9시로
- "오후 n시" "저녁 n시" → 12 더함 (단 12시는 그대로)
- "n시 반" → n시 30분
- "내일" "모레" "다음주 화요일" 등 자연어 날짜 해석
- "n시간 동안" → end_at 계산
- timezone은 항상 +09:00`,
  });

  const raw = (response.text ?? '').trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: '파싱 실패' }, { status: 422 });
  }
}
