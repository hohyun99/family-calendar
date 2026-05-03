import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const fields = Object.keys(body)
    .filter(k => ['title', 'member', 'start_at', 'end_at', 'all_day', 'notify', 'notified'].includes(k))
    .map(k => `${k} = ?`).join(', ');

  if (!fields) return NextResponse.json({ error: 'no fields' }, { status: 400 });

  db.prepare(`UPDATE events SET ${fields} WHERE id = ?`).run(...Object.values(body), id);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return NextResponse.json(event);
}
