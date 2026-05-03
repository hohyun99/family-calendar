import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { CalendarEvent } from '@/lib/db';

// Supabase 서버 클라이언트 (API route 전용)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const MEMBER_CALL: Record<string, string> = {
  유찬: '유찬아',
  유주: '유주야',
  엄마: '여보',
  아빠: '자기야',
};

// 외부 크론(cron-job.org 등)에서 1분마다 POST /api/notify 호출
export async function POST() {
  const now = new Date();
  const from = new Date(now.getTime() + 8  * 60 * 1000).toISOString();
  const to   = new Date(now.getTime() + 12 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('notify', true)
    .eq('notified', false)
    .eq('all_day', false)
    .gte('start_at', from)
    .lte('start_at', to);

  if (!events || events.length === 0) return NextResponse.json({ notified: 0 });

  const { data: subs } = await supabase.from('push_subscriptions').select('*');

  let notified = 0;
  for (const ev of events as CalendarEvent[]) {
    const call = MEMBER_CALL[ev.member] ?? `${ev.member}아`;
    const payload = JSON.stringify({
      title: `📅 ${ev.member} 일정 알림`,
      body:  `${call} ${ev.title} 할 시간이에요! 10분 후 시작해요.`,
      member: ev.member,
      eventTitle: ev.title,
    });

    // 모든 구독자에게 Web Push 전송
    for (const row of subs ?? []) {
      try {
        await webpush.sendNotification(row.subscription, payload);
      } catch {
        // 만료된 구독 삭제
        await supabase.from('push_subscriptions').delete().eq('id', row.id);
      }
    }

    await supabase.from('events').update({ notified: true }).eq('id', ev.id);
    notified++;
  }

  return NextResponse.json({ notified });
}
