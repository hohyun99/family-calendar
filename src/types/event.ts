export interface EventPayload {
  title: string;
  member: string;
  start_at: string;
  end_at?: string;
  all_day: boolean;
  notify: boolean;
}

export interface CalendarEvent {
  id: number;
  title: string;
  member: string;
  start_at: string;
  end_at: string | null;
  all_day: number;
  notify: number;
  notified: number;
}
