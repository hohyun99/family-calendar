import { supabase } from './supabase';

export interface CalendarEvent {
  id: string;
  title: string;
  member: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  notify: boolean;
  notified: boolean;
  created_at: string;
}

export type EventPayload = Omit<CalendarEvent, 'id' | 'notified' | 'created_at'>;

export async function listEvents(from?: string, to?: string): Promise<CalendarEvent[]> {
  let q = supabase.from('events').select('*').order('start_at');
  if (from) q = q.gte('start_at', from);
  if (to)   q = q.lte('start_at', to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function addEvent(payload: EventPayload): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...payload, notified: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEvent(
  id: string,
  payload: Partial<Omit<CalendarEvent, 'id' | 'created_at'>>
): Promise<CalendarEvent> {
  // 시간이 바뀌면 notified 초기화
  const { data: current } = await supabase
    .from('events').select('start_at').eq('id', id).single();

  const patch = { ...payload };
  if (current && payload.start_at && current.start_at !== payload.start_at) {
    patch.notified = false;
  }

  const { data, error } = await supabase
    .from('events').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function markNotified(id: string): Promise<void> {
  await supabase.from('events').update({ notified: true }).eq('id', id);
}

// 8~12분 후 이벤트 (서버사이드 알림 API에서도 사용)
export async function getUpcomingEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const from = new Date(now.getTime() + 8  * 60 * 1000).toISOString();
  const to   = new Date(now.getTime() + 12 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('notify', true)
    .eq('notified', false)
    .eq('all_day', false)
    .gte('start_at', from)
    .lte('start_at', to);
  if (error) throw error;
  return data ?? [];
}
