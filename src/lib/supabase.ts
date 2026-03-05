import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // ✅ stays logged in
    autoRefreshToken: true,      // ✅ keeps session alive
    detectSessionInUrl: true,    // ✅ reads magic link URL on callback
  },
});