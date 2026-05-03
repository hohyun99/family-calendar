import { NextResponse } from 'next/server';
import { getDb, Event } from '@/lib/db';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MEMBER_NAMES: Record<string, string> = {
  '유찬': '유찬아',
  '유주': '유주야',
  '엄마': '여보',
  '아빠': '자기야',
};

function buildMessage(event: Event): string {
  const call = MEMBER_NAMES[event.member] ?? `${event.member}아`;
  return `${call} ${event.title} 할 시간이에요! 10분 후 시작해요.`;
}

async function sendMacNotification(title: string, message: string) {
  const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `display notification "${safe(message)}" with title "${safe(title)}" sound name "Ping"`;
  await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

export async function POST() {
  const db = getDb();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 9 * 60 * 1000);   // 9분 후
  const windowEnd = new Date(now.getTime() + 11 * 60 * 1000);    // 11분 후

  const events = db.prepare(
    `SELECT * FROM events
     WHERE notify = 1 AND notified = 0 AND all_day = 0
       AND start_at >= ? AND start_at <= ?`
  ).all(windowStart.toISOString(), windowEnd.toISOString()) as Event[];

  const notified: number[] = [];

  for (const event of events) {
    const msg = buildMessage(event);
    try {
      await sendMacNotification(`📅 ${event.member} 일정 알림`, msg);
      db.prepare('UPDATE events SET notified = 1 WHERE id = ?').run(event.id);
      notified.push(event.id);
    } catch (e) {
      console.error('알림 실패:', e);
    }
  }

  return NextResponse.json({ checked: events.length, notified });
}

// GET: 알림 상태 확인용
export async function GET() {
  const db = getDb();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 9 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 11 * 60 * 1000);

  const events = db.prepare(
    `SELECT * FROM events
     WHERE notify = 1 AND notified = 0 AND all_day = 0
       AND start_at >= ? AND start_at <= ?`
  ).all(windowStart.toISOString(), windowEnd.toISOString()) as Event[];

  return NextResponse.json({ upcoming: events });
}
