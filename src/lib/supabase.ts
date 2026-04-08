import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined);
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : undefined);

  const isPlaceholder = (val?: string) => !val || val === 'YOUR_SUPABASE_URL' || val === 'YOUR_SUPABASE_ANON_KEY';

  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
};

export interface KnowledgeTag {
  id: string;
  category: string;
  tag_name: string;
  mastery_score: number;
}

export interface Bookmark {
  id: string;
  file_name: string;
  page_number: number;
  text_selection?: string;
  note?: string;
  created_at: string;
}
