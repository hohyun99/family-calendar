import { NextRequest, NextResponse } from 'next/server';
import { getDb, Event } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let events: Event[];
  if (from && to) {
    events = db.prepare(
      'SELECT * FROM events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
    ).all(from, to) as Event[];
  } else {
    events = db.prepare('SELECT * FROM events ORDER BY start_at').all() as Event[];
  }

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, member, start_at, end_at, all_day, notify } = body;

  if (!title || !member || !start_at) {
    return NextResponse.json({ error: '제목, 가족, 시작시간은 필수입니다.' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO events (title, member, start_at, end_at, all_day, notify) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, member, start_at, end_at ?? null, all_day ? 1 : 0, notify !== false ? 1 : 0);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid) as Event;
  return NextResponse.json(event, { status: 201 });
}
