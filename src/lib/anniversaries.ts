import { supabase } from './supabase';

export interface Anniversary {
  id: string;
  title: string;
  month: number;
  day: number;
  emoji: string;
  created_at: string;
}

export async function listAnniversaries(): Promise<Anniversary[]> {
  const { data, error } = await supabase
    .from('anniversaries')
    .select('*')
    .order('month')
    .order('day');
  if (error) throw error;
  return data ?? [];
}

export async function addAnniversary(
  payload: Pick<Anniversary, 'title' | 'month' | 'day' | 'emoji'>
): Promise<Anniversary> {
  const { data, error } = await supabase
    .from('anniversaries')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAnniversary(id: string): Promise<void> {
  const { error } = await supabase.from('anniversaries').delete().eq('id', id);
  if (error) throw error;
}

export function anniversariesOnDay(list: Anniversary[], date: Date): Anniversary[] {
  return list.filter(
    a => a.month === date.getMonth() + 1 && a.day === date.getDate()
  );
}
