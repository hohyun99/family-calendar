export interface EventPayload {
  title: string;
  member: string;
  start_at: string;
  end_at?: string;
  all_day: boolean;
  notify: boolean;
}

export type { CalendarEvent } from '@/lib/storage';
