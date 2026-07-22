import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface SupaDocument {
  id: string;
  name: string;
  file_name: string;
  mime_type: string;
  size: number;
  folder_id: string | null;
  b2_file_id: string;
  b2_bucket_id: string;
  created_at: string;
}

export interface SupaFolder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}
