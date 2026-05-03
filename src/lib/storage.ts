export interface CalendarEvent {
  id: number;
  title: string;
  member: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  notify: boolean;
  notified: boolean;
  created_at: string;
}

const KEY = 'family-calendar-events';

function load(): CalendarEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(events: CalendarEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(events));
}

export function listEvents(): CalendarEvent[] {
  return load().sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function addEvent(payload: Omit<CalendarEvent, 'id' | 'notified' | 'created_at'>): CalendarEvent {
  const events = load();
  const event: CalendarEvent = {
    ...payload,
    id: Date.now(),
    notified: false,
    created_at: new Date().toISOString(),
  };
  save([...events, event]);
  return event;
}

export function deleteEvent(id: number) {
  save(load().filter(e => e.id !== id));
}

export function markNotified(id: number) {
  save(load().map(e => e.id === id ? { ...e, notified: true } : e));
}

// 9~11분 후 시작하고 아직 알림 안 보낸 이벤트
export function getUpcomingEvents(): CalendarEvent[] {
  const now = Date.now();
  return load().filter(e => {
    if (!e.notify || e.notified || e.all_day) return false;
    const diff = new Date(e.start_at).getTime() - now;
    return diff >= 9 * 60 * 1000 && diff <= 11 * 60 * 1000;
  });
}
