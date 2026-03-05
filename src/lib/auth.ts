import { supabase } from "@/lib/supabase";

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error };
  return { user: data.user, error: null };
}

export async function signInWithEmail(email: string) {
  // Magic link sign-in (simple + works on multiple devices)
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/` },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}